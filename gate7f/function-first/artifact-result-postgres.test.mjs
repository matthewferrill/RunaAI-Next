import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createEnvelopeCipher } from "../../gate4/envelope.mjs";
import { PostgresSelectedContinuityStore } from "../../gate6b/adapters/postgres-continuity.mjs";
import { decodeCanonicalBase64, RESULT_LIMITS } from "./artifact-result-contracts.mjs";
import { createPostgresArtifactResultSourcePorts } from "./artifact-result-postgres.mjs";
import { conversationResultOwnerHmac } from "./artifact-result-owner-binding.mjs";
import { listConversationResults, listTaskResults, readTaskResult } from "./artifact-result-projection.mjs";
import { bindingDigest } from "./project/contracts.mjs";
import { digest, proposalDigest, receiptDigest } from "./tasks/contracts.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const h = character => character.repeat(64);
const context = Object.freeze({ principalId: "alice", projectId: "alice-code", sessionId: "browser-session" });
const instant = second => `2026-09-04T00:00:${String(second).padStart(2, "0")}.000Z`;
const evidence = () => ({ schemaVersion: "runaai-answer-evidence/v2", citations: [],
  ground: "no-ground-needed", retrieval: { attempted: false, skipped: true, skipReason: "none", empty: true,
    degraded: false, evidenceCount: 0, unavailable: [], omissions: [] }, workspace: null,
  completion: { reason: "complete", timedOut: false, outputLimited: false },
  execution: { status: "not-executed" }, review: null, researchWorkflow: null });

class ScriptedPool {
  constructor(responses) { this.responses = [...responses]; this.queries = []; this.released = 0; }
  async connect() {
    const pool = this;
    return { async query(sql, values = []) {
      const normalized = String(sql).replace(/\s+/gu, " ").trim();
      if (/^(?:BEGIN|COMMIT|ROLLBACK)/u.test(normalized)) {
        pool.queries.push({ sql: normalized, values, transaction: true });
        return { rows: [] };
      }
      pool.queries.push({ sql: normalized, values, transaction: false });
      if (!pool.responses.length) throw new Error("unexpected query");
      return { rows: pool.responses.shift() };
    }, release() { pool.released += 1; } };
  }
  get dataQueries() { return this.queries.filter(query => !query.transaction); }
}

function cipherFixture(decryptQueries, queryCount) {
  return createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, 1), hmacKey: Buffer.alloc(32, 2),
    random: () => Buffer.alloc(12, 3), onDecrypt: () => decryptQueries.push(queryCount()) });
}

function conversationFixture({ ownerChanges = {}, preflightChanges = null, turnChanges = {} } = {}) {
  const decryptQueries = [];
  let pool;
  const cipher = cipherFixture(decryptQueries, () => pool?.dataQueries.length ?? 0);
  const ownerPrivate = { title: "Result chat", experience: "chat" };
  const ownerEnvelope = cipher.encrypt({ recordType: "chat", participantId: context.principalId,
    recordId: "chat-01", field: "private-payload" }, ownerPrivate);
  const ownerPublic = { chatId: "chat-01", projectId: context.projectId, parentChatId: null,
    branchFromTurn: null, turnCount: 1, archived: false, unread: false,
    createdAt: instant(0), updatedAt: instant(2) };
  const owner = { chat_id: ownerPublic.chatId, project_id: ownerPublic.projectId,
    parent_chat_id: ownerPublic.parentChatId, branch_from_turn: ownerPublic.branchFromTurn,
    turn_count: ownerPublic.turnCount, archived: ownerPublic.archived, unread: ownerPublic.unread,
    created_at: ownerPublic.createdAt, updated_at: ownerPublic.updatedAt, title_envelope: ownerEnvelope,
    title_hmac: ownerEnvelope.contentHmac,
    locator_hmac: cipher.digest({ domain: "project-chat", kind: "chat", locator: "chat:chat-01" }),
    source_content_hmac: cipher.digest({ domain: "project-chat", kind: "chat", locator: "chat:chat-01",
      publicData: ownerPublic, privateData: ownerPrivate }),
    result_owner_hmac: conversationResultOwnerHmac(cipher, { participantId: context.principalId,
      projectId: context.projectId, chatId: "chat-01", experience: ownerPrivate.experience }),
    payload_bytes: Buffer.byteLength(JSON.stringify(ownerEnvelope)),
    ...ownerChanges };
  const privateData = { user: "Question", assistant: "Exact answer.\n", evidence: evidence() };
  const publicData = { chatId: "chat-01", turnOrdinal: 0, occurredAt: instant(1),
    route: "general-chat", originRequestId: "request-01" };
  const turnEnvelope = cipher.encrypt({ recordType: "chat-turn", participantId: context.principalId,
    recordId: "turn:chat-01:0", field: "private-payload" }, privateData);
  const turn = { turn_ordinal: 0, occurred_at: publicData.occurredAt, route: publicData.route,
    origin_request_id: publicData.originRequestId, content_envelope: turnEnvelope,
    content_hmac: turnEnvelope.contentHmac,
    locator_hmac: cipher.digest({ domain: "project-chat", kind: "chat-turn", locator: "chat-turn:chat-01:0" }),
    source_content_hmac: cipher.digest({ domain: "project-chat", kind: "chat-turn",
      locator: "chat-turn:chat-01:0", publicData, privateData }), ...turnChanges };
  const preflight = preflightChanges ?? [{ record_id: 0, payload_bytes: Buffer.byteLength(JSON.stringify(turnEnvelope)) }];
  pool = new ScriptedPool([[owner], preflight, [turn]]);
  return { cipher, decryptQueries, owner, pool, turn, turnPrivate: privateData };
}

