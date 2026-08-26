import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MemoryAgentFoundationRepository } from "./adapters/memory.mjs";
import { SyntheticWorkspaceExecutor } from "./adapters/synthetic-executor.mjs";
import { Gate7fAgentFoundationService } from "./core.mjs";
import { sha256 } from "./contracts.mjs";
import { evaluateAgentPolicy } from "./policy.mjs";
import { agentCapability } from "./registry.mjs";

const member = { principalId: "member-a", verified: true };
const other = { principalId: "member-b", verified: true };
const environment = { environmentId: "synthetic-eval-a", environmentKind: "synthetic-memory" };
const fixedProfile = id => ({ id });
const customProfile = ({ allowed = [], automatic = [] } = {}) => ({
  id: "custom", allowedCapabilityIds: allowed, automaticCapabilityIds: automatic,
});

function taskRequest({ requestId = "task-request-1", participant = member, projectId = "project-a",
  sessionId = "session-a", profile = fixedProfile("ask-every-time"), objective = "Improve the synthetic project." } = {}) {
  return { schemaVersion: "runa2-agent-task-create-request/v1", requestId, participant,
    project: { projectId }, session: { sessionId }, environment, profile, objective, origin: "user-request" };
}

function capabilityRequest(task, { requestId = "capability-request-1", participant = member,
  origin = "model-output", capabilityId = "workspace.apply-synthetic-change",
  args = { path: "README.md", content: "after" } } = {}) {
  return { schemaVersion: "runa2-agent-capability-request/v1", requestId, participant,
    taskId: task.taskId, origin: { type: origin, reference: origin === "user-request" ? null : "turn-1" },
    capabilityId, arguments: args };
}

function approval(proposal, { participant = member, approvalId = "approval-1", remember = "once",
  digest = proposal.proposalDigest } = {}) {
  return { schemaVersion: "runa2-agent-approval-request/v1", approvalId, participant,
    proposalId: proposal.proposalId, proposalDigest: digest, decision: "allow", remember };
}

function decline(proposal, { participant = member, decisionId = "denial-1", remember = "once" } = {}) {
  return { schemaVersion: "runa2-agent-decline-request/v1", decisionId, participant,
    proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
    decision: "deny", remember, reason: "Not for this project." };
}

function harness({ profile = fixedProfile("ask-every-time"), now = new Date("2026-08-26T16:00:00.000Z"),
  ttl = 30 * 60_000, snapshot = null, sessionId = "session-a", createTask = true } = {}) {
  let current = now;
  const repository = new MemoryAgentFoundationRepository({ now: () => current, proposalTtlMs: ttl, snapshot });
  if (!snapshot) {
    repository.seedProject({ projectId: "project-a", participantId: member.principalId,
      files: { "README.md": "before", "src/index.js": "export const value = 1;" } });
    repository.seedProject({ projectId: "project-b", participantId: other.principalId,
      files: { "PRIVATE.md": "other participant" } });
  }
  const executor = new SyntheticWorkspaceExecutor({ repository });
  const service = new Gate7fAgentFoundationService({ repository, executor, now: () => current, proposalTtlMs: ttl });
  const task = createTask ? service.createTask(taskRequest({ profile, sessionId })) : null;
  return { repository, executor, service, task, advance(ms) { current = new Date(current.getTime() + ms); } };
}

test("task creation binds user authority and retains only an objective digest", () => {
  const h = harness({ createTask: false });
  const request = taskRequest({ objective: "PRIVATE OBJECTIVE" });
  const first = h.service.createTask(request);
  const replay = h.service.createTask(request);
  assert.deepEqual(replay, first);
  assert.equal(first.objectiveSha256, sha256("PRIVATE OBJECTIVE"));
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE OBJECTIVE/);
  assert.throws(() => h.service.createTask({ ...request, objective: "changed" }),
    error => error.code === "agent-task-request-conflict");
});

