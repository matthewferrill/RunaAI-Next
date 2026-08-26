import { MemoryAgentFoundationRepository } from "./adapters/memory.mjs";
import { SyntheticWorkspaceExecutor } from "./adapters/synthetic-executor.mjs";
import { Gate7fAgentFoundationService } from "./core.mjs";

const participant = { principalId: "gate7f-synthetic-member", verified: true };
const environment = { environmentId: "gate7f-synthetic-environment", environmentKind: "synthetic-memory" };

function serviceFor(repository) {
  const executor = new SyntheticWorkspaceExecutor({ repository });
  return new Gate7fAgentFoundationService({ repository, executor,
    now: () => new Date("2026-08-26T18:00:00.000Z") });
}

function createTask(service, requestId, profile, sessionId = requestId) {
  return service.createTask({ schemaVersion: "runa2-agent-task-create-request/v1", requestId,
    participant, project: { projectId: "synthetic-project" }, session: { sessionId }, environment,
    profile, objective: "Exercise the inert Agent Mode foundation.", origin: "user-request" });
}

function request(task, requestId, capabilityId, args) {
  return { schemaVersion: "runa2-agent-capability-request/v1", requestId, participant,
    taskId: task.taskId, origin: { type: "model-output", reference: `turn-${requestId}` },
    capabilityId, arguments: args };
}

function approval(proposal, approvalId) {
  return { schemaVersion: "runa2-agent-approval-request/v1", approvalId, participant,
    proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
    decision: "allow", remember: "once" };
}

const repository = new MemoryAgentFoundationRepository({ now: () => new Date("2026-08-26T18:00:00.000Z") });
repository.seedProject({ projectId: "synthetic-project", participantId: participant.principalId,
  files: { "README.md": "before" } });
const service = serviceFor(repository);

const readOnly = createTask(service, "read-only-task", { id: "read-only" });
const denied = await service.stage(request(readOnly, "read-only-write", "workspace.apply-synthetic-change",
  { path: "README.md", content: "denied" }));

const ask = createTask(service, "ask-task", { id: "ask-every-time" });
const pending = await service.stage(request(ask, "ask-write", "workspace.apply-synthetic-change",
  { path: "README.md", content: "approved" }));
const forward = await service.approveAndExecute(approval(pending.proposal, "approve-forward"));

const restartedRepository = new MemoryAgentFoundationRepository({
  now: () => new Date("2026-08-26T18:00:00.000Z"),
  snapshot: repository.exportSyntheticSnapshot(),
});
const restarted = serviceFor(restartedRepository);
const replay = await restarted.stage(request(ask, "ask-write", "workspace.apply-synthetic-change",
  { path: "README.md", content: "approved" }));
const rollbackProposal = await restarted.stage(request(ask, "ask-rollback", "workspace.restore-synthetic-change",
  { forwardReceiptId: forward.receipt.receiptId }));
const rollback = await restarted.approveAndExecute(approval(rollbackProposal.proposal, "approve-rollback"));

const safe = createTask(restarted, "safe-task", { id: "safe-autopilot" }, "safe-session");
const automatic = await restarted.stage(request(safe, "safe-write", "workspace.apply-synthetic-change",
  { path: "README.md", content: "automatic" }));

const result = {
  schemaVersion: "runa2-gate7f0-synthetic-result/v1",
  passed: denied.proposal.status === "denied"
    && pending.proposal.status === "pending-approval"
    && forward.receipt.output.kind === "workspace-change"
    && replay.receipt.receiptId === forward.receipt.receiptId
    && replay.receipt.replayed === true
    && rollback.receipt.output.kind === "workspace-restore"
    && automatic.receipt.policyBasis === "profile-safe-autopilot",
  profileResults: {
    readOnly: denied.proposal.status,
    askEveryTime: pending.proposal.status,
    safeAutopilot: automatic.receipt ? "executed" : "not-executed",
  },
  restartReplaySameReceipt: replay.receipt.receiptId === forward.receipt.receiptId,
  rollbackSecondReceipt: rollback.receipt.receiptId !== forward.receipt.receiptId,
  finalRevision: restartedRepository.workspace(participant.principalId, "synthetic-project").revision,
  receiptCount: restartedRepository.auditSummary().byType["proposal-executed"] ?? 0,
  environmentKind: environment.environmentKind,
  realFilesystemUsed: false,
  processStarted: false,
  networkCalled: false,
  modelCalled: false,
  productionChanged: false,
  privateValuesIncluded: false,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.passed) process.exitCode = 1;
