import type { AskFilters, AskMeta } from "./ask-protocol";

const KIND_LABEL: Record<string, string> = {
  exec_summary: "Executive Summary",
  box: "Box",
  section: "Section",
};

export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

// "Region = South Asia", "Chapter = 3", ... for the detected filters, in a stable order.
export function filterParts(filters: AskFilters): string[] {
  const parts: string[] = [];
  if (filters.chapter !== undefined) parts.push(`Chapter = ${filters.chapter}`);
  if (filters.region) parts.push(`Region = ${filters.region}`);
  if (filters.kind) parts.push(`Section = ${kindLabel(filters.kind)}`);
  if (filters.box) parts.push(`Box = ${filters.box}`);
  return parts;
}

// The one line the evidence panel shows so a reader can tell WHY these passages were searched.
export function describeFilters(meta: AskMeta): { applied: boolean; text: string } {
  const parts = filterParts(meta.filters);
  if (meta.pipeline === "fixed") {
    return { applied: false, text: "none (fixed-size chunks have no region or chapter labels)" };
  }
  if (!meta.useFilters) {
    return { applied: false, text: parts.length ? `none (filters off; the router would have used ${parts.join(", ")})` : "none (filters off)" };
  }
  if (parts.length === 0) return { applied: false, text: "none (no region, chapter or section named in the question)" };
  if (meta.fellBack) return { applied: false, text: `none (${parts.join(", ")} matched nothing, so everything was searched)` };
  if (!meta.filtersApplied) return { applied: false, text: "none" };
  return { applied: true, text: parts.join(", ") };
}

export function formatWait(secs: number): string {
  if (secs < 90) return `about ${Math.max(1, Math.round(secs))} seconds`;
  const mins = Math.round(secs / 60);
  if (mins < 90) return `about ${mins} minutes`;
  const hours = Math.round(secs / 3600);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

// "Chapter 2 (Regional Outlooks) > South Asia > Outlook" -> ["Chapter 2 (Regional Outlooks)", "South Asia", "Outlook"]
export const splitPath = (path: string | null): string[] => (path ? path.split(">").map((p) => p.trim()).filter(Boolean) : []);

export function pageLabel(printedPage: number | null, pdfPage: number): string {
  return printedPage !== null ? `printed p. ${printedPage} · PDF p. ${pdfPage}` : `front matter · PDF p. ${pdfPage}`;
}
