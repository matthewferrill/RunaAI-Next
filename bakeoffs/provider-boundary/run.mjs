import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const upstream = process.env.LMSTUDIO_URL ?? "http://192.168.50.165:1234/v1";
const modelId = process.env.LMSTUDIO_MODEL ?? "qwen3-coder-30b-a3b-instruct";
const timeoutMs = 5000;
const outputRoot = path.resolve("artifacts/runs/stack-bakeoff-provider-v2");
const modes = ["ok", "partial-response", "changed-version", "timeout"];
const repetitions = 5;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
await mkdir(outputRoot, { recursive: true });

const waitForReady = async (port, nonce) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__runa_probe`);
      const body = await response.json();
      if (body.nonce === nonce) return body;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`proxy readiness timeout port=${port}`);
};

const collect = child => new Promise(resolve => {
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
});

const stop = child => new Promise(resolve => {
  if (child.exitCode != null || child.signalCode != null) return resolve();
  let settled = false;
  let forceTimer;
  let giveUpTimer;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(forceTimer);
    clearTimeout(giveUpTimer);
    resolve();
  };
  child.once("close", finish);
  child.kill("SIGTERM");
  if (child.exitCode != null || child.signalCode != null) return finish();
  forceTimer = setTimeout(() => {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  }, 1000);
  giveUpTimer = setTimeout(finish, 2500);
});

const results = [];
let ordinal = 0;
for (const mode of modes) {
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const port = 9100 + ordinal++;
    const runKey = `provider.${mode}#${repetition}`;
    const nonce = `${runKey}-${process.pid}-${Date.now()}`;
    const wirePath = path.join(outputRoot, `${runKey}.wire`);
    await rm(wirePath, { force: true });
    const proxy = spawn(process.execPath, ["probes/wave7/w7-proxy.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, W7_UPSTREAM: upstream, W7_MODE: mode, W7_PORT: String(port),
        W7_WIRELOG: wirePath, W7_NONCE: nonce },
      stdio: ["ignore", "pipe", "pipe"]
    });
    try {
      const ready = await waitForReady(port, nonce);
      const child = spawn(process.execPath, ["bakeoffs/provider-boundary/ask.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, BAKEOFF_BASE_URL: `http://127.0.0.1:${port}/v1`,
          BAKEOFF_MODEL_ID: modelId, BAKEOFF_TIMEOUT_MS: String(timeoutMs) },
        stdio: ["ignore", "pipe", "pipe"]
      });
      const execution = await collect(child);
      await stop(proxy);
      const wire = await readFile(wirePath);
      const entries = wire.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
      const chat = entries.filter(item => item.isChat === true);
      let outcome = null;
      try { outcome = JSON.parse(execution.stdout.trim().split(/\r?\n/).at(-1)); } catch {}
      results.push({ runKey, mode, repetition, port, proxyPid: ready.pid, nonce,
        childCode: execution.code, childSignal: execution.signal, outcome,
        stderr: execution.stderr, wirePath: path.relative(process.cwd(), wirePath).replaceAll("\\", "/"),
        wireSha256: sha256(wire), chatCalls: chat.length, declaredModels: chat.map(item => item.declaredModel),
        finishes: chat.map(item => item.finish) });
      console.log(`${runKey}: ok=${outcome?.ok} elapsed=${outcome?.elapsedMs} calls=${chat.length}`);
    } finally {
      await stop(proxy);
    }
  }
}

const expected = {
  ok: { accepted: true },
  "partial-response": { accepted: false, errorPrefix: "INCOMPLETE_RESPONSE" },
  "changed-version": { accepted: false, errorPrefix: "MODEL_IDENTITY_MISMATCH" },
  timeout: { accepted: false, maxElapsedMs: timeoutMs + 1000 }
};
const checks = results.map(result => {
  const rule = expected[result.mode];
  const accepted = result.outcome?.ok === true;
  const identity = result.mode !== "changed-version" || String(result.outcome?.error).startsWith(rule.errorPrefix);
  const completeness = result.mode !== "partial-response" || String(result.outcome?.error).startsWith(rule.errorPrefix);
  const bounded = result.mode !== "timeout" || Number(result.outcome?.elapsedMs) <= rule.maxElapsedMs;
  const calls = result.chatCalls === 1;
  const verdict = accepted === rule.accepted && identity && completeness && bounded && calls;
  return { runKey: result.runKey, verdict, accepted, identity, completeness, bounded, oneCall: calls };
});
const report = { schemaVersion: 1, preregistration: "STACK-BAKEOFF-PREREGISTRATION.md",
  modelId, upstream, timeoutMs, runs: results, checks,
  passed: checks.filter(item => item.verdict).length, total: checks.length,
  verdict: checks.every(item => item.verdict) ? "LAB-PASS" : "LAB-FAIL" };
await writeFile("probes/results/stack-bakeoff-provider-v2.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.verdict}: ${report.passed}/${report.total}`);
if (report.verdict !== "LAB-PASS") process.exitCode = 1;
