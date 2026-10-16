// Phase 2 structure (D-06): the printed table of contents says which headings must exist, fonts + position say
// where they are, bookmarks are only a cross-check, and a validator fails loudly when anything disagrees.
import { PRINTED_PAGE_OFFSET } from "./config";
import { cmpPos, type Block, type RawPage } from "./clean";
import type { OutlineNode } from "./dump";
import { REGIONS } from "./regions";

export type Kind = "exec_summary" | "chapter" | "section" | "subsection" | "box" | "region";

export type SectionNode = {
  id: number;
  kind: Kind;
  title: string; // TOC wording (the heading in the PDF may differ, see `found`)
  headingPath: string; // "Chapter 2 > South Asia > Outlook"
  chapter: number | null;
  region: string | null; // one of the six region names, exactly as in the report
  box: string | null; // "Box 1.1"
  level: number; // 0 = exec summary / chapter / box, 1 = section / region, 2 = sub-section
  parent: number | null;
  indexed: boolean; // false for References
  tocPage: string | null; // printed page in the TOC
  pdfPageStart: number;
  pdfPageEnd: number; // last page that carries text of this unit
  printedStart: string | null; // "74", or "xvii" in the front matter
  printedEnd: string | null;
  start: { pdfPage: number; col: number; y: number }; // where the heading sits on the page
  found: string; // heading text as printed in the PDF, with its font key
  blocks: Block[]; // runtime only (not written to sections.json)
};

// ---------- page numbers ----------
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanValue(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    total += v < (ROMAN[s[i + 1]] ?? 0) ? -v : v;
  }
  return total;
}
function toRoman(n: number): string {
  let out = "";
  for (const [v, s] of [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]] as [number, string][])
    while (n >= v) {
      out += s;
      n -= v;
    }
  return out;
}
// printed "74" -> PDF 96; roman "xvii" -> PDF 19 (i = PDF 3)
export const printedToPdf = (printed: string) => (/^\d+$/.test(printed) ? +printed + PRINTED_PAGE_OFFSET : romanValue(printed) + 2);
export function pdfToPrinted(pdfPage: number): string | null {
  if (pdfPage > PRINTED_PAGE_OFFSET) return String(pdfPage - PRINTED_PAGE_OFFSET);
  if (pdfPage >= 3) return toRoman(pdfPage - 2);
  return null;
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// ---------- printed TOC (PDF pages 9-14), parsed by x/y ----------
export type TocEntry = { chapter: number; level: 0 | 1 | 2; title: string; printed: string; pdfPage: number; bold: boolean };
export type TocListRow = { list: string; id: string; title: string; printed: string; pdfPage: number };
export type TocFront = { title: string; printed: string; pdfPage: number };
export type Toc = { entries: TocEntry[]; front: TocFront[]; lists: TocListRow[] };

type Row = { page: number; y: number; items: RawPage["items"]; text: string };
const DOTS = /^(.*?)\s*\.{3,}\s*(\d+|[ivxl]+)\s*$/;
const ID = /^[AB]?\d+\.\d+(\.\d+)?$/;
const LIST_LABELS = new Set(["Annexes", "Boxes", "Figures", "Tables"]);

type Label = { n: number; page: number; y: number };

function tocRows(pages: RawPage[], labelsOut: Label[]): Row[] {
  const rows: Row[] = [];
  for (const p of pages.filter((p) => p.page >= 9 && p.page <= 14)) {
    // "Chapter N" labels sit at x<150 on the same line as the chapter title (or repeat at the top of a page)
    const labelItems = p.items.filter((i) => i.x < 150 && /^Chapter \d$/.test(i.str.trim()));
    for (const l of labelItems) labelsOut.push({ n: +l.str.trim().slice(-1), page: p.page, y: l.y });
    const items = p.items.filter((i) => i.size < 20 && i.str.trim() !== "" && !labelItems.includes(i) && !(i.font === "HelveticaLTStd-Bold" && i.size === 8.04));
    for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const last = rows[rows.length - 1];
      if (last && last.page === p.page && Math.abs(last.y - it.y) <= 1.5) last.items.push(it);
      else rows.push({ page: p.page, y: it.y, items: [it], text: "" });
    }
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = r.items.map((i) => i.str).join("").replace(/\s+/g, " ").trim();
  }
  return rows;
}

