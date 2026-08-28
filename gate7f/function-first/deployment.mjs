import assert from "node:assert/strict";
import { canonicalJson, sha256 } from "../../gate4/canonical.mjs";
import { explicitModelRolesSchema } from "./model-roles.mjs";
import { m1FunctionConfigSchema, assertM1Roles } from "./config.mjs";
import { summarizeCampaign } from "./acceptance/assertions.mjs";

const hash = value => sha256(canonicalJson(value));
export const M1_CANDIDATE_MODELS = Object.freeze({
  "gemma4-26b-a4b": "gemma-4-26b-a4b-it-qat",
  "qwen3-coder-30b-a3b": "qwen3-coder-30b-a3b-instruct",
  "qwen36-27b-mtp": "qwen3.6-27b-mtp",
});

/** Recompute the denominator from retained independent grades, never a supplied winner label. */
export function requireQualifiedRoleSelection(grades, provider) {
  assertM1Roles(provider);
  const campaign = summarizeCampaign(grades);
  assert.equal(campaign.controls.allPassed, true, "m1-deploy-controls-unqualified");
  assert.equal(campaign.runtimeSealConsistent, true, "m1-deploy-runtime-unbound");
  assert.equal(campaign.duplicateKeys.length + campaign.invalid.length, 0, "m1-deploy-grade-ledger-invalid");
  for (const candidate of campaign.candidates) for (const role of candidate.roles) {
    assert.equal(role.missing + role.blocked + role.notImplemented, 0, "m1-deploy-campaign-incomplete");
    assert.equal(role.criticalProductFailures, 0, "m1-deploy-product-failure");
  }
  for (const [role, modelId] of Object.entries(provider.models)) {
    const candidate = campaign.candidates.find(item => M1_CANDIDATE_MODELS[item.candidateId] === modelId);
    assert.equal(candidate?.roles.find(item => item.role === role)?.qualified, true, "m1-deploy-selected-role-unqualified");
  }
  return campaign;
}

/** No I/O, no secret reads, no mutation. The exact sealed plan selects the only allowed differences. */
export function assertM1SuccessorProjection(prior, successor, plan) {
  assert.equal(plan?.schemaVersion, "runaai-m1-successor-plan/v1");
  assert.deepEqual(Object.keys(plan).sort(), ["schemaVersion", "priorConfigurationDigest", "successorConfigurationDigest",
    "provider", "functionFirst", "caddyConfigurationDigest", "acceptanceGradesSha256", "runtimeSealSha256"].sort());
  for (const value of [plan.priorConfigurationDigest, plan.successorConfigurationDigest, plan.caddyConfigurationDigest,
    plan.acceptanceGradesSha256, plan.runtimeSealSha256]) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(hash(prior), plan.priorConfigurationDigest, "m1-deploy-prior-config-drift");
  assert.equal(hash(successor), plan.successorConfigurationDigest, "m1-deploy-successor-config-drift");
  assert.equal(prior.mode, "active"); assert.equal(successor.mode, "active");
  assert.equal(successor.schemaVersion, "runa2-gate6b-release-config/v2");
  assert.equal(successor.publicBaseUrl, "https://runa.bridgebuildersai.com");
  assert.equal(successor.bind.host, "127.0.0.1"); assert.equal(successor.bind.port, 9760);
  assert.equal(successor.limits.totalDeadlineMs, 60_000);
  const provider = explicitModelRolesSchema.parse(plan.provider); assertM1Roles(provider);
  const functions = m1FunctionConfigSchema.parse(plan.functionFirst);
  assert.equal(provider.baseUrl, prior.provider.baseUrl, "m1-deploy-provider-boundary-drift");
  assert.equal(canonicalJson(successor.provider), canonicalJson(provider));
  assert.equal(canonicalJson(successor.functionFirst), canonicalJson(functions));
  assert.equal(successor.services.caddy.configurationDigest, plan.caddyConfigurationDigest);
  // Normalize only the explicitly enumerated M1 differences. Every identity,
  // authority, key reference, store, deadline and unrelated service stays exact.
  const preserved = structuredClone(successor);
  preserved.schemaVersion = prior.schemaVersion;
  preserved.provider = structuredClone(prior.provider);
  preserved.services.caddy.configurationDigest = prior.services.caddy.configurationDigest;
  if (Object.hasOwn(prior, "functionFirst")) preserved.functionFirst = structuredClone(prior.functionFirst);
  else delete preserved.functionFirst;
  assert.equal(canonicalJson(preserved), canonicalJson(prior), "m1-deploy-protected-binding-drift");
  return Object.freeze({ passed: true, authorityChanged: false, identityChanged: false,
    protectedProductDataChanged: false, privateValuesIncluded: false,
    priorConfigurationDigest: plan.priorConfigurationDigest, successorConfigurationDigest: plan.successorConfigurationDigest });
}
