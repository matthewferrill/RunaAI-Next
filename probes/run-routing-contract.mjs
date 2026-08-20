import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prereg = path.join(root, 'ROUTING-CONTRACT-PREREGISTRATION.md');
const runner = fileURLToPath(import.meta.url);
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const hashes = { preregistration: sha256(prereg), runner: sha256(runner) };
const api = process.env.LMSTUDIO_URL || 'http://192.168.50.165:1234';
const models = ['qwen/qwen3-4b', 'qwen3-coder-30b-a3b-instruct', 'qwen3.6-27b-mtp', 'openai/gpt-oss-20b'];
const cases = [
  ['My invoice was charged twice and I need it fixed today.', 'billing', 'high'],
  ['Where can I download a copy of last month\'s invoice?', 'billing', 'normal'],
  ['Where do I change the dashboard color theme?', 'product_help', 'normal'],
  ['How can I export a project as JSON?', 'product_help', 'normal'],
  ['The public API returns 503 for every request from every region.', 'outage', 'critical'],
  ['One API request returned 400 because I omitted a required field.', 'product_help', 'normal'],
  ['Cancel my account immediately; an unauthorized person has access.', 'account', 'high'],
  ['Cancel my subscription at the end of the current term.', 'account', 'normal'],
];
const schema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['billing', 'product_help', 'outage', 'account'] },
    priority: { type: 'string', enum: ['normal', 'high', 'critical'] },
  },
  required: ['category', 'priority'],
  additionalProperties: false,
};
async function json(url, options = {}, timeoutMs = 900000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}
const median = xs => { const values = xs.filter(Number.isFinite).sort((a, b) => a - b); return values.length ? values[Math.floor(values.length / 2)] : null; };
const results = [];
for (const model of models) {
  const arm = { model, cases: [], load: null, unload: null };
  try {
    arm.load = await json(`${api}/api/v1/models/load`, { method: 'POST', body: JSON.stringify({ model, context_length: 8192, flash_attention: true, offload_kv_cache_to_gpu: true, echo_load_config: true }) });
    for (let index = 0; index < cases.length; index++) {
      const [text, category, priority] = cases[index];
      const started = Date.now();
      try {
        const response = await json(`${api}/v1/chat/completions`, { method: 'POST', body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: 'Classify the request using the supplied schema and taxonomy.' }, { role: 'user', content: text }],
          response_format: { type: 'json_schema', json_schema: { name: 'route', strict: true, schema } },
          temperature: 0,
          max_tokens: 96,
          stream: false,
        }) });
        const content = response.choices?.[0]?.message?.content ?? '';
        const parsed = JSON.parse(content);
        const pass = parsed.category === category && parsed.priority === priority && Object.keys(parsed).sort().join(',') === 'category,priority';
        arm.cases.push({ id: index + 1, expected: { category, priority }, parsed, pass, wall_ms: Date.now() - started, generation_tps: response.stats?.tokens_per_second ?? response.choices?.[0]?.stats?.tokens_per_second ?? null });
      } catch (error) {
        arm.cases.push({ id: index + 1, expected: { category, priority }, pass: false, error: error.message, wall_ms: Date.now() - started, generation_tps: null });
      }
    }
  } catch (error) {
    arm.error = error.message;
  } finally {
    try { arm.unload = await json(`${api}/api/v1/models/unload`, { method: 'POST', body: JSON.stringify({ instance_id: arm.load?.instance_id || arm.load?.id || model }) }, 300000); }
    catch (error) { arm.unload_error = error.message; }
  }
  arm.passed_cases = arm.cases.filter(item => item.pass).length;
  arm.median_generation_tps = median(arm.cases.map(item => item.generation_tps));
  arm.pass = arm.passed_cases === 8 && arm.cases.length === 8 && arm.median_generation_tps >= 10 && !arm.error && !arm.unload_error;
  results.push(arm);
  console.log(`${model}: ${arm.passed_cases}/8, ${arm.median_generation_tps ?? 'n/a'} tok/s, ${arm.pass ? 'PASS' : 'FAIL'}`);
}
const passing = results.filter(arm => arm.pass).sort((a, b) => b.median_generation_tps - a.median_generation_tps);
const output = { schema: 1, generated_at: new Date().toISOString(), hashes, results, selected_model: passing[0]?.model ?? null, fallback: passing.length ? null : 'deterministic-application-policy', pass: results.every(arm => arm.cases.length === 8) };
writeFileSync(path.join(root, 'probes', 'results', 'routing-contract.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ selected_model: output.selected_model, fallback: output.fallback, campaign_complete: output.pass }, null, 2));
if (!output.pass) process.exitCode = 1;

