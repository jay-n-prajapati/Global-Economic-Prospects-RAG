# Progress

## Phase tracker
Phases are defined in `specs/gep-qa/plan.md` (D-19). Update this table at the end of each session.

| Phase | Goal | Status | Exit check | Notes |
|-------|------|--------|------------|-------|
| 0 Foundation | Scaffold, decisions, spec, plan, eval questions | Done | PDF dumped and inspected; model IDs confirmed | `npm run dump:pdf` writes `.scratch/dump/`; models confirmed (D-21); DB up, key present |
| 1 Walking skeleton | Crude end-to-end CLI, no structure | Not started | 10 questions run by eye; failure baseline recorded | |
| 2 Structure-aware ingestion | Clean text, validated structure, section chunks | Not started | Idempotent ingest; re-run vs Phase 1 | |
| 3 Routing + eval harness | Router, filters, hit@10 / MRR | Not started | Baseline numbers; Q1-Q9 retrieve correctly | |
| 4 Answer + API + UI | Cited answers in the task-1 UI | Not started | Questions answered in browser with sources | |
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
