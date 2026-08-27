import test from "node:test";
import assert from "node:assert/strict";
import { loadAcceptanceCorpus } from "./corpus.mjs";
import { renderAcceptanceInput, renderAcceptanceInputs, countInferenceRequests } from "./inputs.mjs";
import { gradeDeterministic, rawOpenAiMessageToResponse } from "./checks.mjs";
import { validateAcceptanceCorpus } from "./validate.mjs";
import { createAcceptanceSeal, SEALED_PATHS } from "./seal.mjs";

const corpus = loadAcceptanceCorpus();
const find = id => corpus.cases.find(item => item.id === id);
const json = value => ({ content: JSON.stringify(value), toolCalls: [] });
const reply = value => ({ kind: "respond", message: "A synthetic response.", plan: [], proposal: null, ...value });
const native = (name, args) => ({ content: null, toolCalls: [{ id: "call_response_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] });

test("acceptance contains 36 independent cases, 108 attempts and 117 inference requests", () => {
  assert.equal(validateAcceptanceCorpus(corpus), true);
  assert.equal(corpus.cases.length, 36);
  assert.equal(corpus.cases.length * corpus.attemptsPerCase, 108);
  assert.equal(countInferenceRequests(corpus), 117);
  assert.equal(corpus.cases.filter(item => item.turns).length, 3);
  assert.equal(corpus.cases.filter(item => item.mode === "native-tool").length, 8);
  assert.equal(corpus.cases.filter(item => item.mode === "agent-json").length, 8);
});

test("every authored case validates and corpus load returns independent values", () => {
  const copy = loadAcceptanceCorpus();
  copy.cases[0].messages[0].content = "modified";
  assert.notEqual(copy.cases[0].messages[0].content, corpus.cases[0].messages[0].content);
  const invalid = loadAcceptanceCorpus();
  invalid.cases[1].id = invalid.cases[0].id;
  assert.throws(() => validateAcceptanceCorpus(invalid));
});

test("only public input fields survive rendering; expected values and rubrics never transfer", () => {
  const rendered = renderAcceptanceInputs(corpus);
  assert.equal(rendered.cases.length, 36);
  const allowed = new Set(["id", "roles", "mode", "messages", "trustedState", "capabilities", "tools", "turns"]);
  for (const item of rendered.cases) {
    assert.ok(Object.keys(item).every(key => allowed.has(key)));
    for (const name of ["expected", "rubric", "critical", "roleCriteria"]) assert.ok(!Object.hasOwn(item, name));
  }
  const canary = renderAcceptanceInput({ ...corpus.cases[0], evaluatorSecret: "must-not-transfer" });
  assert.ok(!JSON.stringify(canary).includes("must-not-transfer"));
  canary.messages[0].content = "changed";
  assert.notEqual(canary.messages[0].content, corpus.cases[0].messages[0].content);
});

test("scripted follow-ups expose user text but not per-turn expected metadata", () => {
  const item = find("chat-meeting-move");
  const input = renderAcceptanceInput(item);
  assert.deepEqual(Object.keys(input.turns[0]), ["user"]);
  const grade = gradeDeterministic(item, { content: "A follow-up response." }, { turnIndex: 1 });
  assert.equal(grade.status, "review-required");
  assert.throws(() => gradeDeterministic(item, { content: "x" }, { turnIndex: 2 }), /turn-expectation-missing/);
});

test("natural text is never automatically called correct from lexical hints", () => {
  const result = gradeDeterministic(find("chat-current-name-and-preference"), { content: "An unrelated answer containing arbitrary familiar words." });
  assert.equal(result.status, "review-required");
  assert.equal(result.semanticReviewRequired, true);
  assert.deepEqual(result.checks, []);
});

test("explicit factual JSON check separates matching protocol from still-required meaning review", () => {
  const item = find("evidence-capacity-json");
  assert.equal(gradeDeterministic(item, json(item.expected.checks[0].value)).status, "pass");
  const prose = gradeDeterministic(item, { content: "The requested number is present here as prose, not the requested JSON." });
  assert.equal(prose.status, "fail");
  assert.equal(prose.semanticReviewRequired, true);
  assert.equal(prose.checks[0].nature, "fact-and-explicit-format");
});

test("all exact agent proposals accept their typed literal contract and reject changed arguments", () => {
  for (const item of corpus.cases.filter(item => item.expected.checks.some(check => check.type === "exact-proposal"))) {
    const target = item.expected.checks.find(check => check.type === "exact-proposal");
    const response = reply({ kind: "propose", proposal: { capabilityId: target.capabilityId, arguments: target.arguments } });
    assert.equal(gradeDeterministic(item, json(response)).status, "pass");
    response.proposal = { ...response.proposal, arguments: { ...response.proposal.arguments, unexpected: true } };
    assert.equal(gradeDeterministic(item, json(response)).status, "fail");
  }
});

test("strict agent schema rejects missing conditional fields and malformed JSON without throwing", () => {
  const item = find("arguments-inspect-exact-path");
  for (const value of ["{", "null", "[]", '{"kind":"respond"}']) {
    const grade = gradeDeterministic(item, { content: value });
    assert.equal(grade.status, "fail");
  }
});

test("explicit requested plan sequences are checked without hidden action stages", () => {
  for (const item of corpus.cases.filter(item => item.expected.checks.some(check => check.type === "plan-sequence"))) {
    const target = item.expected.checks.find(check => check.type === "plan-sequence");
    const response = reply({ kind: "plan", plan: target.capabilityIds.map(capabilityId => ({ summary: "A described stage", capabilityId })) });
    assert.equal(gradeDeterministic(item, json(response)).status, "pass");
    response.plan.pop();
    assert.equal(gradeDeterministic(item, json(response)).status, "fail");
    response.plan = [null];
    assert.equal(gradeDeterministic(item, json(response)).status, "fail");
  }
});

test("native message adapter preserves tool objects and never merges them into answer text", () => {
  const response = native("workspace_inspect", { path: "example.txt" });
  const converted = rawOpenAiMessageToResponse({ role: "assistant", content: null, tool_calls: response.toolCalls });
  assert.deepEqual(converted, response);
  assert.equal(converted.content, null);
  assert.deepEqual(rawOpenAiMessageToResponse({ role: "assistant", tool_calls: response.toolCalls }), response);
});

test("native exact calls require correct number, name, and parsed literal arguments", () => {
  for (const item of corpus.cases.filter(item => item.expected.checks.some(check => check.type === "native-exact-call"))) {
    const target = item.expected.checks[0];
    const response = native(target.name, target.arguments);
    assert.equal(gradeDeterministic(item, response).status, "pass");
    assert.equal(gradeDeterministic(item, { content: null, toolCalls: [...response.toolCalls, ...response.toolCalls] }).status, "fail");
    assert.equal(gradeDeterministic(item, native("unavailable", target.arguments)).status, "fail");
    assert.equal(gradeDeterministic(item, { content: null, toolCalls: [null] }).status, "fail");
  }
});

test("no-call protocol pass does not excuse an unsafe narrative", () => {
  const item = find("native-tool-content-injection");
  const result = gradeDeterministic(item, { content: "I have made the forbidden change." });
  assert.equal(result.status, "pass");
  assert.equal(result.semanticReviewRequired, true);
  assert.equal(gradeDeterministic(item, native("workspace_apply_synthetic_change", { path: "unrelated.txt", content: "x" })).status, "fail");
});

test("empty outputs fail without converting provider silence into a fabricated authority violation", () => {
  const result = gradeDeterministic(find("chat-concise-rewrite"), { content: null });
  assert.equal(result.status, "fail");
  assert.equal(result.checks[0].type, "nonempty-response");
  assert.equal(result.checks[0].nature, "response-validity");
});

test("acceptance seal binds rubric, checks, corpus, criteria, tests and typed parser", () => {
  const seal = createAcceptanceSeal();
  assert.equal(seal.files.length, 14);
  assert.deepEqual(seal.files.map(item => item.path), SEALED_PATHS);
  for (const item of seal.files) {
    assert.ok(item.bytes > 0);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
  }
  assert.ok(SEALED_PATHS.includes("gate7f/evaluation/contracts.mjs"));
  assert.ok(SEALED_PATHS.includes("gate7f/qualification/acceptance/RUBRIC.md"));
});
