import test from "node:test";
import assert from "node:assert/strict";

import { ACCEPTANCE_POLICY, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { expectedRuntimeSealSuites } from "./r7-runtime-seal.mjs";
import { QDRANT_PIN, validateRuntimeSeal } from "./runner-contract.mjs";
import { CAMPAIGN_V2_EXTENDED_POLICY } from "../readiness/lease-v2-contract.mjs";

const hex = "a".repeat(64);
const seal = () => ({
  schemaVersion: "runaai-m1-functional-runtime-seal/v10", sourceCommit: "e".repeat(40),
  caseBundleSha256: CASE_BUNDLE_SHA256,
  runtime: { nodeSha256: hex, sourceArchiveSha256: hex, packageLockSha256: hex,
    qdrantSha256: QDRANT_PIN.sha256, modelRuntimeSha256: hex, modelRuntimeVersion: "synthetic-r14-runtime" },
  candidates: ACCEPTANCE_POLICY.roster.map((item, index) => ({ candidateId: item.candidateId,
    modelId: `r14-model-${index}`, artifactSha256: String(index + 1).repeat(64), artifactBytes: index + 1,
    requestControls: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role,
      { reasoningEffort: index === 1 ? null : "none" }])) })),
  roles: Object.fromEntries(ACCEPTANCE_POLICY.roles.map(role => [role, {
    maximumOutputTokens: ["code", "agent"].includes(role) ? 1536 : role === "review" ? 1024 : 512,
    maximumContextTokens: 32768, deadlineMs: ["code", "agent"].includes(role) ? 30000 : 60000 }])),
  providerBaseUrl: "http://127.0.0.1:9770/v1",
  embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5",
    artifactSha256: hex },
  reranker: { baseUrl: "http://192.168.50.165:8412", artifactSha256: hex,
    windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 },
  residency: { oneLargeModelAtATime: true, readinessEvidenceSha256: hex,
    effectiveReasoningEvidenceSha256: hex, telemetryPolicySha256: hex },
  suites: expectedRuntimeSealSuites(), evaluatorId: "independent-r14-evaluator",
  qualificationCriteria: { schemaVersion: "runaai-m1-r14-qualification-criteria/v1",
    path: "gate7f/function-first/M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md",
    sha256: hex, normalizedSha256: hex, rubricVersion: "2026-09-01.r14-review-stated-control" },
  maximumBatchMs: CAMPAIGN_V2_EXTENDED_POLICY.maximumBatchMs, productionRoutingChanged: false,
});

test("R14 seals the full campaign to the prospective Review stated-control criteria", () => {
  const value = validateRuntimeSeal(seal());
  assert.equal(value.schemaVersion, "runaai-m1-functional-runtime-seal/v10");
  assert.equal(value.roles.review.maximumOutputTokens, 1024);
  assert.equal(value.candidates.length, 3);
});

test("R14 rejects an R13 schema label on R14 criteria", () => {
  const value = seal();
  value.schemaVersion = "runaai-m1-functional-runtime-seal/v9";
  assert.throws(() => validateRuntimeSeal(value));
});
