import { TestWorkflowEnvironment } from "@temporalio/testing";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const evidenceRoot = path.resolve("../../artifacts/runs/stack-bakeoff-temporal-v2");
await rm(evidenceRoot, { recursive: true, force: true });
await mkdir(evidenceRoot, { recursive: true });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const exists = async file => stat(file).then(() => true, () => false);
const phases = ["before-effect", "after-effect", "before-effect", "after-effect", "after-effect"];

const waitFor = async (predicate, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`timeout waiting for ${label}`);
};

const waitForExit = child => new Promise(resolve => {
  if (child.exitCode != null || child.signalCode != null) return resolve();
  child.once("close", resolve);
});

const activeWorkers = new Set();
const startWorker = ({ address, namespace, taskQueue }) => {
  const child = spawn(process.execPath, ["temporal-worker.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, TEMPORAL_ADDRESS: address, TEMPORAL_NAMESPACE: namespace,
      TEMPORAL_TASK_QUEUE: taskQueue, DURABLE_EVIDENCE_ROOT: evidenceRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.capturedStdout = "";
  child.capturedStderr = "";
  child.stdout.on("data", chunk => { child.capturedStdout += chunk; });
  child.stderr.on("data", chunk => { child.capturedStderr += chunk; });
  activeWorkers.add(child);
  child.once("close", () => activeWorkers.delete(child));
  return child;
};

const environment = await TestWorkflowEnvironment.createLocal();
const address = environment.connection.options.address;
const results = [];
try {
  for (const adapter of ["raw", "idempotent"]) {
    for (let targetStep = 0; targetStep < phases.length; targetStep++) {
      for (let repetition = 1; repetition <= 5; repetition++) {
        const phase = phases[targetStep];
        const runId = `temporal-${adapter}-p${targetStep}-${repetition}`;
        const taskQueue = `runalab-${runId}`;
        const marker = path.join(evidenceRoot, `${runId}.marker`);
        const allow = path.join(evidenceRoot, `${runId}.allow`);
        const firstWorker = startWorker({ address, namespace: environment.namespace, taskQueue });
        const handle = await environment.client.workflow.start("durableWorkflow", {
          taskQueue,
          workflowId: runId,
          args: [{ runId, targetStep, phase, adapter }]
        });
        await waitFor(async () => {
          if (firstWorker.exitCode != null || firstWorker.signalCode != null) {
            throw new Error(`worker exited before marker code=${firstWorker.exitCode} signal=${firstWorker.signalCode}\n${firstWorker.capturedStderr}`);
          }
          return exists(marker);
        }, 15000, `${runId} interruption marker`);
        firstWorker.kill("SIGKILL");
        await waitForExit(firstWorker);
        await writeFile(allow, "resume\n");
        const secondWorker = startWorker({ address, namespace: environment.namespace, taskQueue });
        let outcome;
        try {
          outcome = await Promise.race([
            handle.result(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("workflow result timeout")), 20000))
          ]);
        } finally {
          secondWorker.kill("SIGKILL");
          await waitForExit(secondWorker);
        }
        const history = await handle.fetchHistory();
        const deedLines = (await readFile(path.join(evidenceRoot, "deed.jsonl"), "utf8"))
          .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(item => item.runId === runId);
        const effects = deedLines.filter(item => item.kind === "effect");
        const uniqueEffects = new Set(effects.map(item => item.effectId));
        const result = { runId, adapter, targetStep, phase,
          terminal: outcome?.status ?? null, completedSteps: outcome?.completed?.length ?? 0,
          effectAttempts: effects.length, uniqueEffects: uniqueEffects.size,
          duplicateEffects: effects.length - uniqueEffects.size,
          deduplicatedAttempts: deedLines.filter(item => item.kind === "effect-deduplicated").length,
          historyEvents: history.events?.length ?? 0 };
        results.push(result);
        console.log(`${runId}: terminal=${result.terminal} duplicates=${result.duplicateEffects} history=${result.historyEvents}`);
      }
    }
  }
} finally {
  for (const worker of activeWorkers) worker.kill("SIGKILL");
  await Promise.all([...activeWorkers].map(waitForExit));
  await environment.teardown();
}

const raw = results.filter(item => item.adapter === "raw");
const idempotent = results.filter(item => item.adapter === "idempotent");
const report = {
  schemaVersion: 1,
  candidate: "Temporal TypeScript 1.22.0",
  temporalServer: "1.31.2 ephemeral local server",
  raw: {
    recovered: raw.filter(item => item.terminal === "committed" && item.completedSteps === 5).length,
    runs: raw.length,
    duplicateRuns: raw.filter(item => item.duplicateEffects > 0).length
  },
  idempotentAdapter: {
    recovered: idempotent.filter(item => item.terminal === "committed" && item.completedSteps === 5).length,
    runs: idempotent.length,
    duplicateRuns: idempotent.filter(item => item.duplicateEffects > 0).length,
    historiesPresent: idempotent.filter(item => item.historyEvents > 0).length
  },
  results
};
report.rawVerdict = report.raw.recovered === 25 && report.raw.duplicateRuns === 0 ? "LAB-PASS" : "LAB-FAIL";
report.combinedVerdict = report.idempotentAdapter.recovered === 25 &&
  report.idempotentAdapter.duplicateRuns === 0 && report.idempotentAdapter.historiesPresent === 25
  ? "LAB-PASS_WITH_CUSTOM_RESIDUAL" : "LAB-FAIL";
const output = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
await writeFile("../../probes/results/stack-bakeoff-temporal.json", output);
await writeFile(path.join(evidenceRoot, "report.sha256"), `${sha256(output)}  stack-bakeoff-temporal.json\n`);
console.log(JSON.stringify({ rawVerdict: report.rawVerdict, combinedVerdict: report.combinedVerdict,
  raw: report.raw, idempotentAdapter: report.idempotentAdapter }));
if (report.combinedVerdict !== "LAB-PASS_WITH_CUSTOM_RESIDUAL") process.exitCode = 1;
