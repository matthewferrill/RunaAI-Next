// Measures decode throughput and, more importantly, whether both GPUs work at once.
//
// Decode is memory-bandwidth-bound rather than compute-bound. Each Quadro RTX 6000 has 672 GB/s, and
// NVLink between them carries ~51.6 GB/s aggregate against ~16 GB/s for PCIe 3.0 x16. Layer-split
// runs one card at a time, so decode sees one card's bandwidth; row-split runs both. That is a
// potential ~2x from configuration rather than hardware.
//
// Throughput alone cannot tell those apart -- a slow model and a half-idle pair look the same.
//
// The utilisation sampling below was intended to discriminate: layer-split alternates between the
// cards, row-split keeps both busy. IT DOES NOT DISCRIMINATE AT THIS SAMPLE RATE, and the measurement
// says so rather than being quietly trusted. At ~72 tok/s the model is traversed roughly 70 times a
// second, so within any 1-second bucket BOTH split modes show both cards active. nvidia-smi on this
// host rejects -lms, so finer sampling is unavailable over this path.
//
// The `concurrency` field below is therefore reported as NOT DISCRIMINATING rather than as a reading.
// What the sampler does establish honestly is that both GPUs are loaded and neither is idle, and the
// asymmetric memory split (17.6 GB against 15.0 GB) is weak evidence FOR layer-split, since row-split
// divides each tensor and tends to balance. The decisive evidence is an A/B throughput comparison.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1";
const MODEL = process.env.BENCH_MODEL || "qwen3-coder-30b-a3b-instruct";
const LABEL = process.argv[2] || "baseline";
const MAX_TOKENS = Number(process.env.BENCH_TOKENS || 400);
const REPS = Number(process.env.BENCH_REPS || 3);
mkdirSync("probes/results", { recursive: true });

// Sample both GPUs continuously in the background. Utilisation is read from the device, not inferred
// from timing, so "both busy" is an observation rather than a deduction.
function startSampler() {
  const samples = [];
  const c = spawn("ssh", ["-o", "BatchMode=yes", "runa-home",
    "nvidia-smi --query-gpu=index,utilization.gpu,memory.used --format=csv,noheader,nounits -l 1"],
    { stdio: ["ignore", "pipe", "ignore"] });
  c.stdout.on("data", (d) => {
    for (const line of String(d).split("\n")) {
      const m = line.trim().match(/^(\d+),\s*(\d+),\s*(\d+)$/);
      if (m) samples.push({ gpu: Number(m[1]), util: Number(m[2]), mem: Number(m[3]), at: Date.now() });
    }
  });
  return { samples, stop: () => { try { c.kill("SIGKILL"); } catch {} } };
}

const gen = async (prompt) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: MAX_TOKENS, temperature: 0 }) });
  const j = await r.json();
  const ms = Date.now() - t0;
  const completion = j?.usage?.completion_tokens ?? 0;
  return { ms, completion, prompt_tokens: j?.usage?.prompt_tokens ?? 0,
    tps: completion > 0 ? completion / (ms / 1000) : 0,
    finish: j?.choices?.[0]?.finish_reason ?? null };
};

console.log(`bench "${LABEL}": ${MODEL} at ${BASE}, ${REPS} reps x ${MAX_TOKENS} tokens`);
// Warm first and discard it. Cold load on this base is 72-107s against ~55ms warm, and folding that
// into a throughput number would describe the disk rather than the split mode.
await gen("Reply with exactly: READY");

const sampler = startSampler();
await new Promise((r) => setTimeout(r, 1500));   // let the sampler produce a few idle rows
const idleCount = sampler.samples.length;

const runs = [];
for (let i = 0; i < REPS; i++) {
  const r = await gen(`Write a detailed technical explanation of how B-tree indexes work in databases. Iteration ${i}.`);
  runs.push(r);
  console.log(`  rep ${i + 1}: ${r.completion} tokens in ${r.ms}ms = ${r.tps.toFixed(1)} tok/s (finish=${r.finish})`);
}
await new Promise((r) => setTimeout(r, 800));
sampler.stop();

// Only samples taken while generation was in flight count. Idle rows before the first request would
// dilute "both busy" toward zero and make any split mode look like layer-split.
const busy = sampler.samples.slice(idleCount);
const byGpu = { 0: busy.filter((s) => s.gpu === 0), 1: busy.filter((s) => s.gpu === 1) };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const active = (rows) => rows.filter((s) => s.util > 20).length;

// Pair samples by timestamp bucket so "both busy at the same moment" is measurable rather than
// "both busy at some point", which layer-split also satisfies.
const buckets = new Map();
for (const s of busy) { const k = Math.floor(s.at / 1000); if (!buckets.has(k)) buckets.set(k, {}); buckets.get(k)[s.gpu] = s.util; }
const paired = [...buckets.values()].filter((b) => b[0] != null && b[1] != null);
const bothBusy = paired.filter((b) => b[0] > 20 && b[1] > 20).length;
const oneBusy = paired.filter((b) => (b[0] > 20) !== (b[1] > 20)).length;

const out = {
  label: LABEL, model: MODEL, endpoint: BASE, reps: REPS, maxTokens: MAX_TOKENS,
  meanTps: mean(runs.map((r) => r.tps)), runs,
  gpu0: { meanUtil: mean(byGpu[0].map((s) => s.util)), activeSamples: active(byGpu[0]), samples: byGpu[0].length,
          meanMemMiB: mean(byGpu[0].map((s) => s.mem)) },
  gpu1: { meanUtil: mean(byGpu[1].map((s) => s.util)), activeSamples: active(byGpu[1]), samples: byGpu[1].length,
          meanMemMiB: mean(byGpu[1].map((s) => s.mem)) },
  pairedSamples: paired.length, bothBusy, oneBusy,
  // The reading this benchmark exists to produce.
  // Deliberately not a verdict: see the note at the top of this file.
  concurrency: "NOT DISCRIMINATING at 1s sampling — the model is traversed ~70x/sec, so both split modes show both cards active",
  bothLoaded: paired.length > 0 && bothBusy > 0,
  memoryAsymmetryMiB: null,
};
writeFileSync(`probes/results/gpu-split-${LABEL}.json`, JSON.stringify(out, null, 1));
console.log(`\nmean throughput: ${out.meanTps.toFixed(1)} tok/s`);
console.log(`gpu0 mean util ${out.gpu0.meanUtil.toFixed(0)}%  mem ${out.gpu0.meanMemMiB.toFixed(0)} MiB   (${out.gpu0.activeSamples}/${out.gpu0.samples} samples >20%)`);
console.log(`gpu1 mean util ${out.gpu1.meanUtil.toFixed(0)}%  mem ${out.gpu1.meanMemMiB.toFixed(0)} MiB   (${out.gpu1.activeSamples}/${out.gpu1.samples} samples >20%)`);
console.log(`paired samples ${out.pairedSamples}: both busy ${bothBusy}, one busy ${oneBusy}`);
out.memoryAsymmetryMiB = Math.abs(out.gpu0.meanMemMiB - out.gpu1.meanMemMiB);
console.log(`concurrency: ${out.concurrency}`);
console.log(`both loaded: ${out.bothLoaded}, memory asymmetry ${out.memoryAsymmetryMiB.toFixed(0)} MiB (row-split tends to balance)`);
console.log(`wrote probes/results/gpu-split-${LABEL}.json`);
