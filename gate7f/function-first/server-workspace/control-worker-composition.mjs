import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { createBootstrapRecordSet } from "./bootstrap-contracts.mjs";
import {
  CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, MATERIALIZATION_DEADLINE_MS,
  authorityBindingSchema, canonicalSha256, canonicalStringify, createControlPipeAdmission,
  materializationAdmissionResultSchema, materializationEffectClaimSchema, materializationReceiptSchema,
  nativeOwnedResourceProjectionSchema, publicGitOperationAuthoritySchema, rawHandleOwnershipReceiptSchema, sourceSelectionSchema,
  watchdogRetainedOperationSchema, watchdogRetainedRecoveryEntrySchema, watchdogUnissuedLeaseSettlementSchema,
  watchdogUnusedLeaseClosureSchema, workspaceCancelRequestSchema,
  workspaceManifestSchema,
} from "./materialization-contracts.mjs";
import {
  durablePublicationAuthoritySchema, publicationAuthorityManifestSchema,
  publishWorkspaceNoReplaceOwned, reconcileWorkspacePublicationOwned,
} from "./publication-primitive.mjs";

const fail = (code, cause = undefined) => Object.assign(new Error(`control-worker-${code}`, { cause }), {
  code: `control-worker-${code}`,
});
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u).refine(value => {
  const parsed = new Date(value); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}, "invalid canonical UTC instant");
const plainContext = z.object({ principalId: z.string().min(1).max(160), projectId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160) }).strict();
const materializeInputSchema = z.object({ context: plainContext,
  sourceId: z.string().regex(/^source-[a-f0-9-]{36}$/u) }).strict();

const freeze = value => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value;
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const exact = (left, right) => canonicalStringify(left) === canonicalStringify(right);
const noRawHandle = (value, seen = new Set()) => {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || /raw.*handle|handle(?:hex|value|number|pointer)$/iu.test(key)
        || !noRawHandle(value[key], seen)) return false;
  }
  return true;
};
const descriptor = (child, role, kind, direction, endpoint, oppositeOwner) => freeze({
  operationMode: "public-git", child, role, kind, direction, endpoint, oppositeOwner,
});

export const PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY = freeze({
  coordinator: [
    descriptor("coordinator", "control-request-read", "pipe-endpoint", "control-to-coordinator", "read", "control"),
    descriptor("coordinator", "control-response-write", "pipe-endpoint", "coordinator-to-control", "write", "control"),
    descriptor("coordinator", "control-bootstrap-read", "bootstrap-endpoint", "control-bootstrap-to-coordinator", "read", "control"),
    descriptor("coordinator", "materializer-request-write", "pipe-endpoint", "coordinator-to-materializer", "write", "materializer"),
    descriptor("coordinator", "materializer-response-read", "pipe-endpoint", "materializer-to-coordinator", "read", "materializer"),
    descriptor("coordinator", "materializer-bootstrap-read", "bootstrap-endpoint", "control-bootstrap-to-coordinator-materializer", "read", "control"),
    descriptor("coordinator", "broker-request-write", "pipe-endpoint", "coordinator-to-broker", "write", "ingress-broker"),
    descriptor("coordinator", "broker-response-read", "pipe-endpoint", "broker-to-coordinator", "read", "ingress-broker"),
    descriptor("coordinator", "broker-bootstrap-read", "bootstrap-endpoint", "control-bootstrap-to-coordinator-broker", "read", "control"),
  ],
  materializer: [
    descriptor("materializer", "coordinator-request-read", "pipe-endpoint", "coordinator-to-materializer", "read", "coordinator"),
    descriptor("materializer", "coordinator-response-write", "pipe-endpoint", "materializer-to-coordinator", "write", "coordinator"),
    descriptor("materializer", "coordinator-bootstrap-read", "bootstrap-endpoint", "control-bootstrap-to-materializer", "read", "control"),
    descriptor("materializer", "git-request-write", "pipe-endpoint", "materializer-to-broker", "write", "ingress-broker"),
    descriptor("materializer", "git-response-read", "pipe-endpoint", "broker-to-materializer", "read", "ingress-broker"),
    descriptor("materializer", "held-ingress-root", "directory-handle", "control-held-to-materializer", "held", "control-watchdog"),
    descriptor("materializer", "held-staging-root", "directory-handle", "control-held-to-materializer", "held", "control-watchdog"),
  ],
  "ingress-broker": [
    descriptor("ingress-broker", "coordinator-request-read", "pipe-endpoint", "coordinator-to-broker", "read", "coordinator"),
    descriptor("ingress-broker", "coordinator-response-write", "pipe-endpoint", "broker-to-coordinator", "write", "coordinator"),
    descriptor("ingress-broker", "coordinator-bootstrap-read", "bootstrap-endpoint", "control-bootstrap-to-broker", "read", "control"),
    descriptor("ingress-broker", "git-request-read", "pipe-endpoint", "materializer-to-broker", "read", "materializer"),
    descriptor("ingress-broker", "git-response-write", "pipe-endpoint", "broker-to-materializer", "write", "materializer"),
  ],
});
export const PUBLIC_GIT_CHILD_HANDLE_COUNTS = freeze({ coordinator: 9, materializer: 7, "ingress-broker": 5 });
export const PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST = canonicalSha256(PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY);
export const PUBLIC_GIT_ENVIRONMENT_NAMES = freeze(["PATH", "SystemRoot", "TEMP", "TMP", "WINDIR"]);
export const PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT = 53;

const requestSchema = z.object({ schemaVersion: z.literal("runa-workspace-materialization-request/v1"), requestId: id,
  idempotencyKey: digest, sourceId: id, taskId: id, bindingDigest: digest,
  expectedSourceRevision: z.number().int().min(1), capabilitySetVersion: z.literal(CAPABILITY_SET_VERSION),
  capabilitySetDigest: z.literal(CAPABILITY_SET_DIGEST), requestedRef: z.string().min(1).max(255),
  uploadSessionId: z.null(), uploadManifestDigest: z.null(), limitsProfileId: id, limitsProfileDigest: digest,
  createdAt: utc, deadlineAt: utc }).strict();
const intentSchema = z.object({ workspaceId: id, lifecycle: z.literal("intent-recorded"), revision: z.literal(1),
  cleanupState: z.literal("not-required"), requestScopeDigest: digest, operationAuthorityDigest: digest,
  source: sourceSelectionSchema, binding: authorityBindingSchema, request: requestSchema,
  expectedCommitOid: z.string().regex(/^[a-f0-9]{40}$/u) }).strict().superRefine((value, context) => {
  if (value.binding.taskId !== value.request.taskId || value.source.sourceId !== value.request.sourceId
      || value.source.sourceId !== value.binding.sourceId || value.source.revision !== value.binding.sourceRevision
      || value.request.bindingDigest !== canonicalSha256(value.binding)
      || value.requestScopeDigest !== value.request.idempotencyKey) {
    context.addIssue({ code: "custom", message: "intent authority binding mismatch" });
  }
});

const beginResultSchema = z.discriminatedUnion("disposition", [
  z.object({ created: z.literal(true), disposition: z.literal("created"),
    operationAuthority: publicGitOperationAuthoritySchema, workspace: intentSchema }).strict(),
  z.object({ created: z.literal(false), disposition: z.literal("exact-replay"),
    operationAuthority: publicGitOperationAuthoritySchema, workspace: z.unknown(), terminalEvidence: z.unknown() }).strict(),
  z.object({ created: z.literal(false), disposition: z.literal("converged-existing"),
    existingOperationAuthority: publicGitOperationAuthoritySchema, unusedAuthorityDigest: digest }).strict(),
]);
const issuedAuthorityResultSchema = z.object({ authorityToken: id,
  operationAuthority: publicGitOperationAuthoritySchema }).strict();
