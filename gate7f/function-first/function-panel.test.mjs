import test from "node:test";
import assert from "node:assert/strict";
import { functionAnswerSelection, functionDescription, approvalIsAvailable, restoredWorkspaceNotice, runEvidenceNotice, taskPresentation } from "../../gate6b/public/function-panel.mjs";
test("ordinary conversation keeps Chat and Code routes separate", () => {
  assert.deepEqual(functionAnswerSelection("conversation", [], "chat"), { lane: "general" });
  assert.deepEqual(functionAnswerSelection("conversation", [], "code"), { lane: "code" });
});

test("function descriptions distinguish drafts, selected research, review and real bounded work", () => {
  assert.match(functionDescription("conversation", "code"), /draft is not execution/i);
  assert.match(functionDescription("work", "code"), /edit and run its fixed tests/);
  assert.match(functionDescription("work", "code"), /approval profile/);
  assert.match(functionDescription("research", "chat"), /not live web research/);
  assert.match(functionDescription("review", "code"), /does not edit or execute/);
  assert.doesNotMatch(functionDescription("work", "chat"), /can plan, inspect, edit/);
});
test("research/review requires an explicit bounded source selection", () => {
  for (const mode of ["research", "review"]) {
    assert.throws(() => functionAnswerSelection(mode, [], "chat"), /Select/);
    assert.throws(() => functionAnswerSelection(mode, Array(7).fill({}), "chat"), /Select/);
    assert.deepEqual(functionAnswerSelection(mode, [{ sourceId: "a", sectionId: "provided", content: "not in payload" }], "code"),
      { lane: mode, workspace: { sources: [{ sourceId: "a", sectionId: "provided" }] } });
  }
});

test("reload offers only exact server-revalidated approvals, never a remembered grant alone", () => {
  const proposal = { proposalId: "pending", status: "pending-approval", grantId: "grant", grantRevision: 2 };
  const state = { task: { status: "active" }, approvableProposalIds: ["pending"], pendingReconciliation: [],
    grants: [{ grantId: "grant", revision: 2, status: "active" }] };
  assert.equal(approvalIsAvailable(state, proposal), true);
  for (const change of [{ approvableProposalIds: [] }, { approvableProposalIds: undefined },
    { pendingReconciliation: [{ proposalId: "uncertain" }] }, { pendingReconciliation: undefined },
    { task: { status: "cancelled" } }, { grants: [{ grantId: "grant", revision: 3, status: "active" }] },
    { grants: [{ grantId: "grant", revision: 2, status: "revoked" }] }]) {
    assert.equal(approvalIsAvailable({ ...state, ...change }, proposal), false);
  }
  assert.equal(approvalIsAvailable(state, { ...proposal, status: "completed" }), false);
  assert.equal(approvalIsAvailable(state, { ...proposal, proposalId: "other" }), false);
});

test("restored state is labelled from the current application receipt, not older success or model prose", () => {
  const restored = { receiptId: "restored", capabilityId: "project.restore", effectKind: "revision-published" };
  assert.match(restoredWorkspaceNotice({ currentReceiptIds: ["restored"], receipts: [restored] }), /Prior successful runs remain in history/);
  assert.equal(restoredWorkspaceNotice({ currentReceiptIds: ["later"], receipts: [restored] }), null);
  assert.equal(restoredWorkspaceNotice({ currentReceiptIds: ["restored"], receipts: [{ ...restored, effectKind: "not-published" }] }), null);
  assert.equal(restoredWorkspaceNotice({ answer: "restored", receipts: [] }), null);
});

test("durable cancellation wins over stale run status on reload and explains unsettled effects", () => {
  for (const status of ["running", "completed", "waiting-approval"]) {
    const result = { task: { status: "cancelled" }, run: { status }, proposals: [{ status: "dispatching" }] };
    const shown = taskPresentation(result);
    assert.equal(shown.status, "cancelled");
    assert.match(shown.notice, /already-dispatched step may still be finishing or awaiting reconciliation/);
    assert.doesNotMatch(shown.notice, /immediately|killed|terminated/);
    assert.match(taskPresentation({ ...result, proposals: [], pendingReconciliation: [{}] }).notice, /awaiting reconciliation/);
    assert.match(taskPresentation({ ...result, proposals: [], pendingReconciliation: [] }).notice, /historical results/);
  }
  assert.deepEqual(taskPresentation({ task: { status: "active" }, run: { status: "waiting-approval" } }),
    { status: "waiting-approval", notice: null });
});

test("an uncertain durable effect overrides an active task label and blocks successor inference", () => {
  for (const result of [
    { task: { status: "active" }, proposals: [{ status: "unknown" }], pendingReconciliation: [] },
    { task: { status: "active" }, proposals: [], pendingReconciliation: [{ proposalId: "uncertain" }] }
  ]) {
    const shown = taskPresentation(result);
    assert.equal(shown.status, "unknown");
    assert.match(shown.notice, /Reconcile/);
    assert.match(shown.notice, /must not repeat/);
  }
});

test("reopened stale and revoked runs explain the actual durable stop without implying success", () => {
  const stale = taskPresentation({ task: { status: "active" }, run: { status: "failed", errorCode: "m1-stale-project" } });
  assert.equal(stale.status, "failed");
  assert.match(stale.notice, /newer files were preserved/);
  assert.match(stale.notice, /old action was not applied/);
  const revoked = taskPresentation({ task: { status: "active" }, run: { status: "failed", errorCode: "m1-grant-revoked" } });
  assert.match(revoked.notice, /permission is no longer valid/);
  assert.equal(taskPresentation({ task: { status: "active" }, run: { status: "needs-reconciliation", errorCode: "m1-stale-project" } }).notice, null);
});

test("run outcome wording comes only from server-derived evidence", () => {
  const evidence = (changeStatus, testStatus) => ({ schemaVersion: "runaai-m1-run-evidence/v1", changeStatus, testStatus });
  assert.match(runEvidenceNotice(evidence("none-recorded", "none-recorded")), /this run recorded no applied file change/i);
  assert.match(runEvidenceNotice(evidence("none-recorded", "none-recorded")), /this run did not execute tests/i);
  assert.match(runEvidenceNotice(evidence("applied", "ran")), /applied file change/i);
  assert.match(runEvidenceNotice(evidence("unknown", "unknown")), /unresolved/i);
  assert.equal(runEvidenceNotice(null), null);
});
