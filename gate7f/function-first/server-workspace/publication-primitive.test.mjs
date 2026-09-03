import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITY_SET_DIGEST,
  CAPABILITY_SET_VERSION,
  MATERIALIZATION_POLICY_DIGEST,
  MATERIALIZATION_POLICY_ID,
  bindingDigestFor,
  canonicalSha256,
  canonicalStringify,
  fileSetDigest
} from "./materialization-contracts.mjs";
import {
  classifyPublicationRelationship,
  publicationProofBoundary,
  publishWorkspaceNoReplace,
  reconcileWorkspacePublication
} from "./publication-primitive.mjs";

const d = value => value.repeat(64).slice(0, 64);
const identity = (volumeSerial, fileId) => ({ volumeSerial, fileId });
const parentIdentity = identity("11111111", "1111111111111111");
const rootIdentity = identity("22222222", "2222222222222222");
const fileIdentity = identity("22222222", "3333333333333333");
const binding = { schemaVersion: "runa-workspace-binding/v1", participantId: "participant_01",
  projectId: "project_0001", environmentId: "environment_01", sourceId: "source_00001",
  taskId: "task_0000001", sourceRevision: 1, capabilitySetVersion: CAPABILITY_SET_VERSION,
  capabilitySetDigest: CAPABILITY_SET_DIGEST };
const entries = [{ path: "README.md", bytes: 5, sha256: d("a"), mediaClass: "utf8-text" }];
const workspaceManifest = lifecycle => ({ schemaVersion: "runa-workspace-manifest/v1",
  workspaceId: "workspace_01", sourceId: binding.sourceId, bindingDigest: bindingDigestFor(binding),
  sourceKind: "git-public-https", nativeVersionKind: "git-commit-sha1", nativeVersion: "b".repeat(40),
  entries, fileSetDigest: fileSetDigest(entries), excludedCount: 0, rejectedCount: 0, complete: true,
  adapterReleaseSha256: d("c"), runtimeReleaseSha256: d("d"), brokerReleaseSha256: d("e"),
  capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
  limitsProfileId: MATERIALIZATION_POLICY_ID, limitsProfileDigest: MATERIALIZATION_POLICY_DIGEST,
  lifecycle, createdAt: "2026-09-03T12:00:00.000Z", expiresAt: "2026-09-03T12:30:00.000Z" });

function fixtures(lifecycle = "staging") {
  const manifest = workspaceManifest(lifecycle);
  const authority = { schemaVersion: "runa-workspace-publication-authority-manifest/v1",
    workspaceId: manifest.workspaceId, workspaceManifestDigest: canonicalSha256(manifest), parentIdentity,
    staging: { name: `staging_${"1".repeat(32)}`, identity: rootIdentity },
    final: { name: `workspace_${"2".repeat(32)}`, expectedIdentity: rootIdentity },
    files: [{ path: entries[0].path, bytes: entries[0].bytes, sha256: entries[0].sha256,
      identity: fileIdentity }] };
  const authorityManifestDigest = canonicalSha256(authority);
  return { bindingRecord: binding, workspaceManifestRaw: canonicalStringify(manifest),
    authorityManifestRaw: canonicalStringify(authority), expectedAuthorityManifestDigest: authorityManifestDigest,
    databaseSnapshot: { schemaVersion: "runa-workspace-publication-state/v1", workspaceId: manifest.workspaceId,
      bindingDigest: manifest.bindingDigest, lifecycle, revision: 7, authorityManifestDigest,
      parentIdentity, stagingName: authority.staging.name, finalName: authority.final.name } };
}

