import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const CAPABILITY_SET_VERSION = "m1-s2b1-materialization-2026-09-03.1";
export const CAPABILITY_SET_DIGEST = "001ff34d840293fb7de17a76b518b29bf68755b5f230cf386de96a51288b0aea";
export const NETWORK_POLICY_ID = "m1-s2b1-public-git-network-v1";
export const NETWORK_POLICY_DIGEST = "f898215b4a02d2f76c5686f0fec27f6fcf081c5beed4fdbdb4b84d8148914e3f";
export const MATERIALIZATION_POLICY_ID = "m1-s2b1-materialization-limits-v1";
export const MATERIALIZATION_POLICY_DIGEST = "62580f8ba8ba08c8dae7aaa27b3da904e7dfb426e3721b754e7499d79c3ff5cb";

const MAX_FRAME_BYTES = 1_048_576;
const MAX_GIT_REQUEST_BYTES = 2_097_152;
const MAX_GIT_RESPONSE_BYTES = 100_663_296;
const UPLOAD_SESSION_LIFETIME_MS = 120_000;
const MATERIALIZATION_DEADLINE_MS = 120_000;
const CLEANUP_RECONCILIATION_DEADLINE_MS = 30_000;
const WORKSPACE_LIFETIME_MS = 1_800_000;
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u).refine(value => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}, "invalid canonical UTC instant");
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveCount = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const reservedWindowsName = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;

const relativePath = z.string().min(1).max(1024).refine(value => {
  if (!/^[\x20-\x7e]+$/u.test(value) || Buffer.byteLength(value, "utf8") > 1024 || value.includes("\\") || value.startsWith("/") || value.endsWith("/")) return false;
  const segments = value.split("/");
  return value === value.normalize("NFC") && segments.length <= 64 && segments.every(segment =>
    segment.length > 0 && segment !== "." && segment !== ".." && Buffer.byteLength(segment, "utf8") <= 255 &&
    !/[\u0000-\u001f<>:"|?*]/u.test(segment) && !/[. ]$/u.test(segment) && !reservedWindowsName.test(segment) &&
    segment.toLocaleLowerCase("en-US") !== ".git" && !segment.toLocaleLowerCase("en-US").startsWith(".git:")
  );
}, "invalid normalized relative path");

const windowsPathKey = value => value.toLowerCase();
const canonicalGitUrl = z.string().min(1).max(2048).refine(value => {
  if (!/^[\x20-\x7e]+$/u.test(value) || value.includes("%") || value.includes("?") || value.includes("#") || value.includes("@")) return false;
  const match = /^https:\/\/([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)(?::443)?((?:\/[A-Za-z0-9._~!$&'()+,;=:-]+)+\.git)$/u.exec(value);
  if (!match || match[1].includes("..") || match[1].endsWith(".") || match[1].split(".").some(label => label.length > 63 || label.startsWith("-") || label.endsWith("-") || label.startsWith("xn--"))) return false;
  return !match[2].split("/").some(segment => segment === "." || segment === "..");
}, "repository URL must be exact ASCII canonical HTTPS Git URL");
const canonicalGitRef = z.string().min(1).max(255).refine(value => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)
  && !value.includes("..") && !value.includes("@{") && !value.endsWith("/") && !value.endsWith(".")
  && !value.split("/").some(segment => segment.length === 0 || segment.startsWith(".") || segment.endsWith(".lock")),
"invalid canonical Git ref");

export const sourceLifecycle = z.enum(["known", "configured", "connected", "tested", "enabled", "disconnected", "expired", "revoked", "failed", "unknown"]);
export const cleanupState = z.enum(["not-required", "pending", "complete", "indeterminate"]);
export const workspaceLifecycle = z.enum(["absent", "intent-recorded", "staging", "published-pending-db", "ready", "expired", "cancelled", "failed", "cleanup-pending", "unknown", "removed"]);

export const authorityBindingSchema = z.object({ schemaVersion: z.literal("runa-workspace-binding/v1"),
  participantId: id, projectId: id, environmentId: id, sourceId: id, taskId: id, sourceRevision: positiveCount,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION), capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST) }).strict();

const sourceBase = {
  schemaVersion: z.literal("runa-workspace-source-selection/v1"), sourceId: id, projectId: id,
  participantId: id, environmentId: id, displayName: z.string().min(1).max(120), lifecycle: sourceLifecycle,
  cleanupState, capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION), capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
  revision: positiveCount, createdAt: utc, updatedAt: utc, revokedAt: utc.nullable()
};

export const sourceSelectionSchema = z.discriminatedUnion("sourceKind", [
  z.object({ ...sourceBase, sourceKind: z.literal("git-public-https"), repositoryHttpsUrl: canonicalGitUrl,
    requestedRef: canonicalGitRef, endpointPolicyId: z.literal(NETWORK_POLICY_ID),
    endpointPolicyDigest: z.literal(NETWORK_POLICY_DIGEST) }).strict(),
  z.object({ ...sourceBase, sourceKind: z.literal("browser-folder-snapshot"), repositoryHttpsUrl: z.null(),
    requestedRef: z.null(), endpointPolicyId: z.null(), endpointPolicyDigest: z.null() }).strict()
]).superRefine((value, context) => {
  if (value.revokedAt !== null && value.lifecycle !== "revoked") context.addIssue({ code: "custom", message: "revokedAt requires revoked lifecycle" });
  if (value.lifecycle === "revoked" && value.revokedAt === null) context.addIssue({ code: "custom", message: "revoked lifecycle requires revokedAt" });
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) context.addIssue({ code: "custom", message: "updatedAt precedes createdAt" });
  if (["disconnected", "expired", "revoked", "failed", "unknown"].includes(value.lifecycle) && value.cleanupState === "not-required") context.addIssue({ code: "custom", message: "terminal source requires cleanup disposition" });
  if (value.lifecycle === "unknown" && value.cleanupState !== "indeterminate") context.addIssue({ code: "custom", message: "unknown source requires indeterminate cleanup" });
  if (["disconnected", "expired", "failed"].includes(value.lifecycle) && !["pending", "complete"].includes(value.cleanupState)) context.addIssue({ code: "custom", message: "determinate terminal source requires pending or complete cleanup" });
  if (value.lifecycle === "revoked" && !["pending", "complete", "indeterminate"].includes(value.cleanupState)) context.addIssue({ code: "custom", message: "revoked source cleanup disposition invalid" });
  if (["known", "configured", "connected", "tested", "enabled"].includes(value.lifecycle) && value.cleanupState !== "not-required") context.addIssue({ code: "custom", message: "active source cannot have cleanup state" });
});

