# Phase 3 notes: retrieval, structured ingest, eval harness

Everything here was built and tested offline (no Gemini call, no database write). Nothing has been run against the API or DB yet.

## What was built

| Piece | File | What it does |
|-------|------|--------------|
| Retrieval | `src/lib/rag/retrieve.ts` | `retrieve()` embeds the question (RETRIEVAL_QUERY, 768 dims, normalized) and runs one cosine-distance SQL query on `chunks` for one document, optionally with filters. `routeAndRetrieve()` runs the router (`route.ts`) first. `findDocumentId(name)` looks up a `documents` row. |
| Retrieval test | `scripts/test-retrieve.mts` (`npm run test:retrieve`) | Checks the SQL and filter construction and the fallback with a fake embedder and fake SQL client. |
| Structured ingest | `scripts/ingest-structured.mts` (`npm run ingest:structured`) | clean + structure + section chunks (same code as `inspect-structure`), embed `embed_text` (heading path + text, D-08), store under the second documents row `GEP June 2026 (structured, phase 2)`. `--dry-run` touches neither API nor DB. |
| Golden file | `evals/golden.json` | The 10 questions, each with expected and forbidden sections in machine-checkable form. |
| Scoring | `src/lib/rag/eval-score.ts`, `scripts/test-eval.mts` (`npm run test:eval`) | Pure functions: does a chunk match a section, hit/rank/mix-up per question, summary, markdown row. Unit-tested with fake retrieval results. |
| Eval runner | `scripts/eval.mts` (`npm run eval`) | Runs the 10 questions through `routeAndRetrieve` with filters on and/or off, prints a table, a summary and a row for the progress.md Eval scores table. |

Also: `STRUCTURED_PIPELINE` was added to `config.ts` (`STRUCTURED_DOCUMENT_NAME` already existed there from the Phase 4 agent, same value).

## Concepts in plain language

**hit@10.** For a question, look at the 10 chunks the search returned. If at least one comes from the section that really holds the answer, it is a hit. It only asks "was the right text in the pile we hand to the model?", not whether it came first.

**Rank and MRR.** The rank is the position (1 = best) of the first chunk from the expected section. MRR (mean reciprocal rank) averages 1/rank over all questions: rank 1 scores 1.0, rank 2 scores 0.5, rank 4 scores 0.25, a miss scores 0. Worked example with three of our questions: Q1 (South Asia outlook) finds the South Asia Outlook chunk at rank 1 -> 1.0; Q2 (East Asia outlook) finds it at rank 2 -> 0.5; Q3 (Sub-Saharan Africa) never finds it in the top 10 -> 0. hit@10 = 2/3, MRR = (1 + 0.5 + 0) / 3 = 0.5. hit@10 can be perfect while MRR is low: the right chunk is there but buried, which matters because only the best 5 are sent to the model (D-16).

**Mix-up.** The failure this project exists to avoid: facts from the wrong region or chapter. We report two measures per question, because they say different things:
- "forbidden above expected": a chunk from a forbidden section ranks higher than the first correct chunk (or there is no correct chunk and a forbidden one is present). Example: a South Asia question where an East Asia chunk ranks 2 and the South Asia Outlook chunk ranks 3 is a mix-up.
- "forbidden in top 5": any of the 5 chunks the model will see comes from a forbidden section, even if the correct chunk is first. The model could then blend the two.
A chunk that is both expected and forbidden counts as expected.

**Why filters need a fallback.** The router (D-09) turns "South Asia" into `region = 'South Asia'`, and SQL then only considers matching chunks. That is a hard filter: if the router guesses wrong, or the chunk metadata is missing, the answer is simply invisible and the search silently returns nothing useful. So when a filtered search returns zero rows we rerun it unfiltered and report `fellBack: true` (and `filtersApplied: {}`), instead of answering "not found" because of our own filter. `routeAndRetrieve` embeds the question only once even when it falls back.

**A search detail worth knowing.** pgvector's HNSW index finds the 40 nearest neighbours first (`ef_search` = 40) and filters afterwards, so a selective filter such as one region can come back with too few rows or none even though matching chunks exist. `retrieve()` therefore runs `SET LOCAL hnsw.ef_search = 1000` inside a transaction. The table has under 900 rows, so this makes the search effectively exact, still uses cosine distance and the index when the planner picks it, and keeps the fallback meaningful.

