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