export const materializationRequestSchema = z.object({
  schemaVersion: z.literal("runa-workspace-materialization-request/v1"), requestId: id,
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u), sourceId: id, taskId: id, bindingDigest: digest,
  expectedSourceRevision: positiveCount, capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST), requestedRef: canonicalGitRef.nullable(),
  uploadSessionId: id.nullable(), uploadManifestDigest: digest.nullable(), limitsProfileId: z.literal(MATERIALIZATION_POLICY_ID),
  limitsProfileDigest: z.literal(MATERIALIZATION_POLICY_DIGEST), deadlineAt: utc, createdAt: utc
}).strict().superRefine((value, context) => {
  const git = value.requestedRef !== null;
  const snapshot = value.uploadSessionId !== null || value.uploadManifestDigest !== null;
  if (git === snapshot) context.addIssue({ code: "custom", message: "exactly one Git or snapshot input is required" });
  if ((value.uploadSessionId === null) !== (value.uploadManifestDigest === null)) context.addIssue({ code: "custom", message: "snapshot session and manifest digest must both be present" });
  if (Date.parse(value.deadlineAt) - Date.parse(value.createdAt) !== MATERIALIZATION_DEADLINE_MS) context.addIssue({ code: "custom", message: "deadlineAt must equal frozen materialization deadline" });
});

export const workspaceCancelRequestSchema = z.object({ schemaVersion: z.literal("runa-workspace-cancel-request/v1"),
  requestId: id, idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u), sourceId: id, taskId: id,
  bindingDigest: digest, expectedSourceRevision: positiveCount, capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST), requestedAt: utc }).strict();

export const workspaceReconciliationRequestSchema = z.object({ schemaVersion: z.literal("runa-workspace-reconciliation-request/v1"),
  workspaceId: id, taskId: id, bindingDigest: digest, operation: z.enum(["workspace.reconcile", "workspace.cleanup"]),
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION), capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
  requestedAt: utc, deadlineAt: utc }).strict().superRefine((value, context) => {
  if (Date.parse(value.deadlineAt) - Date.parse(value.requestedAt) !== CLEANUP_RECONCILIATION_DEADLINE_MS) context.addIssue({ code: "custom", message: "deadlineAt must equal frozen cleanup/reconciliation deadline" });
});

