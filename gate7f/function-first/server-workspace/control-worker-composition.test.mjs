import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, MATERIALIZATION_POLICY_DIGEST,
  MATERIALIZATION_POLICY_ID, NETWORK_POLICY_DIGEST, NETWORK_POLICY_ID,
  bindingDigestFor, canonicalSha256, canonicalStringify, fileSetDigest,
} from "./materialization-contracts.mjs";
import {
  PUBLIC_GIT_CHILD_HANDLE_COUNTS, PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY,
  PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST, PUBLIC_GIT_ENVIRONMENT_NAMES,
  PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT,
  createPublicGitControlWorkerCompositionForTest,
} from "./control-worker-composition.mjs";

const sha = value => createHash("sha256").update(String(value)).digest("hex");
const START = "2026-09-04T12:00:00.000Z";
const FINISHED = "2026-09-04T12:00:01.000Z";
const DEADLINE = "2026-09-04T12:02:00.000Z";
const SOURCE_ID = "source-00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "workspace-00000000-0000-4000-8000-000000000001";
const OPERATION_ID = "operation-00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "request-00000000-0000-4000-8000-000000000001";
const SCOPE_DIGEST = sha("request-scope");
const RELEASE_DIGEST = sha("worker-release");
const CONTEXT = Object.freeze({ principalId: "principal", projectId: "project", sessionId: "session" });
const KEY = Buffer.alloc(32, 7);
const NONCE = "a".repeat(64);
const CHANNELS = Object.freeze({ controlCoordinator: "channel-control-00000001",
  coordinatorMaterializer: "channel-materializer-0001", coordinatorBroker: "channel-broker-00000001" });

function operationAuthority(overrides = {}) {
  const unsigned = { schemaVersion: "runa-public-git-operation-authority/v1", operationId: OPERATION_ID,
    taskId: OPERATION_ID, operationMode: "public-git", requestedAt: START, deadlineAt: DEADLINE,
    topologyDigest: PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST, capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST, workerReleaseSha256: RELEASE_DIGEST, ...overrides };
  const authorityDigest = canonicalSha256(unsigned);
  return { ...unsigned, authorityDigest, attestation: {
    schemaVersion: "runa-public-git-operation-authority-attestation/v1", algorithm: "ed25519",
    signingKeyId: "control-watchdog-authority-0001", signingKeyVersion: 1,
    watchdogIdentitySha256: sha("watchdog"), authorityDigest,
    signatureBase64: Buffer.alloc(64, 5).toString("base64") } };
}

function source() {
  return { schemaVersion: "runa-workspace-source-selection/v1", sourceId: SOURCE_ID,
    projectId: "project_00000001", participantId: "participant_0001", environmentId: "environment_0001",
    displayName: "Synthetic public Git", lifecycle: "enabled", cleanupState: "not-required",
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    revision: 4, createdAt: START, updatedAt: START, revokedAt: null, sourceKind: "git-public-https",
    repositoryHttpsUrl: "https://example.com/org/fixture.git", requestedRef: "refs/heads/main",
    endpointPolicyId: NETWORK_POLICY_ID, endpointPolicyDigest: NETWORK_POLICY_DIGEST };
}

function intent(authority = operationAuthority()) {
  const selected = source();
  const binding = { schemaVersion: "runa-workspace-binding/v1", participantId: selected.participantId,
    projectId: selected.projectId, environmentId: selected.environmentId, sourceId: selected.sourceId,
    taskId: authority.operationId, sourceRevision: selected.revision,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST };
  const request = { schemaVersion: "runa-workspace-materialization-request/v1", requestId: REQUEST_ID,
    idempotencyKey: SCOPE_DIGEST, sourceId: SOURCE_ID, taskId: authority.operationId,
    bindingDigest: bindingDigestFor(binding), expectedSourceRevision: selected.revision,
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    requestedRef: selected.requestedRef, uploadSessionId: null, uploadManifestDigest: null,
    limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
    createdAt: authority.requestedAt, deadlineAt: authority.deadlineAt };
  return { workspaceId: WORKSPACE_ID, lifecycle: "intent-recorded", revision: 1,
    cleanupState: "not-required", requestScopeDigest: SCOPE_DIGEST,
    operationAuthorityDigest: authority.authorityDigest, source: selected, binding, request,
    expectedCommitOid: "1".repeat(40) };
}

function manifest(workspace = intent(), lifecycle = "staging") {
  const entries = [{ path: "README.md", bytes: 5, sha256: sha("hello"), mediaClass: "utf8-text" }];
  return { schemaVersion: "runa-workspace-manifest/v1", workspaceId: workspace.workspaceId,
    sourceId: workspace.source.sourceId, bindingDigest: workspace.request.bindingDigest,
    sourceKind: "git-public-https", nativeVersionKind: "git-commit-sha1", nativeVersion: workspace.expectedCommitOid,
    entries, fileSetDigest: fileSetDigest(entries), excludedCount: 0, rejectedCount: 0, complete: true,
    adapterReleaseSha256: sha("adapter"), runtimeReleaseSha256: sha("runtime"), brokerReleaseSha256: sha("broker"),
    capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
    limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
    lifecycle, createdAt: workspace.request.createdAt,
    expiresAt: new Date(Date.parse(workspace.request.createdAt) + 1_800_000).toISOString() };
}

function publicationManifest(workspace = intent()) {
  const staged = manifest(workspace);
  return { schemaVersion: "runa-workspace-publication-authority-manifest/v1", workspaceId: workspace.workspaceId,
    workspaceManifestDigest: canonicalSha256(staged),
    parentIdentity: { volumeSerial: "1234abcd", fileId: "1".repeat(16) },
    staging: { name: `s${"1".repeat(31)}`, identity: { volumeSerial: "1234abcd", fileId: "2".repeat(16) } },
    final: { name: `f${"2".repeat(31)}`, expectedIdentity: { volumeSerial: "1234abcd", fileId: "2".repeat(16) } },
    files: [{ path: "README.md", bytes: 5, sha256: sha("hello"),
      identity: { volumeSerial: "1234abcd", fileId: "3".repeat(16) } }] };
}

