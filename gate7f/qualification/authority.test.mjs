import assert from "node:assert/strict";
import test from "node:test";
import { createQualificationAuthority, sha256 } from "./authority.mjs";

const context = { actorId: "member-a", projectId: "project-a", sessionId: "session-a", environmentId: "qualification-a" };
const change = { capabilityId: "workspace.apply-synthetic-change", arguments: { path: "ALLOWED.md", content: "after" } };
const inspect = { capabilityId: "workspace.inspect", arguments: { path: "ALLOWED.md" } };
const preview = { capabilityId: "workspace.preview-change", arguments: { path: "ALLOWED.md", content: "after" } };
const verify = { capabilityId: "workspace.verify-synthetic", arguments: { assertions: [{ path: "ALLOWED.md", sha256: sha256("after") }] } };
const rulesFor = proposals => proposals.map(item => ({ capabilityId: item.capabilityId, exactArguments: [item.arguments] }));

function taskRequest(profile = "safe-autopilot", requestId = "task-a") {
  return { schemaVersion: "runa2-agent-task-create-request/v1", requestId,
    participant: { principalId: context.actorId, verified: true }, project: { projectId: context.projectId },
    session: { sessionId: context.sessionId }, environment: { environmentId: context.environmentId, environmentKind: "synthetic-memory" },
    profile: { id: profile }, objective: "Change only ALLOWED.md to the exact approved content; then verify.", origin: "user-request" };
}

function harness({ profile = "safe-autopilot", proposals = [inspect, preview, change, verify],
  testFaults = {}, snapshot = null } = {}) {
  let time = new Date("2026-08-27T18:00:00.000Z");
  const clock = () => time;
  let app = createQualificationAuthority({ now: clock, snapshot, testFaults }).application;
  if (!snapshot) {
    app.seedProject({ projectId: "project-a", participantId: "member-a", files: { "ALLOWED.md": "before", "OTHER.md": "untouched" } });
    app.seedProject({ projectId: "project-b", participantId: "member-b", files: { "PRIVATE.md": "different participant" } });
  }
  const grant = snapshot ? snapshot.grants[0][1] : app.createGrant({ taskRequest: taskRequest(profile),
    allowedPaths: ["ALLOWED.md"], rules: rulesFor(proposals), expiresAt: "2026-08-27T19:00:00.000Z" });
  let port = app.bindModel({ ...context, grantId: grant.grantId, revision: grant.revision });
  return {
    get app() { return app; }, get port() { return port; }, grant, clock,
    advance(ms) { time = new Date(time.getTime() + ms); },
    restart() {
      const saved = app.exportSyntheticSnapshot();
      app = createQualificationAuthority({ now: clock, snapshot: saved, testFaults }).application;
      port = app.bindModel({ ...context, grantId: grant.grantId, revision: grant.revision });
      return saved;
    },
    state(proposalId) { return app.state({ context, grantId: grant.grantId, proposalId }); },
    workspace() { return app.workspace({ actorId: context.actorId, projectId: context.projectId }); },
    approve(result) { return app.approve({ context, grantId: grant.grantId, revision: grant.revision,
      proposalId: result.proposal.proposalId, proposalDigest: result.proposal.proposalDigest }); },
  };
}

const submit = (h, proposal = change, requestId = "request-a") => h.port.propose({ requestId, proposal });
const code = expected => error => error.code === expected;

test("server grant contains explicit immutable scope and no unbound model interface", () => {
  const h = harness();
  assert.equal(h.grant.actorId, context.actorId);
  assert.equal(h.grant.environmentKind, "synthetic-memory");
  assert.deepEqual(h.grant.allowedPaths, ["ALLOWED.md"]);
  assert.match(h.grant.definitionSha256, /^[a-f0-9]{64}$/);
  assert.equal(h.grant.rules.find(rule => rule.capabilityId === change.capabilityId).argumentsSha256.length, 1);
  assert.deepEqual(Object.keys(h.port), ["propose"]);
  assert.deepEqual(Object.keys(createQualificationAuthority()), ["application"]);
});

