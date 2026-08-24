import assert from "node:assert/strict";
import { test } from "node:test";

import { MastraAnswerProvider } from "./adapters/mastra-provider.mjs";

const modelId = "synthetic-model";
const result = (text, overrides = {}) => ({ text, finishReason: "stop",
  response: { modelId }, ...overrides });

function provider(reply) {
  const calls = [];
  const agent = { async generate(prompt, options) {
    calls.push({ prompt: JSON.parse(prompt), options });
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(prompt, options) : reply;
  } };
  return { calls, provider: new MastraAnswerProvider({ baseURL: "http://127.0.0.1:1/v1",
    modelId, role: "chat", agent }) };
}

const input = evidence => ({ request: { lane: "general", message: "Hello", history: [] },
  ground: evidence.length ? "record-answers" : "no-ground-needed", advisory: null, evidence });
const options = { deadlineMs: 2_000, maximumOutputBytes: 16_000 };

test("ordinary conversation uses plain text and never asks the model to serialize application JSON", async () => {
  const context = provider(result("Hi. It is good to hear from you."));
  const answer = await context.provider.answer(input([]), options);
  assert.equal(answer.answer, "Hi. It is good to hear from you.");
  assert.deepEqual(answer.citations, []);
  assert.equal(context.calls[0].prompt.responseFormat.kind, "plain-text");
});

test("evidence-bearing answers retain a validated citation-bearing JSON contract", async () => {
  const context = provider(result(JSON.stringify({ answer: "The selected source answers this.",
    citations: [{ sourceId: "README", sectionId: "one" }] })));
  const answer = await context.provider.answer(input([{ sourceId: "README", sectionId: "one",
    contentSha256: "a".repeat(64), content: "Synthetic evidence." }]), options);
  assert.equal(answer.answer, "The selected source answers this.");
  assert.deepEqual(answer.citations, [{ sourceId: "README", sectionId: "one" }]);
  assert.equal(context.calls[0].prompt.responseFormat.kind, "evidence-json");
});

for (const [name, reply, code] of [
  ["empty", result(""), "provider-output-empty"],
  ["malformed", result("{not-json"), "provider-response-invalid"],
  ["wrong shape", result('{"answer":"hello"}'), "provider-shape-invalid"],
  ["truncated", result("partial", { finishReason: "length" }), "provider-output-limited"],
  ["wrong model", result("hello", { response: { modelId: "other" } }), "provider-model-mismatch"],
  ["transport", new Error("PRIVATE_PROVIDER_DETAIL"), "provider-transport-failed"],
]) test(`provider ${name} output becomes the stable ${code} code`, async () => {
  const context = provider(reply);
  const evidence = ["malformed", "wrong shape"].includes(name)
    ? [{ sourceId: "README", sectionId: "one", contentSha256: "a".repeat(64), content: "Synthetic." }] : [];
  await assert.rejects(context.provider.answer(input(evidence), options), error => {
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /PRIVATE_PROVIDER_DETAIL/);
    return true;
  });
});

