import test from "node:test";
import assert from "node:assert/strict";

import { MODEL_CASES, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { parseEquivalentReviewWindowManifest, validateEquivalentReviewTopology } from "./prepare-equivalent-campaign-review.mjs";

const sha = "a".repeat(64);
const manifest = () => ({
  schemaVersion: "runaai-m1-equivalent-campaign-review-windows/v1",
  candidateId: "qwen36-27b-mtp",
  windows: [
    { index: 1, label: "qwen-r41", directory: "r41", result: "r41-result.json",
      resultSha256: sha, expectedAttempts: 68 },
    { index: 2, label: "qwen-r49", directory: "r49", result: "r49-result.json",
      resultSha256: sha, expectedAttempts: 1 },
    { index: 3, label: "qwen-r53", directory: "r53", result: "r53/result.json",
      resultSha256: sha, expectedAttempts: 51 },
  ],
});

test("equivalent review accepts three hash-bound Qwen execution windows totaling 120", () => {
  const windows = parseEquivalentReviewWindowManifest(manifest());
  assert.deepEqual(windows.map(window => window.expectedAttempts), [68, 1, 51]);
});

test("equivalent review rejects a missing, duplicate, reordered, or unbound window", () => {
  for (const mutate of [
    value => { value.windows.pop(); },
    value => { value.windows[2].label = value.windows[1].label; },
    value => { value.windows[2].index = 2; },
    value => { value.windows[2].resultSha256 = "bad"; },
    value => { value.windows[2].unexpected = true; },
  ]) {
    const value = manifest(); mutate(value);
    assert.throws(() => parseEquivalentReviewWindowManifest(value), /window-manifest/u);
  }
});

test("equivalent review rejects a window manifest for another candidate", () => {
  const value = manifest(); value.candidateId = "qwen3-coder-30b-a3b";
  assert.throws(() => parseEquivalentReviewWindowManifest(value), /window-manifest-invalid/u);
});

const ids = candidateId => Array.from({ length: 3 }, (_, repetition) => MODEL_CASES.map(item =>
  `${candidateId}--${item.id}--${repetition + 1}`)).flat();

function topology() {
  const qwen = ids("qwen36-27b-mtp"), spans = [[1, 68], [69, 69], [70, 120]];
  const windows = spans.map(([startOrdinal, endOrdinal], index) => ({ index: index + 1,
    startOrdinal, endOrdinal, recordedAttempts: endOrdinal - startOrdinal + 1,
    resultSha256: String(index + 1).repeat(64), runtimeSealSha256: String(index + 4).repeat(64) }));
  return {
    inputs: [
      { label: "gemma", candidateId: "gemma4-26b-a4b", attemptIds: ids("gemma4-26b-a4b") },
      { label: "coder", candidateId: "qwen3-coder-30b-a3b", attemptIds: ids("qwen3-coder-30b-a3b") },
      ...spans.map(([startOrdinal, endOrdinal], index) => ({ label: `qwen-${index + 1}`,
        candidateId: "qwen36-27b-mtp", windowIndex: index + 1, resultSha256: windows[index].resultSha256,
        runtimeSealSha256: windows[index].runtimeSealSha256, attemptIds: qwen.slice(startOrdinal - 1, endOrdinal) })),
    ],
    composed: { schemaVersion: "runaai-m1-equivalence-audited-candidate-result/v1", candidateId: "qwen36-27b-mtp",
      caseBundleSha256: CASE_BUNDLE_SHA256, recordedAttempts: 120, attempts: qwen.map(attemptId => ({ attemptId })),
      executionWindows: structuredClone(windows) },
    audit: { schemaVersion: "runaai-m1-candidate-history-equivalence-audit/v1", candidateId: "qwen36-27b-mtp",
      caseBundleSha256: CASE_BUNDLE_SHA256, modelFacingEquivalent: true, completedPrefixImmutable: true,
      singleUninterruptedArmClaimed: false, qualificationCompositionPermitted: true,
      independentSemanticReviewPending: true, executionWindows: structuredClone(windows) },
  };
}

test("equivalent review binds complete candidate labels to their canonical rosters", () => {
  const value = topology();
  validateEquivalentReviewTopology(value);
  [value.inputs[0], value.inputs[1]] = [value.inputs[1], value.inputs[0]];
  value.inputs[0].label = "gemma"; value.inputs[1].label = "coder";
  assert.throws(() => validateEquivalentReviewTopology(value), /review-complete-candidate-boundary-invalid/u);
});

test("equivalent review binds each Qwen window to its exact ordinal slice, result, and seal", () => {
  for (const mutate of [
    value => { [value.inputs[2].attemptIds[67], value.inputs[3].attemptIds[0]] =
      [value.inputs[3].attemptIds[0], value.inputs[2].attemptIds[67]]; },
    value => { value.audit.executionWindows[1].runtimeSealSha256 = "f".repeat(64);
      value.composed.executionWindows[1].runtimeSealSha256 = "f".repeat(64); },
    value => { value.audit = { modelFacingEquivalent: true }; },
  ]) {
    const value = topology(); mutate(value);
    assert.throws(() => validateEquivalentReviewTopology(value), /review-(window-)?composition-boundary-invalid/u);
  }
});
