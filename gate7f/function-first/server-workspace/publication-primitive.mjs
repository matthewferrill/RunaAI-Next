import { z } from "zod";
import {
  admitWorkspaceManifest,
  canonicalSha256,
  materializationEffectClaimSchema,
  nativeOwnedResourceProjectionSchema,
  parseCanonicalWire,
  rawHandleOwnershipReceiptSchema,
  workspaceManifestSchema,
  workspaceLifecycle
} from "./materialization-contracts.mjs";

const fail = code => Object.assign(new Error(code), { code });
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const opaqueName = z.string().regex(/^[a-z][a-z0-9_-]{31,127}$/u).refine(value =>
  value !== "." && value !== ".." && !value.includes("--") && !/[. ]$/u.test(value),
"publication name must be one opaque Windows-safe segment");
const nativeIdentitySchema = z.object({
  volumeSerial: z.string().regex(/^[a-f0-9]{8}$/u),
  fileId: z.string().regex(/^[a-f0-9]{16}$/u)
}).strict();
const nativeHandle = z.custom(value => value !== undefined && value !== null,
  "native handle must be present");
const siblingObservationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("absent") }).strict(),
  z.object({ state: z.literal("indeterminate") }).strict(),
  z.object({ state: z.literal("present"), identity: nativeIdentitySchema, handle: nativeHandle }).strict()
]);

const authorityFileSchema = z.object({
  path: z.string().min(1).max(1024),
  bytes: z.number().int().min(0).max(4_194_304),
  sha256: digest,
  identity: nativeIdentitySchema
}).strict();

export const publicationAuthorityManifestSchema = z.object({
  schemaVersion: z.literal("runa-workspace-publication-authority-manifest/v1"),
  workspaceId: id,
  workspaceManifestDigest: digest,
  parentIdentity: nativeIdentitySchema,
  staging: z.object({ name: opaqueName, identity: nativeIdentitySchema }).strict(),
  final: z.object({ name: opaqueName, expectedIdentity: nativeIdentitySchema }).strict(),
  files: z.array(authorityFileSchema).max(2000)
}).strict().superRefine((value, context) => {
  if (value.staging.name === value.final.name) {
    context.addIssue({ code: "custom", message: "staging and final names must differ" });
  }
  if (!sameIdentity(value.staging.identity, value.final.expectedIdentity)) {
    context.addIssue({ code: "custom", message: "rename must preserve the staged root identity" });
  }
  const keys = value.files.map(file => file.path.toLowerCase());
  if (keys.some((key, index) => index > 0 && keys[index - 1] >= key)) {
    context.addIssue({ code: "custom", message: "authority files must be strictly ordered and unique" });
  }
});

export const publicationStateSnapshotSchema = z.object({
  schemaVersion: z.literal("runa-workspace-publication-state/v1"),
  workspaceId: id,
  bindingDigest: digest,
  lifecycle: workspaceLifecycle.exclude(["absent"]),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  authorityManifestDigest: digest,
  parentIdentity: nativeIdentitySchema,
  stagingName: opaqueName,
  finalName: opaqueName
}).strict();

/** Durable projection returned by PostgreSQL after the publication effect claim is won. */
export const durablePublicationAuthoritySchema = z.object({
  schemaVersion: z.literal("runa-workspace-durable-publication-authority/v1"),
  operationId: id,
  workspaceId: id,
  workspaceRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  operationAuthorityDigest: digest,
  requestDigest: digest,
  bindingDigest: digest,
  authorityManifest: publicationAuthorityManifestSchema,
  authorityManifestDigest: digest,
  parentResourceId: id,
  ingressRootResourceId: id,
  stagingRootResourceId: id,
  publicationClaim: materializationEffectClaimSchema.nullable(),
  workspaceLifecycle: z.enum(["staging", "published-pending-db", "ready", "failed", "cancelled", "unknown", "cleanup-pending"]),
  state: z.enum(["staging-authorized", "publication-claimed", "published-observed", "unknown"]),
}).strict().superRefine((value, context) => {
  const claimRequired = value.state === "publication-claimed" || value.state === "published-observed";
  const claimForbidden = value.state === "staging-authorized";
  if ((claimRequired && value.publicationClaim === null)
      || (claimForbidden && value.publicationClaim !== null)
      || (value.publicationClaim !== null && (value.publicationClaim.operationId !== value.operationId
        || value.publicationClaim.effect !== "publication"
        || (value.state === "publication-claimed" && value.publicationClaim.state !== "claimed")
        || (value.state === "published-observed" && value.publicationClaim.state !== "observed")))
      || value.authorityManifest.workspaceId !== value.workspaceId
      || canonicalSha256(value.authorityManifest) !== value.authorityManifestDigest) {
    context.addIssue({ code: "custom", message: "durable publication authority binding mismatch" });
  }
});

const ownedSiblingObservationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("absent") }).strict(),
  z.object({ state: z.literal("indeterminate") }).strict(),
  z.object({ state: z.literal("present"), identity: nativeIdentitySchema,
    internalResourceId: id, ownershipVerified: z.literal(true) }).strict(),
]);

const publicationOwnershipBatchSchema = z.object({
  schemaVersion: z.literal("runa-publication-inspection-owned-batch/v1"),
  operationId: id,
  phase: z.literal("publication-inspection"),
  ownedResources: z.array(nativeOwnedResourceProjectionSchema).min(1).max(256),
  ownedResourcesDigest: digest,
  ownershipReceipt: rawHandleOwnershipReceiptSchema,
}).strict();
const ownedNativeResultEnvelopeSchema = z.object({
  schemaVersion: z.literal("runa-publication-inspection-owned-result/v1"),
  operationId: id,
  result: z.unknown(),
  ownershipBatches: z.array(publicationOwnershipBatchSchema).max(9),
}).strict();

const requiredOwnedHostMethods = ["observeOwnedSibling", "inspectOwnedManifestTree", "flushOwnedFile",
  "flushOwnedDirectoryMetadata", "flushAuthorityManifest", "moveOwnedSiblingNoReplaceWriteThrough",
  "closeOwnedResource"];

const terminalCleanupStates = new Set(["cancelled", "failed", "expired", "cleanup-pending"]);
const requiredHostMethods = ["openParentNoFollow", "observeSiblingNoFollow", "inspectManifestTree",
  "flushFile", "flushDirectoryMetadata", "flushAuthorityManifest", "moveSiblingNoReplaceWriteThrough",
  "closeHandle", "retainUnclosedHandle"];

function sameIdentity(left, right) {
  return left?.volumeSerial === right?.volumeSerial && left?.fileId === right?.fileId;
}

function freeze(value) {
  if (value !== null && typeof value === "object" && Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = freeze(value[key]);
    return Object.freeze(value);
  }
  return value;
}

function proposal(classification, proposedAction, reason, extra = {}) {
  return freeze({
    schemaVersion: "runa-workspace-publication-proposal/v1",
    classification,
    proposedAction,
    reason,
    databaseMutationPerformed: false,
    receiptAuthored: false,
    filesystemMutationAttempted: false,
    filesystemMutationConfirmed: false,
    deletionAuthorized: false,
    ...extra
  });
}

function requireHost(host) {
  if (!host || requiredHostMethods.some(method => typeof host[method] !== "function")) {
    throw fail("publication-host-contract-invalid");
  }
}

function acquireReturnedHandle(value, handles) {
  let handle;
  try { handle = value?.handle; } catch {
    return { accessible: false, present: false, distinct: false, handle: undefined };
  }
  if (handle === undefined || handle === null) {
    return { accessible: true, present: false, distinct: false, handle };
  }
  const distinct = !handles.includes(handle);
  if (distinct) handles.push(handle);
  return { accessible: true, present: true, distinct, handle };
}

function ownInspectionHandles(inspected, handles) {
  let files;
  try { files = inspected?.files; } catch {
    return { files: null, fileHandles: [], valid: false };
  }
  if (!Array.isArray(files)) return { files: null, fileHandles: [], valid: false };
  const fileHandles = [];
  let valid = true;
  for (const file of files) {
    const acquired = acquireReturnedHandle(file, handles);
    fileHandles.push(acquired.present ? acquired.handle : null);
    if (!acquired.accessible || !acquired.present || !acquired.distinct) valid = false;
  }
  return { files, fileHandles, valid };
}

