import test from "node:test";
import assert from "node:assert/strict";
import { CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, digest, enforceArguments, evaluatePolicy,
  parseContext, parseGrant, parseProposal, parseTask, proposalDigest, receiptDigest } from "./contracts.mjs";

const base = { taskId: "task-1", grantId: "grant-1", grantRevision: 1, requestId: "request-1" };
const grant = { capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
  capabilityIds: ["project.inspect", "project.apply-change", "project.run-tests", "project.restore"],
  profile: "safe-autopilot", allowedPaths: ["index.js"], allowedSuites: ["addition"] };

test("context is an exact server-derived identity tuple, not a verified flag", () => {
  assert.deepEqual(parseContext({ principalId: "alice", projectId: "project-a", sessionId: "session-a" }),
    { principalId: "alice", projectId: "project-a", sessionId: "session-a" });
  assert.throws(() => parseContext({ principalId: "alice", projectId: "project-a", sessionId: "session-a", verified: true }));
});
test("task intent is explicit, bounded and defaults only at the compatibility boundary", () => {
  assert.equal(parseTask({ requestId: "request-1", objective: "Inspect", workIntent: "analysis-only" }).workIntent, "analysis-only");
  assert.equal(parseTask({ requestId: "request-1", objective: "Inspect" }).workIntent, "effect-requested");
  assert.throws(() => parseTask({ requestId: "request-1", objective: "Inspect", workIntent: "unbounded" }), /m1-invalid-request/);
});
test("proposal rejects an authority field, unknown executor, forged reference and unbounded path", () => {
  const value = { ...base, capabilityId: "project.inspect", arguments: { path: "index.js" } };
  assert.equal(parseProposal(value).arguments.path, "index.js");
  for (const forged of [{ ...value, approved: true }, { ...value, capabilityId: "terminal.run" },
    { ...value, arguments: { path: "../index.js" } }, { ...value, arguments: { path: "index.js:secret" } },
    { ...value, arguments: { path: "CON.js" } }, { ...value, capabilityId: "project.restore", arguments: { targetReference: {} } }]) {
    assert.throws(() => parseProposal(forged), /m1-invalid-request/);
  }
});
test("new capability sets cannot inherit an old grant", () => {
  assert.equal(evaluatePolicy(grant, "project.apply-change"), "automatic");
  assert.throws(() => evaluatePolicy({ ...grant, capabilitySetVersion: "m1-javascript/v2" }, "project.apply-change"));
  assert.throws(() => evaluatePolicy({ ...grant, capabilitySetDigest: "0".repeat(64) }, "project.apply-change"));
  assert.throws(() => parseGrant({ taskId: "task-1", profile: "full-project-autopilot", allowedPaths: ["index.js"],
    expiresAt: "2026-08-28T12:00:00.000Z" }));
});
test("all initial profile decisions are application-owned", () => {
  assert.equal(evaluatePolicy({ ...grant, profile: "read-only" }, "project.inspect"), "automatic");
  assert.equal(evaluatePolicy({ ...grant, profile: "read-only" }, "project.run-tests"), "denied");
  assert.equal(evaluatePolicy({ ...grant, profile: "ask-every-time" }, "project.apply-change"), "approval-required");
  assert.equal(evaluatePolicy({ ...grant, capabilityIds: ["project.inspect"] }, "project.apply-change"), "denied");
});
test("path, suite and owned-restore limits are enforced independently", () => {
  enforceArguments(grant, "project.apply-change", { path: "index.js" });
  assert.throws(() => enforceArguments(grant, "project.apply-change", { path: "other.js" }));
  assert.throws(() => enforceArguments(grant, "project.run-tests", { suiteId: "network" }));
  assert.throws(() => enforceArguments(grant, "project.restore", { receiptId: "receipt" }, ["other.js"]));
});
test("proposal/receipt digests ignore delivery state, never exact work or output", () => {
  const proposal = { arguments: { content: "a" }, status: "authorized", proposalDigest: "old" };
  assert.equal(proposalDigest(proposal), proposalDigest({ ...proposal, status: "completed", receiptId: "receipt-1" }));
  assert.notEqual(proposalDigest(proposal), proposalDigest({ ...proposal, arguments: { content: "b" } }));
  const receipt = { output: { answer: 26 }, replayed: false };
  assert.equal(receiptDigest(receipt), receiptDigest({ ...receipt, replayed: true }));
  assert.notEqual(receiptDigest(receipt), receiptDigest({ ...receipt, output: { answer: 30 } }));
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});
