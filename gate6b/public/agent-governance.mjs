const knownRunStates = new Set(["ready-to-plan", "planning", "running", "waiting-approval",
  "repair-required", "needs-reconciliation", "completed", "cancelled", "failed", "budget-exhausted"]);
const unsettledProposalStates = new Set(["dispatching", "dispatched", "unknown"]);
const knownProposalStates = new Set(["denied", "pending-approval", "authorized", "dispatching", "dispatched",
  "not-published", "completed", "cancelled", "unknown", "stale", "failed"]);
const profiles = new Set(["read-only", "ask-every-time", "safe-autopilot"]);
const capabilities = new Set(["project.inspect", "project.preview-change", "project.apply-change",
  "project.run-tests", "project.restore"]);
const capabilitySetVersion = "m1-javascript/v1";
const capabilitySetDigest = "bc93d32d36558e7860a7db700c1fa5f4c5df257487ae291ab0c4d0fdde14ad93";
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const canonical = value => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const same = (left, right) => canonical(left) === canonical(right);
const capabilityBinding = value => value?.capabilitySetVersion === capabilitySetVersion
  && value.capabilitySetDigest === capabilitySetDigest;
const freeze = value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const agentActionAuthorityFor = (result, run) => {
  const value = result?.agentActionAuthority;
  if (!value || value.schemaVersion !== "runaai-agent-action-authority/v1" || value.atomic !== true
      || value.taskId !== run.taskId || value.taskStatus !== result.task?.status
      || !["settled", "blocked"].includes(value.state) || !digest(value.authorityDigest)
      || ![value.pendingReconciliationCount, value.unsettledProposalCount, value.unsettledRunCount]
        .every(count => Number.isSafeInteger(count) && count >= 0)
      || !Array.isArray(value.approvableProposals) || !Array.isArray(value.revocableGrants)) return null;
  const settled = value.taskStatus === "active" && value.pendingReconciliationCount === 0
    && value.unsettledProposalCount === 0 && value.unsettledRunCount === 0;
  return value.state === (settled ? "settled" : "blocked") ? value : null;
};

export function contextualAgentWorkflow(selected, experience) {
  if (experience !== "code") throw new Error("Agent is available only inside a Code task.");
  return selected === true ? "agent" : "code";
}

export function agentGovernanceResultProjection(result, presentation) {
  if (result?.run?.plannerRole !== "agent") return result;
  if (!presentation) return { ...result, proposals: [], receipts: [], pendingReconciliation: [],
    currentReceiptIds: [], approvableProposalIds: [], grants: [], agentPresentationInvalid: true };
  const proposalIds = new Set(presentation.records.proposalIds);
  const receiptIds = new Set(presentation.records.receiptIds);
  const reconciliationProposalIds = new Set(presentation.records.reconciliationProposalIds);
  const authority = presentation.authority;
  const run = result.run, task = result.task;
  const owned = value => value?.taskId === run.taskId && value.participantId === run.participantId
    && value.projectId === run.projectId && value.environmentId === task.environmentId;
  const ownedIntent = value => value?.taskId === run.taskId && value.participantId === run.participantId
    && value.projectId === run.projectId;
  return {
    ...result,
    proposals: (result.proposals ?? []).filter(value => proposalIds.has(value.proposalId) && owned(value)),
    receipts: (result.receipts ?? []).filter(value => receiptIds.has(value.receiptId) && owned(value)),
    pendingReconciliation: (result.pendingReconciliation ?? [])
      .filter(value => reconciliationProposalIds.has(value.proposalId) && ownedIntent(value)),
    currentReceiptIds: (result.currentReceiptIds ?? []).filter(value => receiptIds.has(value)),
    approvableProposalIds: [...presentation.actions.canApproveProposalIds],
    grants: authority ? (result.grants ?? []).filter(value => value.grantId === authority.grantId
      && value.revision === authority.grantRevision && owned(value)) : [],
  };
}

/**
 * Converts only application-owned task/grant/proposal/receipt state into a safe
 * Agent view. Planner prose can describe a plan but can never create permission,
 * approval, execution, or completion presentation.
 */
