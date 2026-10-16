// Phase 2 cleaning: raw PDF text items (font, size, x, y) -> clean blocks (paragraphs, headings, captions).
// Everything is decided by font + position, never by regex on the text; the only text rule is de-hyphenation.

export type RawItem = { str: string; font: string; size: number; x: number; y: number; w: number };
export type RawPage = { page: number; width: number; height: number; items: RawItem[] };

export type BlockKind = "para" | "subhead" | "heading" | "caption" | "footnote" | "opener" | "boxtitle";
export type Block = {
  kind: BlockKind;
  text: string;
  lines: string[]; // raw lines (before de-hyphenation), used to build the lexicon
  pdfPage: number;
  col: 0 | 1; // 0 = left column (or wide), 1 = right column; reading order is (page, col, -y)
  y: number; // baseline of the first line
  style: string; // heading font key, e.g. "HB15.96" (Helvetica Bold), "HR11.04" (Roman), "HC26.04" (Condensed)
  boxId: string | null; // "Box 1.1" when the block sits inside a box panel
};

export type Para = { text: string; pdfPage: number };

// Pages we clean: Executive Summary (19-20) and the four chapters (23-184). Front matter, abbreviations,
// the Statistical Appendix and back matter are out of scope (D-12).
export const CLEAN_PAGE_RANGES: [number, number][] = [[19, 20], [23, 184]];
export const COL_SPLIT = 295; // x >= 295 is the right column
const PITCH_FACTOR = 1.4; // a gap bigger than 1.4 line pitches (and a finished sentence) starts a new paragraph

export const cmpPos = (a: { pdfPage: number; col: number; y: number }, b: { pdfPage: number; col: number; y: number }) =>
  a.pdfPage - b.pdfPage || a.col - b.col || b.y - a.y;

// ---------- font classification ----------
type Cls = "drop" | "body" | "foot" | "head" | "cap" | "capsub" | "opener";

function classify(it: RawItem): Cls {
  const { font, size } = it;
  if (font.startsWith("AGaramondPro")) {
    if (size >= 25) return "opener"; // chapter number/title on the opener page
    if (size >= 10.4) return "body"; // 11.04 body, 10.56 inside boxes
    if (size >= 7.5) return "foot"; // 8.04 footnotes and author notes
    return "drop"; // 6.6 / 4.8 footnote markers, 6.24 chart panel letters
  }
  if (font.startsWith("MinionPro") && size >= 25) return "opener";
  if (font.startsWith("Helvetica")) {
    if (font === "HelveticaLTStd-Cond" && size >= 20) return "head"; // "Executive Summary"
    if (font === "HelveticaLTStd-Bold" && size >= 14) return "head"; // section / region headings
    if (font === "HelveticaLTStd-Roman" && size >= 11) return "head"; // sub-headings
    if (font.includes("Bold") && size >= 9.9 && size < 12) return "cap"; // FIGURE / TABLE / BOX titles
    if (font === "HelveticaLTStd-Obl" && size === 8.04) return "capsub"; // figure subtitle (italic)
  }
  return "drop"; // running header/footer, page numbers, chart and table text (< 9pt), math fonts
}

function dropReason(it: RawItem): string {
  if (it.font.startsWith("Helvetica")) return "Helvetica < 9pt (running header/footer, page number, chart and table text)";
  if (it.font.startsWith("AGaramondPro")) return "Garamond <= 7pt (footnote markers, chart panel letters)";
  return "other fonts (Times/Symbol math, Andes, ...)";
}

type Item = RawItem & { cls: Cls; col: 0 | 1 };
type Line = { col: 0 | 1; y: number; x: number; items: Item[]; text: string };

