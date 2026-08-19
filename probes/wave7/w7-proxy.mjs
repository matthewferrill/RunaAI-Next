// Wave 7 provider-boundary fault injector for E02. It sits between the agent and the model endpoint
// and, unlike the Wave 6 proxy, it injects on /chat/completions rather than /embeddings.
//
// It is also the wave's instrument of record. On this edge there is no disk beneath the model, so the
// deed is the wire: every request body, every response status, every call count and duration is
// logged here, and every verdict is read from that log rather than from the answer.
//
// The proxy is NOT part of the system under test. Its control arm is mode=ok, which must produce a
// correct answer; if that fails, a broken instrument and a broken provider are indistinguishable.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const UPSTREAM = process.env.W7_UPSTREAM || "http://192.168.50.165:1234/v1";
const MODE = process.env.W7_MODE || "ok";
const PORT = Number(process.env.W7_PORT || 8800);
const SLOW_MS = Number(process.env.W7_SLOW_MS || 3000);
const FAIL_FIRST = Number(process.env.W7_FAIL_FIRST || 1);
const LOG = process.env.W7_WIRELOG || "";

let calls = 0;
const wire = (o) => { if (LOG) { try { appendFileSync(LOG, JSON.stringify(o) + "\n"); } catch {} } };

const server = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const bodyRaw = Buffer.concat(chunks).toString("utf8");
  const n = ++calls;
  const isChat = String(req.url).includes("/chat/completions");
  const t0 = Date.now();

  // The full outbound body is recorded for every chat call. This is what makes "what actually left
  // the machine across the trust boundary" answerable, rather than inferred from the answer.
  const logReq = (note, code, extra = {}) => wire({ call: n, mode: MODE, url: req.url, isChat,
    outboundBytes: bodyRaw.length, outbound: isChat ? bodyRaw.slice(0, 20000) : null,
    code, note, ms: Date.now() - t0, ...extra });

  const send = (code, obj, note, extra = {}) => {
    // contentLen and finish must be recorded on the INJECTED path too, not only on pass-through.
    // Without them every injected mode logs contentLen undefined, so "did anything usable come back"
    // reads false even for changed-version, which returns real complete content and differs only in
    // the model it declares. Grading fabrication on that would have counted a good answer as invented.
    let contentLen = null, finish = null, declaredModel = null;
    if (typeof obj === "object" && obj) {
      contentLen = String(obj?.choices?.[0]?.message?.content ?? "").length;
      finish = obj?.choices?.[0]?.finish_reason ?? null;
      declaredModel = obj?.model ?? null;
    }
    logReq(note, code, { contentLen, finish, declaredModel, ...extra });
    res.writeHead(code, { "content-type": "application/json" });
    res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
  };

  if (!isChat || MODE === "ok") return passThrough(req, res, bodyRaw, n, isChat, t0);

  if (MODE === "unavailable") return send(503, { error: "upstream unavailable" }, "injected");
  if (MODE === "timeout") { logReq("never responding", null); return; }  // socket held open
  if (MODE === "slow") { await new Promise((r) => setTimeout(r, SLOW_MS)); return passThrough(req, res, bodyRaw, n, isChat, t0, "slow"); }
  if (MODE === "malformed-response") return send(200, '{ "choices": [ this is not json', "injected");
  if (MODE === "recovers-mid-operation" && n <= FAIL_FIRST) return send(503, { error: "transient" }, "injected-then-recovers");

  const up = await fetchUpstream(req.url, bodyRaw).catch((e) => ({ error: String(e.message) }));
  if (up.error) return send(502, { error: up.error }, "upstream-failed");
  const body = up.json;

  if (MODE === "partial-response") {
    // A truncated body: the message content is cut mid-sentence and finish_reason is stripped. This
    // is the case most likely to be silently completed by a client rather than raised as an error.
    const c = body?.choices?.[0];
    if (c?.message?.content) {
      c.message.content = String(c.message.content).slice(0, Math.max(1, Math.floor(String(c.message.content).length / 3)));
      delete c.finish_reason;
    }
    return send(200, body, "injected-truncated");
  }
  if (MODE === "changed-version") {
    // The endpoint declares a different model. Whether the agent stops or carries on is I-7X.
    body.model = "some-other-model-v9";
    return send(200, body, "injected-model-identity-changed", { declaredModel: body.model });
  }
  return send(200, body, "passthrough-fallback");
});

async function fetchUpstream(url, bodyRaw) {
  const r = await fetch(UPSTREAM + String(url).replace(/^\/v1/, ""), {
    method: "POST", headers: { "content-type": "application/json" }, body: bodyRaw });
  return { json: await r.json(), status: r.status };
}
async function passThrough(req, res, bodyRaw, n, isChat, t0, note = "passthrough") {
  try {
    const target = UPSTREAM + String(req.url).replace(/^\/v1/, "");
    const r = await fetch(target, { method: req.method,
      headers: { "content-type": "application/json" }, body: req.method === "GET" ? undefined : bodyRaw });
    const text = await r.text();
    let declaredModel = null, finish = null, contentLen = null;
    try { const j = JSON.parse(text); declaredModel = j?.model ?? null; finish = j?.choices?.[0]?.finish_reason ?? null;
          contentLen = String(j?.choices?.[0]?.message?.content ?? "").length; } catch {}
    wire({ call: n, mode: MODE, url: req.url, isChat, outboundBytes: bodyRaw.length,
      outbound: isChat ? bodyRaw.slice(0, 20000) : null, code: r.status, note,
      ms: Date.now() - t0, declaredModel, finish, contentLen });
    res.writeHead(r.status, { "content-type": "application/json" }); res.end(text);
  } catch (e) {
    wire({ call: n, mode: MODE, url: req.url, isChat, outboundBytes: bodyRaw.length,
      outbound: isChat ? bodyRaw.slice(0, 20000) : null, code: 502,
      note: "upstream-unreachable: " + String(e.message).slice(0, 80), ms: Date.now() - t0 });
    res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String(e.message) }));
  }
}
server.listen(PORT, () => console.log(`w7-proxy: mode=${MODE} port=${PORT} upstream=${UPSTREAM}`));
