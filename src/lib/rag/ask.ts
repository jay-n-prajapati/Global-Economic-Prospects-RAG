import { cosineDistance, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { chunks } from "../db/schema";
import { CHAT_MODEL, RETRIEVE_K } from "./config";
import { ai, embedTexts, withRetry } from "./embed";

export type Hit = { id: number; pdfPage: number; printedPage: number | null; content: string; score: number };

export const REFUSAL = "Not found in the report.";

const SYSTEM_PROMPT = `You answer questions about one report (World Bank Global Economic Prospects, June 2026) using ONLY the excerpts provided.
- Use no outside knowledge and add nothing that is not in the excerpts.
- Cite every claim with the page, like [p. 74] using the printed page (the PDF page is also shown; if there is no printed page cite [PDF p. N]).
- If the excerpts do not contain the answer, reply exactly: ${REFUSAL}`;

export async function retrieve(question: string, k = RETRIEVE_K): Promise<Hit[]> {
  const [queryVector] = await embedTexts([question], "RETRIEVAL_QUERY");
  const score = sql<number>`1 - (${cosineDistance(chunks.embedding, queryVector)})`;
  return db
    .select({ id: chunks.id, pdfPage: chunks.pdfPage, printedPage: chunks.printedPage, content: chunks.content, score })
    .from(chunks)
    .orderBy(desc(score))
    .limit(k);
}

export async function generate(question: string, hits: Hit[]): Promise<string> {
  const excerpts = hits
    .map((h) => `[${h.printedPage !== null ? `p. ${h.printedPage}` : "front matter"}, PDF p. ${h.pdfPage}]\n${h.content}`)
    .join("\n\n");
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: `Excerpts:\n${excerpts}\n\nQuestion: ${question}`,
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0 },
    }),
  );
  return (res.text ?? "").trim();
}