function admitInputs({ bindingRecord, workspaceManifestRaw, authorityManifestRaw,
  expectedAuthorityManifestDigest, databaseSnapshot }) {
  if (!Buffer.isBuffer(workspaceManifestRaw) && typeof workspaceManifestRaw !== "string") {
    throw fail("publication-workspace-manifest-wire-invalid");
  }
  if (!Buffer.isBuffer(authorityManifestRaw) && typeof authorityManifestRaw !== "string") {
    throw fail("publication-authority-manifest-wire-invalid");
  }
  const workspaceManifest = admitWorkspaceManifest(workspaceManifestRaw, bindingRecord);
  const authorityManifest = parseCanonicalWire(publicationAuthorityManifestSchema, authorityManifestRaw, 524_288);
  const state = publicationStateSnapshotSchema.parse(databaseSnapshot);
  const authorityManifestDigest = canonicalSha256(authorityManifest);
  if (authorityManifestDigest !== expectedAuthorityManifestDigest
      || authorityManifestDigest !== state.authorityManifestDigest) {
    throw fail("publication-authority-manifest-digest-mismatch");
  }
  if (authorityManifest.workspaceManifestDigest !== canonicalSha256(workspaceManifest)) {
    throw fail("publication-workspace-manifest-digest-mismatch");
  }
  if (workspaceManifest.workspaceId !== authorityManifest.workspaceId
      || workspaceManifest.workspaceId !== state.workspaceId
      || workspaceManifest.bindingDigest !== state.bindingDigest
      || !sameIdentity(authorityManifest.parentIdentity, state.parentIdentity)
      || authorityManifest.staging.name !== state.stagingName
      || authorityManifest.final.name !== state.finalName) {
    throw fail("publication-state-manifest-binding-mismatch");
  }
  if (!workspaceManifest.complete || workspaceManifest.rejectedCount !== 0) {
    throw fail("publication-incomplete-manifest-denied");
  }
  if (authorityManifest.files.length !== workspaceManifest.entries.length
      || authorityManifest.files.some((file, index) => file.path !== workspaceManifest.entries[index].path
        || file.bytes !== workspaceManifest.entries[index].bytes
        || file.sha256 !== workspaceManifest.entries[index].sha256)) {
    throw fail("publication-authority-file-set-mismatch");
  }
  return { workspaceManifest, authorityManifest, authorityManifestDigest, state };
}

async function closeOwnedHandles(host, handles) {
  const unclosed = [];
  for (const handle of [...handles].reverse()) {
    try { await host.closeHandle({ handle }); } catch { unclosed.push(handle); }
  }
  let retentionFailed = false;
  for (const handle of unclosed) {
    try {
      if (await host.retainUnclosedHandle({ handle, reason: "close-failed" }) !== true) retentionFailed = true;
    } catch { retentionFailed = true; }
  }
  if (retentionFailed) throw fail("publication-handle-retention-failed");
}

async function openProtectedParent(host, expectedIdentity, handles) {
  const opened = await host.openParentNoFollow({ expectedIdentity });
  const acquired = acquireReturnedHandle(opened, handles);
  let valid = false;
  try {
    valid = acquired.accessible && acquired.present && acquired.distinct && opened.filesystem === "NTFS"
      && sameIdentity(opened.identity, expectedIdentity);
  } catch { valid = false; }
  if (!valid) {
    throw fail("publication-parent-identity-invalid");
  }
  return acquired.handle;
}

