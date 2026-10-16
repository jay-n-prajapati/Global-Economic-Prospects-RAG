# Phase 4 notes: answer generation, API, UI

Status: built and checked offline only (no Gemini call, no database). Not committed.

## Request flow in plain language

1. **Question typed** in the composer. The page also sends two switches: Filters on/off and Pipeline (structured or fixed-size).
2. **`POST /api/ask`** validates the body with zod (`question` 1-500 chars, `useFilters` default true, `pipeline` default structured). The fixed-size pipeline always runs without filters, because those chunks have no region/chapter columns.
3. **Document choice.** The route turns the pipeline into a document name (`FIXED_DOCUMENT_NAME` or `STRUCTURED_DOCUMENT_NAME`, both in `config.ts`) and asks `findDocumentId`. Not ingested yet gives a friendly `not_ready` error.
4. **Router + retrieval** (`routeAndRetrieve`, Phase 3 code): the rule router (D-09/D-25) reads the question; if it names a region, chapter, box or the executive summary, the vector search is restricted to those chunks; if that matches nothing it falls back to an unfiltered search. Top `RETRIEVE_K` (10) come back.
5. **Sources are sent first** as one NDJSON line, before any generation: every retrieved chunk (rank, score, heading path, chapter, region, box, kind, printed and PDF page, full text) plus `meta` (pipeline, what the router detected, what was actually applied, fallback flag, `sendK`). So the evidence panel fills while the model is still thinking, and a retrieval problem is visible even if generation fails.
6. **Prompt** (`prompt.ts`, `buildPrompt`): only the first `SEND_K` (5) chunks go to the model, each labeled `[n] Chapter 2 (Regional Outlooks) > South Asia > Outlook (printed p. 74, PDF p. 96)`. The system prompt says: only these excerpts, no outside knowledge, never merge facts from different regions/chapters, cite every claim as `[n]`, reply exactly `Not found in the report.` when the excerpts lack the answer.
7. **Stream** (`answer.ts`, `streamAnswer`): Gemini `generateContentStream`, temperature 0, `CHAT_MODEL`, retry budget small for the web (3 tries, waits over 15 s become a quota error instead of hanging). Text fragments are forwarded as `text` lines, then `done`.
8. **Citations in the UI.** The model writes `[1]`, `[2][3]`. The UI turns each into a chip showing the number and the printed page (`2 · p.74`); clicking scrolls to and flashes the matching evidence card (card id `ev-<rank>`). A number outside the sent set renders as a dashed, non-clickable chip. Cited cards are marked "Cited"; cards ranked 6-10 are dashed "Not sent to model".
9. **Refusal / errors.** Exact refusal text shows a "Not found in the report." verdict (plus a hint to turn filters off if one was applied). Quota (429 or the retry helper's "quota exhausted") shows a friendly notice with the server's `retryDelay` (for example "about 10 minutes"); the sources already received stay visible.
10. **History** (`gep-ask:history:v1`, localStorage): stores question, answer, sources, meta. The same question under a different pipeline/filter setting is kept as a separate entry, so before/after pairs stay side by side. Reopening costs no API call.

## Files

| File | Purpose |
|---|---|
| `src/lib/rag/prompt.ts` | Pure, dependency-free: `REFUSAL`, `SYSTEM_PROMPT`, `labelChunk`, `buildPrompt`, `isRefusal`. Shared by server, UI and eval harness. |
| `src/lib/rag/answer.ts` | `streamAnswer(question, chunks)` and one-shot `answerQuestion(question, chunks)` (for the eval harness); re-exports `REFUSAL`, `buildPrompt`, `isRefusal`. |
| `src/lib/rag/errors.ts` | `classifyError`, `retryAfterSecs` (parses `"retryDelay":"27s"` and the retry helper's "wait N min"). |
| `src/lib/rag/config.ts` | Added only `FIXED_DOCUMENT_NAME` and `STRUCTURED_DOCUMENT_NAME`. |
| `src/app/api/ask/route.ts` | The endpoint described above. Retrieval and answer modules are imported lazily, so `next build` never opens the DB or validates env. |
| `src/lib/ask-protocol.ts` | NDJSON wire types, shared by route and client (types only). |
| `src/lib/ask-client.ts` | `streamAsk` (fetch) and `readEvents` (the NDJSON parser, exported for tests). |
| `src/lib/citations.ts`, `highlight.ts`, `filters.ts`, `refusal.ts`, `history.ts`, `use-media-query.ts` | Client helpers: `[n]` citation parser, shared-wording highlight, "Filters applied" line text and page/path formatting, refusal check, localStorage history. |
| `src/components/{workspace,composer,answer,evidence,history-rail}.tsx`, `workspace.css` | The page, ported from task-1. |
| `src/app/{page,layout,globals.css}` | Server shell with the pipeline constants, report metadata/title, task-1's dark theme tokens. |
| `scripts/test-answer.mts` (`npm run test:answer`) | 16 offline checks of the prompt builder. |
| `scripts/test-client.mts` (`npm run test:client`) | 25 offline checks: NDJSON parser against a fake stream cut into 1/3/7-byte slices, citation parser, filter line, error mapping. |

## Run it after the quota resets

Port 3000 is taken on this machine, so use another port.

```
docker compose --env-file .env.local up -d db
npm run ingest              # Phase 1 fixed-size index (if not already there)
npm run ingest:structured   # Phase 2 structured index
npm run build && npx next start -p 3107     # or: npx next dev -p 3107
```
Open http://localhost:3107. With the full stack use `APP_PORT=3107 docker compose --env-file .env.local up -d --build`.

Suggested check: ask "What is the growth outlook for South Asia in this report?" with Structured + Filters On (expect "Filters applied: Region = South Asia", cards from Chapter 2 > South Asia, answer mentioning 6.3% with `[n]` chips), then Filters Off, then Fixed-size, and compare evidence panels. Each Ask costs one of about 20 daily chat calls plus one embedding call.

## Not verified offline

- Real retrieval ranking and the filter fallback (need DB + embeddings); the evidence panel was never rendered with real data.
- Whether Gemini obeys the citation format `[n]` and the exact refusal string. The parser tolerates `[1][2]`, `[1, 2]`, `[1-3]` and light markdown, but a model that cites differently would show no chips (answer text still shows).
- Quota path end to end (the 429 body and `retryDelay` shape are parsed from the documented format, tested on synthetic strings only).
- Streaming over a real connection and the visual layout in a browser (only server-side render of the page and the 400 error path were smoke tested on port 3107).
- The page reached `next start` on port 3107 only; no browser was opened, so responsive CSS (drawer, bottom sheet) is carried over from task-1 unchanged and not re-inspected.

## Offline results

`npx tsc --noEmit` clean; `npx eslint src scripts/test-answer.mts scripts/test-client.mts` clean; `npm run build` passes (standalone); `npm run test:answer` 16/16; `npm run test:client` 25/25; built client chunks contain no `GEMINI_API_KEY`, drizzle, postgres or `generateContentStream`.

## Deviations from task-1's UI

- **Citations are numbered excerpts (`[1]`), not page numbers.** Task-1 cited `(page N)`; here a page is not enough (the same page holds several sections, and regions must not be mixed). A number points to exactly one labeled chunk, and the chip also shows the printed page.
- **Evidence cards** show rank, heading path as a breadcrumb, printed and PDF page, score, kind/box/region badges, and whether the chunk was sent to the model (ranks 6-10 are retrieved but not sent, dashed). Cards are keyed by rank, not page.
- **"Filters applied" line and pipeline line** at the top of the evidence panel (new).
- **Composer has two segmented toggles** (Filters On/Off, Pipeline Structured/Fixed-size). Filters are disabled and shown Off for Fixed-size.
- **History** keeps pipeline/filter setup per entry and distinguishes same-question entries by setup (task-1 deduped on question text only). Entries also store `meta`; key `gep-ask:history:v1`.
- **Error codes**: added `not_ready` (index not ingested); quota errors carry `retryAfterSecs`.
- **Example chips**: 3 sample questions + Pakistan, and a ghost chip for the unanswerable crypto question.
- Request is two-stage like task-1 (retrieval errors return plain JSON with a status, generation errors arrive as an `error` line after `sources`).
- No shadcn component added: task-1 also used only plain CSS on shadcn tokens; `button.tsx` is installed but unused. No new dependencies.
- Source payload carries the full chunk text as `content` (named `snippet` in the brief); needed for the highlight feature, about 20 KB per question.

## Proposed decision rows (D-numbers to be assigned)

| ID | Date | Area | Decision | Why / notes | Status |
|----|------|------|----------|-------------|--------|
| D-? | 2026-10-16 | Generation | Citations are the excerpt numbers in the prompt: each of the top `SEND_K` chunks is labeled `[n] <heading path> (printed p. X, PDF p. Y)` (front matter: `front matter, PDF p. Y`; fixed-size chunks: `Unlabeled passage`), and the model cites `[n]` after each claim. The UI resolves `n` to the chunk's heading path and page. Refines D-13 and plan.md's `[Chapter > Section, p. N]` form | Recommended approach (not an override). A number cannot be mistyped into a wrong section, parses reliably, and links to exactly one evidence card; the model is told never to write page/section names as citations | Active (unverified against Gemini) |
| D-? | 2026-10-16 | Generation | Exact refusal string is `Not found in the report.`, a constant in `src/lib/rag/prompt.ts` shared by the prompt, the UI refusal check (case/period tolerant) and the eval harness. Partial answers are allowed ("answer that part and say which part is not covered") because tables are not indexed (D-12) | Recommended approach (not an override). One source of truth; the pure module keeps server SDKs out of the client bundle | Active |
| D-? | 2026-10-16 | API | `POST /api/ask` body `{question, useFilters?, pipeline?: "structured"\|"fixed"}`, NDJSON events `sources` (with `meta`: pipeline, detected filters, applied filters, fallback flag, `sendK`), `text`, `done`, `error` (+`retryAfterSecs` on quota). Document picked by name via `findDocumentId` using `FIXED_DOCUMENT_NAME` / `STRUCTURED_DOCUMENT_NAME` from `config.ts`. Fixed pipeline forces filters off. Chat uses temperature 0 and a small web retry budget (3 tries, 15 s server wait) | Recommended approach (not an override). Mirrors task-1's protocol; the toggles give before/after on one question without separate deploys | Active |
| D-? | 2026-10-16 | UI | Task-1 UI kept (D-17) with: citation chips by excerpt number showing printed page; evidence cards with breadcrumb heading path, printed + PDF page, score, kind/box/region badges and a sent/not-sent marker; "Filters applied" line; Filters and Pipeline toggles in the composer; history key `gep-ask:history:v1` storing setup per entry | Recommended approach (not an override). Makes retrieval failures distinguishable from generation failures and shows the structured-vs-fixed difference in the browser | Active |
