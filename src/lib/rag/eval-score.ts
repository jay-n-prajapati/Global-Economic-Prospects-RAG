// Pure scoring for the retrieval eval (D-14): no database, no API, so it is unit-tested offline (npm run test:eval).
import type { RetrievedChunk } from "./retrieve";

// A "section" in machine-checkable form. Every field that is present must match.
// Structured chunks (heading_path set) are matched on the metadata fields; Phase 1 chunks carry no structure, so they
// are matched on `pdfPages` (inclusive [from, to] ranges; printed page + 22 = PDF page). Every spec therefore has pdfPages.
export type Spec = {
  chapter?: number;
  region?: string;
  kind?: string;
  box?: string;
  noBox?: boolean; // chunk is not a box chunk
  headingContains?: string; // substring of the heading path, e.g. " > Outlook"
  pdfPages: [number, number][];
};
export type GoldenItem = {
  id: string;
  question: string;
  tests: string;
  expected: Spec[];
  forbidden: Spec[];
  expectRefusal?: boolean;
  keyFacts?: string[];
};
export type Scorable = Pick<RetrievedChunk, "pdfPage" | "headingPath" | "chapter" | "region" | "box" | "kind">;

export function matches(chunk: Scorable, spec: Spec): boolean {
  if (chunk.headingPath === null) return spec.pdfPages.some(([a, b]) => chunk.pdfPage >= a && chunk.pdfPage <= b);
  if (spec.chapter !== undefined && chunk.chapter !== spec.chapter) return false;
  if (spec.region !== undefined && chunk.region !== spec.region) return false;
  if (spec.kind !== undefined && chunk.kind !== spec.kind) return false;
  if (spec.box !== undefined && chunk.box !== spec.box) return false;
  if (spec.noBox && chunk.box !== null) return false;
  if (spec.headingContains !== undefined && !chunk.headingPath.includes(spec.headingContains)) return false;
  return true;
}
const matchesAny = (chunk: Scorable, specs: Spec[]) => specs.some((s) => matches(chunk, s));

export type QuestionScore = {
  id: string;
  refusal: boolean; // retrieval cannot be scored (Q10): answer-level check only
  hit: boolean | null; // an expected-section chunk is in the top k
  firstRank: number | null; // 1-based rank of the first expected chunk
  mixAbove: boolean | null; // a forbidden chunk ranks above the first expected chunk (or no expected chunk but some forbidden)
  forbiddenTop5: number | null; // forbidden chunks among the top 5
  forbiddenRanks: number[]; // 1-based ranks of every forbidden chunk in the top k
};

// A chunk that is both expected and forbidden counts as expected.
export function scoreQuestion(item: GoldenItem, ranked: Scorable[], k = 10): QuestionScore {
  const top = ranked.slice(0, k);
  if (item.expectRefusal) return { id: item.id, refusal: true, hit: null, firstRank: null, mixAbove: null, forbiddenTop5: null, forbiddenRanks: [] };
  const first = top.findIndex((c) => matchesAny(c, item.expected));
  const forbiddenRanks = top.flatMap((c, i) => (!matchesAny(c, item.expected) && matchesAny(c, item.forbidden) ? [i + 1] : []));
  return {
    id: item.id,
    refusal: false,
    hit: first !== -1,
    firstRank: first === -1 ? null : first + 1,
    mixAbove: forbiddenRanks.some((r) => first === -1 || r < first + 1),
    forbiddenTop5: forbiddenRanks.filter((r) => r <= 5).length,
    forbiddenRanks,
  };
}

export type Summary = { n: number; hits: number; mrr: number; mixAbove: number; top5Forbidden: number };

export function summarize(scores: QuestionScore[]): Summary {
  const s = scores.filter((x) => !x.refusal);
  return {
    n: s.length,
    hits: s.filter((x) => x.hit).length,
    mrr: s.length ? s.reduce((a, x) => a + (x.firstRank ? 1 / x.firstRank : 0), 0) / s.length : 0,
    mixAbove: s.filter((x) => x.mixAbove).length,
    top5Forbidden: s.filter((x) => (x.forbiddenTop5 ?? 0) > 0).length,
  };
}

// One row for the "Eval scores" table in progress.md: | Run | Date | Config | hit@10 | MRR | Mix-ups | Notes |
export function markdownRow(run: string, date: string, config: string, s: Summary, notes = ""): string {
  const mix = `${s.mixAbove} above expected, ${s.top5Forbidden} with forbidden in top 5`;
  return `| ${run} | ${date} | ${config} | ${s.hits}/${s.n} | ${s.mrr.toFixed(3)} | ${mix} | ${notes} |`;
}