async function inspectCandidate(host, { parentHandle, descriptor, workspaceManifest, authorityManifest,
  handles, flush = false }) {
  let observed;
  try {
    observed = await host.observeSiblingNoFollow({ parentHandle, name: descriptor.name });
  } catch {
    return freeze({ state: "indeterminate", treeVerified: false });
  }
  const acquired = acquireReturnedHandle(observed, handles);
  if (!acquired.accessible) return freeze({ state: "indeterminate", treeVerified: false });
  let candidate, rawKeys;
  try {
    const state = observed?.state;
    rawKeys = Object.keys(observed).sort().join();
    candidate = state === "present"
      ? { state, identity: observed.identity, handle: acquired.handle }
      : { state };
  } catch {
    return freeze({ state: "indeterminate", treeVerified: false });
  }
  let parsedObservation;
  try { parsedObservation = siblingObservationSchema.safeParse(candidate); } catch {
    return freeze({ state: "indeterminate", treeVerified: false });
  }
  if (!parsedObservation.success) {
    return freeze({ state: "indeterminate", treeVerified: false });
  }
  observed = parsedObservation.data;
  const expectedKeys = observed.state === "present" ? "handle,identity,state" : "state";
  if (rawKeys !== expectedKeys || (observed.state === "present" && (!acquired.present || !acquired.distinct))
      || (observed.state !== "present" && acquired.present)) {
    return freeze({ state: "indeterminate", treeVerified: false });
  }
  if (observed.state !== "present") return freeze({ state: observed.state, treeVerified: false });
  const expectedIdentity = descriptor.identity ?? descriptor.expectedIdentity;
  const state = sameIdentity(observed.identity, expectedIdentity) ? "exact" : "mismatch";
  if (state !== "exact") return freeze({ state, treeVerified: false });
  let inspected;
  try {
    inspected = await host.inspectManifestTree({ rootHandle: observed.handle, noFollow: true,
      requireSingleLink: true, rejectAdditionalEntries: true,
      expectedEntries: authorityManifest.files.map(file => freeze({ ...file })) });
  } catch {
    return freeze({ state: "exact", treeVerified: false });
  }
  const ownedInspection = ownInspectionHandles(inspected, handles);
  const expectedFiles = authorityManifest.files;
  let additionalEntries, reparseEntries, fileSetDigestValue;
  try {
    additionalEntries = inspected?.additionalEntries;
    reparseEntries = inspected?.reparseEntries;
    fileSetDigestValue = inspected?.fileSetDigest;
  } catch {
    return freeze({ state: "exact", treeVerified: false });
  }
  if (!ownedInspection.valid || ownedInspection.files.length !== expectedFiles.length
      || !Array.isArray(additionalEntries) || additionalEntries.length !== 0
      || !Array.isArray(reparseEntries) || reparseEntries.length !== 0) {
    return freeze({ state: "exact", treeVerified: false });
  }
  try {
    for (let index = 0; index < expectedFiles.length; index += 1) {
      const actual = ownedInspection.files[index], expected = expectedFiles[index];
      if (!actual || actual.path !== expected.path || actual.bytes !== expected.bytes
          || actual.sha256 !== expected.sha256 || actual.linkCount !== 1
          || !sameIdentity(actual.identity, expected.identity)) {
        return freeze({ state: "exact", treeVerified: false });
      }
    }
  } catch {
    return freeze({ state: "exact", treeVerified: false });
  }
  if (fileSetDigestValue !== workspaceManifest.fileSetDigest) {
    return freeze({ state: "exact", treeVerified: false });
  }
  if (flush) {
    for (let index = 0; index < ownedInspection.files.length; index += 1) {
      await host.flushFile({ fileHandle: ownedInspection.fileHandles[index], path: ownedInspection.files[index].path });
    }
    await host.flushDirectoryMetadata({ rootHandle: observed.handle, order: "children-before-root" });
  }
  return freeze({ state: "exact", treeVerified: true });
}

export function classifyPublicationRelationship({ databaseState, staging, final }) {
  if (databaseState === "no-intent") {
    return staging.state === "absent" && final.state === "absent"
      ? proposal("absent", "none", "no-intent-and-no-candidate")
      : proposal("quarantine", "operator-review", "candidate-without-durable-intent");
  }
  const stagingExact = staging.state === "exact" && staging.treeVerified === true;
  const finalExact = final.state === "exact" && final.treeVerified === true;
  if (["intent-recorded", "staging"].includes(databaseState)) {
    if (stagingExact && final.state === "absent") {
      return proposal("owned-staging", "stop-verify-remove-and-record-terminal",
        "exact-staging-and-final-absent", { deletionAuthorized: false });
    }
    return proposal("unknown", "record-unknown", ["exact", "mismatch"].includes(final.state)
      ? "publication-name-conflict" : "prepublication-identity-indeterminate", { deletionAuthorized: false });
  }
  if (databaseState === "published-pending-db") {
    if (finalExact && staging.state === "absent") {
      return proposal("published-exact", "complete-ready-cas", "exact-final-and-staging-absent");
    }
    return proposal("unknown", "record-unknown", final.state === "absent" && stagingExact
      ? "published-state-with-unpublished-staging" : "published-filesystem-relationship-mismatch",
    { deletionAuthorized: false });
  }
  if (databaseState === "ready") {
    return finalExact && staging.state === "absent"
      ? proposal("ready-exact", "preserve-and-serve", "exact-final-and-staging-absent")
      : proposal("unknown", "revoke-reads-and-record-unknown", "ready-filesystem-mismatch",
        { deletionAuthorized: false });
  }
  if (terminalCleanupStates.has(databaseState)) {
    if (staging.state === "absent" && final.state === "absent") {
      return proposal("removed", "record-removed", "owned-candidates-proven-absent", { deletionAuthorized: false });
    }
    if ((stagingExact && final.state === "absent") || (finalExact && staging.state === "absent")) {
      return proposal("owned-terminal-artifact", "remove-exact-identity-then-record-removed",
        "one-exact-owned-candidate", { deletionAuthorized: false,
          proposedRemovalTarget: stagingExact ? "staging" : "final" });
    }
    return proposal("retain", "retain-and-escalate", "terminal-artifact-identity-mismatch",
      { deletionAuthorized: false });
  }
  return proposal("unknown", "record-unknown", "database-state-not-reconcilable", { deletionAuthorized: false });
}

