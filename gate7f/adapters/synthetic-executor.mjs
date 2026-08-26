import { canonicalDigest, sha256 } from "../contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);
const fileSha256 = content => content == null ? null : sha256(content);
const workspaceSha256 = workspace => canonicalDigest({ revision: workspace.revision, files: workspace.files });

function renderChangePreview(path, beforeContent, afterContent, label = "Proposed synthetic change") {
  const before = fileSha256(beforeContent) ?? "absent";
  const after = fileSha256(afterContent) ?? "absent";
  const content = afterContent == null ? "<file absent>" : afterContent;
  return `${label}\nPath: ${path}\nBefore SHA-256: ${before}\nAfter SHA-256: ${after}\n`
    + `--- proposed content ---\n${content}\n--- end proposed content ---\nNothing has happened yet.`;
}

export class SyntheticWorkspaceExecutor {
  constructor({ repository }) {
    this.repository = repository;
    this.executorId = "synthetic-memory/v1";
  }

  prepare({ task, request }) {
    this.#environment(task);
    const workspace = this.repository.workspace(task.participantId, task.projectId);
    const capabilityId = request.capabilityId;
    const args = request.arguments;
    const beforeWorkspaceSha256 = workspaceSha256(workspace);
    if (capabilityId === "workspace.inspect") {
      const content = workspace.files[args.path];
      if (content == null) throw coded("agent-synthetic-file-not-found", "The synthetic file does not exist.");
      return { preconditionSha256: canonicalDigest({ beforeWorkspaceSha256, path: args.path,
        contentSha256: fileSha256(content) }), preview: `Inspect synthetic file: ${args.path}\nNo mutation will occur.`,
      beforeWorkspaceSha256, rollbackOfReceiptId: null };
    }
    if (capabilityId === "workspace.preview-change" || capabilityId === "workspace.apply-synthetic-change") {
      const beforeContent = workspace.files[args.path] ?? null;
      if (beforeContent === args.content) throw coded("agent-postcondition-already-satisfied", "The synthetic file already has the proposed content.");
      return { preconditionSha256: canonicalDigest({ beforeWorkspaceSha256, path: args.path,
        beforeSha256: fileSha256(beforeContent) }), preview: renderChangePreview(args.path, beforeContent, args.content),
      beforeWorkspaceSha256, rollbackOfReceiptId: null };
    }
    if (capabilityId === "workspace.verify-synthetic") {
      return { preconditionSha256: canonicalDigest({ beforeWorkspaceSha256, assertions: args.assertions }),
        preview: `Verify ${args.assertions.length} exact synthetic workspace assertion(s).\nNo mutation will occur.`,
      beforeWorkspaceSha256, rollbackOfReceiptId: null };
    }
    if (capabilityId === "workspace.restore-synthetic-change") {
      const forward = this.repository.receipt(args.forwardReceiptId);
      const rollbackState = this.repository.rollbackState(args.forwardReceiptId);
      if (!forward || !rollbackState || forward.participantId !== task.participantId
        || forward.projectId !== task.projectId || forward.environmentId !== task.environment.environmentId) {
        throw coded("agent-rollback-receipt-invalid", "Rollback must name an effect receipt in the same scope.");
      }
      if (beforeWorkspaceSha256 !== forward.afterSha256 || fileSha256(workspace.files[rollbackState.path] ?? null) !== rollbackState.afterFileSha256) {
        throw coded("agent-rollback-state-invalid", "The synthetic workspace changed after the forward receipt.");
      }
      return { preconditionSha256: canonicalDigest({ beforeWorkspaceSha256,
        forwardReceiptId: forward.receiptId, rollbackStateSha256: canonicalDigest(rollbackState) }),
      preview: renderChangePreview(rollbackState.path, rollbackState.afterContent,
        rollbackState.beforeContent, `Rollback synthetic receipt: ${forward.receiptId}`),
      beforeWorkspaceSha256, rollbackOfReceiptId: forward.receiptId };
    }
    throw coded("agent-capability-unknown", "The capability is not registered with the synthetic executor.");
  }

