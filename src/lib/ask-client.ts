import type { AskEvent, Pipeline } from "./ask-protocol";

const NETWORK_ERROR: AskEvent = {
  type: "error",
  code: "unavailable",
  message: "Couldn't reach the server. Check your connection and try again.",
};

export type AskOptions = { useFilters: boolean; pipeline: Pipeline };

// Reads NDJSON lines from a byte stream and reports each parsed event. Lines may be split across chunks.
// Throws if the stream breaks or a line is not JSON; the caller decides how to surface that.
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: AskEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

// Posts the question and reports each NDJSON event (see ask-protocol.ts). Resolves when the stream ends;
// an aborted request resolves silently without emitting anything.
export async function streamAsk(
  question: string,
  options: AskOptions,
  signal: AbortSignal,
  onEvent: (event: AskEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, ...options }),
      signal,
    });
  } catch {
    if (!signal.aborted) onEvent(NETWORK_ERROR);
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    onEvent({
      type: "error",
      code: body?.error?.code ?? "internal",
      message: body?.error?.message ?? "Something went wrong. Try again.",
      retryAfterSecs: body?.error?.retryAfterSecs,
    });
    return;
  }

  try {
    await readEvents(res.body, onEvent);
  } catch {
    if (!signal.aborted) {
      onEvent({ type: "error", code: "unavailable", message: "The connection dropped mid-answer. Try again." });
    }
  }
}
