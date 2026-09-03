import { z } from "zod";
import {
  admitWorkspaceManifest,
  canonicalSha256,
  parseCanonicalWire,
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

export const publicationProofBoundary = Object.freeze({
  deterministicPreflightOnly: true,
  actualWindowsControlProofRequired: true,
  requiredNativeClaims: Object.freeze(["held-parent-no-follow", "ntfs-volume-and-file-id",
    "file-no-follow-single-link", "FlushFileBuffers-files-and-directories",
    "MoveFileExW-MOVEFILE_WRITE_THROUGH-without-MOVEFILE_REPLACE_EXISTING", "post-move-reopen-and-identity-check"])
});