export async function reconcileWorkspacePublication(input, host) {
  requireHost(host);
  const admitted = admitInputs(input);
  const handles = [];
  try {
    const parentHandle = await openProtectedParent(host, admitted.authorityManifest.parentIdentity, handles);
    const staging = await inspectCandidate(host, { parentHandle,
      descriptor: admitted.authorityManifest.staging, ...admitted, handles });
    const final = await inspectCandidate(host, { parentHandle,
      descriptor: admitted.authorityManifest.final, ...admitted, handles });
    return classifyPublicationRelationship({ databaseState: admitted.state.lifecycle, staging, final });
  } finally {
    await closeOwnedHandles(host, handles);
  }
}

export async function publishWorkspaceNoReplace(input, host) {
  requireHost(host);
  const admitted = admitInputs(input);
  if (admitted.state.lifecycle !== "staging" || admitted.workspaceManifest.lifecycle !== "staging") {
    throw fail("publication-lifecycle-not-staging");
  }
  const handles = [];
  let moveAttempted = false;
  try {
    const parentHandle = await openProtectedParent(host, admitted.authorityManifest.parentIdentity, handles);
    const staging = await inspectCandidate(host, { parentHandle,
      descriptor: admitted.authorityManifest.staging, ...admitted, handles, flush: true });
    const finalBefore = await inspectCandidate(host, { parentHandle,
      descriptor: admitted.authorityManifest.final, ...admitted, handles });
    if (!(staging.state === "exact" && staging.treeVerified) || finalBefore.state !== "absent") {
      return classifyPublicationRelationship({ databaseState: "staging", staging, final: finalBefore });
    }
    await host.flushAuthorityManifest({ authorityManifestDigest: admitted.authorityManifestDigest });
    moveAttempted = true;
    try {
      await host.moveSiblingNoReplaceWriteThrough({ parentHandle,
        stagingName: admitted.authorityManifest.staging.name,
        finalName: admitted.authorityManifest.final.name,
        expectedStagingIdentity: admitted.authorityManifest.staging.identity,
        replaceExisting: false,
        writeThrough: true });
    } catch { /* The effect may be indeterminate. Observe once; never replay it. */ }
    const stagingAfter = await inspectCandidate(host, { parentHandle,
      descriptor: admitted.authorityManifest.staging, ...admitted, handles });
    const finalAfter = await inspectCandidate(host, { parentHandle,
      descriptor: admitted.authorityManifest.final, ...admitted, handles });
    if (stagingAfter.state === "absent" && finalAfter.state === "exact" && finalAfter.treeVerified) {
      return proposal("published-verified", "record-published-pending-db",
        "non-replacing-write-through-move-reopened-and-verified", {
          filesystemMutationAttempted: true,
          filesystemMutationConfirmed: true,
          databaseTransitionProposal: freeze({ from: "staging", to: "published-pending-db",
            expectedRevision: admitted.state.revision })
        });
    }
    const classified = classifyPublicationRelationship({ databaseState: "staging",
      staging: stagingAfter, final: finalAfter });
    if (classified.classification === "owned-staging") {
      return freeze({ ...classified, filesystemMutationAttempted: moveAttempted,
        filesystemMutationConfirmed: false });
    }
    return proposal("unknown", "record-unknown", "publication-effect-indeterminate", {
      filesystemMutationAttempted: moveAttempted,
      filesystemMutationConfirmed: false,
      deletionAuthorized: false });
  } finally {
    await closeOwnedHandles(host, handles);
  }
}

export function authoritativeFinalWorkspaceManifestDigest(rawManifest) {
  const stagingManifest = workspaceManifestSchema.parse(rawManifest);
  if (stagingManifest.lifecycle !== "staging") throw fail("publication-final-digest-source-not-staging");
  return canonicalSha256(workspaceManifestSchema.parse({ ...stagingManifest, lifecycle: "ready" }));
}

function requireOwnedHost(host) {
  if (!host || requiredOwnedHostMethods.some(method => typeof host[method] !== "function")) {
    throw fail("publication-owned-host-contract-invalid");
  }
}

function requireOwnershipVerifier(value, operationId) {
  if (!value || value.operationId !== operationId || typeof value.verifyOwnershipReceipt !== "function") {
    throw fail("publication-ownership-verifier-invalid");
  }
  return value;
}

