import {
  CAPABILITIES, CAPABILITY_SET_DIGEST, CAPABILITY_SET_VERSION, assert, binding, digest, enforceArguments,
  evaluatePolicy, failure, grantDefinitionDigest, makeId, parseApproval, parseContext, parseGrant,
  parseGrantId, parseProject, parseProposal, parseProposalId, parseTask, parseTaskId,
  proposalDigest, receiptDigest, requestKey,
} from "./contracts.mjs";

const mutation = id => ["project.apply-change", "project.restore"].includes(id);
const terminal = new Set(["completed", "denied", "cancelled", "stale", "failed", "not-published"]);
const clone = value => structuredClone(value);

/** Application-owned ports. Models may only receive bindModel(...). */
export class M1TaskService {
  constructor({ store, adapter, now = () => new Date(), hooks = {}, cancellationPollMs = 100,
    authorizeContext = null, allowSyntheticAuthority = false }) {
    assert(typeof authorizeContext === "function" || allowSyntheticAuthority === true, "m1-session-authority-required");
    Object.assign(this, { store, adapter, now, hooks, cancellationPollMs,
      authorizeContext: authorizeContext ?? (async () => true) });
    this.running = new Map();
  }
  timestamp() { return this.now().toISOString(); }
  async checkContext(context) {
    try {
      const result = await this.authorizeContext(context);
      assert(result === true || result?.allowed === true, "m1-session-authority-unavailable");
    } catch { throw failure("m1-session-authority-unavailable"); }
  }

  async registerProject(rawContext, rawInput) {
    const context = parseContext(rawContext), input = parseProject(rawInput);
    await this.checkContext(context);
    const registrationDigest = digest(input);
    const existing = await this.store.transaction(context, tx => tx.project());
    if (existing) {
      assert(existing.registrationDigest === registrationDigest, "m1-project-already-registered");
      return existing;
    }
    const reference = await this.adapter.createEnvironment({ ...binding(context, input.environmentId),
      files: Object.entries(input.files).map(([path, content]) => ({ path, content })) });
    await this.adapter.verifyMaterialized({ binding: binding(context, input.environmentId), reference });
    return this.store.transaction(context, async tx => {
      await this.checkContext(context);
      const raced = await tx.project();
      if (raced) {
        assert(raced.registrationDigest === registrationDigest, "m1-project-already-registered");
        return raced;
      }
      const project = { schemaVersion: "runa-m1-project/v1", participantId: context.principalId,
        projectId: context.projectId, environmentId: input.environmentId, revision: 1, reference,
        registrationDigest, createdAt: this.timestamp(), updatedAt: this.timestamp() };
      await tx.saveProject(project, { insertOnly: true });
      await tx.audit("project-registered", context.projectId, { reference });
      return project;
    });
  }

  async currentProject(rawContext) {
    const context = parseContext(rawContext);
    return this.store.transaction(context, async tx => {
      const project = await tx.project();
      assert(project, "m1-project-not-found");
      return project;
    });
  }

  async createTask(rawContext, rawInput) {
    const context = parseContext(rawContext), input = parseTask(rawInput);
    return this.store.transaction(context, async tx => {
      const project = await tx.project();
      assert(project, "m1-project-not-found");
      const key = requestKey("create-task", input.requestId), requestDigest = digest(input);
      const existing = await tx.byRequest("task", key);
      if (existing) { assert(existing.requestDigest === requestDigest, "m1-request-id-conflict"); return existing; }
      const task = { schemaVersion: "runa-m1-task/v1", taskId: makeId("task"),
        participantId: context.principalId, projectId: context.projectId, environmentId: project.environmentId,
        createdSessionId: context.sessionId, requestId: input.requestId, requestDigest,
        objective: input.objective, workIntent: input.workIntent, status: "active", createdAt: this.timestamp(), updatedAt: this.timestamp() };
      await tx.save("task", task.taskId, task, { insertOnly: true, requestKey: key });
      await tx.audit("task-created", task.taskId, { requestDigest });
      return task;
    });
  }

