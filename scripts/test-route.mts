import assert from "node:assert/strict";
import { routeQuestion, type Route } from "../src/lib/rag/route";

// Offline unit test for the question router (no database, no Gemini). Run: npm run test:route
const MNA = "Middle East, North Africa, Afghanistan, and Pakistan";
const cases: [string, Route][] = [
  // the 10 evaluation questions (specs/gep-qa/eval-questions.md)
  ["What is the growth outlook for South Asia in this report?", { region: "South Asia" }],
  ["What is the growth outlook for East Asia and Pacific?", { region: "East Asia and Pacific" }],
  ["What growth does the report forecast for Sub-Saharan Africa in 2026, and how was it revised?", { region: "Sub-Saharan Africa" }],
  ["How is India's growth expected to change in fiscal year 2026/27?", { region: "South Asia" }],
  ["What does the report forecast for Pakistan's growth?", { region: MNA }],
  ["What does Chapter 3 say about sovereign debt in developing economies?", { chapter: 3 }],
  ["How do commodity-exporting economies manage fiscal policy over commodity price swings?", {}],
  ["According to the executive summary, what are the main risks to the global outlook?", { kind: "exec_summary" }],
  ["How much could AI affect global growth, according to the report?", {}],
  ["What does the report forecast for cryptocurrency prices?", {}],
  // abbreviations and spellings
  ["EAP growth in 2027?", { region: "East Asia and Pacific" }],
  ["What is the ECA outlook?", { region: "Europe and Central Asia" }],
  ["LAC inflation", { region: "Latin America and the Caribbean" }],
  ["MNA risks", { region: MNA }],
  ["MENA oil exporters", { region: MNA }],
  ["SAR growth", { region: "South Asia" }],
  ["SSA growth", { region: "Sub-Saharan Africa" }],
  ["outlook for sub-Saharan economies", { region: "Sub-Saharan Africa" }],
  ["outlook for Latin America", { region: "Latin America and the Caribbean" }],
  ["Chapter two overview", { chapter: 2 }],
  ["what is chapter 4 about", { chapter: 4 }],
  ["Executive Summary", { kind: "exec_summary" }],
  // countries
  ["Brazil growth", { region: "Latin America and the Caribbean" }],
  ["How is Nigeria doing?", { region: "Sub-Saharan Africa" }],
  ["South Africa growth", { region: "Sub-Saharan Africa" }],
  ["Papua New Guinea", { region: "East Asia and Pacific" }],
  ["Saudi Arabia and Egypt", { region: MNA }],
  ["Türkiye inflation", { region: "Europe and Central Asia" }],
  ["Bangladesh and Sri Lanka", { region: "South Asia" }],
  ["Afghanistan outlook", { region: MNA }],
  // conservative rules: no filter when the question is ambiguous or conflicting
  ["Compare South Asia and East Asia and Pacific", {}], // two regions
  ["Pakistan and India growth", {}], // MNA vs South Asia
  ["What does Chapter 3 say about South Asia?", { chapter: 3 }], // region + unrelated chapter: keep chapter only
  ["In Chapter 2, what is the outlook for India?", { chapter: 2, region: "South Asia" }],
  ["Compare chapter 3 and chapter 4", {}], // two chapters
  ["executive summary versus chapter 1 on risks", {}], // two explicit scopes
  ["What does the executive summary say about South Asia?", { kind: "exec_summary" }], // region dropped
  ["What is Box 1.1 about?", { box: "Box 1.1" }],
  ["Growth in Hong Kong SAR", {}], // SAR here is not South Asia
  ["How is the euro area doing?", {}], // bare Europe/Africa/Middle East are not matched
  ["What is the effect of the conflict in the Middle East on global growth?", {}],
  ["Africa growth", {}],
  ["Guinea-Bissau", { region: "Sub-Saharan Africa" }],
  ["the Niger and Nigeria", { region: "Sub-Saharan Africa" }],
  ["Georgia", { region: "Europe and Central Asia" }],
  ["chapter 7", {}], // not a chapter in this report
];

let failed = 0;
for (const [q, want] of cases) {
  try {
    assert.deepEqual(routeQuestion(q), want);
  } catch {
    failed++;
    console.error(`FAIL: ${JSON.stringify(q)}\n  expected ${JSON.stringify(want)}\n  got      ${JSON.stringify(routeQuestion(q))}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} router cases passed`);
process.exit(failed ? 1 : 0);
