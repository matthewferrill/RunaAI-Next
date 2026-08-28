import { z } from "zod";
import { CAPABILITIES, assert, binding, digest, failure, makeId, parseContext, parseId,
  parseProposal, requestKey } from "./contracts.mjs";

const startSchema = z.object({ taskId: z.string(), grantId: z.string(), grantRevision: z.number().int().positive(),
  requestId: z.string() }).strict();
const resumeSchema = z.object({ runId: z.string(), grantId: z.string().optional(),
  grantRevision: z.number().int().positive().optional() }).strict()
  .refine(value => (value.grantId === undefined) === (value.grantRevision === undefined));
const planSchema = z.object({ summary: z.string().max(1500), steps: z.array(z.object({
  capabilityId: z.enum(Object.keys(CAPABILITIES)), arguments: z.unknown(),
}).strict()).min(1).max(6) }).strict();
const finished = new Set(["completed", "cancelled", "failed", "budget-exhausted"]);
const DEFAULT_BUDGETS = Object.freeze({ maxPlans: 2, maxActions: 12, planningTimeoutMs: 120_000,
  maximumActiveMs: 300_000, maximumAgeMs: 3_600_000 });

/** Bounded application loop. The injected planner returns data, never executable authority. */
export class M1TaskOrchestrator {
  constructor({ service, planner, workflow, budgets = {}, now = () => Date.now() }) {
    assert(typeof planner?.plan === "function" && typeof workflow?.run === "function", "m1-orchestrator-dependency-invalid");
    this.service = service; this.store = service.store; this.planner = planner; this.workflow = workflow; this.now = now;
    this.plannerRole = planner.role ?? "agent";
    assert(["code", "agent"].includes(this.plannerRole), "m1-planner-role-invalid");
    this.budgets = { ...DEFAULT_BUDGETS, ...budgets };
    for (const [key, limit] of Object.entries(DEFAULT_BUDGETS)) assert(Number.isInteger(this.budgets[key])
      && this.budgets[key] > 0 && this.budgets[key] <= limit, "m1-orchestrator-budget-invalid");
  }

  async start(rawContext, rawInput) {
    const context = parseContext(rawContext), input = parse(startSchema, rawInput);
    parseId(input.taskId); parseId(input.grantId); parseId(input.requestId);
    const run = await this.store.transaction(context, async tx => {
      const key = requestKey(input.taskId, input.requestId), requestDigest = digest({ ...input, plannerRole: this.plannerRole });
      const prior = await tx.byRequest("run", key);
      if (prior) { assert(prior.requestDigest === requestDigest, "m1-request-id-conflict"); return prior; }
      const { task, grant } = await this.service.authority(tx, context, { ...input, capabilityId: "project.inspect" });
      const run = { schemaVersion: "runa-m1-conversational-run/v1", runId: makeId("run"), ...input,
        plannerRole: this.plannerRole,
        participantId: context.principalId, projectId: context.projectId, sessionId: context.sessionId,
        requestDigest, grantDefinitionDigest: grant.definitionDigest, objective: task.objective,
        status: "ready-to-plan", planAttempts: 0, plans: [], activePlan: 0, nextStep: 0,
        actions: [], pendingProposalId: null, outcome: null, errorCode: null, consumedMs: 0,
        budgets: { ...this.budgets }, createdAtMs: this.now(), updatedAtMs: this.now() };
      await tx.save("run", run.runId, run, { insertOnly: true, requestKey: key });
      await tx.audit("conversational-run-created", run.runId, { requestDigest });
      return run;
    });
    return this.resume(context, { runId: run.runId });
  }

  async status(rawContext, rawInput) {
    const context = parseContext(rawContext), { runId } = parse(resumeSchema, rawInput);
    parseId(runId);
    const run = await this.load(context, runId);
    const task = await this.service.status(context, { taskId: run.taskId });
    return { run, task: task.task, project: task.project, proposals: task.proposals, receipts: task.receipts,
      pendingProposal: task.proposals.find(value => value.proposalId === run.pendingProposalId) ?? null,
      pendingReconciliation: task.pendingReconciliation };
  }