  async createGrant(rawContext, rawInput) {
    const context = parseContext(rawContext), input = parseGrant(rawInput);
    await this.checkContext(context);
    assert(new Date(input.expiresAt).valueOf() > this.now().valueOf()
      && new Date(input.expiresAt).valueOf() - this.now().valueOf() <= 86_400_000, "m1-grant-expiry-invalid");
    assert(new Set(input.allowedPaths).size === input.allowedPaths.length
      && new Set(input.allowedSuites).size === input.allowedSuites.length, "m1-grant-duplicates");
    const capabilities = input.capabilityIds ?? Object.keys(CAPABILITIES);
    assert(new Set(capabilities).size === capabilities.length, "m1-grant-duplicates");
    const grant = await this.store.transaction(context, async tx => {
      const task = await this.requireTask(tx, input.taskId, true);
      for (const prior of await tx.list("grant", task.taskId)) {
        if (prior.status !== "active") continue;
        prior.status = "revoked"; prior.revision += 1; prior.updatedAt = this.timestamp();
        prior.definitionDigest = grantDefinitionDigest(prior);
        await tx.save("grant", prior.grantId, prior);
      }
      const next = { schemaVersion: "runa-m1-grant/v1", grantId: makeId("grant"), revision: 1,
        participantId: context.principalId, projectId: context.projectId, environmentId: task.environmentId,
        taskId: task.taskId, sessionId: context.sessionId, taskBindingDigest: digest(taskIdentity(task)),
        capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
        capabilityIds: [...capabilities].sort(), profile: input.profile, allowedPaths: [...input.allowedPaths].sort(),
        allowedSuites: [...input.allowedSuites].sort(), status: "active", expiresAt: input.expiresAt,
        createdAt: this.timestamp(), updatedAt: this.timestamp() };
      next.definitionDigest = grantDefinitionDigest(next);
      await tx.save("grant", next.grantId, next, { insertOnly: true });
      await tx.audit("grant-created", next.grantId, { definitionDigest: next.definitionDigest });
      return next;
    });
    // Existing executions observe revocation through PostgreSQL too, including after process restart.
    for (const running of this.running.values()) if (running.taskId === input.taskId) running.controller.abort();
    return grant;
  }

  bindModel(rawContext, { taskId, grantId, grantRevision }) {
    const context = parseContext(rawContext);
    return Object.freeze({ propose: ({ requestId, capabilityId, arguments: args }) => this.propose(context,
      { taskId, grantId, grantRevision, requestId, capabilityId, arguments: args }) });
  }

  async propose(rawContext, rawInput) {
    const context = parseContext(rawContext), input = parseProposal(rawInput);
    const requestDigest = digest(input), key = requestKey(input.taskId, input.requestId);
    const snapshot = await this.store.transaction(context, async tx => {
      const existing = await tx.byRequest("proposal", key);
      if (existing) { assert(existing.requestDigest === requestDigest, "m1-request-id-conflict"); return { existing }; }
      const { task, grant, project } = await this.authority(tx, context, input);
      const resolved = await this.resolveArguments(tx, input, grant, project);
      return { task, grant, project, resolved, policy: evaluatePolicy(grant, input.capabilityId) };
    });
    if (snapshot.existing) return snapshot.existing;
    const prepared = snapshot.policy === "denied" ? null : await this.adapter.prepare({
      binding: binding(context, snapshot.project.environmentId), reference: snapshot.project.reference,
      capabilityId: input.capabilityId, args: snapshot.resolved.arguments });
    return this.store.transaction(context, async tx => {
      const existing = await tx.byRequest("proposal", key);
      if (existing) { assert(existing.requestDigest === requestDigest, "m1-request-id-conflict"); return existing; }
      const { project, grant } = await this.authority(tx, context, input);
      assert(project.revision === snapshot.project.revision
        && digest(project.reference) === digest(snapshot.project.reference), "m1-stale-project");
      const policy = evaluatePolicy(grant, input.capabilityId);
      const proposal = { schemaVersion: "runa-m1-proposal/v1", proposalId: makeId("proposal"),
        ...input, requestDigest, participantId: context.principalId, projectId: context.projectId,
        sessionId: context.sessionId, environmentId: project.environmentId,
        capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
        grantDefinitionDigest: grant.definitionDigest, policy, argumentsDigest: digest(input.arguments),
        resolvedArguments: snapshot.resolved.arguments, restorePaths: snapshot.resolved.restorePaths,
        expectedProjectRevision: project.revision, beforeReference: project.reference,
        prepared, createdAt: this.timestamp(), expiresAt: grant.expiresAt,
        status: policy === "denied" ? "denied" : policy === "approval-required" ? "pending-approval" : "authorized" };
      proposal.proposalDigest = proposalDigest(proposal);
      await tx.save("proposal", proposal.proposalId, proposal, { insertOnly: true, requestKey: key });
      await tx.audit("proposal-created", proposal.proposalId, { proposalDigest: proposal.proposalDigest, policy });
      return proposal;
    });
  }

