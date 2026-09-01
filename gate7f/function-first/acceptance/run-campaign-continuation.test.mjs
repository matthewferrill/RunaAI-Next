import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";
import { createContinuationHistoryPlan, loadBoundFile, validateContinuationContract, validateContinuationHistoryContract } from "./run-campaign-continuation.mjs";

const H = "a".repeat(64), candidateId = "qwen36-27b-mtp";
const ids = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) =>
  MODEL_CASES.map(item => `${candidateId}--${item.id}--${index + 1}`)).flat();
const rows = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) =>
  MODEL_CASES.map(item => ({ attemptId: `${candidateId}--${item.id}--${index + 1}`,
    candidateId, caseId: item.id, role: item.role, repetition: index + 1 }))).flat();
const candidate = { candidateId, artifactSha256: H, requestControls: { code: { reasoningEffort: "medium" } } };
const seal = (sourceCommit, archive) => ({ schemaVersion: "x", sourceCommit, caseBundleSha256: H,
  candidates: [structuredClone(candidate)], embedding: { artifactSha256: H }, evaluatorId: "e", maximumBatchMs: 1,
  productionRoutingChanged: false, providerBaseUrl: "http://127.0.0.1", qualificationCriteria: {}, reranker: {},
  residency: { effectiveReasoningEvidenceSha256: H, oneLargeModelAtATime: true, readinessEvidenceSha256: H,
    telemetryPolicySha256: H }, roles: {}, suites: {}, runtime: { sourceArchiveSha256: archive,
    modelRuntimeSha256: H, modelRuntimeVersion: "1", nodeSha256: H, packageLockSha256: H, qdrantSha256: H } });

function fixture() {
  const retained = 68, priorRuntimeSealSha256 = "b".repeat(64), priorResultSha256 = "c".repeat(64);
  const priorSeal = seal("1".repeat(40), "d".repeat(64));
  const currentSeal = seal("2".repeat(40), "e".repeat(64));
  currentSeal.residency.telemetryPolicySha256 = "f".repeat(64);
  return { campaign: { "candidate-id": candidateId }, priorSeal, currentSeal,
    bindings: { priorRuntimeSealSha256, priorResultSha256 },
    priorResult: { candidateId, runtimeSealSha256: priorRuntimeSealSha256, recordedAttempts: 70,
      attempts: ids.slice(0, 70).map(attemptId => ({ attemptId })) },
    plan: { schemaVersion: "runaai-m1-campaign-continuation-plan/v1", continuation: true, supplemental: true,
      candidateId, retainedPrefixAttempts: retained, resumeAttemptId: ids[retained],
      plannedCandidateAttempts: 52, plannedCampaignAttempts: 52, attempts: ids.slice(retained).map(attemptId => ({ attemptId })),
      discardedHistoricalAttempts: ids.slice(retained, 70), priorRuntimeSealSha256, priorResultSha256 } };
}

test("exact continuation retains 68 identities, reruns only the two non-model rows, and proves model-facing equivalence first", () => {
  const value = validateContinuationContract(fixture());
  assert.deepEqual(value.attemptIds, ids.slice(68));
  assert.equal(value.prior.recordedAttempts, 68);
  assert.deepEqual(value.equivalence.sealDifferences,
    ["residency.telemetryPolicySha256", "runtime.sourceArchiveSha256", "sourceCommit"]);
});

test("continuation rejects a skipped identity and any model-facing seal change", () => {
  const skipped = fixture(); skipped.plan.attempts.splice(3, 1); skipped.plan.plannedCandidateAttempts -= 1;
  skipped.plan.plannedCampaignAttempts -= 1;
  assert.throws(() => validateContinuationContract(skipped), /m1-campaign-continuation-plan-invalid/u);
  const changed = fixture(); changed.currentSeal.candidates[0].artifactSha256 = "9".repeat(64);
  assert.throws(() => validateContinuationContract(changed), /(?:model-facing-seal-mismatch|unexpected-runtime-seal-difference)/u);
});