function claim(effect, state = "claimed") {
  const claimedAt = START, claimId = `claim-${effect.replace("-", "")}-00000001`;
  const claimDigest = canonicalSha256({ schemaVersion: "runa-workspace-effect-claim/v1", operationId: OPERATION_ID,
    effect, claimId, claimRevision: 1, claimedAt });
  return { schemaVersion: "runa-workspace-effect-claim/v1", operationId: OPERATION_ID, effect, claimId,
    claimRevision: 1, state, claimDigest, claimedAt, updatedAt: state === "claimed" ? START : FINISHED };
}

function ownershipReceipt(resourceCount = PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT) {
  return { schemaVersion: "runa-public-git-raw-handle-ownership-receipt/v1", operationId: OPERATION_ID,
    batchId: "handle-batch-00000001", batchRevision: 1, resourceCount, batchDigest: sha("batch"),
    ownershipCommitted: true, ledgerRevision: 1, watchdogProcessIdentitySha256: sha("watchdog-process"),
    receiptHmac: sha("receipt-hmac") };
}

function publicationOwnedResult(result, resources, batchOrdinal) {
  const batchId = `publication-batch-${String(batchOrdinal).padStart(4, "0")}`;
  return { schemaVersion: "runa-publication-inspection-owned-result/v1", operationId: OPERATION_ID, result,
    ownershipBatches: resources.length === 0 ? [] : [{
      schemaVersion: "runa-publication-inspection-owned-batch/v1", operationId: OPERATION_ID,
      phase: "publication-inspection", ownedResources: resources,
      ownedResourcesDigest: canonicalSha256(resources),
      ownershipReceipt: { ...ownershipReceipt(resources.length), batchId,
        batchDigest: sha(`raw-${batchId}`), ledgerRevision: batchOrdinal } }] };
}

function nativeSetup({ includeRawHandle = false, omitOwnedResource = false,
  spliceControlResource = false, spliceOwnedResource = false, spliceSourceProcess = false } = {}) {
  let index = 0;
  const next = prefix => `${prefix}_${String(++index).padStart(8, "0")}`;
  const ownedResources = [];
  const own = (internalResourceId, nativeObjectType, role, child, direction) => {
    ownedResources.push({ internalResourceId, nativeObjectType, role, child, direction, sourceProcessId: 4242 });
    return internalResourceId;
  };
  const jobResourceId = next("job_resource");
  own(jobResourceId, "job", "operation-job", "control", "none");
  const children = Object.entries(PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY).map(([child, descriptors]) => {
    const processResourceId = next("process"), primaryThreadResourceId = next("thread");
    own(processResourceId, "process", "child-process", child, "none");
    own(primaryThreadResourceId, "thread", "child-primary-thread", child, "none");
    const inheritedResources = descriptors.map(descriptor => {
      const internalResourceId = next("native_resource");
      own(internalResourceId, descriptor.kind === "directory-handle" ? "directory" : "pipe",
        descriptor.kind === "directory-handle" ? "inherited-directory"
          : descriptor.kind === "bootstrap-endpoint" ? "bootstrap-pipe" : "inherited-pipe",
        child, descriptor.direction);
      return { internalResourceId, descriptor };
    });
    return { child, processResourceId, primaryThreadResourceId, suspended: true, assignedToJob: true,
      environmentNames: [...PUBLIC_GIT_ENVIRONMENT_NAMES],
      network: child === "ingress-broker" ? "tls-broker-only" : "deny-all", inheritedResources };
  });
  const inherited = children.flatMap(child => child.inheritedResources);
  const controlResources = inherited.map(resource => {
    const internalResourceId = next("control_resource");
    const role = resource.descriptor.role === "held-ingress-root" ? "publication-ingress-root"
      : resource.descriptor.role === "held-staging-root" ? "publication-staging-root"
        : resource.descriptor.kind === "bootstrap-endpoint" ? "bootstrap-pipe" : "control-parent-duplicate";
    own(internalResourceId, resource.descriptor.kind === "directory-handle" ? "directory" : "pipe",
      role, "control", resource.descriptor.direction);
    return { internalResourceId, counterpartResourceId: resource.internalResourceId,
      descriptor: resource.descriptor };
  });
  if (spliceControlResource) controlResources[0].counterpartResourceId = inherited[1].internalResourceId;
  const parentResourceId = next("parent_resource");
  own(parentResourceId, "directory", "publication-parent", "control", "none");
  const watchdogResources = { operationTokenResourceId: next("operation_token"),
    authorityTimerResourceId: next("authority_timer"), authorityEventResourceId: next("authority_event") };
  own(watchdogResources.operationTokenResourceId, "token", "operation-token", "control", "none");
  own(watchdogResources.authorityTimerResourceId, "timer", "authority-timer", "control", "none");
  own(watchdogResources.authorityEventResourceId, "event", "authority-event", "control", "none");
  if (spliceOwnedResource) ownedResources[5].internalResourceId = ownedResources[4].internalResourceId;
  if (spliceSourceProcess) ownedResources[10].sourceProcessId = 9999;
  if (omitOwnedResource) ownedResources.splice(7, 1);
  const ingressRootResourceId = controlResources.find(resource =>
    resource.descriptor.role === "held-ingress-root").internalResourceId;
  const stagingRootResourceId = controlResources.find(resource =>
    resource.descriptor.role === "held-staging-root").internalResourceId;
  return { schemaVersion: "runa-public-git-native-setup/v2", operationId: OPERATION_ID,
    topologyDigest: PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST, nativeHostProcessId: 4242,
    childHandleCounts: PUBLIC_GIT_CHILD_HANDLE_COUNTS,
    bootstrapPipeCount: 5, jobResourceId, children, controlResources, watchdogResources,
    publication: { parentResourceId, ingressRootResourceId, stagingRootResourceId,
      parentIdentity: publicationManifest().parentIdentity, staging: publicationManifest().staging,
      final: publicationManifest().final }, ownedResources,
    ownedResourcesDigest: canonicalSha256(ownedResources), ownershipReceipt: ownershipReceipt(ownedResources.length),
    ...(includeRawHandle ? { rawHandleHex: "00000000000001c8" } : {}) };
}

