import assert from "node:assert/strict";
import test from "node:test";
import { parseConversationResultSource, parseTaskResultSource } from "./artifact-result-sources.mjs";

const h = character => character.repeat(64);
const time = index => `2026-09-04T00:00:0${index}.000Z`;
const evidence = { schemaVersion: "runaai-answer-evidence/v2", citations: [], ground: "no-ground-needed",
  retrieval: { attempted: false, skipped: true, skipReason: "none", empty: true, degraded: false,
    evidenceCount: 0, unavailable: [], omissions: [] }, workspace: null,
  completion: { reason: "complete", timedOut: false, outputLimited: false }, execution: { status: "not-executed" },
  review: null, researchWorkflow: null };
const conversation = () => ({ schemaVersion: "runaai-result-conversation-source/v1", chatId: "chat_01",
  projectId: "project_01", experience: "chat", updatedAt: time(3), turnCount: 2,
  turns: [
    { turnOrdinal: 1, occurredAt: time(1), route: "general-chat", assistant: "First", evidence },
    { turnOrdinal: 2, occurredAt: time(2), route: "guarded-chat", assistant: "Second", evidence },
  ] });
const proposal = (id, capabilityId, prepared) => ({ proposalId: id, taskId: "task_01", status: "completed",
  policy: "automatic", capabilityId, proposalDigest: h("a"), expectedProjectRevision: 1,
  beforeWorkspaceSha256: h("b"), createdAt: time(1), updatedAt: time(2), prepared });
const task = () => ({ schemaVersion: "runaai-result-task-source/v1",
  task: { taskId: "task_01", status: "active", updatedAt: time(3) },
  project: { revision: 2, workspaceSha256: h("c") },
  proposals: [proposal("proposal_01", "project.inspect",
    { kind: "inspect", path: "main.js", sha256: h("d"), bytes: 4, content: "text" })],
  receipts: [{ receiptId: "receipt_01", taskId: "task_01", proposalId: "proposal_01",
    proposalDigest: h("a"), receiptDigest: h("e"), capabilityId: "project.inspect", argumentsDigest: h("f"),
    beforeRevision: 1, afterRevision: 1, beforeSha256: h("b"), afterSha256: h("b"), effectKind: "observed",
    executionStatus: "observed", cancellationRequested: false, grantRevokedAfterDispatch: false,
    currentAtRecording: true, recordedAt: time(2),
    output: { path: "main.js", sha256: h("d"), bytes: 4, content: "text" } }],
  intents: [{ proposalId: "proposal_01", status: "recorded", effectId: "effect_01", updatedAt: time(2) }],
});

test("conversation source is strict, complete, ordered and experience-bound", () => {
  assert.deepEqual(parseConversationResultSource(conversation()), conversation());
  assert.throws(() => parseConversationResultSource({ ...conversation(), turnCount: 1 }), /result-source-invalid/u);
  assert.throws(() => parseConversationResultSource({ ...conversation(), turns: conversation().turns.toReversed() }),
    /result-source-invalid/u);
  const gap = conversation(); gap.turns[1].turnOrdinal = 3;
  assert.throws(() => parseConversationResultSource(gap), /result-source-invalid/u);
  assert.throws(() => parseConversationResultSource({ ...conversation(), experience: "code" }), /result-source-invalid/u);
  assert.throws(() => parseConversationResultSource({ ...conversation(), title: "not public" }), /result-source-invalid/u);
  const accessor = conversation();
  Object.defineProperty(accessor.turns[0], "assistant", { enumerable: true, get() { throw new Error("invoked"); } });
  assert.throws(() => parseConversationResultSource(accessor), /result-source-invalid/u);
  const symbol = conversation(); symbol.turns[0][Symbol("unknown")] = true;
  assert.throws(() => parseConversationResultSource(symbol), /result-source-invalid/u);
  const prototype = conversation(); prototype.turns[0] = Object.assign(Object.create(null), prototype.turns[0]);
  assert.throws(() => parseConversationResultSource(prototype), /result-source-invalid/u);
  const arrayPrototype = conversation();
  Object.setPrototypeOf(arrayPrototype.turns, Object.create(Array.prototype));
  assert.throws(() => parseConversationResultSource(arrayPrototype), /result-source-invalid/u);
});

test("Research and Review rows require their retained v2 application evidence", () => {
  for (const route of ["research-chat", "review-chat"]) {
    const value = conversation(); value.turns = [{ ...value.turns[0], route }]; value.turnCount = 1;
    assert.throws(() => parseConversationResultSource(value), /result-source-invalid/u);
  }
});