const exactLookupSchema = z.object({ found: z.literal(true), disposition: z.literal("exact"),
  requestScopeDigest: digest, operationAuthority: publicGitOperationAuthoritySchema, workspace: z.unknown(),
  effectClaims: z.array(materializationEffectClaimSchema).max(2), publicationAuthority: z.unknown().nullable(),
  workspaceReceipt: z.unknown().nullable(), operationReceipt: z.unknown().nullable() }).strict();
const lookupSchema = z.union([z.object({ found: z.literal(false), disposition: z.literal("absent") }).strict(), exactLookupSchema]);
const claimResultSchema = z.object({ created: z.boolean(), claim: materializationEffectClaimSchema,
  publicationAuthority: z.unknown().optional() }).strict();

const identitySchema = z.object({ volumeSerial: z.string().regex(/^[a-f0-9]{8}$/u),
  fileId: z.string().regex(/^[a-f0-9]{16}$/u) }).strict();
const setupSchema = z.object({ schemaVersion: z.literal("runa-public-git-native-setup/v2"), operationId: id,
  topologyDigest: z.literal(PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST),
  nativeHostProcessId: z.number().int().min(1).max(4_294_967_295),
  childHandleCounts: z.object({ coordinator: z.literal(9), materializer: z.literal(7),
    "ingress-broker": z.literal(5) }).strict(), bootstrapPipeCount: z.literal(5), jobResourceId: id,
  children: z.array(z.object({ child: z.enum(["coordinator", "materializer", "ingress-broker"]),
    processResourceId: id, primaryThreadResourceId: id, suspended: z.literal(true), assignedToJob: z.literal(true),
    environmentNames: z.tuple([z.literal("PATH"), z.literal("SystemRoot"), z.literal("TEMP"), z.literal("TMP"), z.literal("WINDIR")]),
    network: z.enum(["deny-all", "tls-broker-only"]),
    inheritedResources: z.array(z.object({ internalResourceId: id, descriptor: z.unknown() }).strict()) }).strict()).length(3),
  controlResources: z.array(z.object({ internalResourceId: id, counterpartResourceId: id,
    descriptor: z.unknown() }).strict()).length(21),
  watchdogResources: z.object({ operationTokenResourceId: id, authorityTimerResourceId: id,
    authorityEventResourceId: id }).strict(),
  publication: z.object({ parentResourceId: id, ingressRootResourceId: id, stagingRootResourceId: id,
    parentIdentity: identitySchema, staging: z.object({ name: z.string().min(32).max(128), identity: identitySchema }).strict(),
    final: z.object({ name: z.string().min(32).max(128), expectedIdentity: identitySchema }).strict() }).strict(),
  ownedResources: z.array(nativeOwnedResourceProjectionSchema).length(PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT),
  ownedResourcesDigest: digest, ownershipReceipt: rawHandleOwnershipReceiptSchema }).strict();
const preResumeSchema = z.object({ schemaVersion: z.literal("runa-public-git-pre-resume/v2"), operationId: id,
  topologyDigest: z.literal(PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST),
  assignedChildren: z.tuple([z.literal("coordinator"), z.literal("materializer"), z.literal("ingress-broker")]),
  suspendedChildren: z.tuple([z.literal("coordinator"), z.literal("materializer"), z.literal("ingress-broker")]),
  unintendedParentEndpointsClosed: z.literal(true),
  ownedResourceIds: z.array(id).length(PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT),
  ownedResourcesDigest: digest, ownershipReceipt: rawHandleOwnershipReceiptSchema }).strict();

export const publicGitControlOperationSchema = z.object({
  schemaVersion: z.literal("runa-public-git-control-operation/v2"), operationId: id,
  operationAuthority: publicGitOperationAuthoritySchema, workspace: intentSchema }).strict().superRefine((value, context) => {
  if (value.operationId !== value.operationAuthority.operationId || value.operationId !== value.workspace.binding.taskId
      || value.operationAuthority.authorityDigest !== value.workspace.operationAuthorityDigest) {
    context.addIssue({ code: "custom", message: "control operation authority mismatch" });
  }
});
export const publicGitControlProposalSchema = z.object({ schemaVersion: z.literal("runa-public-git-control-proposal/v1"),
  operationId: id, workspaceId: id, requestId: id, bindingDigest: digest, workspaceManifest: workspaceManifestSchema,
  stagingManifestDigest: digest, stagingFlushed: z.literal(true), gitTerminalEof: z.literal(true),
  gitKeyCopiesZeroized: z.literal(true), brokerSocketsClosed: z.literal(true), controlChannelsQuiescent: z.literal(true),
  privateValuesIncluded: z.literal(false), modelInvoked: z.literal(false) }).strict();
export const publicGitFinalizeSchema = z.object({ schemaVersion: z.literal("runa-public-git-control-finalize/v1"),
  operationId: id, workspaceId: id, requestId: id, publicationProposalSha256: digest,
  publishedRevision: z.number().int().positive() }).strict();
export const publicGitControlTerminalSchema = z.object({ schemaVersion: z.literal("runa-public-git-control-terminal/v1"),
  operationId: id, workspaceId: id, requestId: id,
  outcome: z.enum(["finalized", "failed-before-proposal", "cancelled-before-operation"]),
  materializerTerminalEof: z.literal(true), brokerTerminalEof: z.literal(true),
  workerControlKeysZeroized: z.literal(true), privateValuesIncluded: z.literal(false), modelInvoked: z.literal(false) }).strict();

function assertTerminalBinding(terminal, authority, intent, expectedOutcome) {
  if (terminal.operationId !== authority.operationId || terminal.workspaceId !== intent.workspaceId
      || terminal.requestId !== intent.request.requestId || terminal.outcome !== expectedOutcome) {
    throw fail("control-terminal-binding-invalid");
  }
  return terminal;
}

const REQUIRED_DATABASE = ["admitMaterializationRequest", "beginMaterialization", "lookupMaterializationByOperation",
  "claimEffect", "recordStaging", "recordPublishedPendingDb", "recordReady", "recordFailed", "recordCancelled",
  "recordUnknown"];
const REQUIRED_NATIVE = ["preparePublicGitOperation", "closeUnintendedEndpoints", "observePreResume",
  "writeBootstrapChunk", "endBootstrap", "resumeAllChildren", "writeControlRecord", "readControlRecord",
  "endControlRequest", "readControlResponseEof", "capturePublicationAuthority", "waitForChildrenExit"];
const REQUIRED_LEASE = ["issueAndArmOperationAuthority", "closeUnused", "runForward", "beginImmediateTeardown",
  "recover", "settleUnissuedFailure", "verifyUnissuedSettlement", "verifyUnusedClosure",
  "verifyOwnershipReceipt", "completeSuccessCleanup", "runReadyCas", "runTerminalCas", "runUnknownCas", "release"];