export const manifestEntrySchema = z.object({ path: relativePath, bytes: count.max(4_194_304), sha256: digest,
  mediaClass: z.enum(["utf8-text", "binary"]) }).strict();

export const workspaceManifestSchema = z.object({
  schemaVersion: z.literal("runa-workspace-manifest/v1"), workspaceId: id, sourceId: id, bindingDigest: digest,
  sourceKind: z.enum(["git-public-https", "browser-folder-snapshot"]),
  nativeVersionKind: z.enum(["git-commit-sha1", "git-commit-sha256", "content-snapshot-sha256"]),
  nativeVersion: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u), entries: z.array(manifestEntrySchema).max(2000),
  fileSetDigest: digest, excludedCount: count, rejectedCount: count, complete: z.boolean(),
  adapterReleaseSha256: digest, runtimeReleaseSha256: digest, brokerReleaseSha256: digest,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION), capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
  limitsProfileId: z.literal(MATERIALIZATION_POLICY_ID), limitsProfileDigest: z.literal(MATERIALIZATION_POLICY_DIGEST),
  lifecycle: workspaceLifecycle, createdAt: utc, expiresAt: utc
}).strict().superRefine((value, context) => {
  const total = value.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total > 67_108_864) context.addIssue({ code: "custom", message: "total bytes exceeds profile" });
  const keys = value.entries.map(entry => windowsPathKey(entry.path));
  if (keys.some((key, index) => index > 0 && keys[index - 1] >= key)) context.addIssue({ code: "custom", message: "entries must be strictly ordered and unique under Windows identity" });
  if (value.sourceKind === "git-public-https" && !value.nativeVersionKind.startsWith("git-commit-")) context.addIssue({ code: "custom", message: "Git source requires Git native version" });
  if (value.sourceKind === "browser-folder-snapshot" && value.nativeVersionKind !== "content-snapshot-sha256") context.addIssue({ code: "custom", message: "snapshot source requires snapshot native version" });
  if ((value.nativeVersionKind.endsWith("sha1") && value.nativeVersion.length !== 40) || (!value.nativeVersionKind.endsWith("sha1") && value.nativeVersion.length !== 64)) context.addIssue({ code: "custom", message: "native version length mismatch" });
  if (value.complete !== (value.rejectedCount === 0)) context.addIssue({ code: "custom", message: "complete requires zero rejected entries" });
  if (value.lifecycle === "ready" && (!value.complete || value.rejectedCount !== 0)) context.addIssue({ code: "custom", message: "ready manifest must be complete" });
  if (Date.parse(value.expiresAt) - Date.parse(value.createdAt) !== WORKSPACE_LIFETIME_MS) context.addIssue({ code: "custom", message: "expiresAt must equal frozen workspace lifetime" });
});

const optionalDigest = digest.nullable();
const recordedEffect = z.enum(["workspace-materialize", "workspace-cancel", "workspace-cleanup"]);
const materializationErrorCode = z.enum(["source-rejected", "capability-denied", "binding-mismatch",
  "limit-files", "limit-total-bytes", "limit-file-bytes", "limit-path", "limit-output",
  "limit-concurrency", "process-failed", "network-denied", "network-failed", "publication-failed",
  "database-failed", "materialization-timeout", "cancellation-accepted", "cleanup-failed", "state-indeterminate"]);
