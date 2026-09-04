import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { decodeCanonicalBase64 } from "./artifact-result-contracts.mjs";
import { createConversationContext } from "./conversation-context.mjs";
import { M1FunctionSurface } from "./surface.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const h = character => character.repeat(64);
const time = "2026-09-04T00:00:00.000Z";
const answerEvidence = { schemaVersion: "runaai-answer-evidence/v2", citations: [], ground: "no-ground-needed",
  retrieval: { attempted: false, skipped: true, skipReason: "none", empty: true, degraded: false,
    evidenceCount: 0, unavailable: [], omissions: [] }, workspace: null,
  completion: { reason: "complete", timedOut: false, outputLimited: false },
  execution: { status: "not-executed" }, review: null, researchWorkflow: null };

const conversationSource = { schemaVersion: "runaai-result-conversation-source/v1", chatId: "chat-01",
  projectId: "project-01", experience: "chat", updatedAt: time, turnCount: 1,
  turns: [{ turnOrdinal: 1, occurredAt: time, route: "general-chat", assistant: "Visible result.\n",
    evidence: answerEvidence }] };
const before = "old\n", after = "new\n";
const taskSource = { schemaVersion: "runaai-result-task-source/v1",
  task: { taskId: "task-01", status: "active", updatedAt: time },
  project: { revision: 1, workspaceSha256: h("1") },
  proposals: [{ proposalId: "proposal-01", taskId: "task-01", status: "completed", policy: "automatic",
    capabilityId: "project.apply-change", proposalDigest: h("2"), expectedProjectRevision: 1,
    beforeWorkspaceSha256: h("1"), createdAt: time, updatedAt: time,
    prepared: { kind: "apply", path: "main.js", beforeSha256: hash(before), afterSha256: hash(after),
      beforeContent: before, afterContent: after, afterWorkspaceSha256: h("3") } }],
  receipts: [], intents: [] };

function fixture() {
  const calls = [];
  const application = { async authority() {},
    authenticator: { async authenticate(credential) {
      assert.equal(credential, "credential"); return { verified: true, principalId: "alice" };
    } }, authorizer: { async authorize() { return { allowed: true }; } },
    continuity: { async prepareAnswerContext(scope) { return createConversationContext(scope); } } };
  const conversationResults = { async readOwner(context, input) {
    calls.push(["conversation", context, input]); return structuredClone(conversationSource);
  } };
  const taskResults = { async readOwner(context, input) {
    calls.push(["task", context, input]); return structuredClone(taskSource);
  } };
  const surface = new M1FunctionSurface({ application, sources: {}, tasks: {}, conversationResults, taskResults });
  const request = (experience, operation, input) => ({ credential: "credential", sessionBinding: h("a"),
    body: { projectId: "project-01", experience, operation, input } });
  return { calls, request, surface };
}

test("authenticated Chat lists and reads conversation results before the Code-only guard", async () => {
  const { calls, request, surface } = fixture();
  const list = await surface.dispatch(request("chat", "result.list",
    { owner: { kind: "conversation", chatId: "chat-01" } }));
  assert.equal(list.results.length, 1);
  assert.equal(list.results[0].readiness, "ready");
  const descriptor = list.results[0];
  const read = await surface.dispatch(request("chat", "result.read", { owner: descriptor.owner,
    resultId: descriptor.resultId, contentSha256: descriptor.contentSha256 }));
  assert.equal(decodeCanonicalBase64(read.contentBase64, descriptor).toString(), "Visible result.\n");
  assert.deepEqual(calls.map(call => call[0]), ["conversation", "conversation"]);
  assert.deepEqual(calls[0][1], { principalId: "alice", projectId: "project-01",
    sessionId: `browser-${h("a")}` });
  assert.deepEqual(calls[0][2], { chatId: "chat-01" });
});

test("authenticated Code lists and reads task results through the task owner point port", async () => {
  const { calls, request, surface } = fixture();
  const list = await surface.dispatch(request("code", "result.list",
    { owner: { kind: "task", taskId: "task-01" } }));
  assert.deepEqual(list.results.map(result => result.kind), ["code-diff"]);
  const descriptor = list.results[0];
  const read = await surface.dispatch(request("code", "result.read", { owner: descriptor.owner,
    resultId: descriptor.resultId, contentSha256: descriptor.contentSha256 }));
  assert.match(decodeCanonicalBase64(read.contentBase64, descriptor).toString(), /^--- a\/main\.js\n/um);
  assert.deepEqual(calls.map(call => call[0]), ["task", "task"]);
  assert.deepEqual(calls[0][2], { taskId: "task-01" });
});

test("result operations reject request extras and wrong experience without broad fallback", async () => {
  const { calls, request, surface } = fixture();
  await assert.rejects(surface.dispatch(request("chat", "result.list",
    { owner: { kind: "conversation", chatId: "chat-01" }, maximum: 1 })),
  { code: "result-request-invalid" });
  assert.equal(calls.length, 0);
  await assert.rejects(surface.dispatch(request("chat", "result.list",
    { owner: { kind: "task", taskId: "task-01" } })), { code: "result-owner-not-found" });
  assert.equal(calls.length, 0, "a Chat request cannot probe the task owner port");
  conversationSource.experience = "chat";
  await assert.rejects(surface.dispatch(request("code", "result.list",
    { owner: { kind: "conversation", chatId: "chat-01" } })), { code: "result-owner-not-found" });
  assert.deepEqual(calls.map(call => call[0]), ["conversation"]);
  surface.conversationResults = { async readOwner() { return { ...structuredClone(conversationSource),
    chatId: "foreign-chat" }; } };
  await assert.rejects(surface.dispatch(request("chat", "result.list",
    { owner: { kind: "conversation", chatId: "chat-01" } })), { code: "result-owner-not-found" });
  surface.taskResults = { async readOwner() { const source = structuredClone(taskSource);
    source.task.taskId = "foreign-task"; return source; } };
  await assert.rejects(surface.dispatch(request("code", "result.list",
    { owner: { kind: "task", taskId: "task-01" } })), { code: "result-owner-not-found" });
});

test("missing result source ports fail unavailable without entering task or orchestrator methods", async () => {
  const { request, surface } = fixture();
  surface.conversationResults = null;
  await assert.rejects(surface.dispatch(request("chat", "result.list",
    { owner: { kind: "conversation", chatId: "chat-01" } })), { code: "result-unavailable" });
});
