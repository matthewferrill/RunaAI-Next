import test from "node:test";
import assert from "node:assert/strict";
import { M1TaskService } from "./service.mjs";
import { failure } from "./contracts.mjs";

const context = { principalId: "alice", projectId: "synthetic-project", sessionId: "session-a" };

// Transaction double explicitly rolls back on throw. Real PostgreSQL coverage
// is in orchestrator.test.mjs; this isolates commit-before-rejection semantics.
function fixture({ code = "m1-stale-project", status = "pending-approval", intent = null, online = true } = {}) {
  let committed = { proposal: { proposalId: "proposal-one", proposalDigest: "a".repeat(64),
    taskId: "task-one", sessionId: context.sessionId, status }, audit: [] };
  let authorityCalls = 0;
  const store = { async transaction(_context, work) {
    const draft = structuredClone(committed);
    const result = await work({ get: async kind => kind === "intent" ? intent : draft.proposal,
      save: async (_kind, _id, value) => { draft.proposal = structuredClone(value); },
      audit: async (...value) => { draft.audit.push(value); } });
    committed = draft; return result;
  } };
  const service = new M1TaskService({ store, adapter: {}, authorizeContext: async () => online });
  service.verifyProposal = () => {};
  service.authority = async () => { authorityCalls++; if (code) throw failure(code); return {}; };
  return { service, state: () => committed, calls: () => authorityCalls };
}

test("stale pending authority is durably invalidated before returning the rejection", async () => {
  const f = fixture();
  await assert.rejects(f.service.revalidatePending(context, { proposalId: "proposal-one" }), /m1-stale-project/);
  assert.equal(f.state().proposal.status, "stale");
  assert.equal(f.state().proposal.errorCode, "m1-stale-project");
  assert.equal(f.state().proposal.proposalDigest, "a".repeat(64));
  assert.equal(f.state().audit.length, 1);
  assert.equal((await f.service.revalidatePending(context, { proposalId: "proposal-one" })).status, "stale");
  assert.equal(f.state().audit.length, 1);
});

test("approval commits a stale rejection without creating an approval", async () => {
  const f = fixture();
  await assert.rejects(f.service.approve(context, { proposalId: "proposal-one", proposalDigest: "a".repeat(64) }), /m1-stale-project/);
  assert.equal(f.state().proposal.status, "stale");
  assert.equal(f.state().proposal.approval, undefined);
});

test("revoked and expired undispatched grants retain their precise denial", async () => {
  for (const code of ["m1-grant-revoked", "m1-grant-expired", "m1-stale-grant"]) {
    const f = fixture({ code });
    await assert.rejects(f.service.revalidatePending(context, { proposalId: "proposal-one" }), { code });
    assert.equal(f.state().proposal.status, "denied");
    assert.equal(f.state().proposal.errorCode, code);
  }
});

test("wrong sessions, malformed digests, unavailable authority and storage errors cannot invalidate a proposal", async () => {
  const other = fixture();
  await assert.rejects(other.service.revalidatePending({ ...context, sessionId: "session-b" }, { proposalId: "proposal-one" }), /m1-grant-session-mismatch/);
  assert.equal(other.state().proposal.status, "pending-approval");
  const digest = fixture();
  await assert.rejects(digest.service.approve(context, { proposalId: "proposal-one", proposalDigest: "b".repeat(64) }), /m1-proposal-digest-mismatch/);
  assert.equal(digest.state().proposal.status, "pending-approval");
  const offline = fixture({ online: false });
  await assert.rejects(offline.service.revalidatePending(context, { proposalId: "proposal-one" }), /m1-session-authority-unavailable/);
  assert.equal(offline.state().proposal.status, "pending-approval");
  for (const code of ["database-unavailable", "m1-grant-integrity-failed", "m1-path-outside-grant"]) {
    const f = fixture({ code });
    await assert.rejects(f.service.revalidatePending(context, { proposalId: "proposal-one" }), { code });
    assert.equal(f.state().proposal.status, "pending-approval");
    assert.equal(f.state().audit.length, 0);
  }
});

test("existing intents and terminal outcomes never become a never-dispatched denial", async () => {
  for (const status of ["completed", "unknown", "dispatched", "not-published", "cancelled"]) {
    const f = fixture({ status, intent: { status: "dispatching" } });
    assert.equal((await f.service.revalidatePending(context, { proposalId: "proposal-one" })).status, status);
    assert.equal(f.calls(), 0);
    assert.equal(f.state().audit.length, 0);
  }
  const raced = fixture({ intent: { status: "prepared" } });
  assert.equal((await raced.service.revalidatePending(context, { proposalId: "proposal-one" })).status, "pending-approval");
  assert.equal(raced.calls(), 0);
});

test("valid pending authority stays pending and still requires its exact approval", async () => {
  const f = fixture({ code: null });
  assert.equal((await f.service.revalidatePending(context, { proposalId: "proposal-one" })).status, "pending-approval");
  assert.equal(f.state().proposal.approval, undefined);
  await f.service.approve(context, { proposalId: "proposal-one", proposalDigest: "a".repeat(64) });
  assert.equal(f.state().proposal.status, "authorized");
  assert.equal(f.state().proposal.approval.proposalDigest, "a".repeat(64));
});
