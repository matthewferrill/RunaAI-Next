import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";
import { composeEquivalentCandidateHistoryResult } from "./compose-equivalent-candidate-result.mjs";
import { prepareContinuationHistory } from "./prepare-campaign-continuation-history.mjs";
import { createSupplementalExecutionPlan } from "./run-model-campaign.mjs";

const H = "a".repeat(64), candidateId = "qwen36-27b-mtp";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const rows = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) => MODEL_CASES.map(item => ({
  attemptId: `${candidateId}--${item.id}--${index + 1}`, candidateId, caseId: item.id,
  role: item.role, repetition: index + 1 }))).flat();
const seal = (sourceCommit, archive, telemetry) => ({ schemaVersion: "seal/v1", sourceCommit,
  caseBundleSha256: H, candidates: [{ candidateId, modelId: "sealed-model", artifactSha256: H,
    requestControls: { agent: { reasoningEffort: "medium" } } }], embedding: { artifactSha256: H },
  evaluatorId: "e", maximumBatchMs: 1, productionRoutingChanged: false, providerBaseUrl: "http://127.0.0.1",
  qualificationCriteria: {}, reranker: {}, residency: { effectiveReasoningEvidenceSha256: H,
    oneLargeModelAtATime: true, readinessEvidenceSha256: H, telemetryPolicySha256: telemetry },
  roles: {}, suites: {}, runtime: { sourceArchiveSha256: archive, modelRuntimeSha256: H,
    modelRuntimeVersion: "1", nodeSha256: H, packageLockSha256: H, qdrantSha256: H } });

async function writeJson(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); await writeFile(file, bytes, { flag: "wx" }); return sha256(bytes);
}

