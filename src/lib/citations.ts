// The model cites excerpt numbers: "[1]", "[2][3]", "[1, 2]". Number n is the n-th retrieved source (its rank).
const CITATION = /\[(\d{1,2}(?:\s*(?:,|;|and|&|–|-)\s*\d{1,2})*)\]/gi;
const DIGITS = /\d+/g;
const BOLD = /\*\*([^*]+)\*\*/g;

export type Part = { text: string } | { refs: number[] };

function expand(group: string): number[] {
  const refs: number[] = [];
  const nums = [...group.matchAll(DIGITS)].map((d) => Number(d[0]));
  if (/[–-]/.test(group) && nums.length === 2 && nums[0] < nums[1]) {
    for (let n = nums[0]; n <= nums[1]; n++) refs.push(n);
  } else refs.push(...nums);
  return refs;
}

// Adjacent citations ("[1][3]", "[1] [3]") become one part so they render as one group of chips.
export function parseCitations(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION)) {
    const start = m.index ?? 0;
    const between = text.slice(last, start);
    const prev = parts[parts.length - 1];
    if (prev && "refs" in prev && between.trim() === "") {
      prev.refs.push(...expand(m[1]));
    } else {
      if (between) parts.push({ text: between });
      parts.push({ refs: expand(m[1]) });
    }
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function citedRefs(text: string): Set<number> {
  const refs = new Set<number>();
  for (const m of text.matchAll(CITATION)) for (const n of expand(m[1])) refs.add(n);
  return refs;
}

// The model sometimes answers with light markdown ("* " bullets, **bold**) despite the plain-text prompt.
// Plain text for highlighting (no citations) and for copying (citations kept).
export function plainAnswer(text: string, keepCitations: boolean): string {
  const noCitations = keepCitations ? text : text.replace(CITATION, "");
  return noCitations
    .replace(BOLD, "$1")
    .replace(/^\*\s+/gm, "- ")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
}

export function boldTerms(text: string): string[] {
  return [...text.matchAll(BOLD)].map((m) => m[1]);
}