test("task source is strict, ordered and binds proposal intent and receipt", () => {
  assert.deepEqual(parseTaskResultSource(task()), task());
  const foreign = task(); foreign.receipts[0].taskId = "task_02";
  assert.throws(() => parseTaskResultSource(foreign), /result-source-invalid/u);
  const digest = task(); digest.receipts[0].proposalDigest = h("0");
  assert.throws(() => parseTaskResultSource(digest), /result-source-invalid/u);
  const orphan = task(); orphan.intents[0].proposalId = "proposal_missing";
  assert.throws(() => parseTaskResultSource(orphan), /result-source-invalid/u);
  const duplicate = task(); duplicate.intents.push(structuredClone(duplicate.intents[0]));
  assert.throws(() => parseTaskResultSource(duplicate), /result-source-invalid/u);
  const duplicateReceipt = task(); duplicateReceipt.receipts.push({ ...structuredClone(duplicateReceipt.receipts[0]),
    receiptId: "receipt_02", recordedAt: time(3) });
  assert.throws(() => parseTaskResultSource(duplicateReceipt), /result-source-invalid/u);
  assert.throws(() => parseTaskResultSource({ ...task(), grants: [] }), /result-source-invalid/u);
});

test("task intent order is canonical and cannot perturb owner hashing", () => {
  const value = task();
  value.proposals.push(proposal("proposal_02", "project.inspect",
    { kind: "inspect", path: "other.js", sha256: h("1"), bytes: 1, content: "x" }));
  value.proposals[1].createdAt = time(3);
  value.intents.push({ proposalId: "proposal_02", status: "prepared", effectId: "effect_02", updatedAt: time(3) });
  assert.deepEqual(parseTaskResultSource(value), value);
  value.intents.reverse();
  assert.throws(() => parseTaskResultSource(value), /result-source-invalid/u);
});

test("task preview and outcome relationships fail closed", () => {
  const invalidApply = task();
  invalidApply.proposals[0] = proposal("proposal_01", "project.apply-change", { kind: "apply", path: "main.js",
    beforeSha256: null, afterSha256: h("d"), beforeContent: "old", afterContent: "new",
    afterWorkspaceSha256: h("c") });
  assert.throws(() => parseTaskResultSource(invalidApply), /result-source-invalid/u);
  const invalidOutcome = task(); invalidOutcome.receipts[0].output = { suiteId: "suite_01", suiteSha256: h("d"),
    workspaceSha256: h("c"), status: "passed", passed: false, checks: [] };
  assert.throws(() => parseTaskResultSource(invalidOutcome), /result-source-invalid/u);
  const contradictory = task();
  contradictory.proposals[0] = proposal("proposal_01", "project.run-tests",
    { kind: "test", suiteId: "suite_01", suiteSha256: h("d"), testIds: ["one"] });
  contradictory.receipts[0].capabilityId = "project.run-tests";
  contradictory.receipts[0].output = { suiteId: "suite_01", suiteSha256: h("d"), workspaceSha256: h("c"),
    status: "passed", passed: true, checks: [{ testId: "one", expected: 1, actual: 2,
      errorCode: "project-test-evaluation-failed", passed: true }] };
  assert.throws(() => parseTaskResultSource(contradictory), /result-source-invalid/u);
});

test("conversation and all task collection maxima reject maximum plus one without truncation", () => {
  const tooMany = conversation();
  tooMany.turns = Array.from({ length: 33 }, (_, index) => ({ ...conversation().turns[0],
    turnOrdinal: index + 1, occurredAt: new Date(Date.UTC(2026, 8, 4, 0, 0, index)).toISOString() }));
  tooMany.turnCount = 33;
  assert.throws(() => parseConversationResultSource(tooMany), /result-source-invalid/u);
  const proposals = task(); proposals.receipts = []; proposals.intents = [];
  proposals.proposals = Array.from({ length: 17 }, (_, index) => {
    const item = proposal(`proposal_${String(index + 1).padStart(2, "0")}`, "project.inspect", null);
    item.createdAt = new Date(Date.UTC(2026, 8, 4, 0, 1, index)).toISOString();
    return item;
  });
  assert.throws(() => parseTaskResultSource(proposals), /result-source-invalid/u);
  const receipts = task();
  receipts.receipts = Array.from({ length: 25 }, (_, index) => ({ ...structuredClone(task().receipts[0]),
    receiptId: `receipt_${String(index + 1).padStart(2, "0")}`,
    recordedAt: new Date(Date.UTC(2026, 8, 4, 0, 1, index)).toISOString() }));
  assert.throws(() => parseTaskResultSource(receipts), /result-source-invalid/u);
  const intents = task();
  intents.intents = Array.from({ length: 25 }, (_, index) => ({ ...structuredClone(task().intents[0]),
    effectId: `effect_${String(index + 1).padStart(2, "0")}` }));
  assert.throws(() => parseTaskResultSource(intents), /result-source-invalid/u);
});
