import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "../rag/config";

export const documents = pgTable("documents", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
  contentHash: text("content_hash").notNull(),
  config: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pdfPage: integer("pdf_page").notNull(),
    // Printed page = PDF page - 22; null for the front matter (D-08).
    printedPage: integer("printed_page"),
    chunkIndex: integer("chunk_index").notNull(),
    content: text().notNull(),
    // Hash of the text that was embedded; lets a re-run skip chunks that are already stored (D-18).
    contentHash: text("content_hash").notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    // Structure columns, unused in Phase 1 (nullable so Phase 2 needs no breaking migration).
    headingPath: text("heading_path"),
    chapter: text(),
    region: text(),
    box: text(),
    kind: text(),
    embedText: text("embed_text"),
  },
  (t) => [
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_document_id_idx").on(t.documentId),
    uniqueIndex("chunks_position_idx").on(t.documentId, t.pdfPage, t.chunkIndex),
  ],
);