export function agentGovernancePresentation(result, now = Date.now()) {
  const run = result?.run;
  if (run?.plannerRole !== "agent") return null;
  if (!knownRunStates.has(run.status) || typeof run.runId !== "string" || typeof run.taskId !== "string"
      || result?.task?.taskId !== run.taskId || !Number.isFinite(now)) return null;
  const task = result.task, project = result.project;
  if (!project || run.participantId !== task.participantId || run.participantId !== project.participantId
      || run.projectId !== task.projectId || run.projectId !== project.projectId
      || task.environmentId !== project.environmentId || run.objective !== task.objective) return null;
  const grants = Array.isArray(result.grants) ? result.grants : [];
  const actionAuthority = agentActionAuthorityFor(result, run);
  const allProposals = Array.isArray(result.proposals) ? result.proposals : [];
  const allReceipts = Array.isArray(result.receipts) ? result.receipts : [];
  const allReconciliation = Array.isArray(result.pendingReconciliation) ? result.pendingReconciliation : [];
  const currentReceipts = new Set(Array.isArray(result.currentReceiptIds) ? result.currentReceiptIds : []);
  const owned = value => value?.taskId === run.taskId && value.participantId === run.participantId
    && value.projectId === run.projectId && value.environmentId === task.environmentId;
  const ownedIntent = value => value?.taskId === run.taskId && value.participantId === run.participantId
    && value.projectId === run.projectId;
  const taskProposals = allProposals.filter(owned);
  if (taskProposals.some(value => typeof value?.proposalId !== "string" || !knownProposalStates.has(value.status))) return null;
  const taskProposalsById = new Map(taskProposals.map(value => [value.proposalId, value]));
  if (taskProposalsById.size !== taskProposals.length) return null;
  const taskReconciliation = allReconciliation.filter(ownedIntent);
  const taskReconciliationIds = new Set();
  for (const intent of taskReconciliation) {
    if (typeof intent?.proposalId !== "string" || taskReconciliationIds.has(intent.proposalId)
        || !taskProposalsById.has(intent.proposalId)) return null;
    taskReconciliationIds.add(intent.proposalId);
  }
  const stepsByRequestId = new Map();
  if (!Array.isArray(run.plans)) return null;
  for (const plan of run.plans) {
    if (!Array.isArray(plan?.steps)) return null;
    for (const step of plan.steps) {
      if (typeof step?.requestId !== "string" || stepsByRequestId.has(step.requestId)
          || !capabilities.has(step.capabilityId)) return null;
      stepsByRequestId.set(step.requestId, step);
    }
  }
  const actions = Array.isArray(run.actions) ? run.actions : [];
  const actionProposalIds = new Set(), selectedProposalIds = new Set(), actionReceiptIds = new Set();
  for (const action of actions) {
    if (!action || typeof action.proposalId !== "string" || typeof action.receiptId !== "string"
        || actionProposalIds.has(action.proposalId) || actionReceiptIds.has(action.receiptId)
        || !digest(action.receiptDigest) || !capabilities.has(action.capabilityId)
        || !Number.isSafeInteger(action.planIndex) || action.planIndex < 0
        || !Number.isSafeInteger(action.stepIndex) || action.stepIndex < 0
        || !run.plans[action.planIndex]?.steps?.[action.stepIndex]) return null;
    actionProposalIds.add(action.proposalId); actionReceiptIds.add(action.receiptId);
    selectedProposalIds.add(action.proposalId);
  }
  if (run.pendingProposalId !== null && run.pendingProposalId !== undefined) {
    if (typeof run.pendingProposalId !== "string" || actionProposalIds.has(run.pendingProposalId)) return null;
    selectedProposalIds.add(run.pendingProposalId);
  }
  const proposals = allProposals.filter(proposal => selectedProposalIds.has(proposal.proposalId) && owned(proposal));
  const receipts = allReceipts.filter(receipt => actionReceiptIds.has(receipt.receiptId) && owned(receipt));
  if (proposals.length !== selectedProposalIds.size || receipts.length !== actionReceiptIds.size) return null;
  const proposalsById = new Map(proposals.map(proposal => [proposal.proposalId, proposal]));
  const receiptsById = new Map(receipts.map(receipt => [receipt.receiptId, receipt]));
  if (proposalsById.size !== proposals.length || receiptsById.size !== receipts.length) return null;
  const observedRequestIds = new Set();
  for (const action of actions) {
    const proposal = proposalsById.get(action.proposalId), receipt = receiptsById.get(action.receiptId);
    const step = stepsByRequestId.get(proposal?.requestId);
    const indexedStep = run.plans[action.planIndex].steps[action.stepIndex];
    if (!proposal || !receipt || !step || indexedStep !== step || !digest(proposal.proposalDigest)
        || !capabilityBinding(proposal) || !capabilityBinding(receipt)
        || proposal.capabilityId !== action.capabilityId || step.capabilityId !== proposal.capabilityId
        || !same(step.arguments, proposal.arguments) || receipt.proposalId !== proposal.proposalId
        || receipt.proposalDigest !== proposal.proposalDigest || receipt.receiptDigest !== action.receiptDigest
        || receipt.capabilityId !== action.capabilityId || receipt.executionStatus !== action.executionStatus
        || receipt.grantId !== proposal.grantId || receipt.grantRevision !== proposal.grantRevision
        || receipt.argumentsDigest !== proposal.argumentsDigest || receipt.policy !== proposal.policy) return null;
    observedRequestIds.add(proposal.requestId);
  }
  const pendingProposal = run.pendingProposalId ? proposalsById.get(run.pendingProposalId) : null;
  const pendingStep = run.plans?.[run.activePlan]?.steps?.[run.nextStep];
  if (pendingProposal && (!pendingStep || !digest(pendingProposal.proposalDigest)
      || pendingProposal.requestId !== pendingStep.requestId || pendingProposal.sessionId !== run.sessionId
      || pendingProposal.capabilityId !== pendingStep.capabilityId
      || !same(pendingProposal.arguments, pendingStep.arguments) || !capabilityBinding(pendingProposal)
      || pendingProposal.grantId !== run.grantId || pendingProposal.grantRevision !== run.grantRevision
      || pendingProposal.grantDefinitionDigest !== run.grantDefinitionDigest)) return null;
  const unsettled = taskReconciliation.length > 0
    || taskProposals.some(proposal => unsettledProposalStates.has(proposal.status));
  const rolledBack = receipts.some(receipt => currentReceipts.has(receipt.receiptId)
    && receipt.capabilityId === "project.restore" && receipt.effectKind === "revision-published"
    && receipt.executionStatus === "published" && digest(receipt.receiptDigest));
  const state = result.task.status === "cancelled" || run.status === "cancelled" ? "cancelled" : unsettled ? "unknown"
    : rolledBack ? "rolled-back" : run.status === "completed" ? "completed"
      : ["failed", "budget-exhausted"].includes(run.status) ? "failed" : "pending";

  // The current UI loader composes task.status and run.status responses. Since
  // those reads are not one authoritative transaction, their union can present
  // evidence and history but can never prove live Agent authority.
  const activeGrant = null;

  const plans = Array.isArray(run.plans) ? run.plans.map((plan, planIndex) => freeze({
    planIndex, summary: typeof plan.summary === "string" ? plan.summary : "",
    planDigest: digest(plan.planDigest) ? plan.planDigest : null,
    status: planIndex < run.activePlan ? "historical" : planIndex === run.activePlan ? "current" : "future",
    steps: Array.isArray(plan.steps) ? plan.steps.map((step, stepIndex) => freeze({
      stepIndex, capabilityId: step.capabilityId, arguments: structuredClone(step.arguments),
      status: observedRequestIds.has(step.requestId) ? "observed"
        : planIndex === run.activePlan && stepIndex === run.nextStep ? "current" : "pending",
    })) : [],
  })) : [];
  const proposalViews = proposals.map(proposal => {
    const grant = grants.find(value => value.grantId === proposal.grantId && value.revision === proposal.grantRevision);
    const exactGrant = grant && owned(grant) && profiles.has(grant.profile) && capabilityBinding(grant)
      && Array.isArray(grant.capabilityIds) && grant.capabilityIds.includes(proposal.capabilityId)
      && grant.definitionDigest === proposal.grantDefinitionDigest ? grant : null;
    const exactApproval = actionAuthority?.state === "settled" ? actionAuthority.approvableProposals.find(value =>
      value?.proposalId === proposal.proposalId && value.proposalDigest === proposal.proposalDigest
      && value.capabilityId === proposal.capabilityId && value.grantId === proposal.grantId
      && value.grantRevision === proposal.grantRevision) : null;
    const canApprove = proposal.status === "pending-approval" && proposal.policy === "approval-required"
      && Boolean(exactApproval);
    return freeze({ proposalId: proposal.proposalId, capabilityId: proposal.capabilityId,
      status: proposal.status, proposalDigest: digest(proposal.proposalDigest) ? proposal.proposalDigest : null,
      profile: exactGrant?.profile ?? null, grantId: exactGrant?.grantId ?? null,
      grantRevision: exactGrant?.revision ?? null, canApprove,
      exactEffect: structuredClone(proposal.arguments), preview: structuredClone(proposal.prepared?.preview ?? null) });
  });
  const receiptViews = receipts.filter(receipt => digest(receipt.receiptDigest)).map(receipt => {
    const outcome = receipt.capabilityId === "project.restore" && receipt.executionStatus === "published"
      && currentReceipts.has(receipt.receiptId) ? "rolled-back"
      : receipt.executionStatus === "published" || receipt.executionStatus === "observed"
        || receipt.executionStatus === "ran" && receipt.output?.passed === true ? "completed"
        : receipt.executionStatus === "ran" && receipt.output?.passed === false ? "failed"
          : "failed";
    return freeze({ receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest,
      proposalId: receipt.proposalId, capabilityId: receipt.capabilityId,
      executionStatus: receipt.executionStatus, outcome,
      cancellationRequested: receipt.cancellationRequested === true,
      current: currentReceipts.has(receipt.receiptId) });
  });
  const recovery = unsettled ? "reconciliation-required"
    : result.sessionRebindRequired === true ? "session-rebind-required"
      : Number.isSafeInteger(run.recoveredActiveWindowCount) && run.recoveredActiveWindowCount > 0
        ? "restart-reconciled" : "settled";
  return freeze({ schemaVersion: "runaai-contextual-agent-presentation/v1", runId: run.runId,
    state, recovery, plans, proposals: proposalViews, receipts: receiptViews,
    records: { proposalIds: [...selectedProposalIds], receiptIds: [...actionReceiptIds],
      reconciliationProposalIds: taskReconciliation.map(value => value.proposalId) },
    authority: activeGrant ? freeze({ profile: activeGrant.profile, grantId: activeGrant.grantId,
      grantRevision: activeGrant.revision }) : null,
    actions: freeze({ canCancel: result.task.status === "active",
      canRevoke: actionAuthority?.state === "settled" && actionAuthority.revocableGrants.length > 0,
      canReconcile: unsettled, canApproveProposalIds: proposalViews.filter(value => value.canApprove)
        .map(value => value.proposalId) }),
    notice: state === "unknown" ? "An action outcome is unresolved. Reconcile the recorded effect before continuing; restart or duplicate input must not repeat it."
      : state === "cancelled" ? (unsettled
        ? "The task is stopped and no new effect may begin. An already-dispatched action remains unresolved and must be reconciled without repetition."
        : "The task is stopped. No new effect may begin; receipts from work already observed remain historical.")
        : state === "rolled-back" ? "The current workspace matches an application-recorded rollback receipt. Earlier successful receipts remain history."
          : state === "completed" ? "The application recorded completion of the accepted plan."
            : state === "failed" ? "The task stopped without a completed-plan claim. Inspect its retained application records."
              : "The Agent plan is pending, running, or waiting for an exact application approval.",
  });
}