export const materializationReceiptSchema = z.object({
  schemaVersion: z.literal("runa-workspace-materialization-receipt/v1"), requestId: id, sourceId: id,
  sourceKind: z.enum(["git-public-https", "browser-folder-snapshot"]), workspaceId: id.nullable(), taskId: id,
  bindingDigest: digest, capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION), capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST),
  limitsProfileId: z.literal(MATERIALIZATION_POLICY_ID), limitsProfileDigest: z.literal(MATERIALIZATION_POLICY_DIGEST),
  outcome: z.enum(["ready", "rejected", "failed", "timed-out", "cancelled", "unknown", "cleanup-pending"]),
  nativeVersion: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u).nullable(), beforeManifestDigest: optionalDigest,
  stagingManifestDigest: optionalDigest, finalManifestDigest: optionalDigest,
  networkState: z.enum(["not-required", "denied", "bounded-complete", "indeterminate"]),
  processState: z.enum(["not-started", "stopped", "stop-unconfirmed"]),
  publicationState: z.enum(["not-started", "staging", "published-unacknowledged", "published-acknowledged", "indeterminate"]),
  databaseState: z.enum(["intent-recorded", "ready-recorded", "terminal-recorded", "indeterminate"]), cleanupState,
  filesObserved: count.max(2000), bytesObserved: count.max(67_108_864), durationMs: count.max(150_000),
  limitCode: z.enum(["none", "files", "total-bytes", "file-bytes", "path", "time", "output", "concurrency"]),
  errorCode: materializationErrorCode.nullable(), retryableAfterReconciliation: z.boolean(),
  workerReleaseSha256: digest, startedAt: utc, finishedAt: utc, credentialsPresent: z.literal(false),
  privateValuesIncluded: z.literal(false), modelInvoked: z.literal(false), effects: z.array(recordedEffect).max(3)
}).strict().superRefine((value, context) => {
  if (Date.parse(value.finishedAt) < Date.parse(value.startedAt)) context.addIssue({ code: "custom", message: "finishedAt precedes startedAt" });
  if (value.outcome === "ready") {
    const readyNetwork = value.sourceKind === "git-public-https" ? value.networkState === "bounded-complete" : value.networkState === "not-required";
    const readyNativeVersion = value.nativeVersion !== null && (value.sourceKind === "git-public-https"
      ? [40, 64].includes(value.nativeVersion.length) : value.nativeVersion.length === 64);
    if (!readyNetwork || !readyNativeVersion || value.workspaceId === null || value.stagingManifestDigest === null || value.finalManifestDigest === null || value.publicationState !== "published-acknowledged" || value.databaseState !== "ready-recorded" || value.cleanupState !== "complete" || value.processState !== "stopped" || value.limitCode !== "none" || value.errorCode !== null || value.retryableAfterReconciliation || value.effects.length !== 1 || value.effects[0] !== "workspace-materialize") context.addIssue({ code: "custom", message: "ready receipt invariants failed" });
  } else if (value.outcome === "unknown") {
    if (value.errorCode === null || value.retryableAfterReconciliation || (value.processState !== "stop-unconfirmed" && value.publicationState !== "indeterminate" && value.databaseState !== "indeterminate" && value.cleanupState !== "indeterminate")) context.addIssue({ code: "custom", message: "unknown requires an indeterminate state, error, and no retry" });
  } else if (value.outcome === "cleanup-pending") {
    if (value.errorCode !== "cleanup-failed" || value.retryableAfterReconciliation || value.cleanupState !== "pending") context.addIssue({ code: "custom", message: "cleanup-pending requires pending cleanup, exact error, and no retry" });
  } else if (value.errorCode === null || !["not-started", "staging"].includes(value.publicationState) || value.databaseState !== "terminal-recorded" || !["not-started", "stopped"].includes(value.processState) || !["not-required", "complete"].includes(value.cleanupState)) context.addIssue({ code: "custom", message: "determinate non-ready outcome invariants failed" });
  const expectedRetryable = ["failed", "timed-out", "cancelled"].includes(value.outcome);
  if (value.retryableAfterReconciliation !== expectedRetryable) context.addIssue({ code: "custom", message: "retryability/outcome mismatch" });
  if (value.outcome === "timed-out" && (value.errorCode !== "materialization-timeout" || value.workspaceId === null
    || value.processState !== "stopped" || value.publicationState !== "staging" || value.databaseState !== "terminal-recorded"
    || value.cleanupState !== "complete" || value.durationMs < MATERIALIZATION_DEADLINE_MS
    || Date.parse(value.finishedAt) - Date.parse(value.startedAt) < MATERIALIZATION_DEADLINE_MS)) context.addIssue({ code: "custom", message: "timed-out outcome requires staged expired materialization" });
  if (value.outcome === "cancelled" && value.errorCode !== "cancellation-accepted") context.addIssue({ code: "custom", message: "cancelled outcome requires exact error" });
  if (value.outcome === "unknown" && value.errorCode !== "state-indeterminate") context.addIssue({ code: "custom", message: "unknown outcome requires exact error" });
  if (value.outcome === "rejected" && !["source-rejected", "capability-denied", "binding-mismatch", "limit-files", "limit-total-bytes", "limit-file-bytes", "limit-path", "limit-output", "limit-concurrency"].includes(value.errorCode)) context.addIssue({ code: "custom", message: "rejected outcome error mismatch" });
  if (value.outcome === "failed" && !["process-failed", "network-denied", "network-failed", "publication-failed", "database-failed"].includes(value.errorCode)) context.addIssue({ code: "custom", message: "failed outcome error mismatch" });
  const limitErrors = { files: "limit-files", "total-bytes": "limit-total-bytes", "file-bytes": "limit-file-bytes",
    path: "limit-path", time: "materialization-timeout", output: "limit-output", concurrency: "limit-concurrency" };
  if (value.limitCode !== "none" && value.errorCode !== limitErrors[value.limitCode]) context.addIssue({ code: "custom", message: "limit/error mismatch" });
  if (Object.values(limitErrors).includes(value.errorCode) && value.limitCode === "none") context.addIssue({ code: "custom", message: "limit error requires limit code" });
  if (value.outcome === "timed-out" && value.limitCode !== "time") context.addIssue({ code: "custom", message: "timed-out outcome requires time limit" });
  if (value.outcome === "cancelled" && value.limitCode !== "none") context.addIssue({ code: "custom", message: "cancelled outcome cannot claim limit" });
  if (value.processState === "stop-unconfirmed" && value.outcome !== "unknown") context.addIssue({ code: "custom", message: "unconfirmed stop requires unknown outcome" });
  if (new Set(value.effects).size !== value.effects.length || (value.outcome === "cancelled" && value.effects[0] !== "workspace-cancel") || (value.outcome !== "cancelled" && value.effects.includes("workspace-cancel")) || (value.outcome !== "ready" && value.effects.includes("workspace-materialize"))) context.addIssue({ code: "custom", message: "receipt effects/outcome mismatch" });
});

