import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, sha256 } from "../gate4/canonical.mjs";
import { sourceSection } from "../gate1/core.mjs";
import { MemoryIndex, MemoryRecordStore, ScriptedProvider } from "../gate1/adapters/memory.mjs";
import { MastraAnswerProvider } from "../gate1/adapters/mastra-provider.mjs";
import { Gate2ReadOnlyService } from "../gate2/core.mjs";
import { MemoryContinuityStore, MemoryWorkspaceResolver } from "../gate2/continuity.mjs";
import { syntheticRelease } from "../gate6/fixtures.mjs";
import { assertReleaseManifest, buildReleaseManifest, releaseRuntimeStatus } from "../gate6/release.mjs";
import { loadReleaseConfig } from "./release-config.mjs";
import { assertConfiguredReleaseModel, createReleaseAnswerProviders, releaseModelIdentity } from "./model-role-providers.mjs";

// Deterministic provider plumbing, not live-model or durable-store qualification.
const digest = value => sha256(canonicalJson(value));
const baseUrl = "http://127.0.0.1:1234/v1";
const qwen = "qwen3-coder-30b-a3b-instruct";
const gemma = "gemma-4-26b-a4b-it-qat";
const review = "qwen3.6-27b-mtp";
const legacyProvider = () => ({ baseUrl, modelId: qwen });
const roleProvider = () => ({ schemaVersion: "runaai-model-roles/v1", baseUrl,
  models: { chat: gemma, research: review, code: qwen, review, agent: gemma } });

function configFor(provider = legacyProvider()) {
  const service = { version: "synthetic", configurationDigest: "a".repeat(64) };
  return {
    schemaVersion: provider.schemaVersion ? "runa2-gate6b-release-config/v2" : "runa2-gate6b-release-config/v1",
    profile: "release", mode: "shadow", bind: { host: "127.0.0.1", port: 9760 },
    publicBaseUrl: "https://192.168.50.20:9761", releaseManifestPath: "release.json",
    sourceGeneration: "legacy-runaai:synthetic-source", targetGeneration: "runaai-next:synthetic-target",
    cutoverId: "synthetic-m1", databaseUrlRef: "file:secrets/database-url",
    keyRefs: { coreEncryption: "file:secrets/core-encryption", coreHmac: "file:secrets/core-hmac",
      learningEncryption: "file:secrets/learning-encryption", learningHmac: "file:secrets/learning-hmac",
      telemetryHmac: "file:secrets/telemetry-hmac" },
    keycloak: { issuer: "http://127.0.0.1:9762/realms/runaai-next", clientId: "runaai-next",
      clientCredentialRef: "file:secrets/keycloak-client" },
    gate6c: { enabled: false, legacyCommit: "b".repeat(40), expectedPrincipalId: "synthetic-owner" },
    openfga: { baseUrl: "http://127.0.0.1:9763", storeId: "synthetic-store", modelId: "synthetic-model",
      credentialRef: "file:secrets/openfga-token" },
    provider, services: { postgresql: service, keycloak: service, openfga: service, caddy: service },
    limits: { maxRequestBytes: 262144, totalDeadlineMs: 30000, upstreamDeadlineMs: 10000 },
  };
}

function manifestInput(config) {
  const old = syntheticRelease();
  return { releaseId: old.releaseId, commit: old.commit, artifactDigest: old.artifactDigest,
    configurationDigest: digest(config), applicationEntryPoint: old.applicationEntryPoint,
    services: old.services, model: releaseModelIdentity(config.provider) };
}

function manifestFor(config) {
  return buildReleaseManifest(manifestInput(config), {
    schemaVersion: config.schemaVersion.endsWith("/v2") ? "runa2-gate6-release/v2" : "runa2-gate6-release/v1",
  });
}

