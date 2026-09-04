import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, MATERIALIZATION_POLICY_DIGEST,
  MATERIALIZATION_POLICY_ID, bindingDigestFor, canonicalSha256, canonicalStringify, fileSetDigest,
} from "./materialization-contracts.mjs";
import { authoritativeFinalWorkspaceManifestDigest, publishWorkspaceNoReplaceOwned,
  reconcileWorkspacePublicationOwned } from "./publication-primitive.mjs";

const sha = value => createHash("sha256").update(String(value)).digest("hex");
const START = "2026-09-04T12:00:00.000Z";
const WORKSPACE_ID = "workspace-00000000-0000-4000-8000-000000000001";
const OPERATION_ID = "operation-00000000-0000-4000-8000-000000000001";
const NATIVE_PROCESS_ID = 4242;

function ownedResult(result, resources, batchOrdinal, operationId = OPERATION_ID) {
  const ownedResourcesDigest = canonicalSha256(resources);
  const batchId = `publication-batch-${String(batchOrdinal).padStart(4, "0")}`;
  return { schemaVersion: "runa-publication-inspection-owned-result/v1", operationId, result,
    ownershipBatches: resources.length === 0 ? [] : [{
      schemaVersion: "runa-publication-inspection-owned-batch/v1", operationId,
      phase: "publication-inspection", ownedResources: resources, ownedResourcesDigest,
      ownershipReceipt: { schemaVersion: "runa-public-git-raw-handle-ownership-receipt/v1",
        operationId, batchId, batchRevision: 1, resourceCount: resources.length,
        batchDigest: sha(`raw-${batchId}`), ownershipCommitted: true, ledgerRevision: batchOrdinal,
        watchdogProcessIdentitySha256: sha("watchdog"), receiptHmac: sha(`receipt-${batchId}`) } }] };
}

const ownershipVerifier = { operationId: OPERATION_ID, async verifyOwnershipReceipt(input) {
  return input.receipt.operationId === OPERATION_ID
    && input.receipt.resourceCount === input.internalResourceIds.length;
} };

function fixtureInput(state = "publication-claimed") {
  const binding = { schemaVersion: "runa-workspace-binding/v1", participantId: "participant_0001",
    projectId: "project_00000001", environmentId: "environment_0001",
    sourceId: "source-00000000-0000-4000-8000-000000000001", taskId: OPERATION_ID,
    sourceRevision: 1, capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST };
  const entries = [{ path: "README.md", bytes: 5, sha256: sha("hello"), mediaClass: "utf8-text" }];
  const workspaceManifest = { schemaVersion: "runa-workspace-manifest/v1", workspaceId: WORKSPACE_ID,
    sourceId: binding.sourceId, bindingDigest: bindingDigestFor(binding), sourceKind: "git-public-https",
    nativeVersionKind: "git-commit-sha1", nativeVersion: "1".repeat(40), entries,
    fileSetDigest: fileSetDigest(entries), excludedCount: 0, rejectedCount: 0, complete: true,
    adapterReleaseSha256: sha("adapter"), runtimeReleaseSha256: sha("runtime"),
    brokerReleaseSha256: sha("broker"), capabilitySetVersion: CAPABILITY_SET_VERSION,
    capabilitySetDigest: CAPABILITY_SET_DIGEST, limitsProfileId: MATERIALIZATION_POLICY_ID,
    limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST, lifecycle: "staging", createdAt: START,
    expiresAt: "2026-09-04T12:30:00.000Z" };
  const rootIdentity = { volumeSerial: "1234abcd", fileId: "2".repeat(16) };
  const authorityManifest = { schemaVersion: "runa-workspace-publication-authority-manifest/v1",
    workspaceId: WORKSPACE_ID, workspaceManifestDigest: canonicalSha256(workspaceManifest),
    parentIdentity: { volumeSerial: "1234abcd", fileId: "1".repeat(16) },
    staging: { name: `s${"1".repeat(31)}`, identity: rootIdentity },
    final: { name: `f${"2".repeat(31)}`, expectedIdentity: rootIdentity },
    files: [{ path: "README.md", bytes: 5, sha256: sha("hello"),
      identity: { volumeSerial: "1234abcd", fileId: "3".repeat(16) } }] };
  const claimedAt = START;
  const publicationClaim = { schemaVersion: "runa-workspace-effect-claim/v1", operationId: OPERATION_ID,
    effect: "publication", claimId: "claim-publication-0001", claimRevision: 1,
    state: state === "published-observed" ? "observed" : "claimed",
    claimDigest: canonicalSha256({ schemaVersion: "runa-workspace-effect-claim/v1", operationId: OPERATION_ID,
      effect: "publication", claimId: "claim-publication-0001", claimRevision: 1, claimedAt }),
    claimedAt, updatedAt: state === "published-observed" ? "2026-09-04T12:00:01.000Z" : START };
  const durableAuthority = { schemaVersion: "runa-workspace-durable-publication-authority/v1",
    operationId: OPERATION_ID, workspaceId: WORKSPACE_ID, workspaceRevision: state === "published-observed" ? 3 : 2,
    operationAuthorityDigest: sha("authority"), requestDigest: sha("request"),
    bindingDigest: bindingDigestFor(binding), authorityManifest,
    authorityManifestDigest: canonicalSha256(authorityManifest), parentResourceId: "parent-resource-0001",
    ingressRootResourceId: "ingress-resource-0001", stagingRootResourceId: "staging-resource-0001",
    publicationClaim, workspaceLifecycle: state === "published-observed" ? "published-pending-db" : "staging",
    state };
  return { bindingRecord: binding, workspaceManifestRaw: canonicalStringify(workspaceManifest), durableAuthority };
}

