import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createWitnessUiProxy } from "./m1-browser-witness-ui-proxy.mjs";
import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE } from "../gate7f/function-first/acceptance/browser-witness.mjs";

test("loopback witness UI proxy serves a visible one-use action and preserves the application origin", async t => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push({ method: request.method, url: request.url, host: request.headers.host,
      origin: request.headers.origin, body: Buffer.concat(chunks).toString("utf8") });
    response.writeHead(request.url === "/__acceptance/browser-observation-witness" ? 204 : 200,
      { "content-type": "text/plain; charset=utf-8" }); response.end(request.url === "/plain" ? "forwarded" : "");
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const proxy = createWitnessUiProxy({ listenPort: 0, upstreamPort: upstream.address().port, allowEphemeralListen: true });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  t.after(() => Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]));
  const baseUrl = `http://127.0.0.1:${proxy.address().port}`;
  assert.equal(await (await fetch(`${baseUrl}/plain`)).text(), "forwarded");
  assert.equal(received[0].host, `127.0.0.1:${proxy.address().port}`);

  const checkpointId = "11111111-2222-4333-8444-555555555555", token = "a".repeat(64);
  const page = await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui?checkpointId=${checkpointId}&token=${token}`);
  const pageText = await page.text();
  assert.equal(page.status, 200); assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/u);
  assert.match(pageText, /Record cancellation observation/u); assert.match(pageText, /type="hidden"/u);
  const script = await (await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui.js`)).text();
  assert.match(script, /Cancellation observation recorded\./u); assert.match(script, new RegExp(AGENT05_BOUNDED_DRAIN_NOTICE.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));

  const witness = { boundedDrain: AGENT05_BOUNDED_DRAIN, claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, taskStatus: "cancelled" };
  const response = await fetch(`${baseUrl}/__acceptance/browser-observation-witness`, { method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ checkpointId, token, witness }) });
  assert.equal(response.status, 204); assert.equal(received.at(-1).origin, baseUrl);
  assert.deepEqual(JSON.parse(received.at(-1).body), { checkpointId, token, witness });
});

test("proxy rejects broad bindings and malformed witness page capabilities", async () => {
  assert.throws(() => createWitnessUiProxy({ listenPort: 80, upstreamPort: 1234 }), /binding-invalid/u);
  assert.throws(() => createWitnessUiProxy({ listenPort: 1234, upstreamPort: 1234 }), /binding-invalid/u);
});