class Host {
  constructor({ staging = "present", final = "absent", move = "success", corruptTree = false } = {}) {
    this.staging = staging; this.final = final; this.move = move; this.corruptTree = corruptTree;
    this.calls = []; this.nextHandle = 0;
  }
  handle(label) { this.nextHandle += 1; return `${label}-${this.nextHandle}`; }
  async openParentNoFollow({ expectedIdentity }) {
    this.calls.push("open-parent"); return { filesystem: "NTFS", identity: expectedIdentity, handle: this.handle("parent") };
  }
  async observeSiblingNoFollow({ name }) {
    const role = name.startsWith("staging_") ? "staging" : "final";
    this.calls.push(`observe-${role}`); const state = this[role];
    if (state === "absent") return { state };
    if (state === "indeterminate") return { state };
    return { state: "present", identity: state === "mismatch" ? identity("99999999", "9".repeat(16)) : rootIdentity,
      handle: this.handle(role) };
  }
  async inspectManifestTree({ expectedEntries }) {
    this.calls.push("inspect-tree");
    return { files: expectedEntries.map(file => ({ ...file, identity: fileIdentity,
      sha256: this.corruptTree ? d("f") : file.sha256, linkCount: 1, handle: this.handle("file") })),
    additionalEntries: [], reparseEntries: [], fileSetDigest: fileSetDigest(entries) };
  }
  async flushFile({ path }) { this.calls.push(`flush-file:${path}`); }
  async flushDirectoryMetadata({ order }) { this.calls.push(`flush-directories:${order}`); }
  async flushAuthorityManifest() { this.calls.push("flush-authority-manifest"); }
  async moveSiblingNoReplaceWriteThrough(options) {
    this.calls.push(`move:${options.replaceExisting}:${options.writeThrough}`);
    if (this.final !== "absent") throw new Error("native-destination-exists");
    if (this.move === "throw-before") throw new Error("native-move-failed");
    this.staging = "absent"; this.final = "present";
    if (this.move === "throw-after") throw new Error("native-result-lost");
  }
  async closeHandle({ handle }) { this.calls.push(`close:${handle}`); }
  async retainUnclosedHandle({ handle, reason }) {
    this.calls.push(`retain:${handle}:${reason}`); return true;
  }
}

test("publication flushes exact files, directory metadata and authority manifest before one no-replace move", async () => {
  const host = new Host();
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "published-verified");
  assert.deepEqual(result.databaseTransitionProposal, { from: "staging", to: "published-pending-db", expectedRevision: 7 });
  assert.equal(result.databaseMutationPerformed, false);
  assert.equal(result.receiptAuthored, false);
  assert.equal(result.filesystemMutationAttempted, true);
  assert.equal(result.filesystemMutationConfirmed, true);
  const moveIndex = host.calls.indexOf("move:false:true");
  assert.ok(host.calls.indexOf("flush-file:README.md") < moveIndex);
  assert.ok(host.calls.indexOf("flush-directories:children-before-root") < moveIndex);
  assert.ok(host.calls.indexOf("flush-authority-manifest") < moveIndex);
  assert.equal(host.calls.filter(call => call.startsWith("move:")).length, 1);
});

test("ambiguous native move is observed once and never replayed", async () => {
  const host = new Host({ move: "throw-after" });
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "published-verified");
  assert.equal(host.calls.filter(call => call.startsWith("move:")).length, 1);
});

test("a failed move with exact staging and absent final proposes cleanup, never retry", async () => {
  const host = new Host({ move: "throw-before" });
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "owned-staging");
  assert.equal(result.proposedAction, "stop-verify-remove-and-record-terminal");
  assert.equal(result.deletionAuthorized, false);
  assert.equal(result.filesystemMutationAttempted, true);
  assert.equal(result.filesystemMutationConfirmed, false);
  assert.equal(host.calls.filter(call => call.startsWith("move:")).length, 1);
});

test("an existing final is never replaced or deleted and becomes an unknown conflict", async () => {
  const host = new Host({ final: "present" });
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "unknown");
  assert.equal(result.reason, "publication-name-conflict");
  assert.equal(result.deletionAuthorized, false);
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
});

test("a different identity at the final name is still a no-replace conflict", async () => {
  const host = new Host({ final: "mismatch" });
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.reason, "publication-name-conflict");
  assert.equal(result.filesystemMutationAttempted, false);
  assert.equal(result.filesystemMutationConfirmed, false);
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
});

test("manifest identity/hash drift fails closed before publication", async () => {
  const host = new Host({ corruptTree: true });
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "unknown");
  assert.equal(result.deletionAuthorized, false);
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
});

