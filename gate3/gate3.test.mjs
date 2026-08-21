import assert from "node:assert/strict";
import test from "node:test";
import { MemoryGovernedActionStore } from "./adapters/memory.mjs";
import { Gate3GovernedActionService } from "./core.mjs";
import { createGate3Telemetry } from "./telemetry.mjs";

const steward = { principalId: "synthetic-steward", verified: true };
const other = { principalId: "other-steward", verified: true };
const action = value => ({ kind: "participant-setting.set-default-intelligence-level",
  settingKey: "defaultIntelligenceLevel", value });
const proposalRequest = ({ requestId = "request-1", participant = steward, projectId = "synthetic-project-a",
  value = "High", origin = "steward-request", rollbackOfReceiptId = null } = {}) => ({
  schemaVersion: "runa2-action-proposal-request/v1", requestId, participant,
  project: { projectId }, origin: { type: origin, reference: origin === "model-output" ? "turn-1" : null },
  action: action(value), rollbackOfReceiptId,
});
const approvalRequest = (proposal, { participant = steward, approvalId = "approval-1", digest = proposal.proposalDigest } = {}) => ({
  schemaVersion: "runa2-action-approval-request/v1", approvalId, participant,
  proposalId: proposal.proposalId, proposalDigest: digest, approvalPhrase: "approve",
});

function harness({ initial = "Medium", now = new Date("2026-08-21T12:00:00.000Z"), ttl = 30 * 60_000 } = {}) {
  let current = now;
  const store = new MemoryGovernedActionStore({ now: () => current, proposalTtlMs: ttl });
  store.seedProject({ projectId: "synthetic-project-a", participantId: steward.principalId });
  store.seedProject({ projectId: "synthetic-project-b", participantId: other.principalId });
  store.seedSetting(steward.principalId, initial);
  return { store, service: new Gate3GovernedActionService({ store }), advance(ms) { current = new Date(current.getTime() + ms); } };
}

test("proposal is an exact, inert preview", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  assert.equal(store.settingValue(steward.principalId), "Medium");
  assert.match(proposal.preview, /Current: Medium\nProposed: High/);
  assert.match(proposal.preview, /Nothing has happened yet/);
  assert.equal(proposal.status, "pending");
});

test("only the one allowlisted action and setting value parse", async () => {
  const { service } = harness();
  const wrongKind = proposalRequest(); wrongKind.action.kind = "file-write";
  await assert.rejects(service.propose(wrongKind));
  const wrongValue = proposalRequest(); wrongValue.action.value = "Turbo";
  await assert.rejects(service.propose(wrongValue));
  const extra = proposalRequest(); extra.action.command = "do anything";
  await assert.rejects(service.propose(extra));
});

test("unverified participants cannot propose", async () => {
  const { service } = harness();
  await assert.rejects(service.propose(proposalRequest({ participant: { ...steward, verified: false } })),
    error => error.code === "action-not-authorized");
});

test("retrieved content can never originate authority", async () => {
  const { service } = harness();
  await assert.rejects(service.propose(proposalRequest({ origin: "retrieved-content" })),
    error => error.code === "action-origin-denied");
});

test("verified model output may stage but cannot execute", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest({ origin: "model-output" }));
  assert.equal(proposal.origin.type, "model-output");
  assert.equal(store.settingValue(steward.principalId), "Medium");
  assert.equal(store.auditState().capabilities, 0);
});

test("a project outside the participant scope is denied", async () => {
  const { service } = harness();
  await assert.rejects(service.propose(proposalRequest({ projectId: "synthetic-project-b" })),
    error => error.code === "action-project-not-authorized");
});

test("duplicate proposal delivery returns the same proposal", async () => {
  const { store, service } = harness();
  const request = proposalRequest();
  const [first, second] = [await service.propose(request), await service.propose(request)];
  assert.deepEqual(second, first);
  assert.equal(store.auditState().proposals, 1);
});