function containsRawHandle(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || /raw.*handle|handle(?:hex|value|number|pointer)$/iu.test(key)) return true;
    if (containsRawHandle(value[key], seen)) return true;
  }
  return false;
}

function collectReturnedResourceIds(value, found = new Set(), seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return found;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    const candidate = value[key];
    if (key === "internalResourceId" && id.safeParse(candidate).success) found.add(candidate);
    collectReturnedResourceIds(candidate, found, seen);
  }
  return found;
}

async function admitOwnedNativeResult(raw, { operationId, ownership, openedResources, openedBatchIds }) {
  const priorResources = new Set(openedResources);
  const returnedResourceIds = collectReturnedResourceIds(raw);
  for (const resourceId of returnedResourceIds) openedResources.add(resourceId);
  if (containsRawHandle(raw)) throw fail("publication-native-result-exposes-raw-handle");
  const envelope = ownedNativeResultEnvelopeSchema.parse(raw);
  if (envelope.operationId !== operationId) throw fail("publication-ownership-operation-mismatch");
  const resultResourceIds = collectReturnedResourceIds(envelope.result);
  const ownedResources = envelope.ownershipBatches.flatMap(batch => batch.ownedResources);
  const ownedResourceIds = ownedResources.map(resource => resource.internalResourceId);
  if (new Set(ownedResourceIds).size !== ownedResourceIds.length
      || ownedResourceIds.some(resourceId => priorResources.has(resourceId))
      || canonicalSha256([...resultResourceIds].sort()) !== canonicalSha256([...ownedResourceIds].sort())) {
    throw fail("publication-ownership-resource-coverage-invalid");
  }
  for (const batch of envelope.ownershipBatches) {
    const batchIds = batch.ownedResources.map(resource => resource.internalResourceId);
    const ownedResourcesDigest = canonicalSha256(batch.ownedResources);
    if (openedBatchIds.has(batch.ownershipReceipt.batchId)) {
      throw fail("publication-ownership-receipt-coverage-invalid");
    }
    openedBatchIds.add(batch.ownershipReceipt.batchId);
    if (batch.operationId !== operationId
        || batch.ownershipReceipt.operationId !== operationId
        || batch.ownershipReceipt.resourceCount !== batch.ownedResources.length
        || batch.ownedResourcesDigest !== ownedResourcesDigest
        || await ownership.verifyOwnershipReceipt(freeze({ receipt: batch.ownershipReceipt,
          ownedResourcesDigest, internalResourceIds: batchIds })) !== true) {
      throw fail("publication-ownership-receipt-coverage-invalid");
    }
  }
  return freeze({ result: envelope.result, ownedResources });
}

function admitDurablePublicationInput({ bindingRecord, workspaceManifestRaw, durableAuthority }) {
  const authority = durablePublicationAuthoritySchema.parse(durableAuthority);
  const workspaceManifest = admitWorkspaceManifest(workspaceManifestRaw, bindingRecord);
  if (containsRawHandle(durableAuthority)
      || workspaceManifest.workspaceId !== authority.workspaceId
      || workspaceManifest.bindingDigest !== authority.bindingDigest
      || canonicalSha256(workspaceManifest) !== authority.authorityManifest.workspaceManifestDigest) {
    throw fail("publication-durable-authority-binding-mismatch");
  }
  return { authority, workspaceManifest };
}

