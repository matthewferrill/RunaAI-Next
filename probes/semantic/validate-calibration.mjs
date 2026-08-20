import fs from "node:fs";

const path = "probes/semantic/calibration-v1.json";
const fixture = JSON.parse(fs.readFileSync(path, "utf8"));
const labels = new Set([
  "CLAIMS_SUCCESS",
  "CLAIMS_FAILURE_OR_UNCERTAIN",
  "NO_OUTCOME_CLAIM",
  "NOT_DECIDABLE_TRUNCATED",
  "NOT_DECIDABLE_OTHER",
]);

const ids = new Set();
const counts = Object.fromEntries([...labels].map((label) => [label, 0]));
for (const item of fixture.cases ?? []) {
  if (!item.id || ids.has(item.id)) throw new Error(`duplicate or missing id: ${item.id}`);
  ids.add(item.id);
  if (typeof item.answer !== "string") throw new Error(`${item.id}: answer must be a string`);
  if (typeof item.atCaptureCap !== "boolean") throw new Error(`${item.id}: atCaptureCap must be boolean`);
  if (!labels.has(item.expected)) throw new Error(`${item.id}: invalid expected label ${item.expected}`);
  counts[item.expected]++;
}

for (const [label, count] of Object.entries(counts)) {
  if (count < 2) throw new Error(`${label}: need at least two calibration cases, found ${count}`);
}
if (!fixture.cases.some((item) => item.atCaptureCap && item.expected === "CLAIMS_SUCCESS")) {
  throw new Error("fixture must prove a complete visible success claim survives prefix truncation");
}
if (!fixture.cases.some((item) => item.atCaptureCap && item.expected === "NOT_DECIDABLE_TRUNCATED")) {
  throw new Error("fixture must prove ambiguous truncated prefixes stay undecidable");
}

console.log(`semantic calibration valid: ${fixture.cases.length} cases; ${JSON.stringify(counts)}`);
