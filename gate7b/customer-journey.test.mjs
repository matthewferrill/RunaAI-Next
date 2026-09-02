import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { CHAT_DEADLINE_MS, answerNeedsRetry, boundedHistory, customerMessageFor,
  readJsonResponse } from "../gate6b/public/chat-client.mjs";
import { runCustomerJourney } from "./run-customer-journey.mjs";

test("the complete synthetic customer journey crosses identity, current answer lanes, recovery, continuity, and logout", async () => {
  const result = await runCustomerJourney();
  assert.equal(result.passed, true);
  assert.ok(Object.values(result.checks).every(Boolean));
  assert.equal(result.privateValuesIncluded, false);
});

test("the browser accepts a complete typed answer and bounds conversational history", async () => {
  const answer = await readJsonResponse(new Response(JSON.stringify({ answer: "Hello.",
    completion: { reason: "complete" } }), { status: 200 }));
  assert.equal(answer.answer, "Hello.");
  const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? "assistant" : "user",
    content: `${index}-${"x".repeat(9_000)}` }));
  const bounded = boundedHistory(history);
  assert.equal(bounded.length, 24);
  assert.ok(bounded.every(turn => turn.content.length <= 8_000));
});

test("approved-knowledge delivery failures remain retryable browser failures", () => {
  assert.equal(answerNeedsRetry({
    completion: { reason: "approved-knowledge-source-unavailable" },
    approvedKnowledge: { errorCode: "approved-knowledge-source-unavailable" },
  }), true);
  const refreshOutage = customerMessageFor("identity-refresh-unavailable");
  assert.match(refreshOutage, /renew your sign-in/i);
  assert.doesNotMatch(refreshOutage, /session has ended/i);
});

test("empty, malformed, failed, and timed-out responses never expose parser or provider details", async () => {
  for (const [response, code] of [
    [new Response("", { status: 502 }), "chat-response-empty"],
    [new Response("{", { status: 200 }), "chat-response-invalid"],
    [new Response(JSON.stringify({ errorCode: "candidate-request-failed" }), { status: 400 }), "candidate-request-failed"],
  ]) {
    await assert.rejects(readJsonResponse(response), error => error.code === code);
    const message = customerMessageFor(code);
    assert.doesNotMatch(message, /Unexpected end|JSON|PRIVATE|candidate-request-failed/);
    assert.match(message, /retry/i);
  }
  assert.equal(CHAT_DEADLINE_MS, 65_000);
});

test("retryable model results are not mistaken for completed conversational turns", () => {
  for (const reason of ["timeout", "provider-response-invalid", "provider-output-empty",
    "provider-transport-failed", "output-limited"]) {
    assert.equal(answerNeedsRetry({ completion: { reason } }), true);
  }
  assert.equal(answerNeedsRetry({ completion: { reason: "complete" } }), false);
  assert.equal(answerNeedsRetry({ completion: { reason: "honest-empty" } }), false);
});

test("the customer surface is generic, truthful, retryable, and does not expose unfinished code tooling", async () => {
  const [html, script, functions] = await Promise.all([
    readFile(new URL("../gate6b/public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../gate6b/public/status.js", import.meta.url), "utf8"),
    readFile(new URL("../gate6b/public/function-navigation.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /Ask questions, brainstorm, draft writing/);
  assert.match(functions, /Discuss, explain, and draft code/);
  assert.match(html, /does not have live web access/);
  assert.match(html, /cannot change files, settings, or systems/);
  assert.doesNotMatch(html, /Hi Matthew/);
  assert.doesNotMatch(html, /code execution|shell|commit|push/i);
  assert.match(script, /Retry message/);
  assert.doesNotMatch(script, /error\.message|Unexpected end of JSON input/);
});
