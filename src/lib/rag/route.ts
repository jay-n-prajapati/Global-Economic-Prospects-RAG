// Question router (D-09): regex rules + a country-to-region table. Pure and free (no LLM call).
// Filters are applied ONLY on explicit matches, because a wrong filter hides the right answer.
import { CASE_SENSITIVE_COUNTRIES, COUNTRY_REGION, REGION_ABBREVIATIONS, REGION_PHRASES, regionByKey } from "./regions";

export type Route = { chapter?: number; region?: string; kind?: "exec_summary"; box?: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (name: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, `u${flags}`);

// "Hong Kong SAR" is a country-level entity, not the South Asia region abbreviation: remove it first.
const IGNORED = ["Hong Kong SAR", "Macao SAR"].map((n) => word(n, "gi"));
const PHRASES = [...REGION_PHRASES].sort((a, b) => b[0].length - a[0].length).map(([n, k]) => [word(n, "gi"), k] as const);
const ABBREVIATIONS = Object.entries(REGION_ABBREVIATIONS).map(([a, k]) => [word(a, "g"), k] as const);
const COUNTRIES = COUNTRY_REGION.map(([n, k]) => [word(n, CASE_SENSITIVE_COUNTRIES.has(n) ? "g" : "gi"), k] as const);

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

// Region keys named in the question. Matched spans are blanked out so "Sub-Saharan Africa" is not re-read as
// "Africa", "Papua New Guinea" not as "Guinea", "Hong Kong SAR" not as SAR.
function regionKeys(question: string): Set<string> {
  let text = question;
  const keys = new Set<string>();
  for (const re of IGNORED) text = text.replace(re, " ");
  for (const group of [PHRASES, ABBREVIATIONS, COUNTRIES])
    for (const [re, key] of group)
      text = text.replace(re, () => {
        keys.add(key);
        return " ";
      });
  return keys;
}

export function routeQuestion(question: string): Route {
  const execSummary = /\bexecutive\s+summary\b/i.test(question);
  const chapters = new Set<number>();
  for (const m of question.matchAll(/\bchapter\s+(one|two|three|four|[1-4])\b/gi)) {
    const v = m[1].toLowerCase();
    chapters.add(NUMBER_WORDS[v] ?? +v);
  }
  const box = /\bbox\s+([1-4]\.\d{1,2})\b/i.exec(question)?.[1];
  const keys = regionKeys(question);

  // An explicit box wins: boxes have no region and belong to one chapter.
  if (box) return { box: `Box ${box}` };
  // Two scopes that do not fit together (executive summary + a chapter): do not filter at all.
  if (execSummary && chapters.size > 0) return {};
  if (execSummary) return { kind: "exec_summary" }; // exec-summary chunks have no region, so a region is dropped

  const route: Route = {};
  if (chapters.size === 1) route.chapter = [...chapters][0];
  if (keys.size === 1) {
    // Regions only exist inside Chapter 2: a region plus another chapter would filter to nothing.
    if (route.chapter === undefined || route.chapter === 2) route.region = regionByKey([...keys][0])!;
  }
  return route;
}