function requireMethods(value, names, code) {
  if (!value || names.some(name => typeof value[name] !== "function")) throw fail(code);
}
function sameLocator(lookup, locator) {
  return lookup.requestScopeDigest === locator.requestScopeDigest
    && lookup.operationAuthority.operationId === locator.operationId
    && lookup.operationAuthority.authorityDigest === locator.authorityDigest
    && exact(lookup.operationAuthority.attestation, locator.attestation);
}
function inheritedOwnedMetadata(child, topologyDescriptor) {
  return freeze({ nativeObjectType: topologyDescriptor.kind === "directory-handle" ? "directory" : "pipe",
    role: topologyDescriptor.kind === "directory-handle" ? "inherited-directory"
      : topologyDescriptor.kind === "bootstrap-endpoint" ? "bootstrap-pipe" : "inherited-pipe",
    child, direction: topologyDescriptor.direction });
}
function controlOwnedMetadata(topologyDescriptor) {
  const publicationRole = topologyDescriptor.role === "held-ingress-root" ? "publication-ingress-root"
    : topologyDescriptor.role === "held-staging-root" ? "publication-staging-root" : null;
  return freeze({ nativeObjectType: topologyDescriptor.kind === "directory-handle" ? "directory" : "pipe",
    role: publicationRole ?? (topologyDescriptor.kind === "bootstrap-endpoint"
      ? "bootstrap-pipe" : "control-parent-duplicate"),
    child: "control", direction: topologyDescriptor.direction });
}
function expectedOwnedResource(internalResourceId, metadata) {
  return freeze({ internalResourceId, ...metadata });
}
function assertOwnedResource(actual, expected) {
  if (actual.internalResourceId !== expected.internalResourceId
      || actual.nativeObjectType !== expected.nativeObjectType || actual.role !== expected.role
      || actual.child !== expected.child || actual.direction !== expected.direction) {
    throw fail("native-owned-resource-inventory-invalid");
  }
}
function validateRetainedState(lookup, opened) {
  const lifecycle = lookup.workspace?.lifecycle;
  const forward = ["intent-recorded", "staging", "published-pending-db"].includes(lifecycle);
  const reconciliation = ["unknown", "cleanup-pending"].includes(lifecycle);
  const terminal = ["ready", "failed", "cancelled"].includes(lifecycle);
  if (opened.disposition === "active-observe" && !forward) throw fail("retained-state-watchdog-mismatch");
  if (opened.disposition === "recovery-resumable" && !forward && !reconciliation) {
    throw fail("retained-state-watchdog-mismatch");
  }
  if (opened.disposition === "terminal") {
    if (!terminal) throw fail("retained-state-watchdog-mismatch");
    const expected = lifecycle === "ready" ? lookup.operationReceipt : lookup.workspaceReceipt;
    if (expected === null || !exact(opened.terminalReceipt, expected)) {
      throw fail("retained-terminal-receipt-mismatch");
    }
  }
}
async function openRetained({ database, watchdog, context, locator, retainedLookup = null }) {
  const lookup = retainedLookup === null
    ? lookupSchema.parse(await database.lookupMaterializationByOperation(context,
      freeze({ operationId: locator.operationId, authorityDigest: locator.authorityDigest })))
    : exactLookupSchema.parse(retainedLookup);
  if (!lookup.found || !sameLocator(lookup, locator)) throw fail("retained-locator-database-mismatch");
  const opened = watchdogRetainedOperationSchema.parse(await watchdog.openRetainedOperation(freeze({
    operationId: locator.operationId, authorityDigest: locator.authorityDigest, attestation: locator.attestation,
  })));
  if (opened.operationId !== locator.operationId || opened.authorityDigest !== locator.authorityDigest) {
    throw fail("retained-locator-watchdog-mismatch");
  }
  validateRetainedState(lookup, opened);
  let recovery = null;
  if (opened.disposition === "recovery-resumable") {
    recovery = watchdogRetainedRecoveryEntrySchema.parse(await watchdog.resumeRetainedRecovery(freeze({
      operationId: locator.operationId, authorityDigest: locator.authorityDigest,
      sourceLedgerRevision: opened.ledgerRevision, recoveryCas: opened.recoveryCas,
    })));
    if (recovery.operationId !== locator.operationId || recovery.authorityDigest !== locator.authorityDigest
        || recovery.sourceLedgerRevision !== opened.ledgerRevision || recovery.recoveryCas !== opened.recoveryCas) {
      throw fail("retained-recovery-entry-mismatch");
    }
  }
  return freeze({ lookup, opened, recovery });
}
async function validateSetup(raw, operationId, lease) {
  if (!noRawHandle(raw)) throw fail("native-raw-handle-exposed");
  const setup = setupSchema.parse(raw);
  if (setup.operationId !== operationId) throw fail("native-setup-operation-mismatch");
  if (!exact(setup.children.map(child => child.child), ["coordinator", "materializer", "ingress-broker"])) {
    throw fail("native-child-order-invalid");
  }
  const expectedResources = [expectedOwnedResource(setup.jobResourceId, {
    nativeObjectType: "job", role: "operation-job", child: "control", direction: "none",
  })];
  const inherited = [];
  for (const child of setup.children) {
    if (child.network !== (child.child === "ingress-broker" ? "tls-broker-only" : "deny-all")) {
      throw fail("native-child-network-invalid");
    }
    const expected = PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY[child.child];
    if (child.inheritedResources.length !== expected.length) throw fail("native-inherited-topology-invalid");
    expectedResources.push(expectedOwnedResource(child.processResourceId, {
      nativeObjectType: "process", role: "child-process", child: child.child, direction: "none",
    }), expectedOwnedResource(child.primaryThreadResourceId, {
      nativeObjectType: "thread", role: "child-primary-thread", child: child.child, direction: "none",
    }));
    child.inheritedResources.forEach((resource, index) => {
      if (!exact(resource.descriptor, expected[index])) {
        throw fail("native-inherited-topology-invalid");
      }
      inherited.push(resource);
      expectedResources.push(expectedOwnedResource(resource.internalResourceId,
        inheritedOwnedMetadata(child.child, expected[index])));
    });
  }
  if (setup.controlResources.length !== inherited.length) throw fail("native-control-resource-inventory-invalid");
  let ingressRootResourceId = null, stagingRootResourceId = null, controlBootstrapCount = 0;
  setup.controlResources.forEach((resource, index) => {
    const counterpart = inherited[index];
    if (resource.counterpartResourceId !== counterpart.internalResourceId
        || !exact(resource.descriptor, counterpart.descriptor)) {
      throw fail("native-control-resource-inventory-invalid");
    }
    const metadata = controlOwnedMetadata(counterpart.descriptor);
    if (metadata.role === "bootstrap-pipe") controlBootstrapCount += 1;
    if (metadata.role === "publication-ingress-root") ingressRootResourceId = resource.internalResourceId;
    if (metadata.role === "publication-staging-root") stagingRootResourceId = resource.internalResourceId;
    expectedResources.push(expectedOwnedResource(resource.internalResourceId, metadata));
  });
  if (controlBootstrapCount !== setup.bootstrapPipeCount
      || setup.publication.ingressRootResourceId !== ingressRootResourceId
      || setup.publication.stagingRootResourceId !== stagingRootResourceId) {
    throw fail("native-publication-resource-binding-invalid");
  }
  expectedResources.push(expectedOwnedResource(setup.publication.parentResourceId, {
    nativeObjectType: "directory", role: "publication-parent", child: "control", direction: "none",
  }), expectedOwnedResource(setup.watchdogResources.operationTokenResourceId, {
    nativeObjectType: "token", role: "operation-token", child: "control", direction: "none",
  }), expectedOwnedResource(setup.watchdogResources.authorityTimerResourceId, {
    nativeObjectType: "timer", role: "authority-timer", child: "control", direction: "none",
  }), expectedOwnedResource(setup.watchdogResources.authorityEventResourceId, {
    nativeObjectType: "event", role: "authority-event", child: "control", direction: "none",
  }));
  if (expectedResources.length !== PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT
      || new Set(setup.ownedResources.map(resource => resource.internalResourceId)).size !== setup.ownedResources.length
      || setup.ownedResources.length !== expectedResources.length
      || setup.ownedResources.some(resource => resource.sourceProcessId !== setup.nativeHostProcessId)) {
    throw fail("native-owned-resource-inventory-invalid");
  }
  setup.ownedResources.forEach((resource, index) => assertOwnedResource(resource, expectedResources[index]));
  const ownedResourcesDigest = canonicalSha256(setup.ownedResources);
  if (setup.ownedResourcesDigest !== ownedResourcesDigest
      || setup.ownershipReceipt.resourceCount !== setup.ownedResources.length
      || setup.ownershipReceipt.operationId !== operationId
      || await lease.verifyOwnershipReceipt(freeze({ receipt: setup.ownershipReceipt, ownedResourcesDigest,
        internalResourceIds: setup.ownedResources.map(resource => resource.internalResourceId) })) !== true) {
    throw fail("native-ownership-receipt-coverage-invalid");
  }
  return setup;
}
function signControlRecord({ channelId, direction, frameType, nonce, payload, requestId, sequence }, key) {
  const unsigned = { schemaVersion: "runa-materialization-pipe-frame/v2", channelId, sequence, requestId, nonce,
    payloadSha256: createHash("sha256").update(payload).digest("hex"), payloadBytes: payload.length,
    direction, frameType };
  const hmacSha256 = createHmac("sha256", key).update(canonicalStringify(unsigned)).update(payload).digest("hex");
  return freeze({ rawHeader: Buffer.from(canonicalStringify({ ...unsigned, hmacSha256 })), payload: Buffer.from(payload) });
}
function identifiers() { return { nonce: randomBytes(32).toString("hex"), channels: {
  controlCoordinator: `channel-${randomUUID()}`, coordinatorMaterializer: `channel-${randomUUID()}`,
  coordinatorBroker: `channel-${randomUUID()}` } }; }