test("missing and forged grants cannot bind; actor/project/session/environment mismatch fails", () => {
  const h = harness();
  assert.throws(() => h.app.bindModel({ ...context, revision: 1 }), code("qualification-invalid-binding"));
  assert.throws(() => h.app.bindModel({ ...context, grantId: "forged", revision: 1 }), code("qualification-grant-not-found"));
  for (const field of Object.keys(context)) {
    assert.throws(() => h.app.bindModel({ ...context, [field]: "different", grantId: h.grant.grantId, revision: 1 }),
      code("qualification-scope-denied"));
  }
  for (const revision of [0, null, NaN, 1.5, "1"]) {
    assert.throws(() => h.app.bindModel({ ...context, grantId: h.grant.grantId, revision }), code("qualification-grant-revision-invalid"));
  }
  assert.throws(() => h.app.bindModel({ ...context, grantId: h.grant.grantId, revision: 2 }), code("qualification-grant-revision-stale"));
});

test("unverified participants, real environment and out-of-owner projects cannot mint a grant", () => {
  const h = harness();
  for (const transform of [
    request => ({ ...request, participant: { ...request.participant, verified: false } }),
    request => ({ ...request, environment: { ...request.environment, environmentKind: "filesystem" } }),
    request => ({ ...request, project: { projectId: "project-b" } }),
    request => ({ ...request, origin: "model-output" }),
  ]) {
    assert.throws(() => h.app.createGrant({ taskRequest: transform(taskRequest("safe-autopilot", "other-task")),
      allowedPaths: ["ALLOWED.md"], rules: rulesFor([change]), expiresAt: "2026-08-27T19:00:00.000Z" }));
  }
  assert.equal(h.workspace().revision, 1);
});

test("the model cannot insert actor, grant, source, approval or receipt fields", async () => {
  const h = harness();
  for (const injected of [
    { actorId: "member-b" }, { grantId: h.grant.grantId }, { revision: 100 },
    { origin: "user-request" }, { approved: true }, { receipt: { executed: true } },
  ]) {
    await assert.rejects(h.port.propose({ requestId: "injected", proposal: change, ...injected }), code("qualification-invalid-proposal"));
    await assert.rejects(submit(h, { ...change, ...injected }), code("qualification-invalid-proposal"));
  }
  assert.equal(h.workspace().revision, 1);
});

test("model-output label cannot launder tool text into an out-of-scope file effect", async () => {
  const h = harness();
  await assert.rejects(submit(h, { ...change, arguments: { path: "OTHER.md", content: "owned" } }), code("qualification-path-denied"));
  await assert.rejects(submit(h, { ...change, arguments: { path: "ALLOWED.md", content: "owned" } }), code("qualification-arguments-denied"));
  assert.deepEqual(h.workspace(), { revision: 1, files: { "ALLOWED.md": "before", "OTHER.md": "untouched" } });
  assert.equal(h.app.auditSummary().byType["proposal-executed"], undefined);
});

test("capability, argument extras, traversal and prototype-shaped paths fail closed", async () => {
  const h = harness({ proposals: [change] });
  await assert.rejects(submit(h, { capabilityId: "shell.exec", arguments: { command: "anything" } }), code("qualification-capability-unknown"));
  await assert.rejects(submit(h, inspect), code("qualification-capability-denied"));
  await assert.rejects(submit(h, { ...change, arguments: { ...change.arguments, bypass: true } }), code("qualification-invalid-proposal"));
  for (const path of ["../OTHER.md", "C:/OTHER.md", "/OTHER.md", "a//b", "__proto__", "a/constructor"]) {
    await assert.rejects(submit(h, { ...change, arguments: { path, content: "after" } }));
  }
  assert.equal(h.workspace().revision, 1);
});

test("all verification assertion paths are scoped, not merely the first", async () => {
  const h = harness();
  await assert.rejects(submit(h, { ...verify, arguments: { assertions: [
    ...verify.arguments.assertions, { path: "OTHER.md", sha256: sha256("untouched") },
  ] } }), code("qualification-path-denied"));
  await assert.rejects(submit(h, { ...verify, arguments: { assertions: [{ path: "ALLOWED.md", sha256: null }] } }),
    code("qualification-arguments-denied"));
});

test("a benign preapproved inspect, preview, change and verify workflow remains usable", async () => {
  const h = harness();
  const observed = await submit(h, inspect, "inspect");
  assert.equal(observed.delivery.content, "before");
  assert.equal(observed.receipt.output.kind, "workspace-inspect");
  const planned = await submit(h, preview, "preview");
  assert.equal(planned.receipt.output.kind, "workspace-preview");
  assert.equal(h.workspace().revision, 1);
  const executed = await submit(h, change, "apply");
  assert.equal(executed.receipt.output.kind, "workspace-change");
  assert.equal(executed.receipt.output.beforeSha256, sha256("before"));
  assert.equal(executed.receipt.output.afterSha256, sha256("after"));
  assert.equal(h.workspace().revision, 2);
  const checked = await submit(h, verify, "verify");
  assert.equal(checked.receipt.output.matched, true);
  assert.equal(h.state(checked.proposal.proposalId).executionStatus, "recorded");
  assert.equal(h.state(checked.proposal.proposalId).receiptMatchesCurrentWorkspace, true);
});

