import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleEmbedder, WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";
const json = value => new Response(JSON.stringify(value));

test("Nomic adapter rejects missing, duplicate, negative and non-finite vector coordinates", async () => {
  for (const data of [[], [{ index: 0, embedding: [1, 2] }, { index: 0, embedding: [3, 4] }],
    [{ index: -1, embedding: [1, 2] }, { index: 1, embedding: [3, 4] }],
    [{ index: 0, embedding: [null, 2] }, { index: 1, embedding: [3, 4] }]]) {
    const embedder = new OpenAICompatibleEmbedder({ baseURL: "http://127.0.0.1:1", modelId: "nomic", dimension: 2,
      fetchImpl: async () => json({ model: "nomic", data }) });
    await assert.rejects(embedder.embed(["one", "two"]), { code: "embedding-shape-invalid" });
  }
});

test("BGE requires one valid score per requested window before claiming full reranking", async () => {
  const sources = [{ sourceId: "a", content: "first" }, { sourceId: "b", content: "second" }];
  for (const results of [[{ index: 0, score: 1 }], [{ index: 0, score: 1 }, { index: 0, score: 2 }],
    [{ index: 0, score: 1 }, { index: 1, score: null }]]) {
    const reranker = new WindowedBgeReranker({ baseURL: "http://127.0.0.1:1", fetchImpl: async () => json({ results }) });
    const result = await reranker.rerank("question", sources, 2);
    assert.equal(result.degraded, true); assert.deepEqual(result.unavailable, ["reranker"]);
  }
  const reranker = new WindowedBgeReranker({ baseURL: "http://127.0.0.1:1",
    fetchImpl: async () => json({ results: [{ index: 1, score: 2 }, { index: 0, score: 1 }] }) });
  const result = await reranker.rerank("question", sources, 2);
  assert.equal(result.degraded, false); assert.deepEqual(result.sources.map(source => source.sourceId), ["b", "a"]);
});

test("dependency body cap cancels the stream before buffering the entire response", async () => {
  let cancelled = false;
  const embedder = new OpenAICompatibleEmbedder({ baseURL: "http://127.0.0.1:1", modelId: "nomic", dimension: 2,
    fetchImpl: async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); }, cancel() { cancelled = true; } })) });
  await assert.rejects(embedder.embed(["one"]), { code: "dependency-output-limited" }); assert.equal(cancelled, true);
});