test("a reused request id with changed arguments fails closed", async () => {
  const { service } = harness();
  await service.propose(proposalRequest());
  await assert.rejects(service.propose(proposalRequest({ value: "Low" })),
    error => error.code === "action-request-conflict");
});

test("approval requires a verified steward", async () => {
  const { service } = harness();
  const proposal = await service.propose(proposalRequest());
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal,
    { participant: { ...steward, verified: false } })), error => error.code === "action-not-authorized");
});

test("approval cannot cross participant scope", async () => {
  const { service } = harness();
  const proposal = await service.propose(proposalRequest());
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal, { participant: other })),
    error => error.code === "action-not-authorized");
});

test("approval is bound to the exact proposal digest", async () => {
  const { service } = harness();
  const proposal = await service.propose(proposalRequest());
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal, { digest: "0".repeat(64) })),
    error => error.code === "action-proposal-digest-mismatch");
});

test("a plain or mixed approval phrase is not accepted by the contract", async () => {
  const { service } = harness();
  const proposal = await service.propose(proposalRequest());
  const mixed = approvalRequest(proposal); mixed.approvalPhrase = "approve but change it";
  await assert.rejects(service.approveAndExecute(mixed));
});

test("the approved effect creates one capability, receipt, and outbox row", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  const receipt = await service.approveAndExecute(approvalRequest(proposal));
  assert.equal(store.settingValue(steward.principalId), "High");
  assert.equal(receipt.beforeValue, "Medium"); assert.equal(receipt.afterValue, "High");
  assert.deepEqual(store.auditState(), { proposals: 1, receipts: 1, capabilities: 1, outbox: 1 });
});

test("duplicate approval replays the durable receipt without a second deed", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  const first = await service.approveAndExecute(approvalRequest(proposal));
  const replay = await service.approveAndExecute(approvalRequest(proposal, { approvalId: "approval-retry" }));
  assert.equal(replay.receiptId, first.receiptId); assert.equal(replay.replayed, true);
  assert.deepEqual(store.auditState(), { proposals: 1, receipts: 1, capabilities: 1, outbox: 1 });
});

test("concurrent duplicate approval yields one deed", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  const results = await Promise.all([
    service.approveAndExecute(approvalRequest(proposal, { approvalId: "approval-a" })),
    service.approveAndExecute(approvalRequest(proposal, { approvalId: "approval-b" })),
  ]);
  assert.equal(new Set(results.map(item => item.receiptId)).size, 1);
  assert.equal(store.auditState().receipts, 1);
});

test("stale state refuses instead of overwriting", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  store.seedSetting(steward.principalId, "Low");
  store.seedSetting(steward.principalId, "Medium");
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal)), error => error.code === "action-stale-state");
  assert.equal(store.settingValue(steward.principalId), "Medium"); assert.equal(store.auditState().receipts, 0);
});

test("expired approval refuses and remains effect-free", async () => {
  const h = harness({ ttl: 1_000 });
  const proposal = await h.service.propose(proposalRequest()); h.advance(1_001);
  await assert.rejects(h.service.approveAndExecute(approvalRequest(proposal)), error => error.code === "action-proposal-expired");
  assert.equal(h.store.settingValue(steward.principalId), "Medium"); assert.equal(h.store.auditState().receipts, 0);
});

test("decline is durable and prevents later execution", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  const declined = await service.decline({ schemaVersion: "runa2-action-decline-request/v1", participant: steward,
    proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest, reason: "not now" });
  assert.equal(declined.status, "declined");
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal)), error => error.code === "action-proposal-not-pending");
  assert.equal(store.settingValue(steward.principalId), "Medium");
});

test("failure before effect creates no deed or receipt", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal), { failBeforeEffect: true }),
    error => error.code === "action-simulated-before-effect");
  assert.equal(store.settingValue(steward.principalId), "Medium"); assert.equal(store.auditState().receipts, 0);
});

