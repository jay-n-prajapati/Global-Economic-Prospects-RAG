// Wire format shared by POST /api/ask and the UI. Types and constants only, so client components can import it.
//
// Request body: { question: string, useFilters?: boolean (default true), pipeline?: "structured" | "fixed" }
//
// Success responses are NDJSON (one JSON object per line, application/x-ndjson):
//   {"type":"sources","sources":[...],"meta":{...}}   exactly once, first (before any generation)
//   {"type":"text","text":"..."}                       zero or more answer fragments, in order
//   {"type":"done"}                                    last line on success
//   {"type":"error","code":"...","message":"...","retryAfterSecs"?:n}   last line if generation fails after sources
// Failures before streaming starts (bad input, retrieval errors) are plain JSON with a non-2xx status:
//   {"error":{"code":"...","message":"...","retryAfterSecs"?:n}}

export const MAX_QUESTION_LENGTH = 500;

export type Pipeline = "structured" | "fixed";

export type AskFilters = { chapter?: number; region?: string; kind?: string; box?: string };

export type AskSource = {
  id: number;
  rank: number; // 1-based position in the retrieval order; the model cites this number as [rank]
  score: number;
  content: string; // the chunk text (the "snippet" shown in the evidence panel)
  headingPath: string | null;
  chapter: number | null;
  region: string | null;
  box: string | null;
  kind: string | null;
  printedPage: number | null;
  pdfPage: number;
};

export type AskMeta = {
  pipeline: Pipeline;
  useFilters: boolean; // what the user asked for
  filters: AskFilters; // what the router detected in the question
  filtersApplied: boolean; // whether they actually restricted the search
  fellBack: boolean; // filters matched nothing, so the search ran unfiltered
  sendK: number; // the first sendK sources were shown to the model
};

export type AskErrorCode = "invalid" | "quota" | "unavailable" | "not_ready" | "internal";

export type AskEvent =
  | { type: "sources"; sources: AskSource[]; meta: AskMeta }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; code: AskErrorCode; message: string; retryAfterSecs?: number };
