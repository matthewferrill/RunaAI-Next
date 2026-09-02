import test from "node:test";
import assert from "node:assert/strict";

import { createR15GemmaEligibilityManifest, r15GemmaEligibilityManifestSha256 } from "./r15-gemma-eligibility-contract.mjs";
import { validateR15GemmaBrowserProof } from "./prepare-r15-gemma-eligibility-arm.mjs";
import { parseR15GemmaCampaignArguments, validateDurableR15GemmaResult,
  validateR15GemmaLaunchBinding } from "./run-r15-gemma-eligibility-campaign.mjs";
import { CASE_BUNDLE_SHA256 } from "./cases.mjs";

const h = character => character.repeat(64), commit = "3".repeat(40);
const manifest = createR15GemmaEligibilityManifest({
  armId: "r15-gemma-eligibility-1111111111111111", createdAt: "2026-09-02T06:00:00.000Z",
  candidateArtifactSha256: h("1"), candidateArtifactBytes: 123, embeddingArtifactSha256: h("2"),
  sourceCommit: commit, sourceArchiveSha256: h("4"), sourceTreeManifestSha256: h("5"), runtimeSealSha256: h("6"),
  hardwarePlanSha256: h("7"), qualificationCriteriaSha256: h("8"), controlsSha256: h("9"), browserProofSha256: h("a"),
  homeReadySha256: h("b"), homeLeaseId: "20260902-campaign-gemma-eligibility-r1", homeLeaseSealSha256: h("c")
});
const campaign = { mode: "scored", "owned-root": "C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-" + "f".repeat(32),
  "source-commit": commit, "runtime-seal": "runtime-seal.json", "runtime-seal-sha256": h("6"),
  controls: "acceptance-evidence/controls.json", "controls-sha256": h("9"), "candidate-id": "gemma4-26b-a4b",
  "home-ready": "acceptance-evidence/home-ready.json", "home-ready-sha256": h("b"),
  "hardware-plan": "campaign-hardware-plan.json", "hardware-plan-sha256": h("7"),
  "home-status": "acceptance-evidence/home-live.json", "browser-checkpoints": "true" };
const seal = { candidates: [{ candidateId: "gemma4-26b-a4b", modelId: manifest.modelId,
  artifactSha256: manifest.candidateArtifactSha256, artifactBytes: manifest.candidateArtifactBytes }],
embedding: { modelId: manifest.auxiliaryEmbedding.modelId, artifactSha256: manifest.auxiliaryEmbedding.artifactSha256 },
qualificationCriteria: { sha256: manifest.qualificationCriteriaSha256 }, runtime: { sourceArchiveSha256: manifest.sourceArchiveSha256 } };

test("R15 campaign parser has no operator-selectable candidate and requires the arm pin", () => {
  const argv = Object.entries(campaign).flatMap(([key, value]) => [`--${key}`, value]).concat([
    "--eligibility-manifest", "acceptance-evidence/r15-gemma-eligibility-arm.json",
    "--eligibility-manifest-sha256", r15GemmaEligibilityManifestSha256(manifest)
  ]);
  assert.equal(parseR15GemmaCampaignArguments(argv).campaign["candidate-id"], "gemma4-26b-a4b");
  const changed = [...argv], index = changed.indexOf("--candidate-id"); changed[index + 1] = "qwen36-27b-mtp";
  assert.throws(() => parseR15GemmaCampaignArguments(changed), /r15-gemma-campaign-argument-invalid/u);
  assert.throws(() => parseR15GemmaCampaignArguments(argv.slice(0, -2)), /r15-gemma-campaign-argument-invalid/u);
});

