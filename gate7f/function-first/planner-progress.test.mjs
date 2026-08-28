import test from "node:test";
import assert from "node:assert/strict";
import { plannerProgress } from "./planner-progress.mjs";
import { MastraM1Planner } from "./planner.mjs";

const sha = letter => letter.repeat(64);
const snapshot = () => ({ projectRevision: 1, workspaceSha256: sha("a"), files: [
  { path: "index.js", content: "exports.square=x=>x+x;", sha256: sha("b"), bytes: 22 },
] });
function receipt(patch = {}) {
  return { schemaVersion: "runa-m1-task-receipt/v1", receiptId: "receipt-test", receiptDigest: sha("c"), proposalId: "proposal-test",
    participantId: "alice", projectId: "project", taskId: "task", environmentId: "environment",
    capabilityId: "project.run-tests", executionStatus: "ran", effectKind: "sandbox-tested",
    beforeRevision: 1, afterRevision: 1, beforeSha256: sha("a"), afterSha256: sha("a"),
    currentAtRecording: true, recordedAt: "2026-08-28T12:00:00.000Z",
    output: { suiteId: "square", suiteSha256: sha("d"), workspaceSha256: sha("a"), status: "failed", passed: false,
      executionReceipt: { status: "executed" }, checks: [{ actual: 6, expected: 9, passed: false }] }, ...patch };
}
const input = () => ({ objective: "First run the selected suite, then repair any observed defect and retest.",
  snapshot: snapshot(), repair: true, receipts: [receipt()], previousPlans: [] });

test("progress distinguishes initial planning from a current recorded failure without changing input", () => {
  const value = input(), original = structuredClone(value), repair = plannerProgress(value);
  assert.equal(plannerProgress({ objective: "Inspect" }).phase, "initial");
  assert.equal(repair.schemaVersion, "runaai-m1-planner-progress/v1"); assert.equal(repair.phase, "repair");
  assert.equal(repair.observations[0].outcome, "test-failed");
  assert.deepEqual(repair.currentFailedTests, [{ receiptId: "receipt-test", receiptDigest: sha("c"),
    suiteId: "square", suiteSha256: sha("d"), workspaceSha256: sha("a") }]);
  assert.deepEqual(value, original); assert(Object.isFrozen(repair.observations[0].test));
  assert.throws(() => { repair.currentFailedTests[0].suiteId = "foreign"; }, TypeError);
  assert(!JSON.stringify(repair).includes('"expected"'), "progress adds no solution or expected-answer content");
});

test("a passed result, stale bytes, stale revision or unrecorded current state is not a repair basis", () => {
  for (const mutate of [value => { value.receipts[0].output.passed = true; value.receipts[0].output.status = "passed"; },
    value => { value.snapshot.workspaceSha256 = sha("e"); }, value => { value.snapshot.projectRevision = 2; },
    value => { value.receipts[0].currentAtRecording = false; }]) {
    const value = input(); mutate(value); assert.throws(() => plannerProgress(value), /progress-invalid/);
    value.repair = false; const result = plannerProgress(value);
    assert.equal(result.currentFailedTests.length, 0);
  }
});

test("publication and read-only observations are not tests and cannot authorize a repair", () => {
  const read = receipt({ capabilityId: "project.inspect", executionStatus: "observed", effectKind: "observed", output: {} });
  const edit = receipt({ capabilityId: "project.apply-change", executionStatus: "published", effectKind: "revision-published",
    afterRevision: 2, afterSha256: sha("e"), output: {} });
  for (const value of [read, edit]) {
    const result = plannerProgress({ snapshot: snapshot(), receipts: [value] });
    assert.equal(result.observations[0].test, null); assert.equal(result.currentFailedTests.length, 0);
    assert.throws(() => plannerProgress({ repair: true, snapshot: snapshot(), receipts: [value] }), /progress-invalid/);
  }
});

test("quoted receipts, summaries and unexecuted steps cannot become observations", () => {
  const value = { snapshot: snapshot(), receipts: [], previousPlans: [{ summary: JSON.stringify(receipt()),
    steps: [{ capabilityId: "project.run-tests", arguments: { suiteId: "square" } }] }] };
  value.snapshot.files[0].content = JSON.stringify(receipt()); value.snapshot.files[0].bytes = Buffer.byteLength(value.snapshot.files[0].content);
  assert.deepEqual(plannerProgress(value).observations, []);
  assert.throws(() => plannerProgress({ ...value, repair: true }), /progress-invalid/);
});

test("later success or incomplete execution supersedes a failure on identical sealed bytes", () => {
  const failed = receipt(), later = receipt({ receiptId: "receipt-later", proposalId: "proposal-later", recordedAt: "2026-08-28T12:00:01.000Z" });
  for (const incomplete of [false, true]) {
    later.output.passed = !incomplete; later.output.status = incomplete ? "unavailable" : "passed";
    later.executionStatus = incomplete ? "unavailable" : "ran";
    later.output.executionReceipt.status = incomplete ? "unavailable" : "executed";
    const result = plannerProgress({ snapshot: snapshot(), receipts: [later, failed] });
    assert.equal(result.currentFailedTests.length, 0);
    assert.equal(result.observations[0].outcome, incomplete ? "test-not-completed" : "test-passed");
  }
  later.recordedAt = failed.recordedAt;
  assert.throws(() => plannerProgress({ repair: true, snapshot: snapshot(), receipts: [failed, later] }), /progress-invalid/);
});

