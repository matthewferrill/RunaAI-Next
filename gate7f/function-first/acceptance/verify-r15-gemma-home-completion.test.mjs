import test from "node:test";
import assert from "node:assert/strict";

import { createR15GemmaEligibilityManifest, r15GemmaEligibilityManifestSha256,
  validateR15GemmaBatchResult } from "./r15-gemma-eligibility-contract.mjs";
import { parseR15GemmaHomeCompletionArguments, validateR15GemmaCompletionChain }
  from "./verify-r15-gemma-home-completion.mjs";

const h = value => value.repeat(64), commit = "3".repeat(40), prefix = "6".repeat(16), lease = "20260829-campaign-gemma-r99";
function fixture() {
  const arm = createR15GemmaEligibilityManifest({ armId: "r15-gemma-eligibility-1111111111111111",
    createdAt: "2026-09-02T06:00:00Z", candidateArtifactSha256: h("1"), candidateArtifactBytes: 10,
    embeddingArtifactSha256: h("2"), sourceCommit: commit, sourceArchiveSha256: h("4"), sourceTreeManifestSha256: h("5"),
    runtimeSealSha256: h("6"), hardwarePlanSha256: h("7"), qualificationCriteriaSha256: h("8"), controlsSha256: h("9"),
    browserProofSha256: h("a"), homeReadySha256: h("b"), homeLeaseId: lease, homeLeaseSealSha256: h("c") });
  const result = { schemaVersion: "runaai-m1-candidate-batch-result/v2", candidateId: arm.candidateId,
    sourceCommit: arm.sourceCommit, runtimeSealSha256: arm.runtimeSealSha256, caseBundleSha256: arm.caseBundleSha256,
    plannedCampaignAttempts: 360, plannedCandidateAttempts: 120, recordedAttempts: 120,
    attempts: arm.attempts.map(slot => ({ ...slot, file: `${slot.attemptId}.json`, sha256: h("d"), bytes: 10,
      status: "completed", preliminaryGrade: "pass", passed: true, providerCalls: 1, nativeCalls: 0 })),
    notExecuted: [], stopCode: null, denominatorChanged: false, supplemental: false, qualificationCompositionPermitted: false,
    productQualificationPassed: false, independentSemanticReviewPending: true, humanTrialRequired: true,
    productionChanged: false, protectedDataRead: false, healthDiagnosticArtifact: { file: "health-diagnostics.json", sha256: h("e"), bytes: 10 },
    finishedAt: "2026-09-02T07:00:00Z", evidenceDirectory: `acceptance-evidence/campaign-${arm.candidateId}-${prefix}`, cleanupError: null };
  const armManifestSha256 = r15GemmaEligibilityManifestSha256(arm), resultSha256 = h("f"), batch = validateR15GemmaBatchResult(result, arm);
  const validation = { ...batch, schemaVersion: "runaai-m1-r15-gemma-candidate-completion-validation/v1",
    eligibilityManifestSha256: armManifestSha256, batchResultSha256: resultSha256,
    independentSemanticReviewPending: true, humanTrialStillRequired: true };
  const seal = { schemaVersion: "runaai-m1-functional-runtime-seal/v11", sourceCommit: commit,
    caseBundleSha256: arm.caseBundleSha256, runtime: { nodeSha256: h("0"), sourceArchiveSha256: arm.sourceArchiveSha256,
      packageLockSha256: h("0"), qdrantSha256: "369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4",
      modelRuntimeSha256: h("0"), modelRuntimeVersion: "1" },
    candidates: ["qwen36-27b-mtp", "qwen3-coder-30b-a3b", arm.candidateId].map((candidateId, index) => ({ candidateId,
      modelId: candidateId === arm.candidateId ? arm.modelId : `model-${index}`, artifactSha256: candidateId === arm.candidateId ? arm.candidateArtifactSha256 : h(String(index + 1)),
      artifactBytes: candidateId === arm.candidateId ? arm.candidateArtifactBytes : 10,
      requestControls: Object.fromEntries(["chat", "research", "code", "agent", "review"].map(role => [role, { reasoningEffort: null }])) })),
    roles: { chat: { maximumOutputTokens: 512, maximumContextTokens: 2048, deadlineMs: 60000 }, research: { maximumOutputTokens: 512, maximumContextTokens: 2048, deadlineMs: 60000 },
      code: { maximumOutputTokens: 1536, maximumContextTokens: 2048, deadlineMs: 30000 }, agent: { maximumOutputTokens: 1536, maximumContextTokens: 2048, deadlineMs: 30000 },
      review: { maximumOutputTokens: 1024, maximumContextTokens: 2048, deadlineMs: 60000 } }, providerBaseUrl: "http://127.0.0.1:9770/v1",
    embedding: { baseUrl: "http://127.0.0.1:1234/v1", modelId: arm.auxiliaryEmbedding.modelId, artifactSha256: arm.auxiliaryEmbedding.artifactSha256 },
    reranker: { baseUrl: "http://127.0.0.1:8412/v1", artifactSha256: h("0"), windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
    residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: h("0"), effectiveReasoningEvidenceSha256: h("0"), telemetryPolicySha256: arm.hardwarePlanSha256 },
    suites: {}, evaluatorId: "evaluator", maximumBatchMs: 1000, productionRoutingChanged: false,
    qualificationCriteria: { schemaVersion: "runaai-m1-r15-qualification-criteria/v1", path: "gate7f/function-first/M1-S2-R15-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md",
      sha256: arm.qualificationCriteriaSha256, normalizedSha256: h("0"), rubricVersion: "2026-09-01.r15-agent-review-correction" } };
  return { armValue: arm, armFileSha256: h("0"), armManifestSha256, resultValue: result, resultSha256,
    validationValue: validation, validationSha256: h("a"), runtimeSealValue: seal, runtimeSealSha256: arm.runtimeSealSha256,
    sourceTreeManifestSha256: arm.sourceTreeManifestSha256, runtimeSealPrefix: prefix, leaseId: lease, leaseSealSha256: arm.homeLeaseSealSha256 };
}

