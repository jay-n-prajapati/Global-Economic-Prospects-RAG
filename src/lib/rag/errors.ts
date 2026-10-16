// Maps provider errors to the UI's error codes. Pure (no SDK import).
import type { AskErrorCode } from "../ask-protocol";

export function classifyError(err: unknown): AskErrorCode {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? "");
  if (status === 429 || /quota exhausted|RESOURCE_EXHAUSTED/i.test(message)) return "quota";
  const name = (err as Error)?.name;
  if ((status !== undefined && status >= 500) || name === "AbortError" || name === "TimeoutError") return "unavailable";
  return "internal";
}

// Seconds the server asked us to wait: Gemini's `"retryDelay":"27s"`, or the "wait N min" text our retry helper writes.
export function retryAfterSecs(err: unknown): number | undefined {
  const message = String((err as Error)?.message ?? "");
  const s = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(message);
  if (s) return Math.ceil(Number(s[1]));
  const m = /wait (\d+) min/i.exec(message);
  return m ? Number(m[1]) * 60 : undefined;
}