test("authority bytes, digest, state, root identity and file identity are cross-bound", async () => {
  const badDigest = fixtures(); badDigest.expectedAuthorityManifestDigest = d("f");
  await assert.rejects(publishWorkspaceNoReplace(badDigest, new Host()), /publication-authority-manifest-digest-mismatch/u);
  const badBinding = fixtures(); badBinding.databaseSnapshot.finalName = `workspace_${"3".repeat(32)}`;
  await assert.rejects(publishWorkspaceNoReplace(badBinding, new Host()), /publication-state-manifest-binding-mismatch/u);
  const badFile = fixtures(); const value = JSON.parse(badFile.authorityManifestRaw);
  value.files[0].identity = identity("22222222", "4".repeat(16));
  badFile.authorityManifestRaw = canonicalStringify(value);
  badFile.expectedAuthorityManifestDigest = canonicalSha256(value);
  badFile.databaseSnapshot.authorityManifestDigest = badFile.expectedAuthorityManifestDigest;
  const host = new Host();
  const result = await publishWorkspaceNoReplace(badFile, host);
  assert.equal(result.classification, "unknown");
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
});

test("phase-exact reconciliation proposes database actions but mutates neither database nor files", async () => {
  const published = fixtures("published-pending-db");
  const publishedHost = new Host({ staging: "absent", final: "present" });
  const readyProposal = await reconcileWorkspacePublication(published, publishedHost);
  assert.equal(readyProposal.proposedAction, "complete-ready-cas");
  assert.equal(readyProposal.databaseMutationPerformed, false);
  assert.equal(publishedHost.calls.some(call => call.startsWith("move:")), false);

  const ready = fixtures("ready");
  const missingHost = new Host({ staging: "absent", final: "absent" });
  const revokeProposal = await reconcileWorkspacePublication(ready, missingHost);
  assert.equal(revokeProposal.proposedAction, "revoke-reads-and-record-unknown");
  assert.equal(revokeProposal.deletionAuthorized, false);
});

test("strict sibling observations reject contradictions and close every returned handle", async () => {
  class MalformedObservationHost extends Host {
    async observeSiblingNoFollow({ name }) {
      const role = name.startsWith("staging_") ? "staging" : "final";
      this.calls.push(`observe-${role}`);
      if (role === "final") return { state: "absent", identity: rootIdentity, handle: "contradictory-final" };
      return { state: "present", identity: rootIdentity, handle: this.handle(role) };
    }
  }
  const host = new MalformedObservationHost();
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "unknown");
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
  assert.equal(host.calls.includes("close:contradictory-final"), true);
});

test("flush and non-flush tree inspections close every host-owned file handle", async () => {
  const publishHost = new Host();
  await publishWorkspaceNoReplace(fixtures(), publishHost);
  assert.equal(publishHost.calls.filter(call => call.startsWith("close:file-")).length, 2);

  const reconcileHost = new Host({ staging: "absent", final: "present" });
  await reconcileWorkspacePublication(fixtures("ready"), reconcileHost);
  assert.equal(reconcileHost.calls.filter(call => call.startsWith("close:file-")).length, 1);
});

test("indeterminate move evidence separates attempt from confirmed mutation", async () => {
  class IndeterminateMoveHost extends Host {
    async moveSiblingNoReplaceWriteThrough(options) {
      this.calls.push(`move:${options.replaceExisting}:${options.writeThrough}`);
      this.staging = "indeterminate"; this.final = "indeterminate";
      throw new Error("native-result-unknown");
    }
  }
  const host = new IndeterminateMoveHost();
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "unknown");
  assert.equal(result.filesystemMutationAttempted, true);
  assert.equal(result.filesystemMutationConfirmed, false);
  assert.equal("filesystemMutationPerformed" in result, false);
});

test("invalid parent return is owned before filesystem and identity validation", async () => {
  class InvalidParentHost extends Host {
    async openParentNoFollow() {
      this.calls.push("open-parent");
      return { filesystem: "FAT32", identity: identity("99999999", "9".repeat(16)), handle: "invalid-parent" };
    }
  }
  const host = new InvalidParentHost();
  await assert.rejects(publishWorkspaceNoReplace(fixtures(), host), /publication-parent-identity-invalid/u);
  assert.equal(host.calls.filter(call => call === "close:invalid-parent").length, 1);
});