function historyFixture() {
  const firstSealSha = "1".repeat(64), secondSealSha = "2".repeat(64), manifestSha = "3".repeat(64);
  const currentSeal = seal("3".repeat(40), "f".repeat(64)); currentSeal.residency.telemetryPolicySha256 = "9".repeat(64);
  const firstSeal = seal("1".repeat(40), "d".repeat(64)); firstSeal.residency.telemetryPolicySha256 = "7".repeat(64);
  const secondSeal = seal("2".repeat(40), "e".repeat(64)); secondSeal.residency.telemetryPolicySha256 = "8".repeat(64);
  const definitions = [
    { index: 1, kind: "original", result: "history/1/result.json", resultSha256: "4".repeat(64),
      sourcePlan: "history/1/plan.json", planSha256: "6".repeat(64), runtimeSeal: "history/1/seal.json",
      runtimeSealSha256: firstSealSha, retainedAttempts: 68, startOrdinal: 1, endOrdinal: 68 },
    { index: 2, kind: "continuation", result: "history/2/result.json", resultSha256: "5".repeat(64),
      sourcePlan: "history/2/plan.json", planSha256: "7".repeat(64), runtimeSeal: "history/2/seal.json",
      runtimeSealSha256: secondSealSha, retainedAttempts: 1, startOrdinal: 69, endOrdinal: 69 },
  ];
  const result = (definition, sourceCommit, offset) => ({ candidateId, sourceCommit,
    runtimeSealSha256: definition.runtimeSealSha256, caseBundleSha256: H, recordedAttempts: definition.retainedAttempts,
    plannedCandidateAttempts: 120 - offset, attempts: structuredClone(rows.slice(offset, offset + definition.retainedAttempts)),
    notExecuted: ids.slice(offset + definition.retainedAttempts),
    stopCode: "m1-campaign-unknown-failure" });
  const basePlan = { candidateId, attempts: structuredClone(rows) };
  const history = { schemaVersion: "runaai-m1-campaign-continuation-history/v1", candidateId,
    basePlan: "history/base-plan.json", basePlanSha256: "8".repeat(64), retainedPrefixAttempts: 69,
    resumeAttemptId: ids[69], windows: definitions };
  const windows = [{ definition: definitions[0], result: result(definitions[0], firstSeal.sourceCommit, 0),
    plan: { candidateId, sourceCommit: firstSeal.sourceCommit, runtimeSealSha256: firstSealSha, caseBundleSha256: H,
      attempts: structuredClone(rows) }, seal: firstSeal },
    { definition: definitions[1], result: result(definitions[1], secondSeal.sourceCommit, 68),
      plan: { candidateId, sourceCommit: secondSeal.sourceCommit, runtimeSealSha256: secondSealSha, caseBundleSha256: H,
        attempts: structuredClone(rows.slice(68)) }, seal: secondSeal }];
  const provenance = { schemaVersion: "runaai-m1-campaign-continuation-provenance/v1", historyManifestSha256: manifestSha,
    basePlanSha256: history.basePlanSha256, retainedPrefixAttempts: 69, resumeAttemptId: ids[69],
    priorWindows: definitions.map((value, index) => ({ index: value.index, kind: value.kind, startOrdinal: value.startOrdinal,
      endOrdinal: value.endOrdinal, resultSha256: value.resultSha256, planSha256: value.planSha256,
      runtimeSealSha256: value.runtimeSealSha256, retainedAttempts: value.retainedAttempts,
      sourceCommit: windows[index].result.sourceCommit })), singleUninterruptedArmClaimed: false };
  const plan = { ...basePlan, schemaVersion: "runaai-m1-campaign-continuation-plan/v2", continuation: true, supplemental: true,
    historyManifestSha256: manifestSha, basePlanSha256: history.basePlanSha256, retainedPrefixAttempts: 69,
    resumeAttemptId: ids[69], plannedCandidateAttempts: 51, plannedCampaignAttempts: 51,
    attempts: rows.slice(69), continuationHistory: provenance };
  return { campaign: { "candidate-id": candidateId }, plan, history, windows, currentSeal,
    bindings: { historyManifestSha256: manifestSha, basePlanSha256: history.basePlanSha256, basePlan } };
}

test("multi-window continuation retains 68 plus 1 exact identities and proves every prior seal equivalent before attempt70", () => {
  const value = validateContinuationHistoryContract(historyFixture());
  assert.deepEqual(value.attemptIds, ids.slice(69)); assert.equal(value.priorHistory.retainedPrefixAttempts, 69);
  assert.equal(value.equivalence.priorWindows.length, 2); assert.equal(value.equivalence.finalExecutionWindowIndex, 3);
  assert(value.equivalence.priorWindows.every(window => window.sealDifferences.includes("sourceCommit")));
});

test("multi-window preparation derives the exact 51-row plan and disclosed three-window audit", () => {
  const value = historyFixture(), fullPlan = value.bindings.basePlan;
  const prepared = createContinuationHistoryPlan({ ...value, fullPlan });
  assert.equal(prepared.plan.schemaVersion, "runaai-m1-campaign-continuation-plan/v2");
  assert.equal(prepared.plan.retainedPrefixAttempts, 69); assert.equal(prepared.plan.resumeAttemptId, ids[69]);
  assert.deepEqual(prepared.plan.attempts.map(row => row.attemptId), ids.slice(69));
  assert.equal(prepared.audit.priorWindows.length, 2); assert.equal(prepared.audit.finalExecutionWindowIndex, 3);
  const altered = structuredClone(fullPlan); altered.attempts[68].attemptId = ids[69];
  assert.throws(() => createContinuationHistoryPlan({ ...value, fullPlan: altered }), /full-plan-invalid/u);
});