function ownedHost({ throwMove = false, inspectionError = false, malformedInspection = false,
  ownershipOmission = false, ownershipAlias = false, ownershipSplice = false,
  ownershipBatchAlias = false } = {}) {
  const events = [];
  let moved = false, resourceOrdinal = 0, batchOrdinal = 0, lastObservedResourceId = null;
  const nextBatchOrdinal = () => ownershipBatchAlias && batchOrdinal > 0 ? batchOrdinal : ++batchOrdinal;
  return { events,
    async observeOwnedSibling({ operationId, name }) {
      events.push(`observe:${name[0]}`); resourceOrdinal += 1;
      const isStaging = name.startsWith("s");
      if ((isStaging && moved) || (!isStaging && !moved)) {
        return ownedResult({ state: "absent" }, [], nextBatchOrdinal(), operationId);
      }
      lastObservedResourceId = `observed-resource-${String(resourceOrdinal).padStart(4, "0")}`;
      const result = { state: "present", identity: { volumeSerial: "1234abcd", fileId: "2".repeat(16) },
        internalResourceId: lastObservedResourceId, ownershipVerified: true };
      const resource = { internalResourceId: lastObservedResourceId, nativeObjectType: "directory",
        role: "publication-inspection", child: "control", direction: "none", sourceProcessId: NATIVE_PROCESS_ID };
      return ownedResult(result, [resource], nextBatchOrdinal(), operationId);
    },
    async inspectOwnedManifestTree({ operationId }) {
      events.push("inspect");
      if (inspectionError) throw new Error("inspection-failed");
      resourceOrdinal += 1;
      const internalResourceId = ownershipAlias ? lastObservedResourceId
        : `file-resource-${String(resourceOrdinal).padStart(4, "0")}`;
      const result = malformedInspection ? { additionalEntries: ["malformed"], reparseEntries: [],
        fileSetDigest: fileSetDigest([{ path: "README.md", bytes: 5, sha256: sha("hello"), mediaClass: "utf8-text" }]),
        files: [{ path: "README.md", bytes: 5, sha256: sha("hello"), linkCount: 1,
          identity: { volumeSerial: "1234abcd", fileId: "3".repeat(16) }, ownershipVerified: true,
          internalResourceId }] } : { additionalEntries: [], reparseEntries: [], fileSetDigest: fileSetDigest([
        { path: "README.md", bytes: 5, sha256: sha("hello"), mediaClass: "utf8-text" }]),
      files: [{ path: "README.md", bytes: 5, sha256: sha("hello"), linkCount: 1,
        identity: { volumeSerial: "1234abcd", fileId: "3".repeat(16) }, ownershipVerified: true,
        internalResourceId }] };
      const resources = ownershipOmission ? [] : [{ internalResourceId, nativeObjectType: "file",
        role: "publication-inspection", child: "control", direction: "none", sourceProcessId: NATIVE_PROCESS_ID }];
      return ownedResult(result, resources, nextBatchOrdinal(),
        ownershipSplice ? "operation-00000000-0000-4000-8000-000000000099" : operationId);
    },
    async flushOwnedFile() { events.push("flush:file"); },
    async flushOwnedDirectoryMetadata() { events.push("flush:directory"); },
    async flushAuthorityManifest() { events.push("flush:authority"); },
    async moveOwnedSiblingNoReplaceWriteThrough(input) {
      events.push("move");
      assert.equal(input.replaceExisting, false); assert.equal(input.writeThrough, true);
      moved = true; if (throwMove) throw new Error("response-lost");
    },
    async closeOwnedResource({ operationId, internalResourceId }) {
      assert.equal(operationId, OPERATION_ID); events.push(`close:${internalResourceId}`);
    },
  };
}

