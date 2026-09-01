import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createWitnessUiProxy } from "./m1-browser-witness-ui-proxy.mjs";
import relayModule from "./m1-browser-loopback-command-relay.cjs";
import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE } from "../gate7f/function-first/acceptance/browser-witness.mjs";

test("loopback relay can keep the browser on the application port while mapping to a distinct remote port", () => {
  const stage = `m1-task-native-${"a".repeat(32)}`;
  assert.deepEqual(relayModule.parseArguments(["58337", stage, "loopback", "58335"]), {
    listenPort: 58337, remotePort: 58335, stage, listenHost: "127.0.0.1"
  });
  assert.deepEqual(relayModule.parseArguments(["58335", stage]), {
    listenPort: 58335, remotePort: 58335, stage, listenHost: "127.0.0.1"
  });
  assert.throws(() => relayModule.parseArguments(["58335", stage, "loopback", "58335"]), /relay-port-invalid/u);
});

test("loopback witness UI proxy serves a visible one-use action and preserves the application origin", async t => {
  const received = [];
  const upstream = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push({ method: request.method, url: request.url, host: request.headers.host,
      origin: request.headers.origin, body: Buffer.concat(chunks).toString("utf8") });
    const root = request.url === "/";
    response.writeHead(request.url === "/__acceptance/browser-observation-witness" ? 204 : 200,
      { "content-type": root ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
        ...(root ? { "content-security-policy": "default-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" } : {}) });
    response.end(root ? '<!doctype html><body><div id="m1-task" data-m1-task-id="task-1" data-m1-project-id="project-1" data-m1-experience="code" data-m1-task-objective="Repair exercise" data-m1-task-status="cancelled" data-m1-cancellation-at="2026-09-01T00:00:00.000Z"><h3>Repair exercise</h3><p>Task: cancelled</p><p>'+AGENT05_BOUNDED_DRAIN_NOTICE+'</p></div></body>' : request.url === "/plain" ? "forwarded" : "");
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const proxy = createWitnessUiProxy({ listenPort: 0, upstreamPort: upstream.address().port, allowEphemeralListen: true });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  t.after(() => Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]));
  const baseUrl = `http://127.0.0.1:${proxy.address().port}`;
  assert.equal(await (await fetch(`${baseUrl}/plain`)).text(), "forwarded");
  assert.equal(received[0].host, `127.0.0.1:${proxy.address().port}`);

  const checkpointId = "11111111-2222-4333-8444-555555555555", token = "a".repeat(64);
  const redirect = await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui?checkpointId=${checkpointId}&token=${token}`, { redirect: "manual" });
  assert.equal(redirect.status, 303); assert.match(redirect.headers.get("location"), /^\/?\?checkpointId=/u);
  const page = await fetch(new URL(redirect.headers.get("location"), baseUrl));
  const pageText = await page.text();
  assert.equal(page.status, 200); assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  assert.match(pageText, /Acceptance observation/u); assert.match(pageText, /type="hidden"/u);
  assert.doesNotMatch(pageText, /<iframe/iu); assert.match(pageText, /data-m1-task-id="task-1"/u);
  const script = await (await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui.js`)).text();
  assert.match(script, /panel\.dataset/u); assert.equal(script.includes("/Task:\\s*cancelled\\b/iu"), true);
  assert.match(script, /data\.m1TaskId/u); assert.match(script, /domBinding/u);
  assert.match(script, /Visible application cancellation state recorded\./u);
  assert.match(script, new RegExp(AGENT05_BOUNDED_DRAIN_NOTICE.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(script, /body:JSON\.stringify\(\{checkpointId:[^}]+witness:\{/u,
    "the witness must be constructed only after the application DOM is checked");

  const witness = { boundedDrain: AGENT05_BOUNDED_DRAIN, claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE, taskStatus: "cancelled" };
  const domBinding = { cancellationAt: "2026-09-01T00:00:00.000Z", experience: "code", projectId: "project-1",
    taskId: "task-1", taskObjective: "Repair exercise", witnessedUrl: `${baseUrl}/` };
  const response = await fetch(`${baseUrl}/__acceptance/browser-observation-witness`, { method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ checkpointId, token, witness, domBinding }) });
  assert.equal(response.status, 204); assert.equal(received.at(-1).origin, baseUrl);
  assert.deepEqual(JSON.parse(received.at(-1).body), { checkpointId, token, witness, domBinding });
});

test("proxy rejects broad bindings and malformed witness page capabilities", async () => {
  assert.throws(() => createWitnessUiProxy({ listenPort: 80, upstreamPort: 1234 }), /binding-invalid/u);
  assert.throws(() => createWitnessUiProxy({ listenPort: 1234, upstreamPort: 1234 }), /binding-invalid/u);
});
