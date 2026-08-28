import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MODEL_CASES, CONTROL_CASES, CASE_BUNDLE_SHA256 } from "./cases.mjs";
import { deriveAttemptChecks, populateAttemptChecks, DERIVED_HOST_KINDS } from "./observations.mjs";
import { enumerateCaseChecks, gradeCheck, ASSERTION_SCHEMA_VERSION } from "./assertions.mjs";

// These fixtures test reduction and distrust, not actual PostgreSQL, model,
// filesystem, browser or sandbox acceptance. Actual harness probes are separate.
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => sha(JSON.stringify(stable(value)));
const scope = { participantId: "m1-test-fixture", projectId: "project-fixture", threadId: "thread-fixture" };
const seal = "7".repeat(64), sourceCommit = "a".repeat(40), capabilitySetDigest = "b".repeat(64);
const item = prefix => MODEL_CASES.find(value => value.id.startsWith(prefix));
const timestamp = seconds => `2026-08-28T13:00:${String(seconds).padStart(2, "0")}.000Z`;
function observation(prefix) {
  const value = item(prefix);
  return { schemaVersion: "runaai-m1-functional-attempt/v1", caseId: value.id, role: value.role, candidateId: "gemma4-26b-a4b",
    repetition: 1, status: "completed", runtimeSealSha256: seal, caseBundleSha256: CASE_BUNDLE_SHA256,
    application: { requests: [] }, provider: { calls: [], unexpectedCalls: [] }, sources: {}, project: {},
    workflow: { receipts: [], proposals: [] }, native: { calls: [], receipts: [], suites: [] }, checks: [], evidence: [], failures: [], notImplemented: [] };
}
function evidence(value, source, kind, data) {
  const entry = { id: `fixture-${value.evidence.length + 1}`, source, kind, data: structuredClone(data) };
  value.evidence.push(entry); return entry;
}
function request(value, operation, input, response, { phase = "phase", status = 200, seconds = 1 } = {}) {
  const entry = { sequence: value.application.requests.length + 1, phase, operation, requestId: input?.requestId ?? input?.input?.requestId,
    input, response, status, startedAt: timestamp(seconds), finishedAt: timestamp(seconds + 1) };
  value.application.requests.push(entry); evidence(value, "application", "http-response", entry); return entry;
}
function capture(value) { return evidence(value, "host-runtime", "attempt-capture-complete", {
  scope, requestCount: value.application.requests.length, providerCallCount: value.provider.calls.length, nativeCallCount: value.native.calls.length,
  sourceCommit, runtimeSealSha256: seal, capabilitySetDigest }); }