function controlRecord({ direction, frameType, payload, sequence }) {
  const bytes = Buffer.from(canonicalStringify(payload));
  const unsigned = { schemaVersion: "runa-materialization-pipe-frame/v2", channelId: CHANNELS.controlCoordinator,
    sequence, requestId: REQUEST_ID, nonce: NONCE, payloadSha256: sha(bytes), payloadBytes: bytes.length,
    direction, frameType };
  return { rawHeader: Buffer.from(canonicalStringify({ ...unsigned,
    hmacSha256: createHmac("sha256", KEY).update(canonicalStringify(unsigned)).update(bytes).digest("hex") })),
  payload: bytes };
}

function proposal(workspace = intent()) {
  const workspaceManifest = manifest(workspace);
  return { schemaVersion: "runa-public-git-control-proposal/v1", operationId: OPERATION_ID,
    workspaceId: WORKSPACE_ID, requestId: REQUEST_ID, bindingDigest: workspace.request.bindingDigest,
    workspaceManifest, stagingManifestDigest: canonicalSha256(workspaceManifest), stagingFlushed: true,
    gitTerminalEof: true, gitKeyCopiesZeroized: true, brokerSocketsClosed: true,
    controlChannelsQuiescent: true, privateValuesIncluded: false, modelInvoked: false };
}

function terminal(outcome = "finalized", sequence = 2, overrides = {}) {
  return controlRecord({ direction: "coordinator-to-control", frameType: "terminal", sequence, payload: {
    schemaVersion: "runa-public-git-control-terminal/v1", operationId: OPERATION_ID,
    workspaceId: WORKSPACE_ID, requestId: REQUEST_ID, outcome, materializerTerminalEof: true,
    brokerTerminalEof: true, workerControlKeysZeroized: true, privateValuesIncluded: false,
    modelInvoked: false, ...overrides } });
}

function durableAuthority({ workspace = intent(), state = "staging-authorized", revision = 2 } = {}) {
  const authorityManifest = publicationManifest(workspace);
  const setup = nativeSetup();
  const publicationClaim = state === "staging-authorized" ? null
    : claim("publication", state === "published-observed" ? "observed" : "claimed");
  return { schemaVersion: "runa-workspace-durable-publication-authority/v1",
    operationId: OPERATION_ID, workspaceId: WORKSPACE_ID, workspaceRevision: revision,
    operationAuthorityDigest: operationAuthority().authorityDigest,
    requestDigest: canonicalSha256(workspace.request), bindingDigest: workspace.request.bindingDigest,
    authorityManifest, authorityManifestDigest: canonicalSha256(authorityManifest),
    parentResourceId: setup.publication.parentResourceId,
    ingressRootResourceId: setup.publication.ingressRootResourceId,
    stagingRootResourceId: setup.publication.stagingRootResourceId, publicationClaim,
    workspaceLifecycle: state === "published-observed" ? "published-pending-db" : "staging", state };
}

function publicationObservation() {
  const ready = manifest(intent(), "ready");
  return { schemaVersion: "runa-workspace-publication-proposal/v1", classification: "published-verified",
    proposedAction: "record-published-pending-db",
    reason: "owned-non-replacing-write-through-move-reopened-and-verified",
    databaseMutationPerformed: false, receiptAuthored: false, filesystemMutationAttempted: true,
    filesystemMutationConfirmed: true, deletionAuthorized: false,
    observedFinalIdentity: publicationManifest().final.expectedIdentity,
    observedFinalDigest: canonicalSha256(ready),
    databaseTransitionProposal: { from: "staging", to: "published-pending-db", expectedRevision: 2 } };
}

function preResume(setup = nativeSetup()) {
  return { schemaVersion: "runa-public-git-pre-resume/v2", operationId: OPERATION_ID,
    topologyDigest: PUBLIC_GIT_CHILD_HANDLE_TOPOLOGY_DIGEST,
    assignedChildren: ["coordinator", "materializer", "ingress-broker"],
    suspendedChildren: ["coordinator", "materializer", "ingress-broker"],
    unintendedParentEndpointsClosed: true,
    ownedResourceIds: setup.ownedResources.map(resource => resource.internalResourceId),
    ownedResourcesDigest: setup.ownedResourcesDigest, ownershipReceipt: setup.ownershipReceipt };
}

function unusedClosure(authorityDigest = operationAuthority().authorityDigest) {
  return { schemaVersion: "runa-watchdog-unused-lease-closure/v1", authorityDigest,
    databaseBound: false, ownedResourceCount: 0, authorityTimerClosed: true, authorityWaitClosed: true,
    ledgerState: "unused-closed", ledgerRevision: 2, closedAt: FINISHED, receiptHmac: sha("closure") };
}

function exactLookup(workspace = intent(), authority = operationAuthority(), overrides = {}) {
  return { found: true, disposition: "exact", requestScopeDigest: SCOPE_DIGEST,
    operationAuthority: authority, workspace, effectClaims: [], publicationAuthority: null,
    workspaceReceipt: null, operationReceipt: null, ...overrides };
}