function legacyConversationFixture({ branch = false, retainedProjectId = context.projectId,
  hmacProjectId = retainedProjectId, route = "general-chat", renamedTitle = null,
  sourceContentHmac = null } = {}) {
  const decryptQueries = [];
  let pool;
  const cipher = cipherFixture(decryptQueries, () => pool?.dataQueries.length ?? 0);
  const chatId = branch ? "chat-legacy-branch" : "chat-legacy-root";
  const parentChatId = branch ? "chat-legacy-parent" : null;
  const branchFromTurn = branch ? 1 : null;
  const createdAt = instant(0);
  const ownerPrivate = { title: renamedTitle ?? "Legacy title" };
  const originalPrivate = { title: "Legacy title" };
  const ownerEnvelope = cipher.encrypt({ recordType: "chat", participantId: context.principalId,
    recordId: chatId, field: "private-payload" }, ownerPrivate);
  const creationPublic = { chatId, projectId: hmacProjectId, parentChatId, branchFromTurn,
    turnCount: branch ? branchFromTurn : 0, archived: false, unread: false,
    createdAt, updatedAt: createdAt };
  const owner = { chat_id: chatId, project_id: retainedProjectId, parent_chat_id: parentChatId,
    branch_from_turn: branchFromTurn, turn_count: 1, archived: false, unread: false,
    created_at: createdAt, updated_at: renamedTitle === null ? instant(2) : instant(3),
    title_envelope: ownerEnvelope, title_hmac: ownerEnvelope.contentHmac,
    locator_hmac: cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${chatId}` }),
    source_content_hmac: sourceContentHmac ?? cipher.digest({ domain: "project-chat", kind: "chat",
      locator: `chat:${chatId}`, publicData: creationPublic, privateData: originalPrivate }),
    result_owner_hmac: null, payload_bytes: Buffer.byteLength(JSON.stringify(ownerEnvelope)) };
  const turnPrivate = { user: "Legacy question", assistant: "Legacy answer.\n", evidence: evidence() };
  const turnPublic = { chatId, turnOrdinal: 0, occurredAt: instant(1), route,
    originRequestId: "legacy-request-01" };
  const turnEnvelope = cipher.encrypt({ recordType: "chat-turn", participantId: context.principalId,
    recordId: `turn:${chatId}:0`, field: "private-payload" }, turnPrivate);
  const turn = { turn_ordinal: 0, occurred_at: turnPublic.occurredAt, route,
    origin_request_id: turnPublic.originRequestId, content_envelope: turnEnvelope,
    content_hmac: turnEnvelope.contentHmac,
    locator_hmac: cipher.digest({ domain: "project-chat", kind: "chat-turn",
      locator: `chat-turn:${chatId}:0` }),
    source_content_hmac: cipher.digest({ domain: "project-chat", kind: "chat-turn",
      locator: `chat-turn:${chatId}:0`, publicData: turnPublic, privateData: turnPrivate }) };
  pool = new ScriptedPool([[owner], [{ record_id: 0,
    payload_bytes: Buffer.byteLength(JSON.stringify(turnEnvelope)) }], [turn]]);
  return { cipher, decryptQueries, owner, pool, readContext: { ...context, projectId: retainedProjectId }, turn };
}

class DirectConversationPool {
  constructor({ cipher, mode, projectId, experience }) {
    Object.assign(this, { cipher, mode, projectId, experience });
    this.queries = [];
    this.insertedChat = null;
    this.projectEnvelope = cipher.encrypt({ recordType: "project", participantId: context.principalId,
      recordId: projectId ?? "unused-personal", field: "private-payload" },
    { displayName: "Managed project", experience });
    this.sourceEnvelope = cipher.encrypt({ recordType: "chat", participantId: context.principalId,
      recordId: "source-chat", field: "private-payload" }, { title: "Source", experience });
  }
  async #query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/gu, " ").trim();
    this.queries.push({ sql: normalized, values });
    if (/^(?:BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory)/u.test(normalized)) return { rows: [] };
    if (normalized.includes("FROM runa_runtime.answer_requests")) return { rows: [] };
    if (normalized.includes("FROM runa_core.projects WHERE participant_id=$1 AND project_id=$2")) {
      return { rows: [{ participant_id: context.principalId, status: "managed",
        private_payload_envelope: this.projectEnvelope }] };
    }
    if (normalized.includes("SELECT DISTINCT turns.route")) return { rows: [] };
    if (normalized.includes("SELECT participant_id,project_id,turn_count,archived,deleted_at,title_envelope")
        && normalized.includes("FOR UPDATE")) return { rows: [] };
    if (normalized.startsWith("SELECT chat_id,project_id,parent_chat_id,branch_from_turn,turn_count")) {
      return { rows: [{ chat_id: "source-chat", project_id: this.projectId, parent_chat_id: null,
        branch_from_turn: null, turn_count: 0, archived: false, deleted_at: null,
        created_at: instant(0), updated_at: instant(0), title_envelope: this.sourceEnvelope }] };
    }
    if (normalized.startsWith("SELECT route FROM runa_core.chat_turns")) return { rows: [] };
    if (normalized.startsWith("SELECT parent_chat_id,branch_from_turn FROM runa_core.chats")) return { rows: [] };
    if (normalized.startsWith("SELECT turn_count,archived,deleted_at FROM runa_core.chats")) {
      return { rows: [{ turn_count: 0, archived: false, deleted_at: null }] };
    }
    if (normalized.startsWith("SELECT turn_ordinal,occurred_at,route,origin_request_id,content_envelope")) {
      return { rows: [] };
    }
    if (normalized.startsWith("INSERT INTO runa_core.chats")) {
      this.insertedChat = { sql: normalized, values: [...values] };
      return { rows: [], rowCount: 1 };
    }
    if (/^(?:INSERT|UPDATE)/u.test(normalized)) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected direct conversation query: ${normalized}`);
  }
  async query(sql, values = []) { return this.#query(sql, values); }
  async connect() {
    return { query: (sql, values = []) => this.#query(sql, values), release() {} };
  }
}

function directContinuityFixture({ mode, projectId, experience }) {
  const cipher = createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, 11), hmacKey: Buffer.alloc(32, 12),
    random: () => Buffer.alloc(12, 13) });
  const pool = new DirectConversationPool({ cipher, mode, projectId, experience });
  const store = new PostgresSelectedContinuityStore({ pool, cipher, now: () => new Date(instant(4)) });
  return { cipher, pool, store };
}

