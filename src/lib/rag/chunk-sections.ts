// Phase 2 chunking (D-07): section-bounded chunks. A chunk never crosses a heading; long sections are split at
// sentence boundaries into pieces of about the same size, with a short overlap taken from the previous piece
// (inside the same section only). Boxes and regions are their own units because each is its own section node.
import { assemble, type HyphenStats, type Lexicon } from "./clean";
import {
  SECTION_CHUNK_MAX_CHARS, SECTION_CHUNK_MIN_TAIL_CHARS, SECTION_CHUNK_OVERLAP_CHARS, SECTION_CHUNK_PIECE_CHARS,
} from "./config";
import type { Kind, SectionNode } from "./structure";

export type SectionChunk = {
  index: number; // 0-based over the whole document
  sectionId: number; // SectionNode.id
  part: number; // 1-based piece number inside the section
  parts: number;
  headingPath: string;
  chapter: number | null;
  region: string | null;
  box: string | null;
  kind: Kind;
  pdfPage: number; // page where the new (non-overlap) text starts
  printedPage: number | null; // arabic printed page (null for the Executive Summary, see printedLabel)
  printedLabel: string | null; // "74" or "xvii"
  content: string; // clean text, no heading
  embedText: string; // headingPath + "\n" + content (D-08)
};

type Unit = { text: string; pdfPage: number; newPara: boolean };

// Sentence boundary: end punctuation (optionally closed by a quote/bracket), a space, then a capital, digit or opener.
const SENTENCE_END = /(?<=[.!?]["”’)]?)\s+(?=[A-Z0-9“"(])/;

function toUnits(paras: { text: string; pdfPage: number }[]): Unit[] {
  const units: Unit[] = [];
  for (const p of paras)
    p.text.split(SENTENCE_END).forEach((s, i) => units.push({ text: s, pdfPage: p.pdfPage, newPara: i === 0 }));
  return units;
}

function render(units: Unit[]): string {
  return units.reduce((acc, u, i) => (i === 0 ? u.text : `${acc}${u.newPara ? "\n\n" : " "}${u.text}`), "");
}

// Split into pieces of roughly equal size (never more than PIECE chars of new text), cutting between sentences.
function splitUnits(units: Unit[]): Unit[][] {
  const total = render(units).length;
  if (total <= SECTION_CHUNK_MAX_CHARS) return [units];
  const n = Math.ceil(total / SECTION_CHUNK_PIECE_CHARS);
  const target = total / n;
  const pieces: Unit[][] = [];
  let cur: Unit[] = [];
  let len = 0;
  for (const u of units) {
    if (cur.length && (len + u.text.length > SECTION_CHUNK_PIECE_CHARS || len >= target)) {
      pieces.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(u);
    len += u.text.length + 1;
  }
  if (cur.length) pieces.push(cur);
  // a tiny last piece takes sentences from the end of the previous piece, so no chunk is a stub
  const last = pieces[pieces.length - 1];
  const prev = pieces[pieces.length - 2];
  while (prev && prev.length > 1 && render(last).length < SECTION_CHUNK_MIN_TAIL_CHARS && render(prev.slice(0, -1)).length >= SECTION_CHUNK_MIN_TAIL_CHARS * 2)
    last.unshift(prev.pop()!);
  return pieces;
}

// Last whole sentences of the previous piece, up to ~OVERLAP chars (one sentence of up to 1.3x is allowed).
function overlapOf(piece: Unit[]): Unit[] {
  const out: Unit[] = [];
  let len = 0;
  for (let i = piece.length - 1; i >= 0; i--) {
    const l = piece[i].text.length;
    if (len + l > SECTION_CHUNK_OVERLAP_CHARS * (out.length ? 1 : 1.3)) break;
    out.unshift(piece[i]);
    len += l + 1;
  }
  return out;
}

export function chunkSections(sections: SectionNode[], lex: Lexicon, stats?: HyphenStats): SectionChunk[] {
  const chunks: SectionChunk[] = [];
  for (const s of sections) {
    if (!s.indexed || s.blocks.length === 0) continue;
    const paras = assemble(s.blocks, lex, stats);
    if (paras.length === 0) continue;
    const pieces = splitUnits(toUnits(paras));
    pieces.forEach((piece, k) => {
      const over = k > 0 ? overlapOf(pieces[k - 1]) : [];
      // the overlap is the tail of the previous piece, so the new text continues straight after it
      const content = render([...over, ...piece].map((u, i) => (over.length > 0 && i === over.length ? { ...u, newPara: false } : u)));
      const pdfPage = piece[0].pdfPage;
      chunks.push({
        index: chunks.length, sectionId: s.id, part: k + 1, parts: pieces.length, headingPath: s.headingPath,
        chapter: s.chapter, region: s.region, box: s.box, kind: s.kind, pdfPage,
        printedPage: pdfPage > 22 ? pdfPage - 22 : null, printedLabel: pdfPage > 22 ? String(pdfPage - 22) : romanOf(pdfPage),
        content, embedText: `${s.headingPath}\n${content}`,
      });
    });
  }
  assertSectionBounded(sections, chunks);
  return chunks;
}

const romanOf = (pdfPage: number) => (pdfPage >= 3 && pdfPage <= 22 ? ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"][pdfPage - 2] : null);

// Every chunk belongs to exactly one section, its page lies inside that section's page range, and the chunks of a
// section are consecutive. Throws (loudly) otherwise.
export function assertSectionBounded(sections: SectionNode[], chunks: SectionChunk[]): void {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const seen = new Set<number>();
  let prev = -1;
  for (const c of chunks) {
    const s = byId.get(c.sectionId);
    if (!s) throw new Error(`chunk ${c.index} has no section`);
    if (c.pdfPage < s.pdfPageStart || c.pdfPage > s.pdfPageEnd) throw new Error(`chunk ${c.index} (PDF p${c.pdfPage}) is outside "${s.headingPath}" (p${s.pdfPageStart}-${s.pdfPageEnd})`);
    if (c.headingPath !== s.headingPath || c.chapter !== s.chapter || c.region !== s.region || c.box !== s.box) throw new Error(`chunk ${c.index} metadata differs from its section`);
    if (c.sectionId !== prev) {
      if (seen.has(c.sectionId)) throw new Error(`chunks of "${s.headingPath}" are not consecutive`);
      seen.add(c.sectionId);
      prev = c.sectionId;
    }
  }
}
