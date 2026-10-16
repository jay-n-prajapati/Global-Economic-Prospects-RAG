// Prompt building (D-13), kept pure and free of server imports so it can be unit-tested offline
// (`npm run test:answer`) and so the refusal text can be shared with the browser and the eval harness.

export const REFUSAL = "Not found in the report.";

// The fields of a retrieved chunk the prompt needs (RetrievedChunk from retrieve.ts satisfies this).
export type PromptChunk = {
  content: string;
  headingPath: string | null;
  pdfPage: number;
  printedPage: number | null;
};

export const SYSTEM_PROMPT = `You answer questions about one report (World Bank Global Economic Prospects, June 2026) using ONLY the numbered excerpts provided.

Rules:
- Use no outside knowledge. Add nothing that is not stated in the excerpts.
- Every excerpt starts with a label: [n] followed by its chapter > section path and its page numbers. The label tells you which chapter, region and section the text comes from. Never combine facts from excerpts that belong to different regions or different chapters into one statement. If the question names a region or a chapter, use only excerpts from that region or chapter, and name it in your answer.
- Cite every claim with the number(s) of the excerpt(s) it comes from in square brackets, right after the claim, like [1] or [2][3]. Cite only numbers that appear in the excerpts. Do not write page numbers or section names as citations yourself.
- Quote figures exactly as the excerpts give them, with their units, years and region.
- If the excerpts do not contain the answer, reply with exactly: ${REFUSAL}
  Write nothing else in that case. If they answer only part of the question, answer that part and say plainly which part is not covered (table values are not included in the excerpts).
- Be concise: a short paragraph or a few "- " bullets. No other markdown.`;

export function labelChunk(chunk: PromptChunk, n: number): string {
  const where = chunk.printedPage !== null ? `printed p. ${chunk.printedPage}, PDF p. ${chunk.pdfPage}` : `front matter, PDF p. ${chunk.pdfPage}`;
  return `[${n}] ${chunk.headingPath?.trim() || "Unlabeled passage"} (${where})`;
}

// Only the first `sendK` chunks are shown to the model (D-16); `n` in the citation is the 1-based position.
export function buildPrompt<T extends PromptChunk>(
  question: string,
  chunks: readonly T[],
  sendK: number,
): { system: string; contents: string; used: T[] } {
  const used = chunks.slice(0, sendK);
  const context = used.map((c, i) => `${labelChunk(c, i + 1)}\n${c.content.trim()}`).join("\n\n---\n\n");
  return { system: SYSTEM_PROMPT, contents: `Excerpts:\n\n${context}\n\nQuestion: ${question}`, used };
}

export function isRefusal(answer: string): boolean {
  return answer.trim().replace(/[.\s]+$/, "").toLowerCase() === REFUSAL.replace(/\.$/, "").toLowerCase();
}