export function parseToc(pages: RawPage[]): Toc {
  const allLabels: Label[] = [];
  const rows = tocRows(pages, allLabels);
  const entries: TocEntry[] = [];
  const front: TocFront[] = [];
  const lists: TocListRow[] = [];

  // Real labels: the first occurrence of each N (later ones are page-top continuation labels).
  const labels = allLabels.filter((l, i) => allLabels.findIndex((x) => x.n === l.n) === i);

  type Cand = { row: Row; chapter: number; title: boolean };
  const chapterRows: Cand[] = [];
  let chapter = 0;
  let list = "";
  const listRaw: { list: string; id: string; raw: string }[] = [];
  for (const r of rows) {
    const x0 = r.items[0].x;
    const idItem = r.items.find((i) => i.x >= 170 && i.x < 182 && ID.test(i.str.trim()));
    const label = r.items.find((i) => LIST_LABELS.has(i.str.trim()));
    if (label) list = label.str.trim();
    if (idItem) {
      // Annex / Box / Figure / Table list row: id at x~176, title at x>=220 (may wrap onto the next row)
      const title = r.items.filter((i) => i.x >= 220).map((i) => i.str).join("");
      listRaw.push({ list, id: idItem.str.trim(), raw: title });
      continue;
    }
    if (x0 >= 200) {
      if (listRaw.length) listRaw[listRaw.length - 1].raw += ` ${r.text}`; // wrapped list title
      continue;
    }
    if (x0 < 150) {
      const m = DOTS.exec(r.text);
      if (m) front.push({ title: m[1].trim(), printed: m[2], pdfPage: printedToPdf(m[2]) });
      continue;
    }
    const lab = labels.find((l) => l.page === r.page && Math.abs(l.y - r.y) < 3);
    if (lab) chapter = lab.n;
    chapterRows.push({ row: r, chapter, title: !!lab });
  }

  // Entries wrap onto a second row ("Effectiveness of ... mitigating the impact of commodity / price shocks ... 140").
  const merged: { cand: Cand; text: string; x: number }[] = [];
  for (let i = 0; i < chapterRows.length; i++) {
    const c = chapterRows[i];
    let text = c.row.text;
    if (!DOTS.test(text)) {
      const n = chapterRows[i + 1];
      if (n && n.row.page === c.row.page && c.row.y - n.row.y <= 14.5 && Math.abs(n.row.items[0].x - c.row.items[0].x) < 1) {
        text = `${text} ${n.row.text}`;
        i++;
      }
    }
    merged.push({ cand: c, text, x: c.row.items[0].x });
  }

  // Indent: per (chapter, page) the left-most entry is level 1, anything >8pt further right is level 2.
  const base = new Map<string, number>();
  for (const m of merged.filter((m) => !m.cand.title)) {
    const k = `${m.cand.chapter}:${m.cand.row.page}`;
    base.set(k, Math.min(base.get(k) ?? Infinity, m.x));
  }
  for (const m of merged) {
    const d = DOTS.exec(m.text);
    if (!d) continue;
    const level = m.cand.title ? 0 : m.x - base.get(`${m.cand.chapter}:${m.cand.row.page}`)! > 8 ? 2 : 1;
    entries.push({
      chapter: m.cand.chapter, level, title: d[1].trim(), printed: d[2], pdfPage: printedToPdf(d[2]),
      bold: m.cand.row.items[0].font.includes("Bold"),
    });
  }
  for (const l of listRaw) {
    const m = DOTS.exec(l.raw.replace(/\s+/g, " ").trim());
    if (m) lists.push({ list: l.list, id: l.id, title: m[1].trim(), printed: m[2], pdfPage: printedToPdf(m[2]) });
  }
  return { entries, front, lists };
}

