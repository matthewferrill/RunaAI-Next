import { z } from "zod";

const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const code = z.string().max(160).regex(/^[A-Za-z0-9_.: -]*$/);
const count = z.number().int().nonnegative().max(1_000_000);
const evidenceFields = {
  citations: z.array(z.object({ sourceId: id, sectionId: id,
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/), ordinal: z.number().int().min(1).max(1_000_000) }).strict()).max(24),
  ground: z.enum(["record-answers", "record-silent", "not-a-question-of-fact", "no-ground-needed"]),
  retrieval: z.object({ attempted: z.boolean(), skipped: z.boolean(), skipReason: code, empty: z.boolean(),
    degraded: z.boolean(), evidenceCount: count, unavailable: z.array(code).max(24), omissions: z.array(code).max(24) }).strict(),
  workspace: z.object({ explicitSources: count, resolvedSources: count, extraReads: z.literal(0),
    citationStatus: z.enum(["not-applicable", "recognized", "missing", "contains-unknown"]) }).strict().nullable(),
  completion: z.object({ reason: code, timedOut: z.boolean(), outputLimited: z.boolean() }).strict(),
  execution: z.object({ status: z.literal("not-executed") }).strict(),
};
const evidenceV1Schema = z.object({ schemaVersion: z.literal("runaai-answer-evidence/v1"), ...evidenceFields }).strict();
const reviewContextSchema = z.object({ contextType: z.enum(["source", "artifact", "diff"]), targetId: id,
  sourceId: id, sectionId: id, contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  label: z.string().trim().min(1).max(120).nullable() }).strict();
const reviewSchema = z.object({ status: z.enum(["accepted-primary", "accepted-revision", "incomplete"]),
  contexts: z.array(reviewContextSchema).max(6), checker: z.object({ initialVerdict: z.enum(["accept", "revise"]),
    finalVerdict: z.literal("accept"), revisionPasses: z.number().int().min(0).max(1),
    attemptCount: z.number().int().min(1).max(2), finalAnswerOrigin: z.enum(["primary", "checker-correction"]) }).strict().nullable(),
  findings: z.array(z.object({ findingId: id, severity: z.literal("unclassified"),
    citationOrdinals: z.array(z.number().int().positive()).max(24) }).strict()).max(1) }).strict();
const researchWorkflowSchema = z.object({ sourceEnvelope: z.literal("supplied-source-only"),
  limitation: z.string().min(1).max(400),
  plan: z.object({ steps: z.array(z.object({ stepId: id, text: z.string().min(1).max(240),
    status: z.literal("submitted") }).strict()).min(1).max(8) }).strict(),
  progress: z.object({ status: z.enum(["report-ready", "incomplete"]),
    selectedSources: z.number().int().min(1).max(6), resolvedSources: z.number().int().nonnegative().max(6),
    passesPlanned: count, passesRun: count, passagesRead: count, degraded: z.boolean(), truncated: z.boolean(),
    omissionCount: count, unansweredCount: count }).strict(),
  sources: z.array(z.object({ sourceId: id, sectionId: id,
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(6),
  conflict: z.object({ status: z.literal("not-structured"), message: z.string().min(1).max(400) }).strict(),
  missingEvidence: z.array(z.string().min(1).max(400)).max(24),
  report: z.object({ status: z.enum(["attributable", "incomplete"]), checker: z.object({
    kind: z.literal("evidence-research"), performed: z.literal(true), corrected: z.boolean(),
    attemptCount: z.number().int().min(1).max(2),
    finalAnswerOrigin: z.enum(["primary", "checker-correction"]) }).strict().nullable(),
    citationOrdinals: z.array(z.number().int().positive()).max(24) }).strict() }).strict()
  .superRefine((value, context) => {
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
const evidenceV2Schema = z.object({ schemaVersion: z.literal("runaai-answer-evidence/v2"), ...evidenceFields,
  review: reviewSchema.nullable(), researchWorkflow: researchWorkflowSchema.nullable().optional() }).strict();
const evidenceSchema = z.union([evidenceV2Schema, evidenceV1Schema]);

// Persist application-produced metadata only, never model labels, duplicate source text,
// private request payloads or an inferred execution result. Missing old metadata stays missing.
export function answerEvidence(response) {
  if (response?.execution?.status !== "not-executed") return null;
  const review = response.review ? { status: response.review.status, contexts: response.review.contexts,
    checker: response.review.checker, findings: (response.review.findings ?? []).map(finding => ({
      findingId: finding.findingId, severity: finding.severity, citationOrdinals: finding.citationOrdinals,
    })) } : null;
  const result = evidenceSchema.safeParse({ schemaVersion: "runaai-answer-evidence/v2",
    citations: response.citations, ground: response.ground, retrieval: response.retrieval,
    workspace: response.workspace, review,
    ...(response.researchWorkflow ? { researchWorkflow: response.researchWorkflow } : {}),
    completion: response.completion, execution: { status: "not-executed" } });
  return result.success ? result.data : null;
}

export function readAnswerEvidence(value) {
  const result = evidenceSchema.safeParse(value);
  return result.success ? result.data : null;
}
