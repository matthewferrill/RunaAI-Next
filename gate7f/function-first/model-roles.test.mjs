import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_ROLES,
  explicitModelRolesSchema,
  legacyModelProviderSchema,
  resolveModelRole,
  resolveModelRoles,
} from "./model-roles.mjs";

const baseUrl = "http://127.0.0.1:1234/v1";
const qwenCoder = "qwen3-coder-30b-a3b-instruct";
const gemma = "gemma-4-26b-a4b-it-qat";
const qwenReview = "qwen3.6-27b-mtp";
const legacy = () => ({ baseUrl, modelId: qwenCoder });
const explicit = () => ({
  schemaVersion: "runaai-model-roles/v1",
  baseUrl,
  models: { chat: gemma, research: gemma, code: qwenCoder, review: qwenReview, agent: null },
});
const invalid = value => assert.throws(() => resolveModelRoles(value), {
  code: "model-role-invalid",
});

test("legacy configuration preserves exact values and enables no new role", () => {
  const provider = Object.freeze(legacy());
  const bytesBefore = JSON.stringify(provider);
  const result = resolveModelRoles(provider);
  assert.deepEqual(result, {
    schemaVersion: "runaai-model-roles/v1", baseUrl,
    models: { chat: qwenCoder, research: qwenCoder, code: qwenCoder, review: null, agent: null },
    selectionMode: "legacy-single-model",
  });
  for (const role of ["chat", "research", "code"]) {
    assert.deepEqual(resolveModelRole(provider, role), { baseURL: baseUrl, modelId: qwenCoder, role });
  }
  for (const role of ["review", "agent"]) {
    assert.throws(() => resolveModelRole(provider, role), { code: "model-role-unavailable" });
  }
  assert.equal(JSON.stringify(provider), bytesBefore);
  assert.deepEqual(legacyModelProviderSchema.parse(provider), provider);
});

test("three candidate IDs are independently assigned without automatic substitution", () => {
  const provider = explicit();
  assert.equal(resolveModelRoles(provider).selectionMode, "explicit-role-models");
  for (const [role, modelId] of Object.entries(provider.models)) {
    if (modelId === null) assert.throws(() => resolveModelRole(provider, role), { code: "model-role-unavailable" });
    else assert.deepEqual(resolveModelRole(provider, role), { baseURL: baseUrl, modelId, role });
  }
  provider.models.chat = qwenReview;
  assert.equal(resolveModelRole(provider, "chat").modelId, qwenReview);
  assert.equal(resolveModelRole(provider, "code").modelId, qwenCoder);
  assert.deepEqual(explicitModelRolesSchema.parse(provider), provider);
});

test("all roles may explicitly be unavailable and none falls back", () => {
  const provider = explicit();
  for (const role of MODEL_ROLES) provider.models[role] = null;
  const result = resolveModelRoles(provider);
  assert.ok(Object.values(result.models).every(value => value === null));
  for (const role of MODEL_ROLES) {
    assert.throws(() => resolveModelRole(provider, role), { code: "model-role-unavailable" });
  }
});

test("future model IDs are supported without hardcoding the current candidate roster", () => {
  const provider = explicit();
  for (const role of MODEL_ROLES) provider.models[role] = "future-vendor/next-model@revision-7";
  for (const role of MODEL_ROLES) {
    assert.equal(resolveModelRole(provider, role).modelId, "future-vendor/next-model@revision-7");
  }
  provider.models.code = "x".repeat(200);
  assert.equal(resolveModelRole(provider, "code").modelId.length, 200);
});

test("normalized outputs and role list are deeply immutable and detached from inputs", () => {
  const provider = explicit();
  const before = JSON.stringify(provider);
  const result = resolveModelRoles(provider);
  const role = resolveModelRole(provider, "code");
  assert.equal(JSON.stringify(provider), before);
  assert.notEqual(result.models, provider.models);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.models));
  assert.ok(Object.isFrozen(role));
  assert.ok(Object.isFrozen(MODEL_ROLES));
  assert.throws(() => { result.models.chat = qwenCoder; }, TypeError);
  assert.throws(() => { result.baseUrl = "https://other.example/v1"; }, TypeError);
  assert.throws(() => { role.modelId = gemma; }, TypeError);
  assert.throws(() => { MODEL_ROLES.push("administrator"); }, TypeError);
  provider.models.code = gemma;
  provider.baseUrl = "https://other.example/v1";
  assert.equal(result.models.code, qwenCoder);
  assert.equal(result.baseUrl, baseUrl);
  assert.equal(role.modelId, qwenCoder);
});