// ---------- bookmarks (cross-check only) ----------
export type BookmarkFlat = { title: string; pdfPage: number | null };
export function flattenOutline(nodes: OutlineNode[]): BookmarkFlat[] {
  const out: BookmarkFlat[] = [];
  const walk = (ns: OutlineNode[]) => ns.forEach((n) => (out.push({ title: n.title.replace(/\s*\r?\n\s*/g, " ").replace(/\s*--\s*/g, " ").replace(/\s+/g, " ").trim(), pdfPage: n.pdfPage }), walk(n.children)));
  walk(nodes);
  return out;
}

// ---------- locating headings ----------
type Pos = { pdfPage: number; col: number; y: number };
export type StructureResult = {
  nodes: SectionNode[]; // document order: main-flow sections first by position, boxes inserted by page
  errors: string[]; // validator failures (any entry => exit non-zero)
  warnings: string[]; // disagreements worth printing (bookmarks, off-page headings, aliases)
  toc: Toc;
  tocEntryCount: number;
  notFound: string[];
  figureTableNotFound: string[];
};

// TOC wording that differs from the printed heading: the TOC says "Regional developments" (p49) but the chapter 2
// overview heading is "Recent developments" (Helvetica Bold 14.04, PDF p71).
const ALIASES: Record<string, string[]> = { regionaldevelopments: ["recentdevelopments"] };

type Expected = { kind: "es" | "chapter" | "entry"; chapter: number; level: number; title: string; printed: string; pdfPage: number; region: string | null; indexed: boolean; parentTitle?: string };

function styleOk(e: Expected, style: string): boolean {
  if (e.kind === "es") return style === "HC26.04";
  if (e.level === 2) return style === "HR11.04";
  return style.startsWith("HB"); // level-1 sections, regions, annexes, References
}

// D-28: heading paths carry the chapter number plus a short topic.
export const CHAPTER_LABEL: Record<number, string> = {
  1: "Chapter 1 (Global Outlook)", 2: "Chapter 2 (Regional Outlooks)", 3: "Chapter 3 (Sovereign Debt)", 4: "Chapter 4 (Fiscal Policy)",
};

const REGION_NORM = new Map(REGIONS.map((r) => [norm(r.name), r.name]));

