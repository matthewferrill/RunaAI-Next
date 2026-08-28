import assert from "node:assert/strict";
import test from "node:test";
import { BoundedNomicEmbedder, nomicInputWindows, NOMIC_INPUT_POLICY } from "./nomic-windowing.mjs";

test("short inputs retain the exact vector and required document/query prefixes", async () => {
  const sent = [], vector = [2, 3];
  const embedder = new BoundedNomicEmbedder({ dimension: 2, async embed(inputs) { sent.push(...inputs); return inputs.map(() => vector); } });
  const inputs = ["search_document: An ordinary note.", "search_query: Which room?"];
  assert.deepEqual(await embedder.embed(inputs), [vector, vector]); assert.deepEqual(sent, inputs);
});

test("long Unicode and normalized expansion are bounded without dropping the end of an input", () => {
  for (const content of ["garden ".repeat(1100), "花園🙂".repeat(1900), "\uFDFA".repeat(200)]) {
    const input = "search_document: " + content, windows = nomicInputWindows(input);
    assert.ok(windows.length > 1);
    assert.ok(windows.every(window => Buffer.byteLength(window.text) <= 1600 && window.text.isWellFormed() && window.weight > 0));
    assert.equal(windows.reduce((sum, window) => sum + window.weight, 0), Buffer.byteLength(content.normalize("NFKC")));
    assert.ok(windows.at(-1).text.endsWith(content.normalize("NFKC").slice(-20)));
    assert.equal(input, "search_document: " + content);
  }
});

test("all windows are sent through the actual delegate and combined deterministically", async () => {
  let sent, optionsSeen; const opts = { deadlineMs: 1000 };
  const embedder = new BoundedNomicEmbedder({ dimension: 2, async embed(inputs, options) {
    sent = inputs; optionsSeen = options; return inputs.map((_, index) => index % 2 ? [0, 2] : [2, 0]); } });
  const result = await embedder.embed(["search_document: " + "a".repeat(8000)], opts);
  assert.equal(sent.length, nomicInputWindows("search_document: " + "a".repeat(8000)).length);
  assert.equal(optionsSeen, opts); assert.equal(result.length, 1);
  assert.ok(result[0].every(value => value > 0)); assert.ok(Math.abs(Math.hypot(...result[0]) - 1) < 1e-12);
});

test("wrong prefix, malformed Unicode, empty inputs and excess work fail before inference", async () => {
  let calls = 0; const embedder = new BoundedNomicEmbedder({ dimension: 2, async embed() { calls++; } });
  for (const input of ["no prefix", "search_query: ", "search_document: \ud800", "search_document: " + "x".repeat(200000)]) {
    await assert.rejects(embedder.embed([input]), /m1-embedding-/);
  }
  await assert.rejects(embedder.embed(Array(65).fill("search_query: bounded")), /m1-embedding-batch-limited/);
  assert.equal(calls, 0); assert.equal(NOMIC_INPUT_POLICY.maximumWindowUtf8Bytes, 1600);
});

test("partial or invalid window vectors are never accepted as complete source embeddings", async () => {
  for (const response of [[], [[1, NaN]], [[0, 0], [0, 0], [0, 0]]]) {
    const embedder = new BoundedNomicEmbedder({ dimension: 2, async embed() { return response; } });
    await assert.rejects(embedder.embed(["search_document: " + "x".repeat(4000)]), /m1-embedding-/);
  }
});
