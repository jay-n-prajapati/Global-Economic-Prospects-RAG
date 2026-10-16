import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markdownRow, scoreQuestion, summarize, type GoldenItem, type Scorable } from "../src/lib/rag/eval-score";

// Offline unit test for eval scoring (fake retrieval results, no DB/API). Run: npm run test:eval
const golden = JSON.parse(readFileSync("evals/golden.json", "utf8")) as { items: GoldenItem[] };
const byId = (id: string) => golden.items.find((i) => i.id === id)!;
assert.equal(golden.items.length, 10);
for (const i of golden.items) for (const s of [...i.expected, ...i.forbidden]) assert.ok(s.pdfPages.length > 0, `${i.id}: spec without pdfPages`);

const SAR = "South Asia", EAP = "East Asia and Pacific";
const c = (o: Partial<Scorable>): Scorable => ({ pdfPage: 1, headingPath: "x", chapter: 2, region: null, box: null, kind: "subsection", ...o });
const sarOutlook = c({ region: SAR, headingPath: `Chapter 2 (Regional Outlooks) > ${SAR} > Outlook`, pdfPage: 96 });
const sarRecent = c({ region: SAR, headingPath: `Chapter 2 (Regional Outlooks) > ${SAR} > Recent developments`, pdfPage: 96 });
const eapOutlook = c({ region: EAP, headingPath: `Chapter 2 (Regional Outlooks) > ${EAP} > Outlook`, pdfPage: 81 });
const other = c({ chapter: 1, headingPath: "Chapter 1 (Global Outlook) > Global trade", pdfPage: 36 });

// Q1 happy path: expected chunk first.
let s = scoreQuestion(byId("q1"), [sarOutlook, other, eapOutlook]);
assert.deepEqual([s.hit, s.firstRank, s.mixAbove, s.forbiddenTop5], [true, 1, false, 1]); // EAP at rank 3 is in the top 5 but below the hit
// A South Asia question that retrieves an EAP chunk at rank 2 above the first South Asia Outlook chunk (rank 3): mix-up.
s = scoreQuestion(byId("q1"), [other, eapOutlook, sarOutlook]);
assert.deepEqual([s.hit, s.firstRank, s.mixAbove, s.forbiddenTop5, s.forbiddenRanks], [true, 3, true, 1, [2]]);
// Recent developments is the right region but not the Outlook section: no hit, no mix-up.
s = scoreQuestion(byId("q1"), [sarRecent, other]);
assert.deepEqual([s.hit, s.firstRank, s.mixAbove, s.forbiddenTop5], [false, null, false, 0]);
// Forbidden only, no expected chunk at all: mix-up.
s = scoreQuestion(byId("q1"), [eapOutlook]);
assert.deepEqual([s.hit, s.mixAbove], [false, true]);
// Rank beyond k is not seen.
s = scoreQuestion(byId("q1"), [...Array(10).fill(other), sarOutlook]);
assert.equal(s.hit, false);

// Phase 1 chunks have no structure (headingPath null) and are matched on PDF pages.
const p1 = (pdfPage: number): Scorable => ({ pdfPage, headingPath: null, chapter: null, region: null, box: null, kind: null });
s = scoreQuestion(byId("q1"), [p1(75), p1(82)]); // an unrelated page, then an EAP page
assert.deepEqual([s.hit, s.mixAbove], [false, true]);
s = scoreQuestion(byId("q1"), [p1(97), p1(82)]);
assert.deepEqual([s.hit, s.firstRank, s.mixAbove], [true, 1, false]);
// Q5 Pakistan: South Asia section is the trap, MNA pages are expected.
s = scoreQuestion(byId("q5"), [p1(97), p1(93)]);
assert.deepEqual([s.hit, s.firstRank, s.mixAbove], [true, 2, true]);

// Q8: exec summary must beat the near-duplicate Chapter 1 Summary.
const exec = c({ chapter: null, kind: "exec_summary", headingPath: "Executive Summary", pdfPage: 19 });
const ch1Summary = c({ chapter: 1, kind: "section", headingPath: "Chapter 1 (Global Outlook) > Summary", pdfPage: 26 });
assert.equal(scoreQuestion(byId("q8"), [exec, ch1Summary]).mixAbove, false);
assert.equal(scoreQuestion(byId("q8"), [ch1Summary, exec]).mixAbove, true);

// Q9: the box chunk is expected; Chapter 1 body text (not a box) is forbidden.
const box = c({ chapter: 1, kind: "box", box: "Box 1.1", headingPath: "Chapter 1 (Global Outlook) > Box 1.1: How much will AI affect global growth?", pdfPage: 30 });
const ch1Body = c({ chapter: 1, kind: "section", headingPath: "Chapter 1 (Global Outlook) > Global context", pdfPage: 36 });
assert.deepEqual([scoreQuestion(byId("q9"), [box, ch1Body]).firstRank, scoreQuestion(byId("q9"), [box, ch1Body]).mixAbove], [1, false]);
assert.equal(scoreQuestion(byId("q9"), [ch1Body, box]).mixAbove, true);

// Q6 / Q7 chapter confusion.
const ch3 = c({ chapter: 3, headingPath: "Chapter 3 (Sovereign Debt) > Introduction", pdfPage: 109 });
const ch4 = c({ chapter: 4, headingPath: "Chapter 4 (Fiscal Policy) > Introduction", pdfPage: 145 });
assert.equal(scoreQuestion(byId("q7"), [ch3, ch4]).mixAbove, true);
assert.equal(scoreQuestion(byId("q6"), [ch3, ch4]).mixAbove, false);

// Q10 refusal: retrieval is not scored, only flagged.
s = scoreQuestion(byId("q10"), [ch3]);
assert.deepEqual([s.refusal, s.hit, s.mixAbove], [true, null, null]);
assert.equal(byId("q10").expectRefusal, true);

// Summary: MRR over the 9 answerable questions only.
const sum = summarize([
  scoreQuestion(byId("q1"), [sarOutlook]), // rank 1
  scoreQuestion(byId("q2"), [other, eapOutlook]), // rank 2
  scoreQuestion(byId("q3"), [other]), // miss
  scoreQuestion(byId("q10"), [other]), // ignored
]);
assert.deepEqual([sum.n, sum.hits], [3, 2]);
assert.ok(Math.abs(sum.mrr - (1 + 0.5 + 0) / 3) < 1e-9);
assert.match(markdownRow("r", "2026-10-17", "structured, filters on", sum), /^\| r \| 2026-10-17 \| structured, filters on \| 2\/3 \| 0\.500 \|/);

console.log("test-eval: all assertions passed");