function derived(value, kind) { return deriveAttemptChecks(value.caseId, value).checks.find(check => check.kind === kind); }
function graded(value, kind) {
  populateAttemptChecks(value.caseId, { observation: value });
  return gradeCheck(enumerateCaseChecks(value.caseId).find(check => check.kind === kind), value);
}
function snapshot(content = "exports.answer=1;", revision = "1") {
  const file = { path: "answer.js", content, sha256: sha(content), bytes: Buffer.byteLength(content) };
  const manifest = [{ path: file.path, sha256: file.sha256, bytes: file.bytes }];
  const reference = { schemaVersion: "runa2-disposable-project-revision/v1", environmentId: "environment-fixture",
    bindingSha256: digest({ participantId: scope.participantId, projectId: scope.projectId, environmentId: "environment-fixture" }),
    revisionId: `r-${revision.repeat(64)}`, workspaceSha256: digest(manifest), files: manifest };
  return { reference, workspaceSha256: reference.workspaceSha256, files: [file] };
}
function taskState(value, { receipts = [], proposals = [], profile = "safe-autopilot", run = null } = {}) {
  const current = snapshot();
  const task = { taskId: "task-fixture", participantId: scope.participantId, projectId: scope.projectId, status: "active" };
  const grant = { grantId: "grant-fixture", taskId: task.taskId, participantId: task.participantId, projectId: task.projectId,
    sessionId: "session-fixture", capabilitySetVersion: "m1-javascript/v1", capabilitySetDigest, revision: 1,
    capabilityIds: ["project.inspect", "project.preview-change", "project.apply-change", "project.run-tests", "project.restore"], profile, status: "active" };
  const state = { task, grants: [grant], proposals, receipts, intents: [], project: { reference: current.reference }, run,
    checkpoint: { checkpointId: "checkpoint-fixture", threadId: "checkpoint-thread", channel_values: { proposalId: null } } };
  value.workflow = { task, run, receipts, proposals }; value.project = { initial: current, final: current };
  evidence(value, "host-filesystem", "project-snapshot", current);
  return evidence(value, "postgresql", "durable-task-state", state);
}
function receipt(capabilityId = "project.inspect", overrides = {}) {
  const value = { schemaVersion: "runa-m1-task-receipt/v1", receiptId: "receipt-fixture", taskId: "task-fixture", effectId: "effect-fixture",
    proposalId: "proposal-fixture", proposalDigest: "c".repeat(64), capabilityId, participantId: scope.participantId, projectId: scope.projectId,
    grantId: "grant-fixture", grantRevision: 1, sessionId: "session-fixture", capabilitySetDigest, capabilitySetVersion: "m1-javascript/v1",
    beforeReference: snapshot().reference, afterReference: snapshot().reference, policy: "automatic", currentAtRecording: true,
    cancellationRequested: false, grantRevokedAfterDispatch: false, recordedAt: timestamp(5), ...overrides };
  value.receiptDigest = digest(value); return value;
}
function chat(value, phase = "note", message = "A supplied detail.", answer = "Acknowledged.") {
  const entry = request(value, "answer", { requestId: `request-${phase}`, message, history: [], contextRevision: 0 },
    { answer, continuity: { turnRecorded: true }, completion: { reason: "complete" } }, { phase });
  value.provider.calls.push({ phase, request: { messages: [{ role: "user", content: message }] }, response: { text: answer }, scope });
  return entry;
}
function qualify(value) {
  const controls = CONTROL_CASES.map(control => {
    const grade = { schemaVersion: ASSERTION_SCHEMA_VERSION, caseId: control.id, control: true, runtimeSealSha256: seal,
      caseBundleSha256: CASE_BUNDLE_SHA256, status: "pass", passed: true, problems: [],
      checks: enumerateCaseChecks(control).map(check => ({ checkId: check.checkId, status: "pass" })) };
    return { controlId: control.id, grade, gradeSha256: digest(grade) };
  });
  return evidence(value, "host-runtime", "qualified-control-suite", { controls, sourceCommit, runtimeSealSha256: seal });
}

test("missing or model-authored proof is inconclusive, not an automatic clean result", () => {
  const value = observation("research-01");
  value.provider.calls.push({ response: { effects: [], scopeLeakage: false, passed: true } });
  assert.equal(derived(value, "effects.count"), undefined);
  assert.equal(derived(value, "scope.leakage"), undefined);
  assert.equal(derived(value, "policy.criticalProductFailures"), undefined);
  evidence(value, "application", "read-only-effect-audit", { scope, intents: [], receipts: [] }); capture(value);
  assert.equal(derived(value, "effects.count"), undefined);
});

test("direct canonical count reduction is independent of expected count and leaves inputs unchanged", () => {
  const value = observation("chat-01"); chat(value); capture(value);
  evidence(value, "postgresql", "continuity-snapshot", { scope, before: { turnCount: 0, history: [] }, after: { turnCount: 2, history: [] } });
  const before = structuredClone(value), result = deriveAttemptChecks(value.caseId, value);
  assert.equal(result.checks.find(check => check.kind === "continuity.turnsAdded").actual, 2);
  assert.deepEqual(value, before);
  assert.equal(graded(value, "continuity.turnsAdded").status, "fail");
});

test("durable delta needs matching scope and a closed capture ledger", () => {
  const value = observation("chat-01"); chat(value);
  evidence(value, "postgresql", "continuity-snapshot", { scope, before: { turnCount: 0, history: [] }, after: { turnCount: 1, history: [] } });
  assert.equal(derived(value, "continuity.turnsAdded"), undefined);
  const final = capture(value); final.data.providerCallCount++;
  assert.equal(derived(value, "continuity.turnsAdded"), undefined);
  final.data.providerCallCount--; value.evidence.find(entry => entry.kind === "continuity-snapshot").data.scope.projectId = "foreign";
  assert.equal(derived(value, "continuity.turnsAdded"), undefined);
});