test("new and branched conversations seal managed and null personal owner scopes directly", async () => {
  const newChatHmacs = [];
  for (const projectId of ["alice-code", null]) {
    const fixture = directContinuityFixture({ mode: "new", projectId, experience: "chat" });
    await fixture.store.recordAnswer({ participant: { verified: true, principalId: context.principalId },
      project: { projectId: projectId ?? "runa:personal" }, thread: { threadId: "direct-chat" },
      requestId: `new-${projectId ?? "personal"}`, contextRevision: 0, experience: "chat",
      lane: "general", message: "Direct conversation" },
    { answer: "Direct answer.", ...evidence() });
    assert.match(fixture.pool.insertedChat.sql, /result_owner_hmac/u);
    const retained = fixture.pool.insertedChat.values.at(-1);
    assert.equal(retained, conversationResultOwnerHmac(fixture.cipher, { participantId: context.principalId,
      projectId, chatId: "direct-chat", experience: "chat" }));
    newChatHmacs.push(retained);
  }
  assert.notEqual(newChatHmacs[0], newChatHmacs[1], "null personal and managed scope are cryptographically distinct");

  const branchHmacs = [];
  for (const projectId of ["alice-code", null]) {
    const fixture = directContinuityFixture({ mode: "branch", projectId, experience: "code" });
    await fixture.store.manageConversation(context.principalId, { action: "branch", chatId: "source-chat",
      requestId: "direct-branch", experience: "code" });
    assert.match(fixture.pool.insertedChat.sql, /result_owner_hmac/u);
    const [branchId] = fixture.pool.insertedChat.values;
    const retained = fixture.pool.insertedChat.values.at(-1);
    assert.equal(retained, conversationResultOwnerHmac(fixture.cipher, { participantId: context.principalId,
      projectId, chatId: branchId, experience: "code" }));
    branchHmacs.push(retained);
  }
  assert.notEqual(branchHmacs[0], branchHmacs[1], "branched null personal and managed scope remain distinct");
});

