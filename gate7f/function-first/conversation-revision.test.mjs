import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryRecordStore, MemoryIndex, ScriptedProvider } from "../../gate1/adapters/memory.mjs";
import { MemoryContinuityStore, MemoryWorkspaceResolver } from "../../gate2/continuity.mjs";
import { Gate2ReadOnlyService } from "../../gate2/core.mjs";
import { SelectedCoreApplication } from "../../gate6b/application.mjs";
import { PostgresRequestCoordinator } from "../../gate6b/adapters/postgres-continuity.mjs";
import { INCOMPLETE_ANSWER_REASONS, isRetryableConversationFailure } from "./conversation-outcome.mjs";

function coordinatorPool() {
  const rows = new Map();
  const query = async (sql, values) => {
    if (sql.includes("SELECT actor_id,input_digest,response_json")) {
      const row = rows.get(`${values[0]}:${values[1]}`);
      return { rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("INSERT INTO runa_runtime.route_responses")) {
      rows.set(`${values[0]}:${values[1]}`, { actor_id: values[2], input_digest: values[3], response_json: JSON.parse(values[4]) });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  };
  return { rows, async connect() { return { query, release() {} }; } };
}

const actor = "synthetic-participant";
const projectId = "synthetic-project";
const body = (id, overrides = {}) => ({ requestId: id, threadId: "synthetic-thread", projectId,
  experience: "chat", lane: "general", message: `Hello ${id}`, ...overrides });
function harness({ reply, coordinator = false } = {}) {
  const continuity = new MemoryContinuityStore();
  continuity.seedProject({ participantId: actor, projectId, experience: "chat", displayName: "Synthetic" });
  const provider = new ScriptedProvider({ role: "chat", reply: reply ?? (() => ({ answer: "Hello.", citations: [] })) });
  const records = new MemoryRecordStore();
  const service = new Gate2ReadOnlyService({ records, index: new MemoryIndex(), providers: { chat: provider },
    continuity, workspaceResolver: new MemoryWorkspaceResolver() });
  const pool = coordinatorPool();
  const app = new SelectedCoreApplication({ mode: "active", targetGeneration: "synthetic",
    cutoverStatus: async () => ({ phase: "closed", authorityGeneration: "synthetic" }),
    answerService: service, actionService: {}, continuity,
    requestCoordinator: coordinator ? new PostgresRequestCoordinator({ pool }) : null,
    authenticator: { async authenticate() { return { principalId: actor, verified: true }; } },
    authorizer: { async authorize() { return { allowed: true }; } } });
  return { app, continuity, provider, records, pool };
}

test("server context revisions advance only after a retained complete answer", async () => {
  const context = harness();
  const result = await context.app.answer({ credential: "synthetic", body: body("first", { contextRevision: 0 }) });
  assert.equal(result.contextRevision, 1);
  assert.equal(result.continuity.turnRecorded, true);
  await assert.rejects(context.app.answer({ credential: "synthetic", body: body("stale", { contextRevision: 0 }) }),
    { code: "conversation-revision-conflict" });
  assert.equal(context.provider.calls.length, 1);
  const next = await context.app.answer({ credential: "synthetic", body: body("current", { contextRevision: 1 }) });
  assert.equal(next.contextRevision, 2);
});

test("concurrent distinct requests do not append an answer generated from a stale revision", async () => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const context = harness({ reply: async () => {
    if (++calls === 2) release();
    await ready;
    return { answer: "Synthetic concurrent answer.", citations: [] };
  } });
  const results = await Promise.allSettled(["one", "two"].map(id =>
    context.app.answer({ credential: "synthetic", body: body(id) })));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  const rejected = results.findIndex(item => item.status === "rejected");
  assert.equal(results[rejected].reason.code, "conversation-revision-conflict");
  assert.equal(context.continuity.chats.get("synthetic-thread").turns.length, 1);
  const retryId = ["one", "two"][rejected];
  const retry = await context.app.answer({ credential: "synthetic", body: body(retryId) });
  assert.equal(retry.contextRevision, 2);
  assert.equal(context.provider.calls[2].request.history.length, 2);
  assert.equal(context.records.turns.length, 0, "no stale inner answer cache is authoritative");
});

test("an exact completed request replays its result despite the expected revision already advancing", async () => {
  const context = harness({ coordinator: true });
  const input = { credential: "synthetic", body: body("same", { contextRevision: 0 }) };
  const first = await context.app.answer(input);
  const replay = await context.app.answer(input);
  assert.deepEqual(replay, first);
  assert.equal(context.provider.calls.length, 1);
  assert.equal(context.continuity.chats.get("synthetic-thread").turns.length, 1);
  await assert.rejects(context.app.answer({ credential: "synthetic", body: body("same", { contextRevision: 1 }) }),
    { code: "request-id-conflict" });
});

test("an incomplete read-only answer can be retried under its original bound request id", async () => {
  let attempts = 0;
  const context = harness({ coordinator: true, reply: () => {
    if (++attempts === 1) throw Object.assign(new Error("Synthetic provider failure"), { code: "provider-incomplete" });
    return { answer: "A completed synthetic answer.", citations: [] };
  } });
  const input = { credential: "synthetic", body: body("retry", { contextRevision: 0 }) };
  const incomplete = await context.app.answer(input);
  assert.equal(incomplete.completion.reason, "provider-incomplete");
  assert.equal(incomplete.contextRevision, 0);
  assert.equal(incomplete.continuity.turnRecorded, false);
  const complete = await context.app.answer(input);
  assert.equal(complete.completion.reason, "complete");
  assert.equal(complete.contextRevision, 1);
  assert.equal(complete.continuity.turnRecorded, true);
  const duplicate = await context.app.answer(input);
  assert.deepEqual(duplicate, complete);
  assert.equal(attempts, 2);
  assert.equal(context.continuity.chats.get("synthetic-thread").turns.length, 1);
});

test("retryable failures remain bound to their actor and original request input", async () => {
  const context = harness({ coordinator: true, reply: () => {
    throw Object.assign(new Error("Synthetic provider failure"), { code: "provider-incomplete" });
  } });
  await context.app.answer({ credential: "synthetic", body: body("bound") });
  await assert.rejects(context.app.answer({ credential: "synthetic", body: body("bound", { message: "Different input" }) }),
    { code: "request-id-conflict" });
  assert.equal(context.provider.calls.length, 1);
});

test("the read-only retry classifier never replays actions or uncertain effects", async () => {
  const pool = coordinatorPool();
  const coordinator = new PostgresRequestCoordinator({ pool });
  const failure = { schemaVersion: "runa2-answer-response/v2", completion: { reason: "provider-incomplete" },
    execution: { status: "not-executed" }, effects: [] };
  let attempts = 0;
  const input = { operation: "execute-action", requestId: "action", actorId: actor, inputDigest: "digest",
    execute: async () => { attempts++; return failure; } };
  await coordinator.runOnce(input);
  await coordinator.runOnce(input);
  assert.equal(attempts, 1);
  for (const reason of INCOMPLETE_ANSWER_REASONS) {
    assert.equal(isRetryableConversationFailure({ ...failure, completion: { reason } }), true);
  }
  assert.equal(isRetryableConversationFailure({ ...failure, effects: ["changed-file"] }), false);
  assert.equal(isRetryableConversationFailure({ ...failure, execution: { status: "executed" } }), false);
  assert.equal(isRetryableConversationFailure({ ...failure, execution: undefined }), false);
});

test("invalid or forged client revisions do not replace the server's retained history", async () => {
  const context = harness();
  for (const value of [-1, "0", NaN, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(context.app.answer({ credential: "synthetic", body: body("invalid", { contextRevision: value }) }),
      { code: "request-revision-invalid" });
  }
  await assert.rejects(context.app.answer({ credential: "synthetic", body: body("forged", { contextRevision: 999 }) }),
    { code: "conversation-revision-conflict" });
  assert.equal(context.provider.calls.length, 0);
});
