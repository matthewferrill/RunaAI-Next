import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const fail = code => Object.assign(new Error(code), { code });
const clone = value => structuredClone(value);
const attemptKey = observation => JSON.stringify([observation.caseId, observation.candidateId, observation.repetition]);
const here = dirname(fileURLToPath(import.meta.url));

/** Actual child application lifecycle, not an exception pretending to be a crash.
 * Initialization (including ephemeral keys) is sent only through inherited IPC.
 * The factory is restricted to the acceptance-owned host or its unit fixture.
 * This supervisor never starts/stops PostgreSQL, Qdrant or a model runtime. */
export async function startApplicationFaultWorker({ initialization, getLedger, bootstrapModule = new URL("./worker-host.mjs", import.meta.url),
  allowLifecycleFixture = false, maximumLifetimeMs = 120000, startupTimeoutMs = 30000 } = {}) {
  const bootstrap = bootstrapModule instanceof URL ? fileURLToPath(bootstrapModule) : resolve(bootstrapModule);
  const allowed = [resolve(here, "worker-host.mjs"), ...(allowLifecycleFixture ? [resolve(here, "fault-worker.fixture.mjs")] : [])];
  if (!allowed.includes(bootstrap) || typeof getLedger !== "function" || !initialization || !Number.isInteger(maximumLifetimeMs)
      || maximumLifetimeMs < 1000 || maximumLifetimeMs > 3600000 || !Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 100 || startupTimeoutMs > 60000) throw fail("m1-worker-construction-invalid");
  let child = null, baseUrl = null, closed = false, generation = 0, sequence = 0, lifetime, exitPromise;
  const pending = new Map(), generations = new Map();

  function rejectPending(code) {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(fail(code)); }
    pending.clear();
  }
  function call(operation, input = null, timeoutMs = 60000) {
    if (!child?.connected) return Promise.reject(fail("m1-worker-not-connected"));
    const id = `request-${++sequence}`;
    return new Promise((resolveResult, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(fail("m1-worker-command-timeout")); }, Math.min(timeoutMs, 60000));
      pending.set(id, { resolve: resolveResult, reject, timer });
      child.send({ type: "command", id, operation, input }, error => {
        if (error && pending.has(id)) { clearTimeout(timer); pending.delete(id); reject(fail("m1-worker-command-unavailable")); }
      });
    });
  }
  function mergeCapture(message) {
    const ledger = getLedger();
    if (!ledger || attemptKey(ledger.observation) !== message.attemptKey) throw fail("m1-worker-capture-scope-mismatch");
    const merge = (key, items, id) => {
      for (const value of items ?? []) {
        const prior = ledger.observation.native[key].find(entry => entry[id] === value[id]);
        if (prior) Object.assign(prior, clone(value)); else ledger.observation.native[key].push(clone(value));
      }
    };
    merge("calls", message.native?.calls, "requestId"); merge("receipts", message.native?.receipts, "receiptId");
    if (message.evidence) ledger.evidence(message.evidence.source, message.evidence.kind, message.evidence.data);
    for (const event of message.sessionEvents ?? []) {
      const serialized = JSON.stringify(event);
      if (!ledger.observation.authority.sessionEvents.some(value => JSON.stringify(value) === serialized)) ledger.observation.authority.sessionEvents.push(clone(event));
    }
  }
  async function start() {
    if (closed || child && child.exitCode === null && child.signalCode === null) throw fail("m1-worker-lifecycle-conflict");
    const ledger = getLedger();
    if (!ledger?.observation || !ledger.observation.native || !ledger.observation.authority) throw fail("m1-worker-ledger-required");
    const currentGeneration = ++generation;
    const instance = fork(fileURLToPath(new URL("./fault-worker-entry.mjs", import.meta.url)), [], {
      cwd: here, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"], serialization: "advanced",
    });
    child = instance;
    let readyResolve, readyReject;
    const ready = new Promise((yes, no) => { readyResolve = yes; readyReject = no; });
    const startTimer = setTimeout(() => readyReject(fail("m1-worker-startup-timeout")), startupTimeoutMs);
    exitPromise = new Promise(resolveExit => instance.once("exit", (code, signal) => {
      clearTimeout(lifetime);
      const event = { pid: instance.pid, generation: currentGeneration, code, signal, exitedAt: new Date().toISOString(), actualProcessExit: true };
      generations.set(currentGeneration, event); rejectPending("m1-worker-exited");
      readyReject(fail("m1-worker-exited-before-ready")); resolveExit(event);
    }));
    instance.on("error", () => { readyReject(fail("m1-worker-spawn-failed")); rejectPending("m1-worker-unavailable"); });
    instance.on("message", message => {
      try {
        if (message?.type === "ready") {
          const url = new URL(message.baseUrl);
          if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || message.pid !== instance.pid) throw fail("m1-worker-ready-invalid");
          baseUrl = url.origin; readyResolve();
        } else if (message?.type === "capture") mergeCapture(message);
        else if (message?.type === "result") {
          const item = pending.get(message.id); if (!item) return;
          clearTimeout(item.timer); pending.delete(message.id);
          if (message.ok) item.resolve(message.value); else item.reject(fail(message.errorCode ?? "m1-worker-command-failed"));
        } else if (message?.type === "fatal") throw fail(message.errorCode ?? "m1-worker-failed");
      } catch {
        rejectPending("m1-worker-message-invalid"); readyReject(fail("m1-worker-message-invalid")); instance.kill();
      }
    });
    lifetime = setTimeout(() => instance.kill(), maximumLifetimeMs); lifetime.unref?.();
    const seed = { caseId: ledger.observation.caseId, candidateId: ledger.observation.candidateId, repetition: ledger.observation.repetition,
      role: ledger.observation.role, phase: ledger.phase };
    instance.send({ type: "initialize", bootstrapModule: bootstrap, initialization: clone(initialization), seed, allowLifecycleFixture });
    try { await ready; }
    catch (error) { instance.kill(); await exitPromise; throw error; }
    finally { clearTimeout(startTimer); }
    return { pid: instance.pid, generation: currentGeneration, baseUrl };
  }

  const worker = {
    armMaterializationHold: scope => call("fault.arm-materialization", scope),
    waitMaterializationHeld: () => call("fault.wait-materialization", null, 60000),
    armNativeReceiptHold: scope => call("fault.arm-native-receipt", scope),
    waitNativeReceiptHeld: () => call("fault.wait-native-receipt", null, 60000),
    async crash() {
      if (!child || child.exitCode !== null || child.signalCode !== null) throw fail("m1-worker-not-running");
      const pid = child.pid;
      // This kills exactly the child object created above. No PID lookup, shell
      // process enumeration, parent/service shutdown or directory deletion occurs.
      if (!child.kill()) throw fail("m1-worker-kill-failed");
      const result = await exitPromise;
      if (result.pid !== pid) throw fail("m1-worker-exit-identity-mismatch");
      return result;
    },
    async restart() {
      if (!generations.has(generation)) throw fail("m1-worker-exit-required-before-restart");
      return start();
    },
    async close() {
      if (closed) return;
      closed = true; clearTimeout(lifetime);
      if (child && child.exitCode === null && child.signalCode === null) {
        try { await call("close", null, 3000); } catch { /* Scoped child kill remains the final cleanup. */ }
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await exitPromise;
      }
      rejectPending("m1-worker-closed");
    },
  };
  const host = {
    get baseUrl() { return baseUrl; }, worker,
    identities: { issue: principalId => call("identity.issue", principalId) },
    bindFixture: (context, item) => call("fixture.bind", { context, item }),
    snapshot: context => call("project.snapshot", context),
    continuity: { prepareAnswerContext: input => call("continuity.prepare", input) },
    m1: { sources: { selected: (context, sourceIds) => call("sources.selected", { context, sourceIds }) } },
    syncPhase: (phase, requestScope) => call("capture.phase", { phase, requestScope }),
    close: () => worker.close(),
  };
  await start();
  return host;
}
