// Self-tests for the deterministic stub provider.
//
// A stub that silently differs from the real endpoint would make every result measured against it a
// fiction, so it is treated as an instrument: it must be shown to be deterministic, to be a genuine
// drop-in for a real Mastra agent, and to be fast enough that the speed claim is measured rather than
// asserted.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { gate, waitReady } from "./instrument.mjs";

const PORT = 8991;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const g = gate("stub provider");

const RULES = JSON.stringify([
  { match: "capital of France", reply: "Paris" },
  { match: "truncate me", reply: "half an ans", finish: "length" },
]);
const srv = spawn(process.execPath, ["probes/stub-provider.mjs"],
  { env: { ...process.env, STUB_PORT: String(PORT), STUB_RULES: RULES }, stdio: ["ignore", "ignore", "inherit"] });
const ready = await waitReady(async () => (await fetch(`${BASE}/models`)).ok, { tries: 40, gapMs: 100, label: "stub" });
g.check("stub comes up", ready.ready, `ready in ${ready.waitedMs}ms after ${ready.attempts} attempts`);

const chat = (text) => fetch(`${BASE}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "stub-deterministic-v1", messages: [{ role: "user", content: text }] }) }).then((r) => r.json());
const embed = (input) => fetch(`${BASE}/embeddings`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "stub-embed-v1", input }) }).then((r) => r.json());

// --- determinism, which is the whole point ----------------------------------------------------------
const a1 = await chat("what is the frozen base");
const a2 = await chat("what is the frozen base");
const b1 = await chat("something else entirely");
g.check("identical prompts give identical completions",
  a1.choices[0].message.content === a2.choices[0].message.content, a1.choices[0].message.content);
g.check("different prompts give different completions",
  a1.choices[0].message.content !== b1.choices[0].message.content,
  `${a1.choices[0].message.content} vs ${b1.choices[0].message.content}`);

const e1 = await embed("the frozen base");
const e2 = await embed("the frozen base");
const dig = (v) => createHash("sha256").update(Buffer.from(Float32Array.from(v).buffer)).digest("hex").slice(0, 16);
g.check("identical inputs give identical embeddings",
  dig(e1.data[0].embedding) === dig(e2.data[0].embedding), `digest ${dig(e1.data[0].embedding)}`);
g.check("embeddings are the configured dimension", e1.data[0].embedding.length === 768, `dim=${e1.data[0].embedding.length}`);
const eBatch = await embed(["one", "two", "three"]);
g.check("batched embeddings return one vector per input", eBatch.data.length === 3, `n=${eBatch.data.length}`);

// --- rules, so a scenario can script an outcome without editing the stub -----------------------------
const paris = await chat("Name the capital of France in one word.");
g.check("a matching rule overrides the default reply", paris.choices[0].message.content === "Paris", paris.choices[0].message.content);
const trunc = await chat("please truncate me");
g.check("a rule can script a truncated finish_reason",
  trunc.choices[0].finish_reason === "length", `finish=${trunc.choices[0].finish_reason}`);

// --- the decisive check: a real Mastra agent must run against it unchanged ---------------------------
// If the stub is not a drop-in, every framework result measured against it describes the stub rather
// than the framework.
const { Agent } = await import("@mastra/core/agent");
const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
const lm = createOpenAICompatible({ name: "stub", baseURL: BASE });
const agent = new Agent({ name: "stubtest", instructions: "You are a helpful assistant.", model: lm("stub-deterministic-v1") });
let agentText = "", agentErr = null;
try { agentText = String((await agent.generate("Name the capital of France in one word.")).text ?? ""); }
catch (e) { agentErr = String(e.message).slice(0, 160); }
g.check("a real Mastra agent runs against the stub unchanged",
  agentText === "Paris", agentErr ? `threw: ${agentErr}` : `agent returned "${agentText}"`);

// --- speed, measured rather than asserted ------------------------------------------------------------
// The claim justifying this item is that framework questions stop paying model latency. Warm calls to
// the real endpoint measured ~55ms and a cold load 72-107s; anything here above a few ms is not worth
// the swap, so the number is recorded rather than described.
const t0 = Date.now();
for (let i = 0; i < 50; i++) await chat(`speed probe ${i}`);
const per = (Date.now() - t0) / 50;
g.check("a completion costs single-digit milliseconds", per < 10, `${per.toFixed(2)}ms per call over 50 calls`);

srv.kill("SIGKILL");
const { failed } = g.report();
process.exit(failed ? 1 : 0);