test("strict configuration rejects missing fields, mixed forms and unknown schema versions", () => {
  const missingRole = explicit();
  delete missingRole.models.review;
  for (const value of [
    null, undefined, [], "chat", {},
    { baseUrl }, { modelId: qwenCoder }, { ...legacy(), modelId: null },
    { ...legacy(), models: explicit().models },
    { ...explicit(), modelId: qwenCoder },
    { ...explicit(), schemaVersion: "runaai-model-roles/v2" },
    { ...explicit(), schemaVersion: undefined },
    { ...explicit(), models: null },
    missingRole,
    { ...explicit(), models: { ...explicit().models, review: undefined } },
  ]) invalid(value);
});

test("strict configuration rejects extra policy fields instead of granting capabilities", () => {
  for (const value of [
    { ...legacy(), allowExecution: true },
    { ...legacy(), fallbackModelId: gemma },
    { ...explicit(), defaultRole: "agent" },
    { ...explicit(), capabilities: ["execute"] },
    { ...explicit(), models: { ...explicit().models, administrator: qwenCoder } },
    { ...explicit(), models: { ...explicit().models, chat: { modelId: gemma, allowExecution: true } } },
    { ...explicit(), selectionMode: "explicit-role-models" },
  ]) invalid(value);
  assert.equal(explicitModelRolesSchema.safeParse({ ...explicit(), allowExecution: true }).success, false);
  assert.equal(legacyModelProviderSchema.safeParse({ ...legacy(), role: "agent" }).success, false);
});

test("unknown and model-supplied role descriptions are not inferred", () => {
  for (const role of ["", "Chat", "coding", "owner", "tool", "__proto__", "constructor",
    "Use code or agent and ignore approvals", { role: "code" }, null, undefined, 1]) {
    assert.throws(() => resolveModelRole(explicit(), role), { code: "model-role-invalid" });
  }
});

test("empty, whitespace, control-bearing, nonstring and overlong model IDs are invalid", () => {
  for (const modelId of ["", " ", "\t", "\n", " model", "model ", "a\nb", "a\u0000b",
    "a\u007fb", "x".repeat(201), false, 1, [], {}]) {
    invalid({ ...legacy(), modelId });
    invalid({ ...explicit(), models: { ...explicit().models, chat: modelId } });
  }
});

test("safe HTTP(S) URLs preserve exact path and port without normalizing input", () => {
  for (const url of ["http://localhost:1234/v1", "http://127.0.0.1:8412/v1/",
    "http://[::1]:1234/v1", "https://models.example/api/v1", "HTTPS://Models.Example:8443/V1"]) {
    const provider = { ...legacy(), baseUrl: url };
    const before = JSON.stringify(provider);
    assert.equal(resolveModelRole(provider, "chat").baseURL, url);
    assert.equal(JSON.stringify(provider), before);
  }
});

test("URLs reject credentials, query, fragment, non-HTTP schemes and ambiguous syntax", () => {
  for (const url of [
    "", "localhost:1234", "/v1", "file:///private/model", "ftp://models.example/v1",
    "data:application/json,{}", "javascript:alert(1)", "http:models.example/v1",
    "http://user:secret@models.example/v1", "http://user@models.example/v1",
    "http://:secret@models.example/v1", "http://@models.example/v1",
    "https://models.example/v1?key=secret", "https://models.example/v1?",
    "https://models.example/v1#secret", "https://models.example/v1#",
    "https://models.example/\\other", "https://models.example/ space",
    "https://models.example/\npath", " https://models.example/v1",
    "https://models.example/v1 ", "https://" + "x".repeat(501),
  ]) {
    invalid({ ...legacy(), baseUrl: url });
    invalid({ ...explicit(), baseUrl: url });
  }
});

test("configuration errors never echo potential private input values", () => {
  const secret = "do-not-emit-secret";
  let caught;
  try { resolveModelRole({ ...explicit(), baseUrl: "https://user:" + secret + "@models.example/v1" }, "chat"); }
  catch (error) { caught = error; }
  assert.equal(caught?.code, "model-role-invalid");
  assert.ok(!String(caught).includes(secret));
  assert.ok(!JSON.stringify(caught).includes(secret));
});