async function temporaryConfig(t) {
  const root = await mkdtemp(join(tmpdir(), "runa-m1-role-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "candidate.json");
  return { path, async load(value) {
    await writeFile(path, JSON.stringify(value), "utf8");
    return loadReleaseConfig(path);
  } };
}

test("legacy release constructs exactly the same three answer providers", () => {
  const calls = [];
  const selected = createReleaseAnswerProviders(legacyProvider(), { createProvider: options => {
    calls.push(options); return { selected: options };
  } });
  assert.deepEqual(Object.keys(selected).sort(), ["chat", "code", "research"]);
  assert.deepEqual(calls, ["chat", "research", "code"].map(role => ({
    baseURL: baseUrl, modelId: qwen, role, providerName: "private-openai-compatible",
  })));
  for (const role of ["chat", "research", "code"]) assert.equal(selected[role].selected.role, role);
});

test("explicit role selection uses exact independent model IDs without activating review or agent", () => {
  const calls = [];
  const raw = roleProvider();
  const before = JSON.stringify(raw);
  const selected = createReleaseAnswerProviders(raw, { createProvider: options => {
    calls.push(options); return { selected: options };
  } });
  assert.deepEqual(calls, ["chat", "research", "code"].map(role => ({
    baseURL: baseUrl, modelId: raw.models[role], role, providerName: "private-openai-compatible",
  })));
  assert.deepEqual(Object.keys(selected).sort(), ["chat", "code", "research"]);
  assert.equal(JSON.stringify(raw), before);
});

test("disabled roles expose a typed unavailable provider and never call the provider factory", async () => {
  const raw = roleProvider();
  raw.models.chat = null;
  raw.models.code = null;
  const calls = [];
  const selected = createReleaseAnswerProviders(raw, { createProvider: options => {
    calls.push(options); return { async answer() { return { answer: "synthetic" }; } };
  } });
  assert.deepEqual(calls.map(value => value.role), ["research"]);
  for (const role of ["chat", "code"]) {
    await assert.rejects(selected[role].answer({}, {}), { code: "provider-role-unavailable" });
  }
  assert.equal(calls.length, 1);
});

test("release model identities preserve raw-provider digests and record every explicit role", () => {
  const old = legacyProvider();
  assert.deepEqual(releaseModelIdentity(old), {
    provider: "private-openai-compatible", modelId: qwen, configurationDigest: digest(old),
  });
  const raw = roleProvider();
  const selected = releaseModelIdentity(raw);
  assert.deepEqual(selected, {
    provider: "private-openai-compatible", models: raw.models, configurationDigest: digest(raw),
  });
  raw.models.review = gemma;
  assert.notEqual(releaseModelIdentity(raw).configurationDigest, selected.configurationDigest);
  assert.equal(selected.models.review, review);
  raw.baseUrl = "http://127.0.0.1:8412/v1";
  assert.notEqual(releaseModelIdentity(raw).configurationDigest, selected.configurationDigest);
});

test("legacy fixture manifest digest and runtime version remain byte-semantically compatible", () => {
  const manifest = syntheticRelease();
  assert.equal(manifest.schemaVersion, "runa2-gate6-release/v1");
  assert.equal(manifest.manifestDigest, "14ea5158ab7adf992843dd7d74a604a63c132dc484fbf3faa96e575802c8d434");
  assert.deepEqual(assertReleaseManifest(manifest), manifest);
  const status = releaseRuntimeStatus({ manifest, authorityGeneration: "synthetic", phase: "candidate-ready", revision: 1 });
  assert.equal(status.schemaVersion, "runa2-gate6-runtime-status/v1");
  assert.equal(status.model.modelId, qwen);
});

test("explicit release manifests are versioned separately and runtime status preserves the role map", () => {
  const config = configFor(roleProvider());
  const manifest = manifestFor(config);
  assert.equal(manifest.schemaVersion, "runa2-gate6-release/v2");
  assert.deepEqual(assertReleaseManifest(manifest), manifest);
  const status = releaseRuntimeStatus({ manifest, authorityGeneration: "synthetic", phase: "candidate-ready", revision: 1 });
  assert.equal(status.schemaVersion, "runa2-gate6-runtime-status/v2");
  assert.deepEqual(status.model, manifest.model);
  assert.equal(status.model.models.review, review);
  assert.equal(status.model.models.agent, gemma);
  assert.throws(() => buildReleaseManifest(manifestInput(config)), { code: "release-model-invalid" });
});

test("manifest/config identity verification accepts exact pairs and rejects role, endpoint, digest or version drift", () => {
  for (const provider of [legacyProvider(), roleProvider()]) {
    const config = configFor(provider);
    const manifest = manifestFor(config);
    assert.doesNotThrow(() => assertConfiguredReleaseModel(manifest, config));
    const wrongEndpoint = structuredClone(config);
    wrongEndpoint.provider.baseUrl = "http://127.0.0.1:8412/v1";
    const wrongRole = structuredClone(config);
    if (wrongRole.provider.models) wrongRole.provider.models.code = gemma;
    else wrongRole.provider.modelId = gemma;
    const wrongSchema = structuredClone(config);
    wrongSchema.schemaVersion = wrongSchema.schemaVersion.endsWith("/v1")
      ? "runa2-gate6b-release-config/v2" : "runa2-gate6b-release-config/v1";
    for (const bad of [wrongEndpoint, wrongRole, wrongSchema]) {
      assert.throws(() => assertConfiguredReleaseModel(manifest, bad), { code: "release-model-config-mismatch" });
    }
    const wrongDigest = structuredClone(manifest);
    wrongDigest.model.configurationDigest = "f".repeat(64);
    assert.throws(() => assertConfiguredReleaseModel(wrongDigest, config), { code: "release-model-config-mismatch" });
    const extra = structuredClone(manifest);
    extra.model.extraRole = "secret-canary";
    assert.throws(() => assertConfiguredReleaseModel(extra, config), error =>
      error.code === "release-model-config-mismatch" && !String(error).includes("secret-canary"));
  }
});

test("v1 config preserves exact parsed values and canonical digest, including BOM handling", async t => {
  const fixture = await temporaryConfig(t);
  const config = configFor();
  const loaded = await fixture.load(config);
  assert.deepEqual(loaded.value, config);
  assert.equal(loaded.configurationDigest, digest(config));
  assert.deepEqual(loaded.boundary.provider, { baseUrl, expectedModel: qwen, presentedModel: qwen });
  await writeFile(fixture.path, `\uFEFF${JSON.stringify(config)}`, "utf8");
  assert.equal((await loadReleaseConfig(fixture.path)).configurationDigest, loaded.configurationDigest);
  assert.equal(await readFile(fixture.path, "utf8"), `\uFEFF${JSON.stringify(config)}`);
});

test("v2 config preserves explicit nulls and assignments without expanding roles", async t => {
  const fixture = await temporaryConfig(t);
  const provider = roleProvider();
  provider.models.review = null;
  provider.models.agent = null;
  provider.models.research = null;
  const config = configFor(provider);
  const loaded = await fixture.load(config);
  assert.deepEqual(loaded.value, config);
  assert.equal(loaded.configurationDigest, digest(config));
  assert.equal(loaded.value.provider.models.review, null);
  assert.equal(loaded.value.provider.models.research, null);
});

test("config version paths reject mixed schemas, missing/extra roles, invalid URLs and no enabled answer role", async t => {
  const fixture = await temporaryConfig(t);
  const explicit = configFor(roleProvider());
  const old = configFor();
  const missingRole = structuredClone(explicit);
  delete missingRole.provider.models.agent;
  const noAnswer = structuredClone(explicit);
  for (const role of ["chat", "research", "code"]) noAnswer.provider.models[role] = null;
  const privateUrl = structuredClone(explicit);
  privateUrl.provider.baseUrl = "http://username:password@127.0.0.1:1234/v1";
  const extra = structuredClone(explicit);
  extra.provider.models.owner = gemma;
  for (const bad of [
    { ...old, schemaVersion: "runa2-gate6b-release-config/v2" },
    { ...explicit, schemaVersion: "runa2-gate6b-release-config/v1" },
    { ...explicit, schemaVersion: "runa2-gate6b-release-config/v3" },
    { ...explicit, automaticApproval: true }, missingRole, noAnswer, privateUrl, extra,
  ]) {
    await assert.rejects(fixture.load(bad), error => String(error.code).startsWith("release-config-"));
  }
});

const projectId = "synthetic-m1-project";
const principalId = "synthetic-m1-participant";
const source = () => sourceSection({ projectId, sourceId: "synthetic-source", sectionId: "selected",
  content: "The selected project uses a green fixture." });
const request = (id, lane, message) => ({
  schemaVersion: "runa2-answer-request/v2", requestId: id, lane,
  participant: { principalId, verified: true }, project: { projectId }, thread: { threadId: `thread-${id}` },
  message, history: [], workspace: lane === "workspace"
    ? { sources: [{ sourceId: "synthetic-source", sectionId: "selected" }] } : null,
  budgets: { deadlineMs: 1000, maximumPasses: 8, maximumPassages: 8, maximumEvidenceCharacters: 8000 },
});

function serviceWith(providers) {
  const selectedSource = source();
  const records = new MemoryRecordStore([selectedSource]);
  const index = new MemoryIndex({ references: [{ ...selectedSource }] });
  const continuity = new MemoryContinuityStore();
  continuity.seedProject({ participantId: principalId, projectId, displayName: "Synthetic M1" });
  const service = new Gate2ReadOnlyService({ records, index, continuity, providers,
    workspaceResolver: new MemoryWorkspaceResolver([selectedSource]) });
  return { service, records, index, continuity };
}

test("actual Gate2 answer lanes use the independently selected provider and preserve scope", async () => {
  const calls = [];
  const provider = roleProvider();
  const selected = createReleaseAnswerProviders(provider, { createProvider: options => {
    calls.push(options);
    return new ScriptedProvider({ modelId: options.modelId, role: options.role,
      reply: ({ request: input, evidence }) => ({ answer: `Synthetic ${options.role}: ${input.message}`,
        citations: evidence.map(item => ({ sourceId: item.sourceId, sectionId: item.sectionId })) }) });
  } });
  const context = serviceWith(selected);
  for (const [lane, role, message] of [
    ["general", "chat", "Hello Runa"], ["guarded", "chat", "What does this project say?"],
    ["research", "research", "What does this project say?"],
    ["workspace", "code", "Explain the selected material"], ["code", "code", "Draft a simple addition function"],
  ]) {
    const response = await context.service.answer(request(`route-${lane}`, lane, message));
    assert.equal(response.model.role, role);
    assert.equal(response.model.modelId, provider.models[role]);
    assert.equal(response.completion.reason, "complete");
    assert.equal(response.continuity.turnRecorded, true);
    assert.equal(response.participantId, principalId);
    assert.equal(response.projectId, projectId);
    assert.deepEqual(response.effects, []);
    if (["guarded", "research", "workspace"].includes(lane)) assert.equal(response.citations.length, 1);
  }
  assert.equal(calls.length, 3);
  assert.equal(selected.chat.calls.length, 2);
  assert.equal(selected.research.calls.length, 1);
  assert.equal(selected.code.calls.length, 2);
});

test("disabled Code role cannot fall back or record a false completed conversation", async () => {
  const provider = roleProvider();
  provider.models.code = null;
  const calls = [];
  const selected = createReleaseAnswerProviders(provider, { createProvider: options => {
    calls.push(options); return new ScriptedProvider({ modelId: options.modelId, role: options.role });
  } });
  const context = serviceWith(selected);
  const response = await context.service.answer(request("disabled-code", "code", "Draft an addition function"));
  assert.equal(response.completion.reason, "provider-role-unavailable");
  assert.equal(response.continuity.turnRecorded, false);
  assert.equal(context.continuity.chats.size, 0);
  assert.equal(context.records.turns.length, 0);
  assert.equal(calls.some(value => value.role === "code"), false);
  assert.equal(selected.chat.calls.length, 0);
  assert.equal(selected.research.calls.length, 0);
  assert.deepEqual(response.effects, []);
});

test("real Mastra adapter rejects a mismatched model response through Gate2 without recording success", async () => {
  let generated = 0;
  const agent = { async generate() {
    generated += 1;
    return { text: "Untrusted wrong-model output", finishReason: "stop", response: { modelId: "unexpected-model" } };
  } };
  const selected = createReleaseAnswerProviders(roleProvider(), { createProvider: options =>
    new MastraAnswerProvider({ ...options, agent, verifierAgent: agent }) });
  const context = serviceWith(selected);
  const response = await context.service.answer(request("wrong-model", "general", "Hello Runa"));
  assert.equal(generated, 1);
  assert.equal(response.completion.reason, "provider-model-mismatch");
  assert.equal(response.continuity.turnRecorded, false);
  assert.equal(context.continuity.chats.size, 0);
  assert.doesNotMatch(response.answer, /Untrusted wrong-model output/);
  assert.deepEqual(response.effects, []);
});