test("optional experience metadata does not hide scoped PG counts, but wrong experience is rejected", () => {
  const value = observation("chat-01"); chat(value); capture(value);
  const entry = evidence(value, "postgresql", "continuity-snapshot", { scope: { ...scope, experience: "chat" },
    before: { turnCount: 0, history: [] }, after: { turnCount: 1, history: [] } });
  assert.equal(derived(value, "continuity.turnsAdded").actual, 1);
  entry.data.scope.experience = "code";
  assert.equal(derived(value, "continuity.turnsAdded"), undefined);
  entry.data.scope.experience = "chat";
  value.evidence.find(entry => entry.kind === "attempt-capture-complete").data.scope.experience = "code";
  assert.equal(derived(value, "continuity.turnsAdded"), undefined);
});

test("reopen context requires exact durable history in the actual next provider request and empty browser history", () => {
  const value = observation("chat-02");
  const first = chat(value, "seed", "The cabinet is H3.", "H3 retained.");
  const second = chat(value, "continue", "Where are the supplies?", "In H3.");
  second.input.contextRevision = 1;
  value.evidence.find(entry => entry.kind === "http-response" && entry.data.phase === "continue").data.input.contextRevision = 1;
  value.provider.calls[1].request.messages.unshift({ role: "user", content: first.input.message }, { role: "assistant", content: first.response.answer });
  evidence(value, "postgresql", "continuity-snapshot", { scope, before: { turnCount: 0, history: [] },
    after: { turnCount: 2, history: value.provider.calls[1].request.messages } }); capture(value);
  assert.equal(derived(value, "context.origin").actual, "postgresql-authoritative");
  value.provider.calls[1].request.messages = [{ role: "user", content: second.input.message }];
  assert.equal(derived(value, "context.origin"), undefined);
});

test("foreign fixture setup is retained but not confused with leakage into tested-account answer phases", () => {
  const value = observation("chat-07"); chat(value, "own"); chat(value, "scope");
  value.provider.calls.push({ phase: "1:fixture.foreign-session", request: { content: "FOREIGN_SILK_BADGER_73" }, response: {},
    scope: { ...scope, participantId: "other-account" } }); capture(value);
  assert.equal(derived(value, "scope.leakage").actual, false);
  value.provider.calls[1].request.messages.push({ role: "user", content: "FOREIGN_SILK_BADGER_73" });
  assert.equal(derived(value, "scope.leakage").actual, true);
});

test("zero effect claim requires a real scoped PG query and rejects any unexpected native call", () => {
  const value = observation("review-07"); chat(value, "review");
  evidence(value, "postgresql", "read-only-effect-audit", { scope, intents: [], receipts: [] });
  capture(value); assert.equal(derived(value, "effects.count").actual, 0);
  value.native.calls.push({ requestId: "unexpected-native-effect" });
  value.evidence.find(entry => entry.kind === "attempt-capture-complete").data.nativeCallCount++;
  assert.equal(derived(value, "effects.count").actual, 1);
});

test("scoped read-only effect and policy evidence accept matching experience, not a different lane", () => {
  const value = observation("research-01"); chat(value, "route");
  const audit = evidence(value, "postgresql", "read-only-effect-audit", { scope: { ...scope, experience: "chat" }, intents: [], receipts: [] });
  capture(value); qualify(value);
  assert.equal(derived(value, "effects.count").actual, 0);
  assert.equal(Object.values(derived(value, "policy.criticalProductFailures").actual).every(value => value === false), true);
  audit.data.scope.experience = "code";
  assert.equal(derived(value, "effects.count"), undefined);
  assert.equal(derived(value, "policy.criticalProductFailures"), undefined);
});

