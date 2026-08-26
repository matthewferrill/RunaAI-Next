import { createHash } from "node:crypto";
import { z } from "zod";

export const AGENT_PROFILES = Object.freeze([
  "read-only",
  "ask-every-time",
  "safe-autopilot",
  "full-project-autopilot",
  "custom",
]);

export const AGENT_CAPABILITIES = Object.freeze([
  "workspace.inspect",
  "workspace.preview-change",
  "workspace.apply-synthetic-change",
  "workspace.restore-synthetic-change",
  "workspace.verify-synthetic",
]);

const boundedId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const sha256String = z.string().regex(/^[a-f0-9]{64}$/);
const participant = z.object({ principalId: boundedId, verified: z.boolean() }).strict();
const project = z.object({ projectId: boundedId }).strict();
const session = z.object({ sessionId: boundedId }).strict();
const environment = z.object({
  environmentId: boundedId,
  environmentKind: z.literal("synthetic-memory"),
}).strict();
const capabilityId = z.enum(AGENT_CAPABILITIES);

const relativePath = z.string().trim().min(1).max(240)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine(value => !value.split("/").some(segment => segment === "" || segment === "." || segment === ".."),
    "Path segments must be explicit and contained.");
const boundedText = z.string().max(32 * 1024).refine(value => !value.includes("\u0000"), "NUL is not allowed.");

const fixedProfile = z.object({ id: z.enum(AGENT_PROFILES.filter(value => value !== "custom")) }).strict();
const customProfile = z.object({
  id: z.literal("custom"),
  allowedCapabilityIds: z.array(capabilityId).max(AGENT_CAPABILITIES.length).default([]),
  automaticCapabilityIds: z.array(capabilityId).max(AGENT_CAPABILITIES.length).default([]),
}).strict().superRefine((value, context) => {
  const allowed = new Set(value.allowedCapabilityIds);
  if (new Set(value.allowedCapabilityIds).size !== value.allowedCapabilityIds.length) {
    context.addIssue({ code: "custom", message: "Allowed capabilities must be unique." });
  }
  if (new Set(value.automaticCapabilityIds).size !== value.automaticCapabilityIds.length) {
    context.addIssue({ code: "custom", message: "Automatic capabilities must be unique." });
  }
  for (const item of value.automaticCapabilityIds) {
    if (!allowed.has(item)) context.addIssue({ code: "custom", message: "Automatic capabilities must also be allowed." });
  }
});

export const AgentProfileSchema = z.union([fixedProfile, customProfile]);

export const AgentTaskCreateRequestSchema = z.object({
  schemaVersion: z.literal("runa2-agent-task-create-request/v1"),
  requestId: boundedId,
  participant,
  project,
  session,
  environment,
  profile: AgentProfileSchema,
  objective: z.string().trim().min(1).max(4_000),
  origin: z.literal("user-request"),
}).strict();

