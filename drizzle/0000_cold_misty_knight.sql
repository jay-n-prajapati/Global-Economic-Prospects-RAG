CREATE TABLE "chunks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"document_id" integer NOT NULL,
	"pdf_page" integer NOT NULL,
	"printed_page" integer,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"heading_path" text,
	"chapter" text,
	"region" text,
	"box" text,
	"kind" text,
	"embed_text" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"content_hash" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_document_id_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_position_idx" ON "chunks" USING btree ("document_id","pdf_page","chunk_index");