const uploadEntrySchema = z.object({ path: relativePath, bytes: count.max(4_194_304), sha256: digest,
  chunks: count.max(4) }).strict().superRefine((value, context) => {
  const expected = value.bytes === 0 ? 0 : Math.ceil(value.bytes / MAX_FRAME_BYTES);
  if (value.chunks !== expected) context.addIssue({ code: "custom", message: "chunk count does not match byte length" });
});

export const uploadSessionCreateRequestSchema = z.object({ schemaVersion: z.literal("runa-browser-folder-upload-session-request/v1"),
  displayName: z.string().min(1).max(120), declaredFileCount: positiveCount.max(2000), declaredTotalBytes: count.max(67_108_864) }).strict();
export const uploadSessionCreateResponseSchema = z.object({ schemaVersion: z.literal("runa-browser-folder-upload-session/v1"),
  uploadSessionId: id, sourceId: id, limitsProfileId: z.literal(MATERIALIZATION_POLICY_ID),
  limitsProfileDigest: z.literal(MATERIALIZATION_POLICY_DIGEST), issuedAt: utc, expiresAt: utc }).strict()
  .superRefine((value, context) => {
    if (Date.parse(value.expiresAt) - Date.parse(value.issuedAt) !== UPLOAD_SESSION_LIFETIME_MS) context.addIssue({ code: "custom", message: "expiresAt must equal frozen upload-session lifetime" });
  });

export const uploadManifestSchema = z.object({ schemaVersion: z.literal("runa-browser-folder-upload-manifest/v1"),
  entries: z.array(uploadEntrySchema).min(1).max(2000), excludedPaths: z.array(relativePath).max(2000),
  totalBytes: count.max(67_108_864) }).strict().superRefine((value, context) => {
  const included = value.entries.map(entry => windowsPathKey(entry.path));
  const excluded = value.excludedPaths.map(windowsPathKey);
  if (included.some((key, index) => index > 0 && included[index - 1] >= key)) context.addIssue({ code: "custom", message: "entries must be strictly ordered and unique" });
  if (excluded.some((key, index) => index > 0 && excluded[index - 1] >= key)) context.addIssue({ code: "custom", message: "exclusions must be strictly ordered and unique" });
  if (excluded.some(key => included.includes(key))) context.addIssue({ code: "custom", message: "included and excluded paths overlap" });
  if (value.entries.reduce((sum, entry) => sum + entry.bytes, 0) !== value.totalBytes) context.addIssue({ code: "custom", message: "totalBytes mismatch" });
});

