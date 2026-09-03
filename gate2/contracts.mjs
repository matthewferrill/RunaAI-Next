import { z } from "zod";
import { AnswerExecutionStampSchema } from "../gate7e/contracts.mjs";

const boundedId = z.string().trim().min(1).max(160);
const historyTurn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8_000),
}).strict();
const sourceLocator = z.object({
  sourceId: boundedId,
  sectionId: boundedId,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
const researchPlan = z.object({
  steps: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
}).strict();

export const Gate2AnswerRequestSchema = z.object({
  schemaVersion: z.literal("runa2-answer-request/v2"),
  requestId: boundedId,
  lane: z.enum(["general", "research", "guarded", "workspace", "code", "review"]),
  experience: z.enum(["chat", "code"]).default("chat"),
  participant: z.object({ principalId: boundedId, verified: z.boolean() }).strict(),
  project: z.object({ projectId: boundedId }).strict(),
  thread: z.object({ threadId: boundedId }).strict(),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(historyTurn).max(24),
  contextRevision: z.number().int().nonnegative().optional(),
  workspace: z.nullable(z.object({ sources: z.array(sourceLocator).min(1).max(6) }).strict()).default(null),
  researchPlan: researchPlan.nullable().default(null),
  budgets: z.object({
    deadlineMs: z.number().int().min(100).max(120_000),
    maximumPasses: z.number().int().min(1).max(12),
    maximumPassages: z.number().int().min(1).max(24),
    maximumEvidenceCharacters: z.number().int().min(128).max(48_000),
  }).strict(),
}).strict().superRefine((request, context) => {
  if (["workspace", "review"].includes(request.lane) && !request.workspace) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["workspace"],
      message: "The workspace and review lanes require one through six explicit source ranges." });
  }
  if (!["workspace", "research", "review"].includes(request.lane) && request.workspace) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["workspace"],
      message: "Explicit sources belong only to workspace, research, or review." });
  }
  if (request.lane !== "research" && request.researchPlan) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["researchPlan"],
      message: "A research plan belongs only to the research lane." });
  }
  if (request.lane === "research" && request.workspace) {
    if (!request.researchPlan) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["researchPlan"],
        message: "Supplied-source Research requires one through eight submitted plan steps." });
    }
    request.workspace.sources.forEach((source, index) => {
      if (!source.contentSha256) context.addIssue({ code: z.ZodIssueCode.custom,
        path: ["workspace", "sources", index, "contentSha256"],
        message: "Supplied-source Research requires the exact selected source revision." });
    });
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
const reviewContext = z.object({
  contextType: z.enum(["source", "artifact", "diff"]),
  targetId: boundedId,
  sourceId: boundedId,
  sectionId: boundedId,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  label: z.string().trim().min(1).max(120).nullable(),
}).strict();
const reviewResult = z.object({
  status: z.enum(["accepted-primary", "accepted-revision", "incomplete"]),
  contexts: z.array(reviewContext).max(6),
  checker: z.object({
    initialVerdict: z.enum(["accept", "revise"]),
    finalVerdict: z.literal("accept"),
    revisionPasses: z.number().int().min(0).max(1),
    attemptCount: z.number().int().min(1).max(2),
    finalAnswerOrigin: z.enum(["primary", "checker-correction"]),
  }).strict().nullable(),
  findings: z.array(z.object({
    findingId: boundedId,
    text: z.string().min(1).max(16_000),
    severity: z.literal("unclassified"),
    citationOrdinals: z.array(z.number().int().positive()).max(24),
  }).strict()).max(1),
}).strict();
const researchWorkflow = z.object({
  sourceEnvelope: z.literal("supplied-source-only"),
  limitation: z.string().min(1).max(400),
  plan: z.object({ steps: z.array(z.object({ stepId: boundedId, text: z.string().min(1).max(240),
    status: z.literal("submitted") }).strict()).min(1).max(8) }).strict(),
  progress: z.object({ status: z.enum(["report-ready", "incomplete"]),
    selectedSources: z.number().int().min(1).max(6), resolvedSources: z.number().int().nonnegative().max(6),
    passesPlanned: z.number().int().nonnegative(), passesRun: z.number().int().nonnegative(),
    passagesRead: z.number().int().nonnegative(), degraded: z.boolean(), truncated: z.boolean(),
    omissionCount: z.number().int().nonnegative(), unansweredCount: z.number().int().nonnegative() }).strict(),
  sources: z.array(z.object({ sourceId: boundedId, sectionId: boundedId,
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(6),
  conflict: z.object({ status: z.literal("not-structured"), message: z.string().min(1).max(400) }).strict(),
  missingEvidence: z.array(z.string().min(1).max(400)).max(24),
  report: z.object({ status: z.enum(["attributable", "incomplete"]),
    checker: z.object({ kind: z.literal("evidence-research"), performed: z.literal(true),
      corrected: z.boolean(), attemptCount: z.number().int().min(1).max(2),
      finalAnswerOrigin: z.enum(["primary", "checker-correction"]) }).strict().nullable(),
    citationOrdinals: z.array(z.number().int().positive()).max(24) }).strict(),
}).strict().superRefine((value, context) => {
  const reportReady = value.progress.status === "report-ready";
  const attributable = value.report.status === "attributable";
  if (reportReady !== attributable) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["report", "status"],
      message: "Research progress and report status must agree." });
  }
  if (attributable && (!value.sources.length || value.sources.length !== value.progress.selectedSources
      || value.progress.resolvedSources !== value.progress.selectedSources
      || value.progress.passesRun !== value.progress.passesPlanned || value.progress.degraded
      || value.progress.truncated || value.progress.omissionCount !== 0 || value.progress.unansweredCount !== 0
      || value.missingEvidence.length !== 0 || !value.report.checker || !value.report.citationOrdinals.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["report"],
      message: "An attributable Research report requires complete, non-degraded selected evidence and citations." });
  }
});

export const Gate2AnswerResponseSchema = z.object({
  schemaVersion: z.literal("runa2-answer-response/v2"),
  requestId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  threadId: boundedId,
  contextRevision: z.number().int().nonnegative().optional(),
  lane: z.enum(["general", "research", "guarded", "workspace", "code", "review"]),
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
  review: reviewResult.nullable().default(null),
  researchWorkflow: researchWorkflow.nullable().default(null),
  citations: z.array(citation),
  model: z.object({ role: z.string(), provider: z.string(), modelId: z.string() }).strict(),
  completion: z.object({ reason: z.string(), timedOut: z.boolean(), outputLimited: z.boolean() }).strict(),
  trace: z.object({ correlationId: z.string().min(16).max(128) }).strict(),
  effects: z.tuple([]),
  auditCodes: z.array(z.string()),
  gates: z.object({ performed: z.boolean(), codes: z.array(z.string()) }).strict(),
  execution: AnswerExecutionStampSchema,
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
  review: "review",
});

export const GATE2_LANE_CAPABILITIES = Object.freeze({
  general: Object.freeze(["chat"]),
  guarded: Object.freeze(["chat", "guarded-read-only"]),
  research: Object.freeze(["research"]),
  workspace: Object.freeze(["code", "workspace-read"]),
  code: Object.freeze(["code"]),
  review: Object.freeze(["review", "workspace-read"]),
});