function encodeTask(cipher, kind, id, value) {
  const payload = cipher.encrypt({ recordType: `m1-${kind}`, participantId: context.principalId,
    recordId: digest({ projectId: context.projectId, kind, id }), field: "private-payload" }, value);
  return { record_id: id, payload, payload_sha256: digest(payload),
    payload_bytes: Buffer.byteLength(JSON.stringify(payload)) };
}

function taskFixture({ proposalMutation = null, receiptMutation = null, sealedReceiptMutation = null,
  relationshipMutation = null, recordIds = {}, rowMutation = null } = {}) {
  const decryptQueries = [];
  let pool;
  const cipher = cipherFixture(decryptQueries, () => pool?.dataQueries.length ?? 0);
  const reference = { environmentId: "environment-01", revisionId: `r-${h("a")}`,
    workspaceSha256: h("1"), files: [{ path: "notes.js", sha256: sha("Retained text.\n"), bytes: 15 }] };
  const project = { schemaVersion: "runa-m1-project/v1", participantId: context.principalId,
    projectId: context.projectId, environmentId: reference.environmentId, revision: 1, reference,
    registrationDigest: h("2"), createdAt: instant(0), updatedAt: instant(4) };
  const task = { schemaVersion: "runa-m1-task/v1", taskId: "task-01", participantId: context.principalId,
    projectId: context.projectId, environmentId: reference.environmentId, createdSessionId: context.sessionId,
    requestId: "task-request", requestDigest: h("3"), objective: "Inspect the retained text.",
    workIntent: "analysis-only", status: "active", createdAt: instant(0), updatedAt: instant(4) };
  const args = { path: "notes.js" };
  const preview = { path: args.path, sha256: sha("Retained text.\n"), bytes: 15, content: "Retained text.\n" };
  const prepared = { bindingSha256: bindingDigest({ participantId: context.principalId,
    projectId: context.projectId, environmentId: reference.environmentId }), capabilityId: "project.inspect",
    arguments: args, preconditionSha256: reference.workspaceSha256, beforeSha256: reference.workspaceSha256,
    beforeReference: reference, preview };
  const proposal = { schemaVersion: "runa-m1-proposal/v1", proposalId: "proposal-01", taskId: task.taskId,
    grantId: "grant-01", grantRevision: 1, requestId: "proposal-request", capabilityId: "project.inspect",
    arguments: args, requestDigest: h("4"), participantId: context.principalId, projectId: context.projectId,
    sessionId: context.sessionId, environmentId: reference.environmentId, capabilitySetVersion: "m1-javascript/v1",
    capabilitySetDigest: h("5"), grantDefinitionDigest: h("6"), policy: "automatic",
    argumentsDigest: digest(args), resolvedArguments: args, restorePaths: [], expectedProjectRevision: 1,
    beforeReference: reference, prepared, createdAt: instant(1), expiresAt: instant(59), status: "completed",
    receiptId: "receipt-01", updatedAt: instant(3) };
  proposal.proposalDigest = proposalDigest(proposal);
  proposalMutation?.(proposal);
  const intent = { schemaVersion: "runa-m1-effect-intent/v1", effectId: "effect-01",
    proposalId: proposal.proposalId, taskId: task.taskId, participantId: context.principalId,
    projectId: context.projectId, proposalDigest: proposal.proposalDigest, status: "recorded",
    createdAt: instant(2), updatedAt: instant(3), receiptId: "receipt-01" };
  const receipt = { schemaVersion: "runa-m1-task-receipt/v1", receiptId: "receipt-01",
    effectId: intent.effectId, proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
    taskId: task.taskId, participantId: context.principalId, projectId: context.projectId,
    environmentId: reference.environmentId, sessionId: context.sessionId, grantId: "grant-01", grantRevision: 1,
    capabilitySetVersion: "m1-javascript/v1", capabilitySetDigest: h("5"), capabilityId: "project.inspect",
    argumentsDigest: proposal.argumentsDigest, policy: "automatic", approval: null,
    beforeRevision: 1, afterRevision: 1, beforeReference: reference, afterReference: reference,
    beforeSha256: reference.workspaceSha256, afterSha256: reference.workspaceSha256, effectKind: "observed",
    executionStatus: "observed", output: { type: "file", file: preview }, cancellationRequested: false,
    grantRevokedAfterDispatch: false, currentAtRecording: true, rollbackReference: null, recordedAt: instant(3) };
  receiptMutation?.(receipt);
  receipt.receiptDigest = receiptDigest(receipt);
  sealedReceiptMutation?.(receipt);
  if (relationshipMutation) {
    relationshipMutation({ proposal, intent, receipt });
    proposal.proposalDigest = proposalDigest(proposal);
    intent.proposalDigest = proposal.proposalDigest;
    receipt.proposalDigest = proposal.proposalDigest;
    receipt.receiptDigest = receiptDigest(receipt);
  }
  const encodedProject = encodeTask(cipher, "project", context.projectId, project);
  const encodedTask = encodeTask(cipher, "task", task.taskId, task);
  const encodedProposal = encodeTask(cipher, "proposal", recordIds.proposal ?? "proposal-01", proposal);
  const encodedReceipt = encodeTask(cipher, "receipt", recordIds.receipt ?? "receipt-01", receipt);
  const encodedIntent = encodeTask(cipher, "intent", recordIds.intent ?? "proposal-01", intent);
  const owner = { record_id: task.taskId, task_id: task.taskId, project_id: context.projectId,
    task_payload: encodedTask.payload,
    task_payload_sha256: encodedTask.payload_sha256, task_payload_bytes: encodedTask.payload_bytes,
    project_payload: encodedProject.payload, project_payload_sha256: encodedProject.payload_sha256,
    project_payload_bytes: encodedProject.payload_bytes };
  rowMutation?.({ owner, encodedProposal, encodedReceipt, encodedIntent });
  pool = new ScriptedPool([[owner],
    [{ record_id: encodedProposal.record_id, payload_bytes: encodedProposal.payload_bytes }],
    [{ record_id: encodedReceipt.record_id, payload_bytes: encodedReceipt.payload_bytes }],
    [{ record_id: encodedIntent.record_id, payload_bytes: encodedIntent.payload_bytes }],
    [encodedProposal], [encodedReceipt], [encodedIntent]]);
  return { cipher, decryptQueries, pool, proposal, receipt };
}

