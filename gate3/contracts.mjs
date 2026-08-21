import { createHash } from "node:crypto";
import { z } from "zod";

const boundedId = z.string().trim().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/);
const originReference = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const participant = z.object({ principalId: boundedId, verified: z.boolean() }).strict();
const project = z.object({ projectId: boundedId }).strict();
const action = z.object({
  kind: z.literal("participant-setting.set-default-intelligence-level"),
  settingKey: z.literal("defaultIntelligenceLevel"),
  value: z.enum(["Low", "Medium", "High"]),
}).strict();

export const Gate3ProposalRequestSchema = z.object({
  schemaVersion: z.literal("runa2-action-proposal-request/v1"),
  requestId: boundedId,
  participant,
  project,
  origin: z.object({
    type: z.enum(["steward-request", "model-output", "retrieved-content"]),
    reference: originReference.nullable().default(null),
  }).strict(),
  action,
  rollbackOfReceiptId: boundedId.nullable().default(null),
}).strict();

export const Gate3ApprovalRequestSchema = z.object({
  schemaVersion: z.literal("runa2-action-approval-request/v1"),
  approvalId: boundedId,
  participant,
  proposalId: boundedId,
  proposalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  approvalPhrase: z.literal("approve"),
}).strict();

export const Gate3DeclineRequestSchema = z.object({
  schemaVersion: z.literal("runa2-action-decline-request/v1"),
  participant,
  proposalId: boundedId,
  proposalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const Gate3ProposalSchema = z.object({
  schemaVersion: z.literal("runa2-action-proposal/v1"),
  proposalId: boundedId,
  requestId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  origin: z.object({ type: z.enum(["steward-request", "model-output"]), reference: z.string().nullable() }).strict(),
  action,
  beforeValue: z.enum(["Low", "Medium", "High"]),
  beforeVersion: z.string().min(1).max(100),
  beforeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  preview: z.string().min(1).max(2_000),
  proposalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  rollbackOfReceiptId: boundedId.nullable(),
  status: z.enum(["pending", "executed", "declined", "expired", "failed"]),
  terminalReason: z.string().max(500).nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();

export const Gate3ReceiptSchema = z.object({
  schemaVersion: z.literal("runa2-action-receipt/v1"),
  receiptId: boundedId,
  proposalId: boundedId,
  proposalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  participantId: boundedId,
  projectId: boundedId,
  action,
  beforeValue: z.enum(["Low", "Medium", "High"]),
  afterValue: z.enum(["Low", "Medium", "High"]),
  beforeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  afterSha256: z.string().regex(/^[a-f0-9]{64}$/),
  capabilityId: boundedId,
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
  rollbackOfReceiptId: boundedId.nullable(),
  executedAt: z.string().datetime(),
  replayed: z.boolean(),
  auditCodes: z.array(z.string()),
}).strict();

export const parseGate3ProposalRequest = value => Gate3ProposalRequestSchema.parse(value);
export const parseGate3ApprovalRequest = value => Gate3ApprovalRequestSchema.parse(value);
export const parseGate3DeclineRequest = value => Gate3DeclineRequestSchema.parse(value);
export const parseGate3Proposal = value => Gate3ProposalSchema.parse(value);
export const parseGate3Receipt = value => Gate3ReceiptSchema.parse(value);

export const sha256 = value => createHash("sha256").update(String(value)).digest("hex");

export function canonicalProposalFields({ requestId, participantId, projectId, origin, action,
  beforeValue, beforeVersion, beforeSha256, rollbackOfReceiptId }) {
  return { requestId, participantId, projectId, origin, action, beforeValue, beforeVersion, beforeSha256,
    rollbackOfReceiptId: rollbackOfReceiptId ?? null };
}

export const proposalDigest = fields => sha256(JSON.stringify(canonicalProposalFields(fields)));
export function canonicalReceiptFields(receipt) {
  return {
    receiptId: receipt.receiptId, proposalId: receipt.proposalId,
    proposalDigest: receipt.proposalDigest, participantId: receipt.participantId,
    projectId: receipt.projectId, action: receipt.action, beforeValue: receipt.beforeValue,
    afterValue: receipt.afterValue, beforeSha256: receipt.beforeSha256,
    afterSha256: receipt.afterSha256, capabilityId: receipt.capabilityId,
    idempotencyKey: receipt.idempotencyKey, rollbackOfReceiptId: receipt.rollbackOfReceiptId,
    executedAt: receipt.executedAt, auditCodes: receipt.auditCodes,
  };
}
export const receiptDigest = receipt => sha256(JSON.stringify(canonicalReceiptFields(receipt)));
export const valueDigest = ({ participantId, projectId, settingKey, value, stateVersion }) =>
  sha256(JSON.stringify({ participantId, projectId, settingKey, value, stateVersion }));
export const actionIdempotencyKey = proposal => sha256(`gate3\u0000${proposal.proposalId}\u0000${proposal.proposalDigest}`);

export function renderPreview({ projectId, beforeValue, afterValue, rollbackOfReceiptId = null }) {
  const rollback = rollbackOfReceiptId ? `\nRollback of receipt: ${rollbackOfReceiptId}` : "";
  return `Project context: ${projectId}\nSetting: Default intelligence level\nCurrent: ${beforeValue}\nProposed: ${afterValue}${rollback}\nNothing has happened yet.`;
}