test("opaque publication makes one no-replace write-through move and closes every opened resource", async () => {
  const host = ownedHost({ throwMove: true });
  const input = fixtureInput();
  const result = await publishWorkspaceNoReplaceOwned(input, host, ownershipVerifier);
  assert.equal(result.classification, "published-verified");
  const stagingManifest = JSON.parse(input.workspaceManifestRaw);
  assert.equal(result.observedFinalDigest, authoritativeFinalWorkspaceManifestDigest(stagingManifest));
  assert.equal(result.observedFinalDigest, canonicalSha256({ ...stagingManifest, lifecycle: "ready" }));
  assert.notEqual(result.observedFinalDigest, canonicalSha256(stagingManifest));
  assert.equal(host.events.filter(event => event === "move").length, 1);
  assert.equal(host.events.filter(event => event.startsWith("close:")).length, 4);
  assert.equal(host.events.indexOf("flush:authority") < host.events.indexOf("move"), true);
  assert.equal(host.events.filter(event => event.startsWith("observe:")).length, 4);
});

test("raw handle-shaped input is rejected before any native publication call", async () => {
  const input = fixtureInput();
  input.durableAuthority.native = { rawHandleHex: "00000000000001c8" };
  const host = ownedHost();
  await assert.rejects(() => publishWorkspaceNoReplaceOwned(input, host, ownershipVerifier));
  assert.deepEqual(host.events, []);
});

test("reconciliation observes only and never invokes the move helper", async () => {
  const host = ownedHost();
  const input = fixtureInput("published-observed");
  // The durable state says published; emulate its final name as present for observation.
  await host.moveOwnedSiblingNoReplaceWriteThrough({ replaceExisting: false, writeThrough: true });
  host.events.length = 0;
  const result = await reconcileWorkspacePublicationOwned(input, host, ownershipVerifier);
  assert.equal(result.classification, "published-exact");
  assert.equal(host.events.includes("move"), false);
});

test("indeterminate inspection cannot authorize deletion or publication", async () => {
  const host = ownedHost({ inspectionError: true });
  const result = await publishWorkspaceNoReplaceOwned(fixtureInput(), host, ownershipVerifier);
  assert.notEqual(result.classification, "published-verified");
  assert.equal(result.deletionAuthorized, false);
  assert.equal(host.events.includes("move"), false);
});

test("malformed owned inspection is fail closed and closes every returned owned resource", async () => {
  const host = ownedHost({ malformedInspection: true });
  const result = await publishWorkspaceNoReplaceOwned(fixtureInput(), host, ownershipVerifier);
  assert.notEqual(result.classification, "published-verified");
  assert.equal(result.deletionAuthorized, false);
  assert.equal(host.events.includes("move"), false);
  assert.equal(host.events.filter(event => event.startsWith("close:")).length, 2);
});

for (const [name, option] of [["omission", "ownershipOmission"], ["alias", "ownershipAlias"],
  ["batch alias", "ownershipBatchAlias"], ["cross-operation splice", "ownershipSplice"]]) {
  test(`publication ownership ${name} is rejected and all returned resource ids are closed`, async () => {
    const host = ownedHost({ [option]: true });
    const result = await publishWorkspaceNoReplaceOwned(fixtureInput(), host, ownershipVerifier);
    assert.notEqual(result.classification, "published-verified");
    assert.equal(result.deletionAuthorized, false);
    assert.equal(host.events.includes("move"), false);
    assert.equal(host.events.some(event => event.startsWith("close:")), true);
  });
}
