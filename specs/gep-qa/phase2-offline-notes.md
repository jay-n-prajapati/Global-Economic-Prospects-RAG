# Phase 2 offline notes (structure-aware ingestion, built without DB or Gemini)

Status: code built and checked on the Phase 0 dump (`.scratch/dump/`). Nothing was embedded, stored or changed in the database; the Phase 1 `chunks` table is untouched so the Phase 1 baseline can still be run against it. Decisions: D-22 to D-25 in `specs/decisions.md`.

## How to run
- `npm run inspect:structure`: clean -> structure -> chunk on the dump. Prints the section tree, validator result, hyphenation stats, chunk counts/sizes, three sample chunks, and writes `.scratch/phase2/sections.json` and `chunks.json`. Exit code is non-zero if the validator, the digit check or the known-facts check fails.
- `npm run test:route`: 46 assert-based router cases (the 10 eval questions plus edge cases).
- If `.scratch/dump/` is missing: `npm run dump:pdf` first.

## What each module does (plain language)
1. `clean.ts`: PDF text arrives as thousands of small pieces, each with a font, size and x/y position. Cleaning decides what each piece is by font and position, never by guessing from the words. Body text (Garamond 11.04, boxed 10.56) is kept; headings (Helvetica Bold/Roman, 11pt and up) become heading blocks; "FIGURE/TABLE/BOX" titles and the italic subtitle under a figure title become caption blocks; everything else in Helvetica (running header with the glued page number, chart axis labels, table cells, source notes) is dropped because all of it is under 9pt. Lines are grouped per column (reading order = page, left column, right column, top to bottom), re-flowed into paragraphs (a bigger-than-normal gap after a finished sentence starts a new paragraph), and paragraphs cut by a column or page break are re-joined. Captions and footnotes never break a paragraph in the middle; they wait until it ends.
2. `structure.ts`: builds the table of contents tree. The printed TOC (PDF p9-14) tells us which headings must exist; fonts tell us exactly where they are; bookmarks are only compared at the end. Headings are looked up in document order, so "Recent developments" and "Outlook" (which repeat in every region) match the right region by position, not by text. Output is a list of section nodes with kind, title, heading path, chapter, region, box, page range (PDF and printed) and the text blocks that belong to each node.
3. `chunk-sections.ts`: cuts each section's text into chunks without ever crossing a heading. Short sections stay as one chunk; long ones are split into equal pieces at sentence boundaries with the last sentence of the previous piece repeated as overlap. Each chunk carries `headingPath`, chapter, region, box, kind, PDF page, printed page and `embedText` (= heading path + newline + content, D-08).
4. `route.ts` + `regions.ts`: question -> `{chapter?, region?, kind?, box?}` by regex and a country-to-region table built from the report's own regional tables (Tables 2.2-2.12). Pakistan and Afghanistan map to the Middle East/North Africa region, not South Asia, as in this report.
5. `dump.ts`: tiny reader for the Phase 0 dump.

