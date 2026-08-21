import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runDirectSelectorMeasurement, syntheticCurrentScaleLessons } from "./measurement.mjs";

const corpus = JSON.parse(readFileSync(new URL("./SYNTHETIC-RETRIEVAL-CORPUS.json", import.meta.url), "utf8"));

test("Gate 4E baseline matches the protected aggregate shape without protected content", () => {
  const lessons = syntheticCurrentScaleLessons();
  assert.equal(lessons.length, 53);
  assert.deepEqual(Object.fromEntries(["personal", "project", "capability", "global"].map(scope =>
    [scope, lessons.filter(item => item.scope === scope).length])), { personal: 1, project: 5, capability: 16, global: 31 });
});

test("Gate 4E direct selector is deterministic, bounded, and safe on sealed attacks", () => {
  const result = runDirectSelectorMeasurement(corpus);
  assert.equal(result.deterministic, true);
  assert.equal(result.boundsPassed, true);
  assert.equal(result.safetyPassed, true);
  assert.equal(result.metrics["lexical-positive"].recallAt6, 1);
  assert.equal(result.metrics["honest-miss"].falseSelections, 0);
  assert.equal(result.metrics["cross-scope-attack"].falseSelections, 0);
  assert.equal(result.metrics["forbidden-attack"].falseSelections, 0);
  assert.ok(result.latency.p95Milliseconds <= result.latency.thresholdMilliseconds);
});

test("Gate 4E result is aggregate-only and skips an unjustified current index", () => {
  const result = runDirectSelectorMeasurement(corpus);
  const serialized = JSON.stringify(result);
  assert.equal(result.vectorArmRun, false);
  assert.equal(result.bgeArmRun, false);
  assert.equal(result.decision, "skip-current-approved-knowledge-index");
  assert.deepEqual(result.remeasureAtLessonCounts, [530, 5300]);
  assert.doesNotMatch(serialized, /global-deployment|participant-a|project-a|rollback checkpoints/);
});
