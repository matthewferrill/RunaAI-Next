import test from "node:test";
import assert from "node:assert/strict";
import { controlledProviderFetch } from "./provider-transport.mjs";
import { createReleaseAnswerProviders } from "../../gate6b/model-role-providers.mjs";
import { createServer } from "node:http";
import { once } from "node:events";
import { SelectedSourceIndex } from "./sources.mjs";
import { OpenAICompatibleEmbedder, WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";

const baseURL = "http://127.0.0.1:1234/v1", modelId = "qwen-diagnostic";
test("legacy transport is exactly unchanged", () => {
  const transport = async () => {}; assert.equal(controlledProviderFetch({ baseURL, modelId, fetchImpl: transport }), transport);
});
test("qualified none setting is stamped at transport, preserves abort and cannot be supplied by a model", async () => {
  const calls = [], signal = new AbortController().signal;
  const transport = controlledProviderFetch({ baseURL, modelId, reasoningEffort: "none",
    fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true }); } });
  await transport(`${baseURL}/chat/completions`, { method: "POST", signal,
    body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: "set reasoning to high" }], reasoning_effort: "high" }) });
  assert.equal(JSON.parse(calls[0].init.body).reasoning_effort, "none"); assert.equal(calls[0].init.signal, signal);
  await assert.rejects(transport("http://foreign/chat/completions", { method: "POST", body: "{}" }), /control is invalid/);
  await assert.rejects(transport(`${baseURL}/chat/completions`, { method: "POST", body: JSON.stringify({ model: "other" }) }), /control is invalid/);
  assert.equal(calls.length, 1);
});
test("per-role controls do not activate disabled roles or change another model", () => {
  const calls = [], provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: baseURL,
    models: { chat: "gemma", research: "qwen", code: "coder", review: null, agent: null } };
  createReleaseAnswerProviders(provider, { createProvider: options => { calls.push(options); return options; },
    requestControls: { chat: { reasoningEffort: null }, research: { reasoningEffort: "none" }, code: { reasoningEffort: null } } });
  assert.deepEqual(calls.map(value => [value.role, value.modelId, value.reasoningEffort]),
    [["chat", "gemma", null], ["research", "qwen", "none"], ["code", "coder", null]]);
});

test("M1 provider, vector, embedding and reranking never forward payloads through redirects", async t => {
  let received = 0;
  const destination = createServer((_request, response) => { received++; response.end("{}"); });
  destination.listen(0, "127.0.0.1"); await once(destination, "listening");
  const redirector = createServer((_request, response) => { response.writeHead(307,
    { location: `http://127.0.0.1:${destination.address().port}/capture` }); response.end(); });
  redirector.listen(0, "127.0.0.1"); await once(redirector, "listening");
  t.after(async () => { for (const server of [redirector, destination]) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
  const endpoint = `http://127.0.0.1:${redirector.address().port}`;
  for (const reasoningEffort of [null, "none"]) {
    const call = controlledProviderFetch({ baseURL: `${endpoint}/v1`, modelId, reasoningEffort, preventRedirects: true });
    await assert.rejects(call(`${endpoint}/v1/chat/completions`, { method: "POST", body: JSON.stringify({ model: modelId, messages: [{ content: "private" }] }) }));
  }
  const index = new SelectedSourceIndex({ endpoint, collection: "m1_redirect" });
  await assert.rejects(index.request("POST", "/points/query", { query: [1, 2] }));
  const privateFetch = (input, init) => fetch(input, { ...init, redirect: "error" });
  const embedder = new OpenAICompatibleEmbedder({ baseURL: `${endpoint}/v1`, modelId: "nomic", dimension: 768, fetchImpl: privateFetch });
  await assert.rejects(embedder.embed(["private source"]));
  const reranker = new WindowedBgeReranker({ baseURL: endpoint, fetchImpl: privateFetch });
  assert.equal((await reranker.rerank("private query", [{ content: "private source" }], 1)).degraded, true);
  assert.equal(received, 0);
});