test("file-backed 68 plus 1 preparation reconstructs the canonical plan and composes exactly 120 rows", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m1-history-integration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = path.join(root, "acceptance-evidence"), one = path.join(evidence, "history", "1"),
    two = path.join(evidence, "history", "2");
  await Promise.all([mkdir(one, { recursive: true }), mkdir(two, { recursive: true })]);
  const currentSeal = seal("3".repeat(40), "3".repeat(64), "3".repeat(64));
  const firstSeal = seal("1".repeat(40), "1".repeat(64), "1".repeat(64));
  const secondSeal = seal("2".repeat(40), "2".repeat(64), "2".repeat(64));
  const currentSealPath = path.join(root, "runtimeSeal.json"), currentSealSha256 = await writeJson(currentSealPath, currentSeal);
  const firstSealSha256 = await writeJson(path.join(one, "runtimeSeal.json"), firstSeal);
  const secondSealSha256 = await writeJson(path.join(two, "runtimeSeal.json"), secondSeal);
  const basePlan = { schemaVersion: "base/v2", createdAt: "2026-09-01T00:00:00.000Z", candidateId,
    modelId: "sealed-model", roster: [candidateId], sourceCommit: currentSeal.sourceCommit,
    runtimeSealSha256: currentSealSha256, caseBundleSha256: H, controlsSha256: "4".repeat(64),
    readySha256: "5".repeat(64), hardwarePlanSha256: "6".repeat(64), lifecycleVersion: "v2",
    dispatchStopAt: "2099-01-01T00:00:00.000Z", applicationHardStopAt: "2099-01-01T01:00:00.000Z",
    plannedCampaignAttempts: 360, plannedCandidateAttempts: 120, attempts: rows };
  const basePlanPath = path.join(evidence, "base-plan.json"), basePlanSha256 = await writeJson(basePlanPath, basePlan);
  const sourcePlan = (sealValue, runtimeSealSha256, offset) => ({ ...basePlan, sourceCommit: sealValue.sourceCommit,
    runtimeSealSha256, plannedCampaignAttempts: 120 - offset, plannedCandidateAttempts: 120 - offset,
    attempts: rows.slice(offset), supplemental: offset > 0 });
  const firstPlan = sourcePlan(firstSeal, firstSealSha256, 0), secondPlan = sourcePlan(secondSeal, secondSealSha256, 68);
  const firstPlanSha256 = await writeJson(path.join(one, "plan.json"), firstPlan);
  const secondPlanSha256 = await writeJson(path.join(two, "plan.json"), secondPlan);
  const result = (sealValue, runtimeSealSha256, offset, count) => ({ candidateId,
    sourceCommit: sealValue.sourceCommit, runtimeSealSha256, caseBundleSha256: H,
    plannedCandidateAttempts: 120 - offset, recordedAttempts: count, attempts: rows.slice(offset, offset + count),
    notExecuted: rows.slice(offset + count).map(value => value.attemptId), stopCode: "m1-campaign-operator-stop" });
  const firstResult = result(firstSeal, firstSealSha256, 0, 68), secondResult = result(secondSeal, secondSealSha256, 68, 1);
  const firstResultSha256 = await writeJson(path.join(one, "result.json"), firstResult);
  const secondResultSha256 = await writeJson(path.join(two, "result.json"), secondResult);
  const definitions = [{ index: 1, kind: "original", startOrdinal: 1, endOrdinal: 68, retainedAttempts: 68,
    result: "acceptance-evidence/history/1/result.json", resultSha256: firstResultSha256,
    sourcePlan: "acceptance-evidence/history/1/plan.json", planSha256: firstPlanSha256,
    runtimeSeal: "acceptance-evidence/history/1/runtimeSeal.json", runtimeSealSha256: firstSealSha256 },
  { index: 2, kind: "continuation", startOrdinal: 69, endOrdinal: 69, retainedAttempts: 1,
    result: "acceptance-evidence/history/2/result.json", resultSha256: secondResultSha256,
    sourcePlan: "acceptance-evidence/history/2/plan.json", planSha256: secondPlanSha256,
    runtimeSeal: "acceptance-evidence/history/2/runtimeSeal.json", runtimeSealSha256: secondSealSha256 }];
  const history = { schemaVersion: "runaai-m1-campaign-continuation-history/v1", candidateId,
    basePlan: "acceptance-evidence/base-plan.json", basePlanSha256, retainedPrefixAttempts: 69,
    resumeAttemptId: rows[69].attemptId, windows: definitions };
  const historyPath = path.join(evidence, "history.json"), historyManifestSha256 = await writeJson(historyPath, history);
  const prepared = await prepareContinuationHistory({ "owned-root": root, "candidate-id": candidateId,
    "full-plan": "acceptance-evidence/base-plan.json", "full-plan-sha256": basePlanSha256,
    "history-manifest": "acceptance-evidence/history.json", "history-manifest-sha256": historyManifestSha256,
    "current-runtime-seal": "runtimeSeal.json", "current-runtime-seal-sha256": currentSealSha256,
    "output-directory": "acceptance-evidence/prepared" });
  assert.equal(prepared.retainedPrefixAttempts, 69); assert.equal(prepared.continuationAttempts, 51);
  const continuationPlan = JSON.parse(await readFile(path.join(prepared.outputDirectory, "continuation-plan.json")));
  const executable = createSupplementalExecutionPlan({ fullPlan: basePlan,
    supplementalAttemptIds: rows.slice(69).map(value => value.attemptId),
    supplementalPriorHistory: continuationPlan.continuationHistory, suppliedPlan: continuationPlan });
  assert.equal(executable.modelId, "sealed-model"); assert.equal(executable.attempts.length, 51);
  const finalResult = { candidateId, sourceCommit: currentSeal.sourceCommit, runtimeSealSha256: currentSealSha256,
    caseBundleSha256: H, plannedCandidateAttempts: 51, recordedAttempts: 51,
    attempts: rows.slice(69), notExecuted: [], stopCode: null };
  const windows = [{ definition: definitions[0], result: firstResult, plan: firstPlan, seal: firstSeal,
    resultSha256: firstResultSha256, planSha256: firstPlanSha256, runtimeSealSha256: firstSealSha256 },
  { definition: definitions[1], result: secondResult, plan: secondPlan, seal: secondSeal,
    resultSha256: secondResultSha256, planSha256: secondPlanSha256, runtimeSealSha256: secondSealSha256 }];
  const composed = composeEquivalentCandidateHistoryResult({ history, windows, basePlan, finalResult,
    continuationPlan: executable, currentSeal, bindings: { historyManifestSha256, basePlanSha256,
      currentRuntimeSealSha256: currentSealSha256, finalResultSha256: "7".repeat(64),
      loadedFinalResultSha256: "7".repeat(64), finalPlanSha256: "8".repeat(64), loadedFinalPlanSha256: "8".repeat(64) } });
  assert.equal(composed.result.recordedAttempts, 120); assert.equal(composed.result.executionWindows.length, 3);
  assert.equal(composed.result.attempts[69].attemptId, rows[69].attemptId);
});
