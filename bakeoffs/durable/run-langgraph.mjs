import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const evidenceRoot = path.resolve("../../artifacts/runs/stack-bakeoff-langgraph-v2");
await rm(evidenceRoot, { recursive: true, force: true });
await mkdir(evidenceRoot, { recursive: true });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const exists = file => stat(file).then(() => true, () => false);
const phases = ["before-effect", "after-effect", "before-effect", "after-effect", "after-effect"];

const waitFor = async (predicate, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`timeout waiting for ${label}`);
};

const collect = child => new Promise(resolve => {
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
});

const start = ({ runId, adapter, targetStep, phase, invocation, dbPath }) => {
  const child = spawn(process.execPath, ["langgraph-worker.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DURABLE_EVIDENCE_ROOT: evidenceRoot, DURABLE_RUN_ID: runId,
      DURABLE_ADAPTER: adapter, DURABLE_TARGET_STEP: String(targetStep), DURABLE_PHASE: phase,
      DURABLE_INVOCATION: invocation, DURABLE_DB_PATH: dbPath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.capturedStdout = "";
  child.capturedStderr = "";
  child.stdout.on("data", chunk => { child.capturedStdout += chunk; });
  child.stderr.on("data", chunk => { child.capturedStderr += chunk; });
  return child;
};

const results = [];
for (const adapter of ["raw", "idempotent"]) {
  for (let targetStep = 0; targetStep < phases.length; targetStep++) {
    for (let repetition = 1; repetition <= 5; repetition++) {
      const phase = phases[targetStep];
      const runId = `langgraph-${adapter}-p${targetStep}-${repetition}`;
      const marker = path.join(evidenceRoot, `${runId}.marker`);
      const allow = path.join(evidenceRoot, `${runId}.allow`);
      const dbPath = path.join(evidenceRoot, `${runId}.sqlite`);
      const first = start({ runId, adapter, targetStep, phase, invocation: "initial", dbPath });
      const firstResult = collect(first);
      try {
        await waitFor(async () => {
          if (first.exitCode != null || first.signalCode != null) {
            const ended = await firstResult;
            throw new Error(`initial worker exited before marker: ${ended.stderr || ended.stdout}`);
          }
          return exists(marker);
        }, 30000, `${runId} marker`);
      } catch (error) {
        first.kill("SIGKILL");
        await firstResult;
        throw new Error(`${error.message}\nstdout=${first.capturedStdout}\nstderr=${first.capturedStderr}`);
      }
      first.kill("SIGKILL");
      await firstResult;
      await writeFile(allow, "resume\n");
      const second = start({ runId, adapter, targetStep, phase, invocation: "resume", dbPath });
      const execution = await collect(second);
      if (execution.code !== 0) throw new Error(`resume failed ${runId}: ${execution.stderr || execution.stdout}`);
      const outcome = JSON.parse(execution.stdout.trim().split(/\r?\n/).at(-1));
      const deedLines = (await readFile(path.join(evidenceRoot, "deed.jsonl"), "utf8"))
        .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(item => item.runId === runId);
      const effects = deedLines.filter(item => item.kind === "effect");
      const uniqueEffects = new Set(effects.map(item => item.effectId));
      const result = { runId, adapter, targetStep, phase, terminal: outcome.status,
        completedSteps: outcome.completed?.length ?? 0, historyStates: outcome.historyStates,
        effectAttempts: effects.length, uniqueEffects: uniqueEffects.size,
        duplicateEffects: effects.length - uniqueEffects.size,
        deduplicatedAttempts: deedLines.filter(item => item.kind === "effect-deduplicated").length,
        dbPath: path.relative(process.cwd(), dbPath).replaceAll("\\", "/") };
      results.push(result);
      console.log(`${runId}: terminal=${result.terminal} duplicates=${result.duplicateEffects} history=${result.historyStates}`);
    }
  }
}

const raw = results.filter(item => item.adapter === "raw");
const idempotent = results.filter(item => item.adapter === "idempotent");
const report = {
  schemaVersion: 1,
  candidate: "LangGraph JS 1.4.12 plus SQLite checkpointer 1.0.4",
  raw: { recovered: raw.filter(item => item.terminal === "committed" && item.completedSteps === 5).length,
    runs: raw.length, duplicateRuns: raw.filter(item => item.duplicateEffects > 0).length },
  idempotentAdapter: {
    recovered: idempotent.filter(item => item.terminal === "committed" && item.completedSteps === 5).length,
    runs: idempotent.length, duplicateRuns: idempotent.filter(item => item.duplicateEffects > 0).length,
    historiesPresent: idempotent.filter(item => item.historyStates > 0).length
  },
  results
};
report.rawVerdict = report.raw.recovered === 25 && report.raw.duplicateRuns === 0 ? "LAB-PASS" : "LAB-FAIL";
report.combinedVerdict = report.idempotentAdapter.recovered === 25 &&
  report.idempotentAdapter.duplicateRuns === 0 && report.idempotentAdapter.historiesPresent === 25
  ? "LAB-PASS_WITH_CUSTOM_RESIDUAL" : "LAB-FAIL";
const output = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
await writeFile("../../probes/results/stack-bakeoff-langgraph.json", output);
await writeFile(path.join(evidenceRoot, "report.sha256"), `${sha256(output)}  stack-bakeoff-langgraph.json\n`);
console.log(JSON.stringify({ rawVerdict: report.rawVerdict, combinedVerdict: report.combinedVerdict,
  raw: report.raw, idempotentAdapter: report.idempotentAdapter }));
if (report.combinedVerdict !== "LAB-PASS_WITH_CUSTOM_RESIDUAL") process.exitCode = 1;
