import { readFile } from "node:fs/promises";
import type { RawPage } from "./clean";

// Reads the Phase 0 dump (`npm run dump:pdf`): per-page items with real font names and x/y.
export async function loadDumpPages(dir = ".scratch/dump"): Promise<RawPage[]> {
  const pages: RawPage[] = [];
  for (let p = 1; ; p++) {
    try {
      pages.push(JSON.parse(await readFile(`${dir}/pages/${String(p).padStart(3, "0")}.json`, "utf8")));
    } catch {
      break;
    }
  }
  if (pages.length === 0) throw new Error(`No dump in ${dir}; run "npm run dump:pdf" first`);
  return pages;
}

export type OutlineNode = { title: string; pdfPage: number | null; children: OutlineNode[] };

export async function loadOutline(dir = ".scratch/dump"): Promise<OutlineNode[]> {
  return JSON.parse(await readFile(`${dir}/outline.json`, "utf8"));
}
