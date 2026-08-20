import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const collector = path.resolve("artifacts/tools/otelcol/bin/otelcol-contrib.exe");
const outputRoot = path.resolve("artifacts/runs/stack-bakeoff-otel");
const tracePath = path.join(outputRoot, "traces.json");
await mkdir(outputRoot, { recursive: true });
await rm(tracePath, { force: true });
const exists = file => stat(file).then(() => true, () => false);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const process_ = spawn(collector, ["--config", "bakeoffs/observability/collector.yaml"], {
  cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"]
});
let collectorError = "";
process_.stderr.on("data", chunk => { collectorError += chunk; });
const waitForExit = child => new Promise(resolve => {
  if (child.exitCode != null || child.signalCode != null) return resolve();
  child.once("close", resolve);
});
try {
  const readyDeadline = Date.now() + 10000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    try {
      const response = await fetch("http://127.0.0.1:9438/v1/traces", { method: "POST",
        headers: { "content-type": "application/json" }, body: "{}" });
      if (response.status < 500) { ready = true; break; }
    } catch {}
    if (process_.exitCode != null) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error(`collector readiness failed: ${collectorError}`);

  const runIds = [];
  for (let repetition = 1; repetition <= 5; repetition++) {
    const runId = `otel-exit-${repetition}-${Date.now()}`;
    runIds.push(runId);
    const sender = spawn(process.execPath, ["bakeoffs/observability/send-trace.mjs"], {
      cwd: process.cwd(), env: { ...process.env, OTEL_RUN_ID: runId }, stdio: ["ignore", "pipe", "pipe"]
    });
    const code = await new Promise(resolve => sender.once("close", resolve));
    if (code !== 0) throw new Error(`trace sender failed repetition=${repetition}`);
  }
  const deadline = Date.now() + 10000;
  let text = "";
  while (Date.now() < deadline) {
    if (await exists(tracePath)) {
      text = await readFile(tracePath, "utf8");
      if (runIds.every(runId => text.includes(runId))) break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const requiredKeys = ["run.id", "run.attempt", "component", "deadline.ms", "terminal.state", "deed.reference"];
  const report = { schemaVersion: 1, candidate: "OpenTelemetry Collector contrib 0.159.0",
    sendersExited: 5, tracesRetained: runIds.filter(runId => text.includes(runId)).length,
    requiredKeysPresent: requiredKeys.filter(key => text.includes(key)),
    forbiddenPromptAbsent: !text.includes("FORBIDDEN_RAW_PROMPT_7cfc0ca8"),
    forbiddenSecretAbsent: !text.includes("FORBIDDEN_SECRET_bfb9cc36"),
    traceFileSha256: sha256(Buffer.from(text)) };
  report.passed = report.tracesRetained === 5 && report.requiredKeysPresent.length === requiredKeys.length &&
    report.forbiddenPromptAbsent && report.forbiddenSecretAbsent;
  await writeFile("probes/results/stack-bakeoff-otel.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} finally {
  process_.kill("SIGTERM");
  const timer = setTimeout(() => process_.kill("SIGKILL"), 1000);
  await waitForExit(process_);
  clearTimeout(timer);
}
