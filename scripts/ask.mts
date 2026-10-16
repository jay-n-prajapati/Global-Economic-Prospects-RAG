import { client } from "../src/lib/db";
import { SEND_K } from "../src/lib/rag/config";
import { generate, retrieve } from "../src/lib/rag/ask";

const args = process.argv.slice(2);
const retrievalOnly = args.includes("--retrieval-only");
const question = args.filter((a) => a !== "--retrieval-only").join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- [--retrieval-only] "<question>"');
  process.exit(1);
}

const hits = await retrieve(question);
console.log(`\nQ: ${question}\n\nRetrieved (top ${hits.length}; * = sent to the model):`);
hits.forEach((h, i) => {
  const printed = h.printedPage === null ? "-" : String(h.printedPage);
  const snippet = h.content.replace(/\s+/g, " ").slice(0, 110);
  console.log(`${i < SEND_K ? "*" : " "}${String(i + 1).padStart(2)}  pdf ${String(h.pdfPage).padStart(3)}  printed ${printed.padStart(3)}  ${h.score.toFixed(3)}  ${snippet}`);
});

if (!retrievalOnly) console.log(`\n${await generate(question, hits.slice(0, SEND_K))}\n`);
await client.end();