  execute({ task, proposal, request }) {
    this.#environment(task);
    const prepared = this.prepare({ task, request });
    if (prepared.preconditionSha256 !== proposal.preconditionSha256) {
      throw coded("agent-stale-state", "Synthetic workspace state changed after preview.");
    }
    const before = this.repository.workspace(task.participantId, task.projectId);
    const capabilityId = request.capabilityId;
    const args = request.arguments;
    if (capabilityId === "workspace.inspect") {
      const content = before.files[args.path];
      return { beforeSha256: workspaceSha256(before), afterSha256: workspaceSha256(before),
        output: { kind: "workspace-inspect", path: args.path, sha256: sha256(content),
          bytes: Buffer.byteLength(content, "utf8") },
        delivery: { content }, rollbackState: null, undo: () => {} };
    }
    if (capabilityId === "workspace.preview-change") {
      const beforeContent = before.files[args.path] ?? null;
      return { beforeSha256: workspaceSha256(before), afterSha256: workspaceSha256(before),
        output: { kind: "workspace-preview", path: args.path, beforeSha256: fileSha256(beforeContent),
          afterSha256: sha256(args.content), changed: beforeContent !== args.content },
        delivery: null, rollbackState: null, undo: () => {} };
    }
    if (capabilityId === "workspace.verify-synthetic") {
      const matched = args.assertions.every(assertion => fileSha256(before.files[assertion.path] ?? null) === assertion.sha256);
      return { beforeSha256: workspaceSha256(before), afterSha256: workspaceSha256(before),
        output: { kind: "workspace-verify", checked: args.assertions.length, matched },
        delivery: null, rollbackState: null, undo: () => {} };
    }
    if (capabilityId === "workspace.apply-synthetic-change") {
      const beforeContent = before.files[args.path] ?? null;
      const next = clone(before);
      next.files[args.path] = args.content;
      next.revision += 1;
      this.repository.replaceWorkspace(task.participantId, task.projectId, next);
      const afterSha256 = workspaceSha256(next);
      const rollbackState = { path: args.path, beforeContent, beforeFileSha256: fileSha256(beforeContent),
        afterContent: args.content, afterFileSha256: sha256(args.content) };
      return { beforeSha256: workspaceSha256(before), afterSha256,
        output: { kind: "workspace-change", path: args.path, beforeSha256: fileSha256(beforeContent),
          afterSha256: sha256(args.content), revision: next.revision },
        delivery: null, rollbackState,
        undo: () => this.repository.replaceWorkspace(task.participantId, task.projectId, before) };
    }
    if (capabilityId === "workspace.restore-synthetic-change") {
      const rollback = this.repository.rollbackState(args.forwardReceiptId);
      const next = clone(before);
      const currentContent = next.files[rollback.path] ?? null;
      if (rollback.beforeContent == null) delete next.files[rollback.path];
      else next.files[rollback.path] = rollback.beforeContent;
      next.revision += 1;
      this.repository.replaceWorkspace(task.participantId, task.projectId, next);
      return { beforeSha256: workspaceSha256(before), afterSha256: workspaceSha256(next),
        output: { kind: "workspace-restore", path: rollback.path,
          restoredSha256: rollback.beforeFileSha256, revision: next.revision },
        delivery: null,
        rollbackState: { path: rollback.path, beforeContent: currentContent,
          beforeFileSha256: fileSha256(currentContent), afterContent: rollback.beforeContent,
          afterFileSha256: rollback.beforeFileSha256 },
        undo: () => this.repository.replaceWorkspace(task.participantId, task.projectId, before) };
    }
    throw coded("agent-capability-unknown", "The capability is not registered with the synthetic executor.");
  }

  #environment(task) {
    if (task.environment.environmentKind !== "synthetic-memory") {
      throw coded("agent-environment-denied", "Gate 7F-0 accepts only the synthetic-memory environment.");
    }
  }
}