function createFixture(options = {}) {
  const events = [];
  const authority = options.authority ?? operationAuthority();
  const workspace = intent(authority);
  const proposed = proposal(workspace);
  const candidateProposal = options.proposalDigestMismatch
    ? { ...proposed, stagingManifestDigest: sha("wrong-staging-manifest") } : proposed;
  const setup = nativeSetup({ includeRawHandle: options.includeRawHandle,
    omitOwnedResource: options.omitOwnedResource, spliceControlResource: options.spliceControlResource,
    spliceOwnedResource: options.spliceOwnedResource, spliceSourceProcess: options.spliceSourceProcess });
  let readCount = 0, currentWorkspace = workspace, moved = false, ownedResourceOrdinal = 0;
  let publicationBatchOrdinal = 0;
  let publishedInput = null, currentWorkspaceReceipt = null, currentOperationReceipt = null;
  const database = {
    async admitMaterializationRequest(context, input) {
      events.push(`db:admit:${input.sourceId}`);
      return options.admission ?? { disposition: "absent", requestScopeDigest: SCOPE_DIGEST,
        sourceRevision: workspace.source.revision };
    },
    async beginMaterialization() {
      events.push("db:begin");
      if (options.beginError) throw options.beginError;
      return options.begin ?? { created: true, disposition: "created", operationAuthority: authority, workspace };
    },
    async lookupMaterializationByOperation() {
      events.push("db:lookup");
      return options.lookup ?? exactLookup(currentWorkspace, authority, {
        workspaceReceipt: currentWorkspaceReceipt, operationReceipt: currentOperationReceipt });
    },
    async claimEffect(_context, input) {
      events.push(`db:claim:${input.effect}`);
      if (input.effect === "publication" && options.publicationClaimError) throw options.publicationClaimError;
      const effectClaim = claim(input.effect);
      return input.effect === "publication"
        ? { created: options.publicationClaimCreated ?? true, claim: effectClaim,
          publicationAuthority: durableAuthority({ workspace, state: "publication-claimed", revision: 2 }) }
        : { created: options.fetchClaimCreated ?? true, claim: effectClaim };
    },
    async recordStaging() {
      events.push("db:staging");
      currentWorkspace = { ...workspace, changed: true, lifecycle: "staging", revision: 2,
        stagingManifestDigest: candidateProposal.stagingManifestDigest,
        publicationAuthority: durableAuthority({ workspace, state: "staging-authorized", revision: 2 }) };
      return currentWorkspace;
    },
    async recordPublishedPendingDb(_context, input) {
      events.push("db:published");
      publishedInput = input;
      if (options.malformedPublishedResult) return { lifecycle: "published-pending-db" };
      currentWorkspace = { ...workspace, changed: true, lifecycle: "published-pending-db", revision: 3,
        stagingManifestDigest: candidateProposal.stagingManifestDigest,
        finalManifestDigest: publicationObservation().observedFinalDigest,
        publicationAuthority: durableAuthority({ workspace, state: "published-observed", revision: 3 }) };
      return currentWorkspace;
    },
    async recordReady(_context, input) { events.push("db:ready"); currentWorkspaceReceipt = input.receipt;
      currentOperationReceipt = input.operationReceipt; currentWorkspace = { ...currentWorkspace,
        changed: true, lifecycle: "ready", revision: 4, workspaceManifest: JSON.parse(input.workspaceManifestRaw) };
      if (options.readyResponseLost) throw new Error("ready-response-lost");
      return currentWorkspace; },
    async recordFailed() { events.push("db:failed"); return { changed: true, lifecycle: "failed", revision: 2 }; },
    async recordCancelled() { events.push("db:cancelled"); return { changed: true, lifecycle: "cancelled", revision: 2 }; },
    async recordUnknown(_context, input) { events.push("db:unknown"); currentWorkspaceReceipt = input.receipt;
      currentOperationReceipt = null; currentWorkspace = { ...currentWorkspace,
      changed: true, lifecycle: "unknown", cleanupState: "indeterminate", revision: input.expectedRevision + 1,
      receipt: input.receipt }; return currentWorkspace; },
  };
  const lease = {
    async issueAndArmOperationAuthority() {
      events.push("lease:issue");
      if (options.issueError) throw options.issueError;
      return { authorityToken: "authority_token_0001", operationAuthority: authority };
    },
    async settleUnissuedFailure() { events.push("lease:settle-unissued"); return {
      schemaVersion: "runa-watchdog-unissued-lease-settlement/v1", disposition: "unused-closed",
      leaseId: "watchdog-lease-00000001", databaseBound: false, ownedResourceCount: 0,
      authorityTimerClosed: true, authorityWaitClosed: true, ledgerRevision: 1,
      settledAt: FINISHED, receiptHmac: sha("unissued") }; },
    async verifyUnissuedSettlement() { events.push("lease:verify-unissued");
      return options.unissuedSettlementValid ?? true; },
    async closeUnused(input) { events.push("lease:close-unused"); return unusedClosure(input.expectedAuthorityDigest); },
    async runForward(input) { events.push(`forward:${input.stage}`); return input.effect(); },
    async beginImmediateTeardown() { events.push("lease:teardown"); },
    async recover() { events.push("lease:recover"); return { settled: true, activeProcesses: 0,
      reconciliationMismatchCount: 0, cleanupState: "complete", authorityTimerClosed: true,
      authorityWaitClosed: true, completedAt: FINISHED, terminalCasToken: "terminal_cas_0001",
      retentionCasToken: "retention_cas_0001" }; },
    async verifyUnusedClosure() { events.push("lease:verify-unused"); return options.unusedClosureValid ?? true; },
    async verifyOwnershipReceipt(input) { events.push("lease:verify-ownership");
      if (options.ownershipValid === false) return false;
      if (input.receipt.batchId.startsWith("publication-batch-")) {
        return input.receipt.operationId === OPERATION_ID
          && input.receipt.resourceCount === input.internalResourceIds.length;
      }
      return input.receipt.resourceCount === input.internalResourceIds.length
        && input.ownedResourcesDigest === setup.ownedResourcesDigest
        && canonicalSha256(input.internalResourceIds) === canonicalSha256(
          setup.ownedResources.map(resource => resource.internalResourceId)); },
    async completeSuccessCleanup() { events.push("lease:success-cleanup"); return { operationId: OPERATION_ID,
      activeProcesses: 0, reconciliationMismatchCount: 0, cleanupState: "complete",
      nonFinalResourcesRemaining: 0, authorityTimerClosed: true, authorityWaitClosed: true,
      completedAt: FINISHED, readyCasToken: "ready_cas_0000001" }; },
    async runReadyCas(input) { events.push("lease:ready-cas"); return input.effect(); },
    async runTerminalCas(input) { events.push("lease:terminal-cas"); return input.effect(); },
    async runUnknownCas(input) { events.push("lease:unknown-cas"); return input.effect(); },
    async release(input) { events.push(`lease:release:${input.terminal}`); },
  };
  const watchdog = {
    async beginOperation() { events.push("watchdog:begin"); return lease; },
    async openRetainedOperation(input) { events.push("watchdog:open"); return options.opened ?? {
      disposition: "active-observe", operationId: input.operationId, authorityDigest: input.authorityDigest,
      ledgerRevision: 2, authorityTimerOpen: true, authorityWaitClosed: false }; },
    async resumeRetainedRecovery(input) { events.push("watchdog:resume-recovery"); return {
      schemaVersion: "runa-watchdog-retained-recovery-entry/v1", disposition: "recovery-entered",
      operationId: input.operationId, authorityDigest: input.authorityDigest,
      sourceLedgerRevision: input.sourceLedgerRevision, recoveryCas: input.recoveryCas,
      recoveryOwner: true, ...options.recoveryEntryOverrides }; },
  };
  const nativeHost = {
    async preparePublicGitOperation() { events.push("native:prepare");
      return setup; },
    async closeUnintendedEndpoints() { events.push("native:close-unintended");
      return { operationId: OPERATION_ID, closed: true }; },
    async observePreResume() { events.push("native:pre-resume");
      const observed = preResume(setup);
      return options.splicePreResumeResource ? { ...observed,
        ownedResourceIds: observed.ownedResourceIds.map((value, index) =>
          index === 0 ? observed.ownedResourceIds[1] : value) } : observed; },
    async writeBootstrapChunk(input) { events.push("native:bootstrap-write"); return Buffer.from(input.bytes); },
    async endBootstrap(input) { events.push("native:bootstrap-eof"); return { eof: true, binding: input.binding }; },
    async resumeAllChildren() { events.push("native:resume"); },
    async writeControlRecord(input) { const header = JSON.parse(input.record.rawHeader.toString("utf8"));
      events.push(`native:write:${header.frameType}`); return input.record; },
    async readControlRecord() {
      const response = options.earlyTerminal
        ? terminal(options.earlyTerminal, 1, options.earlyTerminalOverrides)
        : readCount++ === 0
          ? controlRecord({ direction: "coordinator-to-control", frameType: "operation-proposal",
            sequence: 1, payload: candidateProposal }) : terminal("finalized", 2, options.finalTerminalOverrides);
      events.push(`native:read:${JSON.parse(response.rawHeader.toString("utf8")).frameType}`);
      return response;
    },
    async endControlRequest() { events.push("native:request-eof");
      return { direction: "control-to-coordinator", eof: true }; },
    async readControlResponseEof() { events.push("native:response-eof");
      return { direction: "coordinator-to-control", eof: true }; },
    async capturePublicationAuthority() { events.push("native:capture-publication");
      return canonicalStringify(publicationManifest(workspace)); },
    async waitForChildrenExit() { events.push("native:children-exit"); return { operationId: OPERATION_ID,
      activeProcesses: 0, workerControlKeysZeroized: true, gitKeyCopiesZeroized: true, brokerSocketsOpen: 0 }; },
    async observeOwnedSibling({ name }) {
      events.push(`publication:observe:${name[0]}`); ownedResourceOrdinal += 1;
      const staging = name.startsWith("s");
      if ((staging && moved) || (!staging && !moved)) {
        return publicationOwnedResult({ state: "absent" }, [], ++publicationBatchOrdinal);
      }
      const internalResourceId = `publication_resource_${String(ownedResourceOrdinal).padStart(8, "0")}`;
      return publicationOwnedResult({ state: "present", identity: publicationManifest(workspace).staging.identity,
        internalResourceId, ownershipVerified: true }, [{ internalResourceId, nativeObjectType: "directory",
        role: "publication-inspection", child: "control", direction: "none", sourceProcessId: 4242 }],
      ++publicationBatchOrdinal);
    },
    async inspectOwnedManifestTree() {
      events.push("publication:inspect"); ownedResourceOrdinal += 1;
      const internalResourceId = `publication_file_${String(ownedResourceOrdinal).padStart(8, "0")}`;
      const result = { additionalEntries: options.malformedPublicationInspection ? ["malformed"] : [],
        reparseEntries: [], fileSetDigest: manifest(workspace).fileSetDigest,
        files: [{ path: "README.md", bytes: 5, sha256: sha("hello"), linkCount: 1,
          identity: publicationManifest(workspace).files[0].identity, ownershipVerified: true,
          internalResourceId }] };
      return publicationOwnedResult(result, [{ internalResourceId, nativeObjectType: "file",
        role: "publication-inspection", child: "control", direction: "none", sourceProcessId: 4242 }],
      ++publicationBatchOrdinal);
    },
    async flushOwnedFile() { events.push("publication:flush-file"); },
    async flushOwnedDirectoryMetadata() { events.push("publication:flush-directory"); },
    async flushAuthorityManifest() { events.push("publication:flush-authority"); },
    async moveOwnedSiblingNoReplaceWriteThrough() { events.push("publication:move"); moved = true;
      if (options.publicationMoveResponseLost) throw new Error("move-response-lost"); },
    async closeOwnedResource({ operationId, internalResourceId }) { assert.equal(operationId, OPERATION_ID);
      events.push(`publication:close:${internalResourceId}`); },
  };
  const publish = async () => { events.push("publication:move");
    if (options.publicationThrows) throw options.publicationThrows;
    return options.publicationUnknown ? { classification: "unknown", filesystemMutationAttempted: true,
      filesystemMutationConfirmed: false } : publicationObservation(); };
  const reconcile = async () => { events.push("publication:reconcile"); return {
    classification: "published-exact", proposedAction: "complete-ready-cas" }; };
  const overrides = { idsFactory: () => ({ nonce: NONCE, channels: CHANNELS }),
    keyFactory: () => ({ controlKeys: { controlCoordinator: Buffer.from(KEY),
      coordinatorMaterializer: Buffer.alloc(32, 8), coordinatorBroker: Buffer.alloc(32, 9) },
      gitStreamKey: Buffer.alloc(32, 10) }), cancelBeforeOperation: options.cancelBeforeOperation === true,
    ...(options.realPublication ? {} : { publish, reconcile }) };
  const materializer = createPublicGitControlWorkerCompositionForTest({ database, watchdog, nativeHost,
    workerReleaseSha256: RELEASE_DIGEST }, overrides);
  return { events, materializer, database, watchdog, lease, nativeHost, authority, workspace,
    setup, getPublishedInput: () => publishedInput };
}