test("throwing sibling shape closes its accessible handle and fails closed", async () => {
  class ThrowingSiblingHost extends Host {
    async observeSiblingNoFollow({ name }) {
      const role = name.startsWith("staging_") ? "staging" : "final";
      this.calls.push(`observe-${role}`);
      if (role === "staging") return super.observeSiblingNoFollow({ name });
      const returned = { handle: "throwing-sibling" };
      Object.defineProperty(returned, "state", { enumerable: true, get() { throw new Error("malformed-state"); } });
      return returned;
    }
  }
  const host = new ThrowingSiblingHost();
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "unknown");
  assert.equal(host.calls.includes("close:throwing-sibling"), true);
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
});

test("inspection scans duplicate aliases and still owns every later distinct handle", async () => {
  class AliasedInspectionHost extends Host {
    async inspectManifestTree({ rootHandle }) {
      this.calls.push("inspect-tree");
      return { files: [
        { handle: rootHandle }, { handle: "duplicate-file" }, { handle: "duplicate-file" }, { handle: "later-file" }
      ], additionalEntries: [], reparseEntries: [], fileSetDigest: fileSetDigest(entries) };
    }
  }
  const host = new AliasedInspectionHost();
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "unknown");
  assert.equal(host.calls.filter(call => call === "close:duplicate-file").length, 1);
  assert.equal(host.calls.filter(call => call === "close:later-file").length, 1);
  assert.equal(host.calls.some(call => call.startsWith("move:")), false);
});

test("close failures are retained explicitly before a result completes", async () => {
  class RetainingCloseHost extends Host {
    async closeHandle({ handle }) {
      this.calls.push(`close:${handle}`);
      if (handle.startsWith("file-") || handle.startsWith("parent-")) throw new Error("close-failed");
    }
  }
  const host = new RetainingCloseHost();
  const result = await publishWorkspaceNoReplace(fixtures(), host);
  assert.equal(result.classification, "published-verified");
  const failed = host.calls.filter(call => call.startsWith("close:file-") || call.startsWith("close:parent-"));
  const retained = host.calls.filter(call => call.startsWith("retain:"));
  assert.equal(retained.length, failed.length);
  assert.ok(retained.every(call => call.endsWith(":close-failed")));
});

test("retention failure fails closed after attempting to record every unclosed handle", async () => {
  class FailedRetentionHost extends Host {
    async closeHandle({ handle }) { this.calls.push(`close:${handle}`); throw new Error("close-failed"); }
    async retainUnclosedHandle({ handle, reason }) {
      this.calls.push(`retain:${handle}:${reason}`); throw new Error("retention-failed");
    }
  }
  const host = new FailedRetentionHost();
  await assert.rejects(publishWorkspaceNoReplace(fixtures(), host), /publication-handle-retention-failed/u);
  assert.equal(host.calls.filter(call => call.startsWith("retain:")).length,
    host.calls.filter(call => call.startsWith("close:")).length);
});

test("closed relationship table preserves, quarantines, or proposes exact cleanup without authorizing deletion", () => {
  const absent = { state: "absent", treeVerified: false };
  const exact = { state: "exact", treeVerified: true };
  assert.equal(classifyPublicationRelationship({ databaseState: "no-intent", staging: exact, final: absent }).proposedAction, "operator-review");
  assert.equal(classifyPublicationRelationship({ databaseState: "staging", staging: exact, final: absent }).proposedAction, "stop-verify-remove-and-record-terminal");
  assert.equal(classifyPublicationRelationship({ databaseState: "published-pending-db", staging: absent, final: exact }).proposedAction, "complete-ready-cas");
  assert.equal(classifyPublicationRelationship({ databaseState: "ready", staging: absent, final: exact }).proposedAction, "preserve-and-serve");
  const cleanup = classifyPublicationRelationship({ databaseState: "failed", staging: exact, final: absent });
  assert.equal(cleanup.proposedAction, "remove-exact-identity-then-record-removed");
  assert.equal(cleanup.deletionAuthorized, false);
});

test("proof boundary labels local deterministic results separately from actual Windows and Control proof", () => {
  assert.equal(publicationProofBoundary.deterministicPreflightOnly, true);
  assert.equal(publicationProofBoundary.actualWindowsControlProofRequired, true);
  assert.ok(publicationProofBoundary.requiredNativeClaims.includes("MoveFileExW-MOVEFILE_WRITE_THROUGH-without-MOVEFILE_REPLACE_EXISTING"));
});