function keys() { return { controlKeys: { controlCoordinator: randomBytes(32), coordinatorMaterializer: randomBytes(32),
  coordinatorBroker: randomBytes(32) }, gitStreamKey: randomBytes(32) }; }

function makeReadyEvidence({ authority, intent, proposal, pendingRevision, readyManifest, cleanup, releaseDigest }) {
  const finishedAt = utc.parse(cleanup.completedAt);
  const receipt = materializationReceiptSchema.parse({ schemaVersion: "runa-workspace-materialization-receipt/v1",
    requestId: intent.request.requestId, sourceId: intent.source.sourceId, sourceKind: "git-public-https",
    workspaceId: intent.workspaceId, taskId: authority.operationId, bindingDigest: intent.request.bindingDigest,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    limitsProfileId: intent.request.limitsProfileId, limitsProfileDigest: intent.request.limitsProfileDigest,
    outcome: "ready", nativeVersion: readyManifest.nativeVersion, beforeManifestDigest: null,
    stagingManifestDigest: proposal.stagingManifestDigest, finalManifestDigest: canonicalSha256(readyManifest),
    filesObserved: readyManifest.entries.length,
    bytesObserved: readyManifest.entries.reduce((sum, row) => sum + row.bytes, 0), credentialsPresent: false,
    networkState: "bounded-complete", processState: "stopped", publicationState: "published-acknowledged",
    databaseState: "ready-recorded", cleanupState: "complete", limitCode: "none", errorCode: null,
    retryableAfterReconciliation: false, effects: ["workspace-materialize"], workerReleaseSha256: releaseDigest,
    privateValuesIncluded: false, modelInvoked: false, startedAt: authority.requestedAt, finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(authority.requestedAt) });
  const operationReceipt = freeze({ schemaVersion: "runa-workspace-external-operation-terminal-receipt/v1",
    operationId: authority.operationId, requestId: intent.request.requestId, sourceId: intent.source.sourceId,
    sourceRevision: intent.source.revision, sourceKind: "git-public-https", workspaceId: intent.workspaceId,
    workspaceRevision: pendingRevision + 1, taskId: authority.operationId,
    idempotencyKey: intent.request.idempotencyKey, bindingDigest: intent.request.bindingDigest,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    outcome: "terminal-success", workspaceReceiptSha256: canonicalSha256(receipt),
    finalManifestDigest: receipt.finalManifestDigest, nativeVersion: readyManifest.nativeVersion,
    processState: "stopped", activeProcesses: 0, publicationState: "published-reobserved",
    cleanupState: "complete", privateValuesIncluded: false, modelInvoked: false, recordedAt: finishedAt });
  return freeze({ receipt, operationReceipt });
}

function makeFailureReceipt({ authority, intent, releaseDigest, cancelled, stagingManifestDigest, finishedAt,
  errorCode }) {
  return materializationReceiptSchema.parse({ schemaVersion: "runa-workspace-materialization-receipt/v1",
    requestId: intent.request.requestId, sourceId: intent.source.sourceId, sourceKind: "git-public-https",
    workspaceId: intent.workspaceId, taskId: authority.operationId, bindingDigest: intent.request.bindingDigest,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    limitsProfileId: intent.request.limitsProfileId, limitsProfileDigest: intent.request.limitsProfileDigest,
    outcome: cancelled ? "cancelled" : "failed", nativeVersion: null, beforeManifestDigest: null,
    stagingManifestDigest, finalManifestDigest: null, filesObserved: 0, bytesObserved: 0,
    credentialsPresent: false, networkState: "indeterminate", processState: "stopped",
    publicationState: stagingManifestDigest === null ? "not-started" : "staging",
    databaseState: "terminal-recorded", cleanupState: "complete", limitCode: "none",
    errorCode: cancelled ? "cancellation-accepted" : errorCode, retryableAfterReconciliation: true,
    effects: cancelled ? ["workspace-cancel"] : [], workerReleaseSha256: releaseDigest,
    privateValuesIncluded: false, modelInvoked: false, startedAt: authority.requestedAt, finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(authority.requestedAt) });
}

function makeUnknownReceipt({ authority, intent, releaseDigest, stagingManifestDigest, finishedAt }) {
  return materializationReceiptSchema.parse({ schemaVersion: "runa-workspace-materialization-receipt/v1",
    requestId: intent.request.requestId, sourceId: intent.source.sourceId, sourceKind: "git-public-https",
    workspaceId: intent.workspaceId, taskId: authority.operationId, bindingDigest: intent.request.bindingDigest,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    limitsProfileId: intent.request.limitsProfileId, limitsProfileDigest: intent.request.limitsProfileDigest,
    outcome: "unknown", nativeVersion: null, beforeManifestDigest: null,
    stagingManifestDigest, finalManifestDigest: null, filesObserved: 0, bytesObserved: 0,
    credentialsPresent: false, networkState: "indeterminate", processState: "stopped",
    publicationState: "indeterminate", databaseState: "indeterminate", cleanupState: "indeterminate",
    limitCode: "none", errorCode: "state-indeterminate", retryableAfterReconciliation: false,
    effects: [], workerReleaseSha256: releaseDigest, privateValuesIncluded: false, modelInvoked: false,
    startedAt: authority.requestedAt, finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(authority.requestedAt) });
}

function failureErrorCode(stage) {
  if (stage.startsWith("database-")) return "database-failed";
  if (stage.startsWith("publication-")) return "publication-failed";
  return "process-failed";
}

const TEST_TOKEN = Symbol("control-worker-composition-test-only");

