import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cleanDocument } from "../src/lib/rag/clean";
import { chunkSections } from "../src/lib/rag/chunk-sections";
import {
  EMBED_BATCH_SIZE, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, PDF_PATH, PHASE2_CHUNK_VERSION,
  PHASE2_CLEAN_VERSION, PHASE2_STRUCTURE_VERSION, SECTION_CHUNK_OVERLAP_CHARS, SECTION_CHUNK_PIECE_CHARS,
  STRUCTURED_DOCUMENT_NAME, STRUCTURED_PIPELINE,
} from "../src/lib/rag/config";
import { loadDumpPages, loadOutline } from "../src/lib/rag/dump";
import { buildStructure } from "../src/lib/rag/structure";

// Phase 2 ingest (D-26): clean -> structure -> section chunks -> embed (heading path + text, D-08) -> store under a
// SECOND documents row. Never touches the Phase 1 row. Resumable like Phase 1 (D-18). `--dry-run` uses no API and no DB.
const dryRun = process.argv.includes("--dry-run");
const MAX_CHUNKS = 290; // embedding budget; raise deliberately if the chunker changes

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const stable = (o: object) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const pages = await loadDumpPages();
const clean = cleanDocument(pages);
const s = buildStructure(clean.blocks, pages, await loadOutline(), clean.boxPages);
const problems = [...s.errors, ...clean.issues];
if (problems.length) {
  for (const e of problems) console.error(`ERROR ${e}`);
  throw new Error("Structure/clean validation failed; fix before embedding (see npm run inspect:structure)");
}
const sections = chunkSections(s.nodes, clean.lexicon, clean.hyphens);
if (sections.length > MAX_CHUNKS) throw new Error(`${sections.length} chunks exceeds the embedding budget of ${MAX_CHUNKS}`);

// content_hash = hash of the text that is embedded, so a changed heading path re-embeds (schema comment, D-18).
const pieces = sections.map((c) => ({
  pdfPage: c.pdfPage,
  printedPage: c.printedPage,
  chunkIndex: c.index,
  content: c.content,
  embedText: c.embedText,
  contentHash: sha(c.embedText),
  headingPath: c.headingPath,
  chapter: c.chapter === null ? null : String(c.chapter),
  region: c.region,
  box: c.box,
  kind: c.kind,
}));

const config = {
  pipeline: STRUCTURED_PIPELINE, cleanVersion: PHASE2_CLEAN_VERSION, structureVersion: PHASE2_STRUCTURE_VERSION,
  chunkVersion: PHASE2_CHUNK_VERSION, chunkPieceChars: SECTION_CHUNK_PIECE_CHARS, chunkOverlapChars: SECTION_CHUNK_OVERLAP_CHARS,
  embeddingModel: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, chunkCount: pieces.length,
};
const batches = Math.ceil(pieces.length / EMBED_BATCH_SIZE);
console.log(`${pieces.length} chunks (budget ${MAX_CHUNKS}) in ${batches} embed requests of up to ${EMBED_BATCH_SIZE} texts`);

if (dryRun) {
  const count = (f: (p: (typeof pieces)[number]) => boolean) => pieces.filter(f).length;
  console.log(`document: "${STRUCTURED_DOCUMENT_NAME}"\nconfig: ${JSON.stringify(config)}`);
  console.log(`exec summary ${count((p) => p.kind === "exec_summary")}; chapters 1-4: ${[1, 2, 3, 4].map((n) => count((p) => p.chapter === String(n))).join("/")}; box chunks ${count((p) => p.box !== null)}; with region ${count((p) => p.region !== null)}; no printed page ${count((p) => p.printedPage === null)}`);
  for (const i of [0, Math.floor(pieces.length / 2), pieces.length - 1]) {
    const p = pieces[i];
    console.log(`--- #${p.chunkIndex} ${p.headingPath} | chapter ${p.chapter} region ${p.region} box ${p.box} kind ${p.kind} | pdf ${p.pdfPage} printed ${p.printedPage}\n${p.embedText.slice(0, 220).replace(/\n/g, " / ")}...`);
  }
  console.log("\nDry run: no API call, no database access.");
  process.exit(0);
}

const [{ eq }, { client, db }, { chunks, documents }, { embedTexts }] = await Promise.all([
  import("drizzle-orm"), import("../src/lib/db"), import("../src/lib/db/schema"), import("../src/lib/rag/embed"),
]);

// Resumable (D-18): a changed PDF or config wipes ONLY this document's chunks; otherwise keep what is embedded and
// embed only chunks whose (page, index, hash) is not stored yet. The Phase 1 document is never read or written.
const contentHash = sha(new Uint8Array(await readFile(PDF_PATH)));
const [existing] = await db.select().from(documents).where(eq(documents.name, STRUCTURED_DOCUMENT_NAME));
const same = existing && existing.contentHash === contentHash && stable(existing.config as object) === stable(config);
const [doc] = await db
  .insert(documents)
  .values({ name: STRUCTURED_DOCUMENT_NAME, contentHash, config })
  .onConflictDoUpdate({ target: documents.name, set: { contentHash, config } })
  .returning({ id: documents.id });
if (!same) await db.delete(chunks).where(eq(chunks.documentId, doc.id));

const stored = await db
  .select({ id: chunks.id, pdfPage: chunks.pdfPage, chunkIndex: chunks.chunkIndex, contentHash: chunks.contentHash })
  .from(chunks)
  .where(eq(chunks.documentId, doc.id));
const key = (p: { pdfPage: number; chunkIndex: number; contentHash: string }) => `${p.pdfPage}:${p.chunkIndex}:${p.contentHash}`;
const wanted = new Set(pieces.map(key));
const have = new Set(stored.map(key));
for (const r of stored) if (!wanted.has(key(r))) await db.delete(chunks).where(eq(chunks.id, r.id));
const todo = pieces.filter((p) => !have.has(key(p)));
console.log(`${pieces.length - todo.length} already embedded, ${todo.length} to embed (document id ${doc.id})`);

const started = Date.now();
for (let i = 0; i < todo.length; i += EMBED_BATCH_SIZE) {
  const batch = todo.slice(i, i + EMBED_BATCH_SIZE);
  const vectors = await embedTexts(batch.map((c) => c.embedText), "RETRIEVAL_DOCUMENT");
  // Commit each batch so a quota failure loses at most one batch.
  await db.insert(chunks).values(batch.map((c, j) => ({ ...c, documentId: doc.id, embedding: vectors[j] })));
  console.log(`embedded ${Math.min(i + EMBED_BATCH_SIZE, todo.length)}/${todo.length} (${Math.round((Date.now() - started) / 1000)}s)`);
}

console.log(`Done: ${pieces.length} chunks stored for "${STRUCTURED_DOCUMENT_NAME}" (document id ${doc.id})`);
await client.end();
