import { z } from "zod";
import { MAX_QUESTION_LENGTH, type AskErrorCode, type AskEvent, type AskMeta } from "@/lib/ask-protocol";
import { FIXED_DOCUMENT_NAME, RETRIEVE_K, SEND_K, STRUCTURED_DOCUMENT_NAME } from "@/lib/rag/config";
import { classifyError, retryAfterSecs } from "@/lib/rag/errors";

// Wire format is documented in src/lib/ask-protocol.ts.
export const runtime = "nodejs";

const Body = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  useFilters: z.boolean().default(true),
  pipeline: z.enum(["structured", "fixed"]).default("structured"),
});

const MESSAGES: Record<AskErrorCode, string> = {
  invalid: `Ask a question of 1 to ${MAX_QUESTION_LENGTH} characters.`,
  quota: "The Gemini free-tier quota is used up for now.",
  unavailable: "The model is busy right now. Try again in a moment.",
  not_ready: "That index has not been built yet. Run the ingest script for it first.",
  internal: "Something went wrong on our side. Try again.",
};

const STATUS: Record<AskErrorCode, number> = { invalid: 400, quota: 429, unavailable: 503, not_ready: 503, internal: 500 };

function jsonError(code: AskErrorCode, err?: unknown) {
  const retry = code === "quota" ? retryAfterSecs(err) : undefined;
  return Response.json(
    { error: { code, message: MESSAGES[code], ...(retry ? { retryAfterSecs: retry } : {}) } },
    { status: STATUS[code], headers: retry ? { "retry-after": String(retry) } : undefined },
  );
}

function reportError(err: unknown, code: AskErrorCode) {
  // Short and without the stack: enough to debug, nothing worth leaking.
  console.error(`[ask] ${code}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid");
  const { question, pipeline } = parsed.data;
  // Fixed-size chunks carry no region/chapter columns, so filters cannot apply to them.
  const useFilters = pipeline === "structured" && parsed.data.useFilters;

  // Loaded lazily so `next build` never evaluates env validation or opens the DB client.
  const [{ findDocumentId, routeAndRetrieve }, { streamAnswer }] = await Promise.all([
    import("@/lib/rag/retrieve"),
    import("@/lib/rag/answer"),
  ]);

  let retrieved;
  try {
    const documentId = await findDocumentId(pipeline === "fixed" ? FIXED_DOCUMENT_NAME : STRUCTURED_DOCUMENT_NAME);
    if (documentId === null) return jsonError("not_ready");
    retrieved = await routeAndRetrieve(question, { documentId, k: RETRIEVE_K, useFilters });
  } catch (err) {
    const code = classifyError(err);
    reportError(err, code);
    return jsonError(code, err);
  }

  const filters = retrieved.filters ?? {};
  const meta: AskMeta = {
    pipeline,
    useFilters,
    filters,
    // retrieve.ts reports what the chunks were actually filtered by ({} when none or after a fallback).
    filtersApplied: Object.keys(retrieved.filtersApplied ?? filters).length > 0,
    fellBack: retrieved.fellBack ?? false,
    sendK: SEND_K,
  };

  const encoder = new TextEncoder();
  const iterator = streamAnswer(question, retrieved.chunks)[Symbol.asyncIterator]();
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({
          type: "sources",
          meta,
          sources: retrieved.chunks.map((c, i) => ({
            id: c.id,
            rank: i + 1,
            score: c.score,
            content: c.content,
            headingPath: c.headingPath,
            chapter: c.chapter,
            region: c.region,
            box: c.box,
            kind: c.kind,
            printedPage: c.printedPage,
            pdfPage: c.pdfPage,
          })),
        });
        while (!cancelled) {
          const { value, done } = await iterator.next();
          if (done) break;
          send({ type: "text", text: value });
        }
        if (!cancelled) send({ type: "done" });
      } catch (err) {
        const code = classifyError(err);
        reportError(err, code);
        const retry = code === "quota" ? retryAfterSecs(err) : undefined;
        if (!cancelled) send({ type: "error", code, message: MESSAGES[code], ...(retry ? { retryAfterSecs: retry } : {}) });
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
      void iterator.return?.();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