test("failure between effect and record rolls back atomically", async () => {
  const { store, service } = harness();
  const proposal = await service.propose(proposalRequest());
  await assert.rejects(service.approveAndExecute(approvalRequest(proposal), { failAfterEffectBeforeRecord: true }),
    error => error.code === "action-simulated-atomic-rollback");
  assert.equal(store.settingValue(steward.principalId), "Medium");
  assert.deepEqual(store.auditState(), { proposals: 1, receipts: 0, capabilities: 0, outbox: 0 });
});

test("rollback is a second governed action through the same pathway", async () => {
  const { store, service } = harness();
  const forward = await service.propose(proposalRequest({ requestId: "forward" }));
  const forwardReceipt = await service.approveAndExecute(approvalRequest(forward, { approvalId: "approve-forward" }));
  const rollback = await service.propose(proposalRequest({ requestId: "rollback", value: "Medium",
    rollbackOfReceiptId: forwardReceipt.receiptId }));
  assert.match(rollback.preview, /Rollback of receipt/); assert.equal(store.settingValue(steward.principalId), "High");
  const rollbackReceipt = await service.approveAndExecute(approvalRequest(rollback, { approvalId: "approve-rollback" }));
  assert.equal(store.settingValue(steward.principalId), "Medium");
  assert.equal(rollbackReceipt.rollbackOfReceiptId, forwardReceipt.receiptId);
  assert.deepEqual(store.auditState(), { proposals: 2, receipts: 2, capabilities: 2, outbox: 2 });
});

test("rollback cannot name an unknown or cross-scope receipt", async () => {
  const { service } = harness({ initial: "High" });
  await assert.rejects(service.propose(proposalRequest({ value: "Medium", rollbackOfReceiptId: "unknown-receipt" })),
    error => error.code === "action-rollback-receipt-invalid");
});

test("rollback refuses when current state no longer matches the original deed", async () => {
  const { store, service } = harness();
  const forward = await service.propose(proposalRequest({ requestId: "forward" }));
  const receipt = await service.approveAndExecute(approvalRequest(forward));
  store.seedSetting(steward.principalId, "Low");
  await assert.rejects(service.propose(proposalRequest({ requestId: "rollback", value: "Medium",
    rollbackOfReceiptId: receipt.receiptId })), error => error.code === "action-rollback-state-invalid");
});

test("an already-satisfied postcondition does not create a proposal", async () => {
  const { store, service } = harness({ initial: "High" });
  await assert.rejects(service.propose(proposalRequest({ value: "High" })),
    error => error.code === "action-postcondition-already-satisfied");
  assert.equal(store.auditState().proposals, 0);
});

test("receipt reads are participant scoped", async () => {
  const { service } = harness();
  const proposal = await service.propose(proposalRequest());
  const receipt = await service.approveAndExecute(approvalRequest(proposal));
  await assert.rejects(service.readReceipt(other, receipt.receiptId), error => error.code === "action-receipt-not-found");
  assert.equal((await service.readReceipt(steward, receipt.receiptId)).receiptId, receipt.receiptId);
});

test("telemetry emits only allowlisted pseudonymous action metadata", async () => {
  const observed = { initial: null, final: {}, ended: false };
  const tracer = { startActiveSpan(_name, options, callback) {
    observed.initial = options.attributes;
    return callback({ setAttribute(key, value) { observed.final[key] = value; }, end() { observed.ended = true; } });
  } };
  const h = harness();
  h.service = new Gate3GovernedActionService({ store: h.store,
    telemetry: createGate3Telemetry({ hmacKey: "synthetic-gate3-telemetry-key", tracer }) });
  await h.service.propose(proposalRequest());
  const serialized = JSON.stringify({ ...observed.initial, ...observed.final });
  assert.equal(observed.ended, true);
  assert.equal(observed.initial["action.kind"], "participant-setting.set-default-intelligence-level");
  assert.match(observed.initial["participant.id"], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(serialized, /synthetic-steward|synthetic-project-a|request-1/);
  assert.equal(observed.final["result.status"], "pending");
});