async function closeUnusedLease(lease, authorityDigest, reason) {
  const closure = watchdogUnusedLeaseClosureSchema.parse(await lease.closeUnused(freeze({
    expectedAuthorityDigest: authorityDigest, reason,
  })));
  if (closure.authorityDigest !== authorityDigest || await lease.verifyUnusedClosure(closure) !== true) {
    throw fail("unused-lease-closure-mismatch");
  }
  return closure;
}

function retainedResult(disposition, locator, retained) {
  return freeze({ schemaVersion: "runa-public-git-control-composition-result/v2",
    operationId: locator.operationId, disposition,
    lifecycle: retained.lookup.workspace?.lifecycle ?? "unknown",
    retainedState: retained.recovery?.disposition ?? retained.opened.disposition,
    ...(retained.opened.disposition === "terminal"
      ? { terminalReceipt: retained.opened.terminalReceipt } : {}),
    actualNativeControlProofRequired: true });
}

async function resolveBeginResponseLoss({ database, watchdog, lease, context, sourceId, authority, beginError }) {
  const lookup = lookupSchema.parse(await database.lookupMaterializationByOperation(context,
    freeze({ operationId: authority.operationId, authorityDigest: authority.authorityDigest })));
  if (lookup.found) {
    const locator = { disposition: "existing", requestScopeDigest: lookup.requestScopeDigest,
      operationId: authority.operationId, authorityDigest: authority.authorityDigest,
      attestation: authority.attestation };
    const retained = await openRetained({ database, watchdog, context, locator, retainedLookup: lookup });
    return retainedResult("committed-response-loss", locator, retained);
  }
  const reread = materializationAdmissionResultSchema.parse(await database.admitMaterializationRequest(
    context, freeze({ sourceId, operationMode: "public-git" })));
  await closeUnusedLease(lease, authority.authorityDigest, "begin-response-absent");
  if (reread.disposition === "absent") throw fail("begin-outcome-absent", beginError);
  const retained = await openRetained({ database, watchdog, context, locator: reread });
  return retainedResult(reread.disposition, reread, retained);
}

