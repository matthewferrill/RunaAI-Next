import { createHash } from "node:crypto";
import { z } from "zod";

export const CAPABILITY_SET_VERSION = "m1-s2b1-materialization-2026-09-03.1";

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,7})?Z$/u);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveCount = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const relativePath = z.string().min(1).max(1024).refine(value => {
  if (Buffer.byteLength(value, "utf8") > 1024 || value.includes("\\") || value.startsWith("/") || value.endsWith("/")) return false;
  const segments = value.split("/");
  return value === value.normalize("NFC") && segments.length <= 64 && segments.every(segment =>
    segment.length > 0 && segment !== "." && segment !== ".." && Buffer.byteLength(segment, "utf8") <= 255 &&
    !/[\u0000-\u001f<>:"|?*]/u.test(segment) && !/[. ]$/u.test(segment) && !reservedWindowsName.test(segment) &&
    segment.toLocaleLowerCase("en-US") !== ".git" && !segment.toLocaleLowerCase("en-US").startsWith(".git:")
  );
}, "invalid normalized relative path");

const windowsPathKey = value => value.normalize("NFC").toLocaleLowerCase("en-US");

export const sourceLifecycle = z.enum([
  "known", "configured", "connected", "tested", "enabled", "disconnected", "expired",
  "revoked", "failed", "cleanup-pending", "unknown"
]);

export const workspaceLifecycle = z.enum([
  "absent", "intent-recorded", "staging", "published-pending-db", "ready", "expired",
  "cancelled", "failed", "cleanup-pending", "unknown", "removed"
]);

const sourceBase = {
  schemaVersion: z.literal("runa-workspace-source-selection/v1"),
  sourceId: id,
  projectId: id,
  participantId: id,
  environmentId: id,
  displayName: z.string().min(1).max(120),
  lifecycle: sourceLifecycle,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  revision: positiveCount,
  createdAt: utc,
  updatedAt: utc,
  revokedAt: utc.nullable()
};

export const sourceSelectionSchema = z.discriminatedUnion("sourceKind", [
  z.object({
    ...sourceBase,
    sourceKind: z.literal("git-public-https"),
    repositoryHttpsUrl: z.string().url().max(2048),
    requestedRef: z.string().min(1).max(255),
    endpointPolicyId: id,
    uploadSessionId: z.null()
  }).strict(),
  z.object({
    ...sourceBase,
    sourceKind: z.literal("browser-folder-snapshot"),
    repositoryHttpsUrl: z.null(),
    requestedRef: z.null(),
    endpointPolicyId: z.null(),
    uploadSessionId: id.nullable()
  }).strict()
]).superRefine((value, context) => {
  if (value.revokedAt !== null && value.lifecycle !== "revoked") context.addIssue({ code: "custom", message: "revokedAt requires revoked lifecycle" });
  if (value.lifecycle === "revoked" && value.revokedAt === null) context.addIssue({ code: "custom", message: "revoked lifecycle requires revokedAt" });
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) context.addIssue({ code: "custom", message: "updatedAt precedes createdAt" });
  if (value.sourceKind === "git-public-https") {
    const url = new URL(value.repositoryHttpsUrl);
    if (url.protocol !== "https:" || (url.port !== "" && url.port !== "443") || url.username !== "" || url.password !== "" || url.hash !== "" || url.search !== "" || url.hostname !== url.hostname.toLowerCase()) context.addIssue({ code: "custom", message: "repository URL must be canonical HTTPS port 443 with no userinfo/query/fragment" });
  }
});

export const materializationRequestSchema = z.object({
  schemaVersion: z.literal("runa-workspace-materialization-request/v1"),
  requestId: id,
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceId: id,
  taskId: id,
  bindingDigest: digest,
  expectedSourceRevision: positiveCount,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: digest,
  requestedRef: z.string().min(1).max(255).nullable(),
  uploadSessionId: id.nullable(),
  uploadManifestDigest: digest.nullable(),
  limitsProfileId: z.literal("m1-s2b1-materialization-limits/v1"),
  deadlineAt: utc,
  createdAt: utc
}).strict().superRefine((value, context) => {
  const git = value.requestedRef !== null;
  const snapshot = value.uploadSessionId !== null || value.uploadManifestDigest !== null;
  if (git === snapshot) context.addIssue({ code: "custom", message: "exactly one Git or snapshot input is required" });
  if ((value.uploadSessionId === null) !== (value.uploadManifestDigest === null)) context.addIssue({ code: "custom", message: "snapshot session and manifest digest must both be present" });
  if (Date.parse(value.deadlineAt) <= Date.parse(value.createdAt)) context.addIssue({ code: "custom", message: "deadlineAt must follow createdAt" });
});

