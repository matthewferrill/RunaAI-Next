// Independent reporting-only checks. Never imports the acceptance corpus or live model outputs.
import test from "node:test";
import assert from "node:assert/strict";
import { runModelIntegration, integrationScenarios } from "../model-integration.mjs";
import { buildRequest } from "../adapter.mjs";
import { SOAK_POLICY, soakSchedule } from "../runner.mjs";
import { checkIntegration, summarizeMeasurements } from "../summarize-capture.mjs";
import { anonymousResponses } from "../make-review-packets.mjs";

async function integrationFixture({ proposalContent } = {}) {
  const events = [];
  await runModelIntegration({ buildRequest, record: (type, payload) => events.push({ type, ...payload }),
    invoke: async ({ id, endpoint, request }) => {
      const [, name, phase] = id.split(":"), scenario = integrationScenarios().find(item => item.id === name);
      const proposal = phase === "proposal" && scenario.expectProposal ? scenario.allowedProposal : null;
      const content = phase === "proposal" && proposalContent !== undefined ? proposalContent
        : JSON.stringify({ kind: proposal ? "propose" : "respond", message: "Synthetic test", plan: [], proposal });
      const response = { model: "synthetic-provider", choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 } };
      const normalized = { content, toolCalls: [], finishReason: "stop", promptTokens: 10, completionTokens: 3,
        tokensPerSecond: null, firstTokenMs: null };
      events.push({ type: "request", id, endpoint, request }, { type: "response", id, endpoint, response, elapsedMs: 100 },
        { type: "observation", id, endpoint, normalized, elapsedMs: 100 });
      return { response, normalized };
    } });
  return events;
}

test("reporting review: synthetic actual proposal and receipt fixture remains accepted", async () => {
  assert.equal(checkIntegration(await integrationFixture()).containmentPassed, true);
});

test("reporting review preserves frozen integration abort for null-content native output", async () => {
  const traces = [];
  let invocations = 0;
  await assert.rejects(runModelIntegration({ buildRequest,
    record: (type, payload) => traces.push({ type, ...payload }),
    invoke: async () => {
      invocations++;
      const toolCalls = [{ id: "synthetic-call", type: "function",
        function: { name: "workspace_inspect", arguments: '{"path":"fixture.txt"}' } }];
      return { response: { model: "synthetic-provider", choices: [{ finish_reason: "tool_calls",
        message: { role: "assistant", content: null, tool_calls: toolCalls } }] },
        normalized: { content: null, toolCalls, finishReason: "tool_calls" } };
    } }), { message: "integration-provider-response-invalid" });
  assert.equal(invocations, 1);
  assert.equal(traces.length, 0);
});

for (const [label, proposalContent] of [
  ["invalid JSON", "{"],
  ["missing proposal", JSON.stringify({ kind: "respond", message: "Synthetic answer", plan: [], proposal: null })],
  ["outside-scope proposal", JSON.stringify({ kind: "propose", message: "Synthetic wrong path", plan: [],
    proposal: { capabilityId: "workspace.inspect", arguments: { path: "PRIVATE.md" } } })],
]) test("reporting review retains a genuine " + label + " as model failure, not corrupted capture", async () => {
  const result = checkIntegration(await integrationFixture({ proposalContent }));
  assert.equal(result.containmentPassed, true);
  assert.ok(result.outcomes.some(outcome => outcome.modelCode !== null));
});

for (const [label, mutate] of [
  ["recorded inspection without its receipt", trace => { trace.actualReceipt = null; }],
  ["trace raw proposal differs from actual model reply", trace => { trace.rawProposalContent = "{}"; }],
  ["trace parsed output differs from actual model reply", trace => {
    trace.emittedAgentOutput = { kind: "stop", message: "Denied", plan: [], proposal: null };
  }],
  ["conformance boolean contradicts actual exact proposal", trace => { trace.proposalConformance = false; }],
  ["inspection delivery without receipt or execution", trace => {
    trace.actualReceipt = null; trace.after.receipt = null; trace.after.executionStatus = "not-run";
  }],
]) test("reporting review rejects " + label, async () => {
  const events = await integrationFixture();
  mutate(events.find(row => row.type === "integration-state"));
  assert.throws(() => checkIntegration(events));
});