  async approve(rawContext, rawInput) {
    const context = parseContext(rawContext), input = parseApproval(rawInput);
    await this.checkContext(context);
    const result = await this.store.transaction(context, async tx => {
      const proposal = await this.requireProposal(tx, input.proposalId);
      assert(proposal.proposalDigest === input.proposalDigest, "m1-proposal-digest-mismatch");
      if (proposal.status === "completed") return this.result(tx, proposal, true);
      const errorCode = await this.pendingAuthority(tx, context, proposal);
      if (errorCode) return { errorCode };
      assert(["pending-approval", "authorized"].includes(proposal.status), "m1-proposal-not-approvable");
      proposal.approval = { principalId: context.principalId, sessionId: context.sessionId,
        proposalDigest: proposal.proposalDigest, grantRevision: proposal.grantRevision,
        approvedAt: this.timestamp() };
      proposal.status = "authorized"; proposal.updatedAt = this.timestamp();
      await tx.save("proposal", proposal.proposalId, proposal);
      await tx.audit("proposal-approved", proposal.proposalId, proposal.approval);
      return { proposal, receipt: null };
    });
    // Commit the precise rejection before throwing to the HTTP caller. Throwing
    // inside the transaction would leave the obsolete proposal waiting forever.
    if (result.errorCode) throw failure(result.errorCode);
    return result;
  }

  async revalidatePending(rawContext, rawInput) {
    const context = parseContext(rawContext), { proposalId } = parseProposalId(rawInput);
    await this.checkContext(context);
    const result = await this.store.transaction(context, async tx => {
      const proposal = await this.requireProposal(tx, proposalId);
      // Once there is an intent, only the normal execution/reconciliation path
      // may resolve its outcome. A stale authority is not proof it never ran.
      if (!["pending-approval", "authorized"].includes(proposal.status) || await tx.get("intent", proposalId)) return { proposal };
      return { proposal, errorCode: await this.pendingAuthority(tx, context, proposal) };
    });
    if (result.errorCode) throw failure(result.errorCode);
    return result.proposal;
  }

  async pendingAuthority(tx, context, proposal, { requireApproval = false } = {}) {
    assert(proposal.sessionId === context.sessionId, "m1-grant-session-mismatch");
    try {
      await this.authority(tx, context, proposal, { proposal, requireApproval });
      return null;
    } catch (error) {
      const status = error.code === "m1-stale-project" ? "stale"
        : ["m1-grant-revoked", "m1-grant-expired", "m1-stale-grant"].includes(error.code) ? "denied" : null;
      if (!status || !["pending-approval", "authorized"].includes(proposal.status)
          || await tx.get("intent", proposal.proposalId)) throw error;
      proposal.status = status; proposal.errorCode = error.code; proposal.updatedAt = this.timestamp();
      await tx.save("proposal", proposal.proposalId, proposal);
      await tx.audit("pending-proposal-invalidated", proposal.proposalId,
        { proposalDigest: proposal.proposalDigest, errorCode: error.code });
      return error.code;
    }
  }