export const manifestEntrySchema = z.object({
  path: relativePath,
  bytes: count.max(4 * 1024 * 1024),
  sha256: digest,
  mediaClass: z.enum(["utf8-text", "binary", "excluded-marker"])
}).strict();

export const workspaceManifestSchema = z.object({
  schemaVersion: z.literal("runa-workspace-manifest/v1"),
  workspaceId: id,
  sourceId: id,
  bindingDigest: digest,
  sourceKind: z.enum(["git-public-https", "browser-folder-snapshot"]),
  nativeVersionKind: z.enum(["git-commit-sha1", "git-commit-sha256", "content-snapshot-sha256"]),
  nativeVersion: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  entries: z.array(manifestEntrySchema).max(2000),
  fileSetDigest: digest,
  excludedCount: count,
  rejectedCount: count,
  complete: z.boolean(),
  adapterReleaseSha256: digest,
  runtimeReleaseSha256: digest,
  brokerReleaseSha256: digest,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: digest,
  lifecycle: workspaceLifecycle,
  createdAt: utc,
  expiresAt: utc
}).strict().superRefine((value, context) => {
  const total = value.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total > 64 * 1024 * 1024) context.addIssue({ code: "custom", message: "total bytes exceeds profile" });
  const paths = value.entries.map(entry => entry.path);
  const keys = paths.map(windowsPathKey);
  if (keys.some((key, index) => index > 0 && keys[index - 1] >= key)) context.addIssue({ code: "custom", message: "entries must be strictly ordered and unique under Windows identity" });
  if (value.sourceKind === "git-public-https" && !value.nativeVersionKind.startsWith("git-commit-")) context.addIssue({ code: "custom", message: "Git source requires Git native version" });
  if (value.sourceKind === "browser-folder-snapshot" && value.nativeVersionKind !== "content-snapshot-sha256") context.addIssue({ code: "custom", message: "snapshot source requires snapshot native version" });
  if ((value.nativeVersionKind.endsWith("sha1") && value.nativeVersion.length !== 40) || (!value.nativeVersionKind.endsWith("sha1") && value.nativeVersion.length !== 64)) context.addIssue({ code: "custom", message: "native version length mismatch" });
  if (value.complete !== (value.rejectedCount === 0)) context.addIssue({ code: "custom", message: "complete requires zero rejected entries" });
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) context.addIssue({ code: "custom", message: "expiresAt must follow createdAt" });
});

