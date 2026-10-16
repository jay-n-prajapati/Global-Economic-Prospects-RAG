# Plan: GEP Q&A (long structured report)

Vertical slices, same as task-1 and task-3: each phase runs through every layer (extract -> store -> retrieve -> answer) and ends with something demonstrable and measurable. Quality work comes after a working skeleton so every change is compared to a baseline. Status lives in `progress.md`; decision IDs refer to `specs/decisions.md`. Reuse task-1 code by copying (`../task-1/src/lib/rag/`), not importing.

## Config (`src/lib/rag/config.ts`)
- `EMBEDDING_MODEL = "gemini-embedding-001"` (768 dims), `CHAT_MODEL = "gemini-3.8-flash"`: taken from task-1, re-confirm before Phase 1 and record as a decision.
- Chunk tokens (~300/400/500), overlap ~50, `RETRIEVE_K = 10`, `SEND_K = 5`.
- `CLEAN_VERSION`, `CHUNK_VERSION`, `STRUCTURE_VERSION`: changed logic triggers re-embedding.

## Phase 0 - Foundation (mostly DONE)
Scaffold, Docker, deps, decisions D-01..D-19, spec and plan, 10 eval questions drafted.
- [ ] `scripts/dump-pdf.mts`: per-page text with fonts/positions and bookmarks to a scratch folder; confirm page offset (printed 1 = PDF 23, roman numerals for front matter).
- [ ] Confirm model IDs; `.env.local` with `GEMINI_API_KEY`; DB up.
Exit: raw text extracted and inspected; models confirmed.

## Phase 1 - Walking skeleton (crude end-to-end, CLI only)
Goal: ask a question from the terminal and get a cited answer, however crude. Deliberately has NO structure awareness, so it shows the failure case.
- `src/lib/env.ts`; `documents` + `chunks` schema (`vector(768)`, PDF page, printed page, content; structure columns present but nullable); first migration; HNSW index.
- Minimal ingest: page text -> fixed-size chunks with overlap (no cleaning, no structure) -> batched embed -> insert. Resumable from day one (D-18); retry helper honors `retryDelay`.
- `npm run ask "<question>"`: embed query, top-5 dense search, strict grounding prompt (D-13), print answer, pages, scores.
Exit: the 10 questions run end to end and are judged by eye. Expect region mix-ups (Q1-Q5) and Q8 confusion; this is the BASELINE that structure must beat.
Why first: surfaces integration risks early (model IDs, pgvector, quota) and shows what unstructured chunking gets wrong.

## Phase 2 - Structure-aware ingestion
Goal: chunks that know where they came from (D-06, D-07, D-08).
- `rag/clean.ts`: two-column reading order, ligature repair, header/footer and page-number removal, dot-leader TOC lines dropped, line re-flow, never touch digits; post-clean known-facts safety check (e.g. "6.3 percent", "1.3 percent").
- `rag/structure.ts`: parse printed TOC (PDF p7-18) into the expected heading list, cross-check bookmarks, locate each heading by font and text. Validator fails on any missing or out-of-order heading and reports bookmark/TOC disagreements (expect South Asia off by one page).
- `rag/chunk.ts`: section-bounded chunks, overlap only inside a section, boxes and regions as their own units; each chunk gets heading path, chapter, region, box, kind, pdf and printed page. Assert no chunk spans two sections.
- Embed `heading path + content`; store clean content separately (D-08). Transactional replace, hash + version skip, `--force`.
Exit: ingest is idempotent; per-chapter/region chunk counts look sane; the 10 questions re-run by eye and compared with the Phase 1 baseline.

## Phase 3 - Routing + evaluation harness
Goal: replace "by eye" with repeatable numbers (D-09, D-14).
- `rag/route.ts`: question -> `{chapter?, region?, kind?}` by regex plus country-to-region table (India -> South Asia, Pakistan -> MNA); filters only on explicit matches. Unit-tested offline.
- `rag/retrieve.ts`: dense search with optional metadata filters, top `RETRIEVE_K`.
- `evals/golden.json` from `eval-questions.md` (expected and forbidden sections); `npm run eval`: retrieval-only mode (hit@10, MRR, forbidden-above-expected check) with filters on and off, plus an optional full mode with chat for a few questions. `RAG_DEBUG=1` logging.
Exit: documented baseline numbers; Q1-Q9 retrieve correctly with no region/chapter mix-up. Do not tune anything before this phase has produced numbers.

## Phase 4 - Answer + API + UI
Goal: usable page (D-13, D-17).
- `rag/answer.ts`: labeled context (top `SEND_K`), strict grounding, citations `[Chapter > Section, p. N]`, exact refusal text, temperature ~0, streamed.
- `POST /api/ask`: zod-validated body, NDJSON stream (sources, text, done/error), as in task-1.
- UI ported from task-1: workspace, composer, answer, evidence, history-rail. Evidence rows show heading path, printed and PDF page, score and applied filters.
Exit: acceptance questions answered in the browser with visible sources; `npm run build` passes.

## Phase 5 - Experiments (one at a time, each compared on the eval)
Order: parent-child (D-07), hybrid Postgres full-text + RRF (D-10), reranker (D-15), key tables (D-12). For each: hypothesis, change, eval numbers before/after, keep or drop; record in `decisions.md`.
Exit: documented table of what each technique added on this document.

## Phase 6 - Hardening
Full compose run within resource limits, `npm audit`, README (setup, ingest, eval), revisit deferred decisions with eval data.
Exit: fresh clone -> documented commands -> working app.

## Cross-cutting rules
- After each phase: update `progress.md`, append decisions to `decisions.md` (flag overrides).
- Don't tune before Phase 3 has a harness.
- Retrieval eval never spends chat quota; spot-check about 4 full answers (Q1, Q5, Q8, Q10) per run.

## Open items
- GitHub remote (unchanged).