  async execute(rawContext, rawInput) {
    const context = parseContext(rawContext), { proposalId } = parseProposalId(rawInput);
    return this.store.operation(proposalId, async () => {
      const start = await this.store.transaction(context, async tx => {
        const proposal = await this.requireProposal(tx, proposalId);
        if (proposal.status === "completed" || terminal.has(proposal.status)) return { result: await this.result(tx, proposal, true) };
        const intent = await tx.get("intent", proposalId);
        // An existing dispatch means a previous process may have executed. Never invoke it again.
        if (intent) return { reconcile: true };
        await this.checkContext(context);
        const errorCode = await this.pendingAuthority(tx, context, proposal, { requireApproval: true });
        if (errorCode) return { errorCode };
        assert(proposal.status === "authorized", "m1-approval-required");
        const nextIntent = { schemaVersion: "runa-m1-effect-intent/v1", effectId: makeId("effect"),
          proposalId, taskId: proposal.taskId, participantId: context.principalId, projectId: context.projectId,
          proposalDigest: proposal.proposalDigest, status: "prepared", createdAt: this.timestamp(), updatedAt: this.timestamp() };
        await tx.save("intent", proposalId, nextIntent, { insertOnly: true });
        await tx.audit("effect-intent-recorded", nextIntent.effectId, { proposalDigest: proposal.proposalDigest });
        return { proposal, intent: nextIntent };
      });
      if (start.errorCode) throw failure(start.errorCode);
      if (start.result) return start.result;
      if (start.reconcile) return this.reconcileUnlocked(context, proposalId);
      await this.hooks.afterIntent?.(clone(start));
      await this.hooks.beforeDispatch?.(clone(start));
      const { proposal, intent } = start;
      const controller = new AbortController();
      this.running.set(proposalId, { controller, taskId: proposal.taskId, grantId: proposal.grantId });
      let poll;
      try {
        await this.store.transaction(context, async tx => {
          await this.checkContext(context);
          const current = await this.requireProposal(tx, proposalId);
          const dispatchAuthority = await this.authority(tx, context, current, { proposal: current, requireApproval: true });
          const recorded = await tx.get("intent", proposalId);
          assert(recorded.status === "prepared", "m1-effect-already-dispatched");
          recorded.status = "dispatching"; recorded.updatedAt = this.timestamp();
          recorded.dispatchAuthority = { participantId: context.principalId, projectId: context.projectId,
            sessionId: context.sessionId, proposalDigest: current.proposalDigest,
            grant: dispatchAuthority.grant, taskBindingDigest: digest(taskIdentity(dispatchAuthority.task)),
            projectRevision: dispatchAuthority.project.revision, reference: dispatchAuthority.project.reference,
            dispatchedAt: this.timestamp() };
          recorded.dispatchAuthorityDigest = digest(recorded.dispatchAuthority);
          await tx.save("intent", proposalId, recorded);
          current.status = "dispatched"; current.updatedAt = this.timestamp();
          await tx.save("proposal", proposalId, current);
          await tx.audit("effect-dispatched", intent.effectId);
        });
        // This poll is cancellation, not authority. The dispatch/publication checks above/below are authority.
        poll = setInterval(() => {
          this.checkActive(context, proposal).catch(() => controller.abort());
        }, this.cancellationPollMs);
        poll.unref?.();
        const adapterBinding = binding(context, proposal.environmentId);
        let observed;
        if (mutation(proposal.capabilityId)) {
          observed = await this.adapter.materialize({ binding: adapterBinding, effectId: intent.effectId,
            prepared: proposal.prepared, signal: controller.signal, authorize: () => this.checkActive(context, proposal) });
          await this.hooks.afterMaterialize?.({ proposal: clone(proposal), intent: clone(intent), observed: clone(observed) });
        } else if (proposal.capabilityId === "project.run-tests") {
          await this.checkActive(context, proposal);
          observed = await this.adapter.executeTests({ binding: adapterBinding, effectId: intent.effectId,
            reference: proposal.beforeReference, suiteId: proposal.arguments.suiteId, signal: controller.signal,
            authorize: () => this.checkActive(context, proposal) });
          await this.hooks.afterTests?.({ proposal: clone(proposal), observed: clone(observed) });
        } else {
          const snapshot = await this.adapter.inspectRevision({ binding: adapterBinding, reference: proposal.beforeReference });
          observed = { status: "observed", reference: snapshot.reference,
            beforeSha256: snapshot.workspaceSha256, afterSha256: snapshot.workspaceSha256,
            output: proposal.capabilityId === "project.inspect"
              ? { type: "file", file: snapshot.files.find(file => file.path === proposal.arguments.path) ?? null }
              : { type: "preview", preview: proposal.prepared.preview } };
        }
        const result = await this.publish(context, proposalId, observed);
        await this.hooks.afterCommit?.(clone(result));
        return result;
      } catch (error) {
        // Committed success survives a lost acknowledgement. Otherwise the intent is retained for observation.
        await this.markUncertain(context, proposalId, error);
        throw safeError(error);
      } finally { clearInterval(poll); this.running.delete(proposalId); }
    });
  }

  async reconcile(rawContext, rawInput) {
    const context = parseContext(rawContext), { proposalId } = parseProposalId(rawInput);
    return this.store.operation(proposalId, () => this.reconcileUnlocked(context, proposalId));
  }

