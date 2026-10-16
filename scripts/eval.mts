import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
import { client, db } from "../src/lib/db";
import { documents } from "../src/lib/db/schema";
import { isRefusal, answerQuestion } from "../src/lib/rag/answer";
import { RETRIEVE_K, SEND_K, STRUCTURED_DOCUMENT_NAME } from "../src/lib/rag/config";
import { embedTexts } from "../src/lib/rag/embed";
import { markdownRow, scoreQuestion, summarize, type GoldenItem, type QuestionScore } from "../src/lib/rag/eval-score";
import { routeAndRetrieve, type RetrievedChunk } from "../src/lib/rag/retrieve";

// Retrieval eval (D-14): hit@10, MRR and mix-up detection per question, filters on/off, any documents row.
// Usage: npm run eval -- [--doc <name|id>] [--filters on|off|both] [--full Q1,Q5,Q8,Q10] [--json [path]]
// Retrieval-only (the default) spends embedding quota only (one query embedding per question, shared by both modes).
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "";
};
const docArg = flag("--doc") || STRUCTURED_DOCUMENT_NAME;
const filtersArg = flag("--filters") ?? "both";
if (!["on", "off", "both"].includes(filtersArg)) throw new Error('--filters must be "on", "off" or "both"');
const fullIds = new Set((flag("--full") ?? "").toLowerCase().split(",").filter(Boolean));
const jsonPath = flag("--json") === undefined ? null : flag("--json") || ".scratch/eval-latest.json";

const golden = JSON.parse(await readFile("evals/golden.json", "utf8")) as { items: GoldenItem[] };

const [doc] = await db.select().from(documents).where(/^\d+$/.test(docArg) ? eq(documents.id, +docArg) : eq(documents.name, docArg));
if (!doc) throw new Error(`No documents row "${docArg}"`);
// Phase 1 chunks have no region/chapter columns, so filters cannot apply: run that document unfiltered only.
const structured = (doc.config as { structureVersion?: number }).structureVersion !== 0;
const modes: boolean[] = !structured ? [false] : filtersArg === "on" ? [true] : filtersArg === "off" ? [false] : [true, false];
console.log(`Document ${doc.id}: ${doc.name} (${structured ? "structured" : "Phase 1, scored by PDF page ranges, filters skipped"})`);

const embedCache = new Map<string, number[]>();
const embedQuery = async (q: string) => {
  if (!embedCache.has(q)) embedCache.set(q, (await embedTexts([q], "RETRIEVAL_QUERY"))[0]);
  return embedCache.get(q)!;
};

type Row = QuestionScore & { mode: string; filters: object; fellBack: boolean; top: string[]; answer?: string; refusalOk?: boolean };
const label = (c: RetrievedChunk) => (c.headingPath ? `${c.headingPath} (p${c.printedPage ?? "-"})` : `pdf ${c.pdfPage}`);
const rows: Row[] = [];
for (const item of golden.items) {
  for (const useFilters of modes) {
    const r = await routeAndRetrieve(item.question, { documentId: doc.id, k: RETRIEVE_K, useFilters }, { embedQuery });
    const row: Row = {
      ...scoreQuestion(item, r.chunks, RETRIEVE_K), mode: useFilters ? "on" : "off", filters: r.filtersApplied ?? {},
      fellBack: r.fellBack ?? false, top: r.chunks.slice(0, 5).map(label),
    };
    if (fullIds.has(item.id) && (useFilters === modes[0])) {
      // Full mode: one chat call per question (the free tier allows ~20/day), same prompt as the web app (Phase 4).
      row.answer = await answerQuestion(item.question, r.chunks.slice(0, SEND_K));
      if (item.expectRefusal) row.refusalOk = isRefusal(row.answer);
    }
    rows.push(row);
  }
}

const mark = (v: boolean | null) => (v === null ? "-" : v ? "yes" : "NO");
console.log(`\n${"id".padEnd(4)} ${"filt".padEnd(4)} ${"hit".padEnd(4)} ${"rank".padEnd(4)} ${"mix>".padEnd(4)} ${"f@5".padEnd(3)} ${"fallback".padEnd(8)} applied-filters / top-3`);
for (const r of rows) {
  console.log(
    `${r.id.padEnd(4)} ${r.mode.padEnd(4)} ${mark(r.hit).padEnd(4)} ${String(r.firstRank ?? "-").padEnd(4)} ${mark(r.mixAbove === null ? null : !r.mixAbove).replace("yes", "ok").replace("NO", "MIX").padEnd(4)} ${String(r.forbiddenTop5 ?? "-").padEnd(3)} ${(r.fellBack ? "yes" : "").padEnd(8)} ${JSON.stringify(r.filters)}`,
  );
  console.log(`       ${r.top.slice(0, 3).join(" | ")}`);
}

const date = new Date().toISOString().slice(0, 10);
console.log("\nSummary (answerable questions only; Q10 is answer-level)");
const md: string[] = [];
for (const useFilters of modes) {
  const mode = useFilters ? "on" : "off";
  const s = summarize(rows.filter((r) => r.mode === mode));
  console.log(`  filters ${mode.padEnd(3)}: hit@${RETRIEVE_K} ${s.hits}/${s.n}  MRR ${s.mrr.toFixed(3)}  mix-ups: ${s.mixAbove} (forbidden above first expected), ${s.top5Forbidden} (forbidden in top 5)`);
  md.push(markdownRow(`${structured ? "structured" : "phase1"}`, date, `${doc.name}; filters ${mode}; top ${RETRIEVE_K}`, s));
}
for (const r of rows.filter((x) => x.answer !== undefined))
  console.log(`\n[full ${r.id}, filters ${r.mode}] ${r.answer}${r.refusalOk === undefined ? "" : `\n  refusal check: ${r.refusalOk ? "PASS" : "FAIL"}`}`);
console.log("\nAppend to the Eval scores table in specs/progress.md:\n" + md.join("\n"));

if (jsonPath) {
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify({ ranAt: new Date().toISOString(), document: doc.name, rows }, null, 2));
  console.log(`Saved ${jsonPath}`);
}
await client.end();
