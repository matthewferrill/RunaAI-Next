import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import pg from "pg";

import { digest, failure } from "./tasks/contracts.mjs";
import { M1TaskOrchestrator } from "./tasks/orchestrator.mjs";
import { PostgresTaskStore } from "./tasks/postgres.mjs";
import { M1TaskService } from "./tasks/service.mjs";
import { startSyntheticPostgres } from "./synthetic-postgres.mjs";
import { AGENT_PG_CANARIES, agentActionToken, agentAuthoritySnapshot, agentTaskState,
  createAgentPgCipher } from "./agent-governance-postgres.integration-child.mjs";

const CONTEXT = Object.freeze({ principalId: "agent-pg-owner", projectId: "agent-pg-project",
  sessionId: "agent-pg-session" });
const NOW = Date.parse("2026-09-04T18:00:00.000Z");
const INITIAL_SOURCE = `exports.add=(a,b)=>a+b; // ${AGENT_PG_CANARIES[1]}`;
const CHANGED_SOURCE = `exports.add=(a,b)=>a-b; // ${AGENT_PG_CANARIES[2]}`;

function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function exactError(code) {
  return error => error?.code === code && error.message === code;
}

function table(snapshot, name) {
  const value = snapshot.tables.find(item => item.tableName === name);
  assert.ok(value, `missing snapshot table ${name}`);
  return value;
}

function assertRowDeltas(before, after, expected = {}) {
  assert.deepEqual(after.schemas, before.schemas);
  assert.deepEqual(after.inventory, before.inventory);
  for (const current of after.tables) {
    const prior = table(before, current.tableName);
    assert.equal(current.rowCount - prior.rowCount, expected[current.tableName] ?? 0,
      `${current.tableName} row delta`);
    if ((expected[current.tableName] ?? 0) === 0 && !expected[`${current.tableName}MayUpdate`]) {
      assert.deepEqual(current, prior, `${current.tableName} changed unexpectedly`);
    }
  }
}

async function rejectsWithoutAuthorityWrite(pool, schema, action, code) {
  const before = await agentAuthoritySnapshot(pool, schema);
  await assert.rejects(action, exactError(code));
  const after = await agentAuthoritySnapshot(pool, schema);
  assert.deepEqual(after, before);
}

class AuthorityOnlyAdapter {
  constructor() {
    this.revisions = new Map();
    this.prepareGate = null;
    this.calls = { createEnvironment: 0, inspectRevision: 0, verifyMaterialized: 0,
      prepare: 0, materialize: 0, observeMaterialized: 0, executeTests: 0 };
  }
  reference(files, environmentId = "agent-pg-environment") {
    const values = Object.entries(files).sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => ({ path, content, sha256: digest(content), bytes: Buffer.byteLength(content) }));
    const reference = { schemaVersion: "agent-pg-revision/v1", environmentId,
      revisionId: `revision-${digest(values).slice(0, 48)}`, workspaceSha256: digest(values),
      files: values.map(({ content: ignored, ...value }) => value) };
    this.revisions.set(reference.revisionId, { reference, files: values,
      workspaceSha256: reference.workspaceSha256 });
    return reference;
  }
  async createEnvironment({ environmentId, files }) {
    this.calls.createEnvironment++;
    return this.reference(Object.fromEntries(files.map(file => [file.path, file.content])), environmentId);
  }
  async inspectRevision({ reference }) {
    this.calls.inspectRevision++;
    const revision = this.revisions.get(reference.revisionId);
    assert.ok(revision);
    assert.equal(digest(revision.reference), digest(reference));
    return structuredClone(revision);
  }
  async verifyMaterialized(input) {
    this.calls.verifyMaterialized++;
    return this.inspectRevision(input);
  }
  holdNextPrepares(count) {
    assert.equal(this.prepareGate, null);
    const entered = deferred(), release = deferred();
    const gate = { count, arrivals: 0, entered, release };
    this.prepareGate = gate;
    return { entered: entered.promise, release: () => release.resolve(), clear: () => {
      assert.equal(gate.arrivals, count);
      assert.equal(this.prepareGate, gate);
      this.prepareGate = null;
    } };
  }
  async prepare({ reference, capabilityId, args }) {
    this.calls.prepare++;
    const gate = this.prepareGate;
    if (gate) {
      gate.arrivals++;
      assert.ok(gate.arrivals <= gate.count);
      if (gate.arrivals === gate.count) gate.entered.resolve();
      await gate.release.promise;
    }
    const current = await this.inspectRevision({ reference });
    const prepared = { capabilityId, arguments: structuredClone(args), beforeReference: reference,
      beforeSha256: reference.workspaceSha256, preconditionSha256: digest({ reference, args }) };
    if (capabilityId === "project.run-tests") {
      prepared.preview = { suiteId: args.suiteId, suiteSha256: digest(args.suiteId), testIds: ["addition"] };
    } else if (["project.apply-change", "project.preview-change"].includes(capabilityId)) {
      const actual = current.files.find(file => file.path === args.path)?.sha256 ?? null;
      assert.equal(args.expectedSha256, actual);
      prepared.preview = { path: args.path, beforeSha256: actual, afterSha256: digest(args.content) };
      prepared.targetFiles = Object.fromEntries(current.files.map(file => [file.path, file.content]));
      prepared.targetFiles[args.path] = args.content;
    } else {
      prepared.preview = { path: args.path ?? null };
    }
    return prepared;
  }
  async materialize() {
    this.calls.materialize++;
    throw failure("m1-agent-pg-unexpected-materialize");
  }
  async observeMaterialized() {
    this.calls.observeMaterialized++;
    throw failure("m1-agent-pg-unexpected-observe");
  }
  async executeTests({ reference, suiteId, authorize, signal }) {
    await authorize?.();
    assert.equal(signal?.aborted, false);
    this.calls.executeTests++;
    return { status: "passed", passed: true, suiteId, suiteSha256: digest(suiteId),
      workspaceSha256: reference.workspaceSha256,
      checks: [{ testId: "addition", passed: true, expected: 4, actual: 4 }],
      executionReceipt: { status: "executed", syntheticAuthorityFixture: true } };
  }
}