  async reconcileUnlocked(context, proposalId) {
    const state = await this.store.transaction(context, async tx => {
      const proposal = await this.requireProposal(tx, proposalId);
      if (proposal.status === "completed" || terminal.has(proposal.status)) return { result: await this.result(tx, proposal, true) };
      return { proposal, intent: await tx.get("intent", proposalId) };
    });
    if (state.result) return state.result;
    if (!state.intent) return { proposal: state.proposal, receipt: null, reconciled: false };
    if (!state.intent.dispatchAuthority) {
      return this.store.transaction(context, async tx => {
        const proposal = await this.requireProposal(tx, proposalId), intent = await tx.get("intent", proposalId);
        assert(!intent.dispatchAuthority, "m1-reconciliation-race");
        proposal.status = "not-published"; proposal.errorCode = "m1-not-dispatched"; proposal.updatedAt = this.timestamp();
        intent.status = "not-published"; intent.updatedAt = this.timestamp();
        await tx.save("proposal", proposalId, proposal); await tx.save("intent", proposalId, intent);
        await tx.audit("effect-reconciled-not-dispatched", intent.effectId);
        return { proposal, receipt: null, reconciled: true, executionRepeated: false };
      });
    }
    if (!mutation(state.proposal.capabilityId)) {
      // Test stdout cannot be reconstructed from source or predicted by a model. Lost test results stay unknown.
      await this.markUncertain(context, proposalId, failure("m1-execution-outcome-unknown"));
      return this.proposalState(context, proposalId, { reconciled: true, executionRepeated: false });
    }
    const abandoned = await this.store.transaction(context, async tx => {
      const proposal = await this.requireProposal(tx, proposalId);
      if (proposal.status === "completed") return this.result(tx, proposal, true);
      const task = await this.requireTask(tx, proposal.taskId), grant = await tx.get("grant", proposal.grantId);
      const cannotPublish = task.status !== "active" || !grant || grant.status !== "active"
        || grant.revision !== proposal.grantRevision || new Date(grant.expiresAt).valueOf() <= this.now().valueOf();
      if (!cannotPublish) return null;
      // No receipt exists and pointer+receipt are atomic. Revoked authority can never publish the
      // staged revision later, even if an old worker still holds unreferenced filesystem bytes.
      proposal.status = "not-published"; proposal.errorCode = "m1-original-authority-ended"; proposal.updatedAt = this.timestamp();
      await tx.save("proposal", proposalId, proposal);
      const intent = await tx.get("intent", proposalId);
      intent.status = "not-published"; intent.updatedAt = this.timestamp();
      await tx.save("intent", proposalId, intent);
      await tx.audit("effect-reconciled-not-published", intent.effectId);
      return { proposal, receipt: null, reconciled: true, executionRepeated: false };
    });
    if (abandoned) return abandoned;
    assert(typeof this.adapter.observeMaterialized === "function", "m1-reconciliation-unavailable");
    const observation = await this.adapter.observeMaterialized({ binding: binding(context, state.proposal.environmentId),
      effectId: state.intent.effectId, prepared: state.proposal.prepared });
    if (observation.status === "absent") {
      return this.store.transaction(context, async tx => {
        const proposal = await this.requireProposal(tx, proposalId);
        if (proposal.status === "completed") return this.result(tx, proposal, true);
        proposal.status = "not-published"; proposal.errorCode = "m1-staging-not-found"; proposal.updatedAt = this.timestamp();
        await tx.save("proposal", proposalId, proposal);
        const intent = await tx.get("intent", proposalId);
        intent.status = "not-published"; intent.updatedAt = this.timestamp();
        await tx.save("intent", proposalId, intent);
        await tx.audit("effect-reconciled-not-published", intent.effectId);
        return { proposal, receipt: null, reconciled: true, executionRepeated: false };
      });
    }
    assert(observation.status === "present", "m1-reconciliation-invalid");
    try { return { ...await this.publish(context, proposalId, observation.result), reconciled: true, executionRepeated: false }; }
    catch (error) {
      await this.markUncertain(context, proposalId, error);
      return this.proposalState(context, proposalId, { reconciled: true, executionRepeated: false });
    }
  }