test("read-only profile permits observation but never an effect despite a matching grant", async () => {
  const h = harness({ profile: "read-only" });
  assert.equal((await submit(h, inspect)).receipt.output.kind, "workspace-inspect");
  const denied = await submit(h, change, "write");
  assert.equal(denied.proposal.status, "denied");
  assert.equal(denied.receipt, null);
  assert.equal(h.state(denied.proposal.proposalId).executionStatus, "denied");
  assert.equal(h.workspace().revision, 1);
});

test("ask-every-time remains pending until an exact server-side approval", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  assert.equal(staged.proposal.status, "pending-approval");
  assert.equal(h.state(staged.proposal.proposalId).executionStatus, "pending-approval");
  assert.equal(h.state(staged.proposal.proposalId).receipt, null);
  assert.equal(h.workspace().revision, 1);
  await assert.rejects(h.app.approve({ context, grantId: h.grant.grantId, revision: 1,
    proposalId: staged.proposal.proposalId, proposalDigest: "0".repeat(64) }), code("qualification-proposal-digest-mismatch"));
  const approved = await h.approve(staged);
  assert.equal(approved.receipt.approvalBasis, "manual-once");
  assert.equal(h.state(staged.proposal.proposalId).executionStatus, "recorded");
  assert.equal(h.workspace().files["ALLOWED.md"], "after");
});

test("exact request retries and concurrent duplicates create one effect and one receipt", async () => {
  const h = harness();
  const results = await Promise.all([submit(h), submit(h), submit(h)]);
  assert.equal(new Set(results.map(result => result.receipt.receiptId)).size, 1);
  assert.equal(results.filter(result => result.replayed).length, 2);
  assert.equal(h.workspace().revision, 2);
  assert.equal(h.app.auditSummary().byType["proposal-executed"], 1);
});

test("changed arguments cannot reuse a request id even when each alternative is permitted", async () => {
  const h = harness({ profile: "ask-every-time" });
  const updated = h.app.reviseGrant({ context, grantId: h.grant.grantId, revision: 1,
    allowedPaths: ["ALLOWED.md"], rules: [{ capabilityId: change.capabilityId,
      exactArguments: [change.arguments, { ...change.arguments, content: "second permitted alternative" }] }],
    expiresAt: "2026-08-27T19:00:00.000Z" });
  const port = h.app.bindModel({ ...context, grantId: updated.grantId, revision: 2 });
  await port.propose({ requestId: "same", proposal: change });
  await assert.rejects(port.propose({ requestId: "same", proposal: { ...change,
    arguments: { ...change.arguments, content: "second permitted alternative" } } }), code("qualification-request-replay-conflict"));
  assert.equal(h.workspace().revision, 1);
});

test("caller mutation while a proposal is queued cannot substitute new content", async () => {
  const h = harness();
  const input = { requestId: "queued", proposal: structuredClone(change) };
  const result = h.port.propose(input);
  input.proposal.arguments.content = "owned";
  await result;
  assert.equal(h.workspace().files["ALLOWED.md"], "after");
});

test("grant expiry blocks both an old bound port and approval of its pending proposal", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  h.advance(60 * 60_000);
  await assert.rejects(submit(h, inspect, "later"), code("qualification-grant-expired"));
  await assert.rejects(h.approve(staged), code("qualification-grant-expired"));
  assert.equal(h.workspace().revision, 1);
});

test("revocation blocks an old bound port and previously pending approval", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  h.app.revokeGrant({ context, grantId: h.grant.grantId, revision: 1 });
  await assert.rejects(submit(h, inspect, "later"), code("qualification-grant-revoked"));
  await assert.rejects(h.approve(staged), code("qualification-grant-revoked"));
  assert.equal(h.state(staged.proposal.proposalId).receipt, null);
  assert.equal(h.workspace().revision, 1);
});

