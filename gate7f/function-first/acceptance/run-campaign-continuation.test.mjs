import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ACCEPTANCE_POLICY, MODEL_CASES } from "./cases.mjs";
import { loadBoundFile, validateContinuationContract } from "./run-campaign-continuation.mjs";

const H = "a".repeat(64), candidateId = "qwen36-27b-mtp";
const ids = Array.from({ length: ACCEPTANCE_POLICY.repetitionsPerCandidateCase }, (_, index) =>
  MODEL_CASES.map(item => `${candidateId}--${item.id}--${index + 1}`)).flat();
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