test("new operation uses one claimed fetch and move with exact topology, five EOFs, zeroized terminal order", async () => {
  const fixture = createFixture();
  const result = await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
  assert.equal(result.lifecycle, "ready");
  assert.deepEqual(PUBLIC_GIT_CHILD_HANDLE_COUNTS, { coordinator: 9, materializer: 7, "ingress-broker": 5 });
  assert.equal(fixture.setup.ownedResources.length, PUBLIC_GIT_SETUP_OWNED_RESOURCE_COUNT);
  assert.equal(fixture.setup.controlResources.filter(resource =>
    resource.descriptor.kind === "bootstrap-endpoint").length, 5);
  assert.equal(fixture.events.filter(event => event === "native:bootstrap-eof").length, 5);
  assert.equal(fixture.events.filter(event => event === "db:claim:git-fetch").length, 1);
  assert.equal(fixture.events.filter(event => event === "publication:move").length, 1);
  assert.equal(fixture.events.indexOf("native:request-eof") < fixture.events.indexOf("native:read:terminal"), true);
  assert.equal(fixture.events.indexOf("native:response-eof") < fixture.events.indexOf("lease:success-cleanup"), true);
  assert.equal(fixture.events.indexOf("lease:success-cleanup") < fixture.events.indexOf("db:ready"), true);
});

