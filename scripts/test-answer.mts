// Offline unit tests for the prompt builder (D-13). No Gemini call, no database, no env needed.
import { buildPrompt, isRefusal, labelChunk, REFUSAL, SYSTEM_PROMPT, type PromptChunk } from "../src/lib/rag/prompt";
import { SEND_K } from "../src/lib/rag/config";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? `\n       ${detail}` : ""}`);
};

const mk = (headingPath: string | null, printedPage: number | null, pdfPage: number, content: string): PromptChunk => ({
  headingPath, printedPage, pdfPage, content,
});
const SAR = "Chapter 2 (Regional Outlooks) > South Asia > Outlook";
const EAP = "Chapter 2 (Regional Outlooks) > East Asia and Pacific > Outlook";
const chunks = [
  mk(SAR, 74, 96, "Growth in South Asia is expected to soften to 6.3 percent in 2026."),
  mk(EAP, 59, 81, "Growth in East Asia and Pacific is expected to moderate to 4.2 percent in 2026."),
  mk("Chapter 3 (Sovereign Debt) > Overview", 85, 107, "Debt is rising."),
  mk("Executive Summary", null, 19, "Risks are tilted to the downside."),
  mk("Chapter 4 (Fiscal Policy) > Box 4.1: Rules", 130, 152, "Fiscal rules help."),
  mk("Chapter 1 (Global Outlook) > Risks", 30, 52, "SIXTH CHUNK must not be sent."),
  mk(null, 5, 27, "SEVENTH CHUNK must not be sent."),
];
const q = "What is the growth outlook for South Asia in this report?";
const { system, contents, used } = buildPrompt(q, chunks, SEND_K);

check("label format matches the spec example", labelChunk(chunks[0], 1) === `[1] ${SAR} (printed p. 74, PDF p. 96)`, labelChunk(chunks[0], 1));
check("front matter label has no printed page", labelChunk(chunks[3], 4) === "[4] Executive Summary (front matter, PDF p. 19)", labelChunk(chunks[3], 4));
check("unlabeled (fixed-size) chunk still gets a label", labelChunk(chunks[6], 7).startsWith("[7] Unlabeled passage (printed p. 5, PDF p. 27)"));
check(`only SEND_K (${SEND_K}) chunks are sent`, used.length === SEND_K && !contents.includes("SIXTH") && !contents.includes("SEVENTH"));
check("sent chunks are the top-ranked ones, in order", used.every((c, i) => c === chunks[i]));
check("all five labels present with both page numbers", [1, 2, 3, 4, 5].every((n) => contents.includes(`[${n}] `)) && contents.includes("printed p. 59, PDF p. 81"));
check("each text sits under its own label (regions not mixed)", (() => {
  const blocks = contents.split("\n\n---\n\n");
  return blocks[0].includes(SAR) && blocks[0].includes("6.3 percent") && !blocks[0].includes("4.2 percent") &&
    blocks[1].includes(EAP) && blocks[1].includes("4.2 percent") && !blocks[1].includes("6.3 percent");
})());
check("question is included", contents.endsWith(`Question: ${q}`));
check("exact refusal text is the shared constant", REFUSAL === "Not found in the report.");
check("system prompt carries the refusal instruction", system === SYSTEM_PROMPT && system.includes(`reply with exactly: ${REFUSAL}`));
check("system prompt forbids outside knowledge and mixing regions/chapters",
  /no outside knowledge/i.test(system) && /different regions or different chapters/i.test(system));
check("system prompt demands bracket-number citations", /square brackets/.test(system) && /\[2\]\[3\]/.test(system));
check("fewer chunks than SEND_K is fine", buildPrompt(q, chunks.slice(0, 2), SEND_K).used.length === 2);
check("zero chunks does not throw", buildPrompt(q, [], SEND_K).used.length === 0);
check("isRefusal accepts the exact text and trivial variants", isRefusal(REFUSAL) && isRefusal(" not found in the report ") && isRefusal("Not found in the report"));
check("isRefusal rejects real answers", !isRefusal("Growth is 6.3 percent [1].") && !isRefusal(`${REFUSAL} Also growth is 6.3 percent.`));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