export const uploadManifestRecordSchema = z.object({ schemaVersion: z.literal("runa-browser-folder-upload-manifest-record/v1"),
  uploadSessionId: id, sourceId: id, bindingDigest: digest, manifestDigest: digest, acceptedAt: utc, expiresAt: utc }).strict()
  .refine(value => Date.parse(value.expiresAt) > Date.parse(value.acceptedAt), "expiresAt must follow acceptedAt");

const pipeBase = { schemaVersion: z.literal("runa-materialization-pipe-frame/v2"), channelId: id,
  sequence: positiveCount.max(128), requestId: id, nonce: z.string().regex(/^[a-f0-9]{64}$/u),
  payloadSha256: digest, payloadBytes: count.max(MAX_FRAME_BYTES), hmacSha256: digest };
export const controlPipeFrameSchema = z.object({ ...pipeBase, sequence: z.literal(1),
  frameType: z.enum(["operation-request", "operation-receipt", "cancel-request", "terminal"]) }).strict();
export const gitStreamFrameSchema = z.object({ ...pipeBase, direction: z.enum(["materializer-to-broker", "broker-to-materializer"]),
  requestOrdinal: z.number().int().min(0).max(1),
  frameType: z.enum(["open-request", "request-body", "end-request", "open-response", "response-body", "end-response", "terminal"]) }).strict()
  .superRefine((value, context) => {
    const materializerType = ["open-request", "request-body", "end-request"].includes(value.frameType);
    if ((value.direction === "materializer-to-broker") !== materializerType) context.addIssue({ code: "custom", message: "frame type/direction mismatch" });
    if (value.frameType === "terminal" && value.requestOrdinal !== 1) context.addIssue({ code: "custom", message: "terminal requires second request ordinal" });
  });

export const gitOpenRequestSchema = z.object({ schemaVersion: z.literal("runa-public-git-http-request/v1"),
  requestOrdinal: z.number().int().min(0).max(1), method: z.enum(["GET", "POST"]), pathAndQuery: z.string().min(1).max(2048),
  accept: z.enum(["application/x-git-upload-pack-advertisement", "application/x-git-upload-pack-result"]),
  contentType: z.literal("application/x-git-upload-pack-request").nullable(), contentLength: count.max(MAX_GIT_REQUEST_BYTES) }).strict()
  .superRefine((value, context) => {
    if (value.requestOrdinal === 0 && (value.method !== "GET" || value.accept !== "application/x-git-upload-pack-advertisement" || value.contentType !== null || value.contentLength !== 0)) context.addIssue({ code: "custom", message: "info refs request shape invalid" });
    if (value.requestOrdinal === 1 && (value.method !== "POST" || value.accept !== "application/x-git-upload-pack-result" || value.contentType !== "application/x-git-upload-pack-request" || value.contentLength < 1)) context.addIssue({ code: "custom", message: "upload pack request shape invalid" });
  });

export const gitOpenResponseSchema = z.object({ schemaVersion: z.literal("runa-public-git-http-response/v1"),
  requestOrdinal: z.number().int().min(0).max(1), status: z.literal(200),
  contentType: z.enum(["application/x-git-upload-pack-advertisement", "application/x-git-upload-pack-result"]),
  contentLength: count.max(MAX_GIT_RESPONSE_BYTES).nullable(), headerBytes: positiveCount.max(32_768) }).strict()
  .superRefine((value, context) => {
    const expected = value.requestOrdinal === 0 ? "application/x-git-upload-pack-advertisement" : "application/x-git-upload-pack-result";
    if (value.contentType !== expected) context.addIssue({ code: "custom", message: "response content type/ordinal mismatch" });
  });

const canonical = input => Array.isArray(input) ? input.map(canonical) : input !== null && typeof input === "object"
  ? Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])])) : input;
export const canonicalStringify = value => JSON.stringify(canonical(value));
export const canonicalSha256 = value => createHash("sha256").update(canonicalStringify(value)).digest("hex");
export const bindingDigestFor = value => canonicalSha256(authorityBindingSchema.parse(value));
export const fileSetDigest = entries => canonicalSha256({ schemaVersion: "runa-workspace-file-set/v1", entries });
export const uploadManifestDigest = manifest => canonicalSha256(manifest);