  async publish(context, proposalId, observed) {
    const before = await this.store.transaction(context, async tx => this.requireProposal(tx, proposalId));
    if (mutation(before.capabilityId)) {
      await this.adapter.verifyMaterialized({ binding: binding(context, before.environmentId), reference: observed.reference });
      assert(observed.beforeSha256 === before.beforeReference.workspaceSha256
        && observed.afterSha256 === observed.reference.workspaceSha256, "m1-executor-evidence-mismatch");
    }
    return this.store.transaction(context, async tx => {
      const proposal = await this.requireProposal(tx, proposalId);
      if (proposal.status === "completed") return this.result(tx, proposal, true);
      const intent = await tx.get("intent", proposalId);
      assert(intent && intent.proposalDigest === proposal.proposalDigest, "m1-effect-intent-invalid");
      const isMutation = mutation(proposal.capabilityId);
      // Publishing a revision is a new effect and must still be authorized. Recording the actual result
      // of an already-dispatched bounded test is not a new effect; cancellation cannot erase its evidence.
      const dispatch = intent.dispatchAuthority;
      assert(dispatch && intent.dispatchAuthorityDigest === digest(dispatch)
        && dispatch.proposalDigest === proposal.proposalDigest
        && dispatch.participantId === context.principalId && dispatch.projectId === context.projectId
        && dispatch.sessionId === proposal.sessionId
        && dispatch.grant.definitionDigest === proposal.grantDefinitionDigest
        && dispatch.grant.definitionDigest === grantDefinitionDigest(dispatch.grant)
        && dispatch.projectRevision === proposal.expectedProjectRevision
        && digest(dispatch.reference) === digest(proposal.beforeReference), "m1-dispatch-proof-invalid");
      const currentProject = await tx.project();
      const currentTask = await this.requireTask(tx, proposal.taskId);
      const currentGrant = await tx.get("grant", proposal.grantId);
      if (isMutation) await this.checkContext(context);
      const liveAuthority = isMutation ? await this.authority(tx, context, proposal, { proposal, requireApproval: true }) : null;
      const project = isMutation ? liveAuthority.project : { ...currentProject,
        revision: dispatch.projectRevision, reference: dispatch.reference };
      const grant = isMutation ? liveAuthority.grant : dispatch.grant;
      // The immutable source is checked again under the publication lock. A drifted old revision is
      // not legitimized merely because a new revision's bytes happen to be valid.
      await this.adapter.verifyMaterialized({ binding: binding(context, project.environmentId), reference: project.reference });
      if (isMutation) await this.adapter.verifyMaterialized({
        binding: binding(context, project.environmentId), reference: observed.reference });
      const afterReference = isMutation ? observed.reference : project.reference;
      const afterRevision = project.revision + (isMutation ? 1 : 0);
      const isTest = proposal.capabilityId === "project.run-tests";
      if (isTest) assert(observed.suiteId === proposal.arguments.suiteId
        && observed.workspaceSha256 === project.reference.workspaceSha256
        && typeof proposal.prepared.preview.suiteSha256 === "string"
        && observed.suiteSha256 === proposal.prepared.preview.suiteSha256
        && ["passed", "failed", "unavailable"].includes(observed.status)
        && (observed.status === "unavailable" || !!observed.executionReceipt), "m1-executor-evidence-mismatch");
      const receipt = { schemaVersion: "runa-m1-task-receipt/v1", receiptId: makeId("receipt"),
        effectId: intent.effectId, proposalId, proposalDigest: proposal.proposalDigest, taskId: proposal.taskId,
        participantId: context.principalId, projectId: context.projectId, environmentId: project.environmentId,
        sessionId: context.sessionId, grantId: grant.grantId, grantRevision: grant.revision,
        capabilitySetVersion: CAPABILITY_SET_VERSION, capabilitySetDigest: CAPABILITY_SET_DIGEST,
        capabilityId: proposal.capabilityId, argumentsDigest: proposal.argumentsDigest,
        policy: proposal.policy, approval: proposal.approval ?? null,
        beforeRevision: project.revision, afterRevision, beforeReference: project.reference, afterReference,
        beforeSha256: project.reference.workspaceSha256, afterSha256: afterReference.workspaceSha256,
        effectKind: isMutation ? "revision-published" : isTest ? "sandbox-tested" : "observed",
        executionStatus: isTest ? (observed.executionReceipt?.status === "executed" ? "ran"
          : observed.executionReceipt?.status ?? "not-run") : isMutation ? "published" : "observed",
        output: isTest ? observed : observed.output,
        cancellationRequested: currentTask.status === "cancelled",
        grantRevokedAfterDispatch: currentGrant?.status !== "active" || currentGrant?.revision !== proposal.grantRevision,
        currentAtRecording: currentProject.revision === project.revision
          && digest(currentProject.reference) === digest(project.reference),
        rollbackReference: isMutation ? project.reference : null, recordedAt: this.timestamp() };
      receipt.receiptDigest = receiptDigest(receipt);
      if (isMutation) {
        project.reference = afterReference; project.revision = afterRevision; project.updatedAt = this.timestamp();
        await tx.saveProject(project);
      }
      await tx.save("receipt", receipt.receiptId, receipt, { insertOnly: true, requestKey: requestKey("receipt", proposalId) });
      proposal.status = "completed"; proposal.receiptId = receipt.receiptId; proposal.updatedAt = this.timestamp();
      await tx.save("proposal", proposalId, proposal);
      intent.status = "recorded"; intent.receiptId = receipt.receiptId; intent.updatedAt = this.timestamp();
      await tx.save("intent", proposalId, intent);
      await tx.outbox(receipt);
      await tx.audit("effect-recorded", intent.effectId, { receiptDigest: receipt.receiptDigest });
      await this.hooks.beforeCommit?.({ proposal: clone(proposal), receipt: clone(receipt) });
      return { proposal, receipt, replayed: false };
    });
  }

  async checkActive(context, proposal) {
    await this.checkContext(context);
    return this.store.transaction(context, async tx => {
      const current = await this.requireProposal(tx, proposal.proposalId);
      return this.authority(tx, context, current, { proposal: current, requireApproval: true });
    });
  }

  async cancel(rawContext, rawInput) {
    const context = parseContext(rawContext), { taskId } = parseTaskId(rawInput);
    const result = await this.store.transaction(context, async tx => {
      const task = await this.requireTask(tx, taskId);
      task.status = "cancelled"; task.updatedAt = this.timestamp();
      await tx.save("task", taskId, task);
      for (const grant of await tx.list("grant", taskId)) if (grant.status === "active") {
        grant.status = "revoked"; grant.revision += 1; grant.updatedAt = this.timestamp();
        grant.definitionDigest = grantDefinitionDigest(grant);
        await tx.save("grant", grant.grantId, grant);
      }
      for (const proposal of await tx.list("proposal", taskId)) if (["pending-approval", "authorized"].includes(proposal.status)) {
        const intent = await tx.get("intent", proposal.proposalId);
        // An intent is reconciled separately, rather than asserting that a possibly running effect did not happen.
        proposal.status = intent ? "unknown" : "cancelled"; proposal.updatedAt = this.timestamp();
        await tx.save("proposal", proposal.proposalId, proposal);
      }
      await tx.audit("task-cancelled", taskId);
      return task;
    });
    for (const running of this.running.values()) if (running.taskId === taskId) running.controller.abort();
    return result;
  }