test("contracts reject extras, unverified tasks, real environments, unknown profiles and unknown capabilities", async () => {
  const h = harness({ createTask: false });
  assert.throws(() => h.service.createTask({ ...taskRequest(), extraAuthority: true }));
  assert.throws(() => h.service.createTask(taskRequest({ participant: { ...member, verified: false } })),
    error => error.code === "agent-not-authorized");
  const realEnvironment = taskRequest();
  realEnvironment.environment = { environmentId: "real", environmentKind: "filesystem" };
  assert.throws(() => h.service.createTask(realEnvironment));
  assert.throws(() => h.service.createTask(taskRequest({ profile: { id: "approve-everything" } })));
  const task = h.service.createTask(taskRequest());
  const unknown = capabilityRequest(task);
  unknown.capabilityId = "shell.exec";
  await assert.rejects(h.service.stage(unknown));
  await assert.rejects(h.service.stage({ ...capabilityRequest(task), receipt: { status: "executed" } }));
});

test("participant and project isolation apply before synthetic content is reachable", async () => {
  const h = harness();
  await assert.rejects(h.service.stage(capabilityRequest(h.task, { participant: other,
    capabilityId: "workspace.inspect", args: { path: "README.md" } })),
  error => error.code === "agent-task-not-found");
  assert.throws(() => h.service.createTask(taskRequest({ requestId: "other-project", projectId: "project-b" })),
    error => error.code === "agent-project-not-authorized");
  assert.throws(() => h.service.readTask(other, h.task.taskId), error => error.code === "agent-task-not-found");
});

test("retrieved content and tool output cannot stage while user and model requests remain inert until policy", async () => {
  const h = harness();
  for (const origin of ["retrieved-content", "tool-output"]) {
    await assert.rejects(h.service.stage(capabilityRequest(h.task, { requestId: `origin-${origin}`, origin })),
      error => error.code === "agent-origin-denied");
  }
  const model = await h.service.stage(capabilityRequest(h.task));
  assert.equal(model.proposal.status, "pending-approval");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
});

test("read-only inspection executes automatically and returns content only as ephemeral delivery", async () => {
  const h = harness({ profile: fixedProfile("read-only") });
  const result = await h.service.stage(capabilityRequest(h.task, { capabilityId: "workspace.inspect",
    args: { path: "README.md" } }));
  assert.equal(result.receipt.output.kind, "workspace-inspect");
  assert.equal(result.delivery.content, "before");
  assert.equal(Object.hasOwn(result.receipt.output, "content"), false);
  assert.equal(result.receipt.approvalBasis, "profile");
});

test("read-only profile denies effects after an exact preview and before executor mutation", async () => {
  const h = harness({ profile: fixedProfile("read-only") });
  const result = await h.service.stage(capabilityRequest(h.task));
  assert.equal(result.proposal.status, "denied");
  assert.equal(result.proposal.policy.basis, "read-only-effect-denied");
  assert.equal(result.receipt, null);
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
});

test("ask-every-time previews without mutation and executes only the exact approved proposal", async () => {
  const h = harness();
  const preview = await h.service.stage(capabilityRequest(h.task, { requestId: "preview",
    capabilityId: "workspace.preview-change", args: { path: "README.md", content: "after" } }));
  assert.equal(preview.receipt.output.kind, "workspace-preview");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
  const staged = await h.service.stage(capabilityRequest(h.task));
  assert.equal(staged.proposal.status, "pending-approval");
  const executed = await h.service.approveAndExecute(approval(staged.proposal));
  assert.equal(executed.receipt.output.afterSha256, sha256("after"));
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "after");
});

test("manual approval is participant- and exact-digest-bound", async () => {
  const h = harness();
  const staged = await h.service.stage(capabilityRequest(h.task));
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal, { participant: other })),
    error => error.code === "agent-proposal-not-found");
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal, { digest: "0".repeat(64) })),
    error => error.code === "agent-proposal-digest-mismatch");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
});

test("safe and full project autopilot execute only registered synthetic capabilities", async () => {
  for (const profile of ["safe-autopilot", "full-project-autopilot"]) {
    const h = harness({ profile: fixedProfile(profile) });
    const result = await h.service.stage(capabilityRequest(h.task, { requestId: `auto-${profile}` }));
    assert.equal(result.receipt.output.kind, "workspace-change");
    assert.match(result.receipt.policyBasis, new RegExp(profile));
    assert.equal(result.receipt.environmentKind, "synthetic-memory");
  }
});

