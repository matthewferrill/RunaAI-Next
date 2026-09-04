import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  RESULT_LIMITS, assertPlainJsonTree, resultFailure,
} from "./artifact-result-contracts.mjs";
import {
  parseConversationResultSource, parseTaskResultSource,
} from "./artifact-result-sources.mjs";
import {
  digest as taskDigest, proposalDigest, receiptDigest,
} from "./tasks/contracts.mjs";
import { bindingDigest } from "./project/contracts.mjs";
import { conversationResultOwnerHmac } from "./artifact-result-owner-binding.mjs";

const publicId = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u);
const contextSchema = z.object({ principalId: publicId, projectId: publicId, sessionId: publicId }).strict();
const conversationInputSchema = z.object({ chatId: publicId }).strict();
const taskInputSchema = z.object({ taskId: publicId }).strict();
const RESULT_CODES = new Set([
  "result-request-invalid", "result-owner-not-found", "result-owner-over-capacity",
  "result-source-too-large", "result-source-invalid", "result-list-too-large", "result-too-large",
  "result-not-ready", "result-stale", "result-unavailable",
]);
const TASK_COLLECTIONS = Object.freeze([
  Object.freeze({ kind: "proposal", maximum: RESULT_LIMITS.maximumTaskProposals }),
  Object.freeze({ kind: "receipt", maximum: RESULT_LIMITS.maximumTaskReceipts }),
  Object.freeze({ kind: "intent", maximum: RESULT_LIMITS.maximumTaskIntents }),
]);
const TASK_SCHEMA = '"runa_m1"';

function parseRequest(schema, context, input) {
  try {
    assertPlainJsonTree(context);
    assertPlainJsonTree(input);
    return { context: contextSchema.parse(context), input: schema.parse(input) };
  } catch {
    throw resultFailure("result-request-invalid");
  }
}

function normalizedError(error) {
  return RESULT_CODES.has(error?.code) ? error : resultFailure("result-unavailable");
}

async function pointRead(pool, work) {
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    begun = true;
    const result = await work(client);
    await client.query("COMMIT");
    begun = false;
    return result;
  } catch (error) {
    if (begun) await client?.query("ROLLBACK").catch(() => {});
    throw normalizedError(error);
  } finally {
    client?.release();
  }
}

function exactDigest(left, right) {
  if (!/^[a-f0-9]{64}$/u.test(left ?? "") || !/^[a-f0-9]{64}$/u.test(right ?? "")) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function integer(value) {
  if (typeof value === "string" && !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw resultFailure("result-source-invalid");
  }
  const number = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) throw resultFailure("result-source-invalid");
  return number;
}

function taskRecordId(value) {
  const parsed = publicId.safeParse(value);
  if (!parsed.success) throw resultFailure("result-source-invalid");
  return parsed.data;
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw resultFailure("result-source-invalid");
  return date.toISOString();
}

function encryptedBytes(value) {
  const bytes = integer(value);
  if (bytes > RESULT_LIMITS.maximumSourceRecordBytes) throw resultFailure("result-source-too-large");
  return bytes;
}

function assertPreflight(rows, maximum, parseRecordId) {
  if (!Array.isArray(rows)) throw resultFailure("result-source-invalid");
  if (rows.length > maximum) throw resultFailure("result-owner-over-capacity");
  const ids = new Set();
  let bytes = 0;
  for (const row of rows) {
    if (!row || Object.getPrototypeOf(row) !== Object.prototype) throw resultFailure("result-source-invalid");
    const recordId = parseRecordId(row.record_id);
    if (ids.has(recordId)) throw resultFailure("result-source-invalid");
    ids.add(recordId);
    bytes += encryptedBytes(row.payload_bytes);
  }
  return { ids: [...ids], bytes };
}

function decrypt(cipher, context, envelope) {
  try { return cipher.decrypt(context, envelope); }
  catch { throw resultFailure("result-source-invalid"); }
}

function verifyEnvelopeColumn(envelope, retainedHmac) {
  if (!envelope || Object.getPrototypeOf(envelope) !== Object.prototype
      || !exactDigest(envelope.contentHmac, retainedHmac)) throw resultFailure("result-source-invalid");
}

function conversationContext(kind, participantId, recordId) {
  return { recordType: kind, participantId, recordId, field: "private-payload" };
}

