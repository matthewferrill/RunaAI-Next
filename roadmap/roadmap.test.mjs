import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, REQUIRED_CAPABILITIES, readPlanningContext, validateRoadmap } from "./read-next-slice.mjs";

const catalog = JSON.parse(await readFile(resolve(ROOT, "roadmap/capabilities.json"), "utf8"));
const slice = JSON.parse(await readFile(resolve(ROOT, "roadmap/current-slice.json"), "utf8"));
test("full roadmap is retrievable, references exist and remaining families stay visible", async () => {
  const result = await readPlanningContext();
  assert.equal(result.passed, true);
  assert.equal(result.capabilityCount, catalog.capabilities.length);
  assert.ok(REQUIRED_CAPABILITIES.every(id => catalog.capabilities.some(item => item.id === id)));
  assert.deepEqual(result.remainingCapabilityIds, catalog.capabilities.filter(item => item.state !== "accepted").map(item => item.id));
  assert.equal(result.milestone, slice.milestone);
  assert.match(result.roadmapDigest, /^[a-f0-9]{64}$/);
});
const mutations = [
  ["dropped capability", c => c.capabilities.pop(), /capability-coverage/],
  ["duplicate capability", c => c.capabilities.push(c.capabilities[0]), /capability-coverage/],
  ["M1 equated to product", c => { c.milestone1CompletesRoadmap = true; }, /milestone-is-not-destination/],
  ["omitted third model", c => c.primaryModels.pop(), /three-primary-models/],
  ["unknown dependency", c => c.capabilities[0].dependsOn.push("missing"), /dependencies/],
  ["dependency cycle", c => c.capabilities[0].dependsOn.push("C02"), /dependency-cycle/],
  ["hidden future work", c => { c.capabilities[0].remainingAfterM1 = ""; }, /capability-fields/],
  ["unsupported complete claim", c => { c.capabilities[0].state = "accepted"; }, /acceptance-proof/],
  ["missing evidence", c => { c.capabilities[0].evidence = []; }, /evidence/],
  ["missing milestone", c => { c.capabilities[0].milestones = []; }, /milestone-coverage/],
];
for (const [name, mutate, pattern] of mutations) test(`rejects ${name}`, () => {
  const changed = structuredClone(catalog); mutate(changed);
  assert.throws(() => validateRoadmap(changed, slice), pattern);
});
test("rejects a stale slice revision", () => {
  assert.throws(() => validateRoadmap(catalog, { ...slice, roadmapRevision: "old" }), /stale-slice/);
});
test("rejects unknown slice capability and hidden remaining roadmap", () => {
  assert.throws(() => validateRoadmap(catalog, { ...slice, capabilityIds: ["C99"] }), /unknown-slice/);
  assert.throws(() => validateRoadmap(catalog, { ...slice, remainingRoadmapRequired: false }), /milestone-is-not-destination/);
});
test("rejects unsupported completion, claims and missing completion evidence", () => {
  assert.throws(() => validateRoadmap(catalog, { ...slice, state: "complete" }), /slice-state/);
  assert.throws(() => validateRoadmap(catalog, { ...slice, completionClaim: "Whole product complete" }), /slice-completion-claim/);
  assert.throws(() => validateRoadmap(catalog, { ...slice, state: "accepted", completionEvidence: [] }), /slice-completion-evidence/);
});
test("permits future capabilities and milestones without losing original coverage", () => {
  const expanded = structuredClone(catalog);
  expanded.capabilities.push({ ...structuredClone(expanded.capabilities[0]), id: "C18" });
  assert.equal(validateRoadmap(expanded, slice).capabilityCount, catalog.capabilities.length + 1);
  expanded.currentMilestone = "M2";
  assert.doesNotThrow(() => validateRoadmap(expanded, { ...slice, milestone: "M2", sliceId: "M2-S1",
    completionClaim: "M2 completion is not whole-product completion." }));
});
