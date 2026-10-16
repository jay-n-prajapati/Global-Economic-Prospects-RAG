import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { client, db } from "../src/lib/db";
import { chunks, documents } from "../src/lib/db/schema";
import {
  CHUNK_OVERLAP, CHUNK_SIZE, CHUNK_VERSION, CLEAN_VERSION, DOCUMENT_NAME, EMBED_BATCH_SIZE,
  EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, PDF_PATH, PRINTED_PAGE_OFFSET, STRUCTURE_VERSION,
} from "../src/lib/rag/config";
import { embedTexts } from "../src/lib/rag/embed";

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

const file = new Uint8Array(await readFile(PDF_PATH));
const config = {
  chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP, embeddingModel: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS, cleanVersion: CLEAN_VERSION, chunkVersion: CHUNK_VERSION,
  structureVersion: STRUCTURE_VERSION,
};
const stable = (o: object) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// Crude fixed window per PDF page: never crosses a page, no cleaning, no structure.
const pdf = await getDocumentProxy(file);
const { text: rawPages } = await extractText(pdf, { mergePages: false });
const pieces: { pdfPage: number; printedPage: number | null; chunkIndex: number; content: string; contentHash: string }[] = [];
rawPages.forEach((raw, i) => {
  const text = raw.trim();
  const pdfPage = i + 1;
  const printedPage = pdfPage >= PRINTED_PAGE_OFFSET + 1 ? pdfPage - PRINTED_PAGE_OFFSET : null;
  for (let start = 0, n = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP, n++) {
    const content = text.slice(start, start + CHUNK_SIZE);
    pieces.push({ pdfPage, printedPage, chunkIndex: n, content, contentHash: sha(content) });
    if (start + CHUNK_SIZE >= text.length) break;
  }
});
const sizes = pieces.map((c) => c.content.length);
console.log(
  `${rawPages.length} pages -> ${pieces.length} chunks (chars min ${Math.min(...sizes)}, ` +
    `avg ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)}, max ${Math.max(...sizes)}; ` +
    `${sizes.filter((s) => s < 200).length} under 200 chars)`,
);

// Resumable (D-18): a changed PDF or config wipes the stored chunks; otherwise keep what is embedded
// and only embed chunks whose (page, index, content hash) is not stored yet.
const contentHash = sha(file);
const [existing] = await db.select().from(documents).where(eq(documents.name, DOCUMENT_NAME));
const same = existing && existing.contentHash === contentHash && stable(existing.config as object) === stable(config);
const [doc] = await db
  .insert(documents)
  .values({ name: DOCUMENT_NAME, contentHash, config })
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
for (const s of stored) if (!wanted.has(key(s))) await db.delete(chunks).where(eq(chunks.id, s.id));
const todo = pieces.filter((p) => !have.has(key(p)));
console.log(`${pieces.length - todo.length} already embedded, ${todo.length} to embed`);

const started = Date.now();
for (let i = 0; i < todo.length; i += EMBED_BATCH_SIZE) {
  const batch = todo.slice(i, i + EMBED_BATCH_SIZE);
  const vectors = await embedTexts(batch.map((c) => c.content), "RETRIEVAL_DOCUMENT");
  // Commit each batch so a quota failure loses at most one batch.
  await db.insert(chunks).values(batch.map((c, j) => ({ ...c, documentId: doc.id, embedding: vectors[j] })));
  console.log(`embedded ${Math.min(i + EMBED_BATCH_SIZE, todo.length)}/${todo.length} (${Math.round((Date.now() - started) / 1000)}s)`);
}

console.log(`Done: ${pieces.length} chunks stored for "${DOCUMENT_NAME}"`);
await client.end();