  async list(rawContext) {
    const context = parseContext(rawContext);
    return this.store.transaction(context, async tx => ({ runs: (await tx.recent("run")).map(run => ({
      runId: run.runId, taskId: run.taskId, objective: run.objective, status: run.status,
      plannerRole: run.plannerRole ?? "agent",
      pendingProposalId: run.pendingProposalId, updatedAtMs: run.updatedAtMs, planAttempts: run.planAttempts,
      actionCount: run.actions.length, sessionRebindRequired: run.sessionId !== context.sessionId,
    })) }));
  }

  async resume(rawContext, rawInput) {
    const context = parseContext(rawContext), { runId, grantId, grantRevision } = parse(resumeSchema, rawInput);
    parseId(runId);
    const retained = await this.load(context, runId);
    assert((retained.plannerRole ?? "agent") === this.plannerRole, "m1-planner-role-mismatch");
    return this.store.operation(`orchestrator:${runId}`, async () => {
      const activeStarted = this.now();
      try {
        if (grantId !== undefined) {
          const rebound = await this.rebind(context, runId, { grantId, grantRevision });
          if (!rebound) return this.status(context, { runId });
        }
        for (;;) {
          let run = await this.load(context, runId);
          if (finished.has(run.status)) return this.status(context, { runId });
          const taskState = await this.service.status(context, { taskId: run.taskId });
          if (taskState.task.status !== "active") {
            await this.update(context, runId, state => { state.status = "cancelled"; state.outcome = "cancelled"; });
            return this.status(context, { runId });
          }
          assert(context.sessionId === run.sessionId, "m1-grant-session-mismatch");
          const elapsed = run.consumedMs + this.now() - activeStarted;
          const unfinishedActions = ["ready-to-plan", "planning", "repair-required"].includes(run.status)
            || run.pendingProposalId !== null || run.nextStep < (run.plans[run.activePlan]?.steps.length ?? 0);
          if (elapsed >= run.budgets.maximumActiveMs || this.now() - run.createdAtMs >= run.budgets.maximumAgeMs
            || (run.actions.length >= run.budgets.maxActions && unfinishedActions)) {
            await this.update(context, runId, state => { state.status = "budget-exhausted"; state.errorCode = "m1-orchestration-budget-exhausted"; });
            return this.status(context, { runId });
          }
          if (run.status === "needs-reconciliation") {
            const result = await this.service.reconcile(context, { proposalId: run.pendingProposalId });
            if (!result.receipt) return this.status(context, { runId });
            await this.consume(context, runId, result);
            continue;
          }
          if (["ready-to-plan", "planning", "repair-required"].includes(run.status)) {
            if (run.planAttempts >= run.budgets.maxPlans) {
              await this.update(context, runId, state => { state.status = "failed"; state.errorCode = "m1-plan-budget-exhausted"; });
              return this.status(context, { runId });
            }
            const planned = await this.makePlan(context, run, taskState, activeStarted);
            if (!planned) return this.status(context, { runId });
            continue;
          }
          const currentPlan = run.plans[run.activePlan];
          assert(currentPlan, "m1-plan-missing");
          if (run.nextStep >= currentPlan.steps.length) {
            await this.update(context, runId, state => {
              state.status = "completed";
              // This is verified completion of the accepted plan, not a model's assertion about arbitrary goals.
              state.outcome = "plan-completed";
            });
            return this.status(context, { runId });
          }
          let proposal;
          if (run.pendingProposalId) {
            proposal = await this.service.revalidatePending(context, { proposalId: run.pendingProposalId });
          } else {
            const step = currentPlan.steps[run.nextStep];
            proposal = await this.service.propose(context, { taskId: run.taskId, grantId: run.grantId,
              grantRevision: run.grantRevision, requestId: step.requestId,
              capabilityId: step.capabilityId, arguments: step.arguments });
            await this.update(context, runId, state => { state.pendingProposalId = proposal.proposalId; });
          }
          if (proposal.status === "pending-approval") {
            await this.update(context, runId, state => { state.status = "waiting-approval"; });
            return this.status(context, { runId });
          }
          if (["denied", "stale", "cancelled", "failed", "not-published"].includes(proposal.status)) {
            await this.update(context, runId, state => { state.status = "failed";
              state.errorCode = proposal.errorCode ?? "m1-capability-denied"; });
            return this.status(context, { runId });
          }
          await this.update(context, runId, state => { state.status = "running"; });
          const result = await this.workflow.run(context, { proposalId: proposal.proposalId }, { resume: true });
          if (!result.receipt) {
            await this.update(context, runId, state => {
              state.status = ["unknown", "dispatched"].includes(result.proposal.status) ? "needs-reconciliation" : "failed";
              state.errorCode = result.proposal.errorCode ?? "m1-action-incomplete";
            });
            return this.status(context, { runId });
          }
          await this.consume(context, runId, result);
        }
      } catch (error) {
        const run = await this.load(context, runId);
        const taskState = await this.service.status(context, { taskId: run.taskId });
        const pending = run.pendingProposalId ? taskState.proposals.find(value => value.proposalId === run.pendingProposalId) : null;
        await this.update(context, runId, state => {
          if (pending?.status === "completed" || ["unknown", "dispatched"].includes(pending?.status)) state.status = "needs-reconciliation";
          else state.status = taskState.task.status !== "active" ? "cancelled" : "failed";
          state.errorCode = safeCode(error);
        });
        return this.status(context, { runId });
      } finally {
        await this.update(context, runId, state => { state.consumedMs += Math.max(0, this.now() - activeStarted); }).catch(() => {});
      }
    });
  }