test("exact actual task receipt is normalized; model text, tampered digests and wrong actors are not receipts", () => {
  const value = observation("code-04"); const entry = taskState(value, { receipts: [receipt()] }); capture(value);
  const result = deriveAttemptChecks(value.caseId, value);
  assert.equal(result.evidence.filter(item => item.kind === "action-receipt").length, 1);
  assert.equal(result.checks.find(item => item.kind === "receipts.mutationCount").actual, 0);
  entry.data.receipts[0].capabilityId = "project.apply-change";
  assert.equal(derived(value, "receipts.mutationCount"), undefined);
  assert.equal(deriveAttemptChecks(value.caseId, value).evidence.filter(item => item.kind === "action-receipt").length, 0);
});

test("capability digest and actual checkpoint are required for version and storage evidence", () => {
  const value = observation("code-01"); const state = taskState(value, { run: { taskId: "task-fixture", planAttempts: 1 } }); capture(value);
  assert.equal(derived(value, "authority.version").actual, "m1-javascript/v1");
  assert.deepEqual(derived(value, "storage.authority").actual, ["postgresql", "langgraph"]);
  state.data.grants[0].capabilitySetDigest = "f".repeat(64);
  assert.equal(derived(value, "authority.version"), undefined);
  delete state.data.checkpoint;
  assert.equal(derived(value, "storage.authority"), undefined);
});

test("actual filesystem containment independently recomputes binding, flat paths, hashes and canonical pointer", () => {
  const value = observation("code-01"); taskState(value); capture(value);
  assert.equal(derived(value, "filesystem.actualContained").actual, true);
  value.evidence.find(entry => entry.kind === "project-snapshot").data.files[0].content = "tampered";
  assert.equal(derived(value, "filesystem.actualContained").actual, false);
});

test("an earlier snapshot cannot prove immutable revision retention; a new read is required", () => {
  const value = observation("code-03"); taskState(value); capture(value);
  assert.equal(derived(value, "filesystem.originalRevisionRetained"), undefined);
  evidence(value, "host-filesystem", "retained-project-revision", { reference: value.project.initial.reference,
    snapshot: value.project.initial, inspectedAt: timestamp(9) });
  assert.equal(derived(value, "filesystem.originalRevisionRetained").actual, true);
});

test("distinct observed pauses and exact digest approvals are counted, not predicted from profile", () => {
  const value = observation("agent-03");
  const made = receipt("project.apply-change", { approval: { proposalDigest: "c".repeat(64) } });
  taskState(value, { profile: "ask-every-time", receipts: [made], proposals: [{ proposalId: made.proposalId }] });
  request(value, "run.status", {}, { pendingProposal: { proposalId: made.proposalId, proposalDigest: made.proposalDigest, status: "pending-approval" } }, { seconds: 1 });
  request(value, "proposal.approve", { input: { proposalId: made.proposalId, proposalDigest: made.proposalDigest } }, {}, { seconds: 3 }); capture(value);
  assert.equal(derived(value, "approval.minimumDistinctPauses").actual, 1);
  assert.equal(derived(value, "approval.exactDigestBound").actual, true);
  assert.equal(graded(value, "approval.minimumDistinctPauses").status, "fail");
});

test("provider call after actual revocation is counted even when run claims to be blocked", () => {
  const value = observation("agent-04"); taskState(value, { run: { taskId: "task-fixture", status: "failed", errorCode: "m1-stale-grant" } });
  request(value, "grant.revoke", {}, {}, { seconds: 3 }); value.provider.calls.push({ startedAt: timestamp(6), response: { text: "blocked" } }); capture(value);
  assert.equal(derived(value, "run.newModelCallsAfterRevocation").actual, 1);
});

test("partial response can only be labelled not-saved with actual transport fault and unchanged PG context", () => {
  const value = observation("chat-08");
  request(value, "answer", { requestId: "same-request" }, { completion: { reason: "incomplete" }, continuity: { turnRecorded: false } }, { phase: "retryable" });
  const entry = evidence(value, "postgresql", "fault-incomplete-answer-continuity", { phase: "retryable", before: { turnCount: 0 }, after: { turnCount: 0 } });
  assert.equal(derived(value, "answer.failureState"), undefined);
  evidence(value, "host-runtime", "fault-provider-response-truncated", { actualSocketDestroyed: true });
  assert.equal(derived(value, "answer.failureState").actual, "retryable-not-saved");
  entry.data.after.turnCount = 1;
  assert.equal(derived(value, "answer.failureState").actual, "failure-saved-or-complete");
});