**Scoring both pipelines on one golden file.** Structured chunks have chapter/region/kind/box columns, so a golden section is matched on those (plus `headingContains` such as `" > Outlook"`, and `noBox`). Phase 1 chunks have none of that, so the same golden entry is matched on its `pdfPages` ranges (printed page + 22; chapter and region ranges from `.scratch/phase2/sections.json`). A chunk is treated as structured when `heading_path` is set. This makes the Phase 1 numbers a little more lenient than Phase 2 (page ranges are coarse; a Phase 1 chunk on a page shared by two regions can match either), so a Phase 2 win is a real one.

## How the golden entries encode each question
Each item: `id` (q1..q10), `question`, `tests`, `expected` (list of sections; any one matching counts), `forbidden` (list of sections), `keyFacts`, and `expectRefusal` for Q10. A section is `{chapter?, region?, kind?, box?, noBox?, headingContains?, pdfPages: [[from, to], ...]}`.

| Q | Expected | Forbidden |
|---|----------|-----------|
| 1 | Ch 2, region South Asia, heading contains "> Outlook"; PDF 96-98 | the other five regions' sections (whole region, PDF ranges 81-83, 84-87, 88-91, 92-95, 99-102) |
| 2 | EAP Outlook; PDF 81-83 | the other five regions |
| 3 | SSA Outlook; PDF 99-102 | the other five regions |
| 4 | South Asia Outlook (India); PDF 96-98 | the other five regions |
| 5 | MNA region, any section (Table 2.8 is not indexed, D-12); PDF 92-95 | South Asia region, PDF 96-98 |
| 6 | chapter 3; PDF 107-142 | chapter 4; PDF 143-183 |
| 7 | chapter 4; PDF 143-183 | chapter 3; PDF 107-142 |
| 8 | kind `exec_summary`; PDF 19-20 | Ch 1 "> Summary" (PDF 25-35), Ch 1 "> Risks to the outlook" (52-56), Ch 1 "> Overview" (23-25, the near-duplicate abstract) |
| 9 | box `Box 1.1`; PDF 30-35 | Ch 1 non-box text (`noBox`, PDF 23-29 and 36-68), chapter 3 (107-142) |
| 10 | none, `expectRefusal: true`: retrieval is not scored, only the answer (must be the refusal text) | none |

## Ambiguities I resolved (please check)
1. Q1-Q4 "forbidden" says "any other region" or lists only some regions (Q3: EAP, SAR). I used all five other regions for Q1-Q4, which is stricter than the Q3 text and fits Q1's wording. A whole other region counts (Outlook or Recent developments), not only its Outlook.
2. Q8 forbidden: eval-questions says "Ch 1 summary or Ch 1 risks section", so I forbade those two plus the Ch 1 Overview abstract (D-27 says it nearly duplicates the Executive Summary). The rest of Ch 1 is not forbidden, so the "forbidden in top 5" count is not inflated by unrelated Ch 1 chunks.
3. Q9 forbidden: "Ch 1 body text" is implemented as Ch 1 chunks that are not box chunks. Box 1.1's PDF pages (30-35) overlap the Ch 1 Summary pages, so for Phase 1 the body ranges skip them.
4. Q5 expected is the whole MNA region, not only Outlook, since Pakistan is mostly in the table that is not indexed.
5. MRR and hit@10 are computed over the 9 answerable questions; Q10 is excluded from retrieval scoring.
6. The Phase 1 document runs with filters off only (its columns are empty, so filters would always fall back). The script detects it from `config.structureVersion === 0`.
7. Chunk `content_hash` for the structured document is the hash of the embedded text (heading path + content), so a label change re-embeds. The `chapter` column is text, so the integer chapter is stored and compared as a string.

