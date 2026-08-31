import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyOperatorSmoke } from "./retain-operator-smoke.mjs";
import { SMOKE_POLICY } from "./operator-smoke.mjs";

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

test("the current smoke verifier requires the added Research checker call and shifted exact ceilings", async () => {
  const events = structuredClone(await retained("gemma"));
  events[0].policy = SMOKE_POLICY;
  const requests = events.filter(value => value.type === "request");
  const responses = events.filter(value => value.type === "response");
  const researchCheckerRequest = structuredClone(requests[1]); researchCheckerRequest.role = "research";
  const researchCheckerResponse = structuredClone(responses[1]); researchCheckerResponse.role = "research";
  const reviewPrimary = requests[2]; reviewPrimary.input.max_tokens = 1024;
  const reviewResponse = responses[2];
  const reviewCheckerRequest = structuredClone(reviewPrimary); reviewCheckerRequest.role = "review";
  const reviewCheckerResponse = structuredClone(reviewResponse); reviewCheckerResponse.role = "review";
  const reviewRequestIndex = events.findIndex(value => value.type === "request" && value.role === "review");
  events.splice(reviewRequestIndex, 0, researchCheckerRequest, researchCheckerResponse);
  const codeRequestIndex = events.findIndex(value => value.type === "request" && value.role === "code");
  events.splice(codeRequestIndex, 0, reviewCheckerRequest, reviewCheckerResponse);
  events.at(-1).result.providerCalls = 9;
  assert.equal(verifyOperatorSmoke(events).calls.length, 9);

  const missingResearchChecker = structuredClone(events);
  missingResearchChecker.splice(missingResearchChecker.findIndex((value, index) => index > 0
    && value.type === "request" && value.role === "research"), 1);
  assert.throws(() => verifyOperatorSmoke(missingResearchChecker));
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
