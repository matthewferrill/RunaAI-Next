import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passingResponseForCase } from "../grader.mjs";
import { summarizeCapture } from "./summarize-capture.mjs";

const corpus = JSON.parse(readFileSync(new URL("../corpus.json", import.meta.url), "utf8"));
const observations = corpus.cases.flatMap(item => [1, 2, 3].map(attempt => ({
  schemaVersion: "runa2-gate7f1-observation/v1", candidateId: "synthetic", caseId: item.caseId,
  attempt, modelId: "synthetic-test-only", artifactSha256: "a".repeat(64),
  runtimeFingerprintSha256: "b".repeat(64), rawResponse: passingResponseForCase(item),
  elapsedMs: 100, generationTokens: 10, generatedTokensPerSecond: 20,
})));
const capture = { candidate: "synthetic", passed: true, cleanupVerified: true, observedRuns: 105 };
test("summary requires complete capture and verified cleanup in addition to sealed grades", () => {
  assert.equal(summarizeCapture(corpus, observations, [], capture).eligible, true);
  for (const change of [{ passed: false }, { cleanupVerified: false }, { observedRuns: 104 }, { candidate: "other" }]) {
    assert.equal(summarizeCapture(corpus, observations, [], { ...capture, ...change }).validForComparison, false);
  }
});
test("partial evidence cannot become a passing comparison", () => {
  const result = summarizeCapture(corpus, observations.slice(0, 3), [], { ...capture, observedRuns: 3 });
  assert.equal(result.grade.decidable, false);
  assert.equal(result.eligible, false);
  assert.equal(result.grade.requiredRuns, 105);
});
test("missing telemetry remains missing rather than invented", () => {
  const result = summarizeCapture(corpus, [], [], { ...capture, passed: false, observedRuns: 0 });
  assert.equal(result.timing.timeToFirstTokenMs.median, null);
  assert.equal(result.timing.loadMs, null);
  assert.equal(result.hardware.hostFreeBytes.minimum, null);
});
test("summary separates GPU baseline and unload recovery and reports sample peaks", () => {
  const events = ["before-load", "after-load", "after-unload"].map((label, index) => ({
    type: "telemetry", label, freeMemoryBytes: 1000 - index,
    gpus: [{ index: 0, usedMemoryMiB: index === 1 ? 14000 : 1627, temperatureC: 40 + index, powerWatts: 60 }],
  }));
  const result = summarizeCapture(corpus, observations, events, capture);
  assert.equal(result.hardware.gpus[0].memoryMiB.maximum, 14000);
  assert.equal(result.hardware.gpus[0].afterUnload.usedMemoryMiB, 1627);
  assert.match(result.hardware.sampling, /not continuous/);
});
