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
  const result = await planner.plan({ objective: "Inspect", snapshot: { files: [] }, signal: new AbortController().signal });
  assert.deepEqual({ summary: result.summary, steps: result.steps }, valid);
  assert.equal(result.planningProtocol.providerAttemptCount, 1);
  assert.equal(result.planningProtocol.correctionCount, 0);
  assert.equal(result.planningProtocol.attempts[0].violations.length, 0);
  assert.equal(calls[0].options.modelSettings.temperature, 0);
  assert.equal(calls[0].options.modelSettings.maxOutputTokens, 1536);
  assert.equal(calls[0].prompt.objective, "Inspect");
  assert.equal(typeof planner.execute, "undefined");
});

test("planner makes one advisory correction and records both attempts without expanding authority", async () => {
  const rejected = { summary: "Preview only", steps: [{ capabilityId: "project.preview-change",
    arguments: { path: "calculator.js", content: "new", expectedSha256: "a".repeat(64) } }] };
  const corrected = { summary: "Preview and apply", steps: [...rejected.steps, { capabilityId: "project.apply-change",
    arguments: structuredClone(rejected.steps[0].arguments) }] };
  let index = 0;
  const calls = [], agent = { async generate(prompt) { calls.push(JSON.parse(prompt));
    return { text: JSON.stringify(index++ === 0 ? rejected : corrected), finishReason: "stop", response: { modelId: "agent-model" } }; } };
  const planner = new MastraM1Planner({ provider, agent });
  const result = await planner.plan({ objective: "Change calculator.js", snapshot: { files: [] }, workIntent: "effect-requested",
    capabilityIds: ["project.inspect", "project.preview-change", "project.apply-change"] });
  assert.deepEqual(result.steps, corrected.steps);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].schemaVersion, "runaai-m1-plan-protocol-correction/v1");
  assert.deepEqual(calls[1].input.capabilityIds, ["project.inspect", "project.preview-change", "project.apply-change"]);
  assert.equal(result.planningProtocol.providerAttemptCount, 2);
  assert.equal(result.planningProtocol.correctionCount, 1);
  assert.deepEqual(result.planningProtocol.attempts[0].violations, ["preview-without-matching-later-apply"]);
  assert.deepEqual(result.planningProtocol.attempts[1].violations, []);
});

test("planner fails closed after the one allowed correction", async () => {
  const rejected = { summary: "Apply", steps: [{ capabilityId: "project.apply-change",
    arguments: { path: "calculator.js", content: "new", expectedSha256: "a".repeat(64) } }] };
  let calls = 0;
  const planner = new MastraM1Planner({ provider, agent: { async generate() { calls++;
    return { text: JSON.stringify(rejected), finishReason: "stop", response: { modelId: "agent-model" } }; } } });
  await assert.rejects(planner.plan({ objective: "Change calculator.js", workIntent: "effect-requested",
    capabilityIds: ["project.preview-change", "project.apply-change"] }), /protocol-invalid/);
  assert.equal(calls, 2);
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
