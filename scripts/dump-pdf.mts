import { readFile, mkdir, writeFile } from "node:fs/promises";
import { getDocumentProxy } from "unpdf";

// Dumps per-page items (font, size, x/y), the bookmark outline and plain text
// to .scratch/ so we can inspect the PDF before writing parsing rules.
const pdfPath = process.argv[2] ?? "data/GEP-Jun-2026.pdf";
const outDir = ".scratch/dump";

const pdf = await getDocumentProxy(new Uint8Array(await readFile(pdfPath)));
await mkdir(`${outDir}/pages`, { recursive: true });
await mkdir(`${outDir}/text`, { recursive: true });

// Resolve a bookmark destination to a 1-based PDF page number.
async function destPage(dest: unknown): Promise<number | null> {
  try {
    const d = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(d)) return null;
    const ref = d[0];
    return typeof ref === "number" ? ref + 1 : (await pdf.getPageIndex(ref)) + 1;
  } catch {
    return null;
  }
}

type Bookmark = { title: string; pdfPage: number | null; children: Bookmark[] };
async function walk(nodes: any[]): Promise<Bookmark[]> {
  const out: Bookmark[] = [];
  for (const n of nodes) {
    out.push({
      title: n.title,
      pdfPage: await destPage(n.dest),
      children: await walk(n.items ?? []),
    });
  }
  return out;
}
const outline = await walk((await pdf.getOutline()) ?? []);
await writeFile(`${outDir}/outline.json`, JSON.stringify(outline, null, 2));

const labels = await pdf.getPageLabels();
if (labels) await writeFile(`${outDir}/page-labels.json`, JSON.stringify(labels));

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  await page.getOperatorList(); // loads the real font objects into commonObjs
  // Font ids (g_d0_f17) are internal; the real name is e.g. "AGaramondPro-Bold".
  const realName = (id: string): string => {
    try {
      return String((page.commonObjs.get(id) as any).name).replace(/^[A-Z]{6}\+/, "");
    } catch {
      return id;
    }
  };
  const items = content.items
    .filter((i: any) => "str" in i && i.str !== "")
    .map((i: any) => ({
      str: i.str,
      font: realName(i.fontName),
      size: Math.round(Math.hypot(i.transform[0], i.transform[1]) * 100) / 100,
      x: Math.round(i.transform[4] * 10) / 10,
      y: Math.round(i.transform[5] * 10) / 10,
      w: Math.round(i.width * 10) / 10,
    }));
  const num = String(p).padStart(3, "0");
  await writeFile(
    `${outDir}/pages/${num}.json`,
    JSON.stringify({ page: p, width: page.view[2], height: page.view[3], items }),
  );
  // Plain text in the order pdf.js returns it (hasEOL marks line breaks).
  const text = content.items
    .map((i: any) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : ""))
    .join("");
  await writeFile(`${outDir}/text/${num}.txt`, text);
}
console.log(`${pdf.numPages} pages -> ${outDir}`);
