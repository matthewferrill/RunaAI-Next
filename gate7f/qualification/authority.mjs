import { randomUUID } from "node:crypto";
import { Gate7fAgentFoundationService } from "../core.mjs";
import { MemoryAgentFoundationRepository } from "../adapters/memory.mjs";
import { SyntheticWorkspaceExecutor } from "../adapters/synthetic-executor.mjs";
import {
  agentReceiptDigest, canonicalDigest, parseAgentCapabilityRequest, parseAgentReceipt, sha256,
} from "../contracts.mjs";
import { evaluateAgentPolicy } from "../policy.mjs";
import { agentCapability } from "../registry.mjs";

const clone = value => structuredClone(value);
const coded = (code, message = code) => Object.assign(new Error(message), { code });
const fail = code => { throw coded(code); };
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
const workspaceDigest = workspace => canonicalDigest({ revision: workspace.revision, files: workspace.files });
const taskBinding = task => canonicalDigest({ taskId: task.taskId, participantId: task.participantId,
  projectId: task.projectId, sessionId: task.sessionId, environment: task.environment,
  profile: task.profile, objectiveSha256: task.objectiveSha256 });
const requestKey = (taskId, requestId) => `${taskId}\u0000${requestId}`;
const requireRevision = value => {
  if (!Number.isSafeInteger(value) || value < 1) fail("qualification-grant-revision-invalid");
};
const publicGrant = grant => clone({ grantId: grant.grantId, revision: grant.revision, taskId: grant.taskId,
  actorId: grant.actorId, projectId: grant.projectId, sessionId: grant.sessionId,
  environmentId: grant.environmentId, environmentKind: grant.environmentKind, status: grant.status,
  expiresAt: grant.expiresAt, expectedWorkspaceRevision: grant.expectedWorkspaceRevision,
  allowedPaths: grant.allowedPaths, rules: grant.rules, definitionSha256: grant.definitionSha256 });
const definitionDigest = grant => canonicalDigest({ grantId: grant.grantId, revision: grant.revision,
  taskId: grant.taskId, actorId: grant.actorId, projectId: grant.projectId, sessionId: grant.sessionId,
  environmentId: grant.environmentId, environmentKind: grant.environmentKind,
  expiresAt: grant.expiresAt, status: grant.status, taskBindingSha256: grant.taskBindingSha256,
  allowedPaths: grant.allowedPaths, rules: grant.rules });

function validContext(context) {
  if (!exactKeys(context, ["actorId", "projectId", "sessionId", "environmentId"])
    || !Object.values(context).every(id)) fail("qualification-invalid-context");
  return clone(context);
}

function contextFor(grant) {
  return { actorId: grant.actorId, projectId: grant.projectId,
    sessionId: grant.sessionId, environmentId: grant.environmentId };
}

function safePath(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(value)
    || value.split("/").some(part => ["", ".", "..", "__proto__", "constructor", "prototype"].includes(part))) {
    fail("qualification-path-denied");
  }
  return value;
}

/**
 * Synthetic qualification boundary, not an authentication service or durable store.
 * Only trusted application code receives `application`. Never expose that port or snapshots
 * as model tools. A bound model port accepts only a proposal and an idempotency identifier.
 */
