import { z } from "zod";

const boundedId = z.string().trim().min(1).max(160);
const historyTurn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8_000),
}).strict();
const sourceLocator = z.object({
  sourceId: boundedId,
  sectionId: boundedId,
}).strict();

export const Gate2AnswerRequestSchema = z.object({
  schemaVersion: z.literal("runa2-answer-request/v2"),
  requestId: boundedId,
  lane: z.enum(["general", "research", "guarded", "workspace", "code"]),
  experience: z.enum(["chat", "code"]).default("chat"),
  participant: z.object({ principalId: boundedId, verified: z.boolean() }).strict(),
  project: z.object({ projectId: boundedId }).strict(),
  thread: z.object({ threadId: boundedId }).strict(),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(historyTurn).max(24),
  workspace: z.nullable(z.object({ sources: z.array(sourceLocator).min(1).max(6) }).strict()).default(null),
  budgets: z.object({
    deadlineMs: z.number().int().min(100).max(120_000),
    maximumPasses: z.number().int().min(1).max(12),
    maximumPassages: z.number().int().min(1).max(24),
    maximumEvidenceCharacters: z.number().int().min(128).max(48_000),
  }).strict(),
}).strict().superRefine((request, context) => {
  if (request.lane === "workspace" && !request.workspace) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["workspace"],
      message: "The workspace lane requires one through six explicit source ranges." });
  }
  if (request.lane !== "workspace" && request.workspace) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["workspace"],
      message: "Explicit workspace sources belong only to the workspace lane." });
  }
});

const citation = z.object({
  sourceId: boundedId,
  sectionId: boundedId,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  ordinal: z.number().int().positive(),
}).strict();
const approvedKnowledgeReference = z.object({
  approvalRefHmac: z.string().regex(/^[a-f0-9]{64}$/),
  eventRefHmac: z.string().regex(/^[a-f0-9]{64}$/),
  eventIntegrityHmac: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const scopeFiltering = z.object({
  consideredCount: z.number().int().nonnegative(), eligibleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  excludedByReason: z.record(z.string(), z.number().int().nonnegative()),
}).strict();

export const Gate2AnswerResponseSchema = z.object({
  schemaVersion: z.literal("runa2-answer-response/v2"),
  requestId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  threadId: boundedId,
  lane: z.enum(["general", "research", "guarded", "workspace", "code"]),
  answer: z.string(),
  ground: z.enum(["record-answers", "record-silent", "not-a-question-of-fact", "no-ground-needed"]),
  retrieval: z.object({
    attempted: z.boolean(), skipped: z.boolean(), skipReason: z.string(), empty: z.boolean(),
    degraded: z.boolean(), evidenceCount: z.number().int().nonnegative(),
    unavailable: z.array(z.string()), omissions: z.array(z.string()),
  }).strict(),
  research: z.nullable(z.object({
    passesPlanned: z.number().int().nonnegative(), passesRun: z.number().int().nonnegative(),
    passesWithNothing: z.number().int().nonnegative(), passagesRead: z.number().int().nonnegative(),
    unanswered: z.array(z.string()), truncated: z.boolean(),
  }).strict()),
  workspace: z.nullable(z.object({
    explicitSources: z.number().int().nonnegative(), resolvedSources: z.number().int().nonnegative(),
    extraReads: z.literal(0), citationStatus: z.enum(["not-applicable", "recognized", "missing", "contains-unknown"]),
  }).strict()),
  citations: z.array(citation),
  model: z.object({ role: z.string(), provider: z.string(), modelId: z.string() }).strict(),
  completion: z.object({ reason: z.string(), timedOut: z.boolean(), outputLimited: z.boolean() }).strict(),
  trace: z.object({ correlationId: z.string().min(16).max(128) }).strict(),
  effects: z.tuple([]),
  auditCodes: z.array(z.string()),
  gates: z.object({ executed: z.boolean(), codes: z.array(z.string()) }).strict(),
  status: z.object({
    lane: z.string(), modelRole: z.string(), provider: z.string(), retrieval: z.string(),
    reranker: z.string(), chatAdapter: z.string(), projectAdapter: z.string(), settingsAdapter: z.string(),
    protectedStoresOpened: z.literal(false), rollbackAvailable: z.boolean(),
  }).strict(),
  continuity: z.object({
    durableChatEligible: z.boolean(), turnRecorded: z.boolean(), source: z.string(),
  }).strict(),
  approvedKnowledge: z.object({
    schemaVersion: z.literal("runa2-approved-knowledge-delivery-receipt/v1"),
    availableLibraryCount: z.number().int().nonnegative(), selectedCount: z.number().int().nonnegative(),
    delivered: z.boolean(), reason: z.string(), scopeFiltering,
    references: z.array(approvedKnowledgeReference).max(6), degraded: z.boolean(),
    errorCode: z.string().nullable(), deliveryProvesCompliance: z.literal(false),
  }).strict(),
}).strict();

export const parseGate2AnswerRequest = value => Gate2AnswerRequestSchema.parse(value);
export const parseGate2AnswerResponse = value => Gate2AnswerResponseSchema.parse(value);

export const GATE2_MODEL_ROLES = Object.freeze({
  general: "chat",
  guarded: "chat",
  research: "research",
  workspace: "code",
  code: "code",
});

export const GATE2_LANE_CAPABILITIES = Object.freeze({
  general: Object.freeze(["chat"]),
  guarded: Object.freeze(["chat", "guarded-read-only"]),
  research: Object.freeze(["research"]),
  workspace: Object.freeze(["code", "workspace-read"]),
  code: Object.freeze(["code"]),
});