async function runCreatedOperation({ database, nativeHost, lease, authorityToken, authority, intent,
  input, releaseDigest, idsFactory, keyFactory, publish, reconcile, cancelBeforeOperation }) {
  let stage = "database-git-fetch-claim", publicationBoundaryEntered = false, publicationClaimed = false;
  let publicationAttempted = false, publicationConfirmed = false, controlKey = null, bootstrapSet = null;
  let stagingManifestDigest = null, stagingRevision = intent.revision;
  const forward = (nextStage, effect) => {
    stage = nextStage;
    return lease.runForward(freeze({ operationId: authority.operationId, authorityToken, stage: nextStage, effect }));
  };
  try {
    const fetchClaim = claimResultSchema.parse(await database.claimEffect(input.context, freeze({
      operationId: authority.operationId, authorityDigest: authority.authorityDigest, effect: "git-fetch",
      expectedWorkspaceRevision: intent.revision })));
    if (!fetchClaim.created || fetchClaim.claim.state !== "claimed") throw fail("git-fetch-claim-not-new");

    const ids = idsFactory(), secretSet = keyFactory();
    controlKey = Buffer.from(secretSet.controlKeys.controlCoordinator);
    const operation = publicGitControlOperationSchema.parse({ schemaVersion: "runa-public-git-control-operation/v2",
      operationId: authority.operationId, operationAuthority: authority, workspace: intent });
    bootstrapSet = createBootstrapRecordSet({ operationMode: "public-git", operationId: authority.operationId,
      requestId: intent.request.requestId, nonce: ids.nonce, channels: ids.channels,
      controlKeys: secretSet.controlKeys, gitStreamKey: secretSet.gitStreamKey });
    if (bootstrapSet.records.length !== 5) throw fail("bootstrap-count-invalid");

    const setup = await validateSetup(await forward("native-prepare", () => nativeHost.preparePublicGitOperation(freeze({
      operationId: authority.operationId, authorityToken, operationAuthority: authority,
      topology: PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY, topologyDigest: PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST,
      operation,
    }))), authority.operationId, lease);
    const closed = await forward("native-close-unintended", () => nativeHost.closeUnintendedEndpoints(freeze({
      operationId: authority.operationId, authorityToken })));
    if (!exact(closed, { operationId: authority.operationId, closed: true })) {
      throw fail("native-close-unintended-invalid");
    }
    const preResume = preResumeSchema.parse(await forward("native-observe-pre-resume",
      () => nativeHost.observePreResume(freeze({ operationId: authority.operationId, authorityToken }))));
    if (preResume.operationId !== authority.operationId || !exact(preResume.ownershipReceipt, setup.ownershipReceipt)
        || preResume.ownedResourcesDigest !== setup.ownedResourcesDigest
        || !exact(preResume.ownedResourceIds,
          setup.ownedResources.map(resource => resource.internalResourceId))
        || await lease.verifyOwnershipReceipt(freeze({ receipt: preResume.ownershipReceipt,
          ownedResourcesDigest: preResume.ownedResourcesDigest,
          internalResourceIds: preResume.ownedResourceIds })) !== true) {
      throw fail("native-pre-resume-ownership-invalid");
    }
    for (const record of bootstrapSet.records) {
      await record.writeOnce(async bytes => {
        const written = await forward("bootstrap-write", () => nativeHost.writeBootstrapChunk(freeze({
          operationId: authority.operationId, authorityToken, binding: record.binding, bytes })));
        if (!Buffer.isBuffer(written) || !written.equals(bytes)) throw fail("bootstrap-write-unconfirmed");
      });
      const eof = await forward("bootstrap-eof", () => nativeHost.endBootstrap(freeze({
        operationId: authority.operationId, authorityToken, binding: record.binding })));
      if (eof?.eof !== true || !exact(eof.binding, record.binding)) throw fail("bootstrap-eof-unconfirmed");
    }
    if (!bootstrapSet.state().generatedBytesZeroized) throw fail("bootstrap-zeroization-unconfirmed");
    await forward("native-resume", () => nativeHost.resumeAllChildren(freeze({
      operationId: authority.operationId, authorityToken,
      primaryThreadResourceIds: setup.children.map(child => child.primaryThreadResourceId) })));

    const expectation = { relationship: "control-coordinator", channelId: ids.channels.controlCoordinator,
      requestId: intent.request.requestId, nonce: ids.nonce };
    const pipe = createControlPipeAdmission(expectation, controlKey);
    const requestPayload = cancelBeforeOperation
      ? Buffer.from(canonicalStringify(workspaceCancelRequestSchema.parse({
          schemaVersion: "runa-workspace-cancel-request/v1", requestId: intent.request.requestId,
          idempotencyKey: intent.request.idempotencyKey, sourceId: intent.source.sourceId,
          taskId: authority.operationId, bindingDigest: intent.request.bindingDigest,
          expectedSourceRevision: intent.source.revision, capabilitySetVersion: CAPABILITY_SET_VERSION,
          capabilitySetDigest: CAPABILITY_SET_DIGEST, requestedAt: authority.requestedAt })))
      : Buffer.from(canonicalStringify(operation));
    const requestRecord = signControlRecord({ ...expectation, direction: "control-to-coordinator",
      frameType: cancelBeforeOperation ? "cancel-request" : "operation-request", sequence: 1,
      payload: requestPayload }, controlKey);
    pipe.admit(await forward("control-request", () => nativeHost.writeControlRecord(freeze({
      operationId: authority.operationId, authorityToken, record: requestRecord }))));
    if (cancelBeforeOperation) {
      const requestEof = await forward("control-cancel-request-eof", () => nativeHost.endControlRequest(freeze({
        operationId: authority.operationId, authorityToken })));
      if (!exact(requestEof, { direction: "control-to-coordinator", eof: true })) {
        throw fail("control-request-eof-unconfirmed");
      }
      pipe.end("control-to-coordinator");
    }
    const firstResponse = await forward("control-first-response", () => nativeHost.readControlRecord(freeze({
      operationId: authority.operationId, authorityToken })));
    const firstAdmitted = pipe.admit(firstResponse);
    if (firstAdmitted.frame.frameType === "terminal") {
      const terminal = publicGitControlTerminalSchema.parse(JSON.parse(firstResponse.payload.toString("utf8")));
      assertTerminalBinding(terminal, authority, intent,
        cancelBeforeOperation ? "cancelled-before-operation" : "failed-before-proposal");
      const responseEof = await forward("control-early-response-eof", () => nativeHost.readControlResponseEof(freeze({
        operationId: authority.operationId, authorityToken })));
      if (!exact(responseEof, { direction: "coordinator-to-control", eof: true })) {
        throw fail("control-response-eof-unconfirmed");
      }
      pipe.end("coordinator-to-control");
      if (!cancelBeforeOperation) {
        const requestEof = await forward("control-early-request-eof", () => nativeHost.endControlRequest(freeze({
          operationId: authority.operationId, authorityToken })));
        if (!exact(requestEof, { direction: "control-to-coordinator", eof: true })) {
          throw fail("control-request-eof-unconfirmed");
        }
        pipe.end("control-to-coordinator");
      }
      throw fail(terminal.outcome === "cancelled-before-operation" ? "cancelled-before-operation" : "failed-before-proposal");
    }
    if (cancelBeforeOperation || firstAdmitted.frame.frameType !== "operation-proposal") throw fail("proposal-frame-invalid");
    const proposal = publicGitControlProposalSchema.parse(JSON.parse(firstResponse.payload.toString("utf8")));
    if (proposal.operationId !== authority.operationId || proposal.workspaceId !== intent.workspaceId
        || proposal.requestId !== intent.request.requestId || proposal.bindingDigest !== intent.request.bindingDigest
        || proposal.stagingManifestDigest !== canonicalSha256(proposal.workspaceManifest)) {
      throw fail("proposal-binding-invalid");
    }

    const authorityManifestRaw = await forward("publication-authority",
      () => nativeHost.capturePublicationAuthority(freeze({ operationId: authority.operationId,
        authorityToken, operation, proposal })));
    const authorityManifest = publicationAuthorityManifestSchema.parse(JSON.parse(String(authorityManifestRaw)));
    if (!exact(authorityManifest.parentIdentity, setup.publication.parentIdentity)
        || !exact(authorityManifest.staging, setup.publication.staging)
        || !exact(authorityManifest.final, setup.publication.final)) {
      throw fail("native-publication-authority-binding-invalid");
    }
    stage = "database-record-staging";
    const staging = await database.recordStaging(input.context, freeze({ workspaceId: intent.workspaceId,
      expectedRevision: intent.revision, idempotencyKey: intent.request.idempotencyKey,
      bindingDigest: intent.request.bindingDigest, capabilitySetDigest: CAPABILITY_SET_DIGEST,
      operationAuthorityDigest: authority.authorityDigest, fetchClaim: fetchClaim.claim,
      workspaceManifest: proposal.workspaceManifest, publicationAuthorityManifest: authorityManifest,
      publicationResources: { parentResourceId: setup.publication.parentResourceId,
        ingressRootResourceId: setup.publication.ingressRootResourceId,
        stagingRootResourceId: setup.publication.stagingRootResourceId } }));
    if (!staging || staging.lifecycle !== "staging" || staging.revision !== intent.revision + 1) {
      throw fail("database-staging-result-invalid");
    }
    const stagingAuthority = durablePublicationAuthoritySchema.parse(staging.publicationAuthority);
    if (stagingAuthority.state !== "staging-authorized" || stagingAuthority.publicationClaim !== null
        || stagingAuthority.workspaceRevision !== staging.revision) {
      throw fail("database-staging-authority-invalid");
    }
    stagingManifestDigest = proposal.stagingManifestDigest;
    stagingRevision = staging.revision;
    stage = "database-publication-claim";
    publicationBoundaryEntered = true;
    const publicationClaim = claimResultSchema.parse(await database.claimEffect(input.context, freeze({
      operationId: authority.operationId, authorityDigest: authority.authorityDigest, effect: "publication",
      expectedWorkspaceRevision: staging.revision })));
    if (!publicationClaim.created || !publicationClaim.publicationAuthority) throw fail("publication-claim-not-new");
    publicationClaimed = true;
    const durableAuthority = durablePublicationAuthoritySchema.parse(publicationClaim.publicationAuthority);
    if (durableAuthority.parentResourceId !== setup.publication.parentResourceId
        || durableAuthority.ingressRootResourceId !== setup.publication.ingressRootResourceId
        || durableAuthority.stagingRootResourceId !== setup.publication.stagingRootResourceId) {
      throw fail("database-publication-resource-binding-invalid");
    }
    const publicationInput = freeze({ bindingRecord: intent.binding,
      workspaceManifestRaw: canonicalStringify(proposal.workspaceManifest), durableAuthority });
    const publicationOwnershipVerifier = freeze({ operationId: authority.operationId,
      verifyOwnershipReceipt: value => lease.verifyOwnershipReceipt(value) });
    const publication = await forward("publication-move", () => {
      publicationAttempted = true;
      return publish(publicationInput, nativeHost, publicationOwnershipVerifier);
    });
    publicationConfirmed = publication?.filesystemMutationConfirmed === true;
    const readyManifest = workspaceManifestSchema.parse({ ...proposal.workspaceManifest, lifecycle: "ready" });
    if (publication?.classification !== "published-verified" || !publicationConfirmed
        || publication.observedFinalDigest !== canonicalSha256(readyManifest)) {
      throw fail("publication-not-confirmed");
    }
    stage = "database-record-published";
    const pending = await database.recordPublishedPendingDb(input.context, freeze({ workspaceId: intent.workspaceId,
      expectedRevision: staging.revision, idempotencyKey: intent.request.idempotencyKey,
      bindingDigest: intent.request.bindingDigest, capabilitySetDigest: CAPABILITY_SET_DIGEST,
      operationAuthorityDigest: authority.authorityDigest, publicationClaim: durableAuthority.publicationClaim,
      publicationObservation: publication, stagingManifestDigest: proposal.stagingManifestDigest,
      finalManifestDigest: canonicalSha256(readyManifest) }));
    if (!pending || pending.lifecycle !== "published-pending-db" || pending.revision !== staging.revision + 1) {
      throw fail("database-published-result-invalid");
    }
    const observedAuthority = durablePublicationAuthoritySchema.parse(pending.publicationAuthority);
    if (observedAuthority.state !== "published-observed"
        || observedAuthority.workspaceRevision !== pending.revision
        || observedAuthority.publicationClaim?.state !== "observed") {
      throw fail("database-published-authority-invalid");
    }
    const finalize = publicGitFinalizeSchema.parse({ schemaVersion: "runa-public-git-control-finalize/v1",
      operationId: authority.operationId, workspaceId: intent.workspaceId, requestId: intent.request.requestId,
      publicationProposalSha256: canonicalSha256(publication), publishedRevision: pending.revision });
    const finalizeRecord = signControlRecord({ ...expectation, direction: "control-to-coordinator",
      frameType: "finalize", sequence: 2, payload: Buffer.from(canonicalStringify(finalize)) }, controlKey);
    pipe.admit(await forward("control-finalize", () => nativeHost.writeControlRecord(freeze({
      operationId: authority.operationId, authorityToken, record: finalizeRecord }))));
    const requestEof = await forward("control-request-eof", () => nativeHost.endControlRequest(freeze({
      operationId: authority.operationId, authorityToken })));
    if (!exact(requestEof, { direction: "control-to-coordinator", eof: true })) {
      throw fail("control-request-eof-unconfirmed");
    }
    pipe.end("control-to-coordinator");
    const terminalRecord = await forward("control-terminal", () => nativeHost.readControlRecord(freeze({
      operationId: authority.operationId, authorityToken })));
    const admittedTerminal = pipe.admit(terminalRecord);
    const terminal = publicGitControlTerminalSchema.parse(JSON.parse(terminalRecord.payload.toString("utf8")));
    if (admittedTerminal.frame.frameType !== "terminal") {
      throw fail("control-terminal-invalid");
    }
    assertTerminalBinding(terminal, authority, intent, "finalized");
    const responseEof = await forward("control-response-eof", () => nativeHost.readControlResponseEof(freeze({
      operationId: authority.operationId, authorityToken })));
    if (!exact(responseEof, { direction: "coordinator-to-control", eof: true })) {
      throw fail("control-response-eof-unconfirmed");
    }
    pipe.end("coordinator-to-control"); controlKey.fill(0);
    const exits = await forward("children-exit", () => nativeHost.waitForChildrenExit(freeze({
      operationId: authority.operationId, authorityToken })));
    if (!exits || exits.operationId !== authority.operationId || exits.activeProcesses !== 0
        || exits.workerControlKeysZeroized !== true || exits.gitKeyCopiesZeroized !== true
        || exits.brokerSocketsOpen !== 0) throw fail("children-exit-invalid");
    const reconciliation = await forward("publication-reconcile", () => reconcile({ ...publicationInput,
      durableAuthority: observedAuthority }, nativeHost, publicationOwnershipVerifier));
    if (reconciliation?.classification !== "published-exact"
        || reconciliation?.proposedAction !== "complete-ready-cas") {
      throw fail("publication-reconciliation-invalid");
    }
    const cleanup = await lease.completeSuccessCleanup(freeze({ operationId: authority.operationId,
      authorityToken, reconciliation, maximumCallMs: 10_000, mutationReplayAllowed: false }));
    if (!cleanup || cleanup.operationId !== authority.operationId || cleanup.activeProcesses !== 0
        || cleanup.reconciliationMismatchCount !== 0 || cleanup.cleanupState !== "complete"
        || cleanup.nonFinalResourcesRemaining !== 0 || cleanup.authorityTimerClosed !== true
        || cleanup.authorityWaitClosed !== true) throw fail("success-cleanup-invalid");
    bootstrapSet.destroy();
    const evidence = makeReadyEvidence({ authority, intent, proposal, pendingRevision: pending.revision,
      readyManifest, cleanup, releaseDigest });
    stage = "database-record-ready";
    const ready = await lease.runReadyCas(freeze({ operationId: authority.operationId,
      readyCasToken: cleanup.readyCasToken, effect: () => database.recordReady(input.context, freeze({
        workspaceId: intent.workspaceId, expectedRevision: pending.revision,
        idempotencyKey: intent.request.idempotencyKey, bindingDigest: intent.request.bindingDigest,
        capabilitySetDigest: CAPABILITY_SET_DIGEST, operationAuthorityDigest: authority.authorityDigest,
        receipt: evidence.receipt, operationReceipt: evidence.operationReceipt,
        workspaceManifestRaw: canonicalStringify(readyManifest) })) }));
    if (!ready || ready.lifecycle !== "ready" || ready.changed !== true
        || ready.revision !== pending.revision + 1) throw fail("database-ready-result-invalid");
    await lease.release(freeze({ operationId: authority.operationId, terminal: "ready" }));
    return freeze({ schemaVersion: "runa-public-git-control-composition-result/v2",
      operationId: authority.operationId, disposition: "created", workspaceId: intent.workspaceId,
      lifecycle: "ready", revision: ready.revision,
      terminalReceiptSha256: canonicalSha256(evidence.operationReceipt), actualNativeControlProofRequired: true });
  } catch (error) {
    try { bootstrapSet?.destroy(); } catch {}
    try { controlKey?.fill(0); } catch {}
    let teardownError = null;
    try { await lease.beginImmediateTeardown(freeze({ operationId: authority.operationId,
      causeCode: error?.code ?? "control-worker-failure" })); } catch (candidate) { teardownError = candidate; }
    let recovery;
    try {
      recovery = await lease.recover(freeze({ operationId: authority.operationId,
        causeCode: error?.code ?? "control-worker-failure", maximumCallMs: 10_000,
        callsSerialized: true, minimumReobserveMs: 5_000, mutationReplayAllowed: false }));
    } catch (candidate) {
      throw fail("recovery-unsettled", new AggregateError([error, teardownError, candidate].filter(Boolean)));
    }
    if (teardownError || recovery?.settled !== true || recovery.activeProcesses !== 0
        || recovery.reconciliationMismatchCount !== 0 || recovery.cleanupState !== "complete"
        || recovery.authorityTimerClosed !== true || recovery.authorityWaitClosed !== true) {
      throw fail("recovery-unsettled", new AggregateError([error, teardownError].filter(Boolean)));
    }
    if (publicationBoundaryEntered || publicationClaimed || publicationAttempted || publicationConfirmed) {
      try {
        const lookup = lookupSchema.parse(await database.lookupMaterializationByOperation(input.context,
          freeze({ operationId: authority.operationId, authorityDigest: authority.authorityDigest })));
        if (!lookup.found || lookup.requestScopeDigest !== intent.requestScopeDigest
            || lookup.operationAuthority.operationId !== authority.operationId
            || lookup.operationAuthority.authorityDigest !== authority.authorityDigest
            || lookup.workspace?.workspaceId !== intent.workspaceId) {
          throw fail("publication-retention-lookup-invalid");
        }
        const lifecycle = lookup.workspace?.lifecycle;
        if (lifecycle === "ready") {
          const retainedReceipt = materializationReceiptSchema.parse(lookup.workspaceReceipt);
          if (retainedReceipt.outcome !== "ready" || lookup.operationReceipt === null
              || retainedReceipt.workspaceId !== intent.workspaceId
              || retainedReceipt.taskId !== authority.operationId
              || retainedReceipt.bindingDigest !== intent.request.bindingDigest
              || retainedReceipt.finalManifestDigest !== lookup.workspace.finalManifestDigest) {
            throw fail("publication-retained-ready-invalid");
          }
          await lease.release(freeze({ operationId: authority.operationId, terminal: "ready" }));
          return freeze({ schemaVersion: "runa-public-git-control-composition-result/v2",
            operationId: authority.operationId, disposition: "reconciled-ready-response-loss",
            workspaceId: intent.workspaceId, lifecycle: "ready", revision: lookup.workspace.revision,
            terminalReceiptSha256: canonicalSha256(lookup.operationReceipt),
            actualNativeControlProofRequired: true });
        }
        if (!["unknown", "cleanup-pending"].includes(lifecycle)) {
          if (!["staging", "published-pending-db"].includes(lifecycle)) {
            throw fail("publication-retention-state-invalid");
          }
          const finishedAt = utc.parse(recovery.completedAt);
          const receipt = makeUnknownReceipt({ authority, intent, releaseDigest, stagingManifestDigest, finishedAt });
          const retained = await lease.runUnknownCas(freeze({ operationId: authority.operationId,
            retentionCasToken: recovery.retentionCasToken,
            effect: () => database.recordUnknown(input.context, freeze({ workspaceId: intent.workspaceId,
              expectedRevision: lookup.workspace.revision, idempotencyKey: intent.request.idempotencyKey,
              bindingDigest: intent.request.bindingDigest, capabilitySetDigest: CAPABILITY_SET_DIGEST,
              operationAuthorityDigest: authority.authorityDigest, receipt })) }));
          if (!retained || retained.changed !== true || retained.lifecycle !== "unknown") {
            throw fail("publication-retention-cas-invalid");
          }
        }
      } catch (retentionError) {
        throw fail("publication-recovery-retained",
          new AggregateError([error, retentionError], "publication ownership retained"));
      }
      throw fail("publication-recovery-retained", error);
    }
    const cancelled = error?.code === "control-worker-cancelled-before-operation";
    const finishedAt = utc.parse(recovery.completedAt);
    const receipt = makeFailureReceipt({ authority, intent, releaseDigest, cancelled,
      stagingManifestDigest, finishedAt, errorCode: failureErrorCode(stage) });
    let terminal;
    try {
      terminal = await lease.runTerminalCas(freeze({ operationId: authority.operationId,
        terminalCasToken: recovery.terminalCasToken,
        effect: () => database[cancelled ? "recordCancelled" : "recordFailed"](input.context, freeze({
          workspaceId: intent.workspaceId, expectedRevision: stagingRevision,
          idempotencyKey: intent.request.idempotencyKey, bindingDigest: intent.request.bindingDigest,
          capabilitySetDigest: CAPABILITY_SET_DIGEST, operationAuthorityDigest: authority.authorityDigest,
          receipt })) }));
    } catch (terminalError) {
      throw fail("recovery-terminal-cas-failed", new AggregateError([error, terminalError]));
    }
    if (!terminal || terminal.changed !== true || terminal.lifecycle !== (cancelled ? "cancelled" : "failed")) {
      throw fail("recovery-terminal-cas-invalid", error);
    }
    await lease.release(freeze({ operationId: authority.operationId,
      terminal: cancelled ? "cancelled" : "failed" }));
    throw error;
  }
}