test("conversation result port point-reads, preflights before decrypting, verifies HMACs, and projects", async () => {
  const fixture = conversationFixture();
  const ports = createPostgresArtifactResultSourcePorts(fixture);
  assert.deepEqual(Object.keys(ports.conversationResults), ["readOwner"]);
  assert.deepEqual(Object.keys(ports.taskResults), ["readOwner"]);
  const { conversationResults } = ports;
  const source = await conversationResults.readOwner(context, { chatId: "chat-01" });
  assert.equal(source.turns[0].turnOrdinal, 1, "retained zero-based turns become the frozen positive ordinal");
  assert.equal(source.turns[0].assistant, "Exact answer.\n");
  assert.deepEqual(fixture.decryptQueries, [3, 3], "both decryptions happen only after bounded exact-key load");
  assert.equal(fixture.pool.dataQueries.length, 3);
  assert.deepEqual(fixture.pool.dataQueries[0].values, [context.principalId, context.projectId, "chat-01"]);
  assert.match(fixture.pool.dataQueries[0].sql, /result_owner_hmac/u);
  assert.equal(fixture.pool.dataQueries[1].values[2], RESULT_LIMITS.maximumConversationTurns + 1);
  assert.match(fixture.pool.dataQueries[2].sql, /turn_ordinal=ANY\(\$3::integer\[\]\)/u);
  assert.doesNotMatch(fixture.pool.dataQueries.map(query => query.sql).join("\n"), /readChat|listChats|filesystem|provider/iu);
  const result = listConversationResults(source).results[0];
  assert.equal(result.readiness, "ready");
  assert.equal(fixture.pool.released, 1);
});

