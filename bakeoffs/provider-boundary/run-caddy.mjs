import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const caddy = path.resolve("artifacts/tools/caddy/bin/caddy.exe");
const outputRoot = path.resolve("artifacts/runs/stack-bakeoff-caddy");
const wirePath = path.join(outputRoot, "timeout.wire");
await mkdir(outputRoot, { recursive: true });
await rm(wirePath, { force: true });
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
  setTimeout(() => { if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL"); }, 1000);
});
const nonce = `caddy-${process.pid}-${Date.now()}`;
const proxy = spawn(process.execPath, ["probes/wave7/w7-proxy.mjs"], {
  cwd: process.cwd(), env: { ...process.env, W7_MODE: "timeout", W7_PORT: "9201",
    W7_WIRELOG: wirePath, W7_NONCE: nonce }, stdio: ["ignore", "pipe", "pipe"]
});
const caddyProcess = spawn(caddy, ["run", "--config", "bakeoffs/provider-boundary/Caddyfile",
  "--adapter", "caddyfile"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
try {
  const deadline = Date.now() + 10000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:9200/__runa_probe");
      const body = await response.json();
      if (body.nonce === nonce) { ready = true; break; }
    } catch {}
    if (proxy.exitCode != null || caddyProcess.exitCode != null) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error("Caddy/proxy readiness failed");
  const child = spawn(process.execPath, ["bakeoffs/provider-boundary/ask.mjs"], {
    cwd: process.cwd(), env: { ...process.env, BAKEOFF_BASE_URL: "http://127.0.0.1:9200/v1",
      BAKEOFF_TIMEOUT_MS: "5000" }, stdio: ["ignore", "pipe", "pipe"]
  });
  const execution = await collect(child);
  const outcome = JSON.parse(execution.stdout.trim().split(/\r?\n/).at(-1));
  const wire = await readFile(wirePath);
  const entries = wire.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const chatCalls = entries.filter(item => item.isChat === true).length;
  const report = { schemaVersion: 1, candidate: "Caddy 2.11.4",
    config: "bakeoffs/provider-boundary/Caddyfile", outcome, chatCalls,
    wirePath: path.relative(process.cwd(), wirePath).replaceAll("\\", "/"), wireSha256: sha256(wire),
    passed: outcome.ok === false && outcome.elapsedMs <= 3000 && chatCalls === 1 };
  await writeFile("probes/results/stack-bakeoff-caddy.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await Promise.all([stop(caddyProcess), stop(proxy)]);
}