async function inspectOwnedCandidate(host, { parentResourceId, descriptor, authorityManifest,
  workspaceManifest, operationId, ownership, openedResources, openedBatchIds,
  observedLifecycle, flush = false }) {
  let observed, observedResources;
  try {
    const admitted = await admitOwnedNativeResult(await host.observeOwnedSibling({
      operationId, parentResourceId, name: descriptor.name, noFollow: true,
    }), { operationId, ownership, openedResources, openedBatchIds });
    observed = ownedSiblingObservationSchema.parse(admitted.result);
    observedResources = admitted.ownedResources;
  } catch { return freeze({ state: "indeterminate", treeVerified: false }); }
  if (observed.state !== "present") {
    if (observedResources.length !== 0) return freeze({ state: "indeterminate", treeVerified: false });
    return freeze({ state: observed.state, treeVerified: false });
  }
  if (observedResources.length !== 1 || observedResources[0].internalResourceId !== observed.internalResourceId
      || observedResources[0].nativeObjectType !== "directory"
      || observedResources[0].role !== "publication-inspection"
      || observedResources[0].child !== "control" || observedResources[0].direction !== "none") {
    return freeze({ state: "indeterminate", treeVerified: false });
  }
  const expectedIdentity = descriptor.identity ?? descriptor.expectedIdentity;
  if (!sameIdentity(observed.identity, expectedIdentity)) return freeze({ state: "mismatch", treeVerified: false });
  let inspected, inspectedResources;
  try {
    const admitted = await admitOwnedNativeResult(await host.inspectOwnedManifestTree({
      operationId, rootResourceId: observed.internalResourceId, noFollow: true, requireSingleLink: true,
      rejectAdditionalEntries: true, expectedEntries: authorityManifest.files.map(file => freeze({ ...file }))
    }), { operationId, ownership, openedResources, openedBatchIds });
    inspected = admitted.result;
    inspectedResources = admitted.ownedResources;
  } catch { return freeze({ state: "exact", treeVerified: false }); }
  if (containsRawHandle(inspected) || !inspected || Object.getPrototypeOf(inspected) !== Object.prototype
      || Object.keys(inspected).sort().join(",") !== "additionalEntries,fileSetDigest,files,reparseEntries"
      || !Array.isArray(inspected.files) || !Array.isArray(inspected.additionalEntries)
      || !Array.isArray(inspected.reparseEntries) || inspected.additionalEntries.length !== 0
      || inspected.reparseEntries.length !== 0 || inspected.files.length !== authorityManifest.files.length
      || inspected.fileSetDigest !== workspaceManifest.fileSetDigest
      || inspectedResources.length !== inspected.files.length) {
    return freeze({ state: "exact", treeVerified: false });
  }
  for (let index = 0; index < authorityManifest.files.length; index += 1) {
    const actual = inspected.files[index], expected = authorityManifest.files[index];
    if (!actual || Object.getPrototypeOf(actual) !== Object.prototype
        || Object.keys(actual).sort().join(",") !== "bytes,identity,internalResourceId,linkCount,ownershipVerified,path,sha256"
        || actual.ownershipVerified !== true || actual.path !== expected.path || actual.bytes !== expected.bytes
        || actual.sha256 !== expected.sha256 || actual.linkCount !== 1
        || !sameIdentity(actual.identity, expected.identity) || !id.safeParse(actual.internalResourceId).success
        || inspectedResources[index].internalResourceId !== actual.internalResourceId
        || inspectedResources[index].nativeObjectType !== "file"
        || inspectedResources[index].role !== "publication-inspection"
        || inspectedResources[index].child !== "control" || inspectedResources[index].direction !== "none") {
      return freeze({ state: "exact", treeVerified: false });
    }
  }
  if (flush) {
    for (const file of inspected.files) {
      await host.flushOwnedFile({ fileResourceId: file.internalResourceId, path: file.path });
    }
    await host.flushOwnedDirectoryMetadata({ rootResourceId: observed.internalResourceId,
      order: "children-before-root" });
  }
  return freeze({ state: "exact", treeVerified: true, identity: observed.identity,
    manifestDigest: observedLifecycle === "ready"
      ? authoritativeFinalWorkspaceManifestDigest(workspaceManifest)
      : canonicalSha256(workspaceManifest) });
}