function serviceFor(store, adapter, options = {}) {
  return new M1TaskService({ store, adapter, now: () => new Date(NOW), hooks: options.hooks ?? {},
    authorizeContext: async candidate => candidate.principalId === CONTEXT.principalId
      && candidate.projectId === CONTEXT.projectId && candidate.sessionId === CONTEXT.sessionId });
}

async function createTaskGrant(service, label, profile = "safe-autopilot") {
  const task = await service.createTask(CONTEXT, { requestId: `create-${label}`,
    objective: `${AGENT_PG_CANARIES[0]}:${label}` });
  const grant = await service.createGrant(CONTEXT, { taskId: task.taskId, profile,
    allowedPaths: ["main.js"], allowedSuites: ["addition"],
    expiresAt: new Date(NOW + 60_000).toISOString() });
  return { task, grant };
}

function plannerReturning(step) {
  return { role: "agent", calls: 0, async plan() {
    this.calls++;
    return { summary: "Synthetic authority-only plan.", steps: [structuredClone(step)] };
  } };
}

function blockedPlanner() {
  const entered = deferred(), release = deferred();
  return { role: "agent", calls: 0, entered: entered.promise, release: () => release.resolve(), async plan() {
    this.calls++;
    entered.resolve();
    await release.promise;
    throw failure("m1-agent-pg-planner-stop");
  } };
}

function blockedWorkflow() {
  const entered = deferred(), release = deferred();
  return { calls: 0, entered: entered.promise, release: () => release.resolve(), async run() {
    this.calls++;
    entered.resolve();
    await release.promise;
    throw failure("m1-agent-pg-workflow-stop-before-effect");
  } };
}

function neverWorkflow() {
  return { calls: 0, async run() {
    this.calls++;
    throw new Error("Agent PG fixture invoked a forbidden workflow");
  } };
}

async function firstSettled(promises) {
  return Promise.race(promises.map((promise, index) => promise.then(
    value => ({ index, status: "fulfilled", value }),
    reason => ({ index, status: "rejected", reason }))));
}