test("multi-window continuation rejects gaps, duplicate identities, unbound files and model-facing drift", () => {
  const gap = historyFixture(); gap.windows[1].result.attempts[0].attemptId = ids[70];
  assert.throws(() => validateContinuationHistoryContract(gap), /history-prefix-invalid/u);
  const unbound = historyFixture(); unbound.windows[1].result.runtimeSealSha256 = "6".repeat(64);
  assert.throws(() => validateContinuationHistoryContract(unbound), /history-window-invalid/u);
  const changed = historyFixture(); changed.windows[0].seal.candidates[0].artifactSha256 = "6".repeat(64);
  assert.throws(() => validateContinuationHistoryContract(changed), /(?:model-facing-seal-mismatch|unexpected-runtime-seal-difference)/u);
  const overlap = historyFixture(); overlap.windows[1].result.attempts[0].attemptId = ids[67];
  assert.throws(() => validateContinuationHistoryContract(overlap), /history-prefix-invalid/u);
});

test("multi-window continuation rejects a changed 68 plus 1 split, reversed kinds, and extra windows", () => {
  const split = historyFixture(); split.history.windows[0].retainedAttempts = 67;
  assert.throws(() => validateContinuationHistoryContract(split), /history-window-invalid/u);
  const reversed = historyFixture(); reversed.history.windows[0].kind = "continuation";
  assert.throws(() => validateContinuationHistoryContract(reversed), /history-window-invalid/u);
  const extra = historyFixture(); extra.history.windows.push(structuredClone(extra.history.windows[1]));
  assert.throws(() => validateContinuationHistoryContract(extra), /history-invalid/u);
});

test("multi-window continuation rejects wrong notExecuted, source plan, and row identity metadata", () => {
  const notExecuted = historyFixture(); notExecuted.windows[1].result.notExecuted.shift();
  assert.throws(() => validateContinuationHistoryContract(notExecuted), /history-prefix-invalid/u);
  const sourcePlan = historyFixture(); sourcePlan.windows[1].plan.attempts.shift();
  assert.throws(() => validateContinuationHistoryContract(sourcePlan), /history-(?:prefix|window)-invalid/u);
  const identity = historyFixture(); identity.windows[1].result.attempts[0].repetition = 99;
  assert.throws(() => validateContinuationHistoryContract(identity), /history-prefix-invalid/u);
});

test("runner accepts a hash-bound continuation plan in a contained nested preparation directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-continuation-path-"));
  const nested = path.join(root, "acceptance-evidence", "prepared-continuation");
  await mkdir(nested, { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: "runaai-m1-campaign-continuation-plan/v1" })}\n`);
  await writeFile(path.join(nested, "continuation-plan.json"), bytes, { flag: "wx" });
  const value = await loadBoundFile(root, path.join("acceptance-evidence", "prepared-continuation", "continuation-plan.json"),
    createHash("sha256").update(bytes).digest("hex"), "plan");
  assert.equal(value.schemaVersion, "runaai-m1-campaign-continuation-plan/v1");
});

test("runner rejects a direct path outside acceptance evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-continuation-outside-"));
  await mkdir(path.join(root, "acceptance-evidence"));
  const bytes = Buffer.from("{}\n"), outside = path.join(root, "outside.json");
  await writeFile(outside, bytes, { flag: "wx" });
  await assert.rejects(loadBoundFile(root, "outside.json", createHash("sha256").update(bytes).digest("hex"), "plan"),
    /m1-campaign-continuation-plan-path/u);
});

test("runner rejects a junction that escapes acceptance evidence", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-continuation-junction-"));
  const evidence = path.join(root, "acceptance-evidence"), outside = path.join(root, "outside");
  await Promise.all([mkdir(evidence), mkdir(outside)]);
  const bytes = Buffer.from("{}\n");
  await writeFile(path.join(outside, "plan.json"), bytes, { flag: "wx" });
  try {
    await symlink(outside, path.join(evidence, "escape"), "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return t.skip(`junction unavailable: ${error.code}`);
    throw error;
  }
  await assert.rejects(loadBoundFile(root, path.join("acceptance-evidence", "escape", "plan.json"),
    createHash("sha256").update(bytes).digest("hex"), "plan"), /m1-campaign-continuation-plan-path/u);
});
