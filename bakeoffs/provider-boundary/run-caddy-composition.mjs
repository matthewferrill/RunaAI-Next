import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const caddy = path.join(root, 'artifacts', 'tools', 'caddy', 'bin', 'caddy.exe');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let mode = 'healthy';
let chatCalls = 0;
const completion = JSON.stringify({ id: 'caddy-composition', object: 'chat.completion', created: 0,
  model: 'stub-deterministic-v1', choices: [{ index: 0, message: { role: 'assistant', content: 'READY' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
const upstream = createServer(async (req, res) => {
  if (req.url === '/__runa_probe') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ready":true}'); return; }
  for await (const _ of req) {}
  chatCalls += 1;
  if (mode === 'slow-header' || mode === 'never') await wait(3500);
  if (mode === 'never') return;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (mode === 'slow-body') {
    const cut = Math.floor(completion.length / 2);
    res.write(completion.slice(0, cut));
    await wait(3500);
    res.end(completion.slice(cut));
  } else res.end(completion);
});
await new Promise((resolve, reject) => { upstream.once('error', reject); upstream.listen(9201, '127.0.0.1', resolve); });
const caddyProcess = spawn(caddy, ['run', '--config', 'bakeoffs/provider-boundary/Caddyfile', '--adapter', 'caddyfile'],
  { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let caddyLog = '';
caddyProcess.stdout.on('data', chunk => { caddyLog += chunk; });
caddyProcess.stderr.on('data', chunk => { caddyLog += chunk; });
const stop = async child => {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('close', resolve)), wait(3000)]);
  if (child.exitCode == null) child.kill('SIGKILL');
};
const readyDeadline = Date.now() + 10000;
while (Date.now() < readyDeadline) {
  try { if ((await fetch('http://127.0.0.1:9200/__runa_probe')).ok) break; } catch {}
  if (caddyProcess.exitCode != null) throw new Error(`Caddy exited: ${caddyLog}`);
  await wait(100);
}

const collect = child => new Promise(resolve => {
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('close', code => resolve({ code, stdout, stderr }));
});
const cases = [
  { id: 'slow-header-proxy-budget', mode: 'slow-header', appMs: 5000, minMs: 1500, maxMs: 3200 },
  { id: 'slow-body-proxy-budget', mode: 'slow-body', appMs: 5000, minMs: 1500, maxMs: 3200 },
  { id: 'application-budget-precedes-proxy', mode: 'never', appMs: 1000, minMs: 700, maxMs: 2100 },
];
const results = [];
try {
  for (const test of cases) {
    mode = test.mode;
    const callsBefore = chatCalls;
    const child = spawn(process.execPath, ['bakeoffs/provider-boundary/ask.mjs'], { cwd: root, windowsHide: true,
      env: { ...process.env, BAKEOFF_BASE_URL: 'http://127.0.0.1:9200/v1', BAKEOFF_MODEL_ID: 'stub-deterministic-v1',
        BAKEOFF_TIMEOUT_MS: String(test.appMs) }, stdio: ['ignore', 'pipe', 'pipe'] });
    const execution = await collect(child);
    let outcome = null;
    try { outcome = JSON.parse(execution.stdout.trim().split(/\r?\n/).at(-1)); } catch {}
    const callDelta = chatCalls - callsBefore;
    const elapsed = Number(outcome?.elapsedMs);
    const pass = outcome?.ok === false && callDelta === 1 && elapsed >= test.minMs && elapsed <= test.maxMs;
    results.push({ ...test, outcome, callDelta, pass, stderr: execution.stderr });
  }
  const report = { schemaVersion: 1, candidate: 'Caddy 2.11.4 plus AI SDK total budget', results,
    passed: results.every(item => item.pass) };
  await writeFile(path.join(root, 'probes', 'results', 'stack-bakeoff-caddy-composition.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} finally {
  await stop(caddyProcess);
  await new Promise(resolve => upstream.close(resolve));
}