function legacyConversationOwnerBindingValid(cipher, row, privateOwner) {
  const createdAt = timestamp(row.created_at), current = { chatId: row.chat_id, projectId: row.project_id,
    parentChatId: row.parent_chat_id, branchFromTurn: row.branch_from_turn, turnCount: integer(row.turn_count),
    archived: row.archived, unread: row.unread, createdAt, updatedAt: timestamp(row.updated_at) };
  const candidates = [current];
  const ordinaryRoot = row.parent_chat_id === null && row.branch_from_turn === null;
  const branch = typeof row.parent_chat_id === "string" && publicId.safeParse(row.parent_chat_id).success
    && row.branch_from_turn !== null;
  if (ordinaryRoot || branch) candidates.push({ ...current,
    turnCount: branch ? integer(row.branch_from_turn) : 0, archived: false, unread: false,
    updatedAt: createdAt });
  return candidates.some(publicData => exactDigest(row.source_content_hmac,
    cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${row.chat_id}`,
      publicData, privateData: privateOwner })));
}

function classifyExperience(explicit, rows) {
  if (["chat", "code"].includes(explicit)) return explicit;
  return rows.some(row => ["workspace-chat", "code-chat"].includes(row.route)) ? "code" : "chat";
}

function verifyConversationOwner(cipher, context, input, row) {
  if (!row || Object.getPrototypeOf(row) !== Object.prototype
      || row.chat_id !== input.chatId || row.project_id !== context.projectId) {
    throw resultFailure("result-source-invalid");
  }
  verifyEnvelopeColumn(row.title_envelope, row.title_hmac);
  const locator = cipher.digest({ domain: "project-chat", kind: "chat", locator: `chat:${row.chat_id}` });
  if (!exactDigest(row.locator_hmac, locator)) throw resultFailure("result-source-invalid");
  const privateOwner = decrypt(cipher, conversationContext("chat", context.principalId, row.chat_id), row.title_envelope);
  if (row.result_owner_hmac === null) {
    if (!legacyConversationOwnerBindingValid(cipher, row, privateOwner)) {
      throw resultFailure("result-source-invalid");
    }
  } else {
    let ownerBinding;
    try { ownerBinding = conversationResultOwnerHmac(cipher, { participantId: context.principalId,
      projectId: row.project_id, chatId: row.chat_id, experience: privateOwner?.experience }); }
    catch { throw resultFailure("result-source-invalid"); }
    if (!exactDigest(row.result_owner_hmac, ownerBinding)) throw resultFailure("result-source-invalid");
  }
  return privateOwner;
}

function verifyConversationTurn(cipher, context, owner, row) {
  if (!row || Object.getPrototypeOf(row) !== Object.prototype) throw resultFailure("result-source-invalid");
  const ordinal = integer(row.turn_ordinal);
  verifyEnvelopeColumn(row.content_envelope, row.content_hmac);
  const locator = cipher.digest({ domain: "project-chat", kind: "chat-turn",
    locator: `chat-turn:${owner.chat_id}:${ordinal}` });
  const privateData = decrypt(cipher, conversationContext("chat-turn", context.principalId,
    `turn:${owner.chat_id}:${ordinal}`), row.content_envelope);
  const publicData = { chatId: owner.chat_id, turnOrdinal: ordinal, occurredAt: timestamp(row.occurred_at),
    route: row.route, originRequestId: row.origin_request_id };
  const content = cipher.digest({ domain: "project-chat", kind: "chat-turn",
    locator: `chat-turn:${owner.chat_id}:${ordinal}`, publicData, privateData });
  if (!exactDigest(row.locator_hmac, locator) || !exactDigest(row.source_content_hmac, content)) {
    throw resultFailure("result-source-invalid");
  }
  if (!privateData || Object.getPrototypeOf(privateData) !== Object.prototype) {
    throw resultFailure("result-source-invalid");
  }
  return { turnOrdinal: ordinal + 1, occurredAt: publicData.occurredAt, route: row.route,
    assistant: privateData.assistant, evidence: privateData.evidence ?? null };
}

async function readConversationOwner(pool, cipher, rawContext, rawInput) {
  const { context, input } = parseRequest(conversationInputSchema, rawContext, rawInput);
  return pointRead(pool, async client => {
    const owner = (await client.query(`SELECT chat_id,project_id,parent_chat_id,branch_from_turn,turn_count,
      archived,unread,created_at,updated_at,title_envelope,title_hmac,locator_hmac,source_content_hmac,result_owner_hmac,
      octet_length(title_envelope::text) AS payload_bytes
      FROM runa_core.chats
      WHERE participant_id=$1 AND project_id=$2 AND chat_id=$3 AND NOT archived AND deleted_at IS NULL
      LIMIT 1`, [context.principalId, context.projectId, input.chatId])).rows[0];
    if (!owner) throw resultFailure("result-owner-not-found");
    const turnCount = integer(owner.turn_count);
    const preflightRows = (await client.query(`SELECT turn_ordinal AS record_id,
      octet_length(content_envelope::text) AS payload_bytes
      FROM runa_core.chat_turns WHERE participant_id=$1 AND chat_id=$2
      ORDER BY turn_ordinal LIMIT $3`, [context.principalId, input.chatId,
      RESULT_LIMITS.maximumConversationTurns + 1])).rows;
    const preflight = assertPreflight(preflightRows, RESULT_LIMITS.maximumConversationTurns, integer);
    if (turnCount !== preflight.ids.length
        || preflight.ids.some((ordinal, index) => integer(ordinal) !== index)) {
      throw resultFailure("result-source-invalid");
    }
    const ownerBytes = encryptedBytes(owner.payload_bytes);
    if (ownerBytes + preflight.bytes > RESULT_LIMITS.maximumOwnerSourceBytes) {
      throw resultFailure("result-source-too-large");
    }
    const loaded = preflight.ids.length === 0 ? [] : (await client.query(`SELECT turn_ordinal,occurred_at,route,
      origin_request_id,content_envelope,content_hmac,locator_hmac,source_content_hmac
      FROM runa_core.chat_turns
      WHERE participant_id=$1 AND chat_id=$2 AND turn_ordinal=ANY($3::integer[])
      ORDER BY turn_ordinal`, [context.principalId, input.chatId, preflight.ids])).rows;
    if (loaded.length !== preflight.ids.length
        || loaded.some((row, index) => integer(row.turn_ordinal) !== integer(preflight.ids[index]))) {
      throw resultFailure("result-source-invalid");
    }
    const privateOwner = verifyConversationOwner(cipher, context, input, owner);
    const turns = loaded.map(row => verifyConversationTurn(cipher, context, owner, row));
    return parseConversationResultSource({ schemaVersion: "runaai-result-conversation-source/v1",
      chatId: owner.chat_id, projectId: owner.project_id,
      experience: classifyExperience(privateOwner.experience, loaded), updatedAt: timestamp(owner.updated_at),
      turnCount, turns });
  });
}

function taskContext(context, kind, id) {
  return { recordType: `m1-${kind}`, participantId: context.principalId,
    recordId: taskDigest({ projectId: context.projectId, kind, id }), field: "private-payload" };
}

function decodeTaskRecord(cipher, context, kind, id, row, payloadKey = "payload", digestKey = "payload_sha256") {
  let observedDigest;
  try { observedDigest = taskDigest(row?.[payloadKey]); }
  catch { throw resultFailure("result-source-invalid"); }
  if (!row || Object.getPrototypeOf(row) !== Object.prototype
      || !exactDigest(row[digestKey], observedDigest)) throw resultFailure("result-source-invalid");
  return decrypt(cipher, taskContext(context, kind, id), row[payloadKey]);
}

function projectPreview(proposal) {
  const prepared = proposal.prepared;
  if (prepared === null || prepared === undefined) return null;
  if (!prepared || Object.getPrototypeOf(prepared) !== Object.prototype
      || prepared.capabilityId !== proposal.capabilityId
      || prepared.bindingSha256 !== bindingDigest({ participantId: proposal.participantId,
        projectId: proposal.projectId, environmentId: proposal.environmentId })
      || prepared.beforeSha256 !== proposal.beforeReference?.workspaceSha256
      || prepared.preconditionSha256 !== proposal.beforeReference?.workspaceSha256
      || taskDigest(prepared.arguments) !== proposal.argumentsDigest) {
    throw resultFailure("result-source-invalid");
  }
  const preview = prepared.preview;
  if (proposal.capabilityId === "project.apply-change") return { kind: "apply", path: preview?.path,
    beforeSha256: preview?.beforeSha256 ?? null, afterSha256: preview?.afterSha256,
    beforeContent: preview?.beforeContent ?? null, afterContent: preview?.afterContent,
    afterWorkspaceSha256: preview?.workspaceSha256 };
  if (proposal.capabilityId === "project.inspect") return { kind: "inspect", path: preview?.path,
    sha256: preview?.sha256, bytes: preview?.bytes, content: preview?.content };
  if (proposal.capabilityId === "project.run-tests") return { kind: "test", suiteId: preview?.suiteId,
    suiteSha256: preview?.suiteSha256, testIds: preview?.testIds };
  return null;
}

function publicProposal(context, task, project, proposal) {
  if (!proposal || Object.getPrototypeOf(proposal) !== Object.prototype
      || proposal.schemaVersion !== "runa-m1-proposal/v1" || proposal.taskId !== task.taskId
      || proposal.participantId !== context.principalId || proposal.projectId !== context.projectId
      || proposal.environmentId !== project.environmentId
      || !exactDigest(proposal.proposalDigest, proposalDigest(proposal))
      || taskDigest(proposal.arguments) !== proposal.argumentsDigest) {
    throw resultFailure("result-source-invalid");
  }
  return { proposalId: proposal.proposalId, taskId: proposal.taskId, status: proposal.status,
    policy: proposal.policy, capabilityId: proposal.capabilityId, proposalDigest: proposal.proposalDigest,
    expectedProjectRevision: proposal.expectedProjectRevision,
    beforeWorkspaceSha256: proposal.beforeReference?.workspaceSha256, createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt ?? null, prepared: projectPreview(proposal) };
}

function publicIntent(context, task, proposalById, intent) {
  const proposal = proposalById.get(intent?.proposalId);
  if (!proposal || !intent || Object.getPrototypeOf(intent) !== Object.prototype
      || intent.schemaVersion !== "runa-m1-effect-intent/v1" || intent.taskId !== task.taskId
      || intent.participantId !== context.principalId || intent.projectId !== context.projectId
      || intent.proposalDigest !== proposal.proposalDigest) throw resultFailure("result-source-invalid");
  return { proposalId: intent.proposalId, status: intent.status, effectId: intent.effectId,
    updatedAt: intent.updatedAt };
}

function publicTestOutcome(output) {
  if (!output || Object.getPrototypeOf(output) !== Object.prototype) return null;
  return { suiteId: output.suiteId, suiteSha256: output.suiteSha256,
    workspaceSha256: output.workspaceSha256, status: output.status, passed: output.passed,
    checks: Array.isArray(output.checks) ? output.checks.map(check => ({ testId: check.testId,
      expected: check.expected, actual: check.actual, errorCode: check.errorCode, passed: check.passed })) : output.checks };
}

function publicReceipt(context, task, project, proposalById, receipt) {
  const proposal = proposalById.get(receipt?.proposalId);
  if (!proposal || !receipt || Object.getPrototypeOf(receipt) !== Object.prototype
      || receipt.schemaVersion !== "runa-m1-task-receipt/v1" || receipt.taskId !== task.taskId
      || receipt.participantId !== context.principalId || receipt.projectId !== context.projectId
      || receipt.environmentId !== project.environmentId || receipt.proposalDigest !== proposal.proposalDigest
      || receipt.capabilityId !== proposal.capabilityId || receipt.argumentsDigest !== proposal.argumentsDigest
      || !exactDigest(receipt.receiptDigest, receiptDigest(receipt))
      || receipt.beforeReference?.workspaceSha256 !== receipt.beforeSha256
      || receipt.afterReference?.workspaceSha256 !== receipt.afterSha256) throw resultFailure("result-source-invalid");
  const expectedEffect = ["project.apply-change", "project.restore"].includes(receipt.capabilityId)
    ? "revision-published" : receipt.capabilityId === "project.run-tests" ? "sandbox-tested" : "observed";
  if (receipt.effectKind !== expectedEffect) throw resultFailure("result-source-invalid");
  let output = null;
  if (receipt.capabilityId === "project.inspect") {
    const file = receipt.output?.type === "file" ? receipt.output.file : null;
    output = file === null ? null : { path: file.path, sha256: file.sha256, bytes: file.bytes, content: file.content };
  } else if (receipt.capabilityId === "project.run-tests") output = publicTestOutcome(receipt.output);
  return { receiptId: receipt.receiptId, taskId: receipt.taskId, proposalId: receipt.proposalId,
    proposalDigest: receipt.proposalDigest, receiptDigest: receipt.receiptDigest,
    capabilityId: receipt.capabilityId, argumentsDigest: receipt.argumentsDigest,
    beforeRevision: receipt.beforeRevision, afterRevision: receipt.afterRevision,
    beforeSha256: receipt.beforeSha256, afterSha256: receipt.afterSha256, effectKind: receipt.effectKind,
    executionStatus: receipt.executionStatus, cancellationRequested: receipt.cancellationRequested,
    grantRevokedAfterDispatch: receipt.grantRevokedAfterDispatch, currentAtRecording: receipt.currentAtRecording,
    recordedAt: receipt.recordedAt, output };
}

async function taskPreflight(client, context, taskId, kind, maximum) {
  const rows = (await client.query(`SELECT record_id,octet_length(payload::text) AS payload_bytes
    FROM ${TASK_SCHEMA}.records
    WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND task_id=$4
    ORDER BY record_id LIMIT $5`, [context.principalId, context.projectId, kind, taskId, maximum + 1])).rows;
  return assertPreflight(rows, maximum, taskRecordId);
}

async function loadTaskChildren(client, cipher, context, taskId, kind, ids) {
  const rows = (await client.query(`SELECT record_id,payload,payload_sha256 FROM ${TASK_SCHEMA}.records
    WHERE participant_id=$1 AND project_id=$2 AND kind=$3 AND task_id=$4
      AND record_id=ANY($5::text[]) ORDER BY record_id`,
  [context.principalId, context.projectId, kind, taskId, ids])).rows;
  if (rows.length !== ids.length || rows.some((row, index) => row.record_id !== ids[index])) {
    throw resultFailure("result-source-invalid");
  }
  return rows.map(row => Object.freeze({ recordId: row.record_id,
    value: decodeTaskRecord(cipher, context, kind, row.record_id, row) }));
}

function validateTaskChildRecordIds(proposalRecords, receiptRecords, intentRecords) {
  const proposals = proposalRecords.map(record => {
    if (record.value?.proposalId !== record.recordId) throw resultFailure("result-source-invalid");
    return record.value;
  });
  const receipts = receiptRecords.map(record => {
    if (record.value?.receiptId !== record.recordId) throw resultFailure("result-source-invalid");
    return record.value;
  });
  const intents = intentRecords.map(record => {
    if (record.value?.proposalId !== record.recordId) throw resultFailure("result-source-invalid");
    return record.value;
  });
  return [proposals, receipts, intents];
}

function validateTaskReceiptGraph(proposals, receipts, intents) {
  const proposalById = new Map(proposals.map(proposal => [proposal.proposalId, proposal]));
  const receiptById = new Map(receipts.map(receipt => [receipt.receiptId, receipt]));
  const intentByProposalId = new Map(intents.map(intent => [intent.proposalId, intent]));
  if (proposalById.size !== proposals.length || receiptById.size !== receipts.length
      || intentByProposalId.size !== intents.length) throw resultFailure("result-source-invalid");
  for (const receipt of receipts) {
    const proposal = proposalById.get(receipt.proposalId), intent = intentByProposalId.get(receipt.proposalId);
    if (!proposal || !intent || proposal.receiptId !== receipt.receiptId
        || intent.receiptId !== receipt.receiptId || intent.effectId !== receipt.effectId) {
      throw resultFailure("result-source-invalid");
    }
  }
  for (const proposal of proposals) {
    if (proposal.receiptId !== undefined && proposal.receiptId !== null
        && receiptById.get(proposal.receiptId)?.proposalId !== proposal.proposalId) {
      throw resultFailure("result-source-invalid");
    }
  }
  for (const intent of intents) {
    if (intent.receiptId !== undefined && intent.receiptId !== null
        && receiptById.get(intent.receiptId)?.proposalId !== intent.proposalId) {
      throw resultFailure("result-source-invalid");
    }
  }
  return proposalById;
}

async function readTaskOwner(pool, cipher, rawContext, rawInput) {
  const parsed = parseRequest(taskInputSchema, rawContext, rawInput);
  const { context, input } = parsed;
  return pointRead(pool, async client => {
    const row = (await client.query(`SELECT task.record_id,task.task_id,project.project_id,
      task.payload AS task_payload,
      task.payload_sha256 AS task_payload_sha256,octet_length(task.payload::text) AS task_payload_bytes,
      project.payload AS project_payload,project.payload_sha256 AS project_payload_sha256,
      octet_length(project.payload::text) AS project_payload_bytes
      FROM ${TASK_SCHEMA}.records AS task JOIN ${TASK_SCHEMA}.projects AS project
        ON project.participant_id=task.participant_id AND project.project_id=task.project_id
      WHERE task.participant_id=$1 AND task.project_id=$2 AND task.kind='task'
        AND task.record_id=$3 AND task.task_id=$3 LIMIT 1`,
    [context.principalId, context.projectId, input.taskId])).rows[0];
    if (!row) throw resultFailure("result-owner-not-found");
    if (Object.getPrototypeOf(row) !== Object.prototype || row.record_id !== input.taskId
        || row.task_id !== input.taskId || row.project_id !== context.projectId) {
      throw resultFailure("result-source-invalid");
    }
    const preflights = [];
    for (const collection of TASK_COLLECTIONS) preflights.push(await taskPreflight(client, context,
      input.taskId, collection.kind, collection.maximum));
    const declaredBytes = encryptedBytes(row.task_payload_bytes) + encryptedBytes(row.project_payload_bytes)
      + preflights.reduce((sum, value) => sum + value.bytes, 0);
    if (declaredBytes > RESULT_LIMITS.maximumOwnerSourceBytes) throw resultFailure("result-source-too-large");

    const decoded = [];
    for (const [index, collection] of TASK_COLLECTIONS.entries()) decoded.push(await loadTaskChildren(client,
      cipher, context, input.taskId, collection.kind, preflights[index].ids));
    const task = decodeTaskRecord(cipher, context, "task", input.taskId, row, "task_payload", "task_payload_sha256");
    const project = decodeTaskRecord(cipher, context, "project", context.projectId, row,
      "project_payload", "project_payload_sha256");
    if (!task || Object.getPrototypeOf(task) !== Object.prototype || task.schemaVersion !== "runa-m1-task/v1"
        || task.taskId !== input.taskId || task.participantId !== context.principalId
        || task.projectId !== context.projectId || !project || Object.getPrototypeOf(project) !== Object.prototype
        || project.schemaVersion !== "runa-m1-project/v1" || project.participantId !== context.principalId
        || project.projectId !== context.projectId || task.environmentId !== project.environmentId) {
      throw resultFailure("result-source-invalid");
    }
    const [retainedProposals, retainedReceipts, retainedIntents] = validateTaskChildRecordIds(...decoded);
    const proposalById = validateTaskReceiptGraph(retainedProposals, retainedReceipts, retainedIntents);
    const proposals = retainedProposals.map(proposal => publicProposal(context, task, project, proposal))
      .sort((left, right) => left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1
        : left.proposalId < right.proposalId ? -1 : left.proposalId > right.proposalId ? 1 : 0);
    const receipts = retainedReceipts.map(receipt => publicReceipt(context, task, project, proposalById, receipt))
      .sort((left, right) => left.recordedAt < right.recordedAt ? -1 : left.recordedAt > right.recordedAt ? 1
        : left.receiptId < right.receiptId ? -1 : left.receiptId > right.receiptId ? 1 : 0);
    const intents = retainedIntents.map(intent => publicIntent(context, task, proposalById, intent))
      .sort((left, right) => left.proposalId < right.proposalId ? -1 : left.proposalId > right.proposalId ? 1 : 0);
    return parseTaskResultSource({ schemaVersion: "runaai-result-task-source/v1",
      task: { taskId: task.taskId, status: task.status, updatedAt: task.updatedAt },
      project: { revision: project.revision, workspaceSha256: project.reference?.workspaceSha256 },
      proposals, receipts, intents });
  });
}

export function createPostgresArtifactResultSourcePorts({ pool, cipher }) {
  if (!pool || typeof pool.connect !== "function" || !cipher || typeof cipher.decrypt !== "function"
      || typeof cipher.digest !== "function") throw resultFailure("result-unavailable");
  return Object.freeze({
    conversationResults: Object.freeze({ readOwner: (context, input) => readConversationOwner(pool, cipher, context, input) }),
    taskResults: Object.freeze({ readOwner: (context, input) => readTaskOwner(pool, cipher, context, input) }),
  });
}