test("conversation result port rejects capacity and encrypted-size excess before any decryption", async () => {
  for (const preflightChanges of [
    Array.from({ length: 33 }, (_, index) => ({ record_id: index, payload_bytes: 1 })),
    [{ record_id: 0, payload_bytes: RESULT_LIMITS.maximumSourceRecordBytes + 1 }],
  ]) {
    const fixture = conversationFixture({ ownerChanges: { turn_count: preflightChanges.length }, preflightChanges });
    fixture.pool.responses = fixture.pool.responses.slice(0, 2);
    await assert.rejects(createPostgresArtifactResultSourcePorts(fixture).conversationResults
      .readOwner(context, { chatId: "chat-01" }), error => ["result-owner-over-capacity",
        "result-source-too-large"].includes(error.code));
    assert.equal(fixture.decryptQueries.length, 0);
  }
  const aggregate = conversationFixture({ ownerChanges: { turn_count: 2 }, preflightChanges: [
    { record_id: 0, payload_bytes: RESULT_LIMITS.maximumSourceRecordBytes },
    { record_id: 1, payload_bytes: RESULT_LIMITS.maximumSourceRecordBytes },
  ] });
  aggregate.pool.responses = aggregate.pool.responses.slice(0, 2);
  await assert.rejects(createPostgresArtifactResultSourcePorts(aggregate).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-too-large" });
  assert.equal(aggregate.decryptQueries.length, 0);
});

test("conversation result port collapses absence and rejects retained HMAC/envelope tamper", async () => {
  const missing = conversationFixture(); missing.pool.responses[0] = [];
  await assert.rejects(createPostgresArtifactResultSourcePorts(missing).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-owner-not-found" });
  const tampered = conversationFixture({ turnChanges: { content_hmac: h("f") } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(tampered).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-invalid" });
  const envelope = conversationFixture();
  envelope.turn.content_envelope = { ...envelope.turn.content_envelope,
    tag: Buffer.alloc(16, 9).toString("base64") };
  await assert.rejects(createPostgresArtifactResultSourcePorts(envelope).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-invalid" });
  const wrongBinding = conversationFixture({ ownerChanges: { project_id: "other-project" } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(wrongBinding).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-invalid" });
  const reassigned = conversationFixture({ ownerChanges: { project_id: "reassigned-project" } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(reassigned).conversationResults
    .readOwner({ ...context, projectId: "reassigned-project" }, { chatId: "chat-01" }),
  { code: "result-source-invalid" });
  assert.deepEqual(reassigned.decryptQueries, [3],
    "the title envelope still decrypts, but its original project/experience owner binding rejects reassignment");
  const changedExperience = conversationFixture();
  const changedTitle = changedExperience.cipher.encrypt({ recordType: "chat", participantId: context.principalId,
    recordId: "chat-01", field: "private-payload" }, { title: "Result chat", experience: "code" });
  changedExperience.owner.title_envelope = changedTitle;
  changedExperience.owner.title_hmac = changedTitle.contentHmac;
  await assert.rejects(createPostgresArtifactResultSourcePorts(changedExperience).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-invalid" });
  assert.deepEqual(changedExperience.decryptQueries, [3],
    "a valid replacement envelope cannot change the cryptographically bound experience");
  const missingExperience = conversationFixture();
  const titleOnly = missingExperience.cipher.encrypt({ recordType: "chat", participantId: context.principalId,
    recordId: "chat-01", field: "private-payload" }, { title: "Result chat" });
  missingExperience.owner.title_envelope = titleOnly;
  missingExperience.owner.title_hmac = titleOnly.contentHmac;
  await assert.rejects(createPostgresArtifactResultSourcePorts(missingExperience).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-invalid" });
  const changedRoute = conversationFixture();
  changedRoute.turn.route = "code-chat";
  changedRoute.turn.source_content_hmac = changedRoute.cipher.digest({ domain: "project-chat", kind: "chat-turn",
    locator: "chat-turn:chat-01:0", publicData: { chatId: "chat-01", turnOrdinal: 0,
      occurredAt: changedRoute.turn.occurred_at, route: changedRoute.turn.route,
      originRequestId: changedRoute.turn.origin_request_id }, privateData: changedRoute.turnPrivate });
  await assert.rejects(createPostgresArtifactResultSourcePorts(changedRoute).conversationResults
    .readOwner(context, { chatId: "chat-01" }), { code: "result-source-invalid" });
});

test("actual title-only legacy root and branch rows use only retained legacy HMAC then route classification", async () => {
  for (const [branch, route, expectedExperience] of [[false, "general-chat", "chat"],
    [true, "workspace-chat", "code"]]) {
    const fixture = legacyConversationFixture({ branch, route });
    const source = await createPostgresArtifactResultSourcePorts(fixture).conversationResults
      .readOwner(fixture.readContext, { chatId: fixture.owner.chat_id });
    assert.equal(source.experience, expectedExperience);
    assert.deepEqual(Object.keys(fixture.cipher.decrypt({ recordType: "chat", participantId: context.principalId,
      recordId: fixture.owner.chat_id, field: "private-payload" }, fixture.owner.title_envelope)), ["title"]);
  }
});

test("legacy null owner history rejects project reassignment, rename, and unreproducible authority", async () => {
  const reassigned = legacyConversationFixture({ retainedProjectId: "reassigned-project",
    hmacProjectId: context.projectId });
  await assert.rejects(createPostgresArtifactResultSourcePorts(reassigned).conversationResults
    .readOwner(reassigned.readContext, { chatId: reassigned.owner.chat_id }), { code: "result-source-invalid" });
  const renamed = legacyConversationFixture({ renamedTitle: "Renamed legacy title" });
  await assert.rejects(createPostgresArtifactResultSourcePorts(renamed).conversationResults
    .readOwner(renamed.readContext, { chatId: renamed.owner.chat_id }), { code: "result-source-invalid" });
  const unreproducible = legacyConversationFixture({ sourceContentHmac: h("d") });
  await assert.rejects(createPostgresArtifactResultSourcePorts(unreproducible).conversationResults
    .readOwner(unreproducible.readContext, { chatId: unreproducible.owner.chat_id }),
  { code: "result-source-invalid" });
});

test("task result port performs seven bounded point statements, verifies records, and projects retained output", async () => {
  const fixture = taskFixture();
  const { taskResults } = createPostgresArtifactResultSourcePorts(fixture);
  const source = await taskResults.readOwner(context, { taskId: "task-01" });
  assert.equal(fixture.pool.dataQueries.length, 7);
  assert.deepEqual(fixture.pool.dataQueries[0].values, [context.principalId, context.projectId, "task-01"]);
  assert.ok(fixture.decryptQueries.every(value => value >= 5), "no task payload decrypts during the four preflight statements");
  assert.deepEqual(fixture.pool.dataQueries.slice(1, 4).map(query => query.values.at(-1)), [17, 25, 25]);
  assert.ok(fixture.pool.dataQueries.slice(4).every(query => /record_id=ANY\(\$5::text\[\]\)/u.test(query.sql)));
  assert.doesNotMatch(fixture.pool.dataQueries.map(query => query.sql).join("\n"), /status\(|\.list|filesystem|provider/iu);
  const list = listTaskResults(source);
  assert.deepEqual(list.results.map(result => result.kind), ["inspected-text", "task-receipt"]);
  const inspected = list.results[0];
  const read = readTaskResult(source, { resultId: inspected.resultId, contentSha256: inspected.contentSha256 });
  assert.equal(decodeCanonicalBase64(read.contentBase64, inspected).toString(), "Retained text.\n");
});

test("task result port fails closed for stored digest and application-digest tamper", async () => {
  const stored = taskFixture({ rowMutation: rows => { rows.encodedProposal.payload_sha256 = h("f"); } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(stored).taskResults
    .readOwner(context, { taskId: "task-01" }), { code: "result-source-invalid" });
  const application = taskFixture({ proposalMutation: proposal => { proposal.proposalDigest = h("e"); } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(application).taskResults
    .readOwner(context, { taskId: "task-01" }), { code: "result-source-invalid" });
  const receipt = taskFixture({ sealedReceiptMutation: value => { value.receiptDigest = h("d"); } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(receipt).taskResults
    .readOwner(context, { taskId: "task-01" }), { code: "result-source-invalid" });
  const wrongOwner = taskFixture({ rowMutation: rows => { rows.owner.record_id = "task-foreign"; } });
  await assert.rejects(createPostgresArtifactResultSourcePorts(wrongOwner).taskResults
    .readOwner(context, { taskId: "task-01" }), { code: "result-source-invalid" });
});

test("task result port binds resealed child row ids and the complete proposal-intent-receipt graph", async () => {
  for (const recordIds of [
    { proposal: "proposal-row-mismatch" },
    { intent: "intent-row-mismatch" },
    { receipt: "receipt-row-mismatch" },
  ]) {
    const fixture = taskFixture({ recordIds });
    await assert.rejects(createPostgresArtifactResultSourcePorts(fixture).taskResults
      .readOwner(context, { taskId: "task-01" }), { code: "result-source-invalid" });
  }
  for (const relationshipMutation of [
    ({ proposal }) => { proposal.receiptId = "receipt-relationship-mismatch"; },
    ({ intent }) => { intent.receiptId = "receipt-relationship-mismatch"; },
    ({ intent }) => { intent.effectId = "effect-relationship-mismatch"; },
  ]) {
    const fixture = taskFixture({ relationshipMutation });
    await assert.rejects(createPostgresArtifactResultSourcePorts(fixture).taskResults
      .readOwner(context, { taskId: "task-01" }), { code: "result-source-invalid" });
  }
});

test("task result port rejects every maximum-plus-one collection and declared owner excess before decryption", async () => {
  for (const [responseIndex, maximum, prefix] of [[1, 16, "proposal"], [2, 24, "receipt"], [3, 24, "proposal"]]) {
    const fixture = taskFixture();
    fixture.pool.responses[responseIndex] = Array.from({ length: maximum + 1 }, (_, index) => ({
      record_id: `${prefix}-${String(index).padStart(2, "0")}`, payload_bytes: 1,
    }));
    await assert.rejects(createPostgresArtifactResultSourcePorts(fixture).taskResults
      .readOwner(context, { taskId: "task-01" }), { code: "result-owner-over-capacity" });
    assert.equal(fixture.decryptQueries.length, 0);
  }
  const oversized = taskFixture();
  oversized.pool.responses[0][0].task_payload_bytes = RESULT_LIMITS.maximumSourceRecordBytes + 1;
  await assert.rejects(createPostgresArtifactResultSourcePorts(oversized).taskResults
    .readOwner(context, { taskId: "task-01" }), { code: "result-source-too-large" });
  assert.equal(oversized.decryptQueries.length, 0);
  const aggregate = taskFixture();
  for (const index of [1, 2, 3]) aggregate.pool.responses[index][0].payload_bytes = 350_000;
  await assert.rejects(createPostgresArtifactResultSourcePorts(aggregate).taskResults
    .readOwner(context, { taskId: "task-01" }), { code: "result-source-too-large" });
  assert.equal(aggregate.decryptQueries.length, 0);
});

test("result source ports reject non-exact scope and input before issuing SQL", async () => {
  const fixture = conversationFixture();
  const ports = createPostgresArtifactResultSourcePorts(fixture);
  await assert.rejects(ports.conversationResults.readOwner({ ...context, experience: "chat" }, { chatId: "chat-01" }),
    { code: "result-request-invalid" });
  await assert.rejects(ports.conversationResults.readOwner(context, { chatId: "chat-01", maximum: 1 }),
    { code: "result-request-invalid" });
  assert.equal(fixture.pool.queries.length, 0);
});
