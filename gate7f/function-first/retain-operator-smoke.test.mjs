import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyOperatorSmoke } from "./retain-operator-smoke.mjs";

async function retained(name) {
  const base = new URL(`./readiness/evidence/20260828-actual-adapter-${name}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("EXPORT.json", base)));
  const events = [];
  for (const [file, facts] of Object.entries(manifest.files)) {
    const bytes = await readFile(new URL(file, base));
    assert.equal(bytes.length, facts.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), facts.sha256);
    events.push(JSON.parse(bytes));
  }
  return events;
}

for (const candidate of ["gemma", "coder", "qwen"]) test(`${candidate} retained raw wire passes without being called functional qualification`, async () => {
  const result = verifyOperatorSmoke(await retained(candidate));
  assert.equal(result.passed, true); assert.equal(result.scored, false);
  assert.equal(result.actualFunctionQualificationIncluded, false); assert.equal(result.actualQdrantJourneyIncluded, false);
});

test("a claimed pass cannot hide a partial response, model mismatch or changed control", async () => {
  const events = await retained("gemma");
  for (const change of [
    values => values.splice(values.findIndex(value => value.type === "response"), 1),
    values => { const event = values.find(value => value.type === "response"); const response = JSON.parse(event.rawText); response.model = "other"; event.rawText = JSON.stringify(response); },
    values => { const event = values.find(value => value.type === "response"); const response = JSON.parse(event.rawText); response.choices[0].finish_reason = "length"; event.rawText = JSON.stringify(response); },
    values => values.find(value => value.type === "request").input.reasoning_effort = null,
    values => values.filter(value => value.type === "residency").at(-1).loaded.pop(),
    values => values.at(-1).result.scored = true,
  ]) { const altered = structuredClone(events); change(altered); assert.throws(() => verifyOperatorSmoke(altered)); }
});