export function createQualificationAuthority({ now = () => new Date(), snapshot = null,
  testFaults = {} } = {}) {
  if (snapshot && snapshot.schemaVersion !== "runa2-qualification-authority-snapshot/v1") {
    fail("qualification-snapshot-invalid");
  }
  const repository = new MemoryAgentFoundationRepository({ now, snapshot: snapshot?.foundation ?? null });
  const synthetic = new SyntheticWorkspaceExecutor({ repository });
  const grants = new Map(clone(snapshot?.grants ?? []));
  const requests = new Map(clone(snapshot?.requests ?? []));
  const manualApprovals = new Set();
  const queues = new Map();
  const faults = clone(testFaults);
  for (const fault of Object.values(faults)) {
    if (!fault || typeof fault !== "object" || Object.entries(fault).some(([key, value]) =>
      !["failBeforeEffect", "failAfterEffectBeforeRecord", "interruptAfterRecord"].includes(key)
      || typeof value !== "boolean")) fail("qualification-test-fault-invalid");
  }

  function lookup(grantId, context, revision = null, { active = true, workspace = true } = {}) {
    validContext(context);
    const grant = grants.get(grantId);
    if (!grant) fail("qualification-grant-not-found");
    if (canonicalDigest(contextFor(grant)) !== canonicalDigest(context)) fail("qualification-scope-denied");
    if (grant.definitionSha256 !== definitionDigest(grant)) fail("qualification-grant-integrity-invalid");
    if (active && grant.status !== "active") fail(`qualification-grant-${grant.status}`);
    if (revision !== null && revision !== grant.revision) fail("qualification-grant-revision-stale");
    const task = repository.task(grant.taskId);
    if (!task || taskBinding(task) !== grant.taskBindingSha256) fail("qualification-task-binding-invalid");
    if (active && task.status !== "active") fail("qualification-task-inactive");
    if (active && now().getTime() >= Date.parse(grant.expiresAt)) fail("qualification-grant-expired");
    if (active && workspace && repository.workspace(grant.actorId, grant.projectId).revision
      !== grant.expectedWorkspaceRevision) fail("qualification-workspace-revision-stale");
    return grant;
  }

  function proposalRequest(grant, requestId, proposal) {
    if (!id(requestId) || !exactKeys(proposal, ["capabilityId", "arguments"])) {
      fail("qualification-invalid-proposal");
    }
    if (!agentCapability(proposal.capabilityId)) fail("qualification-capability-unknown");
    try {
      return parseAgentCapabilityRequest({ schemaVersion: "runa2-agent-capability-request/v1",
        requestId, participant: { principalId: grant.actorId, verified: true }, taskId: grant.taskId,
        origin: { type: "model-output", reference: "qualification-proposal" },
        capabilityId: proposal.capabilityId, arguments: clone(proposal.arguments) });
    } catch { fail("qualification-invalid-proposal"); }
  }

  function affectedPaths(grant, request) {
    const args = request.arguments;
    if (request.capabilityId === "workspace.restore-synthetic-change") {
      const receipt = repository.receipt(args.forwardReceiptId);
      const rollback = repository.rollbackState(args.forwardReceiptId);
      const source = [...requests.values()].find(item => item.proposalId === receipt?.proposalId);
      if (!receipt || !rollback || !source || source.grantId !== grant.grantId
        || receipt.taskId !== grant.taskId || receipt.participantId !== grant.actorId
        || receipt.projectId !== grant.projectId || receipt.environmentId !== grant.environmentId
        || !validReceipt(receipt, source)) fail("qualification-restore-scope-denied");
      return [safePath(rollback.path)];
    }
    if (request.capabilityId === "workspace.verify-synthetic") {
      return args.assertions.map(assertion => safePath(assertion.path));
    }
    return [safePath(args.path)];
  }

  function checkArguments(grant, request) {
    const paths = affectedPaths(grant, request);
    if (paths.some(path => !grant.allowedPaths.includes(path))) fail("qualification-path-denied");
    const rule = grant.rules.find(item => item.capabilityId === request.capabilityId);
    if (!rule) fail("qualification-capability-denied");
    if (!rule.argumentsSha256.includes(canonicalDigest(request.arguments))) {
      fail("qualification-arguments-denied");
    }
  }

  function rulesFor(grant, allowedPaths, rules) {
    if (!Array.isArray(allowedPaths) || !allowedPaths.length || allowedPaths.length > 64
      || !Array.isArray(rules) || !rules.length || rules.length > 5) fail("qualification-grant-scope-invalid");
    const paths = allowedPaths.map(safePath);
    if (new Set(paths).size !== paths.length) fail("qualification-grant-scope-invalid");
    const capabilities = new Set();
    const normalized = rules.map(rule => {
      if (!exactKeys(rule, ["capabilityId", "exactArguments"]) || capabilities.has(rule.capabilityId)
        || !Array.isArray(rule.exactArguments) || !rule.exactArguments.length || rule.exactArguments.length > 64) {
        fail("qualification-grant-scope-invalid");
      }
      capabilities.add(rule.capabilityId);
      const hashes = rule.exactArguments.map(args => {
        const request = proposalRequest(grant, "grant-definition", { capabilityId: rule.capabilityId, arguments: args });
        if (affectedPaths(grant, request).some(path => !paths.includes(path))) fail("qualification-path-denied");
        return canonicalDigest(request.arguments);
      });
      if (new Set(hashes).size !== hashes.length) fail("qualification-grant-scope-invalid");
      return { capabilityId: rule.capabilityId, argumentsSha256: hashes.sort() };
    });
    return { allowedPaths: paths.sort(), rules: normalized.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)) };
  }

  function expiry(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
      || Date.parse(value) <= now().getTime() || Date.parse(value) > now().getTime() + 24 * 60 * 60_000) {
      fail("qualification-expiry-invalid");
    }
    return new Date(value).toISOString();
  }

  function validReceipt(raw, binding) {
    try {
      const receipt = parseAgentReceipt(raw);
      const proposal = repository.proposal(binding.proposalId);
      const kinds = { "workspace.inspect": "workspace-inspect", "workspace.preview-change": "workspace-preview",
        "workspace.apply-synthetic-change": "workspace-change", "workspace.restore-synthetic-change": "workspace-restore",
        "workspace.verify-synthetic": "workspace-verify" };
      const effectful = ["workspace-change", "workspace-restore"].includes(receipt.output.kind);
      return receipt.receiptSha256 === agentReceiptDigest(receipt)
        && proposal && receipt.proposalId === binding.proposalId && receipt.proposalDigest === proposal.proposalDigest
        && receipt.taskId === binding.request.taskId && receipt.participantId === binding.context.actorId
        && receipt.projectId === binding.context.projectId && receipt.sessionId === binding.context.sessionId
        && receipt.environmentId === binding.context.environmentId && receipt.executor === synthetic.executorId
        && receipt.capabilityId === binding.request.capabilityId
        && receipt.output.kind === kinds[binding.request.capabilityId]
        && receipt.beforeSha256 === binding.executionBeforeSha256
        && (effectful ? receipt.output.revision === binding.executionBeforeRevision + 1
          : receipt.afterSha256 === receipt.beforeSha256)
        && proposal.argumentsSha256 === canonicalDigest(binding.request.arguments);
    } catch { return false; }
  }

  function checkBinding(binding, proposal = null) {
    const grant = lookup(binding.grantId, binding.context, binding.revision);
    if (binding.requestSha256 !== canonicalDigest(binding.request)) fail("qualification-request-integrity-invalid");
    checkArguments(grant, binding.request);
    const payload = proposal ? repository.proposalPayload(proposal.proposalId) : null;
    if (proposal && (!payload || canonicalDigest(payload.request) !== binding.requestSha256
      || proposal.argumentsSha256 !== canonicalDigest(binding.request.arguments))) {
      fail("qualification-proposal-binding-invalid");
    }
    return grant;
  }

  const guardedExecutor = {
    executorId: synthetic.executorId,
    prepare: input => synthetic.prepare(input),
    execute(input) {
      const binding = requests.get(requestKey(input.task.taskId, input.request.requestId));
      if (!binding || canonicalDigest(input.request) !== binding.requestSha256) fail("qualification-request-unbound");
      checkBinding(binding, input.proposal);
      const policy = evaluateAgentPolicy({ task: repository.task(input.task.taskId),
        capability: agentCapability(input.request.capabilityId), preferences: repository.preferencesForTask(input.task) });
      if (policy.result === "deny") fail("qualification-current-policy-denied");
      if (policy.result === "approval-required" && !manualApprovals.has(input.proposal.proposalId)) {
        fail("qualification-current-approval-required");
      }
      const before = repository.workspace(binding.context.actorId, binding.context.projectId);
      binding.executionBeforeRevision = before.revision;
      binding.executionBeforeSha256 = workspaceDigest(before);
      return synthetic.execute(input);
    },
  };
  const foundation = new Gate7fAgentFoundationService({ repository, executor: guardedExecutor, now });

  function settle(binding) {
    const proposal = repository.proposalByRequest(binding.request.taskId, binding.request.requestId, binding.requestSha256);
    if (!proposal) return;
    binding.proposalId = proposal.proposalId;
    const receipt = repository.receiptForProposal(proposal.proposalId);
    const grant = grants.get(binding.grantId);
    if (receipt && validReceipt(receipt, binding) && binding.settledReceiptId !== receipt.receiptId) {
      if (grant?.revision === binding.revision
        && ["workspace-change", "workspace-restore"].includes(receipt.output.kind)) {
        // Adopt only this deed's revision. A different grant may already have changed the
        // workspace while the asynchronous foundation call was delivering this receipt.
        grant.expectedWorkspaceRevision = receipt.output.revision;
      }
      binding.settledReceiptId = receipt.receiptId;
    }
  }

  function serialized(grantId, fn) {
    const previous = queues.get(grantId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    queues.set(grantId, next);
    return next.finally(() => { if (queues.get(grantId) === next) queues.delete(grantId); });
  }

  function bindModel(rawBinding) {
    if (!exactKeys(rawBinding, ["actorId", "projectId", "sessionId", "environmentId", "grantId", "revision"])) {
      fail("qualification-invalid-binding");
    }
    const { grantId, revision, ...context } = clone(rawBinding);
    requireRevision(revision);
    lookup(grantId, context, revision);
    return Object.freeze({
      async propose(raw) {
        if (!exactKeys(raw, ["requestId", "proposal"])) fail("qualification-invalid-proposal");
        // Copy before queueing, so caller mutation cannot change arguments after validation.
        const input = clone(raw);
        return serialized(grantId, async () => {
          const grant = lookup(grantId, context, revision);
          const internalId = `g7fq-${canonicalDigest({ grantId, requestId: input.requestId }).slice(0, 48)}`;
          if (!id(input.requestId)) fail("qualification-invalid-proposal");
          const request = proposalRequest(grant, internalId, input.proposal);
          checkArguments(grant, request);
          const key = requestKey(grant.taskId, internalId);
          const existing = requests.get(key);
          const requestSha256 = canonicalDigest(request);
          if (existing && (existing.revision !== revision || existing.requestSha256 !== requestSha256)) {
            fail("qualification-request-replay-conflict");
          }
          const binding = existing ?? { grantId, revision, context: clone(context), request, requestSha256,
            externalRequestId: input.requestId, proposalId: null };
          requests.set(key, binding);
          try { return await foundation.stage(request, faults[input.requestId] ?? {}); }
          finally { settle(binding); }
        });
      },
    });
  }

  function proposalBinding(grantId, proposalId) {
    const binding = [...requests.values()].find(item => item.proposalId === proposalId);
    if (!binding || binding.grantId !== grantId) fail("qualification-proposal-not-found");
    return binding;
  }

  const application = Object.freeze({
    seedProject({ projectId, participantId, files }) {
      if (!id(projectId) || !id(participantId) || !files || typeof files !== "object" || Array.isArray(files)) {
        fail("qualification-seed-invalid");
      }
      if (repository.projects.has(projectId)) fail("qualification-project-already-seeded");
      for (const [path, content] of Object.entries(files)) {
        safePath(path);
        if (typeof content !== "string" || Buffer.byteLength(content) > 32 * 1024 || content.includes("\u0000")) {
          fail("qualification-seed-invalid");
        }
      }
      repository.seedProject({ projectId, participantId, files: clone(files) });
    },
    createGrant({ taskRequest, allowedPaths, rules, expiresAt }) {
      const task = foundation.createTask(clone(taskRequest));
      const grant = { grantId: `g7fg-${randomUUID()}`, revision: 1, taskId: task.taskId,
        actorId: task.participantId, projectId: task.projectId, sessionId: task.sessionId,
        environmentId: task.environment.environmentId, environmentKind: task.environment.environmentKind,
        taskBindingSha256: taskBinding(task), status: "active", expiresAt: expiry(expiresAt),
        expectedWorkspaceRevision: repository.workspace(task.participantId, task.projectId).revision };
      Object.assign(grant, rulesFor(grant, allowedPaths, rules));
      grant.definitionSha256 = definitionDigest(grant);
      grants.set(grant.grantId, grant);
      return publicGrant(grant);
    },
    bindModel,
    reviseGrant({ context, grantId, revision, allowedPaths, rules, expiresAt }) {
      requireRevision(revision);
      const previous = lookup(grantId, context, revision, { active: false });
      if (previous.status !== "active" || repository.task(previous.taskId).status !== "active") {
        fail("qualification-grant-not-active");
      }
      const grant = { ...clone(previous), revision: previous.revision + 1, expiresAt: expiry(expiresAt),
        expectedWorkspaceRevision: repository.workspace(previous.actorId, previous.projectId).revision };
      Object.assign(grant, rulesFor(grant, allowedPaths, rules));
      grant.definitionSha256 = definitionDigest(grant);
      grants.set(grantId, grant);
      return publicGrant(grant);
    },
    revokeGrant({ context, grantId, revision }) {
      requireRevision(revision);
      const grant = lookup(grantId, context, revision, { active: false });
      grant.status = "revoked";
      grant.revision += 1;
      grant.definitionSha256 = definitionDigest(grant);
      return publicGrant(grant);
    },
    cancel({ context, grantId, revision }) {
      requireRevision(revision);
      const grant = lookup(grantId, context, revision, { active: false });
      if (repository.task(grant.taskId).status === "active") {
        foundation.changeTaskLifecycle({ schemaVersion: "runa2-agent-task-lifecycle-request/v1",
          participant: { principalId: grant.actorId, verified: true }, taskId: grant.taskId, action: "cancel" });
      }
      grant.status = "cancelled";
      grant.revision += 1;
      grant.definitionSha256 = definitionDigest(grant);
      return publicGrant(grant);
    },
    async approve({ context, grantId, revision, proposalId, proposalDigest }) {
      requireRevision(revision);
      return serialized(grantId, async () => {
        const grant = lookup(grantId, context, revision);
        const binding = proposalBinding(grantId, proposalId);
        const proposal = repository.proposal(proposalId);
        checkBinding(binding, proposal);
        if (proposal.proposalDigest !== proposalDigest) fail("qualification-proposal-digest-mismatch");
        manualApprovals.add(proposalId);
        try {
          return await foundation.approveAndExecute({ schemaVersion: "runa2-agent-approval-request/v1",
            approvalId: `qualification-${randomUUID()}`, participant: { principalId: grant.actorId, verified: true },
            proposalId, proposalDigest, decision: "allow", remember: "once" }, faults[binding.externalRequestId] ?? {});
        } finally { manualApprovals.delete(proposalId); settle(binding); }
      });
    },
    setPreference({ context, grantId, revision, capabilityId, decision, scope = "session" }) {
      requireRevision(revision);
      const grant = lookup(grantId, context, revision);
      if (!grant.rules.some(rule => rule.capabilityId === capabilityId)) fail("qualification-capability-denied");
      return foundation.setPreference({ schemaVersion: "runa2-agent-preference-set-request/v1",
        decisionId: `qualification-${randomUUID()}`, participant: { principalId: grant.actorId, verified: true },
        taskId: grant.taskId, capabilityId, decision, scope });
    },
    state({ context, grantId, proposalId = null }) {
      const grant = lookup(grantId, context, null, { active: false });
      const workspace = repository.workspace(grant.actorId, grant.projectId);
      const result = { schemaVersion: "runa2-qualification-state/v1", taskStatus: repository.task(grant.taskId).status,
        grant: publicGrant(grant), workspaceRevision: workspace.revision,
        proposalStatus: null, executionStatus: "not-run", receipt: null, receiptMatchesCurrentWorkspace: false };
      if (!proposalId) return result;
      const binding = proposalBinding(grantId, proposalId);
      const proposal = repository.proposal(proposalId);
      if (!proposal) fail("qualification-proposal-not-found");
      result.proposalStatus = proposal.status;
      const receipt = repository.receiptForProposal(proposalId);
      if (receipt && validReceipt(receipt, binding)) {
        result.executionStatus = receipt.output.kind === "workspace-verify" && !receipt.output.matched
          ? "verification-failed" : "recorded";
        result.receipt = receipt;
        result.receiptMatchesCurrentWorkspace = receipt.afterSha256 === workspaceDigest(workspace);
      } else if (receipt) result.executionStatus = "record-invalid";
      else result.executionStatus = proposal.status === "executed" ? "record-missing"
        : proposal.status === "pending-approval" ? "pending-approval"
          : ["failed", "denied", "declined", "expired"].includes(proposal.status) ? proposal.status : "not-run";
      return clone(result);
    },
    workspace({ actorId, projectId }) { return repository.workspace(actorId, projectId); },
    auditSummary() { return repository.auditSummary(); },
    exportSyntheticSnapshot() {
      if (queues.size) fail("qualification-snapshot-busy");
      return clone({ schemaVersion: "runa2-qualification-authority-snapshot/v1",
        foundation: repository.exportSyntheticSnapshot(), grants: [...grants], requests: [...requests] });
    },
  });

  // There is intentionally no unbound model method and no model-callable grant issuer.
  return Object.freeze({ application });
}

export { sha256 };