test("grant replacement invalidates old ports and pending proposals even under a new port", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  const renewed = h.app.reviseGrant({ context, grantId: h.grant.grantId, revision: 1,
    allowedPaths: ["ALLOWED.md"], rules: rulesFor([inspect, change]), expiresAt: "2026-08-27T20:00:00.000Z" });
  await assert.rejects(submit(h, inspect, "old"), code("qualification-grant-revision-stale"));
  await assert.rejects(h.app.approve({ context, grantId: renewed.grantId, revision: 2,
    proposalId: staged.proposal.proposalId, proposalDigest: staged.proposal.proposalDigest }), code("qualification-grant-revision-stale"));
  const newPort = h.app.bindModel({ ...context, grantId: renewed.grantId, revision: 2 });
  await assert.rejects(newPort.propose({ requestId: "request-a", proposal: change }), code("qualification-request-replay-conflict"));
  assert.equal((await newPort.propose({ requestId: "new-request", proposal: inspect })).receipt.output.kind, "workspace-inspect");
  assert.equal(h.workspace().revision, 1);
});

test("cancelled tasks cannot execute queued or pending work", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  const queued = submit(h, inspect, "queued");
  h.app.cancel({ context, grantId: h.grant.grantId, revision: 1 });
  await assert.rejects(queued, code("qualification-grant-cancelled"));
  await assert.rejects(h.approve(staged), code("qualification-grant-cancelled"));
  assert.equal(h.state(staged.proposal.proposalId).taskStatus, "cancelled");
  assert.equal(h.workspace().revision, 1);
});

test("a policy deny added after staging is rechecked at the actual effect boundary", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  h.app.setPreference({ context, grantId: h.grant.grantId, revision: 1,
    capabilityId: change.capabilityId, decision: "deny" });
  await assert.rejects(h.approve(staged), code("qualification-current-policy-denied"));
  assert.equal(h.workspace().revision, 1);
  assert.equal(h.state(staged.proposal.proposalId).executionStatus, "failed");
  assert.equal(h.state(staged.proposal.proposalId).receipt, null);
});

test("remembered allow does not widen exact argument or path grants", async () => {
  const h = harness({ profile: "ask-every-time" });
  h.app.setPreference({ context, grantId: h.grant.grantId, revision: 1,
    capabilityId: change.capabilityId, decision: "allow" });
  await assert.rejects(submit(h, { ...change, arguments: { path: "OTHER.md", content: "owned" } }), code("qualification-path-denied"));
  const allowed = await submit(h);
  assert.equal(allowed.receipt.approvalBasis, "remembered-session");
  assert.equal(h.workspace().files["OTHER.md"], "untouched");
});

test("an independent grant changing the same project invalidates stale pending work", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  const other = h.app.createGrant({ taskRequest: taskRequest("safe-autopilot", "other-task"),
    allowedPaths: ["ALLOWED.md"], rules: rulesFor([{ ...change, arguments: { ...change.arguments, content: "new state" } }]),
    expiresAt: "2026-08-27T19:00:00.000Z" });
  const port = h.app.bindModel({ ...context, grantId: other.grantId, revision: 1 });
  await port.propose({ requestId: "new-state", proposal: { ...change, arguments: { ...change.arguments, content: "new state" } } });
  await assert.rejects(h.approve(staged), code("qualification-workspace-revision-stale"));
  assert.equal(h.workspace().files["ALLOWED.md"], "new state");
});

test("restart preserves exact replay, pending bindings and receipt-grounded continuation", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  h.restart();
  assert.equal(h.state(staged.proposal.proposalId).executionStatus, "pending-approval");
  const executed = await h.approve(staged);
  h.restart();
  const replay = await submit(h);
  assert.equal(replay.receipt.receiptId, executed.receipt.receiptId);
  assert.equal(replay.replayed, true);
  assert.equal(h.state(staged.proposal.proposalId).executionStatus, "recorded");
  assert.equal(h.workspace().revision, 2);
});

test("failure before effect leaves no deed or receipt", async () => {
  const h = harness({ testFaults: { broken: { failBeforeEffect: true } } });
  await assert.rejects(submit(h, change, "broken"), code("agent-simulated-before-effect"));
  const result = await submit(h, change, "broken");
  assert.equal(h.state(result.proposal.proposalId).executionStatus, "failed");
  assert.equal(result.receipt, null);
  assert.equal(h.workspace().revision, 1);
});

test("failure after effect before record rolls back exact state and creates no success receipt", async () => {
  const h = harness({ testFaults: { broken: { failAfterEffectBeforeRecord: true } } });
  const before = h.workspace();
  await assert.rejects(submit(h, change, "broken"), code("agent-simulated-atomic-rollback"));
  assert.deepEqual(h.workspace(), before);
  const retry = await submit(h, change, "broken");
  assert.equal(retry.receipt, null);
  assert.equal(h.state(retry.proposal.proposalId).executionStatus, "failed");
});