test("retained existing authority performs exact database cross-check before watchdog open without a lease", async () => {
  const authority = operationAuthority();
  const fixture = createFixture({ admission: { disposition: "existing", requestScopeDigest: SCOPE_DIGEST,
    operationId: OPERATION_ID, authorityDigest: authority.authorityDigest, attestation: authority.attestation } });
  const result = await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
  assert.equal(result.disposition, "existing");
  assert.deepEqual(fixture.events.slice(0, 3), [`db:admit:${SOURCE_ID}`, "db:lookup", "watchdog:open"]);
  assert.equal(fixture.events.includes("watchdog:begin"), false);
  assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
});

for (const disposition of ["existing", "converged-existing"]) {
  test(`${disposition} recovery-resumable authority enters the watchdog's serialized recovery`, async () => {
    const authority = operationAuthority(), recoveryCas = sha("retained-recovery-cas");
    const retained = { disposition: "recovery-resumable", operationId: OPERATION_ID,
      authorityDigest: authority.authorityDigest, ledgerRevision: 4, recoveryCas };
    const options = disposition === "existing"
      ? { admission: { disposition: "existing", requestScopeDigest: SCOPE_DIGEST,
        operationId: OPERATION_ID, authorityDigest: authority.authorityDigest,
        attestation: authority.attestation }, opened: retained }
      : { authority, begin: { created: false, disposition: "converged-existing",
        existingOperationAuthority: authority, unusedAuthorityDigest: authority.authorityDigest }, opened: retained };
    const fixture = createFixture(options);
    const result = await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
    assert.equal(result.retainedState, "recovery-entered");
    assert.equal(fixture.events.filter(event => event === "watchdog:resume-recovery").length, 1);
    assert.equal(fixture.events.indexOf("db:lookup") < fixture.events.indexOf("watchdog:open"), true);
    assert.equal(fixture.events.indexOf("watchdog:open") < fixture.events.indexOf("watchdog:resume-recovery"), true);
    assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
  });
}

test("retained recovery entry substitution stops without a claim or replacement lease", async () => {
  const authority = operationAuthority();
  const fixture = createFixture({ admission: { disposition: "existing", requestScopeDigest: SCOPE_DIGEST,
    operationId: OPERATION_ID, authorityDigest: authority.authorityDigest, attestation: authority.attestation },
  opened: { disposition: "recovery-resumable", operationId: OPERATION_ID,
    authorityDigest: authority.authorityDigest, ledgerRevision: 4, recoveryCas: sha("retained-recovery-cas") },
  recoveryEntryOverrides: { operationId: "operation-00000000-0000-4000-8000-000000000099" } });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /control-worker-retained-recovery-entry-mismatch/);
  assert.equal(fixture.events.includes("watchdog:begin"), false);
  assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
});

test("spliced retained locator stops before watchdog open and creates no lease or effect", async () => {
  const authority = operationAuthority();
  const fixture = createFixture({ admission: { disposition: "reconciliation-required",
    requestScopeDigest: sha("foreign-scope"), operationId: OPERATION_ID,
    authorityDigest: authority.authorityDigest, attestation: authority.attestation } });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /retained-locator-database-mismatch/);
  assert.equal(fixture.events.includes("watchdog:open"), false);
  assert.equal(fixture.events.includes("watchdog:begin"), false);
  assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
});

test("watchdog terminal evidence cannot turn a nonterminal or unknown database record into success", async () => {
  const authority = operationAuthority();
  const fixture = createFixture({ admission: { disposition: "existing", requestScopeDigest: SCOPE_DIGEST,
    operationId: OPERATION_ID, authorityDigest: authority.authorityDigest, attestation: authority.attestation },
    opened: { disposition: "terminal", operationId: OPERATION_ID, authorityDigest: authority.authorityDigest,
      ledgerRevision: 3, terminalReceipt: { outcome: "terminal-success" } } });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /retained-state-watchdog-mismatch/);
  assert.equal(fixture.events.includes("watchdog:begin"), false);
  assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
});

