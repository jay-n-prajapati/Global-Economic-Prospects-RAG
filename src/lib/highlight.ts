import type { AskSource } from "./ask-protocol";
import { boldTerms, plainAnswer } from "./citations";

// The model cites excerpt numbers, not sentences, so which sentence it used is unknown. Heuristic: mark spans of each excerpt that
// share a 3-word run, a number, or a bold key term with the answer. It shows wording overlap, not proof of use.

export type Range = [start: number, end: number];

const STOP = new Set(
  "the a an of in on at to and or for by with from is was were be as that this it its which are has have had not also than then".split(
    " ",
  ),
);
const TOKEN = /[\p{L}\p{N}$][\p{L}\p{N}$.,'’%-]*/gu;
const HAS_DIGIT = /\d/;

type Token = { w: string; start: number; end: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const word = m[0].replace(/[.,'’-]+$/, "");
    const start = m.index ?? 0;
    tokens.push({ w: word.toLowerCase().replace(/’/g, "'"), start, end: start + word.length });
  }
  return tokens;
}

const isFiller = (w: string) => STOP.has(w) && !HAS_DIGIT.test(w);

export function computeHighlights(answer: string, sources: readonly AskSource[]): Map<number, Range[]> {
  const result = new Map<number, Range[]>();
  const answerTokens = tokenize(plainAnswer(answer, false));
  if (answerTokens.length === 0) return result;

  const trigrams = new Set<string>();
  for (let i = 0; i + 2 < answerTokens.length; i++) {
    const run = [answerTokens[i].w, answerTokens[i + 1].w, answerTokens[i + 2].w];
    if (run.some((w) => !STOP.has(w))) trigrams.add(run.join(" "));
  }
  const numbers = new Set(answerTokens.filter((t) => HAS_DIGIT.test(t.w)).map((t) => t.w));
  const keyTerms = new Set<string>();
  for (const term of boldTerms(answer)) for (const t of tokenize(term)) if (!STOP.has(t.w)) keyTerms.add(t.w);

  for (const source of sources) {
    const tokens = tokenize(source.content);
    const flagged = new Array<boolean>(tokens.length).fill(false);
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (trigrams.has(`${tokens[i].w} ${tokens[i + 1].w} ${tokens[i + 2].w}`)) flagged[i] = flagged[i + 1] = flagged[i + 2] = true;
    }
    tokens.forEach((t, i) => {
      if (numbers.has(t.w) || keyTerms.has(t.w)) flagged[i] = true;
    });

    const ranges: Range[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (!flagged[i]) continue;
      let j = i;
      while (j + 1 < tokens.length && flagged[j + 1]) j++;
      let a = i;
      let b = j;
      while (a <= b && isFiller(tokens[a].w)) a++;
      while (b >= a && isFiller(tokens[b].w)) b--;
      if (a <= b) ranges.push([tokens[a].start, tokens[b].end]);
      i = j;
    }
    if (ranges.length) result.set(source.id, ranges);
  }
  return result;
}

export type Segment = { text: string; mark: boolean };

export function segments(text: string, ranges: readonly Range[] | undefined): Segment[] {
  if (!ranges?.length) return [{ text, mark: false }];
  const out: Segment[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start > pos) out.push({ text: text.slice(pos, start), mark: false });
    out.push({ text: text.slice(start, end), mark: true });
    pos = end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), mark: false });
  return out;
}