test("interrupted receipt delivery survives restart without repeating the effect", async () => {
  const h = harness({ testFaults: { interrupted: { interruptAfterRecord: true } } });
  await assert.rejects(submit(h, change, "interrupted"), code("agent-receipt-delivery-interrupted"));
  assert.equal(h.workspace().revision, 2);
  h.restart();
  const replay = await submit(h, change, "interrupted");
  assert.equal(replay.replayed, true);
  assert.equal(h.state(replay.proposal.proposalId).executionStatus, "recorded");
  assert.equal(h.workspace().revision, 2);
  assert.equal(h.app.auditSummary().byType["proposal-executed"], 1);
});

test("only actual same-grant receipts permit an exactly granted synthetic restore", async () => {
  const h = harness();
  await assert.rejects(submit(h, { capabilityId: "workspace.restore-synthetic-change", arguments: { forwardReceiptId: "forged" } }),
    code("qualification-restore-scope-denied"));
  const forward = await submit(h);
  const restore = { capabilityId: "workspace.restore-synthetic-change", arguments: { forwardReceiptId: forward.receipt.receiptId } };
  const updated = h.app.reviseGrant({ context, grantId: h.grant.grantId, revision: 1,
    allowedPaths: ["ALLOWED.md"], rules: rulesFor([restore]), expiresAt: "2026-08-27T19:00:00.000Z" });
  const port = h.app.bindModel({ ...context, grantId: updated.grantId, revision: 2 });
  const result = await port.propose({ requestId: "restore", proposal: restore });
  assert.equal(result.receipt.output.kind, "workspace-restore");
  assert.equal(result.receipt.rollbackOfReceiptId, forward.receipt.receiptId);
  assert.equal(result.receipt.output.restoredSha256, sha256("before"));
  assert.equal(h.workspace().files["ALLOWED.md"], "before");
  assert.equal(h.state(forward.proposal.proposalId).receiptMatchesCurrentWorkspace, false);
  assert.equal(h.state(result.proposal.proposalId).receiptMatchesCurrentWorkspace, true);
});

test("a restore cannot conceal an out-of-path or different-grant receipt", async () => {
  const h = harness();
  const forward = await submit(h);
  const restore = { capabilityId: "workspace.restore-synthetic-change", arguments: { forwardReceiptId: forward.receipt.receiptId } };
  assert.throws(() => h.app.reviseGrant({ context, grantId: h.grant.grantId, revision: 1,
    allowedPaths: ["OTHER.md"], rules: rulesFor([restore]), expiresAt: "2026-08-27T19:00:00.000Z" }), code("qualification-path-denied"));
  assert.throws(() => h.app.createGrant({ taskRequest: taskRequest("safe-autopilot", "other-task"),
    allowedPaths: ["ALLOWED.md"], rules: rulesFor([restore]), expiresAt: "2026-08-27T19:00:00.000Z" }),
    code("qualification-restore-scope-denied"));
  assert.equal(h.workspace().revision, 2);
});

test("a failed verification receipt reports failure, not a successful postcondition", async () => {
  const h = harness();
  const result = await submit(h, verify);
  const state = h.state(result.proposal.proposalId);
  assert.equal(state.executionStatus, "verification-failed");
  assert.equal(state.receipt.output.matched, false);
  assert.equal(h.workspace().revision, 1);
});

test("missing or invalid receipts never become completed actions because a proposal says executed", async () => {
  const h = harness();
  const result = await submit(h);
  const snapshot = h.app.exportSyntheticSnapshot();
  const missing = structuredClone(snapshot);
  missing.foundation.receipts = [];
  const appMissing = createQualificationAuthority({ now: h.clock, snapshot: missing }).application;
  const args = { context, grantId: h.grant.grantId, proposalId: result.proposal.proposalId };
  assert.equal(appMissing.state(args).proposalStatus, "executed");
  assert.equal(appMissing.state(args).executionStatus, "record-missing");
  assert.equal(appMissing.state(args).receipt, null);
  const invalid = structuredClone(snapshot);
  invalid.foundation.receipts[0][1].output.revision = 999;
  const appInvalid = createQualificationAuthority({ now: h.clock, snapshot: invalid }).application;
  assert.equal(appInvalid.state(args).executionStatus, "record-invalid");
  assert.equal(appInvalid.state(args).receipt, null);
});

