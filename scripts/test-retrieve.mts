import assert from "node:assert/strict";
import { buildQuery, buildWhere, retrieve, routeAndRetrieve, type SqlLike } from "../src/lib/rag/retrieve";

// Offline unit test for retrieval SQL construction and the filter fallback (fake embed + fake sql). Run: npm run test:retrieve
assert.deepEqual(buildWhere(7), { where: "document_id = $2", params: [7] });
assert.deepEqual(buildWhere(7, {}), { where: "document_id = $2", params: [7] });
assert.deepEqual(buildWhere(7, { chapter: 3 }), { where: "document_id = $2 AND chapter = $3", params: [7, "3"] });
assert.deepEqual(buildWhere(7, { region: "South Asia" }), { where: "document_id = $2 AND region = $3", params: [7, "South Asia"] });
assert.deepEqual(buildWhere(7, { kind: "exec_summary" }).params, [7, "exec_summary"]);
assert.deepEqual(buildWhere(7, { box: "Box 1.1" }), { where: "document_id = $2 AND box = $3", params: [7, "Box 1.1"] });
assert.deepEqual(buildWhere(7, { chapter: 2, region: "X" }), { where: "document_id = $2 AND chapter = $3 AND region = $4", params: [7, "2", "X"] });

const q = buildQuery(7, 10, { region: "South Asia" });
assert.match(q.text, /FROM chunks WHERE document_id = \$2 AND region = \$3 ORDER BY embedding <=> \$1::vector LIMIT 10$/);
assert.match(q.text, /1 - \(embedding <=> \$1::vector\) AS score/);
assert.equal(q.params.length, 2);

// Fake database: rows depend on whether a region filter is in the query.
const row = (id: number, extra: object = {}) => ({
  id, document_id: 7, content: `c${id}`, heading_path: "Chapter 2 (Regional Outlooks) > South Asia > Outlook", chapter: "2",
  region: "South Asia", box: null, kind: "subsection", pdf_page: 96, printed_page: 74, score: 0.8, ...extra,
});
const calls: { text: string; params: unknown[] }[] = [];
const fakeSql = (filteredRows: object[]): SqlLike => ({
  begin: (fn) =>
    fn({
      unsafe: async (text, params) => {
        if (text.startsWith("SET LOCAL")) return [];
        calls.push({ text, params });
        return text.includes("region = $3") ? filteredRows : [row(1, { region: "Other", chapter: null, heading_path: null }), row(2)];
      },
    }),
});
let embeds = 0;
const embedQuery = async () => (embeds++, [0.1, 0.2]);

const plain = await retrieve("anything", { documentId: 7, k: 5 }, { embedQuery, sql: fakeSql([]) });
assert.equal(plain.length, 2);
assert.deepEqual(plain[1], { id: 2, documentId: 7, content: "c2", headingPath: "Chapter 2 (Regional Outlooks) > South Asia > Outlook", chapter: 2, region: "South Asia", box: null, kind: "subsection", pdfPage: 96, printedPage: 74, score: 0.8 });
assert.equal(plain[0].chapter, null);
assert.equal(calls[0].params[0], "[0.1,0.2]");

// Routed query with matching rows: filter applied, one embedding call.
calls.length = 0; embeds = 0;
let r = await routeAndRetrieve("What is the growth outlook for South Asia in this report?", { documentId: 7 }, { embedQuery, sql: fakeSql([row(2), row(3)]) });
assert.deepEqual(r.filters, { region: "South Asia" });
assert.deepEqual(r.filtersApplied, { region: "South Asia" });
assert.equal(r.fellBack, false);
assert.equal(r.chunks.length, 2);
assert.equal(calls.length, 1);

// Filter matches nothing: fall back to the unfiltered search, embedding only once.
calls.length = 0; embeds = 0;
r = await routeAndRetrieve("What is the growth outlook for South Asia in this report?", { documentId: 7 }, { embedQuery, sql: fakeSql([]) });
assert.equal(r.fellBack, true);
assert.deepEqual(r.filtersApplied, {});
assert.deepEqual(r.filters, { region: "South Asia" });
assert.equal(r.chunks.length, 2);
assert.equal(calls.length, 2);
assert.equal(embeds, 1);

// useFilters=false and unroutable questions never filter.
calls.length = 0;
r = await routeAndRetrieve("growth outlook for South Asia", { documentId: 7, useFilters: false }, { embedQuery, sql: fakeSql([row(9)]) });
assert.deepEqual(r.filters, {});
assert.equal(r.fellBack, false);
assert.ok(!calls[0].text.includes("region = $3"));
r = await routeAndRetrieve("What does the report forecast for cryptocurrency prices?", { documentId: 7 }, { embedQuery, sql: fakeSql([]) });
assert.deepEqual(r.filters, {});

console.log("test-retrieve: all assertions passed");
