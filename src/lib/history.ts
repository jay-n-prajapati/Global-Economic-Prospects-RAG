import type { AskMeta, AskSource } from "./ask-protocol";

// Past questions live in this browser only (localStorage), never on the server. Every storage access can throw
// (blocked cookies, private mode, quota), so the store keeps working in memory when persistence fails.
// Schema is versioned: bump `v` and the key together if the entry shape changes.

export type HistoryEntry = {
  id: string;
  question: string;
  answer: string;
  sources: AskSource[];
  meta: AskMeta;
  secs: number;
  ts: number;
};

const KEY = "gep-ask:history:v1";
const VERSION = 1;
export const MAX_HISTORY = 30;

const EMPTY: HistoryEntry[] = [];

const isNullable = (x: unknown, type: "string" | "number") => x === null || typeof x === type;

function isSource(x: unknown): x is AskSource {
  const s = x as AskSource;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.id === "number" &&
    typeof s.rank === "number" &&
    typeof s.score === "number" &&
    typeof s.content === "string" &&
    typeof s.pdfPage === "number" &&
    isNullable(s.printedPage, "number") &&
    isNullable(s.headingPath, "string") &&
    isNullable(s.chapter, "number") &&
    isNullable(s.region, "string") &&
    isNullable(s.box, "string") &&
    isNullable(s.kind, "string")
  );
}

function isMeta(x: unknown): x is AskMeta {
  const m = x as AskMeta;
  return (
    typeof m === "object" &&
    m !== null &&
    (m.pipeline === "structured" || m.pipeline === "fixed") &&
    typeof m.useFilters === "boolean" &&
    typeof m.filtersApplied === "boolean" &&
    typeof m.fellBack === "boolean" &&
    typeof m.sendK === "number" &&
    typeof m.filters === "object" &&
    m.filters !== null
  );
}

function isEntry(x: unknown): x is HistoryEntry {
  const e = x as HistoryEntry;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.id === "string" &&
    typeof e.question === "string" &&
    typeof e.answer === "string" &&
    typeof e.secs === "number" &&
    typeof e.ts === "number" &&
    isMeta(e.meta) &&
    Array.isArray(e.sources) &&
    e.sources.every(isSource)
  );
}

function read(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw) as { v?: number; entries?: unknown };
    if (data.v !== VERSION || !Array.isArray(data.entries)) return EMPTY;
    return data.entries.filter(isEntry).slice(0, MAX_HISTORY);
  } catch {
    return EMPTY;
  }
}

function write(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, entries }));
  } catch {
    // Persistence is best effort; the in-memory list still works for this session.
  }
}

// External store for useSyncExternalStore: the server and the first hydration render see an empty list,
// the client then reads localStorage once.
let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

// The same question under a different pipeline or filter setting is a different entry: that is the before/after.
const sameAsk = (a: HistoryEntry, b: HistoryEntry) =>
  a.question.trim().toLowerCase() === b.question.trim().toLowerCase() &&
  a.meta.pipeline === b.meta.pipeline &&
  a.meta.useFilters === b.meta.useFilters;

export const historyStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): HistoryEntry[] {
    if (cache === null) cache = read();
    return cache;
  },
  getServerSnapshot(): HistoryEntry[] {
    return EMPTY;
  },
  add(entry: HistoryEntry) {
    const rest = historyStore.getSnapshot().filter((e) => !sameAsk(e, entry));
    set([entry, ...rest].slice(0, MAX_HISTORY));
  },
  clear() {
    set(EMPTY);
  },
};

function set(entries: HistoryEntry[]) {
  cache = entries;
  write(entries);
  listeners.forEach((l) => l());
}
