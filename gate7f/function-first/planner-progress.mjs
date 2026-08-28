import { z } from "zod";
import { CAPABILITIES } from "./tasks/contracts.mjs";

const fail = () => Object.assign(new Error("m1-planner-progress-invalid"), { code: "m1-planner-progress-invalid" });
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive();
const receiptSchema = z.object({
  schemaVersion: z.literal("runa-m1-task-receipt/v1"), receiptId: id, receiptDigest: sha, proposalId: id,
  participantId: id, projectId: id, environmentId: id, taskId: id,
  capabilityId: z.enum(Object.keys(CAPABILITIES)),
  executionStatus: z.enum(["observed", "published", "ran", "not-run", "failed", "timed-out", "output-limited", "unavailable"]),
  effectKind: z.enum(["observed", "revision-published", "sandbox-tested"]),
  beforeRevision: revision, afterRevision: revision, beforeSha256: sha, afterSha256: sha,
  currentAtRecording: z.boolean(), recordedAt: z.iso.datetime(), output: z.record(z.string(), z.unknown()),
}).passthrough();
const snapshotSchema = z.object({
  projectRevision: revision.optional(), workspaceSha256: sha.optional(),
  files: z.array(z.object({
    path: z.string().regex(/^[a-z][a-z0-9_-]{0,47}\.js$/),
    content: z.string().max(4000).refine(value => Buffer.byteLength(value) <= 4000),
    sha256: sha, bytes: z.number().int().min(0).max(4000),
  }).strict()).max(4),
  omittedFileCount: z.number().int().min(0).max(4).optional(),
}).strict();
const testSchema = z.object({
  suiteId: id, suiteSha256: sha, workspaceSha256: sha,
  status: z.enum(["passed", "failed", "unavailable"]), passed: z.boolean(),
  executionReceipt: z.object({ status: z.enum(["executed", "failed", "timed-out", "output-limited", "unavailable"]) }).passthrough().optional(),
}).passthrough();

/**
 * A request-only projection of the service's verified, scope-filtered receipt list. The orchestrator
 * verifies the original receipt digest BEFORE dropping host-only reference fields. This function
 * does not re-attest that lossy projection, read model text as proof, or create execution authority.
 */
export function plannerProgress(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.hasOwn(input, "progress") || Object.hasOwn(input, "schemaVersion")
      || (input.repair !== undefined && typeof input.repair !== "boolean")) throw fail();
  const parsedSnapshot = snapshotSchema.safeParse(input.snapshot ?? { files: [] });
  const parsedReceipts = z.array(receiptSchema).max(128).safeParse(input.receipts ?? []);
  if (!parsedSnapshot.success || !parsedReceipts.success) throw fail();
  const snapshot = parsedSnapshot.data, receipts = parsedReceipts.data;
  const current = { projectRevision: snapshot.projectRevision ?? null, workspaceSha256: snapshot.workspaceSha256 ?? null };
  const seen = new Set(), proposals = new Set();
  const scope = receipts[0] && ["participantId", "projectId", "environmentId", "taskId"].map(key => receipts[0][key]);
  const observations = receipts.map(receipt => {
    if (seen.has(receipt.receiptId) || proposals.has(receipt.proposalId)
        || ["participantId", "projectId", "environmentId", "taskId"].some((key, index) => receipt[key] !== scope[index])) throw fail();
    seen.add(receipt.receiptId); proposals.add(receipt.proposalId);
    const mutation = ["project.apply-change", "project.restore"].includes(receipt.capabilityId);
    const isTest = receipt.capabilityId === "project.run-tests";
    if (receipt.afterRevision !== receipt.beforeRevision + Number(mutation)
        || (!mutation && receipt.beforeSha256 !== receipt.afterSha256)
        || receipt.effectKind !== (mutation ? "revision-published" : isTest ? "sandbox-tested" : "observed")
        || (!isTest && receipt.executionStatus !== (mutation ? "published" : "observed"))) throw fail();
    const observed = {
      receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest, proposalId: receipt.proposalId,
      capabilityId: receipt.capabilityId, beforeRevision: receipt.beforeRevision, afterRevision: receipt.afterRevision,
      beforeSha256: receipt.beforeSha256, afterSha256: receipt.afterSha256,
      matchesCurrentSnapshot: receipt.currentAtRecording && receipt.afterRevision === current.projectRevision && receipt.afterSha256 === current.workspaceSha256,
      recordedAt: receipt.recordedAt,
      outcome: mutation ? "published" : "observed", test: null,
    };
    if (isTest) {
      const parsed = testSchema.safeParse(receipt.output);
      if (!parsed.success) throw fail();
      const output = parsed.data, ran = receipt.executionStatus === "ran";
      if (output.workspaceSha256 !== receipt.afterSha256
          || (ran && (output.executionReceipt?.status !== "executed" || output.status === "unavailable"
            || output.passed !== (output.status === "passed")))
          || (!ran && (output.passed || output.executionReceipt?.status === "executed"))) throw fail();
      observed.outcome = ran ? (output.passed ? "test-passed" : "test-failed") : "test-not-completed";
      observed.test = { suiteId: output.suiteId, suiteSha256: output.suiteSha256, workspaceSha256: output.workspaceSha256 };
    }
    return observed;
  });
  // A later observation for the same sealed suite takes precedence; equal-time conflicting outcomes
  // are not a sound repair basis. Sorting a copy leaves the caller's durable receipt order untouched.
  const suites = new Map();
  for (const observed of [...observations].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (!observed.matchesCurrentSnapshot || !observed.test) continue;
    const key = `${observed.test.suiteId}:${observed.test.suiteSha256}`;
    const prior = suites.get(key);
    suites.set(key, prior?.recordedAt === observed.recordedAt && prior.outcome !== observed.outcome
      ? { ...observed, outcome: "test-not-completed" } : observed);
  }
  const currentFailedTests = [...suites.values()].filter(value => value.outcome === "test-failed").map(value => ({
    receiptId: value.receiptId, receiptDigest: value.receiptDigest, ...value.test,
  }));
  if (input.repair === true && currentFailedTests.length === 0) throw fail();
  return Object.freeze({ schemaVersion: "runaai-m1-planner-progress/v1", phase: input.repair === true ? "repair" : "initial",
    currentSnapshot: Object.freeze(current), observations: Object.freeze(observations.map(value => Object.freeze({
      ...value, test: value.test && Object.freeze(value.test),
    }))), currentFailedTests: Object.freeze(currentFailedTests.map(Object.freeze)) });
}
