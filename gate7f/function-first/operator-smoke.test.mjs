import test from "node:test";
import assert from "node:assert/strict";
import { runOperatorSmoke, validateSmokeSeal, SMOKE_SOURCE_FILES } from "./operator-smoke.mjs";

const seal = () => ({ schemaVersion: "runaai-m1-operator-smoke/v1", scored: false, candidateId: "synthetic",
  modelId: "synthetic-large", primaryInstanceId: "synthetic-primary", embeddingInstanceId: "synthetic-embedding",
  embeddingModelId: "text-embedding-nomic-embed-text-v1.5", baseUrl: "http://127.0.0.1:1234/v1",
  inventoryUrl: "http://127.0.0.1:1234/api/v1/models", rerankerUrl: "http://127.0.0.1:8412", reasoningEffort: "none",
  runtimeSealSha256: "a".repeat(64), primaryArtifactSha256: "b".repeat(64), embeddingArtifactSha256: "c".repeat(64),
  sourceFiles: Object.fromEntries(SMOKE_SOURCE_FILES.map(path => [path, "d".repeat(64)])) });

test("operator smoke is prospective, bounded to private endpoints, source-pinned and never scored", () => {
  assert.doesNotThrow(() => validateSmokeSeal(seal()));
  for (const change of [value => { value.scored = true; }, value => { value.baseUrl = "https://example.com"; },
    value => { value.rerankerUrl = "http://private:secret@127.0.0.1:8412"; }, value => { value.sourceFiles = {}; },
    value => { value.primaryInstanceId = value.embeddingInstanceId; }]) {
    const value = seal(); change(value); assert.throws(() => validateSmokeSeal(value));
  }
});

test("smoke calls actual Mastra answer/planner and auxiliary adapters, records no-suffix wire and never owns a lifecycle API", async () => {
  const requests = [], events = [], value = seal();
  const json = data => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  const result = await runOperatorSmoke(value, { record: async event => events.push(event), fetchImpl: async (url, init) => {
    requests.push({ url, init });
    if (url === value.inventoryUrl) return json({ models: [
      { key: value.modelId, loaded_instances: [{ id: value.primaryInstanceId }] },
      { key: value.embeddingModelId, loaded_instances: [{ id: value.embeddingInstanceId }] }] });
    const body = JSON.parse(init.body); assert.equal(init.redirect, "error");
    if (url.endsWith("/embeddings")) return json({ model: value.embeddingModelId,
      data: body.input.map((_, index) => ({ index, embedding: Array(768).fill(0.25) })) });
    if (url.endsWith("/rerank")) return json({ results: [{ index: 0, score: 0.9 }, { index: 1, score: 0.1 }] });
    assert.equal(body.reasoning_effort, "none"); assert.doesNotMatch(JSON.stringify(body), /\/no_think/);
    const prompt = JSON.parse(body.messages.at(-1).content);
    const text = prompt.schemaVersion === "runaai-m1-planner-input/v2"
      ? JSON.stringify({ summary: "Inspect only", steps: [{ capabilityId: "project.inspect", arguments: { path: "echo.js" } }] })
      : prompt.schemaVersion === "runaai-m1-plan-protocol-correction/v1"
        ? JSON.stringify({ summary: "Inspect only", steps: [{ capabilityId: "project.inspect", arguments: { path: "echo.js" } }] })
      : prompt.evidence.length ? JSON.stringify({ answer: "The north room [1].", citations: [{ sourceId: "smoke-note", sectionId: "provided" }] })
      : "Hello, Garden Circle.";
    return json({ id: "synthetic-completion", object: "chat.completion", created: 1, model: value.modelId,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 } });
  } });
  assert.equal(result.passed, true); assert.equal(result.scored, false); assert.equal(result.modelsLoadedOrUnloaded, false);
  assert.equal(result.checks.length, 7); assert.equal(result.providerCalls, 7);
  assert.equal(requests.length, 9); assert.equal(events.filter(event => event.type === "residency").length, 2);
  assert.deepEqual(events.filter(event => event.type === "request").map(event => event.role), ["chat", "research", "review", "code", "agent", "embedding", "reranker"]);
});

test("an extra or wrong resident model aborts before any inference", async () => {
  let calls = 0;
  await assert.rejects(runOperatorSmoke(seal(), { fetchImpl: async () => { calls++;
    return new Response(JSON.stringify({ models: [{ key: "foreign", loaded_instances: [{ id: "foreign-instance" }] }] })); } }));
  assert.equal(calls, 1);
});

test("malformed model JSON retains the exact bounded wire response before the SDK rejects it", async () => {
  const value = seal(), events = [], consoleErrors = [], originalError = console.error;
  const inventory = { models: [{ key: value.modelId, loaded_instances: [{ id: value.primaryInstanceId }] },
    { key: value.embeddingModelId, loaded_instances: [{ id: value.embeddingInstanceId }] }] };
  console.error = (...args) => consoleErrors.push(args);
  try { await assert.rejects(runOperatorSmoke(value, { record: async event => events.push(event), fetchImpl: async url =>
    new Response(url === value.inventoryUrl ? JSON.stringify(inventory) : '{"unfinished":', { headers: { "content-type": "application/json" } }) })); }
  finally { console.error = originalError; }
  const response = events.find(event => event.type === "response");
  assert.equal(response.status, 200); assert.equal(response.rawText, '{"unfinished":');
  assert.equal(events.filter(event => event.type === "residency").length, 2);
  assert.deepEqual(consoleErrors, [], "raw SDK private prompt/response objects must not leak into application console logs");
});

test("oversized model wire response cancels its sole stream without a stalled tee branch", async () => {
  const value = seal(); let cancelled = false;
  const inventory = { models: [{ key: value.modelId, loaded_instances: [{ id: value.primaryInstanceId }] },
    { key: value.embeddingModelId, loaded_instances: [{ id: value.embeddingInstanceId }] }] };
  await assert.rejects(runOperatorSmoke(value, { fetchImpl: async url => url === value.inventoryUrl
    ? new Response(JSON.stringify(inventory))
    : new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); }, cancel() { cancelled = true; } })) }));
  assert.equal(cancelled, true);
});