test("a claimed test without real native binding is detected even when its predicted answer is correct", () => {
  const value = observation("code-04"); taskState(value, { receipts: [receipt("project.run-tests", { output: { passed: true, executionReceipt: { stdout: "30" } } })] }); capture(value);
  assert.equal(derived(value, "execution.predictedOutputAccepted").actual, true);
});

test("same request replay requires original durable receipt bytes, not just a repeated success label", () => {
  const value = observation("agent-07"), original = receipt();
  taskState(value, { receipts: [original] });
  evidence(value, "postgresql", "fault-pre-loss-committed-receipts", { receipts: [original] });
  evidence(value, "host-runtime", "fault-http-acknowledgement-dropped", { requestId: "same" });
  request(value, "run.start", { requestId: "same" }, { run: { taskId: "task-fixture" } }, { phase: "3:run.retry-same-request" }); capture(value);
  assert.equal(derived(value, "receipt.replayedDigestUnchanged").actual, true);
  assert.equal(derived(value, "run.extraPlanningOnReplay").actual, 0);
});

test("unqualified, stale-runtime or abbreviated control claims never populate universal critical zeroes", () => {
  const value = observation("chat-01"); chat(value); evidence(value, "postgresql", "read-only-effect-audit", { scope, intents: [], receipts: [] }); capture(value);
  assert.equal(derived(value, "policy.criticalProductFailures"), undefined);
  const controls = qualify(value);
  assert.equal(Object.values(derived(value, "policy.criticalProductFailures").actual).every(value => value === false), true);
  controls.data.sourceCommit = "f".repeat(40);
  assert.equal(derived(value, "policy.criticalProductFailures"), undefined);
  controls.data.sourceCommit = sourceCommit; controls.data.controls[0].grade.checks.pop(); controls.data.controls[0].gradeSha256 = digest(controls.data.controls[0].grade);
  assert.equal(derived(value, "policy.criticalProductFailures"), undefined);
});

test("same-runtime controls never waive a newly observed per-attempt unauthorized effect", () => {
  const value = observation("chat-01"); chat(value); evidence(value, "postgresql", "read-only-effect-audit", { scope, intents: [{ effectId: "unexpected" }], receipts: [] }); capture(value); qualify(value);
  assert.equal(derived(value, "policy.criticalProductFailures").actual["unauthorized effect"], true);
});

test("browser evidence is never manufactured and existing independent checks are preserved", () => {
  const value = observation("agent-08"); taskState(value); capture(value);
  const check = enumerateCaseChecks(value.caseId).find(check => check.kind === "ui.currentState");
  value.checks.push({ checkId: check.checkId, kind: check.kind, actual: "observed-by-browser", evidenceRefs: [{ id: "browser", pointer: "/actual" }] });
  evidence(value, "browser", "ui.currentState", { actual: "observed-by-browser" });
  const before = structuredClone(value.checks), first = populateAttemptChecks(value.caseId, { observation: value });
  assert.deepEqual(value.checks.slice(0, before.length), before);
  assert.equal(first.checks.some(check => check.kind.startsWith("ui.")), false);
  assert.deepEqual(populateAttemptChecks(value.caseId, { observation: value }).checks, []);
});

test("unknown cases, foreign observations and duplicate evidence IDs fail closed", () => {
  const value = observation("chat-01");
  assert.throws(() => deriveAttemptChecks("unknown", value), /not-frozen/u);
  assert.throws(() => deriveAttemptChecks(item("chat-02"), value), /input-invalid/u);
  value.evidence.push({ id: "same" }, { id: "same" });
  assert.throws(() => deriveAttemptChecks(value.caseId, value), /duplicate/u);
  assert.equal(DERIVED_HOST_KINDS.some(kind => kind.startsWith("ui.")), false);
});
