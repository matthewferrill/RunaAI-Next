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

function codeProvider(draft, verificationReplies) {
  const draftCalls = [];
  const verificationCalls = [];
  const replies = [...verificationReplies];
  const agent = { async generate(prompt, options) {
    draftCalls.push({ prompt: JSON.parse(prompt), options });
    return result(draft);
  } };
  const verifierAgent = { async generate(prompt, options) {
    verificationCalls.push({ prompt: JSON.parse(prompt), options });
    return result(replies.shift() ?? "");
  } };
  return { draftCalls, verificationCalls,
    provider: new MastraAnswerProvider({ baseURL: "http://127.0.0.1:1/v1",
      modelId, role: "code", agent, verifierAgent }) };
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

test("standalone Code replaces an irrelevant draft only after the correction verifies", async () => {
  const context = codeProvider("Yes. A = 64 and B = 12, so the answer is 76.", [
    JSON.stringify({ accepted: false, reason: "stale numeric context",
      correctedAnswer: "function addNumbers(a, b) { return a + b; }" }),
    JSON.stringify({ accepted: true, reason: "current request answered", correctedAnswer: null }),
  ]);
  const answer = await context.provider.answer({
    request: { lane: "general", message: "Write a JavaScript function that adds two numbers.", history: [] },
    ground: "no-ground-needed", advisory: null, evidence: [],
  }, options);
  assert.equal(answer.answer, "function addNumbers(a, b) { return a + b; }");
  assert.deepEqual(answer.outputVerification, { executed: true, corrected: true });
  assert.equal(context.verificationCalls.length, 2);
  assert.equal(context.verificationCalls[0].prompt.currentRequest,
    "Write a JavaScript function that adds two numbers.");
  assert.equal(context.verificationCalls[0].prompt.schemaVersion,
    "runa2-code-response-verification/v2");
});

test("standalone Code rejects 76 and verifies 26 against the retained current turn", async () => {
  const history = [
    { role: "user", content: "Write a JavaScript function that adds two numbers." },
    { role: "assistant", content: "function addNumbers(a, b) { return a + b; }" },
  ];
  const context = codeProvider("76", [
    JSON.stringify({ accepted: false, reason: "incorrect arithmetic", correctedAnswer: "26" }),
    JSON.stringify({ accepted: true, reason: "correct arithmetic", correctedAnswer: null }),
  ]);
  const answer = await context.provider.answer({
    request: { lane: "general", message: "Run the program using a = 14 and b = 12.", history },
    ground: "no-ground-needed", advisory: null, evidence: [],
  }, options);
  assert.equal(answer.answer, "26");
  assert.deepEqual(answer.outputVerification, { executed: true, corrected: true });
  assert.equal("conversationHistory" in context.verificationCalls[0].prompt, false);
  assert.equal("priorAssistantResponses" in context.verificationCalls[0].prompt, false);
});

test("standalone Code verifier excludes a previous numeric request from the current turn", async () => {
  const history = [
    { role: "user", content: "Write a JavaScript function that adds two numbers." },
    { role: "assistant", content: "function addNumbers(a, b) { return a + b; }" },
    { role: "user", content: "Run the program using a = 14 and b = 12." },
    { role: "assistant", content: "console.log(addNumbers(14, 12)); // Output: 26" },
  ];
  const context = codeProvider("console.log(addNumbers(15, 15)); // Output: 30", [
    JSON.stringify({ accepted: true, reason: "current values and arithmetic are correct", correctedAnswer: null }),
  ]);
  const answer = await context.provider.answer({
    request: { lane: "general", message: "Run the program using a = 15 and b = 15.", history },
    ground: "no-ground-needed", advisory: null, evidence: [],
  }, options);
  assert.match(answer.answer, /30/);
  assert.equal(context.verificationCalls.length, 1);
  assert.equal(context.verificationCalls[0].prompt.currentRequest,
    "Run the program using a = 15 and b = 15.");
  assert.equal(JSON.stringify(context.verificationCalls[0].prompt).includes(
    "Run the program using a = 14 and b = 12."), false);
  assert.deepEqual(Object.keys(context.verificationCalls[0].prompt), [
    "schemaVersion", "currentRequest", "candidateAnswer",
  ]);
});

test("standalone Code accepts a relevant consistent draft with one verification", async () => {
  const context = codeProvider("Using 14 and 12, the result is 26.", [
    JSON.stringify({ accepted: true, reason: "correct arithmetic", correctedAnswer: null }),
  ]);
  const answer = await context.provider.answer({
    request: { lane: "general", message: "Add 14 and 12.", history: [] },
    ground: "no-ground-needed", advisory: null, evidence: [],
  }, options);
  assert.equal(answer.answer, "Using 14 and 12, the result is 26.");
  assert.deepEqual(answer.outputVerification, { executed: true, corrected: false });
  assert.equal(context.verificationCalls.length, 1);
});

test("standalone Code fails retryably when verification is malformed or cannot verify a correction", async () => {
  const malformed = codeProvider("76", ["not-json"]);
  await assert.rejects(malformed.provider.answer({
    request: { lane: "general", message: "Add 14 and 12.", history: [] },
    ground: "no-ground-needed", advisory: null, evidence: [],
  }, options), { code: "provider-response-invalid" });

  const rejectedCorrection = codeProvider("76", [
    JSON.stringify({ accepted: false, reason: "incorrect", correctedAnswer: "26" }),
    JSON.stringify({ accepted: false, reason: "still inconsistent", correctedAnswer: null }),
  ]);
  await assert.rejects(rejectedCorrection.provider.answer({
    request: { lane: "general", message: "Add 14 and 12.", history: [] },
    ground: "no-ground-needed", advisory: null, evidence: [],
  }, options), { code: "provider-response-invalid" });
});

