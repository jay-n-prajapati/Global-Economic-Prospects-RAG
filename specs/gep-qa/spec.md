# Spec: Q&A over the World Bank Global Economic Prospects, June 2026

Decisions behind this spec are in `specs/decisions.md` (D-05 to D-18). Questions and expected sections are in `eval-questions.md`.

## Goal
A question-answering system over one long structured report (`data/GEP-Jun-2026.pdf`, 200 pages). It must find the right chapter, section and region for a question and never mix facts from different regions or chapters. The project is also a learning exercise: every design choice should be explainable in plain language, and each technique (parent-child, hybrid, reranking, tables) is added only after a measured baseline.

## Pass/fail bar
The 10 questions in `eval-questions.md`:
- **Retrieval (automatic, no chat quota):** the expected section appears in the top 10, and no forbidden section ranks above it. Report hit@10 and MRR.
- **Answer (manual, a handful of questions):** the answer cites the expected section, states the key facts, and uses no facts from forbidden sections. Q10 must refuse.
- The baseline passes when Q1-Q9 retrieve correctly and Q10 refuses. Any region/chapter mix-up is a failure, not a partial score.

## In scope
- Prose of chapters, boxes, Executive Summary, figure and table captions (D-12).
- Structure: chapter > section > sub-section, six regions in Chapter 2, boxes as own units (D-06, D-07).
- Single-turn questions (as in task-1).
- Single-page UI matching task-1: composer, streamed answer, collapsible evidence panel, history rail (D-17).

## Out of scope (for the baseline)
- Table bodies, chart images, Statistical Appendix tables (D-12, later experiment).
- Parent-child chunks, hybrid search, reranking (later experiments; D-07, D-10, D-15).
- Multi-turn chat, multiple documents, auth.

## Behavior
- A question that names a region, chapter or the executive summary applies a metadata filter; otherwise search is unfiltered (D-09). Pakistan maps to the Middle East, North Africa, Afghanistan, and Pakistan region.
- The LLM sees only the top 5 chunks, each labeled with its heading path, and answers only from them with citations; if the chunks lack the answer it says the answer is not in the report (D-13, D-16).
- Citations show heading path plus both the printed page and the PDF page (D-08).

## Constraints
- Free-tier Gemini: ~100 embedding texts/min (each text in a batch counts), ~20 chat calls/day. Ingestion is resumable and honors `retryDelay` (D-18).
- Containers stay small (db 384m, app 256m); dependencies stay minimal.
- Retrieval evaluation must not spend chat quota.

## Risks
- Bookmarks are not fully accurate (South Asia points one page early), so structure comes from the TOC and fonts, with bookmarks as a cross-check.
- Two-column layout can scramble reading order in naive extraction.
- Executive Summary text nearly duplicates the Chapter 1 summary; only routing or the heading path separates them.
- Wrong filters hide the right answer, so filters apply only on explicit matches.