test("converged loser proves its unused timer wait and resource ledger closed before opening winner", async () => {
  const winner = operationAuthority({ operationId: "operation-00000000-0000-4000-8000-000000000002",
    taskId: "operation-00000000-0000-4000-8000-000000000002" });
  const fixture = createFixture({ begin: { created: false, disposition: "converged-existing",
    existingOperationAuthority: winner, unusedAuthorityDigest: operationAuthority().authorityDigest },
    lookup: exactLookup(intent(winner), winner) });
  await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
  assert.equal(fixture.events.indexOf("lease:close-unused") < fixture.events.indexOf("watchdog:open"), true);
  assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
});

test("unverified unused-lease closure retains the loser and never opens the winner", async () => {
  const winner = operationAuthority({ operationId: "operation-00000000-0000-4000-8000-000000000002",
    taskId: "operation-00000000-0000-4000-8000-000000000002" });
  const fixture = createFixture({ unusedClosureValid: false,
    begin: { created: false, disposition: "converged-existing", existingOperationAuthority: winner,
      unusedAuthorityDigest: operationAuthority().authorityDigest }, lookup: exactLookup(intent(winner), winner) });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /unused-lease-closure-mismatch/);
  assert.equal(fixture.events.includes("watchdog:open"), false);
});

test("ambiguous begin performs one begin, one scoped lookup and never a second begin", async () => {
  const fixture = createFixture({ beginError: Object.assign(new Error("lost"), { code: "lost-response" }) });
  const result = await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
  assert.equal(result.disposition, "committed-response-loss");
  assert.equal(fixture.events.filter(event => event === "db:begin").length, 1);
  assert.equal(fixture.events.filter(event => event === "db:lookup").length, 1);
  assert.equal(fixture.events.some(event => event.startsWith("db:claim:")), false);
});

test("authority issue failure settles or durably retains the unbound lease before returning", async () => {
  const fixture = createFixture({ issueError: Object.assign(new Error("arm-failed"), { code: "arm-failed" }) });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }), /arm-failed/);
  assert.deepEqual(fixture.events.slice(0, 5), [`db:admit:${SOURCE_ID}`, "watchdog:begin", "lease:issue",
    "lease:settle-unissued", "lease:verify-unissued"]);
  assert.equal(fixture.events.includes("db:begin"), false);
});

test("ambiguous begin with authoritative absence closes the unused lease and stops without dispatch", async () => {
  const fixture = createFixture({ beginError: Object.assign(new Error("lost"), { code: "lost-response" }),
    lookup: { found: false, disposition: "absent" } });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /begin-outcome-absent/);
  assert.equal(fixture.events.filter(event => event === "db:begin").length, 1);
  assert.equal(fixture.events.filter(event => event.startsWith("db:admit:")).length, 2);
  assert.equal(fixture.events.filter(event => event === "lease:close-unused").length, 1);
  assert.equal(fixture.events.includes("native:prepare"), false);
});

test("raw handle exposure fails before resume and publication then reaches exact-zero terminal CAS", async () => {
  const fixture = createFixture({ includeRawHandle: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /native-raw-handle-exposed/);
  assert.equal(fixture.events.includes("native:resume"), false);
  assert.equal(fixture.events.includes("publication:move"), false);
  assert.equal(fixture.events.indexOf("lease:recover") < fixture.events.indexOf("lease:terminal-cas"), true);
  assert.equal(fixture.events.indexOf("lease:terminal-cas") < fixture.events.indexOf("db:failed"), true);
});

test("unverified ownership receipt stops before bootstrap or resume", async () => {
  const fixture = createFixture({ ownershipValid: false });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /native-ownership-receipt-coverage-invalid/);
  assert.equal(fixture.events.includes("native:bootstrap-write"), false);
  assert.equal(fixture.events.includes("native:resume"), false);
  assert.equal(fixture.events.includes("publication:move"), false);
});

test("missing owned resource is rejected before bootstrap or resume even when the receipt count follows it", async () => {
  const fixture = createFixture({ omitOwnedResource: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }));
  assert.equal(fixture.events.includes("native:bootstrap-write"), false);
  assert.equal(fixture.events.includes("native:resume"), false);
});