function groupLines(items: Item[], byCol: boolean): Line[] {
  const sorted = [...items].sort((a, b) => (byCol ? a.col - b.col : 0) || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && (!byCol || last.col === it.col) && Math.abs(last.y - it.y) <= 1.5) last.items.push(it);
    else lines.push({ col: it.col, y: it.y, x: it.x, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.x = l.items[0].x;
    if (!byCol) l.col = l.items[0].col; // wide lines take the column of their leftmost item
    l.text = l.items.map((i) => i.str).join("").replace(/\s+/g, " ").trim();
  }
  return lines.filter((l) => l.text !== "");
}

const TERMINAL = /[.!?:]["”’)\]]?$/;
const terminal = (s: string) => TERMINAL.test(s);

function medianPitch(lines: Line[], fallback: number): number {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y - lines[i].y;
    if (g > 3 && g < 20) gaps.push(g);
  }
  if (gaps.length === 0) return fallback;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

const styleKey = (font: string, size: number) =>
  `${font.includes("Cond") ? "HC" : font.includes("Bold") ? "HB" : "HR"}${size}`;

type Ctx = { pdfPage: number; boxId: string | null };
const mk = (c: Ctx, kind: BlockKind, l: Line, style = ""): Block => ({
  kind, text: "", lines: [l.text], pdfPage: c.pdfPage, col: l.col, y: l.y, style, boxId: c.boxId,
});

function bodyBlocks(lines: Line[], c: Ctx, kind: "para" | "footnote"): Block[] {
  const out: Block[] = [];
  for (const col of [0, 1] as const) {
    const ls = lines.filter((l) => l.col === col).sort((a, b) => b.y - a.y);
    const pitch = medianPitch(ls, kind === "para" ? 13.2 : 9.6);
    let cur: Block | null = null;
    let prev: Line | null = null;
    for (const l of ls) {
      // A line made only of bold or bold-italic text is a sub-sub-heading ("Downside risks"); it stays inline as
      // its own short paragraph. A bold run-in heading ("Growth. The ...") shares its line with regular text.
      const biOnly = kind === "para" && l.items.every((i) => /^AGaramondPro-Bold(Italic)?$/.test(i.font) || i.str.trim() === "");
      if (biOnly) {
        if (cur && cur.kind === "subhead" && prev && prev.y - l.y <= pitch * 1.3) cur.lines.push(l.text);
        else out.push((cur = mk(c, "subhead", l)));
      } else {
        const gap = prev ? prev.y - l.y : 0;
        if (!cur || cur.kind !== kind || (gap > pitch * PITCH_FACTOR && terminal(prev!.text))) out.push((cur = mk(c, kind, l)));
        else cur.lines.push(l.text);
      }
      prev = l;
    }
  }
  return out;
}

function headBlocks(lines: Line[], c: Ctx): Block[] {
  const out: Block[] = [];
  for (const col of [0, 1] as const) {
    let cur: Block | null = null;
    let prev: Line | null = null;
    for (const l of lines.filter((x) => x.col === col).sort((a, b) => b.y - a.y)) {
      const it = l.items.find((i) => i.str.trim() !== "")!;
      const style = styleKey(it.font, it.size);
      // Headings wrap onto several lines ("Latin America and / the Caribbean"): merge same-style neighbours.
      if (cur && prev && cur.style === style && prev.y - l.y <= it.size * 1.5) cur.lines.push(l.text);
      else out.push((cur = mk(c, c.boxId ? "subhead" : "heading", l, style)));
      prev = l;
    }
  }
  return out;
}

const CAPTION_START = /^(FIGURE|TABLE|BOX)\b/;

// Captions: bold Helvetica title lines (FIGURE/TABLE/BOX ...) plus the italic subtitle lines below them.
function captionBlocks(cap: Line[], sub: Line[], c: Ctx, orphans: string[]): Block[] {
  const out: Block[] = [];
  const all = [...cap.map((l) => ({ l, sub: false })), ...sub.map((l) => ({ l, sub: true }))].sort(
    (a, b) => a.l.col - b.l.col || b.l.y - a.l.y,
  );
  let cur: Block | null = null;
  let lastY = 0;
  let subLines: string[] = [];
  const close = () => {
    if (!cur) return;
    cur.lines = [...cur.lines, ...subLines.map((s) => `\u0001${s}`)]; // marker: subtitle line
    subLines = [];
  };
  for (const { l, sub: isSub } of all) {
    if (!isSub && CAPTION_START.test(l.text)) {
      close();
      out.push((cur = mk(c, l.text.startsWith("BOX") ? "boxtitle" : "caption", l)));
      lastY = l.y;
    } else if (cur && cur.col === l.col && lastY - l.y <= (isSub ? 20 : 14.5)) {
      if (isSub) subLines.push(l.text);
      else if (subLines.length === 0) cur.lines.push(l.text); // wrapped title line
      else orphans.push(l.text);
      lastY = l.y;
    } else orphans.push(l.text);
  }
  close();
  return out;
}

const digitHist = (s: string) => {
  const h = new Array(10).fill(0);
  for (const ch of s) if (ch >= "0" && ch <= "9") h[+ch]++;
  return h.join(",");
};

type PageResult = { blocks: Block[]; digitsIn: string; digitsOut: string };

function extractPage(raw: RawPage, boxId: string | null, drops: Record<string, number>): PageResult {
  const items: Item[] = raw.items
    .filter((i) => i.str.length > 0)
    .map((i) => ({ ...i, cls: classify(i), col: i.x >= COL_SPLIT ? 1 : 0 }));
  for (const it of items) if (it.cls === "drop" && it.str.trim()) drops[dropReason(it)] = (drops[dropReason(it)] ?? 0) + 1;
  const kept = items.filter((i) => i.cls !== "drop");

  // Box pages: the panel is on top and uses 10.56pt text; on the last page of a box the normal two-column
  // text starts below it. Everything above the first 11.04pt body line (or section heading) is the box.
  let boxTop = -Infinity;
  if (boxId) {
    const body = kept.filter(
      (i) => (i.font === "AGaramondPro-Regular" && i.size >= 11 && i.str.trim().length > 3) || (i.cls === "head" && i.size >= 14),
    );
    if (body.length) boxTop = Math.max(...body.map((i) => i.y));
  }
  const blocks: Block[] = [];
  const orphans: string[] = [];
  for (const inBox of boxId ? [true, false] : [false]) {
    const zone = kept.filter((i) => (boxId ? (i.y > boxTop + 1) === inBox : true));
    const c: Ctx = { pdfPage: raw.page, boxId: inBox ? boxId : null };
    const by = (cls: Cls) => zone.filter((i) => i.cls === cls);
    blocks.push(...bodyBlocks(groupLines(by("body"), true), c, "para"));
    blocks.push(...bodyBlocks(groupLines(by("foot"), true), c, "footnote"));
    blocks.push(...headBlocks(groupLines(by("head"), true), c));
    blocks.push(...captionBlocks(groupLines(by("cap"), false), groupLines(by("capsub"), true), c, orphans));
    const op = groupLines(by("opener"), false).sort((a, b) => b.y - a.y);
    if (op.length) blocks.push({ ...mk(c, "opener", op[0]), lines: op.map((l) => l.text), col: 0 });
  }
  // Author notes ("Note: This chapter was prepared by ...") are page furniture, not content.
  const furniture = /^Note: (This|The) (chapter|box|report|annex) (was )?(prepared|written) by/;
  const keep = blocks.filter((b) => {
    if (b.kind === "footnote" && furniture.test(b.lines.join(" "))) {
      orphans.push(...b.lines);
      return false;
    }
    return true;
  });
  const digitsIn = digitHist(kept.map((i) => i.str).join(""));
  const digitsOut = digitHist([...keep.flatMap((b) => b.lines), ...orphans].join(""));
  return { blocks: keep, digitsIn, digitsOut };
}

// ---------- boxes ----------
// A page belongs to a box when a bold 9.96pt "BOX n.m ..." title sits at the top of it.
export function detectBoxPages(pages: RawPage[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const p of pages)
    for (const i of p.items) {
      const m = /^BOX\s+(\d+\.\d+)/.exec(i.str);
      if (m && i.font === "HelveticaLTStd-Bold" && i.y > 680) map.set(p.page, `Box ${m[1]}`);
    }
  return map;
}

// ---------- de-hyphenation ----------
// Rule for a line that ends with "-" followed by a line that starts with a lowercase letter
// (a hyphen after a digit/symbol, or before a capital or digit, is always kept: "COVID-19", "2027-28", "sub-Saharan"):
//   1. the joined compound "left-right" occurs elsewhere in the report mid-line (non-linear)  -> keep hyphen
//   2. the closed word "leftright" occurs elsewhere in the report (markets)                    -> drop hyphen
//   3. the line is already a hyphen chain ("back-of-the-"), left is an acronym (AI-, U-), a common prefix
//      (re, non, pre, ...), or right is a linker (and/or/to/for/of/than/over: "food- and energy-")   -> keep (ambiguous)
//   4. left (3+ letters) and right (4+ letters) are both full words in the report              -> keep (ambiguous)
//   5. otherwise the line break split a word (geopo-litical, in-stalled)                       -> drop (ambiguous)
export type Lexicon = { words: Set<string>; compounds: Set<string> };
export type HyphenCase = { text: string; rule: number; joined: boolean };
export type HyphenStats = { lineEnd: number; keptSimple: number; byRule: number[]; cases: HyphenCase[] };
export const newHyphenStats = (): HyphenStats => ({ lineEnd: 0, keptSimple: 0, byRule: [0, 0, 0, 0, 0, 0], cases: [] });

const LINKERS = new Set(["and", "or", "to", "for", "of", "than", "over"]); // "food- and energy-", "debt-to-GDP"
const PREFIXES = new Set(["re", "non", "pre", "post", "anti", "semi", "self", "cross", "multi", "co", "quasi", "mid", "pro"]);

export function buildLexicon(blocks: Block[]): Lexicon {
  const words = new Set<string>();
  const compounds = new Set<string>();
  for (const b of blocks) {
    let prevHyphen = false;
    b.lines.forEach((line) => {
      const toks = line.split(/\s+/).map((t) => t.replace(/^[^A-Za-z]+|[^A-Za-z-]+$/g, ""));
      toks.forEach((t, i) => {
        if (i === 0 && prevHyphen) return; // second half of a split word
        if (i === toks.length - 1 && t.endsWith("-")) return; // first half of a split word
        const low = t.toLowerCase();
        if (/^[a-z]+$/.test(low)) words.add(low);
        else if (/^[a-z]+(-[a-z]+)+$/.test(low)) {
          compounds.add(low);
          low.split("-").forEach((w) => words.add(w));
        }
      });
      prevHyphen = line.endsWith("-");
    });
  }
  return { words, compounds };
}

export function joinPair(a: string, b: string, lex: Lexicon, stats?: HyphenStats): string {
  if (/[–—]$/.test(a)) return a + b; // dash at line end: no space
  if (!a.endsWith("-")) return `${a} ${b}`;
  if (stats) stats.lineEnd++;
  const left = /([A-Za-z]+)-$/.exec(a)?.[1];
  const chain = /-[A-Za-z]+-$/.test(a);
  const right = /^([a-z]+)/.exec(b)?.[1];
  if (!left || !right) {
    if (stats) stats.keptSimple++;
    return a + b;
  }
  const hyph = `${left}-${right}`.toLowerCase();
  const closed = `${left}${right}`.toLowerCase();
  const l = left.toLowerCase();
  let rule: number;
  if (lex.compounds.has(hyph)) rule = 1;
  else if (lex.words.has(closed)) rule = 2;
  else if (chain || PREFIXES.has(l) || /^[A-Z]+$/.test(left) || LINKERS.has(right)) rule = 3;
  else if (l.length >= 3 && right.length >= 4 && lex.words.has(l) && lex.words.has(right)) rule = 4;
  else rule = 5;
  const joined = rule === 2 || rule === 5;
  if (stats) {
    stats.byRule[rule]++;
    if (rule >= 3 || stats.cases.length < 12) stats.cases.push({ text: `${left}-${right}`, rule, joined });
  }
  if (joined) return a.slice(0, -1) + b;
  return right === "and" || right === "or" ? `${a} ${b}` : a + b; // suspended hyphen keeps its space
}

export function joinLines(lines: string[], lex: Lexicon, stats?: HyphenStats): string {
  return lines.reduce((acc, l, i) => (i === 0 ? l : joinPair(acc, l, lex, stats)));
}

const SUBTITLE = "\u0001";
function blockText(b: Block, lex: Lexicon, stats: HyphenStats): string {
  if (b.kind !== "caption" && b.kind !== "boxtitle") return joinLines(b.lines, lex, stats);
  const title = joinLines(b.lines.filter((l) => !l.startsWith(SUBTITLE)), lex, stats);
  const sub = b.lines.filter((l) => l.startsWith(SUBTITLE)).map((l) => l.slice(1));
  if (sub.length === 0) return title;
  return `${title}${/[.!?]$/.test(title) ? "" : "."} ${joinLines(sub, lex, stats)}`;
}

// ---------- known-facts safety check ----------
export const KNOWN_FACTS: { page: number; text: string; why: string }[] = [
  { page: 96, text: "6.3 percent", why: "South Asia outlook (printed p74)" },
  { page: 96, text: "6.6 percent", why: "India growth (printed p74)" },
  { page: 81, text: "4.2 percent", why: "East Asia and Pacific outlook (printed p59)" },
  { page: 19, text: "1.3 percent", why: "Executive Summary downside scenario" },
  { page: 19, text: "3.6 percent", why: "Executive Summary EMDE growth" },
];

export function checkKnownFacts(blocks: Block[]): string[] {
  const failures: string[] = [];
  for (const f of KNOWN_FACTS) {
    const text = blocks.filter((b) => b.pdfPage === f.page).map((b) => b.text).join(" ").replace(/\s+/g, " ");
    if (!text.includes(f.text)) failures.push(`"${f.text}" missing from PDF p${f.page} (${f.why})`);
  }
  return failures;
}

// ---------- document ----------
export type CleanResult = {
  blocks: Block[]; // all cleaned blocks, in reading order
  lexicon: Lexicon;
  hyphens: HyphenStats;
  drops: Record<string, number>; // dropped item counts by reason
  boxPages: Map<number, string>;
  issues: string[]; // digit mismatches and known-fact failures (empty when clean)
};

export function cleanDocument(rawPages: RawPage[], ranges = CLEAN_PAGE_RANGES): CleanResult {
  const boxPages = detectBoxPages(rawPages);
  const drops: Record<string, number> = {};
  const issues: string[] = [];
  const blocks: Block[] = [];
  for (const raw of rawPages) {
    if (!ranges.some(([a, b]) => raw.page >= a && raw.page <= b)) continue;
    const r = extractPage(raw, boxPages.get(raw.page) ?? null, drops);
    if (r.digitsIn !== r.digitsOut) issues.push(`PDF p${raw.page}: digit counts changed by cleaning (${r.digitsIn} -> ${r.digitsOut})`);
    blocks.push(...r.blocks);
  }
  blocks.sort(cmpPos);
  const lexicon = buildLexicon(blocks);
  const hyphens = newHyphenStats();
  for (const b of blocks) b.text = blockText(b, lexicon, hyphens);
  issues.push(...checkKnownFacts(blocks));
  return { blocks, lexicon, hyphens, drops, boxPages, issues };
}

// ---------- assembly ----------
// Turns the content blocks of one section (in reading order) into paragraphs. A paragraph that is cut by a
// column or page break is re-joined (when it did not end in a full stop, or the next piece starts lowercase).
// Captions and footnotes never interrupt a paragraph: they wait until it is finished.
export function assemble(blocks: Block[], lex: Lexicon, stats?: HyphenStats): Para[] {
  const out: Para[] = [];
  let floats: Para[] = [];
  let open: Para | null = null; // last body paragraph that may still continue
  const flush = () => {
    out.push(...floats);
    floats = [];
  };
  for (const b of blocks) {
    if (b.kind === "caption" || b.kind === "footnote") {
      const p = { text: b.kind === "footnote" ? `Footnote: ${b.text}` : b.text, pdfPage: b.pdfPage };
      (open && !terminal(open.text) ? floats : out).push(p);
    } else if (b.kind === "subhead" || b.kind === "heading") {
      flush();
      out.push({ text: b.text, pdfPage: b.pdfPage });
      open = null;
    } else if (b.kind === "para") {
      if (open && (!terminal(open.text) || /^[a-z]/.test(b.text))) {
        open.text = joinPair(open.text, b.text, lex, stats);
        if (terminal(open.text)) flush();
      } else {
        flush();
        out.push((open = { text: b.text, pdfPage: b.pdfPage }));
      }
    }
  }
  flush();
  return out;
}
