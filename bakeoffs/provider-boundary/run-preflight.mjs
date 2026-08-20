import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const outputRoot = path.resolve("artifacts/runs/stack-bakeoff-preflight");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const collect = child => new Promise(resolve => {
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
});
const stop = child => new Promise(resolve => {
  if (child.exitCode != null || child.signalCode != null) return resolve();
  const timer = setTimeout(resolve, 2500);
  child.once("close", () => { clearTimeout(timer); resolve(); });
  child.kill("SIGTERM");
});
const results = [];
const oversizedPath = path.join(outputRoot, "oversized-prompt.txt");
await writeFile(oversizedPath, "x".repeat(1_080_016));
for (let repetition = 1; repetition <= 5; repetition++) {
  const port = 9300 + repetition;
  const nonce = `preflight-${repetition}-${process.pid}-${Date.now()}`;
  const wirePath = path.join(outputRoot, `preflight-${repetition}.wire`);
  const proxy = spawn(process.execPath, ["probes/wave7/w7-proxy.mjs"], { cwd: process.cwd(),
    env: { ...process.env, W7_MODE: "ok", W7_PORT: String(port), W7_WIRELOG: wirePath, W7_NONCE: nonce },
    stdio: ["ignore", "pipe", "pipe"] });
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/__runa_probe`);
        if ((await response.json()).nonce === nonce) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!ready) throw new Error(`proxy readiness failed repetition=${repetition}`);
    for (const family of ["healthy", "oversized"]) {
      const promptEnv = family === "healthy"
        ? { BAKEOFF_PROMPT: "Reply with exactly READY." }
        : { BAKEOFF_PROMPT_FILE: oversizedPath };
      const child = spawn(process.execPath, ["bakeoffs/provider-boundary/preflight-ask.mjs"], {
        cwd: process.cwd(), env: { ...process.env, BAKEOFF_BASE_URL: `http://127.0.0.1:${port}/v1`,
          ...promptEnv, BAKEOFF_MAX_INPUT_BYTES: "65536" }, stdio: ["ignore", "pipe", "pipe"]
      });
      const execution = await collect(child);
      const outcome = JSON.parse(execution.stdout.trim().split(/\r?\n/).at(-1));
      const wire = await readFile(wirePath);
      const chatCalls = wire.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
        .filter(item => item.isChat === true).length;
      results.push({ family, repetition, outcome, cumulativeChatCalls: chatCalls,
        wirePath: path.relative(process.cwd(), wirePath).replaceAll("\\", "/"), wireSha256: sha256(wire) });
    }
  } finally { await stop(proxy); }
}
const healthy = results.filter(item => item.family === "healthy");
const oversized = results.filter(item => item.family === "oversized");
const report = { schemaVersion: 1, candidate: "application UTF-8 byte preflight + AI SDK",
  healthyAccepted: healthy.filter(item => item.outcome.ok && item.outcome.transmitted).length,
  oversizedRejectedBeforeWire: oversized.filter(item => item.outcome.error === "INPUT_BYTES_EXCEEDED" &&
    item.outcome.transmitted === false && item.cumulativeChatCalls === 1).length,
  runs: results };
report.passed = report.healthyAccepted === 5 && report.oversizedRejectedBeforeWire === 5;
await writeFile("probes/results/stack-bakeoff-preflight.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, healthyAccepted: report.healthyAccepted,
  oversizedRejectedBeforeWire: report.oversizedRejectedBeforeWire }));
if (!report.passed) process.exitCode = 1;
