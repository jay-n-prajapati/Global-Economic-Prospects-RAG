export const DOCUMENT_NAME = "World Bank Global Economic Prospects, June 2026";
export const PDF_PATH = "data/GEP-Jun-2026.pdf";
export const PRINTED_PAGE_OFFSET = 22; // printed page 1 = PDF page 23

// Phase 1: crude fixed window per PDF page, no structure (the baseline Phase 2 must beat).
export const CHUNK_SIZE = 1600;
export const CHUNK_OVERLAP = 200;

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const CHAT_MODEL = "gemini-3.8-flash";
export const EMBED_BATCH_SIZE = 20;

export const RETRIEVE_K = 10;
export const SEND_K = 5;

// Bump when the logic changes, so ingest re-embeds instead of skipping (D-18).
export const CLEAN_VERSION = 0; // 0 = no cleaning
export const CHUNK_VERSION = 1;
export const STRUCTURE_VERSION = 0; // 0 = no structure

// Phase 2 (structure-aware ingestion, offline parts). New constants only; Phase 1 values above are untouched.
export const PHASE2_CLEAN_VERSION = 1;
export const PHASE2_STRUCTURE_VERSION = 1;
export const PHASE2_CHUNK_VERSION = 1;
export const SECTION_CHUNK_MAX_CHARS = 2000; // ~500 tokens at ~4 chars/token, overlap included
export const SECTION_CHUNK_PIECE_CHARS = 1800; // max new text per chunk, leaving room for the overlap
export const SECTION_CHUNK_OVERLAP_CHARS = 200; // ~50 tokens, only inside one section
export const SECTION_CHUNK_MIN_TAIL_CHARS = 350; // a shorter last piece is merged into the previous one
export const SECTION_CHUNK_TINY_CHARS = 300; // sections shorter than this stay whole (reported, never merged)