test("custom profile denies absent capabilities, reviews allowed effects, and auto-runs only its automatic subset", async () => {
  const allowed = ["workspace.inspect", "workspace.apply-synthetic-change", "workspace.verify-synthetic"];
  const h = harness({ profile: customProfile({ allowed, automatic: ["workspace.verify-synthetic"] }) });
  const denied = await h.service.stage(capabilityRequest(h.task, { requestId: "custom-denied",
    capabilityId: "workspace.preview-change", args: { path: "README.md", content: "after" } }));
  assert.equal(denied.proposal.status, "denied");
  const deniedMissing = await h.service.stage(capabilityRequest(h.task, { requestId: "custom-denied-missing",
    capabilityId: "workspace.preview-change", args: { path: "missing.txt", content: "after" } }));
  assert.equal(deniedMissing.proposal.status, "denied");
  assert.match(deniedMissing.proposal.preview, /denied by policy/);
  const reviewed = await h.service.stage(capabilityRequest(h.task, { requestId: "custom-reviewed" }));
  assert.equal(reviewed.proposal.status, "pending-approval");
  const verified = await h.service.stage(capabilityRequest(h.task, { requestId: "custom-auto",
    capabilityId: "workspace.verify-synthetic", args: { assertions: [{ path: "README.md", sha256: sha256("before") }] } }));
  assert.equal(verified.receipt.output.matched, true);
  assert.equal(verified.receipt.policyBasis, "profile-custom-automatic");
});

test("session and project allow choices are exact, reusable, and revocable", async () => {
  const h = harness();
  const first = await h.service.stage(capabilityRequest(h.task, { requestId: "allow-session",
    args: { path: "README.md", content: "session-one" } }));
  await h.service.approveAndExecute(approval(first.proposal, { remember: "session" }));
  const automatic = await h.service.stage(capabilityRequest(h.task, { requestId: "session-reuse",
    args: { path: "README.md", content: "session-two" } }));
  assert.equal(automatic.receipt.approvalBasis, "remembered-session");
  const revoked = h.service.revokePreference({ schemaVersion: "runa2-agent-preference-revoke-request/v1",
    participant: member, taskId: h.task.taskId, capabilityId: "workspace.apply-synthetic-change",
    scope: "session", decision: "allow" });
  assert.equal(revoked.removed, 1);
  const pending = await h.service.stage(capabilityRequest(h.task, { requestId: "after-revoke",
    args: { path: "README.md", content: "session-three" } }));
  assert.equal(pending.proposal.status, "pending-approval");

  const projectAllow = await h.service.stage(capabilityRequest(h.task, { requestId: "allow-project",
    args: { path: "README.md", content: "project-one" } }));
  await h.service.approveAndExecute(approval(projectAllow.proposal, { approvalId: "approval-project", remember: "project" }));
  const task2 = h.service.createTask(taskRequest({ requestId: "task-two", sessionId: "session-two" }));
  const projectAutomatic = await h.service.stage(capabilityRequest(task2, { requestId: "project-reuse",
    args: { path: "README.md", content: "project-two" } }));
  assert.equal(projectAutomatic.receipt.approvalBasis, "remembered-project");
});

test("remembered deny overrides profile and remembered allow", () => {
  const task = { participantId: member.principalId, projectId: "project-a", sessionId: "session-a",
    environment, profile: fixedProfile("full-project-autopilot") };
  const capability = agentCapability("workspace.apply-synthetic-change");
  const base = { participantId: member.principalId, projectId: "project-a", sessionId: "session-a",
    environmentId: environment.environmentId, capabilityId: capability.capabilityId, scope: "session" };
  const policy = evaluateAgentPolicy({ task, capability, preferences: [
    { ...base, decision: "allow" }, { ...base, decision: "deny" },
  ] });
  assert.deepEqual(policy, { result: "deny", basis: "remembered-session-deny" });
});