function soakFixture() {
  const base = Date.parse("2026-08-27T20:00:00Z"), events = [];
  const event = (offset, type, payload) => events.push({ type, time: new Date(base + offset).toISOString(), ...payload });
  event(0, "soak-start", { policy: SOAK_POLICY, startedAt: new Date(base).toISOString() });
  for (const [slot, batch] of soakSchedule().entries()) {
    const offset = slot * SOAK_POLICY.slotIntervalMs;
    event(offset + 10, "soak-slot", { slot, plannedOffsetMs: offset, actualOffsetMs: offset + 10, concurrency: batch.length });
    event(offset + 11, "telemetry", { label: "synthetic", freeMemoryBytes: 32 * 1024 ** 3,
      gpus: [0, 1].map(index => ({ index, usedMemoryMiB: 7000, temperatureC: 50 })) });
    for (const [lane, item] of batch.entries()) {
      event(offset + 20 + lane, "request", { id: item.id, ...buildRequest(item) });
      event(offset + 120 + lane, "response", { id: item.id, elapsedMs: 100 });
      event(offset + 130 + lane, "observation", { id: item.id, elapsedMs: 110,
        normalized: { finishReason: "stop", promptTokens: slot % 6 === 2 ? 5000 : 100 } });
    }
  }
  event(SOAK_POLICY.durationMs, "soak-complete", { elapsedMs: SOAK_POLICY.durationMs, requests: 131, expectedRequests: 131, completed: true });
  return events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

test("reporting review: fixed synthetic soak reports 131 requests and measured workload latency", () => {
  const result = summarizeMeasurements(soakFixture());
  assert.equal(result.requests, 131);
  assert.equal(result.durationMs, SOAK_POLICY.durationMs);
  assert.equal(result.p50ClientLatencyMs, 100);
  assert.equal(result.longContextMaximumPromptTokens, 5000);
});

test("reporting review rejects slot offset that differs from captured clock", () => {
  const events = soakFixture();
  events.find(row => row.type === "soak-slot").actualOffsetMs += 1_000_000;
  assert.throws(() => summarizeMeasurements(events));
});

test("reporting review rejects claimed pacing when later slots share the start timestamp", () => {
  const events = soakFixture(), start = events.find(row => row.type === "soak-start").time;
  for (const row of events.filter(row => row.type === "soak-slot")) row.time = start;
  assert.throws(() => summarizeMeasurements(events));
});

test("reporting review preserves unavailable prompt counts as unavailable, not zero", () => {
  const events = soakFixture();
  for (const row of events.filter(row => row.type === "observation")) row.normalized.promptTokens = null;
  const result = summarizeMeasurements(events);
  assert.equal(result.maximumPromptTokens, null);
  assert.equal(result.longContextMaximumPromptTokens, null);
});

const packetExpectedIds = () => Array.from({ length: 117 }, (_, index) => `acceptance:synthetic-${index}:1:0`);
function packetFixture() {
  return packetExpectedIds().flatMap(id => [
    { type: "request", id, endpoint: "/v1/chat/completions", request: { model: "synthetic-provider", max_tokens: 64,
      messages: [{ role: "user", content: "Synthetic input" }] } },
    { type: "response", id, endpoint: "/v1/chat/completions", response: { model: "synthetic-provider",
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Synthetic response" } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 } } },
    { type: "observation", id, endpoint: "/v1/chat/completions", normalized: { content: "Synthetic response", toolCalls: [],
      finishReason: "stop", promptTokens: 10, completionTokens: 3, tokensPerSecond: null, firstTokenMs: null } },
  ]);
}

test("reporting review removes provider metadata but preserves the semantic native tool call", () => {
  const events = packetFixture();
  const observation = events.find(row => row.type === "observation"), response = events.find(row => row.type === "response");
  observation.normalized.content = null;
  observation.normalized.finishReason = "tool_calls";
  observation.normalized.toolCalls = [{ id: "synthetic-call", type: "function", model: "must-not-leak",
    function: { name: "workspace_inspect", arguments: '{"path":"fixture.txt"}', hardware: "must-not-leak" } }];
  response.response.choices[0].finish_reason = "tool_calls";
  response.response.choices[0].message.content = null;
  response.response.choices[0].message.tool_calls = structuredClone(observation.normalized.toolCalls);
  const result = anonymousResponses(events, { expectedIds: packetExpectedIds() });
  assert.deepEqual(result[0].toolCalls, [{ id: "synthetic-call", type: "function",
    function: { name: "workspace_inspect", arguments: '{"path":"fixture.txt"}' } }]);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("reporting review rejects duplicate packet identities despite correct aggregate count", () => {
  const events = packetFixture(), expectedIds = packetExpectedIds();
  for (const row of events.filter(row => row.id === expectedIds[1])) row.id = expectedIds[0];
  assert.throws(() => anonymousResponses(events, { expectedIds }));
});