export function parseCanonicalWire(schema, raw, maximumBytes = 1_048_576) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  if (bytes.length === 0 || bytes.length > maximumBytes || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) || bytes.includes(0)) throw new Error("non-canonical-wire");
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("non-canonical-wire");
  const value = JSON.parse(text);
  if (canonicalStringify(value) !== text) throw new Error("non-canonical-wire");
  return schema.parse(value);
}

const demandBinding = (value, bindingRecord) => {
  const binding = authorityBindingSchema.parse(bindingRecord);
  if (value.bindingDigest !== bindingDigestFor(binding) || value.sourceId !== binding.sourceId) throw new Error("binding-digest-mismatch");
  return value;
};
export const admitMaterializationRequest = (raw, bindingRecord) => {
  const value = demandBinding(parseCanonicalWire(materializationRequestSchema, raw), bindingRecord);
  const binding = authorityBindingSchema.parse(bindingRecord);
  if (value.taskId !== binding.taskId || value.expectedSourceRevision !== binding.sourceRevision) throw new Error("binding-record-mismatch");
  return value;
};
export const admitWorkspaceCancelRequest = (raw, bindingRecord) => {
  const value = demandBinding(parseCanonicalWire(workspaceCancelRequestSchema, raw), bindingRecord);
  const binding = authorityBindingSchema.parse(bindingRecord);
  if (value.taskId !== binding.taskId || value.expectedSourceRevision !== binding.sourceRevision) throw new Error("binding-record-mismatch");
  return value;
};
export function admitWorkspaceManifest(raw, bindingRecord) {
  const value = demandBinding(parseCanonicalWire(workspaceManifestSchema, raw, 524_288), bindingRecord);
  if (value.fileSetDigest !== fileSetDigest(value.entries)) throw new Error("file-set-digest-mismatch");
  return value;
}
export const admitMaterializationReceipt = (raw, bindingRecord) => {
  const value = demandBinding(parseCanonicalWire(materializationReceiptSchema, raw, 524_288), bindingRecord);
  if (value.taskId !== authorityBindingSchema.parse(bindingRecord).taskId) throw new Error("binding-record-mismatch");
  return value;
};
export const admitUploadManifest = raw => {
  const value = parseCanonicalWire(uploadManifestSchema, raw, 524_288);
  return Object.freeze({ value, manifestDigest: uploadManifestDigest(value) });
};
export function admitGitOpenRequest(raw, expectedRepositoryPath) {
  const value = parseCanonicalWire(gitOpenRequestSchema, raw, 16_384);
  const expected = value.requestOrdinal === 0 ? `${expectedRepositoryPath}/info/refs?service=git-upload-pack` : `${expectedRepositoryPath}/git-upload-pack`;
  if (value.pathAndQuery !== expected) throw new Error("git-request-path-mismatch");
  return value;
}
export const admitGitOpenResponse = raw => parseCanonicalWire(gitOpenResponseSchema, raw, 32_768);

export function admitPipeFrame(schema, rawHeader, payload, key) {
  const frame = parseCanonicalWire(schema, rawHeader, 16_384);
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (bytes.length !== frame.payloadBytes || createHash("sha256").update(bytes).digest("hex") !== frame.payloadSha256) throw new Error("pipe-payload-mismatch");
  const unsigned = { ...frame }; delete unsigned.hmacSha256;
  const expected = createHmac("sha256", key).update(canonicalStringify(unsigned)).update(bytes).digest();
  const observed = Buffer.from(frame.hmacSha256, "hex");
  if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) throw new Error("pipe-hmac-mismatch");
  return frame;
}

