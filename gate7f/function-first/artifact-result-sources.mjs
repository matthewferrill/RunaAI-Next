import { z } from "zod";
import { readAnswerEvidence } from "./conversation-evidence.mjs";
import {
  RESULT_LIMITS, assertPlainJsonTree, canonicalBoundedJson, requireSafeProjectPath, resultFailure,
} from "./artifact-result-contracts.mjs";

const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().nonnegative().safe();
const positive = z.number().int().positive().safe();
const timestamp = z.string().refine(value => {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === value;
});
const path = z.string().superRefine((value, context) => {
  try { requireSafeProjectPath(value); }
  catch { context.addIssue({ code: "custom", message: "Unsafe project path." }); }
});
const boundedJson = z.unknown().superRefine((value, context) => {
  try { canonicalBoundedJson(value); }
  catch { context.addIssue({ code: "custom", message: "Invalid bounded JSON." }); }
});
const evidence = z.unknown().nullable().superRefine((value, context) => {
  if (value !== null && readAnswerEvidence(value) === null) {
    context.addIssue({ code: "custom", message: "Invalid answer evidence." });
  }
});

const conversationTurn = z.object({ turnOrdinal: z.number().int().min(1).max(1_000_000), occurredAt: timestamp,
  route: z.enum(["general-chat", "guarded-chat", "research-chat", "review-chat", "workspace-chat", "code-chat"]),
  assistant: z.string(), evidence }).strict();

const conversationSourceSchema = z.object({ schemaVersion: z.literal("runaai-result-conversation-source/v1"),
  chatId: id, projectId: id, experience: z.enum(["chat", "code"]), updatedAt: timestamp,
  turnCount: count, turns: z.array(conversationTurn).max(RESULT_LIMITS.maximumConversationTurns) }).strict()
  .superRefine((value, context) => {
    if (value.turnCount !== value.turns.length) {
      context.addIssue({ code: "custom", path: ["turnCount"], message: "Turn count is incomplete." });
    }
    let prior = 0;
    for (const [index, turn] of value.turns.entries()) {
      const correctExperience = value.experience === "code"
        ? ["workspace-chat", "code-chat"].includes(turn.route)
        : !["workspace-chat", "code-chat"].includes(turn.route);
      const parsedEvidence = turn.evidence === null ? null : readAnswerEvidence(turn.evidence);
      const requiredEvidence = turn.route === "research-chat" ? parsedEvidence?.schemaVersion === "runaai-answer-evidence/v2"
          && parsedEvidence.researchWorkflow
        : turn.route === "review-chat" ? parsedEvidence?.schemaVersion === "runaai-answer-evidence/v2"
          && parsedEvidence.review : true;
      if (turn.turnOrdinal !== index + 1 || turn.turnOrdinal <= prior || !correctExperience || !requiredEvidence) {
        context.addIssue({ code: "custom", path: ["turns", index], message: "Turn order, experience or evidence is invalid." });
      }
      prior = turn.turnOrdinal;
    }
  });

const applyPreview = z.object({ kind: z.literal("apply"), path, beforeSha256: sha.nullable(), afterSha256: sha,
  beforeContent: z.string().nullable(), afterContent: z.string(), afterWorkspaceSha256: sha }).strict()
  .superRefine((value, context) => {
    if ((value.beforeContent === null) !== (value.beforeSha256 === null)) {
      context.addIssue({ code: "custom", message: "Apply before content/hash relationship is invalid." });
    }
  });
const inspectPreview = z.object({ kind: z.literal("inspect"), path, sha256: sha, bytes: count,
  content: z.string() }).strict();
const testPreview = z.object({ kind: z.literal("test"), suiteId: id, suiteSha256: sha,
  testIds: z.array(id).min(1).max(16) }).strict()
  .refine(value => new Set(value.testIds).size === value.testIds.length, { message: "Duplicate test id." });
const prepared = z.union([applyPreview, inspectPreview, testPreview]);

const proposal = z.object({ proposalId: id, taskId: id,
  status: z.enum(["denied", "pending-approval", "authorized", "dispatched", "not-published", "completed",
    "cancelled", "unknown", "stale", "failed"]), policy: z.enum(["denied", "approval-required", "automatic"]),
  capabilityId: id, proposalDigest: sha, expectedProjectRevision: positive, beforeWorkspaceSha256: sha,
  createdAt: timestamp, updatedAt: timestamp.nullable(), prepared: prepared.nullable() }).strict();
const intent = z.object({ proposalId: id,
  status: z.enum(["prepared", "dispatching", "recorded", "not-published", "unknown"]), effectId: id,
  updatedAt: timestamp }).strict();
const inspectOutcome = z.object({ path, sha256: sha, bytes: count, content: z.string() }).strict();
const testCheck = z.object({ testId: id, expected: boundedJson, actual: boundedJson,
  errorCode: z.literal("project-test-evaluation-failed").nullable(), passed: z.boolean() }).strict();