async function closeOwnedResources(host, operationId, resources) {
  const failures = [];
  for (const internalResourceId of [...resources].reverse()) {
    try { await host.closeOwnedResource({ operationId, internalResourceId }); } catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw fail("publication-owned-resource-close-failed");
}

/** Candidate publication path. Raw handles cannot enter or leave this function. */
export async function publishWorkspaceNoReplaceOwned(input, host, ownershipVerifier) {
  requireOwnedHost(host);
  const { authority, workspaceManifest } = admitDurablePublicationInput(input);
  const ownership = requireOwnershipVerifier(ownershipVerifier, authority.operationId);
  if (workspaceManifest.lifecycle !== "staging" || authority.workspaceLifecycle !== "staging"
      || authority.state !== "publication-claimed") throw fail("publication-lifecycle-not-staging");
  const openedResources = new Set(), openedBatchIds = new Set();
  let moveAttempted = false;
  try {
    const staging = await inspectOwnedCandidate(host, { parentResourceId: authority.parentResourceId,
      descriptor: authority.authorityManifest.staging, authorityManifest: authority.authorityManifest,
      workspaceManifest, operationId: authority.operationId, ownership, openedResources, openedBatchIds,
      observedLifecycle: "staging", flush: true });
    const finalBefore = await inspectOwnedCandidate(host, { parentResourceId: authority.parentResourceId,
      descriptor: authority.authorityManifest.final, authorityManifest: authority.authorityManifest,
      workspaceManifest, operationId: authority.operationId, ownership, openedResources, openedBatchIds,
      observedLifecycle: "ready" });
    if (!(staging.state === "exact" && staging.treeVerified) || finalBefore.state !== "absent") {
      return classifyPublicationRelationship({ databaseState: "staging", staging, final: finalBefore });
    }
    await host.flushAuthorityManifest({ authorityManifestDigest: authority.authorityManifestDigest });
    moveAttempted = true;
    try {
      await host.moveOwnedSiblingNoReplaceWriteThrough({ parentResourceId: authority.parentResourceId,
        stagingResourceId: authority.stagingRootResourceId, stagingName: authority.authorityManifest.staging.name,
        finalName: authority.authorityManifest.final.name,
        expectedStagingIdentity: authority.authorityManifest.staging.identity,
        publicationClaimId: authority.publicationClaim.claimId, replaceExisting: false, writeThrough: true });
    } catch { /* Observe the claimed effect once. Never invoke it again. */ }
    const stagingAfter = await inspectOwnedCandidate(host, { parentResourceId: authority.parentResourceId,
      descriptor: authority.authorityManifest.staging, authorityManifest: authority.authorityManifest,
      workspaceManifest, operationId: authority.operationId, ownership, openedResources, openedBatchIds,
      observedLifecycle: "staging" });
    const finalAfter = await inspectOwnedCandidate(host, { parentResourceId: authority.parentResourceId,
      descriptor: authority.authorityManifest.final, authorityManifest: authority.authorityManifest,
      workspaceManifest, operationId: authority.operationId, ownership, openedResources, openedBatchIds,
      observedLifecycle: "ready" });
    if (stagingAfter.state === "absent" && finalAfter.state === "exact" && finalAfter.treeVerified) {
      return proposal("published-verified", "record-published-pending-db",
        "owned-non-replacing-write-through-move-reopened-and-verified", {
          filesystemMutationAttempted: true, filesystemMutationConfirmed: true,
          observedFinalIdentity: finalAfter.identity,
          observedFinalDigest: finalAfter.manifestDigest,
          databaseTransitionProposal: freeze({ from: "staging", to: "published-pending-db",
            expectedRevision: authority.workspaceRevision }),
        });
    }
    return proposal("unknown", "record-unknown", "publication-effect-indeterminate", {
      filesystemMutationAttempted: moveAttempted, filesystemMutationConfirmed: false, deletionAuthorized: false,
    });
  } finally { await closeOwnedResources(host, authority.operationId, openedResources); }
}

export async function reconcileWorkspacePublicationOwned(input, host, ownershipVerifier) {
  requireOwnedHost(host);
  const { authority, workspaceManifest } = admitDurablePublicationInput(input);
  const ownership = requireOwnershipVerifier(ownershipVerifier, authority.operationId);
  const openedResources = new Set(), openedBatchIds = new Set();
  try {
    const staging = await inspectOwnedCandidate(host, { parentResourceId: authority.parentResourceId,
      descriptor: authority.authorityManifest.staging, authorityManifest: authority.authorityManifest,
      workspaceManifest, operationId: authority.operationId, ownership, openedResources, openedBatchIds,
      observedLifecycle: "staging" });
    const final = await inspectOwnedCandidate(host, { parentResourceId: authority.parentResourceId,
      descriptor: authority.authorityManifest.final, authorityManifest: authority.authorityManifest,
      workspaceManifest, operationId: authority.operationId, ownership, openedResources, openedBatchIds,
      observedLifecycle: "ready" });
    return classifyPublicationRelationship({ databaseState: authority.workspaceLifecycle, staging, final });
  } finally { await closeOwnedResources(host, authority.operationId, openedResources); }
}

export const publicationProofBoundary = Object.freeze({
  deterministicPreflightOnly: true,
  actualWindowsControlProofRequired: true,
  candidatePathUsesOpaqueOwnedResourceIds: true,
  candidatePathAcceptsRawHandles: false,
  publicationInspectionRequiresWatchdogSignedOwnershipBatches: true,
  closeIsOperationScopedAndExhaustiveForReturnedResourceIds: true,
  requiredNativeClaims: Object.freeze(["held-parent-no-follow", "ntfs-volume-and-file-id",
    "file-no-follow-single-link", "FlushFileBuffers-files-and-directories",
    "MoveFileExW-MOVEFILE_WRITE_THROUGH-without-MOVEFILE_REPLACE_EXISTING", "post-move-reopen-and-identity-check"])
});
