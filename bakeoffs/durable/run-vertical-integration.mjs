import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { startPostgres } from '../fray4-capability/lab-services.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const outputRoot = path.join(root, 'artifacts', 'runs', 'vertical-integration');
const tracePath = path.join(outputRoot, 'traces.json');
const wirePath = path.join(outputRoot, 'provider-wire.jsonl');
const qdrantStorage = path.join(outputRoot, 'qdrant-storage');
const qdrantExe = path.join(root, 'artifacts', 'tools', 'qdrant', 'bin', 'qdrant.exe');
const collectorExe = path.join(root, 'artifacts', 'tools', 'otelcol', 'bin', 'otelcol-contrib.exe');
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

const startLogged = (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: options.cwd ?? root, env: { ...process.env, ...options.env },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.log = '';
  child.stdout.on('data', chunk => { child.log += chunk; });
  child.stderr.on('data', chunk => { child.log += chunk; });
  return child;
};
const stop = async child => {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
};
const waitReady = async (url, child, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok || response.status < 500) return; } catch {}
    if (child.exitCode != null) throw new Error(`service exited before readiness: ${child.log.slice(-2000)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`readiness timeout ${url}: ${child.log.slice(-2000)}`);
};
const request = async (method, url, body) => {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};
const runWorker = (phase, attempt, commonEnv) => new Promise((resolve, reject) => {
  const child = startLogged(process.execPath, ['vertical-integration-worker.mjs'], { cwd: import.meta.dirname,
    env: { ...commonEnv, INTEGRATION_PHASE: phase, INTEGRATION_ATTEMPT: String(attempt) } });
  child.once('close', code => {
    if (code !== 0) return reject(new Error(`${phase} worker failed ${code}: ${child.log.slice(-4000)}`));
    try { resolve(JSON.parse(child.log.trim().split(/\r?\n/).filter(Boolean).at(-1))); }
    catch (error) { reject(new Error(`${phase} result parse failed: ${error.message}; ${child.log.slice(-2000)}`)); }
  });
});

let postgres, qdrant, collector, stub, pool;
try {
  postgres = await startPostgres();
  qdrant = startLogged(qdrantExe, [], { env: { QDRANT__SERVICE__HOST: '127.0.0.1',
    QDRANT__SERVICE__HTTP_PORT: '9493', QDRANT__SERVICE__GRPC_PORT: '9494',
    QDRANT__STORAGE__STORAGE_PATH: qdrantStorage, QDRANT__LOG_LEVEL: 'WARN' } });
  collector = startLogged(collectorExe, ['--config', 'bakeoffs/observability/collector-integration.yaml']);
  const rules = JSON.stringify([{ match: 'approved transfer', reply: '{"intent":"transfer","amount":11,"destination":"vault"}' }]);
  stub = startLogged(process.execPath, ['probes/stub-provider.mjs'], { env: { STUB_PORT: '9490',
    STUB_MODEL: 'stub-deterministic-v1', STUB_RULES: rules, STUB_LOG: wirePath } });
  await Promise.all([waitReady('http://127.0.0.1:9493/healthz', qdrant),
    waitReady('http://127.0.0.1:9490/v1/models', stub),
    waitReady('http://127.0.0.1:9498/v1/traces', collector)]);
  await request('PUT', 'http://127.0.0.1:9493/collections/vertical_policy', { vectors: { size: 4, distance: 'Cosine' } });
  const policyText = 'approved-transfer: amount 11 may be transferred to vault';
  await request('PUT', 'http://127.0.0.1:9493/collections/vertical_policy/points?wait=true', { points: [{ id: 1,
    vector: [1, 0, 0, 0], payload: { policy: 'approved-transfer', sha256: sha256(policyText) } }] });
  const commonEnv = { INTEGRATION_RUN_ID: 'vertical-run-1', INTEGRATION_THREAD_ID: 'vertical-thread-1',
    INTEGRATION_PG_URL: postgres.connectionString, INTEGRATION_QDRANT_URL: 'http://127.0.0.1:9493',
    INTEGRATION_PROVIDER_URL: 'http://127.0.0.1:9490/v1', INTEGRATION_OTEL_URL: 'http://127.0.0.1:9498/v1/traces' };
  const initial = await runWorker('initial', 1, commonEnv);
  const resumed = await runWorker('resume', 2, commonEnv);
  const replay = await runWorker('replay', 3, commonEnv);
  pool = new pg.Pool({ connectionString: postgres.connectionString });
  const [counts, mastraTables, checkpointRows] = await Promise.all([
    pool.query(`SELECT (SELECT count(*)::int FROM fray4.capabilities) capabilities,
      (SELECT count(*)::int FROM fray4.effect_outbox) outbox,
      (SELECT count(*)::int FROM fray4.effect_deeds) deeds`),
    pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE lower(table_name) LIKE 'mastra%'") ,
    pool.query("SELECT count(*)::int n FROM checkpoints WHERE thread_id='vertical-thread-1'"),
  ]);
  const dbCounts = counts.rows[0];
  const deadline = Date.now() + 10000;
  let traces = '';
  while (Date.now() < deadline) {
    if (existsSync(tracePath)) {
      traces = await readFile(tracePath, 'utf8');
      if ([1,2,3].every(n => traces.includes(`run.attempt`) && traces.includes(`vertical-run-1`))) break;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const wire = existsSync(wirePath) ? (await readFile(wirePath, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
  const chatCalls = wire.filter(item => String(item.url).endsWith('/chat/completions')).length;
  const checks = {
    initialPaused: initial.terminal === 'paused-before-governed-effect' && initial.counts.deeds === 0,
    resumedCommitted: resumed.terminal === 'committed' && resumed.deedRef === 'vertical-effect',
    replayExactlyOnce: replay.terminal === 'committed' && dbCounts.capabilities === 1 && dbCounts.outbox === 1 && dbCounts.deeds === 1,
    providerOnce: chatCalls === 1,
    typedAgentAndRetrieval: JSON.parse(initial.result.agentText).intent === 'transfer' && initial.result.retrievedId === 1,
    postgresOnlyDurability: mastraTables.rows[0].n === 0 && checkpointRows.rows[0].n >= 3,
    tracesRetained: traces.includes('vertical-run-1') && traces.includes('run.attempt') && traces.includes('deed.reference'),
    tracesRedacted: !traces.includes('Prepare the approved transfer') && !traces.includes('FORBIDDEN_VERTICAL_SECRET'),
  };
  const report = { schemaVersion: 1, candidate: 'selected vertical RunaLab stack', initial, resumed, replay,
    database: { ...dbCounts, mastraTables: mastraTables.rows[0].n, checkpointRows: checkpointRows.rows[0].n },
    providerChatCalls: chatCalls, traceSha256: sha256(traces), checks, passed: Object.values(checks).every(Boolean) };
  await writeFile(path.join(root, 'probes', 'results', 'vertical-integration.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, checks, database: report.database, providerChatCalls: chatCalls }));
  if (!report.passed) process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {});
  await Promise.all([stop(stub), stop(collector), stop(qdrant)]);
  await postgres?.stop().catch(() => {});
}

