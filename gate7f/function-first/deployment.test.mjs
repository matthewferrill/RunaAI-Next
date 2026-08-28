import assert from "node:assert/strict";
import test from "node:test";
import predecessor from "../../gate7a/fixtures/control-predecessor.json" with { type: "json" };
import { canonicalJson, sha256 } from "../../gate4/canonical.mjs";
import { CAPABILITY_SET_VERSION, CAPABILITY_SET_DIGEST } from "./tasks/contracts.mjs";
import { assertM1SuccessorProjection, requireQualifiedRoleSelection } from "./deployment.mjs";

const hash = value => sha256(canonicalJson(value));
function fixture() {
  const prior = structuredClone(predecessor.config);
  prior.mode = "active"; prior.limits.totalDeadlineMs = 60_000;
  prior.publicBaseUrl = "https://runa.bridgebuildersai.com";
  const successor = structuredClone(prior);
  successor.schemaVersion = "runa2-gate6b-release-config/v2";
  successor.provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: prior.provider.baseUrl,
    models: Object.fromEntries(["chat", "research", "review", "code", "agent"].map(role => [role, "gemma-4-26b-a4b-it-qat"])) };
  successor.functionFirst = { schemaVersion: "runaai-m1-functions/v1", enabled: true,
    scope: "supplied-text-and-disposable-javascript", capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST,
    requestControls: Object.fromEntries(["chat", "research", "review", "code", "agent"].map(role => [role, { reasoningEffort: "none" }])),
    qdrant: { endpoint: "http://127.0.0.1:9773", collection: "m1_candidate_sections" },
    embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", dimension: 768 },
    reranker: { baseUrl: "http://192.168.50.165:8412", windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 } };
  successor.services.caddy.configurationDigest = "c".repeat(64);
  const reseal = () => ({ schemaVersion: "runaai-m1-successor-plan/v1", priorConfigurationDigest: hash(prior),
    successorConfigurationDigest: hash(successor), provider: structuredClone(successor.provider),
    functionFirst: structuredClone(successor.functionFirst), caddyConfigurationDigest: successor.services.caddy.configurationDigest,
    acceptanceGradesSha256: "a".repeat(64), runtimeSealSha256: "b".repeat(64) });
  return { prior, successor, reseal };
}

test("M1 projection preserves the full predecessor except exactly sealed feature/provider/Caddy differences", () => {
  const { prior, successor, reseal } = fixture(), before = canonicalJson(prior), after = canonicalJson(successor);
  const result = assertM1SuccessorProjection(prior, successor, reseal());
  assert.equal(result.passed, true); assert.equal(result.authorityChanged, false);
  assert.equal(canonicalJson(prior), before); assert.equal(canonicalJson(successor), after);
});

test("resealing cannot authorize drift to protected bindings or resource ceilings", () => {
  const mutations = [v => v.keyRefs.coreEncryption = "file:other-key", v => v.databaseUrlRef = "file:other-db",
    v => v.keycloak.clientId = "other", v => v.openfga.storeId = "other", v => v.sourceGeneration = "other",
    v => v.cutoverId = "other", v => v.limits.maxRequestBytes++, v => v.limits.upstreamDeadlineMs++,
    v => v.services.postgresql.version = "other", v => v.services.caddy.version = "other", v => v.releaseManifestPath = "other.json"];
  for (const mutate of mutations) {
    const { prior, successor, reseal } = fixture(); mutate(successor);
    assert.throws(() => assertM1SuccessorProjection(prior, successor, reseal()), /m1-deploy-protected-binding-drift/);
  }
});

test("unsealed config changes, wider interfaces and unexpected plan fields fail closed", () => {
  const { prior, successor, reseal } = fixture(), plan = reseal();
  successor.provider.models.chat = "qwen3.6-27b-mtp";
  assert.throws(() => assertM1SuccessorProjection(prior, successor, plan), /m1-deploy-successor-config-drift/);
  successor.provider.baseUrl = "http://127.0.0.1:1234/v1";
  assert.throws(() => assertM1SuccessorProjection(prior, successor, reseal()), /m1-deploy-provider-boundary-drift/);
  const fresh = fixture(); fresh.successor.functionFirst.scope = "host-files";
  assert.throws(() => assertM1SuccessorProjection(fresh.prior, fresh.successor, fresh.reseal()));
  assert.throws(() => assertM1SuccessorProjection(prior, successor, { ...plan, ignoreFailures: true }));
});

test("missing acceptance cannot be converted into a deployment winner", () => {
  const { successor } = fixture();
  assert.throws(() => requireQualifiedRoleSelection([], successor.provider), /m1-deploy-controls-unqualified/);
});