test("changed persisted proposal arguments are rejected again at approval", async () => {
  const h = harness({ profile: "ask-every-time" });
  const staged = await submit(h);
  const snapshot = h.app.exportSyntheticSnapshot();
  snapshot.foundation.proposalPayloads[0][1].request.arguments.content = "owned";
  const app = createQualificationAuthority({ now: h.clock, snapshot }).application;
  await assert.rejects(app.approve({ context, grantId: h.grant.grantId, revision: 1,
    proposalId: staged.proposal.proposalId, proposalDigest: staged.proposal.proposalDigest }),
    code("qualification-proposal-binding-invalid"));
  assert.equal(app.workspace({ actorId: context.actorId, projectId: context.projectId }).revision, 1);
});

test("out-of-scope participants cannot read another grant's state or receipt", async () => {
  const h = harness();
  const result = await submit(h);
  assert.throws(() => h.app.state({ context: { ...context, actorId: "member-b" },
    grantId: h.grant.grantId, proposalId: result.proposal.proposalId }), code("qualification-scope-denied"));
  assert.throws(() => h.app.workspace({ actorId: "member-a", projectId: "project-b" }), code("agent-project-not-authorized"));
});

test("expired and unbounded issuance, duplicate scope and reseeding existing projects are rejected", () => {
  const h = harness();
  const create = (overrides = {}) => h.app.createGrant({ taskRequest: taskRequest("safe-autopilot", "new-task"),
    allowedPaths: ["ALLOWED.md"], rules: rulesFor([change]), expiresAt: "2026-08-27T19:00:00.000Z", ...overrides });
  for (const expiresAt of ["invalid", "2026-08-27T18:00:00.000Z", "2026-08-30T19:00:00.000Z"]) {
    assert.throws(() => create({ expiresAt }), code("qualification-expiry-invalid"));
  }
  assert.throws(() => create({ allowedPaths: ["ALLOWED.md", "ALLOWED.md"] }), code("qualification-grant-scope-invalid"));
  assert.throws(() => h.app.seedProject({ projectId: "project-a", participantId: "member-b", files: { "ALLOWED.md": "overwrite" } }),
    code("qualification-project-already-seeded"));
  assert.equal(h.workspace().files["ALLOWED.md"], "before");
});

test("settling a receipt never adopts an intervening different grant's workspace revision", async () => {
  const h = harness();
  const firstPending = submit(h);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.workspace().revision, 2);
  const otherChange = { ...change, arguments: { path: "ALLOWED.md", content: "other grant state" } };
  const other = h.app.createGrant({ taskRequest: taskRequest("safe-autopilot", "other-task"),
    allowedPaths: ["ALLOWED.md"], rules: rulesFor([otherChange]), expiresAt: "2026-08-27T19:00:00.000Z" });
  const otherPort = h.app.bindModel({ ...context, grantId: other.grantId, revision: 1 });
  const secondPending = otherPort.propose({ requestId: "other", proposal: otherChange });
  const [first] = await Promise.all([firstPending, secondPending]);
  assert.equal(h.workspace().revision, 3);
  assert.equal(h.state(first.proposal.proposalId).grant.expectedWorkspaceRevision, 2);
  assert.equal(h.state(first.proposal.proposalId).receiptMatchesCurrentWorkspace, false);
  await assert.rejects(submit(h, inspect, "stale-after-race"), code("qualification-workspace-revision-stale"));
});

test("replaying an older own receipt does not regress a grant after a newer own effect", async () => {
  const h = harness();
  const rules = [{ capabilityId: change.capabilityId,
    exactArguments: [change.arguments, { path: "ALLOWED.md", content: "third" }] }];
  const updated = h.app.reviseGrant({ context, grantId: h.grant.grantId, revision: 1,
    allowedPaths: ["ALLOWED.md"], rules, expiresAt: "2026-08-27T19:00:00.000Z" });
  const port = h.app.bindModel({ ...context, grantId: updated.grantId, revision: 2 });
  const first = await port.propose({ requestId: "first", proposal: change });
  await port.propose({ requestId: "second", proposal: { ...change, arguments: { path: "ALLOWED.md", content: "third" } } });
  const replay = await port.propose({ requestId: "first", proposal: change });
  assert.equal(replay.receipt.receiptId, first.receipt.receiptId);
  assert.equal(h.state(first.proposal.proposalId).grant.expectedWorkspaceRevision, 3);
  assert.equal(h.workspace().revision, 3);
});
