# Progress

## Phase tracker
Phases are defined in `specs/gep-qa/plan.md` (D-19). Update this table at the end of each session.

| Phase | Goal | Status | Exit check | Notes |
|-------|------|--------|------------|-------|
| 0 Foundation | Scaffold, decisions, spec, plan, eval questions | Done | PDF dumped and inspected; model IDs confirmed | `npm run dump:pdf` writes `.scratch/dump/`; models confirmed (D-21); DB up, key present |
| 1 Walking skeleton | Crude end-to-end CLI, no structure | Blocked | 10 questions run by eye; failure baseline recorded | Code built (`npm run ingest`, `npm run ask`); 560 of 582 chunks embedded (pages 1-190); Gemini embedding daily quota exhausted, so remaining 22 chunks, the 10-question baseline and the 4 chat calls are pending |
| 2 Structure-aware ingestion | Clean text, validated structure, section chunks | Built (awaiting a live run) | Idempotent ingest; re-run vs Phase 1 | Offline modules + `npm run ingest:structured` (dry-run verified: 290 chunks, 15 embed requests, second `documents` row, D-26). Not run: waits for the Phase 1 baseline and the quota reset. See `specs/gep-qa/phase2-offline-notes.md` |
| 3 Routing + eval harness | Router, filters, hit@10 / MRR | Built (awaiting a live run) | Baseline numbers; Q1-Q9 retrieve correctly | `retrieve.ts`, `eval-score.ts`, `evals/golden.json`, `npm run eval`; `test:route` 46/46, `test:retrieve`, `test:eval` pass offline. Never run against the DB/API. See `phase3-notes.md` |
| 4 Answer + API + UI | Cited answers in the task-1 UI | Built (awaiting a live run) | Questions answered in browser with sources | `answer.ts`, `/api/ask`, ported UI; `tsc`, eslint (new code), `next build`, `test:answer` 16/16, `test:client` 25/25 pass. Real retrieval, Gemini citations and browser layout unverified. See `phase4-notes.md` |
| 5 Experiments | Parent-child, hybrid, reranker, key tables | Not started | Table of what each technique added | |
| 6 Hardening | Compose run, audit, README | Not started | Fresh clone works | |

Status values: Not started, In progress, Built (awaiting a live run), Done, Blocked.

## Eval scores
Filled from Phase 1 onward (retrieval-only, 10 questions in `specs/gep-qa/eval-questions.md`).

| Run | Date | Config | hit@10 | MRR | Mix-ups | Notes |
|-----|------|--------|--------|-----|---------|-------|
| _none yet_ | | | | | | |

## 2026-10-15
- Scaffolded with the CLIs (create-next-app, shadcn init) and the task-1 infra (Docker, Drizzle, Gemini deps, env, CLAUDE.md, decision log).
- Not started: purpose/requirements, schema, ingestion, UI.

## 2026-10-16 (design interview, no code yet)
- Inspected `data/GEP-Jun-2026.pdf` (200 pages, two-column, ligature glitches, 18 bookmarks to region level; printed page 1 = PDF page 23; the South Asia bookmark is off by one page, so bookmarks need validating against the printed TOC).
- Decided D-05 to D-18: use case, layered structure detection, section-bounded chunks, heading path in embeddings + metadata, rule-based routing, dense search baseline, Gemini embeddings, prose-only scope, grounded/cited generation, 10-question retrieval eval, no reranker yet, top-k 10/5, task-1 UI, resumable ingestion.
- Drafted `specs/gep-qa/eval-questions.md` (10 questions with expected sections).
- Next: write `specs/gep-qa/spec.md` and `plan.md`, then build ingestion (parse, structure, chunk, embed), the retrieval eval harness, then the UI.
- Open: GitHub remote (unchanged).

## 2026-10-16 (Phase 0 close-out)
- Wrote `scripts/dump-pdf.mts` (`npm run dump:pdf`): per-page JSON (real font name, size, x/y), bookmark outline with resolved PDF pages, per-page text, all in git-ignored `.scratch/dump/`.
- Verified printed page N = PDF page N+22 (roman i = PDF 3 ... xx = PDF 22; PDF 1-2 cover); body numbers run to printed 175 = PDF 197. Heading fonts are stable (Helvetica Bold 15.96 sections, Garamond 11.04 body); 86 of 92 printed-TOC entries were found by font on the expected PDF page.
- Confirmed model IDs (D-21). `.env.local` has a key; task-2 DB container is running on 5432.
- Next: Phase 1 (walking skeleton).

## 2026-10-16 (Phase 1 build, blocked on quota)
- Built schema + migration 0000 (documents, chunks with nullable structure columns, HNSW cosine), `src/lib/rag/{config,embed,ask}.ts`, resumable `scripts/ingest.mts` (per-batch commit, skips stored page/index/hash), `scripts/ask.mts` (`--retrieval-only`). `tsc` and eslint clean.
- Ingest: 200 pages -> 582 fixed-size chunks (avg 1356 chars); 560 stored before the Gemini embedding quota returned a 429 with a ~1187 min retryDelay. Remaining 22 chunks are on the last pages (~190-200, appendix, out of scope per D-12).
- One retrieval-only query (Q1) ran before quota ran out: top hits were South Asia pages 74-76 (hit at rank 1). Other 9 questions, chat calls (0 used) and `phase1-baseline.md` not done.
- Note: the task-1/task-3 DB containers were found stopped by something outside this session; task-2 db restarted on 5432.
- Next: after quota resets, `npm run ingest` (resumes), run the 10 questions, write baseline, update the Eval scores table.

## 2026-10-16 (Phase 2 offline parts, no API/DB use)
- Built `src/lib/rag/{clean,structure,chunk-sections,route,regions,dump}.ts`, `scripts/inspect-structure.mts` (`npm run inspect:structure`), `scripts/test-route.mts` (`npm run test:route`); config got new Phase 2 constants only (Phase 1 scripts untouched, DB and Gemini not used).
- Validator on the Phase 0 dump: all 96 expected headings found (86 TOC entries incl. 4 chapter titles, 5 annexes, 4 boxes, Executive Summary); 1 alias (TOC "Regional developments" = heading "Recent developments"); bookmark disagreements reported: South Asia (95 vs 96) and Latin America listed before Europe and Central Asia. Digit check and known-facts check pass.
- Expected Phase 2 chunk count: 290 (Phase 1: 582), median ~427 tokens. Router: 46/46 unit cases pass.
- Decisions D-22 to D-25 appended. Notes and the safe ingest plan: `specs/gep-qa/phase2-offline-notes.md`.
- Next: after the quota resets, run the Phase 1 baseline against the current chunks FIRST, then build the Phase 2 ingest (second `documents` row, see notes).
- Applied D-27/D-28 (D-30): heading paths now `Chapter N (Topic) > ...`, chapter intros `... > Overview`, Ch2 overview sections under `Overview`. Re-run: validator OK, 290 chunks (unchanged), router 46/46. Storage plan = second documents row (D-26).