  async rebind(context, runId, { grantId, grantRevision }) {
    parseId(grantId);
    let run = await this.load(context, runId);
    if (finished.has(run.status)) return true;
    // A new session/grant cannot adopt an uncertain old action. First observe every outstanding intent.
    const state = await this.service.status(context, { taskId: run.taskId });
    if (run.pendingProposalId && state.proposals.some(proposal => proposal.proposalId === run.pendingProposalId && proposal.status === "completed")) {
      await this.consume(context, runId, await this.service.proposalState(context, run.pendingProposalId));
      run = await this.load(context, runId);
    }
    for (const intent of state.pendingReconciliation) {
      let result;
      try { result = await this.service.reconcile(context, { proposalId: intent.proposalId }); }
      catch (error) {
        if (error?.code !== "m1-operation-in-progress") throw error;
      }
      if (!result || ["unknown", "dispatched"].includes(result.proposal.status)) {
        await this.update(context, runId, value => { value.status = "needs-reconciliation";
          value.pendingProposalId = intent.proposalId; value.errorCode = "m1-rebind-awaits-reconciliation"; });
        return false;
      }
    }
    await this.store.transaction(context, async tx => {
      run = await tx.get("run", runId);
      const { grant } = await this.service.authority(tx, context, { taskId: run.taskId, grantId,
        grantRevision, capabilityId: "project.inspect" });
      if (run.grantId === grantId && run.grantRevision === grantRevision && run.sessionId === context.sessionId) return;
      assert(grant.grantId !== run.grantId, "m1-replacement-grant-required");
      const oldGrant = await tx.get("grant", run.grantId);
      assert(oldGrant?.status === "revoked", "m1-prior-grant-still-active");
      for (const proposal of await tx.list("proposal", run.taskId)) {
        if (proposal.grantId !== run.grantId || !["pending-approval", "authorized"].includes(proposal.status)) continue;
        assert(!await tx.get("intent", proposal.proposalId), "m1-rebind-awaits-reconciliation");
        proposal.status = "cancelled"; proposal.errorCode = "m1-grant-replaced"; proposal.updatedAt = this.service.timestamp();
        await tx.save("proposal", proposal.proposalId, proposal);
      }
      (run.authorityChanges ??= []).push({ priorGrantId: run.grantId, newGrantId: grant.grantId,
        priorSessionId: run.sessionId, newSessionId: context.sessionId, changedAtMs: this.now() });
      run.grantId = grant.grantId; run.grantRevision = grant.revision; run.grantDefinitionDigest = grant.definitionDigest;
      run.sessionId = context.sessionId; run.pendingProposalId = null; run.status = "ready-to-plan";
      run.errorCode = null; run.updatedAtMs = this.now();
      // Old plans/approvals remain historical. A fresh plan under the replacement grant is mandatory.
      await tx.save("run", runId, run);
      await tx.audit("conversational-grant-replaced", runId, { grantId, grantRevision });
    });
    return true;
  }