  async revokeGrant(rawContext, rawInput) {
    const context = parseContext(rawContext), { grantId } = parseGrantId(rawInput);
    const result = await this.store.transaction(context, async tx => {
      const grant = await tx.get("grant", grantId);
      assert(grant, "m1-grant-not-found");
      if (grant.status !== "revoked") { grant.status = "revoked"; grant.revision += 1; grant.updatedAt = this.timestamp(); }
      grant.definitionDigest = grantDefinitionDigest(grant);
      await tx.save("grant", grantId, grant);
      await tx.audit("grant-revoked", grantId);
      return grant;
    });
    for (const running of this.running.values()) if (running.grantId === grantId) running.controller.abort();
    return result;
  }

  async status(rawContext, rawInput) {
    const context = parseContext(rawContext), { taskId } = parseTaskId(rawInput);
    // Internal recovery must still observe already-recorded state after logout.
    // The HTTP surface authenticates reads; only live authority can offer approval.
    let online = false;
    try { await this.checkContext(context); online = true; }
    catch (error) { if (error.code !== "m1-session-authority-unavailable") throw error; }
    return this.store.transaction(context, async tx => {
      const task = await this.requireTask(tx, taskId), project = await tx.project();
      const proposals = await tx.list("proposal", taskId);
      for (const proposal of proposals) this.verifyProposal(proposal);
      const receipts = await tx.list("receipt", taskId);
      for (const receipt of receipts) this.verifyReceipt(receipt);
      proposals.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.proposalId.localeCompare(b.proposalId));
      receipts.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.receiptId.localeCompare(b.receiptId));
      const pendingReconciliation = (await tx.list("intent", taskId)).filter(intent => !["recorded", "not-published"].includes(intent.status));
      const approvableProposalIds = [];
      // Presentation guidance only, recomputed from the current online session.
      // Reloading a page does not cancel an existing grant, and logging in again
      // does not inherit it. approve/execute still independently recheck authority.
      if (online && task.status === "active" && !pendingReconciliation.length) for (const proposal of proposals) {
        if (proposal.status !== "pending-approval") continue;
        try {
          await this.authority(tx, context, { taskId, grantId: proposal.grantId,
            grantRevision: proposal.grantRevision, capabilityId: proposal.capabilityId }, { proposal });
          approvableProposalIds.push(proposal.proposalId);
        } catch (error) { if (!error.code?.startsWith("m1-")) throw error; }
      }
      return { task, project, grants: await tx.list("grant", taskId), proposals, receipts,
        pendingReconciliation, approvableProposalIds,
        currentReceiptIds: receipts.filter(receipt => receipt.afterRevision === project.revision
          && digest(receipt.afterReference) === digest(project.reference)).map(receipt => receipt.receiptId) };
    });
  }

  async listTasks(rawContext) {
    const context = parseContext(rawContext);
    return this.store.transaction(context, async tx => ({ tasks: (await tx.recent("task")).map(task => ({
      taskId: task.taskId, objective: task.objective, status: task.status, createdAt: task.createdAt,
      updatedAt: task.updatedAt, environmentId: task.environmentId,
    })) }));
  }

  async restore(context, input) {
    // Restore remains a normal proposed, exact-hash operation under the selected profile.
    return this.propose(context, { ...input, capabilityId: "project.restore" });
  }

  async authority(tx, context, input, { proposal = null, requireApproval = false } = {}) {
    const task = await this.requireTask(tx, input.taskId, true), project = await tx.project();
    const grant = await tx.get("grant", input.grantId);
    assert(grant && grant.taskId === task.taskId && grant.participantId === context.principalId
      && grant.projectId === context.projectId && grant.environmentId === task.environmentId,
    "m1-grant-scope-mismatch");
    assert(grant.definitionDigest === grantDefinitionDigest(grant), "m1-grant-integrity-failed");
    assert(grant.status === "active", "m1-grant-revoked");
    assert(grant.sessionId === context.sessionId, "m1-grant-session-mismatch");
    assert(grant.revision === input.grantRevision, "m1-stale-grant");
    assert(grant.taskBindingDigest === digest(taskIdentity(task)), "m1-task-binding-mismatch");
    assert(new Date(grant.expiresAt).valueOf() > this.now().valueOf(), "m1-grant-expired");
    const policy = evaluatePolicy(grant, input.capabilityId);
    if (proposal) {
      this.verifyProposal(proposal);
      assert(proposal.grantDefinitionDigest === grant.definitionDigest, "m1-stale-grant");
      assert(proposal.sessionId === context.sessionId, "m1-grant-session-mismatch");
      assert(project.revision === proposal.expectedProjectRevision
        && digest(project.reference) === digest(proposal.beforeReference), "m1-stale-project");
      enforceArguments(grant, proposal.capabilityId, proposal.arguments, proposal.restorePaths);
      assert(policy !== "denied", "m1-capability-denied");
      if (requireApproval && policy === "approval-required") {
        assert(proposal.approval?.proposalDigest === proposal.proposalDigest
          && proposal.approval?.principalId === context.principalId
          && proposal.approval?.sessionId === context.sessionId
          && proposal.approval?.grantRevision === grant.revision, "m1-approval-required");
      }
    }
    return { task, project, grant };
  }

  async resolveArguments(tx, input, grant, project) {
    if (input.capabilityId !== "project.restore") {
      enforceArguments(grant, input.capabilityId, input.arguments);
      return { arguments: input.arguments, restorePaths: [] };
    }
    const receipt = await tx.get("receipt", input.arguments.receiptId);
    assert(receipt && receipt.taskId === input.taskId && receipt.environmentId === project.environmentId
      && mutation(receipt.capabilityId) && receipt.rollbackReference, "m1-restore-not-owned");
    this.verifyReceipt(receipt);
    assert(receipt.afterRevision === project.revision
      && digest(receipt.afterReference) === digest(project.reference), "m1-restore-stale");
    const restorePaths = changedPaths(project.reference, receipt.rollbackReference);
    // A no-op owned edit is still scoped to its original path and can be restored truthfully as a no-op.
    if (!restorePaths.length) {
      const original = await this.requireProposal(tx, receipt.proposalId);
      if (original.arguments.path) restorePaths.push(original.arguments.path);
    }
    enforceArguments(grant, input.capabilityId, input.arguments, restorePaths);
    return { arguments: { targetReference: receipt.rollbackReference }, restorePaths };
  }

  async requireTask(tx, taskId, active = false) {
    const task = await tx.get("task", taskId);
    assert(task, "m1-task-not-found");
    if (active) assert(task.status === "active", "m1-task-not-active");
    return task;
  }
  async requireProposal(tx, proposalId) {
    const proposal = await tx.get("proposal", proposalId);
    assert(proposal, "m1-proposal-not-found");
    this.verifyProposal(proposal);
    return proposal;
  }
  verifyProposal(proposal) {
    assert(proposal.proposalDigest === proposalDigest(proposal)
      && proposal.argumentsDigest === digest(proposal.arguments), "m1-proposal-integrity-failed");
  }
  verifyReceipt(receipt) { assert(receipt.receiptDigest === receiptDigest(receipt), "m1-receipt-integrity-failed"); }
  async result(tx, proposal, replayed) {
    const receipt = proposal.receiptId ? await tx.get("receipt", proposal.receiptId) : null;
    if (receipt) {
      this.verifyReceipt(receipt);
      assert(receipt.proposalId === proposal.proposalId && receipt.proposalDigest === proposal.proposalDigest,
        "m1-receipt-binding-mismatch");
    }
    return { proposal, receipt, replayed };
  }
  async proposalState(context, proposalId, extra = {}) {
    return this.store.transaction(context, async tx => ({ ...await this.result(tx,
      await this.requireProposal(tx, proposalId), false), ...extra }));
  }
  async markUncertain(context, proposalId, error) {
    await this.store.transaction(context, async tx => {
      const proposal = await this.requireProposal(tx, proposalId);
      if (proposal.status === "completed") return;
      const intent = await tx.get("intent", proposalId);
      if (!intent) return;
      const code = safeError(error).code;
      proposal.status = "unknown"; proposal.errorCode = code; proposal.updatedAt = this.timestamp();
      intent.status = "unknown"; intent.updatedAt = this.timestamp();
      await tx.save("proposal", proposalId, proposal);
      await tx.save("intent", proposalId, intent);
      await tx.audit("effect-requires-reconciliation", intent.effectId, { code });
    }).catch(() => {}); // The committed dispatch intent is enough to fail closed when DB itself is unavailable.
  }
}

function taskIdentity(task) {
  return { taskId: task.taskId, participantId: task.participantId, projectId: task.projectId,
    environmentId: task.environmentId, objectiveDigest: digest(task.objective) };
}
function changedPaths(before, after) {
  const left = new Map(before.files.map(file => [file.path, file.sha256]));
  const right = new Map(after.files.map(file => [file.path, file.sha256]));
  return [...new Set([...left.keys(), ...right.keys()])].filter(path => left.get(path) !== right.get(path)).sort();
}
function safeError(error) {
  return error?.code && /^m1-[a-z0-9-]+$/.test(error.code) ? failure(error.code) : failure("m1-executor-or-storage-failed");
}