test("spliced control counterpart is rejected before bootstrap or resume", async () => {
  const fixture = createFixture({ spliceControlResource: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /native-control-resource-inventory-invalid/);
  assert.equal(fixture.events.includes("native:bootstrap-write"), false);
  assert.equal(fixture.events.includes("native:resume"), false);
});

test("aliased owned resource ID is rejected before the signed-ledger verifier or resume", async () => {
  const fixture = createFixture({ spliceOwnedResource: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /native-owned-resource-inventory-invalid/);
  assert.equal(fixture.events.includes("lease:verify-ownership"), false);
  assert.equal(fixture.events.includes("native:resume"), false);
});

test("resource spliced from a different source process is rejected before resume", async () => {
  const fixture = createFixture({ spliceSourceProcess: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /native-owned-resource-inventory-invalid/);
  assert.equal(fixture.events.includes("native:resume"), false);
});

test("spliced pre-resume resource set is rejected before resume even with the setup receipt", async () => {
  const fixture = createFixture({ splicePreResumeResource: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /native-pre-resume-ownership-invalid/);
  assert.equal(fixture.events.includes("native:resume"), false);
  assert.equal(fixture.events.includes("publication:move"), false);
});

test("proposal staging digest must equal the exact canonical staging manifest before publication authority or claim", async () => {
  const fixture = createFixture({ proposalDigestMismatch: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /proposal-binding-invalid/);
  assert.equal(fixture.events.includes("native:capture-publication"), false);
  assert.equal(fixture.events.includes("db:claim:publication"), false);
  assert.equal(fixture.events.includes("publication:move"), false);
});

test("publication claim response loss records unknown under retained ownership and never writes determinate failure", async () => {
  const fixture = createFixture({ publicationClaimError: new Error("claim-response-lost") });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /publication-recovery-retained/);
  assert.equal(fixture.events.includes("db:unknown"), true);
  assert.equal(fixture.events.includes("lease:unknown-cas"), true);
  assert.equal(fixture.events.includes("db:failed"), false);
  assert.equal(fixture.events.some(event => event.startsWith("lease:release:")), false);
});

test("indeterminate publication attempt records unknown and retains watchdog ownership without a second move", async () => {
  const fixture = createFixture({ publicationUnknown: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /publication-recovery-retained/);
  assert.equal(fixture.events.filter(event => event === "publication:move").length, 1);
  assert.equal(fixture.events.includes("db:unknown"), true);
  assert.equal(fixture.events.includes("db:failed"), false);
  assert.equal(fixture.events.some(event => event.startsWith("lease:release:")), false);
});

test("real publication modules return the authoritative ready digest consumed unchanged by PostgreSQL", async () => {
  const fixture = createFixture({ realPublication: true, publicationMoveResponseLost: true });
  const result = await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
  assert.equal(result.lifecycle, "ready");
  const publishedInput = fixture.getPublishedInput();
  assert.equal(publishedInput.stagingManifestDigest, canonicalSha256(manifest(fixture.workspace, "staging")));
  assert.equal(publishedInput.finalManifestDigest, canonicalSha256(manifest(fixture.workspace, "ready")));
  assert.equal(publishedInput.publicationObservation.observedFinalDigest, publishedInput.finalManifestDigest);
  assert.equal(fixture.events.filter(event => event === "publication:move").length, 1);
  assert.equal(fixture.events.some(event => event.startsWith("publication:close:")), true);
});

test("malformed database result after a real publication is cleaned up then retained unknown without false failure", async () => {
  const fixture = createFixture({ realPublication: true, malformedPublishedResult: true });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /publication-recovery-retained/);
  assert.equal(fixture.events.some(event => event.startsWith("publication:close:")), true);
  assert.equal(fixture.events.includes("db:unknown"), true);
  assert.equal(fixture.events.includes("db:failed"), false);
  assert.equal(fixture.events.some(event => event.startsWith("lease:release:")), false);
});

test("lost ready response returns only the exact retained database success and releases the watchdog as ready", async () => {
  const fixture = createFixture({ readyResponseLost: true });
  const result = await fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID });
  assert.equal(result.disposition, "reconciled-ready-response-loss");
  assert.equal(result.lifecycle, "ready");
  assert.equal(fixture.events.includes("db:unknown"), false);
  assert.equal(fixture.events.includes("db:failed"), false);
  assert.equal(fixture.events.filter(event => event === "publication:move").length, 1);
  assert.equal(fixture.events.at(-1), "lease:release:ready");
});

test("early failure terminal closes response before request and never publishes", async () => {
  const fixture = createFixture({ earlyTerminal: "failed-before-proposal" });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /failed-before-proposal/);
  assert.equal(fixture.events.indexOf("native:response-eof") < fixture.events.indexOf("native:request-eof"), true);
  assert.equal(fixture.events.includes("publication:move"), false);
});

for (const field of ["operationId", "workspaceId", "requestId"]) {
  test(`early terminal ${field} substitution is rejected before publication`, async () => {
    const fixture = createFixture({ earlyTerminal: "failed-before-proposal",
      earlyTerminalOverrides: { [field]: `${field.toLowerCase()}-foreign-00000001` } });
    await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
      /control-worker-control-terminal-binding-invalid/);
    assert.equal(fixture.events.includes("publication:move"), false);
  });

  test(`final terminal ${field} substitution cannot authorize ready`, async () => {
    const fixture = createFixture({ finalTerminalOverrides: { [field]: `${field.toLowerCase()}-foreign-00000001` } });
    await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
      /control-worker-publication-recovery-retained/);
    assert.equal(fixture.events.includes("db:ready"), false);
    assert.equal(fixture.events.includes("db:failed"), false);
    assert.equal(fixture.events.includes("db:unknown"), true);
  });
}

test("explicit cancel closes request before reading terminal and records cancellation only after recovery", async () => {
  const fixture = createFixture({ cancelBeforeOperation: true, earlyTerminal: "cancelled-before-operation" });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /cancelled-before-operation/);
  assert.equal(fixture.events.indexOf("native:request-eof") < fixture.events.indexOf("native:read:terminal"), true);
  assert.equal(fixture.events.indexOf("lease:recover") < fixture.events.indexOf("db:cancelled"), true);
  assert.equal(fixture.events.includes("db:failed"), false);
});

test("recovery without closed authority wait cannot author a determinate terminal receipt", async () => {
  const fixture = createFixture({ includeRawHandle: true });
  fixture.lease.recover = async () => ({ settled: true, activeProcesses: 0,
    reconciliationMismatchCount: 0, cleanupState: "complete", authorityTimerClosed: true,
    authorityWaitClosed: false, completedAt: FINISHED, terminalCasToken: "terminal_cas_0001" });
  await assert.rejects(() => fixture.materializer.materialize({ context: CONTEXT, sourceId: SOURCE_ID }),
    /recovery-unsettled/);
  assert.equal(fixture.events.includes("db:failed"), false);
  assert.equal(fixture.events.includes("db:cancelled"), false);
});

test("candidate composition source has no dynamic native selection or broad process filesystem network calls", async () => {
  const sourceText = await readFile(new URL("./control-worker-composition.mjs", import.meta.url), "utf8");
  for (const denied of ["import(", "child_process", "spawn(", "exec(", "process.env", "fetch(",
    "node:net", "node:http", "node:https", "readdir(", "glob("]) {
    assert.equal(sourceText.includes(denied), false, denied);
  }
  assert.match(sourceText, /materializeInputSchema = z\.object\(\{ context: plainContext,[\s\S]*sourceId:[\s\S]*\}\.strict\(\)/u);
});