## Run order (after the embedding quota resets)
Do not run anything before the quota is back; each step below uses the API or DB.
0. `docker compose --env-file .env.local up -d db`. Offline checks any time: `npm run test:retrieve`, `npm run test:eval`, `npm run test:route`, `npx tsx scripts/ingest-structured.mts --dry-run`.
1. Finish Phase 1: `npm run ingest` (resumes, ~22 chunks missing).
2. Phase 1 baseline, BEFORE anything is ingested: `npm run eval -- --doc "World Bank Global Economic Prospects, June 2026" --filters off --json .scratch/eval-phase1.json` (the Phase 1 document's name as stored, from `DOCUMENT_NAME` in `config.ts`; it is also accepted as its numeric id). Retrieval only: 10 query embeddings.
3. `npm run ingest:structured` (290 chunks, 15 embed requests, about 3 minutes at ~100 texts/min; resumable: rerun after a quota error).
4. `npm run eval -- --json .scratch/eval-phase2.json` (default document = structured, `--filters both`: 10 query embeddings, shared by both modes).
5. Compare the two summaries (Phase 1 off vs structured off vs structured on). Append the printed markdown rows to the Eval scores table in `specs/progress.md` (columns: Run, Date, Config, hit@10, MRR, Mix-ups, Notes).
Optional spot check of answers (spends chat quota, ~1 call per listed question): `npm run eval -- --full q1,q5,q8,q10`. It uses `answerQuestion` and `isRefusal` from the Phase 4 module (`src/lib/rag/answer.ts`), sends the top 5 chunks of the first mode, and checks that Q10 gives the exact refusal.

Other options: `--filters on|off|both`, `--doc <name|id>`, `--json [path]` (default `.scratch/eval-latest.json`). `eval.mts` itself could not be run offline (it needs the DB and API); it type-checks and shares all scoring logic with the tested pure module.

## PROPOSED decision rows (append to `specs/decisions.md`; D-numbers left blank)

| ID | Date | Area | Decision | Why / notes | Status |
|----|------|------|----------|-------------|--------|
| D-? | 2026-10-16 | Retrieval | `retrieve()` / `routeAndRetrieve()` in `src/lib/rag/retrieve.ts`: dense cosine search restricted to one document id, router filters (chapter, region, kind, box) become `WHERE` conditions on the denormalized `chunks` columns. If a filtered search returns 0 rows it falls back to the unfiltered search and reports `fellBack` / `filtersApplied`. The query is embedded once per call. Each search runs in a transaction with `SET LOCAL hnsw.ef_search = 1000` so the HNSW scan is not cut off before the filter is applied. Pure condition builders are unit-tested by `npm run test:retrieve` | Recommended approach (not an override). Implements D-09/D-10; a wrong or empty filter must degrade to plain search, not to a false "not found". The default `ef_search` of 40 can return too few rows under a selective filter | Active (offline-tested only) |
| D-? | 2026-10-16 | Eval | Scoring (`eval-score.ts`, `evals/golden.json`): hit@10, MRR over the 9 answerable questions (Q10 is answer-level only), and two mix-up counts reported separately: forbidden chunk ranked above the first expected chunk, and any forbidden chunk in the top 5. Sections are machine-checkable specs (chapter/region/kind/box/heading substring/noBox); Phase 1 chunks, which have no structure columns, are scored on PDF page ranges (printed + 22) from the same golden file so both pipelines are comparable. Filters on/off both run per question, sharing one query embedding | Recommended approach (not an override). Implements D-14. Page-range scoring for Phase 1 is slightly lenient (shared pages), so a Phase 2 gain is conservative | Active |
| D-? | 2026-10-16 | Eval | Golden forbidden sets: Q1-Q4 forbid all five other regions (whole region sections); Q5 forbids South Asia; Q6/Q7 forbid the other chapter; Q8 forbids Ch 1 Summary, Ch 1 Risks to the outlook and the Ch 1 Overview abstract; Q9 forbids Ch 1 non-box text and Chapter 3 | Resolves wording gaps in `eval-questions.md` (it names only some regions for Q3 and "Ch 1 body text" for Q9). Narrow Q8 set keeps the top-5 mix-up count meaningful | Active (tell me if you want a looser or stricter set) |
| D-? | 2026-10-16 | Ingest | `npm run ingest:structured` stores the Phase 2 chunks under the documents row `GEP June 2026 (structured, phase 2)` (D-26), config records pipeline `phase2-structured`, clean/structure/chunk versions, chunk size/overlap, embedding model and dimensions. `content_hash` = hash of the embedded text (heading path + content), resume key (pdf page, chunk index, hash), commit per batch of 20, validator errors abort before embedding, chunk count is capped at the 290-chunk budget, a changed config wipes only this document's chunks, `--dry-run` uses no API or DB. `chunks.chapter` stores the number as text | Recommended approach (not an override). Mirrors Phase 1's resumable ingest (D-18); the Phase 1 document is never read or modified | Active (dry-run only; embedding pending quota reset) |
| D-? | 2026-10-16 | Eval | Full mode (`--full q1,q5,q8,q10`) reuses the Phase 4 `answerQuestion` and `isRefusal` (same prompt, model, top 5 chunks) so the harness and the web app cannot drift; retrieval-only stays the default and spends only query embeddings | Recommended approach (not an override). Follows D-13/D-16; chat calls stay at about 4 of ~20 per day | Active |