test("decline can remember an exact denial without affecting other capabilities", async () => {
  const h = harness();
  const staged = await h.service.stage(capabilityRequest(h.task));
  h.service.decline(decline(staged.proposal, { remember: "session" }));
  const denied = await h.service.stage(capabilityRequest(h.task, { requestId: "denied-again",
    args: { path: "README.md", content: "another" } }));
  assert.equal(denied.proposal.status, "denied");
  const inspect = await h.service.stage(capabilityRequest(h.task, { requestId: "inspect-still-works",
    capabilityId: "workspace.inspect", args: { path: "README.md" } }));
  assert.equal(inspect.receipt.output.kind, "workspace-inspect");
});

test("a verified user can set and revoke an exact deny before safe autopilot reaches the executor", async () => {
  const h = harness({ profile: fixedProfile("safe-autopilot") });
  h.service.setPreference({ schemaVersion: "runa2-agent-preference-set-request/v1",
    decisionId: "deny-before-run", participant: member, taskId: h.task.taskId,
    capabilityId: "workspace.apply-synthetic-change", scope: "project", decision: "deny" });
  const denied = await h.service.stage(capabilityRequest(h.task));
  assert.equal(denied.proposal.status, "denied");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
  h.service.revokePreference({ schemaVersion: "runa2-agent-preference-revoke-request/v1",
    participant: member, taskId: h.task.taskId, capabilityId: "workspace.apply-synthetic-change",
    scope: "project", decision: "deny" });
  const automatic = await h.service.stage(capabilityRequest(h.task, { requestId: "after-deny-revoke" }));
  assert.equal(automatic.receipt.policyBasis, "profile-safe-autopilot");
});

test("duplicate and concurrent delivery produce one deed and one receipt", async () => {
  const h = harness();
  const request = capabilityRequest(h.task);
  const first = await h.service.stage(request);
  const duplicate = await h.service.stage(request);
  assert.equal(duplicate.proposal.proposalId, first.proposal.proposalId);
  const [left, right] = await Promise.all([
    h.service.approveAndExecute(approval(first.proposal, { approvalId: "approval-left" })),
    h.service.approveAndExecute(approval(first.proposal, { approvalId: "approval-right" })),
  ]);
  assert.equal(left.receipt.receiptId, right.receipt.receiptId);
  assert.equal(h.repository.auditSummary().byType["proposal-executed"], 1);
  const changed = capabilityRequest(h.task); changed.arguments = { path: "README.md", content: "different" };
  await assert.rejects(h.service.stage(changed), error => error.code === "agent-capability-request-conflict");
});

test("delivery interruption after record replays the receipt without repeating the deed", async () => {
  const h = harness();
  const staged = await h.service.stage(capabilityRequest(h.task));
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal), { interruptAfterRecord: true }),
    error => error.code === "agent-receipt-delivery-interrupted");
  const revision = h.repository.workspace(member.principalId, "project-a").revision;
  const replay = await h.service.approveAndExecute(approval(staged.proposal, { approvalId: "approval-retry" }));
  assert.equal(replay.receipt.replayed, true);
  assert.equal(h.repository.workspace(member.principalId, "project-a").revision, revision);
});

test("stale state refuses rather than overwriting unseen work", async () => {
  const h = harness();
  const staged = await h.service.stage(capabilityRequest(h.task));
  const changed = h.repository.workspace(member.principalId, "project-a");
  changed.files["README.md"] = "concurrent-change";
  changed.revision += 1;
  h.repository.replaceWorkspace(member.principalId, "project-a", changed);
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal)),
    error => error.code === "agent-stale-state");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "concurrent-change");
  assert.equal(h.repository.receiptForProposal(staged.proposal.proposalId), null);
});

test("failures before effect and after effect-before-record remain receipt-free and restore state", async () => {
  for (const [option, code] of [["failBeforeEffect", "agent-simulated-before-effect"],
    ["failAfterEffectBeforeRecord", "agent-simulated-atomic-rollback"]]) {
    const h = harness();
    const staged = await h.service.stage(capabilityRequest(h.task));
    await assert.rejects(h.service.approveAndExecute(approval(staged.proposal), { [option]: true }),
      error => error.code === code);
    assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
    assert.equal(h.repository.receiptForProposal(staged.proposal.proposalId), null);
  }
});

