// Wave 6 embed-endpoint fault injector for E06. It sits between `memory` and the real LM Studio
// endpoint, exactly as Wave 4's controllable server sat between the agent and the filesystem.
//
// The proxy is NOT part of the system under test. The base -- model, embedder, lockfile, code -- is
// unchanged, and every run records the mode it ran in so pass-through is never confused with an
// injected failure. Its control arm is mode=ok, which must embed normally; if that fails, the E06
// families are NOT DECIDABLE rather than failing.
import { createServer } from "node:http";

const UPSTREAM = process.env.W6_UPSTREAM || "http://192.168.50.165:1234/v1";
const MODE = process.env.W6_MODE || "ok";
const PORT = Number(process.env.W6_PORT || 8477);
const SLOW_MS = Number(process.env.W6_SLOW_MS || 3000);
const FAIL_FIRST = Number(process.env.W6_FAIL_FIRST || 1);
const LOG = process.env.W6_CALLLOG || "";

let calls = 0;
const log = (o) => { if (LOG) { import("node:fs").then((fs) => fs.appendFileSync(LOG, JSON.stringify(o) + "\n")); } };

const server = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const bodyRaw = Buffer.concat(chunks).toString("utf8");
  const n = ++calls;
  const send = (code, obj, note) => { log({ call: n, mode: MODE, url: req.url, code, note }); res.writeHead(code, { "content-type": "application/json" }); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };

  // Non-embedding traffic always passes through untouched: the fault is scoped to E06.
  const isEmbed = String(req.url).includes("/embeddings");
  if (!isEmbed || MODE === "ok") return passThrough(req, res, bodyRaw, n);

  if (MODE === "unavailable") return send(503, { error: "upstream unavailable" }, "injected");
  if (MODE === "timeout") { log({ call: n, mode: MODE, note: "never responding" }); return; }  // socket held open
  if (MODE === "slow") { await new Promise((r) => setTimeout(r, SLOW_MS)); return passThrough(req, res, bodyRaw, n, "slow"); }
  if (MODE === "malformed-response") return send(200, "{ this is not json", "injected");
  if (MODE === "recovers-mid-operation" && n <= FAIL_FIRST) return send(503, { error: "transient" }, "injected-then-recovers");

  // partial-response and changed-version need the real vector first, then damage it.
  const up = await fetchUpstream(req.url, bodyRaw).catch((e) => ({ error: String(e.message) }));
  if (up.error) return send(502, { error: up.error }, "upstream-failed");
  const body = up.json;
  if (MODE === "partial-response" && body?.data?.[0]?.embedding) {
    // Truncate the vector. A store that accepts this has accepted a dimension it never checked.
    body.data[0].embedding = body.data[0].embedding.slice(0, Math.floor(body.data[0].embedding.length / 2));
    return send(200, body, "injected-truncated");
  }
  if (MODE === "changed-version" && body?.data?.[0]?.embedding) {
    body.data[0].embedding = [...body.data[0].embedding, 0.001];   // dimension + 1
    body.model = String(body.model || "") + "-v2";
    return send(200, body, "injected-dimension-changed");
  }
  return send(200, body, "passthrough-fallback");
});

async function fetchUpstream(url, bodyRaw) {
  const r = await fetch(UPSTREAM + String(url).replace(/^\/v1/, ""), {
    method: "POST", headers: { "content-type": "application/json" }, body: bodyRaw });
  return { json: await r.json(), status: r.status };
}
async function passThrough(req, res, bodyRaw, n, note = "passthrough") {
  try {
    const target = UPSTREAM + String(req.url).replace(/^\/v1/, "");
    const r = await fetch(target, { method: req.method,
      headers: { "content-type": "application/json" }, body: req.method === "GET" ? undefined : bodyRaw });
    const text = await r.text();
    log({ call: n, mode: MODE, url: req.url, code: r.status, note });
    res.writeHead(r.status, { "content-type": "application/json" }); res.end(text);
  } catch (e) {
    log({ call: n, mode: MODE, url: req.url, code: 502, note: "upstream-unreachable: " + String(e.message).slice(0, 80) });
    res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String(e.message) }));
  }
}
server.listen(PORT, () => console.log(`w6-proxy: mode=${MODE} port=${PORT} upstream=${UPSTREAM}`));
