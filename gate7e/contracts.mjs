import { z } from "zod";

const boundedId = z.string().trim().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const CodeExecutionRequestSchema = z.object({
  schemaVersion: z.literal("runa2-code-execution-request/v1"),
  requestId: boundedId,
  participant: z.object({ principalId: boundedId, verified: z.literal(true) }).strict(),
  project: z.object({ projectId: boundedId }).strict(),
  thread: z.object({ threadId: boundedId }).strict(),
  experience: z.literal("code"),
  language: z.literal("javascript"),
  source: z.string().min(1).max(8_000),
  origin: z.object({ type: z.enum(["authenticated-user-run-action", "system-startup-preflight"]) }).strict(),
}).strict().superRefine((request, context) => {
  if (Buffer.byteLength(request.source, "utf8") > 8_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["source"],
      message: "JavaScript source exceeds the 8,000-byte limit." });
  }
  if (request.origin.type === "system-startup-preflight") {
    const exact = request.participant.principalId === "runa2-system-preflight"
      && request.project.projectId === "runa:system"
      && request.thread.threadId === "sandbox-startup"
      && request.source === "console.log('runa2-sandbox-ready')";
    if (!exact) context.addIssue({ code: z.ZodIssueCode.custom, path: ["origin"],
      message: "The startup preflight contract is exact." });
  }
});

const executionLimits = z.object({
  sourceBytes: z.number().int().positive().max(8_000),
  maximumSourceBytes: z.literal(8_000),
  wallClockMs: z.literal(2_000),
  quickJsDeadlineMs: z.literal(1_200),
  maximumOutputBytes: z.literal(16_000),
  quickJsMemoryBytes: z.literal(16_777_216),
  quickJsStackBytes: z.literal(524_288),
  processLimit: z.literal(1),
  stdin: z.literal("closed"),
}).strict();

const executionOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  combinedBytes: z.number().int().nonnegative().max(16_000),
  partialDelivered: z.literal(false),
}).strict();

export const CodeExecutionReceiptSchema = z.object({
  schemaVersion: z.literal("runa2-code-execution-receipt/v1"),
  receiptId: boundedId,
  requestId: boundedId,
  participantId: boundedId,
  projectId: boundedId,
  threadId: boundedId,
  status: z.enum(["executed", "failed", "timed-out", "output-limited", "unavailable"]),
  language: z.literal("javascript"),
  sourceSha256: digest,
  runtime: z.object({
    engine: z.literal("quickjs"),
    package: z.literal("quickjs-emscripten"),
    packageVersion: z.literal("0.32.0"),
    host: z.literal("node"),
    hostVersion: z.string().regex(/^v\d+\.\d+\.\d+$/),
  }).strict(),
  isolation: z.object({
    provider: z.literal("microsoft-mxc"),
    packageVersion: z.literal("0.8.0"),
    method: z.literal("processcontainer"),
    tier: z.enum(["base-container", "appcontainer-bfs", "appcontainer-dacl", "unavailable"]),
    filesystem: z.literal("read-only-runtime-and-transient-source"),
    network: z.literal("deny-all"),
    environment: z.literal("empty"),
    ui: z.literal("win32k-compatible-job-restricted"),
  }).strict(),
  limits: executionLimits,
  output: executionOutput,
  exitCode: z.number().int().nullable(),
  errorCode: z.string().regex(/^[a-z0-9-]{1,100}$/).nullable(),
  durationMs: z.number().int().nonnegative(),
  systemStamped: z.literal(true),
  effects: z.tuple([]),
}).strict().superRefine((receipt, context) => {
  if (receipt.status === "executed" && (receipt.exitCode !== 0 || receipt.errorCode !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"],
      message: "Executed status requires a clean sandbox exit." });
  }
  if (receipt.status === "executed" && receipt.isolation.tier === "unavailable") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["isolation", "tier"],
      message: "Executed status requires a verified isolation tier." });
  }
  if (receipt.status !== "executed" && receipt.errorCode === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["errorCode"],
      message: "A non-executed result requires a bounded error code." });
  }
  const actualOutputBytes = Buffer.byteLength(receipt.output.stdout, "utf8")
    + Buffer.byteLength(receipt.output.stderr, "utf8");
  if (actualOutputBytes !== receipt.output.combinedBytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["output", "combinedBytes"],
      message: "The output byte receipt does not match its content." });
  }
});

export const AnswerExecutionStampSchema = z.object({
  schemaVersion: z.literal("runa2-answer-execution-stamp/v1"),
  status: z.literal("not-executed"),
  reason: z.enum(["answer-only", "code-draft-only"]),
  sourceSha256: z.null(),
  receiptId: z.null(),
  systemStamped: z.literal(true),
}).strict();

export function answerExecutionStamp(lane) {
  return Object.freeze({
    schemaVersion: "runa2-answer-execution-stamp/v1",
    status: "not-executed",
    reason: lane === "code" ? "code-draft-only" : "answer-only",
    sourceSha256: null,
    receiptId: null,
    systemStamped: true,
  });
}

export const parseCodeExecutionRequest = value => CodeExecutionRequestSchema.parse(value);
export const parseCodeExecutionReceipt = value => CodeExecutionReceiptSchema.parse(value);