function runFreshChild(input) {
  const childPath = fileURLToPath(new URL("./agent-governance-postgres.integration-child.mjs", import.meta.url));
  const child = spawn(process.execPath, [childPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const maximumBytes = 262_144;
  return new Promise((resolveChild, rejectChild) => {
    const stdout = [], stderr = [], failures = [];
    let stdoutBytes = 0, stderrBytes = 0, settled = false, closed = false, terminating = false;
    let timer = null, terminationTimer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      if (failures.length === 1) rejectChild(failures[0]);
      else if (failures.length > 1) rejectChild(new AggregateError(failures,
        "Agent PostgreSQL restart child and termination failed"));
      else resolveChild(value);
    };
    const addFailure = error => {
      if (error && !failures.includes(error)) failures.push(error);
    };
    const terminate = error => {
      if (settled || closed) return;
      addFailure(error);
      if (terminating) return;
      terminating = true;
      try {
        const accepted = child.exitCode !== null || child.signalCode !== null ? true : child.kill();
        if (!accepted && child.exitCode === null && child.signalCode === null) {
          addFailure(new Error("agent-pg-child-termination-not-accepted"));
        }
      } catch (killError) { addFailure(killError); }
      terminationTimer = setTimeout(() => {
        if (settled || closed) return;
        addFailure(new Error("agent-pg-child-termination-close-timeout"));
        try {
          const accepted = child.exitCode !== null || child.signalCode !== null ? true : child.kill("SIGKILL");
          if (!accepted && child.exitCode === null && child.signalCode === null) {
            addFailure(new Error("agent-pg-child-force-termination-not-accepted"));
          }
        } catch (killError) { addFailure(killError); }
      }, 5_000);
    };
    const capture = (target, chunk, stream) => {
      if (terminating) return;
      if (stream === "stdout") stdoutBytes += chunk.length; else stderrBytes += chunk.length;
      if (stdoutBytes > maximumBytes || stderrBytes > maximumBytes) {
        terminate(new Error("agent-pg-child-output-too-large"));
      } else target.push(chunk);
    };
    child.stdout.on("data", chunk => capture(stdout, chunk, "stdout"));
    child.stderr.on("data", chunk => capture(stderr, chunk, "stderr"));
    child.stdout.once("error", terminate);
    child.stderr.once("error", terminate);
    child.once("error", terminate);
    child.stdin.once("error", terminate);
    child.once("close", (code, signal) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      const diagnostic = Buffer.concat(stderr, stderrBytes).toString("utf8").trim();
      const terminatedByParent = terminating && signal !== null;
      if (code !== 0 && !terminatedByParent) {
        addFailure(new Error(`agent-pg-child-failed:${code}:${signal ?? "none"}:${diagnostic}`));
      } else if (code === null && signal === null) {
        addFailure(new Error(`agent-pg-child-close-invalid:${diagnostic}`));
      }
      if (failures.length) return finish();
      try { return finish(JSON.parse(Buffer.concat(stdout, stdoutBytes).toString("utf8"))); }
      catch (error) { addFailure(error); return finish(); }
    });
    timer = setTimeout(() => terminate(new Error("agent-pg-child-timeout")), 30_000);
    try { child.stdin.end(JSON.stringify(input)); }
    catch (error) { terminate(error); }
  });
}