test("completion chain binds exact arm, result, validation, seal prefix, source tree and lease", () => {
  assert.equal(validateR15GemmaCompletionChain(fixture()).passed, true);
  for (const mutate of [
    value => { value.runtimeSealPrefix = "0".repeat(16); },
    value => { value.armValue = { ...value.armValue, homeLeaseId: "20260829-campaign-gemma-r98" }; },
    value => { value.resultValue = { ...value.resultValue, recordedAttempts: 119 }; },
    value => { value.validationValue = { ...value.validationValue, batchResultSha256: h("0") }; },
    value => { value.sourceTreeManifestSha256 = h("0"); }
  ]) { const value = fixture(); mutate(value); assert.throws(() => validateR15GemmaCompletionChain(value)); }
});

test("completion parser fixes every stage path and rejects a swapped prefix", () => {
  const directory = `acceptance-evidence/campaign-gemma4-26b-a4b-${prefix}`;
  const args = { "owned-root": `C:\\AI\\RunaAI-Next-Candidate\\staging\\m1-task-native-${"f".repeat(32)}`,
    "eligibility-manifest": "acceptance-evidence/r15-gemma-eligibility-arm.json", "eligibility-manifest-file-sha256": h("0"),
    "eligibility-manifest-sha256": h("1"), "batch-result": `${directory}/result.json`, "batch-result-sha256": h("2"),
    "eligibility-validation": `${directory}/eligibility-validation.json`, "eligibility-validation-sha256": h("3"),
    "runtime-seal": "runtime-seal.json", "runtime-seal-sha256": h("6"), "source-tree-manifest": "SOURCE-TREE-MANIFEST.json",
    "source-tree-manifest-sha256": h("5"), "runtime-seal-prefix": prefix, "lease-id": lease, "lease-seal-sha256": h("c"),
    output: `${directory}/home-completion-preflight.json` };
  assert.equal(parseR15GemmaHomeCompletionArguments(Object.entries(args).flatMap(([key, value]) => [`--${key}`, value]))["lease-id"], lease);
  const swapped = structuredClone(args); swapped["runtime-seal-prefix"] = "0".repeat(16);
  assert.throws(() => parseR15GemmaHomeCompletionArguments(Object.entries(swapped).flatMap(([key, value]) => [`--${key}`, value])));
});
