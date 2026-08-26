import { z } from "zod";
import { AGENT_CAPABILITIES, canonicalDigest } from "../contracts.mjs";

const boundedId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = z.string().min(1).max(64 * 1024).refine(value => !value.includes("\u0000"));
const boundedPath = z.string().trim().min(1).max(240);
const term = z.string().trim().min(1).max(160);
const termGroups = z.array(z.array(term).min(1).max(8)).max(20).default([]);
const forbiddenTerms = z.array(term).max(40).default([]);
const capabilityId = z.enum(AGENT_CAPABILITIES);

const message = z.object({ role: z.enum(["user", "assistant", "system"]), content: boundedText }).strict();
const taskContext = z.object({
  profile: z.enum(["read-only", "ask-every-time", "safe-autopilot", "full-project-autopilot", "custom"]),
  projectId: boundedId,
  availableCapabilityIds: z.array(capabilityId).max(AGENT_CAPABILITIES.length),
  workspaceRevision: z.number().int().positive(),
}).strict();

const proposalDraft = z.discriminatedUnion("capabilityId", [
  z.object({ capabilityId: z.literal("workspace.inspect"),
    arguments: z.object({ path: boundedPath }).strict() }).strict(),
  z.object({ capabilityId: z.literal("workspace.preview-change"),
    arguments: z.object({ path: boundedPath, content: boundedText }).strict() }).strict(),
  z.object({ capabilityId: z.literal("workspace.apply-synthetic-change"),
    arguments: z.object({ path: boundedPath, content: boundedText }).strict() }).strict(),
  z.object({ capabilityId: z.literal("workspace.restore-synthetic-change"),
    arguments: z.object({ forwardReceiptId: boundedId }).strict() }).strict(),
  z.object({ capabilityId: z.literal("workspace.verify-synthetic"),
    arguments: z.object({ assertions: z.array(z.object({ path: boundedPath, sha256: sha256.nullable() })
      .strict()).min(1).max(32) }).strict() }).strict(),
]);

export const AgentEvaluationOutputSchema = z.object({
  kind: z.enum(["respond", "plan", "propose", "stop"]),
  message: z.string().max(8_000),
  plan: z.array(z.object({ summary: z.string().trim().min(1).max(500),
    capabilityId: capabilityId.nullable() }).strict()).max(12),
  proposal: proposalDraft.nullable(),
}).strict().superRefine((value, context) => {
  if (value.kind === "plan" && value.plan.length === 0) {
    context.addIssue({ code: "custom", message: "Plan output requires at least one step." });
  }
  if (value.kind !== "plan" && value.plan.length !== 0) {
    context.addIssue({ code: "custom", message: "Only plan output may contain steps." });
  }
  if (value.kind === "propose" && !value.proposal) {
    context.addIssue({ code: "custom", message: "Proposal output requires one typed proposal." });
  }
  if (value.kind !== "propose" && value.proposal) {
    context.addIssue({ code: "custom", message: "Only proposal output may contain a proposal." });
  }
});

const commonExpected = {
  requiredTermGroups: termGroups,
  forbiddenTerms,
};

const textCase = z.object({
  caseId: boundedId,
  category: boundedId,
  critical: z.boolean(),
  format: z.literal("text"),
  messages: z.array(message).min(1).max(16),
  expected: z.object(commonExpected).strict(),
}).strict();

const agentCase = z.object({
  caseId: boundedId,
  category: boundedId,
  critical: z.boolean(),
  format: z.literal("agent-json"),
  taskContext,
  messages: z.array(message).min(1).max(16),
  expected: z.object({
    ...commonExpected,
    allowedKinds: z.array(z.enum(["respond", "plan", "propose", "stop"])).min(1).max(4),
    planCapabilityIds: z.array(capabilityId.nullable()).max(12).nullable(),
    proposal: proposalDraft.nullable(),
    normalizedCode: z.string().max(32 * 1024).nullable(),
  }).strict(),
}).strict();

export const BurninCorpusSchema = z.object({
  schemaVersion: z.literal("runa2-gate7f1-corpus/v1"),
  runsPerCase: z.number().int().min(2).max(10),
  categories: z.array(z.object({ category: boundedId, minimumPassRate: z.number().min(0).max(1),
    allAttemptsMustPass: z.boolean() }).strict()).min(1).max(20),
  cases: z.array(z.discriminatedUnion("format", [textCase, agentCase])).min(1).max(200),
}).strict().superRefine((value, context) => {
  const categoryIds = new Set(value.categories.map(item => item.category));
  if (categoryIds.size !== value.categories.length) context.addIssue({ code: "custom", message: "Categories must be unique." });
  const caseIds = new Set(value.cases.map(item => item.caseId));
  if (caseIds.size !== value.cases.length) context.addIssue({ code: "custom", message: "Case ids must be unique." });
  for (const item of value.cases) {
    if (!categoryIds.has(item.category)) context.addIssue({ code: "custom", message: `Unknown case category: ${item.category}` });
  }
});

export const BurninObservationSchema = z.object({
  schemaVersion: z.literal("runa2-gate7f1-observation/v1"),
  candidateId: boundedId,
  caseId: boundedId,
  attempt: z.number().int().min(1).max(10),
  modelId: boundedText.max(500),
  artifactSha256: sha256,
  runtimeFingerprintSha256: sha256,
  rawResponse: z.string().max(64 * 1024),
  elapsedMs: z.number().int().positive().max(30 * 60_000),
  generationTokens: z.number().int().nonnegative().max(100_000),
  generatedTokensPerSecond: z.number().nonnegative().max(100_000),
}).strict();

export const parseBurninCorpus = value => BurninCorpusSchema.parse(value);
export const parseBurninObservation = value => BurninObservationSchema.parse(value);
export const parseAgentEvaluationOutput = value => AgentEvaluationOutputSchema.parse(value);
export const burninCorpusDigest = corpus => canonicalDigest(parseBurninCorpus(corpus));
