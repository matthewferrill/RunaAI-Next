import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const CAPABILITY_SET_VERSION = "m1-javascript/v1";
export const CAPABILITIES = Object.freeze({
  "project.inspect": { effectful: false },
  "project.preview-change": { effectful: false },
  "project.apply-change": { effectful: true },
  "project.run-tests": { effectful: true },
  "project.restore": { effectful: true },
});
export const PROFILES = Object.freeze(["read-only", "ask-every-time", "safe-autopilot"]);
export const CAPABILITY_ENVELOPE = Object.freeze({ maxFiles: 4, maxProjectBytes: 4000,
  paths: "flat-lowercase-javascript", testSelection: "registered-suite-only", maximumTestBundleBytes: 8000,
  wallClockMs: 2000, quickJsDeadlineMs: 1200, maximumOutputBytes: 16000,
  quickJsMemoryBytes: 16777216, processLimit: 1, stdin: "closed", network: "deny-all" });
export const CAPABILITY_SET_DIGEST = digest({ version: CAPABILITY_SET_VERSION,
  capabilities: CAPABILITIES, envelope: CAPABILITY_ENVELOPE });

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const file = z.string().regex(/^[a-z][a-z0-9_-]{0,47}\.js$/)
  .refine(value => !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])\.js$/i.test(value));
const content = z.string().max(4000).refine(value => Buffer.byteLength(value) <= 4000);
const contextSchema = z.object({ principalId: id, projectId: id, sessionId: id }).strict();
const taskSchema = z.object({ requestId: id, objective: z.string().min(1).max(8000) }).strict();
const grantSchema = z.object({ taskId: id, profile: z.enum(PROFILES),
  capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION).default(CAPABILITY_SET_VERSION),
  capabilityIds: z.array(z.enum(Object.keys(CAPABILITIES))).min(1).max(5).optional(),
  allowedPaths: z.array(file).min(1).max(4), allowedSuites: z.array(id).max(32).default([]),
  expiresAt: z.iso.datetime(), }).strict();
const proposalSchema = z.object({ taskId: id, grantId: id, grantRevision: z.number().int().positive(),
  requestId: id, capabilityId: z.enum(Object.keys(CAPABILITIES)), arguments: z.unknown() }).strict();
const argsSchemas = {
  "project.inspect": z.object({ path: file }).strict(),
  "project.preview-change": z.object({ path: file, content, expectedSha256: sha.nullable() }).strict(),
  "project.apply-change": z.object({ path: file, content, expectedSha256: sha.nullable() }).strict(),
  "project.run-tests": z.object({ suiteId: id }).strict(),
  // The adapter's targetReference is deliberately NOT a model- or browser-accepted argument.
  "project.restore": z.object({ receiptId: id }).strict(),
};
export const parseContext = input => parse(contextSchema, input);
export const parseTask = input => parse(taskSchema, input);
export const parseGrant = input => parse(grantSchema, input);
export function parseProposal(input) {
  const request = parse(proposalSchema, input);
  return { ...request, arguments: parse(argsSchemas[request.capabilityId], request.arguments) };
}
export const parseId = input => parse(id, input);
export const parseApproval = input => parse(z.object({ proposalId: id, proposalDigest: sha }).strict(), input);
export const parseProposalId = input => parse(z.object({ proposalId: id }).strict(), input);
export const parseTaskId = input => parse(z.object({ taskId: id }).strict(), input);
export const parseGrantId = input => parse(z.object({ grantId: id }).strict(), input);
export const parseProject = input => parse(z.object({ environmentId: id,
  files: z.record(file, content).refine(files => Object.keys(files).length >= 1 && Object.keys(files).length <= 4
    && Object.values(files).reduce((bytes, text) => bytes + Buffer.byteLength(text), 0) <= 4000),
}).strict(), input);

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw failure("m1-invalid-request");
  return result.data;
}
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
export function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function makeId(prefix) { return `${prefix}-${randomUUID()}`; }
export function failure(code) { return Object.assign(new Error(code), { code }); }
export function assert(condition, code) { if (!condition) throw failure(code); }
export function binding(context, environmentId) {
  return { participantId: context.principalId, projectId: context.projectId, environmentId };
}
export function proposalDigest(proposal) {
  const { status, approval, receiptId, errorCode, updatedAt, ...immutable } = proposal;
  delete immutable.proposalDigest;
  return digest(immutable);
}
export function grantDefinitionDigest(grant) {
  const { definitionDigest, ...definition } = grant;
  return digest(definition);
}
export function receiptDigest(receipt) {
  const { receiptDigest: ignored, replayed, ...evidence } = receipt;
  return digest(evidence);
}
export function requestKey(taskId, requestId) { return digest({ taskId, requestId }); }

export function evaluatePolicy(grant, capabilityId) {
  assert(grant.capabilitySetVersion === CAPABILITY_SET_VERSION
    && grant.capabilitySetDigest === CAPABILITY_SET_DIGEST, "m1-capability-version-mismatch");
  if (!grant.capabilityIds.includes(capabilityId)) return "denied";
  if (grant.profile === "read-only" && CAPABILITIES[capabilityId].effectful) return "denied";
  if (grant.profile === "ask-every-time" && CAPABILITIES[capabilityId].effectful) return "approval-required";
  return "automatic";
}

export function enforceArguments(grant, capabilityId, args, resolvedRestorePaths = []) {
  if ("path" in args) assert(grant.allowedPaths.includes(args.path), "m1-path-outside-grant");
  if (capabilityId === "project.run-tests") assert(grant.allowedSuites.includes(args.suiteId), "m1-suite-outside-grant");
  if (capabilityId === "project.restore") assert(resolvedRestorePaths.length > 0
    && resolvedRestorePaths.every(path => grant.allowedPaths.includes(path)), "m1-restore-outside-grant");
}
