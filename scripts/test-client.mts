// Offline tests for the browser-side pieces: NDJSON stream parser, citation parser, filter line. No server, no network.
import type { AskEvent, AskMeta } from "../src/lib/ask-protocol";
import { readEvents } from "../src/lib/ask-client";
import { citedRefs, parseCitations, plainAnswer } from "../src/lib/citations";
import { describeFilters, formatWait, splitPath } from "../src/lib/filters";
import { classifyError, retryAfterSecs } from "../src/lib/rag/errors";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? `\n       ${detail}` : ""}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const meta: AskMeta = { pipeline: "structured", useFilters: true, filters: { region: "South Asia" }, filtersApplied: true, fellBack: false, sendK: 5 };
const events: AskEvent[] = [
  { type: "sources", sources: [], meta },
  { type: "text", text: "Growth is 6.3 percent [1]. Unicode: é – ‘x’ " },
  { type: "text", text: "second" },
  { type: "done" },
];
const bytes = new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join("\n") + "\n");

// Fake stream delivering the payload in tiny slices, so lines and multi-byte characters are split mid-way.
function fakeStream(data: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= data.length) return controller.close();
      controller.enqueue(data.slice(i, i + size));
      i += size;
    },
  });
}
for (const size of [1, 3, 7, 1000]) {
  const got: AskEvent[] = [];
  await readEvents(fakeStream(bytes, size), (e) => got.push(e));
  check(`parser reassembles events (chunk size ${size})`, eq(got, events));
}
{
  const got: AskEvent[] = [];
  await readEvents(fakeStream(new TextEncoder().encode('{"type":"done"}'), 4), (e) => got.push(e));
  check("last line without trailing newline is still parsed", eq(got, [{ type: "done" }]));
}
{
  let threw = false;
  try {
    await readEvents(fakeStream(new TextEncoder().encode("not json\n"), 100), () => {});
  } catch {
    threw = true;
  }
  check("malformed line throws (caller maps it to an error state)", threw);
}

check("single citation", eq(parseCitations("Growth slows [1]."), [{ text: "Growth slows " }, { refs: [1] }, { text: "." }]));
check("adjacent citations merge", eq(parseCitations("x [1][3] y [2] [4]"), [{ text: "x " }, { refs: [1, 3] }, { text: " y " }, { refs: [2, 4] }]));
check("comma list and range", eq(parseCitations("[1, 2] and [3-5]"), [{ refs: [1, 2] }, { text: " and " }, { refs: [3, 4, 5] }]));
check("non-numeric brackets are left as text", eq(parseCitations("see [Chapter 3] now"), [{ text: "see [Chapter 3] now" }]));
check("citedRefs", eq([...citedRefs("a [2][5]. b [2, 3]")].sort(), [2, 3, 5]));
check("plainAnswer strips citations and bold", plainAnswer("**Growth** is 6.3% [1] .", false) === "Growth is 6.3%.", plainAnswer("**Growth** is 6.3% [1] .", false));

check("filter line: region applied", describeFilters(meta).text === "Region = South Asia" && describeFilters(meta).applied);
check("filter line: off", describeFilters({ ...meta, useFilters: false }).text.startsWith("none (filters off"));
check("filter line: nothing named", describeFilters({ ...meta, filters: {}, filtersApplied: false }).text.includes("no region, chapter"));
check("filter line: fell back", describeFilters({ ...meta, filtersApplied: false, fellBack: true }).text.includes("matched nothing"));
check("filter line: fixed pipeline", describeFilters({ ...meta, pipeline: "fixed" }).applied === false);
check("filter line: chapter + region", describeFilters({ ...meta, filters: { chapter: 2, region: "South Asia" } }).text === "Chapter = 2, Region = South Asia");
check("splitPath", eq(splitPath("Chapter 2 (Regional Outlooks) > South Asia > Outlook"), ["Chapter 2 (Regional Outlooks)", "South Asia", "Outlook"]));
check("formatWait", formatWait(27) === "about 27 seconds" && formatWait(600) === "about 10 minutes" && formatWait(7200) === "about 2 hours");

check("429 -> quota", classifyError({ status: 429, message: "x" }) === "quota");
check("retry helper's quota error -> quota", classifyError(new Error("Gemini quota exhausted (server asks to wait 90 min): ...")) === "quota");
check("503 -> unavailable, other -> internal", classifyError({ status: 503 }) === "unavailable" && classifyError(new Error("boom")) === "internal");
check("retryDelay parsed", retryAfterSecs(new Error('{"error":{"details":[{"retryDelay":"27.4s"}]}}')) === 28);
check("'wait N min' parsed", retryAfterSecs(new Error("quota exhausted (server asks to wait 90 min)")) === 5400);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