export function buildStructure(blocks: Block[], rawPages: RawPage[], outline: OutlineNode[], boxPages: Map<number, string>): StructureResult {
  const toc = parseToc(rawPages);
  const errors: string[] = [];
  const warnings: string[] = [];
  const notFound: string[] = [];

  // ----- expected headings, in document order -----
  const expected: Expected[] = [];
  const es = toc.front.find((f) => norm(f.title) === "executivesummary");
  if (!es) errors.push("TOC: no Executive Summary entry");
  else expected.push({ kind: "es", chapter: 0, level: 0, title: "Executive Summary", printed: es.printed, pdfPage: es.pdfPage, region: null, indexed: true });
  for (let ch = 1; ch <= 4; ch++) {
    const ents = toc.entries.filter((e) => e.chapter === ch);
    const title = ents.find((e) => e.level === 0);
    if (!title) {
      errors.push(`TOC: no entry for Chapter ${ch}`);
      continue;
    }
    expected.push({ kind: "chapter", chapter: ch, level: 0, title: title.title, printed: title.printed, pdfPage: title.pdfPage, region: null, indexed: true });
    const annexes = toc.lists.filter((l) => l.list === "Annexes" && l.id.startsWith(`${ch}.`));
    const body: Expected[] = [
      ...ents.filter((e) => e.level > 0).map((e): Expected => ({
        kind: "entry", chapter: ch, level: e.level, title: e.title, printed: e.printed, pdfPage: e.pdfPage, region: null,
        indexed: norm(e.title) !== "references",
      })),
      ...annexes.map((a): Expected => ({
        kind: "entry", chapter: ch, level: 1, title: `Annex ${a.id} ${a.title}`, printed: a.printed, pdfPage: a.pdfPage, region: null, indexed: true,
      })),
    ];
    // annexes sit between the last policy section and References: order the merged list by page (stable)
    body.sort((a, b) => a.pdfPage - b.pdfPage);
    let region: string | null = null;
    let parentTitle = "";
    for (const e of body) {
      if (e.level === 1) {
        region = ch === 2 ? (REGION_NORM.get(norm(e.title)) ?? null) : null;
        parentTitle = e.title;
      }
      e.region = region;
      e.parentTitle = e.level === 2 ? parentTitle : undefined;
      expected.push(e);
    }
  }

  // ----- locate each expected heading by font + position (ordered scan) -----
  const heads = blocks.filter((b) => (b.kind === "heading" || b.kind === "opener") && !b.boxId);
  const found: { e: Expected; block: Block }[] = [];
  let prev: Pos = { pdfPage: 0, col: 0, y: 0 };
  for (const e of expected) {
    const want = [norm(e.title), ...(ALIASES[norm(e.title)] ?? [])];
    const ok = (b: Block) => {
      if (cmpPos(b, prev) <= 0 || Math.abs(b.pdfPage - e.pdfPage) > 1) return false;
      if (e.kind === "chapter") return b.kind === "opener" && b.pdfPage === e.pdfPage;
      if (b.kind !== "heading") return false;
      return want.includes(norm(b.text)) || (e.kind === "es" && norm(b.text) === "executivesummary");
    };
    let cands = heads.filter((b) => ok(b) && (e.kind === "chapter" || styleOk(e, b.style)));
    let relaxed = false;
    if (cands.length === 0) {
      cands = heads.filter(ok);
      relaxed = cands.length > 0;
    }
    cands.sort((a, b) => Math.abs(a.pdfPage - e.pdfPage) - Math.abs(b.pdfPage - e.pdfPage) || cmpPos(a, b));
    let block = cands[0];
    if (e.kind === "chapter") {
      // The opener page holds "CHAPTER n" plus the title; check the number, and the wording against the TOC.
      const opener = heads.find((b) => b.kind === "opener" && b.pdfPage === e.pdfPage);
      if (!opener || !new RegExp(`^CHAPTER ${e.chapter}\\b`).test(opener.text)) {
        errors.push(`Chapter ${e.chapter}: no "CHAPTER ${e.chapter}" opener on PDF p${e.pdfPage} (TOC page ${e.printed})`);
        notFound.push(`Chapter ${e.chapter} ${e.title}`);
        continue;
      }
      block = opener;
      if (norm(opener.text.replace(/^CHAPTER \d/, "")) !== norm(e.title)) {
        const bm = flattenOutline(outline).find((b) => new RegExp(`^Ch\\. ${e.chapter}\\b`).test(b.title));
        warnings.push(`Chapter ${e.chapter}: opener title "${opener.text.replace(/^CHAPTER \d\s*/, "")}" differs from TOC "${e.title}" (bookmark: "${bm?.title}")`);
      }
    }
    if (!block) {
      errors.push(`NOT FOUND: "${e.title}" (TOC page ${e.printed} = PDF p${e.pdfPage}, chapter ${e.chapter}, level ${e.level})`);
      notFound.push(`${e.title} (Ch ${e.chapter}, p${e.printed})`);
      continue;
    }
    if (relaxed) warnings.push(`"${e.title}": found with a different font than expected (${block.style})`);
    if (block.pdfPage !== e.pdfPage) warnings.push(`"${e.title}": TOC says PDF p${e.pdfPage} but heading is on PDF p${block.pdfPage}`);
    if (norm(block.text) !== norm(e.title) && e.kind === "entry") warnings.push(`"${e.title}": located via alias heading "${block.text}" (${block.style}) on PDF p${block.pdfPage}`);
    found.push({ e, block });
    prev = block;
  }

  // ----- nodes -----
  const nodes: SectionNode[] = [];
  const pathOf = new Map<Expected, string>();
  const idOf = new Map<Expected, number>();
  const parentOfLevel: Record<number, number | null> = {};
  const chapterNodeId = new Map<number, number>();
  for (const { e, block } of found) {
    const id = nodes.length;
    let headingPath: string;
    let parent: number | null = null;
    if (e.kind === "es") headingPath = "Executive Summary";
    else if (e.kind === "chapter") {
      headingPath = CHAPTER_LABEL[e.chapter];
      chapterNodeId.set(e.chapter, id);
      parentOfLevel[1] = id;
    } else if (e.level === 1) {
      // D-27: Chapter 2 overview sections (no region) sit under "Overview"; the TOC's "Regional developments" is
      // the page's "Recent developments", so it cannot be confused with the regions' own sub-sections.
      const overview = e.chapter === 2 && e.region === null && e.kind === "entry" && !/^References$/.test(e.title) && !e.title.startsWith("Annex");
      const shown = e.title === "Regional developments" ? "Recent developments" : e.title;
      headingPath = overview ? `${CHAPTER_LABEL[2]} > Overview > ${shown}` : `${CHAPTER_LABEL[e.chapter]} > ${e.title}`;
      parent = chapterNodeId.get(e.chapter) ?? null;
      parentOfLevel[2] = id;
    } else {
      const p = nodes[parentOfLevel[2] ?? 0];
      headingPath = `${p.headingPath} > ${e.title}`;
      parent = p.id;
    }
    pathOf.set(e, headingPath);
    idOf.set(e, id);
    const kind: Kind = e.kind === "es" ? "exec_summary" : e.kind === "chapter" ? "chapter" : e.level === 2 ? "subsection" : e.region && e.level === 1 ? "region" : "section";
    nodes.push({
      id, kind, title: e.title, headingPath, chapter: e.chapter || null, region: e.region, box: null,
      level: e.level, parent, indexed: e.indexed, tocPage: e.printed,
      pdfPageStart: block.pdfPage, pdfPageEnd: block.pdfPage, printedStart: pdfToPrinted(block.pdfPage), printedEnd: null,
      start: { pdfPage: block.pdfPage, col: block.col, y: block.y },
      found: `${block.text} [${block.style || "opener"}]`, blocks: [],
    });
  }
  // sub-sections of a section inherit its References flag: nothing to do, References has no children.

  // ----- boxes -----
  const boxFirst = new Map<string, Block>();
  const boxLast = new Map<string, number>();
  for (const b of blocks.filter((b) => b.kind === "boxtitle")) {
    const id = `Box ${/^BOX\s+(\d+\.\d+)/.exec(b.text)![1]}`;
    const cont = /\(continued\)\s*$/.test(b.text);
    if (!cont && !boxFirst.has(id)) boxFirst.set(id, b);
    boxLast.set(id, Math.max(boxLast.get(id) ?? 0, b.pdfPage));
  }
  const tocBoxes = toc.lists.filter((l) => l.list === "Boxes");
  for (const tb of tocBoxes) {
    const id = `Box ${tb.id}`;
    const first = boxFirst.get(id);
    if (!first) {
      errors.push(`NOT FOUND: ${id} "${tb.title}" (TOC page ${tb.printed} = PDF p${tb.pdfPage})`);
      notFound.push(`${id} ${tb.title}`);
      continue;
    }
    const title = first.text.replace(/^BOX\s+\d+\.\d+\s*/, "");
    if (norm(title) !== norm(tb.title)) warnings.push(`${id}: PDF title "${title}" differs from TOC "${tb.title}"`);
    if (first.pdfPage !== tb.pdfPage) errors.push(`${id}: TOC says PDF p${tb.pdfPage}, box title is on PDF p${first.pdfPage}`);
    const chapter = +tb.id.split(".")[0];
    nodes.push({
      id: nodes.length, kind: "box", title: tb.title, headingPath: `${CHAPTER_LABEL[chapter]} > ${id}: ${tb.title}`, chapter, region: null, box: id,
      level: 0, parent: chapterNodeId.get(chapter) ?? null, indexed: true, tocPage: tb.printed,
      pdfPageStart: first.pdfPage, pdfPageEnd: boxLast.get(id) ?? first.pdfPage, printedStart: pdfToPrinted(first.pdfPage), printedEnd: null,
      start: { pdfPage: first.pdfPage, col: first.col, y: first.y }, found: `${first.text} [HB9.96]`, blocks: [],
    });
  }
  for (const [id] of boxFirst) if (!tocBoxes.some((t) => `Box ${t.id}` === id)) errors.push(`${id} appears in the PDF but not in the TOC box list`);
  for (const [page, id] of boxPages) if (!nodes.some((n) => n.box === id && page >= n.pdfPageStart && page <= n.pdfPageEnd)) errors.push(`PDF p${page} is a ${id} page outside that box's range`);

  // ----- assign content blocks -----
  const mainFlow = nodes.filter((n) => n.kind !== "box").sort((a, b) => cmpPos(a.start, b.start));
  const used = new Set(found.map((f) => f.block));
  for (const b of blocks) {
    if (b.boxId) {
      const n = nodes.find((x) => x.box === b.boxId);
      if (n && b.kind !== "boxtitle") n.blocks.push(b);
      continue;
    }
    if (b.kind === "opener" || b.kind === "boxtitle" || used.has(b)) continue;
    let owner: SectionNode | undefined;
    for (const n of mainFlow) if (cmpPos(n.start, b) <= 0) owner = n;
    if (!owner) continue;
    // a heading-styled line that is not in the TOC (figure subtitle, sub-sub-heading) stays inline as text
    owner.blocks.push(b.kind === "heading" ? { ...b, kind: "subhead" } : b);
  }
  for (const n of nodes) {
    n.blocks.sort(cmpPos);
    if (n.kind !== "box" && n.blocks.length) n.pdfPageEnd = Math.max(n.pdfPageStart, ...n.blocks.map((b) => b.pdfPage));
    else if (n.kind !== "box") n.pdfPageEnd = n.pdfPageStart;
    n.printedEnd = pdfToPrinted(n.pdfPageEnd);
    if (n.kind === "chapter" && n.blocks.length) n.headingPath = `${n.headingPath} > Overview`; // D-27: intro text
  }

  // ----- validator -----
  const unmatchedHeads = heads.filter((b) => b.kind === "heading" && !used.has(b));
  if (unmatchedHeads.length) warnings.push(`${unmatchedHeads.length} heading-styled lines are not TOC headings and stay inline as text: ${unmatchedHeads.slice(0, 8).map((b) => `p${b.pdfPage} "${b.text}"`).join("; ")}${unmatchedHeads.length > 8 ? " ..." : ""}`);
  for (let i = 1; i < mainFlow.length; i++) {
    const a = mainFlow[i - 1];
    const b = mainFlow[i];
    if (cmpPos(a.start, b.start) >= 0) errors.push(`Out of order: "${a.headingPath}" (p${a.pdfPageStart}) is not before "${b.headingPath}" (p${b.pdfPageStart})`);
    if (a.pdfPageEnd > b.pdfPageStart) errors.push(`Page ranges overlap: "${a.headingPath}" ends p${a.pdfPageEnd}, "${b.headingPath}" starts p${b.pdfPageStart}`);
  }
  const boxes = nodes.filter((n) => n.kind === "box").sort((a, b) => a.pdfPageStart - b.pdfPageStart);
  for (let i = 1; i < boxes.length; i++) if (boxes[i - 1].pdfPageEnd >= boxes[i].pdfPageStart) errors.push(`Box ranges overlap: ${boxes[i - 1].box} and ${boxes[i].box}`);
  const regionNodes = nodes.filter((n) => n.kind === "region");
  for (const r of REGIONS) {
    const rn = regionNodes.find((n) => n.region === r.name);
    if (!rn) {
      errors.push(`Region missing: ${r.name}`);
      continue;
    }
    for (const sub of ["Recent developments", "Outlook"])
      if (!nodes.some((n) => n.kind === "subsection" && n.region === r.name && n.title === sub)) errors.push(`Region "${r.name}" has no "${sub}" sub-section`);
  }
  for (const n of nodes)
    if (n.indexed && n.kind !== "chapter" && n.blocks.length === 0 && !nodes.some((c) => c.parent === n.id && c.kind !== "box"))
      errors.push(`Empty section (no text found): "${n.headingPath}" on PDF p${n.pdfPageStart}`);

  // ----- bookmark cross-check (never authoritative) -----
  const bms = flattenOutline(outline).filter((b) => b.pdfPage !== null && !/^(Summary of Contents|Contents)$/.test(b.title));
  let lastBm = 0;
  for (const bm of bms) {
    let n: SectionNode | undefined;
    const ch = /^Ch\. (\d)/.exec(bm.title);
    const bx = /^Box (\d+\.\d+)/.exec(bm.title);
    if (norm(bm.title) === "executivesummary") n = nodes.find((x) => x.kind === "exec_summary");
    else if (ch) n = nodes.find((x) => x.kind === "chapter" && x.chapter === +ch[1]);
    else if (bx) n = nodes.find((x) => x.box === `Box ${bx[1]}`);
    else if (norm(bm.title) === "statisticalannex") {
      const sa = toc.front.find((f) => norm(f.title) === "statisticalappendix");
      if (sa && sa.pdfPage !== bm.pdfPage) warnings.push(`Bookmark "${bm.title}" is PDF p${bm.pdfPage}, TOC "Statistical Appendix" is PDF p${sa.pdfPage}`);
      continue;
    } else n = nodes.find((x) => x.kind === "region" && norm(x.title) === norm(bm.title));
    if (!n) {
      warnings.push(`Bookmark "${bm.title}" (PDF p${bm.pdfPage}) matches no located section`);
      continue;
    }
    if (n.pdfPageStart !== bm.pdfPage) warnings.push(`Bookmark "${bm.title}" says PDF p${bm.pdfPage}, heading is on PDF p${n.pdfPageStart} (${n.headingPath})`);
    if (bm.pdfPage! < lastBm) warnings.push(`Bookmark order: "${bm.title}" (PDF p${bm.pdfPage}) is listed after a bookmark on PDF p${lastBm}`);
    lastBm = Math.max(lastBm, bm.pdfPage!);
  }

  // ----- figure / table captions listed in the TOC -----
  const captions = blocks.filter((b) => b.kind === "caption");
  const figureTableNotFound: string[] = [];
  for (const l of toc.lists.filter((l) => l.list === "Figures" || l.list === "Tables")) {
    const hit = captions.some((c) => Math.abs(c.pdfPage - l.pdfPage) <= 1 && norm(c.text).startsWith(norm(`${l.list === "Figures" ? "FIGURE" : "TABLE"} ${l.id} ${l.title}`).slice(0, 30)));
    if (!hit) figureTableNotFound.push(`${l.list === "Figures" ? "Figure" : "Table"} ${l.id} "${l.title}" (p${l.printed})`);
  }

  const tocEntryCount = toc.entries.length + toc.front.length + toc.lists.filter((l) => l.list === "Annexes" || l.list === "Boxes").length;
  return { nodes, errors, warnings, toc, tocEntryCount, notFound, figureTableNotFound };
}
