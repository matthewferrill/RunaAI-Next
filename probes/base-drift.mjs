// Records a comparable fingerprint of the RUNA-HOME endpoint so a base change can be detected rather
// than assumed. The manifest's hardwareProfile covers the probe host only and says so; this is the
// "record separately if the endpoint host differs" the manifest itself asks for.
//
// The embedding digest is the sharpest signal: the same input yields the same vector only while the
// model, quantization and runtime are unchanged. Generation samples are recorded too, but generation
// is stochastic, so they are evidence of gross change, never of sameness.
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = process.env.LMSTUDIO_URL || "http://192.168.50.165:1234/v1";
const MODEL = process.env.LMSTUDIO_MODEL || "qwen3-coder-30b-a3b-instruct";
const EMBED = "text-embedding-nomic-embed-text-v1.5";
const LABEL = process.argv[2] || "snapshot";
const { createHash } = await import("node:crypto");

const j = async (path, body) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : {});
  return { ms: Date.now() - t0, status: r.status, body: await r.json().catch(() => null) };
};

const out = { label: LABEL, endpoint: BASE, model: MODEL, embed: EMBED };

// Runtime state, added after finding a hole this file could not see. Just-in-time loading is enabled
// and the coder carries a one-hour idle TTL, so a model that idles out and is reloaded by an ordinary
// probe request returns at whatever JIT chooses rather than the configured value -- RunaAI's
// model-residency notes record this exact model coming back at 16,384 after being set to 65,536.
// Embedding digests and short generations are both insensitive to context length, so a wave could
// have run partly at one context and partly at another and nothing here would have shown it.
try {
  const nat = await fetch(`${BASE.replace(/\/v1$/, "")}/api/v0/models`).then((r) => r.json());
  out.runtime = (nat?.data ?? []).map((m) => ({ id: m.id, state: m.state, quantization: m.quantization ?? null,
    loadedContext: m.loaded_context_length ?? null, maxContext: m.max_context_length ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
} catch (e) { out.runtime = { error: String(e.message).slice(0, 120) }; }
const models = await j("/models");
out.models = (models.body?.data || []).map((m) => m.id).sort();
out.modelsStatus = models.status;

// Fixed embedding inputs. Identical vectors across snapshots means the embedding model is unchanged.
out.embeddings = [];
for (const text of ["the frozen base", "ORCHID-5501", "a partially built index"]) {
  const e = await j("/embeddings", { model: EMBED, input: text });
  const v = e.body?.data?.[0]?.embedding;
  out.embeddings.push({ text, ms: e.ms, dim: v?.length ?? null,
    digest: v ? createHash("sha256").update(Buffer.from(Float32Array.from(v).buffer)).digest("hex").slice(0, 32) : null,
    first3: v ? v.slice(0, 3) : null });
}

// Generation samples at temperature 0. Not deterministic in general, but a gross change in length,
// latency or content is a signal worth having on both sides of the hardware change.
out.generations = [];
for (const prompt of ["Reply with exactly: READY", "Name the capital of France in one word.",
                      "Write the text 'abcdefghijklmnop' and nothing else."]) {
  for (let rep = 1; rep <= 2; rep++) {
    const g = await j("/chat/completions", { model: MODEL, temperature: 0, max_tokens: 40,
      messages: [{ role: "user", content: prompt }] });
    out.generations.push({ prompt, rep, ms: g.ms, status: g.status,
      text: String(g.body?.choices?.[0]?.message?.content ?? "").slice(0, 120),
      finish: g.body?.choices?.[0]?.finish_reason ?? null,
      usage: g.body?.usage ?? null });
  }
}
mkdirSync("probes/results", { recursive: true });
const path = `probes/results/base-drift-${LABEL}.json`;
writeFileSync(path, JSON.stringify(out, null, 1));
console.log(`wrote ${path}`);
console.log("models:", out.models.join(", "));
for (const e of out.embeddings) console.log(`  embed "${e.text}" dim=${e.dim} digest=${e.digest} ${e.ms}ms`);
for (const g of out.generations) console.log(`  gen[${g.rep}] "${g.prompt.slice(0, 34)}" -> "${g.text.replace(/\n/g, " ").slice(0, 40)}" ${g.ms}ms ${JSON.stringify(g.usage)}`);
if (Array.isArray(out.runtime)) for (const r of out.runtime) console.log(`  runtime ${r.id.padEnd(40)} ${r.state} quant=${r.quantization} ctx=${r.loadedContext}/${r.maxContext}`);
