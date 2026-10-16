import { mkdir, writeFile } from "node:fs/promises";
import { cleanDocument } from "../src/lib/rag/clean";
import { chunkSections } from "../src/lib/rag/chunk-sections";
import { loadDumpPages, loadOutline } from "../src/lib/rag/dump";
import { REGIONS } from "../src/lib/rag/regions";
import { buildStructure } from "../src/lib/rag/structure";

// Offline Phase 2 check: clean -> structure -> chunk on the Phase 0 dump. No database, no Gemini.
const pages = await loadDumpPages();
const clean = cleanDocument(pages);
const s = buildStructure(clean.blocks, pages, await loadOutline(), clean.boxPages);
const chunks = chunkSections(s.nodes, clean.lexicon, clean.hyphens);
const chunkCount = new Map<number, number>();
for (const c of chunks) chunkCount.set(c.sectionId, (chunkCount.get(c.sectionId) ?? 0) + 1);

console.log("== Section tree (document order; boxes last) ==");
for (const n of s.nodes) {
  const pg = n.pdfPageEnd > n.pdfPageStart ? `${n.pdfPageStart}-${n.pdfPageEnd}` : `${n.pdfPageStart}`;
  const pr = n.printedStart ? ` (printed ${n.printedStart}${n.printedEnd && n.printedEnd !== n.printedStart ? `-${n.printedEnd}` : ""})` : "";
  console.log(`${"  ".repeat(n.level)}[${n.kind}] ${n.title}  PDF ${pg}${pr}  chunks=${chunkCount.get(n.id) ?? 0}${n.indexed ? "" : "  (not indexed)"}`);
}

console.log("\n== TOC ==");
const t = s.toc;
console.log(`parsed ${s.tocEntryCount} entries: ${t.entries.length} chapter/section entries (${t.entries.filter((e) => e.level === 0).length} chapter titles), ${t.front.length} front/back matter, ${t.lists.filter((l) => l.list === "Annexes").length} annexes, ${t.lists.filter((l) => l.list === "Boxes").length} boxes; figure/table list rows: ${t.lists.filter((l) => l.list === "Figures" || l.list === "Tables").length}`);
console.log(`not located: ${s.notFound.length ? s.notFound.join("; ") : "none"}`);
console.log(`figure/table captions from the TOC lists not found as captions: ${s.figureTableNotFound.length ? s.figureTableNotFound.join("; ") : "none"}`);

console.log("\n== Validator ==");
for (const w of s.warnings) console.log(`WARN  ${w}`);
for (const e of [...s.errors, ...clean.issues]) console.log(`ERROR ${e}`);
const failed = s.errors.length + clean.issues.length > 0;
console.log(failed ? "RESULT: FAILED" : "RESULT: OK (no errors)");

console.log("\n== Cleaning ==");
console.log("dropped items:", JSON.stringify(clean.drops, null, 1));
const h = clean.hyphens;
const joined = h.byRule[2] + h.byRule[5];
console.log(`line-end hyphens: ${h.lineEnd}; hyphen removed (word joined): ${joined} (rule 2: closed word seen elsewhere ${h.byRule[2]}, rule 5: unverified ${h.byRule[5]}); hyphen kept: ${h.lineEnd - joined} (rule 1 compound seen elsewhere ${h.byRule[1]}, rule 3 prefix ${h.byRule[3]}, rule 4 two words ${h.byRule[4]}, capital/digit/non-letter next ${h.keptSimple})`);
const amb = h.cases.filter((c) => c.rule >= 3);
console.log(`ambiguous (rules 3-5): ${amb.length}`);
for (const rule of [3, 4, 5]) console.log(`  rule ${rule}: ${amb.filter((c) => c.rule === rule).map((c) => `${c.text}${c.joined ? "->joined" : "->kept"}`).join(", ")}`);

console.log("\n== Chunks ==");
console.log(`total chunks: ${chunks.length} (Phase 1 had 582)`);
const byChapter = new Map<string, number>();
for (const c of chunks) byChapter.set(c.kind === "exec_summary" ? "Executive Summary" : `Chapter ${c.chapter}`, (byChapter.get(c.kind === "exec_summary" ? "Executive Summary" : `Chapter ${c.chapter}`) ?? 0) + 1);
console.log("per chapter:", [...byChapter].map(([k, v]) => `${k}=${v}`).join(", "));
console.log("per region:", REGIONS.map((r) => `${r.key}=${chunks.filter((c) => c.region === r.name).length}`).join(", "));
console.log("boxes:", ["Box 1.1", "Box 1.2", "Box 2.1", "Box 3.1"].map((b) => `${b}=${chunks.filter((c) => c.box === b).length}`).join(", "));
const lens = chunks.map((c) => c.content.length).sort((a, b) => a - b);
const q = (p: number) => lens[Math.min(lens.length - 1, Math.floor(p * lens.length))];
console.log(`chars: min ${lens[0]}, p10 ${q(0.1)}, median ${q(0.5)}, mean ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}, p90 ${q(0.9)}, max ${lens[lens.length - 1]}`);
console.log(`~tokens (chars/4): median ${Math.round(q(0.5) / 4)}, p90 ${Math.round(q(0.9) / 4)}, max ${Math.round(lens[lens.length - 1] / 4)}`);
console.log(`under 300 chars: ${lens.filter((l) => l < 300).length}; under 1000: ${lens.filter((l) => l < 1000).length}; over 2000: ${lens.filter((l) => l > 2000).length}`);
const tiny = chunks.filter((c) => c.content.length < 300);
for (const c of tiny.slice(0, 12)) console.log(`  tiny: ${c.headingPath} (PDF ${c.pdfPage}, ${c.content.length} chars): ${c.content.slice(0, 80)}`);

const sample = (label: string, pick: (c: (typeof chunks)[number]) => boolean) => {
  const c = chunks.find(pick);
  console.log(`\n--- sample: ${label} ---`);
  if (!c) return console.log("(none)");
  console.log(`heading_path: ${c.headingPath} | kind ${c.kind} | chapter ${c.chapter} | region ${c.region} | box ${c.box} | PDF ${c.pdfPage} | printed ${c.printedLabel} | part ${c.part}/${c.parts}`);
  console.log(c.content.length > 1500 ? `${c.content.slice(0, 1500)} [...]` : c.content);
};
sample("South Asia > Outlook", (c) => c.headingPath === "Chapter 2 > South Asia > Outlook");
sample("Box 1.1", (c) => c.box === "Box 1.1");
sample("Executive Summary", (c) => c.kind === "exec_summary");

await mkdir(".scratch/phase2", { recursive: true });
await writeFile(".scratch/phase2/sections.json", JSON.stringify(s.nodes.map(({ blocks, ...n }) => ({ ...n, blockCount: blocks.length, chunkCount: chunkCount.get(n.id) ?? 0 })), null, 2));
await writeFile(".scratch/phase2/chunks.json", JSON.stringify(chunks, null, 2));
console.log("\nWrote .scratch/phase2/sections.json and chunks.json");
process.exit(failed ? 1 : 0);