  async makePlan(context, run, taskState, activeStarted) {
    await this.store.transaction(context, tx => this.service.authority(tx, context, { taskId: run.taskId,
      grantId: run.grantId, grantRevision: run.grantRevision, capabilityId: "project.inspect" }));
    const grant = taskState.grants.find(value => value.grantId === run.grantId);
    assert(grant?.definitionDigest === run.grantDefinitionDigest, "m1-stale-grant");
    const snapshot = await this.service.adapter.inspectRevision({ binding: binding(context, taskState.project.environmentId),
      reference: taskState.project.reference });
    const permittedStep = step => (!step.arguments?.path || grant.allowedPaths.includes(step.arguments.path))
      && (!step.arguments?.suiteId || grant.allowedSuites.includes(step.arguments.suiteId));
    const permittedProposalIds = new Set(taskState.proposals.filter(permittedStep).map(proposal => proposal.proposalId));
    const plannerSnapshot = { workspaceSha256: snapshot.workspaceSha256, projectRevision: taskState.project.revision,
      files: snapshot.files.filter(file => grant.allowedPaths.includes(file.path)),
      omittedFileCount: snapshot.files.filter(file => !grant.allowedPaths.includes(file.path)).length };
    await this.update(context, run.runId, state => { state.status = "planning"; state.planAttempts++; });
    const timeout = Math.min(run.budgets.planningTimeoutMs,
      run.budgets.maximumActiveMs - run.consumedMs - (this.now() - activeStarted));
    assert(timeout > 0, "m1-orchestration-budget-exhausted");
    const controller = new AbortController();
    let timer, poll;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(failure("m1-planning-deadline")); }, timeout);
      });
      // Cancellation/revocation during a slow provider call aborts the advisory call; result remains data.
      poll = setInterval(() => {
        this.store.transaction(context, tx => this.service.authority(tx, context, { taskId: run.taskId,
          grantId: run.grantId, grantRevision: run.grantRevision, capabilityId: "project.inspect" }))
          .catch(() => controller.abort());
      }, 250);
      poll.unref?.();
      const rawPlan = await Promise.race([this.planner.plan({ objective: run.objective,
        snapshot: structuredClone(plannerSnapshot),
        receipts: structuredClone(taskState.receipts.filter(receipt => permittedProposalIds.has(receipt.proposalId))
          .map(({ beforeReference, afterReference, rollbackReference, ...receipt }) => receipt)),
        previousPlans: structuredClone(run.plans.filter(plan => plan.steps.every(permittedStep))), repair: run.status === "repair-required",
        allowedPaths: [...grant.allowedPaths], allowedSuites: [...grant.allowedSuites],
        capabilityIds: grant.capabilityIds.filter(id => grant.profile !== "read-only" || !CAPABILITIES[id].effectful),
        signal: controller.signal }), timeoutPromise]);
      assert(!controller.signal.aborted, "m1-planning-cancelled");
      const plan = parse(planSchema, rawPlan);
      const planNumber = run.plans.length;
      const steps = plan.steps.map((step, index) => {
        const requestId = `step-${digest({ runId: run.runId, planNumber, index }).slice(0, 48)}`;
        const parsed = parseProposal({ taskId: run.taskId, grantId: run.grantId, grantRevision: run.grantRevision,
          requestId, capabilityId: step.capabilityId, arguments: step.arguments });
        assert(grant.capabilityIds.includes(parsed.capabilityId), "m1-capability-denied");
        return { requestId, capabilityId: parsed.capabilityId, arguments: parsed.arguments };
      });
      await this.store.transaction(context, async tx => {
        await this.service.authority(tx, context, { taskId: run.taskId, grantId: run.grantId,
          grantRevision: run.grantRevision, capabilityId: "project.inspect" });
        const current = await tx.get("run", run.runId);
        current.plans.push({ summary: plan.summary, steps, planDigest: digest({ summary: plan.summary, steps }),
          sourceProjectRevision: taskState.project.revision, sourceWorkspaceSha256: snapshot.workspaceSha256 });
        current.activePlan = current.plans.length - 1; current.nextStep = 0; current.pendingProposalId = null;
        current.status = "running"; current.updatedAtMs = this.now();
        await tx.save("run", current.runId, current);
        await tx.audit("conversational-plan-recorded", current.runId, { planDigest: current.plans.at(-1).planDigest });
      });
      return true;
    } finally { clearTimeout(timer); clearInterval(poll); }
  }

  async consume(context, runId, result) {
    assert(result.receipt, "m1-action-incomplete");
    this.service.verifyReceipt(result.receipt);
    await this.update(context, runId, run => {
      assert(result.receipt.proposalId === run.pendingProposalId && result.receipt.taskId === run.taskId,
        "m1-receipt-binding-mismatch");
      if (!run.actions.some(action => action.receiptId === result.receipt.receiptId)) run.actions.push({
        proposalId: result.proposal.proposalId, receiptId: result.receipt.receiptId,
        receiptDigest: result.receipt.receiptDigest, capabilityId: result.receipt.capabilityId,
        executionStatus: result.receipt.executionStatus, planIndex: run.activePlan, stepIndex: run.nextStep });
      run.pendingProposalId = null; run.nextStep++; run.status = "running"; run.errorCode = null;
      if (result.receipt.cancellationRequested) { run.status = "cancelled"; run.outcome = "cancelled"; }
      else if (result.receipt.capabilityId === "project.run-tests" && !result.receipt.output.passed) {
        run.status = result.receipt.executionStatus === "ran" && run.planAttempts < run.budgets.maxPlans ? "repair-required" : "failed";
        run.errorCode = result.receipt.executionStatus === "ran" ? "m1-tests-failed" : "m1-execution-unavailable";
      }
    });
  }

  async load(context, runId) {
    return this.store.transaction(context, async tx => {
      const run = await tx.get("run", runId);
      assert(run, "m1-run-not-found");
      for (const plan of run.plans) assert(plan.planDigest === digest({ summary: plan.summary, steps: plan.steps }), "m1-plan-integrity-failed");
      return run;
    });
  }
  async update(context, runId, mutate) {
    return this.store.transaction(context, async tx => {
      const run = await tx.get("run", runId); assert(run, "m1-run-not-found");
      mutate(run); run.updatedAtMs = this.now();
      await tx.save("run", runId, run);
      return run;
    });
  }
}

function parse(schema, value) { const parsed = schema.safeParse(value); assert(parsed.success, "m1-invalid-plan"); return parsed.data; }
function safeCode(error) { return /^m1-[a-z0-9-]+$/.test(error?.code ?? "") ? error.code : "m1-orchestration-failed"; }
