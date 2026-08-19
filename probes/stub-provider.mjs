// Deterministic stub provider — an OpenAI-compatible endpoint with no model behind it.
//
// Seven waves measured the stack and the model together, and the frays split four/one/one: timeout,
// completeness, recoverability and identity are stack properties, while fabrication and injection are
// model-mediated. Every stack question paid full model latency and carried model variance it did not
// need. This removes both.
//
// Same input always produces the same output, derived from a hash of the request, so a run is
// reproducible on any machine with no endpoint at all. Point LMSTUDIO_URL at it and the rest of the
// harness is unchanged.
//
// What it is NOT: a model. Anything asking whether the model fabricates, follows an injected
// instruction, or notices a truncated answer must run against a real endpoint. This isolates the
// framework, and using it for a model question would answer that question with a scripted string.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const PORT = Number(process.env.STUB_PORT || 8990);
const DIM = Number(process.env.STUB_DIM || 768);
const MODEL_ID = process.env.STUB_MODEL || "stub-deterministic-v1";
const LOG = process.env.STUB_LOG || "";
const LATENCY_MS = Number(process.env.STUB_LATENCY_MS || 0);

// Rules let a scenario script the response without changing this file:
//   [{ "match": "capital of France", "reply": "Paris" },
//    { "match": "write a note", "tool": { "name": "write_note", "args": { "path": "a.txt" } } },
//    { "match": "truncate me", "reply": "half an ans", "finish": "length" }]
let RULES = [];
try { RULES = JSON.parse(process.env.STUB_RULES || "[]"); } catch { RULES = []; }

const hash = (s) => createHash("sha256").update(String(s)).digest();
const log = (o) => { if (LOG) { import("node:fs").then((fs) => fs.appendFileSync(LOG, JSON.stringify(o) + "\n")); } };

// A deterministic unit-ish vector from the text. Identical input gives identical bytes, so an
// embedding digest is stable across machines and runs -- which is what makes a retrieval or memory
// test reproducible without an embedding service.
function embed(text) {
  const out = new Array(DIM);
  let h = hash(text), idx = 0;
  for (let i = 0; i < DIM; i++) {
    if (idx >= h.length - 1) { h = hash(Buffer.concat([h, Buffer.from([i & 0xff])])); idx = 0; }
    out[i] = ((h.readUInt16BE(idx) / 65535) * 2 - 1); idx += 2;
  }
  const norm = Math.sqrt(out.reduce((a, v) => a + v * v, 0)) || 1;
  return out.map((v) => v / norm);
}

const lastUserText = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.map((p) => p?.text ?? "").join(" ");
  }
  return "";
};

// The default reply is derived from the request, not fixed, so two different prompts never collide
// and a test can assert on an exact expected string it can compute itself.
const defaultReply = (text) => `STUB::${hash(text).toString("hex").slice(0, 12)}`;

function matchRule(text) {
  return RULES.find((r) => r.match && String(text).toLowerCase().includes(String(r.match).toLowerCase())) ?? null;
}

const server = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch {}
  const url = String(req.url).split("?")[0];
  if (LATENCY_MS) await new Promise((r) => setTimeout(r, LATENCY_MS));

  const send = (obj, code = 200) => {
    log({ url, code, model: body.model ?? null, at: Date.now() });
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (url.endsWith("/models")) {
    return send({ object: "list", data: [{ id: MODEL_ID, object: "model", owned_by: "stub" },
                                          { id: "stub-embed-v1", object: "model", owned_by: "stub" }] });
  }

  if (url.endsWith("/embeddings")) {
    const input = Array.isArray(body.input) ? body.input : [body.input ?? ""];
    return send({ object: "list", model: body.model ?? "stub-embed-v1",
      data: input.map((t, i) => ({ object: "embedding", index: i, embedding: embed(String(t)) })),
      usage: { prompt_tokens: input.join(" ").length, total_tokens: input.join(" ").length } });
  }

  if (url.endsWith("/chat/completions")) {
    const text = lastUserText(body.messages);
    const rule = matchRule(text);
    const promptTokens = JSON.stringify(body.messages ?? []).length;

    // Tool calls are scripted, because a framework's tool loop is a stack property worth testing
    // without a model deciding whether to call anything.
    if (rule?.tool) {
      const call = { id: `call_${hash(text).toString("hex").slice(0, 8)}`, type: "function",
        function: { name: rule.tool.name, arguments: JSON.stringify(rule.tool.args ?? {}) } };
      return send({ id: "stubcmpl", object: "chat.completion", created: 0, model: body.model ?? MODEL_ID,
        choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [call] }, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: promptTokens, completion_tokens: 8, total_tokens: promptTokens + 8 } });
    }

    const content = rule?.reply ?? defaultReply(text);
    const finish = rule?.finish ?? "stop";
    return send({ id: "stubcmpl", object: "chat.completion", created: 0, model: body.model ?? MODEL_ID,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }],
      usage: { prompt_tokens: promptTokens, completion_tokens: content.length, total_tokens: promptTokens + content.length } });
  }

  return send({ error: `stub-provider: unhandled ${url}` }, 404);
});

server.on("error", (e) => { console.error(`stub-provider: FATAL ${e.code} on port ${PORT}`); process.exit(9); });
server.listen(PORT, () => console.log(`stub-provider: port=${PORT} model=${MODEL_ID} dim=${DIM} rules=${RULES.length}`));
