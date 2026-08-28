import test from "node:test";
import assert from "node:assert/strict";
import { functionAnswerSelection, functionDescription, approvalIsAvailable, restoredWorkspaceNotice, taskPresentation } from "../../gate6b/public/function-panel.mjs";
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
