import assert from "node:assert/strict";
import test from "node:test";

import { PostgresServerWorkspaceStore, assertCandidateDeterminatePublicationState } from "./postgres.mjs";

const candidateMethods = Object.freeze([
  "admitMaterializationRequest", "beginMaterialization", "lookupMaterializationByOperation", "claimEffect",
  "recordStaging", "recordPublishedPendingDb", "recordReady", "recordFailed", "recordCancelled", "recordUnknown",
]);

test("real PostgreSQL candidate store exposes the deterministic composition interface without opening PostgreSQL", async () => {
  let connectionAttempts = 0;
  const pool = Object.freeze({ async connect() { connectionAttempts += 1; throw new Error("database-must-not-open"); } });
  const verifier = Object.freeze(() => true);
  const store = new PostgresServerWorkspaceStore({ pool, allowPlaintextForSynthetic: true,
    verifyWatchdogAuthority: verifier });
  for (const method of candidateMethods) assert.equal(typeof store[method], "function", method);

  const invalidContext = { principalId: "principal", projectId: "project", sessionId: "session", extra: true };
  for (const method of candidateMethods) {
    await assert.rejects(() => store[method](invalidContext, {}));
  }
  assert.equal(connectionAttempts, 0);
});

test("real PostgreSQL store rejects mutable or asynchronous watchdog authority verifiers", () => {
  const pool = Object.freeze({ async connect() { throw new Error("database-must-not-open"); } });
  assert.throws(() => new PostgresServerWorkspaceStore({ pool, allowPlaintextForSynthetic: true,
    verifyWatchdogAuthority: () => true }), /workspace-watchdog-authority-verifier-invalid/);
  assert.throws(() => new PostgresServerWorkspaceStore({ pool, allowPlaintextForSynthetic: true,
    verifyWatchdogAuthority: Object.freeze(async () => true) }), /workspace-watchdog-authority-verifier-invalid/);
});

test("candidate determinate terminals are forbidden after any ambiguous publication boundary", () => {
  assert.equal(assertCandidateDeterminatePublicationState("intent-recorded", null), true);
  assert.equal(assertCandidateDeterminatePublicationState("staging", "staging-authorized"), true);
  for (const state of [null, "publication-claimed", "published-observed", "unknown"]) {
    assert.throws(() => assertCandidateDeterminatePublicationState("staging", state),
      /workspace-publication-state-requires-unknown/);
  }
});
