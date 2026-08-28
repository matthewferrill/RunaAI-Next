import test from "node:test";
import assert from "node:assert/strict";
import { MastraM1Planner } from "./planner.mjs";
import { m1FunctionConfigSchema, assertM1Roles } from "./config.mjs";
import { CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION } from "./tasks/contracts.mjs";

const provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: "http://127.0.0.1:1234/v1",
  models: { chat: "chat-model", code: "code-model", research: "research-model", review: "review-model", agent: "agent-model" } };
const valid = { summary: "Inspect only", steps: [{ capabilityId: "project.inspect", arguments: { path: "calculator.js" } }] };
function fixture(overrides = {}) {
  const calls = [], agent = { async generate(prompt, options) { calls.push({ prompt: JSON.parse(prompt), options });
    return { text: JSON.stringify(valid), finishReason: "stop", response: { modelId: "agent-model" }, ...overrides }; } };
  return { calls, planner: new MastraM1Planner({ provider, agent }) };
}
test("planner selects the explicit agent role and returns advice without an execution port", async () => {
  const { calls, planner } = fixture();
  assert.deepEqual(await planner.plan({ objective: "Inspect", snapshot: { files: [] }, signal: new AbortController().signal }), valid);
  assert.equal(calls[0].options.modelSettings.temperature, 0);
  assert.equal(calls[0].options.modelSettings.maxOutputTokens, 1536);
  assert.equal(calls[0].prompt.objective, "Inspect");
  assert.equal(typeof planner.execute, "undefined");
});
for (const [label, result, code] of [
  ["wrong model", { response: { modelId: "chat-model" } }, /model-mismatch/],
  ["truncated response", { finishReason: "length" }, /incomplete/],
  ["missing text", { text: null }, /output-limited/],
  ["invalid JSON", { text: "I ran it" }, /output-invalid/],
  ["forged receipt", { text: JSON.stringify({ ...valid, receipt: { passed: true } }) }, /output-invalid/],
  ["unknown tool", { text: JSON.stringify({ summary: "", steps: [{ capabilityId: "shell", arguments: "dir" }] }) }, /output-invalid/],
  ["oversized output", { text: "x".repeat(24_001) }, /output-limited/],
]) test(`planner refuses ${label}`, async () => { await assert.rejects(fixture(result).planner.plan({ objective: "test" }), code); });
test("aborted or oversized plans never reach the provider", async () => {
  const { planner, calls } = fixture();
  await assert.rejects(planner.plan({ objective: "x".repeat(96_001) }), /input-limited/);
  await assert.rejects(planner.plan({ objective: "inspect", signal: AbortSignal.abort() }), /aborted/);
  assert.equal(calls.length, 0);
});
test("missing agent model never falls back to Code or Chat", () => {
  assert.throws(() => new MastraM1Planner({ provider: { ...provider, models: { ...provider.models, agent: null } } }), /configured/);
});

const config = () => ({ schemaVersion: "runaai-m1-functions/v1", enabled: true,
  scope: "supplied-text-and-disposable-javascript", capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
  requestControls: Object.fromEntries(["chat", "research", "code", "review", "agent"].map(role => [role, { reasoningEffort: null }])),
  qdrant: { endpoint: "http://127.0.0.1:9773", collection: "m1_candidate_sections" },
  embedding: { baseUrl: "http://127.0.0.1:9770/v1", modelId: "text-embedding-nomic-embed-text-v1.5", dimension: 768 },
  reranker: { baseUrl: "http://192.168.50.165:8412", windowCharacters: 2000, overlapCharacters: 300, batchSize: 32 } });
test("feature configuration binds capability digest and the approved auxiliary stack", () => {
  assert.deepEqual(m1FunctionConfigSchema.parse(config()), config()); assert.doesNotThrow(() => assertM1Roles(provider));
  for (const mutation of [value => { value.capabilitySetDigest = "f".repeat(64); },
    value => { value.qdrant.collection = "production"; }, value => { value.embedding.dimension = 1024; },
    value => { value.reranker.batchSize = 64; }, value => { value.hostRoot = "C:/"; },
    value => { value.qdrant.endpoint = "https://example.com"; },
    value => { value.embedding.baseUrl = "http://user:password@127.0.0.1:1234"; }]) {
    const bad = config(); mutation(bad); assert.equal(m1FunctionConfigSchema.safeParse(bad).success, false);
  }
  assert.throws(() => assertM1Roles({ baseUrl: provider.baseUrl, modelId: "legacy" }), /five explicit/);
});
