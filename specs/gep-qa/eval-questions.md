# Evaluation questions (draft)

Source: `data/GEP-Jun-2026.pdf`. Page numbers are **printed** page numbers; PDF page = printed + 22 (front matter uses roman numerals; the Executive Summary starts at PDF p19 = printed xvii).

How each question is scored (retrieval only, no chat quota):
- **Pass** = at least one chunk from the *expected section* is in the top-k (hit@k) AND no top-ranked chunk comes from a *forbidden* section.
- Also record the rank of the first correct chunk (for MRR).
- Answer-level check (a few manual reads, uses chat quota): the answer cites the expected section and states the key facts below, with no facts from the forbidden sections.

| # | Question | Tests | Expected section (printed pages) | Key facts to find | Forbidden (mix-up) |
|---|----------|-------|----------------------------------|-------------------|--------------------|
| 1 | What is the growth outlook for South Asia in this report? | Sample question; region lookalike | Ch 2 > South Asia > Outlook (p74) | SAR growth softens to 6.3% in 2026, then ~7% a year in 2027-28 | Any other region's Outlook |
| 2 | What is the growth outlook for East Asia and Pacific? | Region lookalike (same wording as Q1) | Ch 2 > East Asia and Pacific > Outlook (p59) | EAP moderates to 4.2% in 2026 from 5.0% in 2025; 4.3% in 2027-28 | South Asia, other regions |
| 3 | What growth does the report forecast for Sub-Saharan Africa in 2026, and how was it revised? | Region lookalike plus a revision detail | Ch 2 > Sub-Saharan Africa > Outlook (p77) | ~4% in 2026, revised down 0.3 pp since January; 4.4% average in 2027-28 | EAP, SAR |
| 4 | How is India's growth expected to change in fiscal year 2026/27? | Country name that must map to a region | Ch 2 > South Asia > Outlook (p74) | India moderates to 6.6% in FY2026/27 | Other regions, Table 2.10 not required |
| 5 | What does the report forecast for Pakistan's growth? | Country-to-region trap: this report groups Pakistan under Middle East, North Africa, Afghanistan, and Pakistan, NOT South Asia | Ch 2 > MNA (pp70-73) | Pakistan is covered in the MNA section. Figures sit mostly in Table 2.8 (p73), which D-12 does not index, so a partial answer or honest "not found" is acceptable | Ch 2 > South Asia |
| 6 | What does Chapter 3 say about sovereign debt in developing economies? | Sample question; chapter-level question | Chapter 3 chunks (pp85-117) | Rising EMDE government debt raises interest rates, debt-service payments and default risk; relationship is non-linear | Chapter 4 (also about government debt and fiscal policy) |
| 7 | How do commodity-exporting economies manage fiscal policy over commodity price swings? | Chapter confusion: Ch 3 vs Ch 4 | Chapter 4 chunks (pp121-157) | Fiscal positions weaker and more volatile; windfalls are spent rather than saved; fiscal rules, SWFs, councils help | Chapter 3 |
| 8 | According to the executive summary, what are the main risks to the global outlook? | Sample question; near-duplicate text (the Ch 1 summary repeats the same paragraph) | Executive Summary (PDF p19, printed xvii) | Risks skewed to the downside: renewed hostilities, commodity prices, inflation, food insecurity, financial stress; global growth could fall to 1.3% in 2026; trade policy uncertainty; upside from AI | Ch 1 summary or Ch 1 risks section ranking above the Executive Summary |
| 9 | How much could AI affect global growth, according to the report? | Box as its own unit | Box 1.1 (p8) | Near term: higher investment; medium term: productivity; wide range of estimates; optimistic scenario makes the 2030s the strongest decade since the 1970s | Ch 1 body text, Ch 3 |
| 10 | What does the report forecast for cryptocurrency prices? | Unanswerable: system must refuse | None | The report contains no such forecast; answer must say "not found in the report" | Any invented figure |

## Notes
- Q1-Q3 are the same question asked of three regions. If chunks lose their region label, these three are the ones that fail first.
- Q5 depends on D-09's country-to-region table (Pakistan -> MNA); it deliberately conflicts with the common assumption that Pakistan is in South Asia.
- Q8 is hard because the Executive Summary paragraph is nearly identical to the Ch 1 summary. Needs the "executive summary" routing rule from D-09.
- Q10 is checked at answer level only (refusal), since retrieval always returns something.
- Facts above were read from the PDF text during design; verify against the page when the harness is built.