## Rules I chose, and why
- Keep captions, drop table bodies and chart text (D-12). Figure subtitles (italic 8.04pt, one or two sentences that state the chart's message) are kept as part of the caption: they are prose and often the only place a chart's conclusion is written.
- Footnote markers (the small raised digits) are dropped so they do not glue onto words ("rate1"); the footnote text is kept as a `Footnote: ...` paragraph. Author notes ("Note: This chapter was prepared by ...") are dropped. This is the only place digits are removed, and only marker digits. A per-page digit histogram (kept items vs output) passes on all 164 cleaned pages, so no digit was lost or changed by grouping or joining.
- Known-facts check (fails loudly): "6.3 percent" and "6.6 percent" on PDF p96 (South Asia), "4.2 percent" PDF p81 (EAP), "1.3 percent" and "3.6 percent" PDF p19 (Executive Summary). Note these facts are split across lines in the raw text ("6.3\npercent"), the check is whitespace-normalized.
- Box handling: boxes sit on full-page shaded panels; on a box's last page the normal two-column text starts below the panel (Box 1.1 on PDF 35, 1.2 on 50, 3.1 on 119; Box 2.1 ends exactly at the end of PDF 80). Everything above the first 11.04pt body line or section heading is the box. So the section that the box interrupts (for example "Summary", PDF 25-35) continues around the box and the box is its own unit; their page ranges overlap on purpose.
- Executive Summary (PDF 19-20) and chapters (PDF 23-184) are cleaned; front matter, Abbreviations, the Statistical Appendix and back matter are not (D-12). References sections are in the tree but not chunked.
- Chunk size: up to 1800 chars of new text (~450 tokens) plus up to ~200 chars overlap, so chunks stay at or just over 500 tokens at most. Tiny sections are not merged with anything (that would cross a heading): the shortest chunk is 492 chars.

### De-hyphenation rule (line ends with "-", next line starts with a lowercase letter)
Anything else is kept as is (after a digit or symbol, before a capital or digit: "2027-28", "COVID-19", "sub-Saharan"). Then, in order:
1. the compound `left-right` already occurs elsewhere in the report mid-line (e.g. non-linear): keep the hyphen
2. the closed word `leftright` occurs elsewhere in the report (e.g. markets): drop the hyphen
3. the line is already a hyphen chain (back-of-the-), left is an acronym (AI-, U-), left is a common prefix (re, non, pre, ...), or right is a linker word (and/or/to/for/of/than/over): keep the hyphen; "food-" + "and" keeps a space ("food- and energy-intensity")
4. left (3+ letters) and right (4+ letters) are both words found in the report: keep the hyphen (guess: a compound)
5. otherwise the line break split a word: drop the hyphen (guess)

Stats on the dump: 650 line-end hyphens; 500 joined (466 by rule 2, 34 by rule 5), 150 kept (89 rule 1, 29 rule 3, 14 rule 4, 18 digit/capital/symbol cases). 77 decisions were guesses (rules 3-5). Rule 5 guesses were nearly all right when read by eye (organiza-tional, malnu-trition, stu-dents, ...); wrong or doubtful ones: `customer-support`, `labor-augmenting`, `fear-driven`, `over-emphasized`, `debt-to`/`debt-for`/`trough-to` in a longer hyphen chain, `U-shaped`, which are joined without their hyphen ("customersupport"). They are rare and do not affect numbers; embeddings are tolerant of this. The full list is printed by `inspect:structure`.

## Validator result (on the dump)
RESULT: OK, 0 errors.
- Expected headings: 86 TOC entries (22 + 22 + 17 + 21 sections/sub-sections/References, plus 4 chapter titles) + 5 annexes + 4 boxes + Executive Summary = 96. All 96 found; 0 not found. Every heading was on exactly the TOC page (printed + 22). Parsed TOC also has 7 front/back-matter rows (Acknowledgments, Foreword, Executive Summary, Abbreviations, Statistical Appendix, Data and Forecast Conventions, Selected Topics): only the Executive Summary is located, the others are out of scope. I could not reproduce Phase 0's "86 of 92" count; with wrapped rows merged, annexes/boxes added and the alias below, nothing is missing.
- All 71 figure/table list rows in the TOC match a caption block on the right page (0 not found).
- Bookmark disagreements printed: "South Asia" says PDF 95 but the heading is on PDF 96; "Europe and Central Asia" (PDF 84) is listed after Latin America (PDF 88). No other disagreement (chapters, boxes, Executive Summary, regions, Statistical Annex all match).
- Every region has Recent developments and Outlook; no overlapping ranges; no empty sections.
- 7 heading-styled lines that are not in the TOC stay inline as text (Annex 3.1/3.2 sub-headings such as "Linear models").

### Hard TOC cases and how they were handled
- "Regional developments" (TOC p49): the PDF heading on PDF 71 is "Recent developments" (Helvetica Bold 14.04). Handled with an explicit alias (reported as a warning). Its heading path is `Chapter 2 (Regional Outlooks) > Overview > Recent developments`. The chapter intro paragraphs above that heading (PDF 71 top) form a separate unit `Chapter 2`.
- Wrapped TOC entries ("Effectiveness of policy frameworks in mitigating the impact of commodity / price shocks", and the Chapter 3/4 titles): rows with no dot leader are merged with the next row at the same x. Wrapped figure/table list rows likewise.
- "Recent developments"/"Outlook" under every region: matched by order after the region heading.
- Hierarchy (section vs sub-section) comes from TOC indentation per chapter and page, because x differs per page (175, 178.3, 177.5, 176.2).
- Chapter labels ("Chapter 2" sits left of the title, and repeats at the top of the next page): only the first occurrence of each is used.
- Chapter 3/4 opener wording differs from TOC only by punctuation; compared after normalization, so no bookmark fallback was needed.
- Annexes were not in the chapter TOC rows (they are in the "Annexes" list); added to each chapter's expected list by page. Annex 4.1 and 4.2 sit side by side on PDF 176 and are separated by column.

## Output numbers (from `inspect:structure`)
- Total expected chunks: **290** (Phase 1 had 582). Executive Summary 4, Chapter 1: 86, Chapter 2: 53, Chapter 3: 65, Chapter 4: 82. Regions: EAP 5, ECA 5, LAC 5, MNA 5, SAR 6, SSA 5. Boxes: 1.1 = 11, 1.2 = 13, 2.1 = 10, 3.1 = 9.
- Size: min 492, p10 1122, median 1706, mean 1604, p90 1916, max 2018 chars (~427 median, ~505 max tokens). 19 chunks under 1000 chars; none under 300; 3 over 2000 (overlap included).
- Dropped items: 8474 Helvetica items < 9pt, 127 Garamond <= 7pt (footnote markers, chart letters, equation subscripts), 159 other fonts (math symbols).

## Safe Phase 2 ingest (not written on purpose)
No `ingest-structured` script exists yet, because the existing `scripts/ingest.mts` wipes and replaces `chunks` when its config hash changes and `ask.ts` retrieves from all rows. Plan:
1. First, after the quota resets: run the Phase 1 baseline (`npm run ingest` to finish the last 22 chunks, then the 10 questions with `--retrieval-only` plus the few chat calls) and save the output to a file.
2. Then write the Phase 2 ingest to put chunks under a second `documents` row (for example name "<DOCUMENT_NAME> (phase 2)"). The `chunks` table already has the nullable structure columns (`heading_path`, `chapter`, `region`, `box`, `kind`, `embed_text`), so no migration is needed; Phase 1 rows stay queryable. Store `content` clean, embed `embed_text`, `chunkIndex` = chunk index (unique with `pdfPage`), `chapter` as text ("2"), `contentHash` of the embed text, region/box as in the chunk object. Keep the D-18 resume logic (skip chunks whose stored hash matches) scoped to that document row only; add a `--force` that deletes only that row's chunks.
3. Retrieval (Phase 3) must filter by document id so Phase 1 and Phase 2 do not mix; the eval harness can then run both pipelines on the same questions. Do not change `ask.ts` until the baseline has been recorded.
4. A new table or a `pipeline` column are alternatives; the second document row is the smallest change (no migration, no change to Phase 1 code paths except one filter later).

Quota budget: 290 chunks at ~100 texts/min is about 3 minutes of embedding, versus the ~560 chunk headroom seen in Phase 1: well inside one day, leaving ~270 spare for the 22 missing Phase 1 chunks and for query embeddings (1 per question, 10 per eval run, so ~10 eval runs of headroom).

## Known limitations
- Paragraph breaks come from line gaps; a paragraph that happens to end a column exactly with a full stop followed by a lowercase-starting next piece would be joined, and a break inside a paragraph at a full stop plus an unusually large gap (chart in the middle) would be kept as two paragraphs. Neither affects words or numbers.
- Equations in Annexes 3.1-3.2 and 4.1-4.3 lose their math-font fragments, so those chunks have gaps where formulas were.
- Figure panels inside boxes have letter labels and footnote lines that become `Footnote:` paragraphs (Box 3.1 notes a-f, the "Senegal" label).
- The Chapter 1 abstract (PDF 25 top) is near-identical to the Executive Summary text; Q8 relies on the router's `exec_summary` filter.

## Answers to the open questions (D-26 to D-30)
1. Chapter-intro text is kept and labeled `Chapter N (Topic) > Overview` (D-27). I applied it to all four chapters (Ch3 p109 and Ch4 p145 also have an abstract).
2. The Ch2 overview heading is shown as `Chapter 2 (Regional Outlooks) > Overview > Recent developments` (page wording, Overview prefix so it cannot collide with the regions' own "Recent developments"). Outlook and Risks of that overview sit under Overview too (D-30).
3. Chapter topics are in every path: `Chapter 1 (Global Outlook)`, `Chapter 2 (Regional Outlooks)`, `Chapter 3 (Sovereign Debt)`, `Chapter 4 (Fiscal Policy)` (D-28); the executive summary stays `Executive Summary`.
4. Storage: second `documents` row in the same `chunks` table (D-26).
5. Router unchanged: bare Middle East / Europe / Africa / Asia never filter (D-29).
6. Footnotes stay as `Footnote:` paragraphs (D-29).

Sample paths after the change: `Executive Summary`; `Chapter 1 (Global Outlook) > Overview`; `Chapter 2 (Regional Outlooks) > Overview > Recent developments`; `Chapter 2 (Regional Outlooks) > South Asia > Outlook`.