function createComposition(options, test = null) {
  const { database, nativeHost, watchdog, workerReleaseSha256 } = options ?? {};
  requireMethods(database, REQUIRED_DATABASE, "database-port-invalid");
  requireMethods(nativeHost, REQUIRED_NATIVE, "native-host-port-invalid");
  if (!watchdog || typeof watchdog.beginOperation !== "function"
      || typeof watchdog.openRetainedOperation !== "function"
      || typeof watchdog.resumeRetainedRecovery !== "function") throw fail("watchdog-port-invalid");
  const releaseDigest = digest.parse(workerReleaseSha256);
  if (test !== null && test.token !== TEST_TOKEN) throw fail("test-composition-denied");
  const idsFactory = test?.idsFactory ?? identifiers;
  const keyFactory = test?.keyFactory ?? keys;
  const publish = test?.publish ?? publishWorkspaceNoReplaceOwned;
  const reconcile = test?.reconcile ?? reconcileWorkspacePublicationOwned;
  const cancelBeforeOperation = test?.cancelBeforeOperation === true;

  return freeze({
    async materialize(rawInput) {
      const input = materializeInputSchema.parse(rawInput);
      const admission = materializationAdmissionResultSchema.parse(await database.admitMaterializationRequest(
        input.context, freeze({ sourceId: input.sourceId, operationMode: "public-git" })));
      if (admission.disposition !== "absent") {
        const retained = await openRetained({ database, watchdog, context: input.context, locator: admission });
        return retainedResult(admission.disposition, admission, retained);
      }

      const lease = await watchdog.beginOperation(freeze({ schemaVersion: "runa-public-git-watchdog-lease-request/v1",
        operationMode: "public-git", requestScopeDigest: admission.requestScopeDigest,
        sourceRevision: admission.sourceRevision }));
      requireMethods(lease, REQUIRED_LEASE, "watchdog-lease-invalid");
      let issued;
      try {
        issued = issuedAuthorityResultSchema.parse(await lease.issueAndArmOperationAuthority(freeze({
          operationMode: "public-git", durationMs: MATERIALIZATION_DEADLINE_MS,
          topologyDigest: PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST,
          capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
          workerReleaseSha256: releaseDigest })));
      } catch (issueError) {
        let settlement;
        try {
          settlement = watchdogUnissuedLeaseSettlementSchema.parse(await lease.settleUnissuedFailure(freeze({
            reason: "authority-issue-or-arm-failed" })));
          if (await lease.verifyUnissuedSettlement(settlement) !== true) {
            throw fail("unissued-lease-settlement-unverified");
          }
        } catch (settlementError) {
          throw fail("unissued-lease-settlement-unknown", new AggregateError([issueError, settlementError]));
        }
        throw issueError;
      }
      const authority = issued.operationAuthority;
      if (authority.workerReleaseSha256 !== releaseDigest
          || authority.topologyDigest !== PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST) {
        await closeUnusedLease(lease, authority.authorityDigest, "authority-constraint-mismatch");
        throw fail("watchdog-authority-constraint-mismatch");
      }
      let begun;
      try {
        begun = beginResultSchema.parse(await database.beginMaterialization(input.context, freeze({
          sourceId: input.sourceId, requestScopeDigest: admission.requestScopeDigest,
          operationAuthority: authority }))) ;
      } catch (beginError) {
        return resolveBeginResponseLoss({ database, watchdog, lease, context: input.context,
          sourceId: input.sourceId, authority, beginError });
      }
      if (!begun.created) {
        const existingAuthority = begun.disposition === "converged-existing"
          ? begun.existingOperationAuthority : begun.operationAuthority;
        if (begun.disposition === "converged-existing") {
          await closeUnusedLease(lease, begun.unusedAuthorityDigest, "idempotency-converged");
        }
        const locator = { disposition: "existing", requestScopeDigest: admission.requestScopeDigest,
          operationId: existingAuthority.operationId, authorityDigest: existingAuthority.authorityDigest,
          attestation: existingAuthority.attestation };
        const retained = await openRetained({ database, watchdog, context: input.context, locator });
        return retainedResult(begun.disposition, locator, retained);
      }
      const intent = begun.workspace;
      if (!exact(begun.operationAuthority, authority)
          || intent.operationAuthorityDigest !== authority.authorityDigest
          || intent.requestScopeDigest !== admission.requestScopeDigest) {
        throw fail("database-intent-result-invalid");
      }
      return runCreatedOperation({ database, nativeHost, lease, authorityToken: issued.authorityToken,
        authority, intent, input, releaseDigest, idsFactory, keyFactory, publish, reconcile,
        cancelBeforeOperation });
    },
  });
}

export function createPublicGitControlWorkerComposition(options) { return createComposition(options); }
export function createPublicGitControlWorkerCompositionForTest(options, overrides) {
  return createComposition(options, { ...overrides, token: TEST_TOKEN });
}

export const controlWorkerCompositionProofBoundary = freeze({
  deterministicPreflightOnly: true, actualWindowsControlProofRequired: true, browserAcceptanceRequired: true,
  rawHandlesAcceptedByComposition: false, watchdogIssuesClockAndOperationIdentity: true,
  retainedLocatorRequiresDatabaseAndWatchdogMatch: true, effectsRequireDurableClaims: true,
  modelInvokedByThisModule: false, productionChangedByThisModule: false,
});