const testOutcome = z.object({ suiteId: id, suiteSha256: sha, workspaceSha256: sha,
  status: z.enum(["passed", "failed", "unavailable"]), passed: z.boolean(),
  checks: z.array(testCheck).max(16) }).strict().superRefine((value, context) => {
    const contradictoryCheck = value.checks.some(check => check.passed !== (check.errorCode === null
      && canonicalBoundedJson(check.actual) === canonicalBoundedJson(check.expected)));
    if (new Set(value.checks.map(check => check.testId)).size !== value.checks.length || contradictoryCheck
        || value.passed !== (value.status === "passed")
        || (value.status === "passed" && (!value.checks.length || value.checks.some(check => !check.passed)))) {
      context.addIssue({ code: "custom", message: "Test outcome status/check relationship is invalid." });
    }
  });
const receipt = z.object({ receiptId: id, taskId: id, proposalId: id, proposalDigest: sha, receiptDigest: sha,
  capabilityId: id, argumentsDigest: sha, beforeRevision: positive, afterRevision: positive,
  beforeSha256: sha, afterSha256: sha,
  effectKind: z.enum(["revision-published", "sandbox-tested", "observed"]), executionStatus: id,
  cancellationRequested: z.boolean(), grantRevokedAfterDispatch: z.boolean(), currentAtRecording: z.boolean(),
  recordedAt: timestamp, output: z.union([inspectOutcome, testOutcome]).nullable() }).strict();

const taskSourceSchema = z.object({ schemaVersion: z.literal("runaai-result-task-source/v1"),
  task: z.object({ taskId: id, status: z.enum(["active", "cancelled"]), updatedAt: timestamp }).strict(),
  project: z.object({ revision: positive, workspaceSha256: sha }).strict(),
  proposals: z.array(proposal).max(RESULT_LIMITS.maximumTaskProposals),
  receipts: z.array(receipt).max(RESULT_LIMITS.maximumTaskReceipts),
  intents: z.array(intent).max(RESULT_LIMITS.maximumTaskIntents) }).strict()
  .superRefine((value, context) => {
    const proposalIds = new Set(), receiptIds = new Set(), receiptProposalIds = new Set(), intentProposalIds = new Set();
    let priorProposalKey = "", priorReceiptKey = "", priorIntentId = "";
    for (const [index, item] of value.proposals.entries()) {
      const key = `${item.createdAt}\0${item.proposalId}`;
      if (item.taskId !== value.task.taskId || proposalIds.has(item.proposalId) || key <= priorProposalKey) {
        context.addIssue({ code: "custom", path: ["proposals", index], message: "Proposal scope/order is invalid." });
      }
      proposalIds.add(item.proposalId); priorProposalKey = key;
    }
    for (const [index, item] of value.intents.entries()) {
      if (!proposalIds.has(item.proposalId) || intentProposalIds.has(item.proposalId)
          || item.proposalId <= priorIntentId) {
        context.addIssue({ code: "custom", path: ["intents", index], message: "Intent binding is invalid." });
      }
      intentProposalIds.add(item.proposalId); priorIntentId = item.proposalId;
    }
    for (const [index, item] of value.receipts.entries()) {
      const key = `${item.recordedAt}\0${item.receiptId}`;
      const bound = value.proposals.find(candidate => candidate.proposalId === item.proposalId);
      if (item.taskId !== value.task.taskId || receiptIds.has(item.receiptId)
          || receiptProposalIds.has(item.proposalId) || key <= priorReceiptKey || !bound
          || bound.proposalDigest !== item.proposalDigest || bound.capabilityId !== item.capabilityId) {
        context.addIssue({ code: "custom", path: ["receipts", index], message: "Receipt binding/order is invalid." });
      }
      receiptIds.add(item.receiptId); receiptProposalIds.add(item.proposalId); priorReceiptKey = key;
    }
  });

function parseSource(schema, value) {
  assertPlainJsonTree(value);
  let parsed;
  try { parsed = schema.parse(value); }
  catch { throw resultFailure("result-source-invalid"); }
  const totalBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
  if (totalBytes > RESULT_LIMITS.maximumOwnerSourceBytes) throw resultFailure("result-source-too-large");
  const children = "turns" in parsed ? parsed.turns : [...parsed.proposals, ...parsed.receipts, ...parsed.intents];
  if (children.some(child => Buffer.byteLength(JSON.stringify(child), "utf8")
      > RESULT_LIMITS.maximumSourceRecordBytes)) throw resultFailure("result-source-too-large");
  return parsed;
}

export function parseConversationResultSource(value) { return parseSource(conversationSourceSchema, value); }
export function parseTaskResultSource(value) { return parseSource(taskSourceSchema, value); }

export { conversationSourceSchema, taskSourceSchema };