test("failed remembered approval does not create reusable authority", async () => {
  const h = harness();
  const staged = await h.service.stage(capabilityRequest(h.task));
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal, { remember: "project" }),
    { failBeforeEffect: true }), error => error.code === "agent-simulated-before-effect");
  assert.deepEqual(h.repository.preferencesForTask(h.task), []);
});

test("unexpected receipt validation failure restores an effect rather than leaving an unrecorded deed", async () => {
  const h = harness();
  const originalExecute = h.executor.execute.bind(h.executor);
  h.executor.execute = input => ({ ...originalExecute(input), output: { kind: "fabricated-output" } });
  const staged = await h.service.stage(capabilityRequest(h.task));
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal)),
    error => error.code === "agent-recording-failed");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
  assert.equal(h.repository.receiptForProposal(staged.proposal.proposalId), null);
});

test("rollback is a second governed proposal and refuses after later state drift", async () => {
  const h = harness();
  const forwardProposal = await h.service.stage(capabilityRequest(h.task, { requestId: "forward" }));
  const forward = await h.service.approveAndExecute(approval(forwardProposal.proposal));
  const rollbackProposal = await h.service.stage(capabilityRequest(h.task, { requestId: "rollback",
    capabilityId: "workspace.restore-synthetic-change",
    args: { forwardReceiptId: forward.receipt.receiptId } }));
  assert.equal(rollbackProposal.proposal.rollbackOfReceiptId, forward.receipt.receiptId);
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "after");
  const rollback = await h.service.approveAndExecute(approval(rollbackProposal.proposal, { approvalId: "approve-rollback" }));
  assert.equal(rollback.receipt.rollbackOfReceiptId, forward.receipt.receiptId);
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");

  const changed = await h.service.stage(capabilityRequest(h.task, { requestId: "forward-two",
    args: { path: "README.md", content: "after-two" } }));
  const changedReceipt = await h.service.approveAndExecute(approval(changed.proposal, { approvalId: "approve-two" }));
  const drift = h.repository.workspace(member.principalId, "project-a");
  drift.files["README.md"] = "later-drift"; drift.revision += 1;
  h.repository.replaceWorkspace(member.principalId, "project-a", drift);
  await assert.rejects(h.service.stage(capabilityRequest(h.task, { requestId: "stale-rollback",
    capabilityId: "workspace.restore-synthetic-change",
    args: { forwardReceiptId: changedReceipt.receipt.receiptId } })),
  error => error.code === "agent-rollback-state-invalid");
});

test("synthetic snapshot restart preserves continuity, idempotency, preferences, receipts and rollback state", async () => {
  const first = harness();
  const staged = await first.service.stage(capabilityRequest(first.task, { requestId: "restart-forward" }));
  const executed = await first.service.approveAndExecute(approval(staged.proposal, { remember: "project" }));
  const snapshot = first.repository.exportSyntheticSnapshot();
  const second = harness({ snapshot, createTask: false });
  assert.deepEqual(second.service.readTask(member, first.task.taskId), first.task);
  assert.deepEqual(second.repository.taskPayload(first.task.taskId), { objective: "Improve the synthetic project." });
  assert.equal(second.service.readReceipt(member, executed.receipt.receiptId).receiptId, executed.receipt.receiptId);
  assert.notEqual(second.repository.rollbackState(executed.receipt.receiptId), null);
  const replay = await second.service.stage(capabilityRequest(first.task, { requestId: "restart-forward" }));
  assert.equal(replay.receipt.receiptId, executed.receipt.receiptId);
  const automatic = await second.service.stage(capabilityRequest(first.task, { requestId: "restart-next",
    args: { path: "README.md", content: "after-restart" } }));
  assert.equal(automatic.receipt.approvalBasis, "remembered-project");
});