test("real disposable PostgreSQL serializes Agent authority and preserves blocked state across restart", {
  timeout: 120_000,
}, async () => {
  const toolRoot = resolve(process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools");
  const artifactRoot = resolve(process.env.RUNALAB_ARTIFACT_ROOT
    ?? "D:/Projects/Runalab/artifacts/agent-governance-postgres");
  assert.equal(isAbsolute(toolRoot) && isAbsolute(artifactRoot), true);
  const schema = `agent_pg_${randomBytes(6).toString("hex")}`;
  let database = null;
  const pools = [];
  const ciphers = [];
  let runError = null;
  try {
    await mkdir(artifactRoot, { recursive: true });
    assert.deepEqual(await readdir(artifactRoot), [], "The owned Agent PostgreSQL artifact root must begin empty.");
    database = await startSyntheticPostgres({ toolRoot, artifactRoot });
    const makePool = () => {
      const pool = new pg.Pool({ connectionString: database.connectionString, max: 4,
        connectionTimeoutMillis: 2_000, query_timeout: 8_000 });
      pools.push(pool);
      return pool;
    };
    const adminPool = makePool(), poolA = makePool(), poolB = makePool();
    const makeStore = pool => {
      const cipher = createAgentPgCipher();
      ciphers.push(cipher);
      return new PostgresTaskStore({ pool, schema, cipher });
    };
    const adminStore = makeStore(adminPool), storeA = makeStore(poolA), storeB = makeStore(poolB);
    await adminStore.initialize();
    const backendPids = await Promise.all([adminPool, poolA, poolB]
      .map(pool => pool.query("SELECT pg_backend_pid() AS pid").then(value => value.rows[0].pid)));
    assert.equal(new Set(backendPids).size, 3, "The fixture requires three genuine PostgreSQL sessions.");

    const adapter = new AuthorityOnlyAdapter();
    const admin = serviceFor(adminStore, adapter), serviceA = serviceFor(storeA, adapter), serviceB = serviceFor(storeB, adapter);
    const project = await admin.registerProject(CONTEXT, { environmentId: "agent-pg-environment",
      files: { "main.js": INITIAL_SOURCE } });

    const race = await createTaskGrant(admin, "proposal-race");
    const raceFence = agentActionToken(await serviceA.agentActionFence(CONTEXT, { taskId: race.task.taskId }));
    const raceBefore = await agentAuthoritySnapshot(adminPool, schema);
    const proposalInputs = ["a", "b"].map(suffix => ({ taskId: race.task.taskId,
      grantId: race.grant.grantId, grantRevision: race.grant.revision, requestId: `proposal-race-${suffix}`,
      capabilityId: "project.inspect", arguments: { path: "main.js" } }));
    const prepareGate = adapter.holdNextPrepares(2);
    const proposalRace = [serviceA.propose(CONTEXT, proposalInputs[0], { agentActionAuthority: raceFence }),
      serviceB.propose(CONTEXT, proposalInputs[1], { agentActionAuthority: raceFence })];
    const proposalSettled = Promise.allSettled(proposalRace);
    await prepareGate.entered;
    prepareGate.release();
    const proposalResults = await proposalSettled;
    prepareGate.clear();
    assert.equal(proposalResults.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(proposalResults.filter(value => value.status === "rejected"
      && exactError("m1-agent-action-stale")(value.reason)).length, 1);
    const raceWinner = proposalResults.find(value => value.status === "fulfilled").value;
    const winnerInput = proposalInputs.find(value => value.requestId === raceWinner.requestId);
    const raceAfter = await agentAuthoritySnapshot(adminPool, schema);
    assertRowDeltas(raceBefore, raceAfter, { records: 1, audit: 1 });
    const raceState = await agentTaskState(adminStore, CONTEXT, race.task.taskId);
    assert.deepEqual(raceState.proposals.map(value => value.proposalId), [raceWinner.proposalId]);
    assert.deepEqual({ intents: raceState.intents.length, receipts: raceState.receipts.length,
      runs: raceState.runs.length, materialize: adapter.calls.materialize,
      tests: adapter.calls.executeTests }, { intents: 0, receipts: 0, runs: 0, materialize: 0, tests: 0 });

    const duplicateFence = agentActionToken(await serviceB.agentActionFence(CONTEXT, { taskId: race.task.taskId }));
    const duplicateBefore = await agentAuthoritySnapshot(adminPool, schema);
    assert.equal((await serviceB.propose(CONTEXT, winnerInput,
      { agentActionAuthority: duplicateFence })).proposalId, raceWinner.proposalId);
    await assert.rejects(serviceA.propose(CONTEXT, { ...winnerInput, arguments: { path: "other.js" } },
      { agentActionAuthority: duplicateFence }), exactError("m1-request-id-conflict"));
    assert.deepEqual(await agentAuthoritySnapshot(adminPool, schema), duplicateBefore);

    const revoked = await createTaskGrant(admin, "revoked");
    const revokeFence = agentActionToken(await serviceA.agentActionFence(CONTEXT, { taskId: revoked.task.taskId }));
    await serviceA.revokeGrant(CONTEXT, { grantId: revoked.grant.grantId }, { agentActionAuthority: revokeFence });
    const revokedFence = agentActionToken(await serviceA.agentActionFence(CONTEXT, { taskId: revoked.task.taskId }));
    const preparesBeforeRevoked = adapter.calls.prepare;
    await rejectsWithoutAuthorityWrite(adminPool, schema, () => serviceB.propose(CONTEXT, {
      taskId: revoked.task.taskId, grantId: revoked.grant.grantId, grantRevision: revoked.grant.revision,
      requestId: "revoked-must-not-propose", capabilityId: "project.inspect", arguments: { path: "main.js" },
    }, { agentActionAuthority: revokedFence }), "m1-grant-revoked");
    assert.equal(adapter.calls.prepare, preparesBeforeRevoked);

    const ask = await createTaskGrant(admin, "ask", "ask-every-time");
    const askFence = agentActionToken(await serviceA.agentActionFence(CONTEXT, { taskId: ask.task.taskId }));
    const pending = await serviceA.propose(CONTEXT, { taskId: ask.task.taskId, grantId: ask.grant.grantId,
      grantRevision: ask.grant.revision, requestId: "ask-pending", capabilityId: "project.apply-change",
      arguments: { path: "main.js", content: CHANGED_SOURCE,
        expectedSha256: project.reference.files[0].sha256 } }, { agentActionAuthority: askFence });
    assert.equal(pending.status, "pending-approval");
    const pendingFence = agentActionToken(await serviceB.agentActionFence(CONTEXT, { taskId: ask.task.taskId }));
    await rejectsWithoutAuthorityWrite(adminPool, schema,
      () => serviceB.execute(CONTEXT, { proposalId: pending.proposalId }, { agentActionAuthority: pendingFence }),
      "m1-approval-required");
    const askState = await agentTaskState(adminStore, CONTEXT, ask.task.taskId);
    assert.deepEqual({ proposal: askState.proposals[0].status, intents: askState.intents.length,
      receipts: askState.receipts.length, runs: askState.runs.length },
    { proposal: "pending-approval", intents: 0, receipts: 0, runs: 0 });
    assert.equal(adapter.calls.materialize, 0);

    const startRace = await createTaskGrant(admin, "start-race");
    const startFence = agentActionToken(await serviceA.agentActionFence(CONTEXT, { taskId: startRace.task.taskId }));
    const planGate = blockedPlanner(), startWorkflow = neverWorkflow();
    const orchestratorA = new M1TaskOrchestrator({ service: serviceA, planner: planGate, workflow: startWorkflow,
      now: () => NOW, budgets: { maximumRequestActiveMs: 1_000, maximumRunActiveMs: 2_000 } });
    const orchestratorB = new M1TaskOrchestrator({ service: serviceB, planner: planGate, workflow: startWorkflow,
      now: () => NOW, budgets: { maximumRequestActiveMs: 1_000, maximumRunActiveMs: 2_000 } });
    const starts = [orchestratorA.start(CONTEXT, { taskId: startRace.task.taskId, grantId: startRace.grant.grantId,
      grantRevision: startRace.grant.revision, requestId: "start-a" }, { agentActionAuthority: startFence }),
    orchestratorB.start(CONTEXT, { taskId: startRace.task.taskId, grantId: startRace.grant.grantId,
      grantRevision: startRace.grant.revision, requestId: "start-b" }, { agentActionAuthority: startFence })];
    const startsSettled = Promise.allSettled(starts);
    await planGate.entered;
    const earlyStart = await firstSettled(starts);
    assert.equal(earlyStart.status, "rejected");
    assert.ok(exactError("m1-agent-action-stale")(earlyStart.reason));
    const activeStart = await agentTaskState(adminStore, CONTEXT, startRace.task.taskId);
    assert.equal(activeStart.runs.length, 1);
    assert.equal(activeStart.runs.filter(value => value.activeWindow !== null).length, 1);
    assert.deepEqual({ proposals: activeStart.proposals.length, intents: activeStart.intents.length,
      receipts: activeStart.receipts.length, workflowCalls: startWorkflow.calls },
    { proposals: 0, intents: 0, receipts: 0, workflowCalls: 0 });
    planGate.release();
    const startResults = await startsSettled;
    assert.equal(startResults.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(startResults.filter(value => value.status === "rejected").length, 1);
    const stoppedStart = await agentTaskState(adminStore, CONTEXT, startRace.task.taskId);
    assert.deepEqual(stoppedStart.runs.map(value => ({ status: value.status, activeWindow: value.activeWindow })),
      [{ status: "failed", activeWindow: null }]);

    const resumeCase = await createTaskGrant(admin, "resume-race", "ask-every-time");
    const resumePlan = plannerReturning({ capabilityId: "project.apply-change", arguments: {
      path: "main.js", content: CHANGED_SOURCE, expectedSha256: project.reference.files[0].sha256 } });
    const initialResumeWorkflow = neverWorkflow();
    const setupOrchestrator = new M1TaskOrchestrator({ service: serviceA, planner: resumePlan,
      workflow: initialResumeWorkflow, now: () => NOW,
      budgets: { maximumRequestActiveMs: 1_000, maximumRunActiveMs: 2_000 } });
    const resumeStartFence = agentActionToken(await serviceA.agentActionFence(CONTEXT,
      { taskId: resumeCase.task.taskId }));
    const waiting = await setupOrchestrator.start(CONTEXT, { taskId: resumeCase.task.taskId,
      grantId: resumeCase.grant.grantId, grantRevision: resumeCase.grant.revision,
      requestId: "resume-run" }, { agentActionAuthority: resumeStartFence });
    assert.equal(waiting.run.status, "waiting-approval");
    assert.equal(initialResumeWorkflow.calls, 0);
    const resumeProposal = waiting.pendingProposal;
    const approvalFence = agentActionToken(await serviceA.agentActionFence(CONTEXT,
      { taskId: resumeCase.task.taskId }));
    await serviceA.approve(CONTEXT, { proposalId: resumeProposal.proposalId,
      proposalDigest: resumeProposal.proposalDigest }, { agentActionAuthority: approvalFence });
    const resumeFence = agentActionToken(await serviceA.agentActionFence(CONTEXT,
      { taskId: resumeCase.task.taskId }));
    const workflowGate = blockedWorkflow();
    const resumeA = new M1TaskOrchestrator({ service: serviceA, planner: resumePlan, workflow: workflowGate,
      now: () => NOW, budgets: { maximumRequestActiveMs: 1_000, maximumRunActiveMs: 2_000 } });
    const resumeB = new M1TaskOrchestrator({ service: serviceB, planner: resumePlan, workflow: workflowGate,
      now: () => NOW, budgets: { maximumRequestActiveMs: 1_000, maximumRunActiveMs: 2_000 } });
    const resumes = [resumeA.resume(CONTEXT, { runId: waiting.run.runId }, { agentActionAuthority: resumeFence }),
      resumeB.resume(CONTEXT, { runId: waiting.run.runId }, { agentActionAuthority: resumeFence })];
    const resumesSettled = Promise.allSettled(resumes);
    await workflowGate.entered;
    const earlyResume = await firstSettled(resumes);
    assert.equal(earlyResume.status, "rejected");
    assert.ok(exactError("m1-operation-in-progress")(earlyResume.reason));
    const activeResume = await agentTaskState(adminStore, CONTEXT, resumeCase.task.taskId);
    assert.equal(activeResume.runs.length, 1);
    assert.equal(activeResume.runs[0].activeWindow !== null, true);
    assert.deepEqual({ proposals: activeResume.proposals.length, intents: activeResume.intents.length,
      receipts: activeResume.receipts.length, workflowCalls: workflowGate.calls },
    { proposals: 1, intents: 0, receipts: 0, workflowCalls: 1 });
    workflowGate.release();
    const resumeResults = await resumesSettled;
    assert.equal(resumeResults.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(resumeResults.filter(value => value.status === "rejected").length, 1);
    const stoppedResume = await agentTaskState(adminStore, CONTEXT, resumeCase.task.taskId);
    assert.deepEqual(stoppedResume.runs.map(value => ({ status: value.status, activeWindow: value.activeWindow })),
      [{ status: "failed", activeWindow: null }]);
    assert.deepEqual({ intents: stoppedResume.intents.length, receipts: stoppedResume.receipts.length,
      outbox: table(await agentAuthoritySnapshot(adminPool, schema), "outbox").rowCount,
      materialize: adapter.calls.materialize }, { intents: 0, receipts: 0, outbox: 0, materialize: 0 });

    const unknownCase = await createTaskGrant(admin, "unknown");
    const unknownService = serviceFor(storeA, adapter, { hooks: {
      afterTests: () => { throw new Error("agent-pg-injected-after-test"); },
    } });
    const unknownPlanner = plannerReturning({ capabilityId: "project.run-tests", arguments: { suiteId: "addition" } });
    const unknownWorkflow = { calls: 0, async run(context, input, options) {
      this.calls++;
      return unknownService.execute(context, input, { agentRunAuthority: options.agentRunAuthority });
    } };
    const unknownOrchestrator = new M1TaskOrchestrator({ service: unknownService,
      planner: unknownPlanner, workflow: unknownWorkflow, now: () => NOW,
      budgets: { maximumRequestActiveMs: 1_000, maximumRunActiveMs: 2_000 } });
    const unknownStartFence = agentActionToken(await unknownService.agentActionFence(CONTEXT,
      { taskId: unknownCase.task.taskId }));
    const unknown = await unknownOrchestrator.start(CONTEXT, { taskId: unknownCase.task.taskId,
      grantId: unknownCase.grant.grantId, grantRevision: unknownCase.grant.revision,
      requestId: "unknown-run" }, { agentActionAuthority: unknownStartFence });
    assert.equal(unknown.run.status, "needs-reconciliation");
    assert.equal(unknown.pendingProposal.status, "unknown");
    assert.deepEqual(unknown.pendingReconciliation.map(value => value.status), ["unknown"]);
    assert.equal(adapter.calls.executeTests, 1);
    assert.equal(unknownWorkflow.calls, 1);
    const unknownState = await agentTaskState(adminStore, CONTEXT, unknownCase.task.taskId);
    assert.deepEqual({ proposals: unknownState.proposals.map(value => value.status),
      intents: unknownState.intents.map(value => value.status), receipts: unknownState.receipts.length,
      runs: unknownState.runs.map(value => ({ status: value.status, activeWindow: value.activeWindow })) },
    { proposals: ["unknown"], intents: ["unknown"], receipts: 0,
      runs: [{ status: "needs-reconciliation", activeWindow: null }] });

    const finalAuthority = await agentAuthoritySnapshot(adminPool, schema);
    assert.equal(table(finalAuthority, "outbox").rowCount, 0);
    assert.deepEqual(adapter.calls, { createEnvironment: 1, inspectRevision: 9, verifyMaterialized: 1,
      prepare: 5, materialize: 0, observeMaterialized: 0, executeTests: 1 });

    const settledToken = agentActionToken(await serviceA.agentActionFence(CONTEXT, { taskId: race.task.taskId }));
    const unknownToken = agentActionToken(await unknownService.agentActionFence(CONTEXT,
      { taskId: unknownCase.task.taskId }));
    const beforeRestart = await agentAuthoritySnapshot(adminPool, schema);
    const restarted = await runFreshChild({ connectionString: database.connectionString, schema, context: CONTEXT,
      reloadTaskId: race.task.taskId, expectedSettledToken: settledToken,
      unknownTaskId: unknownCase.task.taskId, unknownProposalId: unknown.pendingProposal.proposalId,
      unknownGrant: { grantId: unknownCase.grant.grantId, grantRevision: unknownCase.grant.revision },
      expectedUnknownToken: unknownToken });
    assert.deepEqual(await agentAuthoritySnapshot(adminPool, schema), beforeRestart);
    assert.deepEqual(restarted, { schemaVersion: "runaai-agent-pg-restart-child/v1",
      settledToken, unknownToken, unknown: { proposalStatus: "unknown", pendingReconciliationCount: 1,
        unsettledProposalCount: 1, unsettledRunCount: 1 }, authorityUnchanged: true,
      adapterCalls: {}, cleanup: { poolEnded: true, cipherDestroyed: true } });
  } catch (error) {
    runError = error;
  }

  const cleanupErrors = [];
  for (const pool of pools) try { await pool.end(); } catch (error) { cleanupErrors.push(error); }
  for (const cipher of ciphers) try { assert.deepEqual(cipher.destroy(), { destroyed: true }); }
  catch (error) { cleanupErrors.push(error); }
  try {
    if (database) {
      assert.deepEqual(await database.stop(),
        { stopped: true, ownedSyntheticDataRemoved: true, productionChanged: false });
      database = null;
      assert.deepEqual(await readdir(artifactRoot), []);
    }
  } catch (error) { cleanupErrors.push(error); }
  const failures = [runError, ...cleanupErrors].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Agent PostgreSQL integration and cleanup failed");
});