export const AgentTaskSchema = z.object({
  schemaVersion: z.literal("runa2-agent-task/v1"),
  taskId: boundedId,
  requestId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  sessionId: boundedId,
  environment,
  profile: AgentProfileSchema,
  objectiveSha256: sha256String,
  status: z.enum(["active", "completed", "cancelled"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

const requestBase = {
  schemaVersion: z.literal("runa2-agent-capability-request/v1"),
  requestId: boundedId,
  participant,
  taskId: boundedId,
  origin: z.object({
    type: z.enum(["user-request", "model-output", "retrieved-content", "tool-output"]),
    reference: boundedId.nullable().default(null),
  }).strict(),
};

export const AgentCapabilityRequestSchema = z.discriminatedUnion("capabilityId", [
  z.object({ ...requestBase, capabilityId: z.literal("workspace.inspect"),
    arguments: z.object({ path: relativePath }).strict() }).strict(),
  z.object({ ...requestBase, capabilityId: z.literal("workspace.preview-change"),
    arguments: z.object({ path: relativePath, content: boundedText }).strict() }).strict(),
  z.object({ ...requestBase, capabilityId: z.literal("workspace.apply-synthetic-change"),
    arguments: z.object({ path: relativePath, content: boundedText }).strict() }).strict(),
  z.object({ ...requestBase, capabilityId: z.literal("workspace.restore-synthetic-change"),
    arguments: z.object({ forwardReceiptId: boundedId }).strict() }).strict(),
  z.object({ ...requestBase, capabilityId: z.literal("workspace.verify-synthetic"),
    arguments: z.object({ assertions: z.array(z.object({ path: relativePath,
      sha256: sha256String.nullable() }).strict()).min(1).max(32) }).strict() }).strict(),
]);

export const AgentApprovalRequestSchema = z.object({
  schemaVersion: z.literal("runa2-agent-approval-request/v1"),
  approvalId: boundedId,
  participant,
  proposalId: boundedId,
  proposalDigest: sha256String,
  decision: z.literal("allow"),
  remember: z.enum(["once", "session", "project"]),
}).strict();

export const AgentDeclineRequestSchema = z.object({
  schemaVersion: z.literal("runa2-agent-decline-request/v1"),
  decisionId: boundedId,
  participant,
  proposalId: boundedId,
  proposalDigest: sha256String,
  decision: z.literal("deny"),
  remember: z.enum(["once", "session", "project"]),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const AgentPreferenceRevokeRequestSchema = z.object({
  schemaVersion: z.literal("runa2-agent-preference-revoke-request/v1"),
  participant,
  taskId: boundedId,
  capabilityId,
  scope: z.enum(["session", "project"]),
  decision: z.enum(["allow", "deny"]),
}).strict();

export const AgentPreferenceSetRequestSchema = z.object({
  schemaVersion: z.literal("runa2-agent-preference-set-request/v1"),
  decisionId: boundedId,
  participant,
  taskId: boundedId,
  capabilityId,
  scope: z.enum(["session", "project"]),
  decision: z.enum(["allow", "deny"]),
}).strict();

export const AgentTaskLifecycleRequestSchema = z.object({
  schemaVersion: z.literal("runa2-agent-task-lifecycle-request/v1"),
  participant,
  taskId: boundedId,
  action: z.enum(["complete", "cancel"]),
}).strict();

export const AgentProposalSchema = z.object({
  schemaVersion: z.literal("runa2-agent-proposal/v1"),
  proposalId: boundedId,
  requestId: boundedId,
  taskId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  sessionId: boundedId,
  environmentId: boundedId,
  environmentKind: z.literal("synthetic-memory"),
  capabilityId,
  riskClass: z.enum(["observe", "draft", "reversible-local-change"]),
  argumentsSha256: sha256String,
  preconditionSha256: sha256String,
  preview: z.string().min(1).max(40_000),
  proposalDigest: sha256String,
  policy: z.object({
    result: z.enum(["deny", "approval-required", "automatic"]),
    basis: z.string().min(1).max(160),
  }).strict(),
  rollbackOfReceiptId: boundedId.nullable(),
  status: z.enum(["pending-approval", "authorized", "executed", "denied", "declined", "expired", "failed"]),
  terminalCode: z.string().max(160).nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();

const receiptOutput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace-inspect"), path: relativePath, sha256: sha256String,
    bytes: z.number().int().nonnegative().max(32 * 1024) }).strict(),
  z.object({ kind: z.literal("workspace-preview"), path: relativePath, beforeSha256: sha256String.nullable(),
    afterSha256: sha256String, changed: z.boolean() }).strict(),
  z.object({ kind: z.literal("workspace-change"), path: relativePath, beforeSha256: sha256String.nullable(),
    afterSha256: sha256String, revision: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal("workspace-restore"), path: relativePath, restoredSha256: sha256String.nullable(),
    revision: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal("workspace-verify"), checked: z.number().int().min(1).max(32),
    matched: z.boolean() }).strict(),
]);

export const AgentReceiptSchema = z.object({
  schemaVersion: z.literal("runa2-agent-execution-receipt/v1"),
  receiptId: boundedId,
  proposalId: boundedId,
  proposalDigest: sha256String,
  taskId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  sessionId: boundedId,
  environmentId: boundedId,
  environmentKind: z.literal("synthetic-memory"),
  capabilityId,
  riskClass: z.enum(["observe", "draft", "reversible-local-change"]),
  executor: z.literal("synthetic-memory/v1"),
  policyBasis: z.string().min(1).max(160),
  approvalBasis: z.enum(["profile", "remembered-session", "remembered-project", "manual-once", "manual-session", "manual-project"]),
  beforeSha256: sha256String,
  afterSha256: sha256String,
  output: receiptOutput,
  rollbackOfReceiptId: boundedId.nullable(),
  executedAt: z.string().datetime(),
  receiptSha256: sha256String,
  replayed: z.boolean(),
  auditCodes: z.array(z.string().min(1).max(100)).min(1).max(16),
}).strict();

export const parseAgentTaskCreateRequest = value => AgentTaskCreateRequestSchema.parse(value);
export const parseAgentTask = value => AgentTaskSchema.parse(value);
export const parseAgentCapabilityRequest = value => AgentCapabilityRequestSchema.parse(value);
export const parseAgentApprovalRequest = value => AgentApprovalRequestSchema.parse(value);
export const parseAgentDeclineRequest = value => AgentDeclineRequestSchema.parse(value);
export const parseAgentPreferenceRevokeRequest = value => AgentPreferenceRevokeRequestSchema.parse(value);
export const parseAgentPreferenceSetRequest = value => AgentPreferenceSetRequestSchema.parse(value);
export const parseAgentTaskLifecycleRequest = value => AgentTaskLifecycleRequestSchema.parse(value);
export const parseAgentProposal = value => AgentProposalSchema.parse(value);
export const parseAgentReceipt = value => AgentReceiptSchema.parse(value);

export const sha256 = value => createHash("sha256").update(String(value)).digest("hex");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export const canonicalJson = value => JSON.stringify(canonicalize(value));
export const canonicalDigest = value => sha256(canonicalJson(value));

export function canonicalProposal(proposal) {
  return {
    requestId: proposal.requestId,
    taskId: proposal.taskId,
    participantId: proposal.participantId,
    projectId: proposal.projectId,
    sessionId: proposal.sessionId,
    environmentId: proposal.environmentId,
    environmentKind: proposal.environmentKind,
    capabilityId: proposal.capabilityId,
    riskClass: proposal.riskClass,
    argumentsSha256: proposal.argumentsSha256,
    preconditionSha256: proposal.preconditionSha256,
    preview: proposal.preview,
    policy: proposal.policy,
    rollbackOfReceiptId: proposal.rollbackOfReceiptId,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
  };
}

export const agentProposalDigest = proposal => canonicalDigest(canonicalProposal(proposal));

export function canonicalReceipt(receipt) {
  const { receiptSha256: _digest, replayed: _replayed, ...canonical } = receipt;
  return canonical;
}

export const agentReceiptDigest = receipt => canonicalDigest(canonicalReceipt(receipt));