const optionalDigest = digest.nullable();
export const materializationReceiptSchema = z.object({
  schemaVersion: z.literal("runa-workspace-materialization-receipt/v1"),
  requestId: id,
  sourceId: id,
  sourceKind: z.enum(["git-public-https", "browser-folder-snapshot"]),
  workspaceId: id.nullable(),
  taskId: id,
  bindingDigest: digest,
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: digest,
  outcome: z.enum(["ready", "rejected", "failed", "timed-out", "cancelled", "unknown", "cleanup-pending"]),
  nativeVersion: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u).nullable(),
  beforeManifestDigest: optionalDigest,
  stagingManifestDigest: optionalDigest,
  finalManifestDigest: optionalDigest,
  networkState: z.enum(["not-required", "denied", "bounded-complete", "indeterminate"]),
  processState: z.enum(["not-started", "stopped", "stop-unconfirmed"]),
  publicationState: z.enum(["not-started", "staging", "published-unacknowledged", "published-acknowledged", "indeterminate"]),
  databaseState: z.enum(["intent-recorded", "ready-recorded", "terminal-recorded", "indeterminate"]),
  cleanupState: z.enum(["not-required", "complete", "pending", "indeterminate"]),
  filesObserved: count.max(2000),
  bytesObserved: count.max(64 * 1024 * 1024),
  durationMs: count.max(150000),
  limitCode: z.enum(["none", "files", "total-bytes", "file-bytes", "path", "time", "output", "concurrency"]),
  errorCode: z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/u).nullable(),
  retryableAfterReconciliation: z.boolean(),
  workerReleaseSha256: digest,
  startedAt: utc,
  finishedAt: utc,
  credentialsPresent: z.literal(false),
  privateValuesIncluded: z.literal(false),
  modelInvoked: z.literal(false),
  effects: z.tuple([])
}).strict().superRefine((value, context) => {
  if (Date.parse(value.finishedAt) < Date.parse(value.startedAt)) context.addIssue({ code: "custom", message: "finishedAt precedes startedAt" });
  if (value.outcome === "ready") {
    if (value.workspaceId === null || value.finalManifestDigest === null || value.publicationState !== "published-acknowledged" || value.databaseState !== "ready-recorded" || value.cleanupState !== "complete" || value.processState !== "stopped" || value.errorCode !== null || value.retryableAfterReconciliation) context.addIssue({ code: "custom", message: "ready receipt invariants failed" });
  } else if (value.outcome === "unknown") {
    if (value.errorCode === null || value.retryableAfterReconciliation || (value.processState !== "stop-unconfirmed" && value.publicationState !== "indeterminate" && value.databaseState !== "indeterminate" && value.cleanupState !== "indeterminate")) context.addIssue({ code: "custom", message: "unknown requires an indeterminate state, error, and no retry" });
  } else if (value.outcome === "cleanup-pending") {
    if (value.errorCode === null || value.retryableAfterReconciliation || value.cleanupState !== "pending") context.addIssue({ code: "custom", message: "cleanup-pending requires pending cleanup, error, and no retry" });
  } else {
    if (value.errorCode === null || !["not-started", "staging"].includes(value.publicationState) || value.databaseState !== "terminal-recorded" || !["not-started", "stopped"].includes(value.processState) || !["not-required", "complete"].includes(value.cleanupState)) context.addIssue({ code: "custom", message: "determinate non-ready outcome invariants failed" });
  }
  if (value.processState === "stop-unconfirmed" && value.outcome !== "unknown") context.addIssue({ code: "custom", message: "unconfirmed stop requires unknown outcome" });
  if ((value.sourceKind === "git-public-https" && value.networkState === "not-required") || (value.sourceKind === "browser-folder-snapshot" && value.networkState !== "not-required")) context.addIssue({ code: "custom", message: "network state/source kind mismatch" });
});

export const uploadManifestSchema = z.object({
  schemaVersion: z.literal("runa-browser-folder-upload-manifest/v1"),
  uploadSessionId: id,
  sourceId: id,
  bindingDigest: digest,
  entries: z.array(z.object({ path: relativePath, bytes: count.max(4 * 1024 * 1024), sha256: digest, chunks: positiveCount.max(4) }).strict()).min(1).max(2000),
  excludedPaths: z.array(relativePath).max(2000),
  totalBytes: count.max(64 * 1024 * 1024),
  manifestDigest: digest,
  expiresAt: utc
}).strict().superRefine((value, context) => {
  const paths = value.entries.map(entry => entry.path);
  const keys = paths.map(windowsPathKey);
  if (keys.some((key, index) => index > 0 && keys[index - 1] >= key)) context.addIssue({ code: "custom", message: "entries must be strictly ordered and unique under Windows identity" });
  if (value.entries.reduce((sum, entry) => sum + entry.bytes, 0) !== value.totalBytes) context.addIssue({ code: "custom", message: "totalBytes mismatch" });
});

export const pipeFrameSchema = z.object({
  schemaVersion: z.literal("runa-materialization-pipe-frame/v1"),
  sequence: z.literal(1),
  requestId: id,
  nonce: z.string().regex(/^[a-f0-9]{64}$/u),
  payloadSha256: digest,
  payloadBytes: positiveCount.max(1024 * 1024),
  hmacSha256: digest
}).strict();

export function canonicalSha256(value) {
  const canonical = input => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === "object") return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])]));
    return input;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const contracts = Object.freeze({
  sourceSelectionSchema,
  materializationRequestSchema,
  workspaceManifestSchema,
  materializationReceiptSchema,
  uploadManifestSchema,
  pipeFrameSchema
});
