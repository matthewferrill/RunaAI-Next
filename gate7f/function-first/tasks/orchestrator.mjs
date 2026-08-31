import { z } from "zod";
import { CAPABILITIES, assert, binding, digest, failure, makeId, parseContext, parseId,
  parseProposal, requestKey } from "./contracts.mjs";

const startSchema = z.object({ taskId: z.string(), grantId: z.string(), grantRevision: z.number().int().positive(),
  requestId: z.string() }).strict();
const resumeSchema = z.object({ runId: z.string(), grantId: z.string().optional(),
  grantRevision: z.number().int().positive().optional() }).strict()
  .refine(value => (value.grantId === undefined) === (value.grantRevision === undefined));
const planStepSchema = z.object({ capabilityId: z.enum(Object.keys(CAPABILITIES)), arguments: z.unknown() }).strict();
const planCoreSchema = z.object({ summary: z.string().max(1500), steps: z.array(planStepSchema).min(1).max(6) }).strict();
const protocolRecordSchema = z.object({ schemaVersion: z.literal("runaai-m1-plan-protocol-record/v1"),
  protocol: z.object({ schemaVersion: z.literal("runaai-m1-plan-protocol/v1"),
    workIntent: z.enum(["analysis-only", "preview-only", "effect-requested"]),
    previewApplyPairing: z.string(), correctionLimit: z.literal(1), correctionAuthority: z.string() }).strict(),
  modelId: z.string().min(1), role: z.enum(["code", "agent"]),
  settings: z.object({ temperature: z.literal(0), maximumOutputTokens: z.number().int().positive().max(1536) }).strict(),
  providerAttemptCount: z.number().int().min(1).max(2), correctionCount: z.number().int().min(0).max(1),
  groundingReview: z.object({ schemaVersion: z.literal("runaai-m1-read-only-grounding-review-record/v1"),
    performed: z.literal(true), modelId: z.string().min(1), originalPlanDigest: z.string().regex(/^[a-f0-9]{64}$/),
    finalPlanDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  attempts: z.array(z.object({ plan: planCoreSchema, planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    violations: z.array(z.string()).max(4) }).strict()).min(1).max(2),
}).strict().refine(value => value.providerAttemptCount === value.attempts.length
  && value.correctionCount === value.attempts.length - 1
  && value.attempts.every(item => item.planDigest === digest(item.plan))
  && value.attempts.at(-1).violations.length === 0
  && (!value.groundingReview || value.groundingReview.modelId === value.modelId));
const planSchema = planCoreSchema.extend({ planningProtocol: protocolRecordSchema.optional() }).strict();
const finished = new Set(["completed", "cancelled", "failed", "budget-exhausted"]);
const DEFAULT_BUDGETS = Object.freeze({ maxPlans: 2, maxActions: 12, planningTimeoutMs: 120_000,
  maximumRequestActiveMs: 300_000, maximumRunActiveMs: 300_000, maximumAgeMs: 3_600_000 });
const BUDGET_KEYS = new Set(Object.keys(DEFAULT_BUDGETS));

/** Bounded application loop. The injected planner returns data, never executable authority. */
export class M1TaskOrchestrator {
  constructor({ service, planner, workflow, budgets = {}, now = () => Date.now() }) {
    assert(typeof planner?.plan === "function" && typeof workflow?.run === "function", "m1-orchestrator-dependency-invalid");
    this.service = service; this.store = service.store; this.planner = planner; this.workflow = workflow; this.now = now;
    this.plannerRole = planner.role ?? "agent";
    assert(["code", "agent"].includes(this.plannerRole), "m1-planner-role-invalid");
    const supplied = { ...budgets };
    // Constructor compatibility is deliberately no broader than the former
    // single ceiling: a legacy value becomes both request and total run limit.
    if (Object.hasOwn(supplied, "maximumActiveMs")) {
      assert(!Object.hasOwn(supplied, "maximumRequestActiveMs") && !Object.hasOwn(supplied, "maximumRunActiveMs"),
        "m1-orchestrator-budget-invalid");
      supplied.maximumRequestActiveMs = supplied.maximumActiveMs;
      supplied.maximumRunActiveMs = supplied.maximumActiveMs;
      delete supplied.maximumActiveMs;
    }
    assert(Object.keys(supplied).every(key => BUDGET_KEYS.has(key)), "m1-orchestrator-budget-invalid");
    this.budgets = { ...DEFAULT_BUDGETS, ...supplied };
    for (const [key, limit] of Object.entries(DEFAULT_BUDGETS)) assert(Number.isInteger(this.budgets[key])
      && this.budgets[key] > 0 && this.budgets[key] <= limit, "m1-orchestrator-budget-invalid");
    assert(this.budgets.maximumRequestActiveMs <= this.budgets.maximumRunActiveMs, "m1-orchestrator-budget-invalid");
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
        status: "ready-to-plan", planAttempts: 0, protocolCorrectionCount: 0, plans: [], activePlan: 0, nextStep: 0,
        actions: [], pendingProposalId: null, outcome: null, errorCode: null, consumedMs: 0,
        activeWindow: null, recoveredActiveWindowCount: 0,
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
      pendingReconciliation: task.pendingReconciliation, runEvidence: runEvidenceProjection(run, task),
      runResult: runResultProjection(run, task),
      sessionRebindRequired: run.sessionId !== context.sessionId };
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
      const activeWindow = await this.reserveActiveWindow(context, runId);
      if (!activeWindow) return this.status(context, { runId });
      try {
        drive: {
          if (grantId !== undefined) {
            const rebound = await this.rebind(context, runId, { grantId, grantRevision });
            if (!rebound) break drive;
          }
          for (;;) {
          let run = await this.load(context, runId);
          if (finished.has(run.status)) break drive;
          const taskState = await this.service.status(context, { taskId: run.taskId });
          if (taskState.task.status !== "active") {
            await this.update(context, runId, state => { state.status = "cancelled"; state.outcome = "cancelled"; });
            break drive;
          }
          assert(context.sessionId === run.sessionId, "m1-grant-session-mismatch");
          const requestElapsed = Math.max(0, this.now() - activeWindow.startedAtMs);
          const elapsed = run.consumedMs + requestElapsed;
          const unfinishedActions = ["ready-to-plan", "planning", "repair-required"].includes(run.status)
            || run.pendingProposalId !== null || run.nextStep < (run.plans[run.activePlan]?.steps.length ?? 0);
          if (requestElapsed >= activeWindow.reservedMs || elapsed >= run.budgets.maximumRunActiveMs
            || this.now() - run.createdAtMs >= run.budgets.maximumAgeMs
            || (run.actions.length >= run.budgets.maxActions && unfinishedActions)) {
            await this.update(context, runId, state => { state.status = "budget-exhausted"; state.errorCode = "m1-orchestration-budget-exhausted"; });
            break drive;
          }
          if (run.status === "needs-reconciliation") {
            const result = await this.service.reconcile(context, { proposalId: run.pendingProposalId });
            if (!result.receipt) break drive;
            const consumed = await this.consume(context, runId, result);
            if (consumed.status === "repair-required") break drive;
            continue;
          }
          if (["ready-to-plan", "planning", "repair-required"].includes(run.status)) {
            if (run.planAttempts >= run.budgets.maxPlans) {
              await this.update(context, runId, state => { state.status = "failed"; state.errorCode = "m1-plan-budget-exhausted"; });
              break drive;
            }
            const planned = await this.makePlan(context, run, taskState, activeWindow);
            if (!planned) break drive;
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
            break drive;
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
            break drive;
          }
          if (["denied", "stale", "cancelled", "failed", "not-published"].includes(proposal.status)) {
            await this.update(context, runId, state => { state.status = "failed";
              state.errorCode = proposal.errorCode ?? "m1-capability-denied"; });
            break drive;
          }
          await this.update(context, runId, state => { state.status = "running"; });
          const result = await this.workflow.run(context, { proposalId: proposal.proposalId }, { resume: true });
          if (!result.receipt) {
            await this.update(context, runId, state => {
              state.status = ["unknown", "dispatched"].includes(result.proposal.status) ? "needs-reconciliation" : "failed";
              state.errorCode = result.proposal.errorCode ?? "m1-action-incomplete";
            });
            break drive;
          }
          const consumed = await this.consume(context, runId, result);
          // A failed test is a durable quiescent boundary. A second planner call
          // belongs only to a later explicit run.resume request.
          if (consumed.status === "repair-required") break drive;
          }
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
      } finally {
        await this.settleActiveWindow(context, runId, activeWindow);
      }
      return this.status(context, { runId });
    });
  }

  async reserveActiveWindow(context, runId) {
    const windowId = makeId("window"), startedAtMs = this.now();
    const run = await this.update(context, runId, state => {
      upgradeRunBudgets(state);
      if (state.activeWindow !== null && state.activeWindow !== undefined) {
        assertActiveWindow(state.activeWindow);
        state.consumedMs += state.activeWindow.reservedMs;
        state.recoveredActiveWindowCount = (state.recoveredActiveWindowCount ?? 0) + 1;
        state.activeWindow = null;
      }
      if (finished.has(state.status)) return;
      const remaining = state.budgets.maximumRunActiveMs - state.consumedMs;
      if (remaining <= 0) {
        state.status = "budget-exhausted"; state.errorCode = "m1-orchestration-budget-exhausted"; return;
      }
      state.activeWindow = { windowId, startedAtMs,
        reservedMs: Math.min(state.budgets.maximumRequestActiveMs, remaining) };
    });
    return run.activeWindow?.windowId === windowId ? structuredClone(run.activeWindow) : null;
  }

  async settleActiveWindow(context, runId, activeWindow) {
    await this.update(context, runId, state => {
      assertActiveWindow(state.activeWindow);
      assert(state.activeWindow.windowId === activeWindow.windowId
        && state.activeWindow.startedAtMs === activeWindow.startedAtMs
        && state.activeWindow.reservedMs === activeWindow.reservedMs, "m1-active-window-mismatch");
      const elapsed = Math.max(0, this.now() - activeWindow.startedAtMs);
      state.consumedMs += Math.min(activeWindow.reservedMs, elapsed);
      state.activeWindow = null;
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

  async makePlan(context, run, taskState, activeWindow) {
    await this.store.transaction(context, tx => this.service.authority(tx, context, { taskId: run.taskId,
      grantId: run.grantId, grantRevision: run.grantRevision, capabilityId: "project.inspect" }));
    const grant = taskState.grants.find(value => value.grantId === run.grantId);
    assert(grant?.definitionDigest === run.grantDefinitionDigest, "m1-stale-grant");
    const snapshot = await this.service.adapter.inspectRevision({ binding: binding(context, taskState.project.environmentId),
      reference: taskState.project.reference });
    const permittedStep = step => (!step.arguments?.path || grant.allowedPaths.includes(step.arguments.path))
      && (!step.arguments?.suiteId || grant.allowedSuites.includes(step.arguments.suiteId));
    const permittedProposal = proposal => permittedStep(proposal)
      && (!proposal.restorePaths || proposal.restorePaths.every(file => grant.allowedPaths.includes(file)));
    const permittedProposalIds = new Set(taskState.proposals.filter(permittedProposal).map(proposal => proposal.proposalId));
    const permittedReceipts = taskState.receipts.filter(receipt => permittedProposalIds.has(receipt.proposalId));
    const plannerSnapshot = { workspaceSha256: snapshot.workspaceSha256, projectRevision: taskState.project.revision,
      files: snapshot.files.filter(file => grant.allowedPaths.includes(file.path)),
      omittedFileCount: snapshot.files.filter(file => !grant.allowedPaths.includes(file.path)).length };
    if (run.status === "repair-required") {
      assert(run.pendingProposalId === null && taskState.pendingReconciliation.length === 0, "m1-repair-intent-unsettled");
      const failedReceiptIds = new Set(run.actions.filter(action => action.capabilityId === "project.run-tests")
        .map(action => action.receiptId));
      const currentFailure = permittedReceipts.some(receipt => failedReceiptIds.has(receipt.receiptId)
        && receipt.capabilityId === "project.run-tests" && receipt.executionStatus === "ran"
        && receipt.output?.passed === false && receipt.afterRevision === plannerSnapshot.projectRevision
        && receipt.afterSha256 === plannerSnapshot.workspaceSha256);
      assert(currentFailure, "m1-repair-basis-stale");
    }
    await this.update(context, run.runId, state => { state.status = "planning"; state.planAttempts++; });
    const requestElapsed = Math.max(0, this.now() - activeWindow.startedAtMs);
    const timeout = Math.min(run.budgets.planningTimeoutMs,
      activeWindow.reservedMs - requestElapsed,
      run.budgets.maximumRunActiveMs - run.consumedMs - requestElapsed);
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
        workIntent: taskState.task.workIntent ?? "effect-requested",
        snapshot: structuredClone(plannerSnapshot),
        receipts: structuredClone(permittedReceipts
          .map(({ beforeReference, afterReference, rollbackReference, ...receipt }) => receipt)),
        previousPlans: structuredClone(run.plans.filter(plan => plan.steps.every(permittedStep))
          .map(({ summary, steps }) => ({ summary, steps }))), repair: run.status === "repair-required",
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
        const { project: currentProject, grant: currentGrant } = await this.service.authority(tx, context, { taskId: run.taskId, grantId: run.grantId,
          grantRevision: run.grantRevision, capabilityId: "project.inspect" });
        assert(currentProject.revision === taskState.project.revision
          && digest(currentProject.reference) === digest(taskState.project.reference), "m1-plan-snapshot-stale");
        const suppliedReceiptIds = new Set(permittedReceipts.map(receipt => receipt.receiptId));
        let precedingMutation = false;
        // This is whole-plan rejection, not permission to execute. Do not start an earlier
        // action when a later restore already references unavailable or future-stale evidence.
        // Each eventual proposal still rechecks current authority and exact revision.
        for (const step of steps) {
          assert(currentGrant.capabilityIds.includes(step.capabilityId)
            && !(currentGrant.profile === "read-only" && CAPABILITIES[step.capabilityId].effectful), "m1-capability-denied");
          if (step.capabilityId === "project.restore") assert(!precedingMutation
            && suppliedReceiptIds.has(step.arguments.receiptId), "m1-plan-restore-reference-invalid");
          await this.service.resolveArguments(tx, { taskId: run.taskId, capabilityId: step.capabilityId,
            arguments: step.arguments }, currentGrant, currentProject);
          precedingMutation ||= ["project.apply-change", "project.restore"].includes(step.capabilityId);
        }
        const current = await tx.get("run", run.runId);
        const planningProtocol = plan.planningProtocol ? structuredClone(plan.planningProtocol) : null;
        const protocolDigest = planningProtocol ? digest(planningProtocol) : null;
        current.plans.push({ summary: plan.summary, steps, planDigest: digest({ summary: plan.summary, steps }),
          planningProtocol, protocolDigest,
          sourceProjectRevision: taskState.project.revision, sourceWorkspaceSha256: snapshot.workspaceSha256 });
        current.protocolCorrectionCount = (current.protocolCorrectionCount ?? 0) + (planningProtocol?.correctionCount ?? 0);
        current.activePlan = current.plans.length - 1; current.nextStep = 0; current.pendingProposalId = null;
        current.status = "running"; current.updatedAtMs = this.now();
        await tx.save("run", current.runId, current);
        await tx.audit("conversational-plan-recorded", current.runId, { planDigest: current.plans.at(-1).planDigest,
          protocolDigest, providerAttemptCount: planningProtocol?.providerAttemptCount ?? null,
          protocolCorrectionCount: planningProtocol?.correctionCount ?? 0 });
      });
      return true;
    } finally { clearTimeout(timer); clearInterval(poll); }
  }

  async consume(context, runId, result) {
    assert(result.receipt, "m1-action-incomplete");
    this.service.verifyReceipt(result.receipt);
    return this.update(context, runId, run => {
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
      const budgets = validateRunBudgets(run);
      assert(Number.isSafeInteger(run.recoveredActiveWindowCount ?? 0) && (run.recoveredActiveWindowCount ?? 0) >= 0,
        "m1-active-window-invalid");
      if (run.activeWindow !== null && run.activeWindow !== undefined) {
        assertActiveWindow(run.activeWindow);
        assert(run.activeWindow.reservedMs <= budgets.maximumRequestActiveMs
          && run.consumedMs + run.activeWindow.reservedMs <= budgets.maximumRunActiveMs,
        "m1-active-window-invalid");
      }
      for (const plan of run.plans) {
        assert(plan.planDigest === digest({ summary: plan.summary, steps: plan.steps }), "m1-plan-integrity-failed");
        assert((plan.planningProtocol === null || plan.planningProtocol === undefined) === (plan.protocolDigest === null || plan.protocolDigest === undefined)
          && (!plan.planningProtocol || plan.protocolDigest === digest(plan.planningProtocol)), "m1-plan-integrity-failed");
      }
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

function upgradeRunBudgets(run) {
  assert(run?.budgets && typeof run.budgets === "object" && !Array.isArray(run.budgets), "m1-orchestrator-budget-invalid");
  if (Object.hasOwn(run.budgets, "maximumActiveMs")) {
    assert(!Object.hasOwn(run.budgets, "maximumRequestActiveMs") && !Object.hasOwn(run.budgets, "maximumRunActiveMs"),
      "m1-orchestrator-budget-invalid");
    // Historical runs retain their exact former total ceiling. They never gain
    // the larger R11 continuation budget merely by being reopened.
    run.budgets.maximumRequestActiveMs = run.budgets.maximumActiveMs;
    run.budgets.maximumRunActiveMs = run.budgets.maximumActiveMs;
    delete run.budgets.maximumActiveMs;
  }
  validateRunBudgets(run);
  run.recoveredActiveWindowCount ??= 0;
  run.activeWindow ??= null;
}

function validateRunBudgets(run) {
  const legacy = run?.budgets && Object.hasOwn(run.budgets, "maximumActiveMs");
  const budgets = legacy ? { ...run.budgets,
    maximumRequestActiveMs: run.budgets.maximumActiveMs, maximumRunActiveMs: run.budgets.maximumActiveMs } : run?.budgets;
  if (legacy) delete budgets.maximumActiveMs;
  assert(Number.isSafeInteger(run?.consumedMs) && run.consumedMs >= 0
    && budgets && Object.keys(budgets).every(key => BUDGET_KEYS.has(key))
    && Object.entries(DEFAULT_BUDGETS).every(([key, limit]) => Number.isInteger(budgets[key])
      && budgets[key] > 0 && budgets[key] <= limit)
    && budgets.maximumRequestActiveMs <= budgets.maximumRunActiveMs,
  "m1-orchestrator-budget-invalid");
  return budgets;
}

function assertActiveWindow(value) {
  assert(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join() === "reservedMs,startedAtMs,windowId"
    && /^window-[a-f0-9-]{36}$/u.test(value.windowId)
    && Number.isSafeInteger(value.startedAtMs) && value.startedAtMs >= 0
    && Number.isSafeInteger(value.reservedMs) && value.reservedMs > 0,
  "m1-active-window-invalid");
}

export function runEvidenceProjection(run, taskState) {
  const actions = new Set((run.actions ?? []).map(action => action.receiptId));
  const proposals = new Set((run.actions ?? []).map(action => action.proposalId));
  if (run.pendingProposalId) proposals.add(run.pendingProposalId);
  const receipts = (taskState.receipts ?? []).filter(receipt => actions.has(receipt.receiptId));
  const unsettled = (taskState.pendingReconciliation ?? []).some(item => proposals.has(item.proposalId))
    || (taskState.proposals ?? []).some(item => proposals.has(item.proposalId) && ["dispatching", "unknown"].includes(item.status));
  const applied = receipts.some(receipt => ["project.apply-change", "project.restore"].includes(receipt.capabilityId)
    && receipt.executionStatus === "published");
  const tests = receipts.filter(receipt => receipt.capabilityId === "project.run-tests");
  const terminal = finished.has(run.status);
  return Object.freeze({ schemaVersion: "runaai-m1-run-evidence/v1", runId: run.runId,
    changeStatus: unsettled ? "unknown" : applied ? "applied" : terminal ? "none-recorded" : "pending",
    testStatus: unsettled ? "unknown" : tests.some(receipt => receipt.executionStatus === "ran") ? "ran"
      : tests.length ? "attempted-not-run" : terminal ? "none-recorded" : "pending" });
}

export function runResultProjection(run, taskState) {
  const actionReceiptIds = new Set((run.actions ?? []).map(action => action.receiptId));
  const actionProposalIds = new Set((run.actions ?? []).map(action => action.proposalId));
  if (run.pendingProposalId) actionProposalIds.add(run.pendingProposalId);
  const proposals = (taskState.proposals ?? []).filter(value => actionProposalIds.has(value.proposalId));
  const receipts = (taskState.receipts ?? []).filter(value => actionReceiptIds.has(value.receiptId));
  const unsettled = (taskState.pendingReconciliation ?? []).some(value => actionProposalIds.has(value.proposalId))
    || proposals.some(value => ["dispatching", "unknown"].includes(value.status));
  const lines = [];
  for (const receipt of receipts) {
    const proposal = proposals.find(value => value.proposalId === receipt.proposalId);
    if (receipt.capabilityId === "project.inspect" && receipt.executionStatus === "observed" && receipt.output?.file) {
      const file = receipt.output.file;
      lines.push(`Inspected ${file.path} at SHA-256 ${file.sha256}. Current content:\n${file.content}`);
    } else if (["project.apply-change", "project.restore"].includes(receipt.capabilityId)
        && receipt.executionStatus === "published") {
      const path = proposal?.arguments?.path;
      lines.push(path ? `Applied and recorded the change to ${path}.` : "Applied and recorded the requested workspace change.");
    } else if (receipt.capabilityId === "project.run-tests") {
      const checks = Array.isArray(receipt.output?.checks) ? receipt.output.checks : [];
      const passed = checks.filter(value => value.errorCode === null || value.errorCode === undefined).length;
      const result = receipt.executionStatus === "ran" ? (receipt.output?.passed ? "passed" : "failed") : "did not run";
      lines.push(`Test suite ${receipt.output?.suiteId ?? proposal?.arguments?.suiteId ?? "selected"} ${result}; ${passed}/${checks.length} fixed checks passed.`);
    }
  }
  if (unsettled) lines.push("An action outcome is unresolved; reconcile it before any successor work.");
  else if (run.status === "repair-required") lines.push("A fixed test failed. No repair has started; one explicit bounded continuation is available.");
  else if (run.status === "cancelled") lines.push("The task is cancelled and no new step will start.");
  else if (!lines.length && finished.has(run.status)) lines.push("No inspection, applied change, or executed test was recorded for this run.");
  return Object.freeze({ schemaVersion: "runaai-m1-grounded-run-result/v1", runId: run.runId,
    status: unsettled ? "unknown" : run.status, quiescent: unsettled ? false : finished.has(run.status) || run.status === "repair-required",
    answerOrigin: "application-receipts", summary: lines.join("\n") });
}

function parse(schema, value) { const parsed = schema.safeParse(value); assert(parsed.success, "m1-invalid-plan"); return parsed.data; }
function safeCode(error) { return /^m1-[a-z0-9-]+$/.test(error?.code ?? "") ? error.code : "m1-orchestration-failed"; }