const gitStreamExpectationSchema = z.object({ channelId: id, requestId: id,
  nonce: z.string().regex(/^[a-f0-9]{64}$/u), repositoryPath: z.string().regex(/^\/(?:[A-Za-z0-9._~!$&'()+,;=:-]+\/)*[A-Za-z0-9._~!$&'()+,;=:-]+\.git$/u) }).strict();

export function validateGitStreamTranscript(records, expectation, key) {
  const expected = gitStreamExpectationSchema.parse(expectation);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("pipe-key-invalid");
  const next = { "materializer-to-broker": 1, "broker-to-materializer": 1 };
  let requestBytes = 0, responseBytes = 0;
  const requestHeads = new Map(), responseHeads = new Map(), requestBodyBytes = [0, 0], responseBodyBytes = [0, 0];
  const required = [
    "0:materializer-to-broker:open-request", "0:materializer-to-broker:end-request", "0:broker-to-materializer:open-response", "0:broker-to-materializer:end-response",
    "1:materializer-to-broker:open-request", "1:materializer-to-broker:end-request", "1:broker-to-materializer:open-response", "1:broker-to-materializer:end-response", "1:broker-to-materializer:terminal"
  ];
  let cursor = 0;
  for (const record of records) {
    if (record === null || typeof record !== "object" || Array.isArray(record)
      || Object.keys(record).sort().join(",") !== "payload,rawHeader") throw new Error("pipe-record-shape-invalid");
    if (!Buffer.isBuffer(record.payload)) throw new Error("pipe-payload-type-invalid");
    const payload = record.payload;
    const frame = admitPipeFrame(gitStreamFrameSchema, record.rawHeader, payload, key);
    if (frame.channelId !== expected.channelId || frame.requestId !== expected.requestId || frame.nonce !== expected.nonce) throw new Error("pipe-channel-binding-invalid");
    if (frame.sequence !== next[frame.direction]++) throw new Error("pipe-sequence-invalid");
    if (["end-request", "end-response", "terminal"].includes(frame.frameType) && frame.payloadBytes !== 0) throw new Error("pipe-empty-frame-has-payload");
    if (["request-body", "response-body"].includes(frame.frameType) && frame.payloadBytes === 0) throw new Error("pipe-body-frame-empty");
    if (frame.frameType === "open-request") {
      const head = admitGitOpenRequest(payload, expected.repositoryPath);
      if (head.requestOrdinal !== frame.requestOrdinal || requestHeads.has(frame.requestOrdinal)) throw new Error("pipe-request-head-mismatch");
      requestHeads.set(frame.requestOrdinal, head);
    }
    if (frame.frameType === "open-response") {
      const head = admitGitOpenResponse(payload);
      if (head.requestOrdinal !== frame.requestOrdinal || responseHeads.has(frame.requestOrdinal)) throw new Error("pipe-response-head-mismatch");
      responseHeads.set(frame.requestOrdinal, head);
    }
    if (frame.frameType === "request-body") requestBodyBytes[frame.requestOrdinal] += frame.payloadBytes;
    if (frame.frameType === "response-body") responseBodyBytes[frame.requestOrdinal] += frame.payloadBytes;
    requestBytes += frame.frameType === "request-body" ? frame.payloadBytes : 0;
    responseBytes += frame.frameType === "response-body" ? frame.payloadBytes : 0;
    const item = `${frame.requestOrdinal}:${frame.direction}:${frame.frameType}`;
    const bodyAllowed = (frame.frameType === "request-body" && frame.requestOrdinal === 1 && required[cursor]?.endsWith(":end-request") && required[cursor]?.startsWith(`${frame.requestOrdinal}:materializer-to-broker:`))
      || (frame.frameType === "response-body" && required[cursor]?.endsWith(":end-response") && required[cursor]?.startsWith(`${frame.requestOrdinal}:broker-to-materializer:`));
    if (!bodyAllowed && item !== required[cursor++]) throw new Error("pipe-terminal-pattern-invalid");
  }
  if (requestBytes > MAX_GIT_REQUEST_BYTES || responseBytes > MAX_GIT_RESPONSE_BYTES) throw new Error("pipe-aggregate-limit");
  if (cursor !== required.length) throw new Error("pipe-terminal-pattern-invalid");
  if (requestHeads.size !== 2 || responseHeads.size !== 2 || requestBodyBytes[0] !== 0
    || requestHeads.get(1).contentLength !== requestBodyBytes[1]
    || [...responseHeads].some(([ordinal, head]) => head.contentLength !== null && head.contentLength !== responseBodyBytes[ordinal])) throw new Error("pipe-head-body-length-mismatch");
  return Object.freeze({ requestBytes, responseBytes, terminal: true });
}

export const contracts = Object.freeze({ authorityBindingSchema, sourceSelectionSchema, materializationRequestSchema, workspaceCancelRequestSchema, workspaceReconciliationRequestSchema, workspaceManifestSchema,
  materializationReceiptSchema, uploadSessionCreateRequestSchema, uploadSessionCreateResponseSchema,
  uploadManifestSchema, uploadManifestRecordSchema, controlPipeFrameSchema, gitStreamFrameSchema,
  gitOpenRequestSchema, gitOpenResponseSchema });
