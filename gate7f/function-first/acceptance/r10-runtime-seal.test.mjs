import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { QDRANT_PIN, validateRuntimeSeal } from "./runner-contract.mjs";
import { expectedRuntimeSealSuites } from "./r7-runtime-seal.mjs";
import { CAMPAIGN_V2_EXTENDED_POLICY } from "../readiness/lease-v2-contract.mjs";
import { R10_SEAL_AUTHORITIES, validateR10Manifest } from "./r10-runtime-seal.mjs";

const hex = "a".repeat(64), sourceCommit = "e".repeat(40);
const candidates = ACCEPTANCE_POLICY.roster.map((item, index) => ({ candidateId: item.candidateId,
  modelId: `r10-model-${index}`, artifactSha256: String(index + 1).repeat(64), artifactBytes: index + 1,
  requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role,
    { reasoningEffort: index === 1 ? null : "none" }])) }));
const seal = () => ({ schemaVersion: "runaai-m1-functional-runtime-seal/v6", sourceCommit,
  caseBundleSha256: CASE_BUNDLE_SHA256,
  runtime: { nodeSha256: hex, sourceArchiveSha256: hex, packageLockSha256: hex, qdrantSha256: QDRANT_PIN.sha256,
    modelRuntimeSha256: hex, modelRuntimeVersion: "synthetic-r10-runtime" }, candidates,
  roles: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, {
    maximumOutputTokens: ["code", "agent"].includes(role) ? 1536 : role === "review" ? 1024 : 512,
    maximumContextTokens: 32768, deadlineMs: ["code", "agent"].includes(role) ? 30000 : 60000 }])),
  providerBaseUrl: "http://127.0.0.1:9770/v1",
  embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", artifactSha256: hex },
  reranker: { baseUrl: "http://192.168.50.165:8412", artifactSha256: hex,
    windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
  residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: hex,
    effectiveReasoningEvidenceSha256: hex, telemetryPolicySha256: hex }, suites: expectedRuntimeSealSuites(),
  qualificationCriteria: { schemaVersion: "runaai-m1-r10-qualification-criteria/v1",
    path: R10_SEAL_AUTHORITIES.criteriaRelativePath, sha256: hex, normalizedSha256: hex,
    rubricVersion: R10_SEAL_AUTHORITIES.rubricVersion }, evaluatorId: "independent-r10-evaluator",
  maximumBatchMs: CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs, productionRoutingChanged: false });
const manifest = () => ({ schemaVersion: "runaai-m1-r10-runtime-seal-input/v1",
  campaignId: R10_SEAL_AUTHORITIES.campaignId, seal: seal(),
  files: { sourceArchivePath: path.resolve("source.tar"), packageLockPath: path.resolve("package-lock.json"),
    criteriaPath: R10_SEAL_AUTHORITIES.criteriaPath, readinessPath: path.resolve("readiness.json"),
    effectiveReasoningPath: path.resolve("reasoning.json"), telemetryPath: path.resolve("telemetry.json") },
  declaration: { createdBeforeInference: true, sourceArchiveCreatedBeforeInference: true, observedR10Attempts: 0,
    importedAttemptCount: 0, selectiveReplacement: false, expectedAnswerTuning: false, partialRoster: false,
    inheritedRuntimeSealSha256: null, productionRoutingChanged: false, protectedDataIncluded: false },
  privateValuesIncluded: false });

test("R10 seals the full roster, corrected Review budget and unchanged extended campaign window", () => {
  const value = validateR10Manifest(manifest());
  assert.equal(validateRuntimeSeal(value.seal).schemaVersion, "runaai-m1-functional-runtime-seal/v6");
  assert.equal(value.seal.roles.review.maximumOutputTokens, 1024);
  assert.equal(value.seal.maximumBatchMs, 75 * 60000);
  assert.equal(value.seal.candidates.length, 3);
  assert.equal(value.seal.caseBundleSha256, CASE_BUNDLE_SHA256);
});

test("R10 rejects retrospective evidence, old Review budget, partial roster and inherited seals", () => {
  for (const mutate of [value => value.declaration.observedR10Attempts = 1,
    value => value.seal.roles.review.maximumOutputTokens = 512, value => value.seal.candidates.pop(),
    value => value.declaration.inheritedRuntimeSealSha256 = hex]) {
    const value = manifest(); mutate(value); assert.throws(() => validateR10Manifest(value));
  }
});
