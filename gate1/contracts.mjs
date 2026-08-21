import { z } from "zod";

const boundedId = z.string().trim().min(1).max(160);

export const AnswerRequestSchema = z.object({
  schemaVersion: z.literal("runa2-answer-request/v1"),
  requestId: boundedId,
  lane: z.enum(["general", "research"]),
  participant: z.object({ principalId: boundedId, verified: z.boolean() }).strict(),
  project: z.object({ projectId: boundedId }).strict(),
  thread: z.object({ threadId: boundedId }).strict(),
  message: z.string().trim().min(1).max(4_000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8_000),
  }).strict()).max(24),
  budgets: z.object({
    deadlineMs: z.number().int().min(100).max(30_000),
    maximumPasses: z.number().int().min(1).max(12),
    maximumPassages: z.number().int().min(1).max(24),
    maximumEvidenceCharacters: z.number().int().min(128).max(48_000),
  }).strict(),
}).strict();

export const CitationSchema = z.object({
  sourceId: boundedId,
  sectionId: boundedId,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  ordinal: z.number().int().positive(),
}).strict();

export const AnswerResponseSchema = z.object({
  schemaVersion: z.literal("runa2-answer-response/v1"),
  requestId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  threadId: boundedId,
  lane: z.enum(["general", "research"]),
  answer: z.string(),
  ground: z.enum(["record-answers", "record-silent", "not-a-question-of-fact", "no-ground-needed"]),
  retrieval: z.object({
    attempted: z.boolean(),
    skipped: z.boolean(),
    skipReason: z.string(),
    empty: z.boolean(),
    degraded: z.boolean(),
    evidenceCount: z.number().int().nonnegative(),
    unavailable: z.array(z.string()),
    omissions: z.array(z.string()),
  }).strict(),
  research: z.nullable(z.object({
    passesPlanned: z.number().int().nonnegative(),
    passesRun: z.number().int().nonnegative(),
    passesWithNothing: z.number().int().nonnegative(),
    passagesRead: z.number().int().nonnegative(),
    unanswered: z.array(z.string()),
    truncated: z.boolean(),
  }).strict()),
  citations: z.array(CitationSchema),
  model: z.object({ role: z.string(), provider: z.string(), modelId: z.string() }).strict(),
  completion: z.object({ reason: z.string(), timedOut: z.boolean(), outputLimited: z.boolean() }).strict(),
  trace: z.object({ correlationId: z.string().min(16).max(128) }).strict(),
  effects: z.tuple([]),
  auditCodes: z.array(z.string()),
}).strict();

export const parseAnswerRequest = value => AnswerRequestSchema.parse(value);
export const parseAnswerResponse = value => AnswerResponseSchema.parse(value);