test("launch binding fixes source, controls, lease, Gemma artifact, Nomic-only auxiliary, and criteria", () => {
  assert.equal(validateR15GemmaLaunchBinding({ manifest, manifestSha256: r15GemmaEligibilityManifestSha256(manifest),
    campaign, seal, sourceTreeManifestSha256: manifest.sourceTreeManifestSha256 }).candidateId, "gemma4-26b-a4b");
  for (const mutate of [
    value => { value.campaign["controls-sha256"] = h("0"); },
    value => { value.campaign["home-ready-sha256"] = h("0"); },
    value => { value.seal.candidates[0].artifactSha256 = h("0"); },
    value => { value.seal.embedding.modelId = "other"; },
    value => { value.seal.qualificationCriteria.sha256 = h("0"); }
  ]) {
    const changed = { campaign: structuredClone(campaign), seal: structuredClone(seal) }; mutate(changed);
    assert.throws(() => validateR15GemmaLaunchBinding({ manifest,
      manifestSha256: r15GemmaEligibilityManifestSha256(manifest),
      sourceTreeManifestSha256: manifest.sourceTreeManifestSha256, ...changed }), /r15-gemma-campaign-launch-binding/u);
  }
  assert.throws(() => validateR15GemmaLaunchBinding({ manifest,
    manifestSha256: r15GemmaEligibilityManifestSha256(manifest), campaign, seal,
    sourceTreeManifestSha256: h("0") }), /r15-gemma-campaign-launch-binding/u);
});

test("only a complete model-free R15 browser publication proof is admitted", () => {
  const proof = { schemaVersion: "runaai-m1-r15-browser-publication-control/v1", sourceCommit: commit,
    runtimeSealSha256: h("6"), caseBundleSha256: CASE_BUNDLE_SHA256, passed: true, modelsInvoked: false,
    actualBrowserExercised: true, witnessOnTime: true, acknowledgementOnTime: true, witnessBeforeAcknowledgement: true,
    acknowledgementConsumed: true, nativeReleaseWithinCeiling: true, productionChanged: false, protectedDataRead: false,
    privateValuesIncluded: false };
  assert.equal(validateR15GemmaBrowserProof(proof, { sourceCommit: commit, runtimeSealSha256: h("6") }).passed, true);
  for (const field of ["passed", "actualBrowserExercised", "witnessOnTime", "acknowledgementOnTime",
    "witnessBeforeAcknowledgement", "acknowledgementConsumed", "nativeReleaseWithinCeiling"]) {
    const changed = { ...proof, [field]: false };
    assert.throws(() => validateR15GemmaBrowserProof(changed, { sourceCommit: commit, runtimeSealSha256: h("6") }),
      /r15-gemma-arm-browser-proof-invalid/u);
  }
});

test("durable result validation accepts formatting changes but rejects semantic disk mutation", () => {
  const returnedResult = { schemaVersion: "runaai-m1-candidate-batch-result/v2", candidateId: manifest.candidateId,
    sourceCommit: manifest.sourceCommit, runtimeSealSha256: manifest.runtimeSealSha256,
    caseBundleSha256: manifest.caseBundleSha256, plannedCampaignAttempts: 360, plannedCandidateAttempts: 120,
    recordedAttempts: 120, attempts: manifest.attempts.map(slot => ({ ...slot, file: `${slot.attemptId}.json`, sha256: h("d"),
      bytes: 1, status: "completed", preliminaryGrade: "pass", passed: true, providerCalls: 1, nativeCalls: 0 })),
    notExecuted: [], stopCode: null, denominatorChanged: false, supplemental: false, qualificationCompositionPermitted: false,
    productQualificationPassed: false, independentSemanticReviewPending: true, humanTrialRequired: true,
    productionChanged: false, protectedDataRead: false, healthDiagnosticArtifact: { file: "health-diagnostics.json", sha256: h("e"), bytes: 1 },
    finishedAt: "2026-09-02T07:00:00Z", evidenceDirectory: `acceptance-evidence/campaign-${manifest.candidateId}-${manifest.runtimeSealSha256.slice(0, 16)}`,
    cleanupError: null };
  const formatted = Buffer.from(`${JSON.stringify(returnedResult, null, 4)}\n`);
  assert.equal(validateDurableR15GemmaResult({ returnedResult, resultBytes: formatted, manifest }).validation.reviewedAttempts, 120);
  const changed = structuredClone(returnedResult); changed.attempts[0].passed = false;
  assert.throws(() => validateDurableR15GemmaResult({ returnedResult, resultBytes: Buffer.from(JSON.stringify(changed)), manifest }),
    /r15-gemma-campaign-result-durable-mismatch/u);
});
