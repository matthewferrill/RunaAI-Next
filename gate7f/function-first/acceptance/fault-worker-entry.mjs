import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AcceptanceFaultController } from "./fault-actions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fail = code => Object.assign(new Error(code), { code });
let host, faults, ledger, initialized = false;
const send = message => new Promise((yes, no) => process.send?.(message, error => error ? no(error) : yes()));
const safeCode = error => /^m1-[a-z0-9-]{1,100}$/u.test(error?.code ?? "") ? error.code : "m1-worker-command-failed";
const attemptKey = observation => JSON.stringify([observation.caseId, observation.candidateId, observation.repetition]);

async function initialize(message) {
  if (initialized) throw fail("m1-worker-already-initialized");
  initialized = true;
  const allowed = [resolve(here, "worker-host.mjs"), ...(message.allowLifecycleFixture === true ? [resolve(here, "fault-worker.fixture.mjs")] : [])];
  if (!allowed.includes(message.bootstrapModule)) throw fail("m1-worker-bootstrap-denied");
  ledger = { phase: message.seed.phase, requestScope: null, observation: {
    ...message.seed, status: "running", native: { calls: [], receipts: [], suites: [] }, authority: { sessionEvents: [] },
    provider: { calls: [], unexpectedCalls: [] }, sources: { indexOperations: [] }, evidence: [],
  }, evidence(source, kind, data) {
    if (!["application", "host-runtime", "host-filesystem", "postgresql", "langgraph", "browser"].includes(source)) throw fail("m1-worker-evidence-source-invalid");
    const evidence = { source, kind, data: ["native-receipt", "fixed-suite"].includes(kind) ? structuredClone(data) : { phase: this.phase, ...structuredClone(data) } };
    this.observation.evidence.push(evidence);
    // Send actual captured data, never a model-generated pass/fail summary. Queue
    // order on inherited IPC preserves evidence before the parent kills us.
    process.send?.({ type: "capture", attemptKey: attemptKey(this.observation), native: this.observation.native,
      sessionEvents: this.observation.authority.sessionEvents, evidence });
    return `child-evidence-${this.observation.evidence.length}`;
  } };
  faults = new AcceptanceFaultController({ getLedger: () => ledger });
  const factory = await import(pathToFileURL(message.bootstrapModule));
  if (typeof factory.createAcceptanceWorkerHost !== "function") throw fail("m1-worker-factory-invalid");
  host = await factory.createAcceptanceWorkerHost(message.initialization, () => ledger, { taskHooks: faults.taskHooks, faults });
  await send({ type: "ready", pid: process.pid, baseUrl: host.baseUrl });
}

async function command(operation, input) {
  if (!host) throw fail("m1-worker-host-not-ready");
  switch (operation) {
    case "capture.phase":
      if (typeof input?.phase !== "string" || input.phase.length > 160) throw fail("m1-worker-phase-invalid");
      ledger.phase = input.phase; ledger.requestScope = structuredClone(input.requestScope); return null;
    case "identity.issue": return host.identities.issue(input);
    case "fixture.bind": await host.bindFixture(input.context, input.item); return null;
    case "project.snapshot": return host.snapshot(input);
    case "sources.selected": return host.m1.sources.selected(input.context, input.sourceIds);
    case "continuity.prepare": return host.continuity.prepareAnswerContext(input);
    case "fault.arm-materialization": faults.armMaterializationHold(input); return null;
    case "fault.wait-materialization": return faults.waitMaterializationHeld();
    case "close": faults.clear(); await host.close(); return { closed: true };
    default: throw fail("m1-worker-command-denied");
  }
}

process.on("message", async message => {
  try {
    if (message?.type === "initialize") { await initialize(message); return; }
    if (message?.type !== "command" || !/^request-\d+$/u.test(message.id ?? "")) throw fail("m1-worker-message-invalid");
    const value = await command(message.operation, message.input);
    await send({ type: "result", id: message.id, ok: true, value });
    if (message.operation === "close") process.disconnect();
  } catch (error) {
    if (message?.type === "command") await send({ type: "result", id: message.id, ok: false, errorCode: safeCode(error) }).catch(() => {});
    else { await send({ type: "fatal", errorCode: safeCode(error) }).catch(() => {}); process.exitCode = 1; process.disconnect?.(); }
  }
});
process.on("disconnect", () => {
  // An abandoned harness cannot leave an application worker listening forever.
  faults?.clear(); host?.close?.().catch(() => {});
  const timer = setTimeout(() => process.exit(1), 1000); timer.unref();
});