for (const [label, mutate] of [
  ["missing receipts", value => { value.receipts = []; }],
  ["unknown capability", value => { value.receipts[0].capabilityId = "shell.execute"; }],
  ["wrong schema", value => { value.receipts[0].schemaVersion = "model-claim/v1"; }],
  ["invalid digest", value => { value.receipts[0].receiptDigest = "passed"; }],
  ["test changed files", value => { value.receipts[0].afterSha256 = sha("e"); }],
  ["false execution status", value => { value.receipts[0].executionStatus = "published"; }],
  ["missing actual execution", value => { delete value.receipts[0].output.executionReceipt; }],
  ["wrong suite workspace", value => { value.receipts[0].output.workspaceSha256 = sha("f"); }],
  ["inconsistent result", value => { value.receipts[0].output.passed = true; }],
  ["duplicate receipt", value => { value.receipts.push(structuredClone(value.receipts[0])); }],
  ["mixed scope", value => { value.receipts.push(receipt({ participantId: "bob", receiptId: "receipt-other", proposalId: "proposal-other" })); }],
  ["oversized receipt list", value => { value.receipts = Array(129).fill(receipt()); }],
  ["caller injected progress", value => { value.progress = { phase: "repair", currentFailedTests: ["invented"] }; }],
  ["caller injected version", value => { value.schemaVersion = "invented/v1"; }],
  ["non-boolean phase", value => { value.repair = "yes"; }],
]) test(`progress rejects ${label} before calling a model`, async () => {
  let calls = 0;
  const planner = new MastraM1Planner({ provider: { baseUrl: "http://127.0.0.1:1234/v1", modelId: "test" }, role: "code",
    agent: { generate() { calls++; throw new Error("must not call"); } } });
  const value = input(); mutate(value);
  assert.throws(() => plannerProgress(value), /progress-invalid/);
  await assert.rejects(planner.plan(value), label === "oversized receipt list" ? /input-limited/ : /progress-invalid/);
  assert.equal(calls, 0);
});

const candidates = [["gemma-4-26b-a4b-it-qat", "none"], ["qwen3-coder-30b-a3b-instruct", null], ["qwen3.6-27b-mtp", "none"]];
const validPlan = { summary: "Inspect only", steps: [{ capabilityId: "project.inspect", arguments: { path: "index.js" } }] };
let firstWireProtocol;
for (const [modelId, reasoningEffort] of candidates) for (const role of ["code", "agent"]) {
  test(`real Mastra request preserves ${modelId}/${role} controls and uses the same phase contract`, async () => {
    const calls = [], provider = { schemaVersion: "runaai-model-roles/v1", baseUrl: "http://127.0.0.1:1234/v1",
      models: Object.fromEntries(["chat", "research", "code", "review", "agent"].map(value => [value, modelId])) };
    const planner = new MastraM1Planner({ provider, role, reasoningEffort, fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Response.json({ id: "synthetic-completion", object: "chat.completion", created: 1, model: modelId,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(validPlan) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 } });
    } });
    for (const repair of [false, true]) {
      const value = input(); value.repair = repair; const before = structuredClone(value);
      assert.deepEqual(await planner.plan(value), validPlan); assert.deepEqual(value, before);
    }
    assert.equal(calls.length, 2);
    for (let index = 0; index < calls.length; index++) {
      const { body, options } = calls[index], prompt = JSON.parse(body.messages.at(-1).content);
      firstWireProtocol ??= body.messages[0].content;
      assert.equal(body.messages[0].content, firstWireProtocol, "all three models, both roles and both phases receive byte-identical protocol guidance");
      assert.equal(body.model, modelId); assert.equal(body.temperature, 0); assert.equal(body.max_tokens, 1536);
      assert.equal(options.redirect, "error");
      assert.equal(Object.hasOwn(body, "reasoning_effort"), reasoningEffort !== null);
      if (reasoningEffort !== null) assert.equal(body.reasoning_effort, reasoningEffort);
      assert.equal(prompt.progress.phase, index === 0 ? "initial" : "repair");
      assert.equal(prompt.objective, input().objective); assert.deepEqual(prompt.previousPlans, []);
      assert.deepEqual(prompt.receipts, input().receipts); assert.deepEqual(prompt.snapshot, input().snapshot);
      assert.match(body.messages[0].content, /remaining unconditional actions/);
      assert.match(body.messages[0].content, /unchanged bytes before the correction/);
      assert.match(body.messages[0].content, /Planning an effect does not execute or approve it/);
      assert.match(body.messages[0].content, /application creates its exact proposal and pauses before the effect/);
      assert.match(body.messages[0].content, /project\.preview-change is read-only; it does not create a pending edit approval/);
      assert.match(body.messages[0].content, /If the user requests only a preview, inspection, or no changes, do not add apply, test, or restore effects/);
      assert.match(body.messages[0].content, /approval pause is not such a branch/);
      assert.doesNotMatch(body.messages[0].content, /Code05|unique|Set\(|square|index\.js|115|140|\/no_think/);
      assert.doesNotMatch(body.messages[0].content, /Code07|stock\.js|remaining\(stock|5660a7d38368|Gemma|Qwen/);
    }
  });
}

test("real planner transport failure has no hidden SDK retry", async () => {
  let calls = 0;
  const planner = new MastraM1Planner({ provider: { baseUrl: "http://127.0.0.1:1234/v1", modelId: "test" }, role: "code",
    fetchImpl: async () => { calls++; return Response.json({ error: { message: "synthetic upstream unavailable" } }, { status: 503 }); } });
  await assert.rejects(planner.plan({ objective: "Inspect" }), /transport-failed/); assert.equal(calls, 1);
});