test("completed and cancelled tasks cannot stage or execute new work", async () => {
  for (const action of ["complete", "cancel"]) {
    const h = harness();
    const staged = await h.service.stage(capabilityRequest(h.task));
    h.service.changeTaskLifecycle({ schemaVersion: "runa2-agent-task-lifecycle-request/v1",
      participant: member, taskId: h.task.taskId, action });
    await assert.rejects(h.service.stage(capabilityRequest(h.task, { requestId: `after-${action}` })),
      error => error.code === "agent-task-not-active");
    await assert.rejects(h.service.approveAndExecute(approval(staged.proposal)),
      error => error.code === "agent-task-not-active");
  }
});

test("expired proposals remain effect-free", async () => {
  const h = harness({ ttl: 1_000 });
  const staged = await h.service.stage(capabilityRequest(h.task));
  h.advance(1_001);
  await assert.rejects(h.service.approveAndExecute(approval(staged.proposal)),
    error => error.code === "agent-proposal-expired");
  assert.equal(h.repository.workspace(member.principalId, "project-a").files["README.md"], "before");
});

test("verification is exact, bounded, read-only and honestly reports mismatches", async () => {
  const h = harness({ profile: fixedProfile("safe-autopilot") });
  const pass = await h.service.stage(capabilityRequest(h.task, { requestId: "verify-pass",
    capabilityId: "workspace.verify-synthetic", args: { assertions: [
      { path: "README.md", sha256: sha256("before") },
      { path: "missing.txt", sha256: null },
    ] } }));
  assert.equal(pass.receipt.output.matched, true);
  const fail = await h.service.stage(capabilityRequest(h.task, { requestId: "verify-fail",
    capabilityId: "workspace.verify-synthetic", args: { assertions: [
      { path: "README.md", sha256: sha256("wrong") },
    ] } }));
  assert.equal(fail.receipt.output.matched, false);
  assert.equal(h.repository.workspace(member.principalId, "project-a").revision, 1);
});

test("public receipts and audit summaries exclude objective, file content, model output and rollback snapshots", async () => {
  const h = harness();
  const privateValue = "PRIVATE-SYNTHETIC-CONTENT";
  const staged = await h.service.stage(capabilityRequest(h.task, { args: { path: "README.md", content: privateValue } }));
  const result = await h.service.approveAndExecute(approval(staged.proposal));
  const publicEvidence = JSON.stringify({ receipt: result.receipt,
    audit: h.service.auditSummary(member, h.task.taskId) });
  assert.doesNotMatch(publicEvidence, /PRIVATE-SYNTHETIC-CONTENT|Improve the synthetic project|turn-1|beforeContent|afterContent/);
  assert.equal(result.receipt.receiptSha256.length, 64);
  assert.equal(h.repository.auditSummary().privateValuesIncluded, false);
});

test("public audit summaries are task scoped and do not reveal another task's activity", async () => {
  const h = harness({ profile: fixedProfile("safe-autopilot") });
  await h.service.stage(capabilityRequest(h.task, { requestId: "task-one-change" }));
  const before = h.service.auditSummary(member, h.task.taskId);
  const task2 = h.service.createTask(taskRequest({ requestId: "audit-task-two", sessionId: "audit-session-two",
    profile: fixedProfile("safe-autopilot") }));
  await h.service.stage(capabilityRequest(task2, { requestId: "task-two-change",
    args: { path: "README.md", content: "task-two" } }));
  const after = h.service.auditSummary(member, h.task.taskId);
  assert.deepEqual(after, before);
});

test("Gate 7F production modules have no real effect, network, provider, identity or deployment imports", async () => {
  const paths = ["gate7f/contracts.mjs", "gate7f/registry.mjs", "gate7f/policy.mjs", "gate7f/core.mjs",
    "gate7f/adapters/memory.mjs", "gate7f/adapters/synthetic-executor.mjs"];
  const source = (await Promise.all(paths.map(path => readFile(path, "utf8")))).join("\n");
  assert.doesNotMatch(source, /node:(?:fs|child_process|http|https|net|tls)|\bfetch\s*\(|\bWebSocket\b/);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:gate6|gate7a|gate7e|keycloak|openfga|provider|deployment|control)/i);
  assert.doesNotMatch(source, /\bgit\s+(?:add|commit|push)|powershell|cmd\.exe/i);
});
