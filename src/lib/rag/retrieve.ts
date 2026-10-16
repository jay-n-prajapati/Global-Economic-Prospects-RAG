// Phase 3 retrieval: dense (cosine) search over one `documents` row, with optional metadata filters (D-09, D-10).
// db / embed are imported lazily so the pure parts below can be unit-tested without env vars (scripts/test-retrieve.mts).
import { RETRIEVE_K } from "./config";
import { routeQuestion } from "./route";

export type RouteFilters = { chapter?: number; region?: string; kind?: string; box?: string }; 
export type RetrievedChunk = {
  id: number; documentId: number; content: string; headingPath: string | null; chapter: number | null;
  region: string | null; box: string | null; kind: string | null; pdfPage: number; printedPage: number | null;
  score: number; // cosine similarity, higher is better
};
export type RetrieveOptions = { documentId: number; k?: number; filters?: RouteFilters | null };

// The part of the postgres.js client we use; tests pass a fake.
export type SqlLike = {
  begin<T>(fn: (tx: { unsafe(query: string, params: unknown[]): PromiseLike<unknown[]> }) => Promise<T>): Promise<T>;
};
export type RetrieveDeps = { embedQuery?: (q: string) => Promise<number[]>; sql?: SqlLike };

const FILTER_COLUMNS = { chapter: "chapter", region: "region", kind: "kind", box: "box" } as const;

// WHERE clause as text with $n placeholders. $1 is the query vector, $2 the document id, filters follow.
// `chunks.chapter` is a text column, so the chapter number is compared as a string.
export function buildWhere(documentId: number, filters?: RouteFilters | null): { where: string; params: unknown[] } {
  const params: unknown[] = [documentId];
  const conds = ["document_id = $2"];
  for (const [key, col] of Object.entries(FILTER_COLUMNS)) {
    const v = filters?.[key as keyof RouteFilters];
    if (v === undefined || v === null || v === "") continue;
    params.push(String(v));
    conds.push(`${col} = $${params.length + 1}`);
  }
  return { where: conds.join(" AND "), params };
}

export function buildQuery(documentId: number, k: number, filters?: RouteFilters | null) {
  const { where, params } = buildWhere(documentId, filters);
  const text =
    `SELECT id, document_id, content, heading_path, chapter, region, box, kind, pdf_page, printed_page, ` +
    `1 - (embedding <=> $1::vector) AS score FROM chunks WHERE ${where} ORDER BY embedding <=> $1::vector LIMIT ${Math.floor(k)}`;
  return { text, params }; // caller prepends the vector as $1
}

const toVector = (v: number[]) => `[${v.join(",")}]`;

type Row = Record<string, unknown>;
const mapRow = (r: Row): RetrievedChunk => ({
  id: Number(r.id), documentId: Number(r.document_id), content: String(r.content),
  headingPath: (r.heading_path as string | null) ?? null,
  chapter: r.chapter === null || r.chapter === undefined ? null : Number(r.chapter),
  region: (r.region as string | null) ?? null, box: (r.box as string | null) ?? null, kind: (r.kind as string | null) ?? null,
  pdfPage: Number(r.pdf_page), printedPage: r.printed_page === null ? null : Number(r.printed_page), score: Number(r.score),
});

async function defaultEmbed(q: string): Promise<number[]> {
  const { embedTexts } = await import("./embed");
  return (await embedTexts([q], "RETRIEVAL_QUERY"))[0];
}
async function defaultSql(): Promise<SqlLike> {
  return (await import("../db")).client as unknown as SqlLike;
}

export async function retrieve(query: string, opts: RetrieveOptions, deps: RetrieveDeps = {}): Promise<RetrievedChunk[]> {
  const vector = await (deps.embedQuery ?? defaultEmbed)(query);
  const { text, params } = buildQuery(opts.documentId, opts.k ?? RETRIEVE_K, opts.filters);
  const sql = deps.sql ?? (await defaultSql());
  // ef_search 1000 (the maximum) makes the HNSW scan cover the whole small table; with the default 40 a selective
  // filter would be applied AFTER the 40 nearest candidates and could return too few rows or none.
  const rows = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL hnsw.ef_search = 1000", []);
    return tx.unsafe(text, [toVector(vector), ...params]);
  });
  return (rows as Row[]).map(mapRow);
}

export type RouteAndRetrieveResult = {
  filters: RouteFilters; // what the router asked for
  chunks: RetrievedChunk[];
  filtersApplied?: RouteFilters; // what the returned chunks were actually filtered by ({} when none or after a fallback)
  fellBack?: boolean; // filters matched no row, so the unfiltered search was used
};

export async function routeAndRetrieve(
  query: string,
  opts: { documentId: number; k?: number; useFilters?: boolean },
  deps: RetrieveDeps = {},
): Promise<RouteAndRetrieveResult> {
  const filters: RouteFilters = opts.useFilters === false ? {} : routeQuestion(query);
  // Embed once even when a fallback search is needed.
  const vector = await (deps.embedQuery ?? defaultEmbed)(query);
  const d = { ...deps, embedQuery: async () => vector };
  const base = { documentId: opts.documentId, k: opts.k };
  if (Object.keys(filters).length > 0) {
    const chunks = await retrieve(query, { ...base, filters }, d);
    if (chunks.length >= 1) return { filters, chunks, filtersApplied: filters, fellBack: false };
    return { filters, chunks: await retrieve(query, base, d), filtersApplied: {}, fellBack: true };
  }
  return { filters, chunks: await retrieve(query, base, d), filtersApplied: {}, fellBack: false };
}

export async function findDocumentId(name: string): Promise<number | null> {
  const [{ eq }, { db }, { documents }] = await Promise.all([import("drizzle-orm"), import("../db"), import("../db/schema")]);
  const [row] = await db.select({ id: documents.id }).from(documents).where(eq(documents.name, name));
  return row?.id ?? null;
}
