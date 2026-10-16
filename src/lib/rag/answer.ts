import { CHAT_MODEL, SEND_K } from "./config";
import { ai, withRetry, type RetryOptions } from "./embed";
import { buildPrompt, type PromptChunk } from "./prompt";

export { buildPrompt, isRefusal, REFUSAL } from "./prompt";

// A web request must not hang for minutes on a quota wait: a few tries, short server waits only.
export const WEB_RETRY: RetryOptions = { maxAttempts: 3, maxServerWaitMs: 15_000 };

function request(question: string, chunks: readonly PromptChunk[]) {
  const { system, contents } = buildPrompt(question, chunks, SEND_K);
  return { model: CHAT_MODEL, contents, config: { systemInstruction: system, temperature: 0 } };
}

// Streams the answer text. Pass retrieval results in rank order; only the first SEND_K reach the model.
// withRetry covers opening the stream; the request is only sent once the generator is iterated.
export async function* streamAnswer(
  question: string,
  chunks: readonly PromptChunk[],
  retry: RetryOptions = WEB_RETRY,
): AsyncGenerator<string, void> {
  const stream = await withRetry(() => ai.models.generateContentStream(request(question, chunks)), retry);
  for await (const part of stream) {
    const text = part.text;
    if (text) yield text;
  }
}

// One-shot version for the eval harness (same prompt, model and temperature).
export async function answerQuestion(question: string, chunks: readonly PromptChunk[], retry?: RetryOptions): Promise<string> {
  const res = await withRetry(() => ai.models.generateContent(request(question, chunks)), retry);
  return (res.text ?? "").trim();
}
