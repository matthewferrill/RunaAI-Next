import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { capabilityFromFileValue, createWitnessUiProxy } from "./m1-browser-witness-ui-proxy.mjs";
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
      origin: request.headers.origin, acceptEncoding: request.headers["accept-encoding"],
      body: Buffer.concat(chunks).toString("utf8") });
    const root = request.url === "/";
    response.writeHead(request.url === "/__acceptance/browser-observation-witness" ? 204 : 200,
      { "content-type": root ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
        ...(root ? { "content-security-policy": "default-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" } : {}) });
    response.end(root ? '<!doctype html><body><div id="m1-task" data-m1-task-id="task-1" data-m1-project-id="project-1" data-m1-experience="code" data-m1-task-objective="Repair exercise" data-m1-task-status="cancelled" data-m1-cancellation-at="2026-09-01T00:00:00.000Z"><h3>Repair exercise</h3><p>Task: cancelled</p><p>'+AGENT05_BOUNDED_DRAIN_NOTICE+'</p></div></body>' : request.url === "/plain" ? "forwarded" : "");
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const checkpointId = "11111111-2222-4333-8444-555555555555", token = "a".repeat(64);
  const proxy = createWitnessUiProxy({ listenPort: 0, upstreamPort: upstream.address().port,
    allowEphemeralListen: true, capability: { checkpointId, token } });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  t.after(() => Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]));
  const baseUrl = `http://127.0.0.1:${proxy.address().port}`;
  assert.equal(await (await fetch(`${baseUrl}/plain`, { headers: { origin: baseUrl } })).text(), "forwarded");
  assert.equal(received[0].host, `127.0.0.1:${proxy.address().port}`);
  assert.equal(received[0].origin, baseUrl, "the public application Origin must survive the internal relay hop");
  assert.equal(received[0].acceptEncoding, "identity", "rewritten HTML must not retain browser compression");

  const queryDenied = await fetch(`${baseUrl}/?checkpointId=${checkpointId}&token=${token}`);
  assert.equal(queryDenied.status, 400); assert.match(await queryDenied.text(), /not supported/u);
  const redirect = await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui`, { redirect: "manual" });
  assert.equal(redirect.status, 303); assert.equal(redirect.headers.get("location"), "/");
  const page = await fetch(new URL(redirect.headers.get("location"), baseUrl));
  const pageText = await page.text();
  assert.equal(page.status, 200); assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  assert.match(pageText, /Acceptance observation/u); assert.match(pageText, /type="hidden"/u);
  assert.doesNotMatch(pageText, /<iframe/iu); assert.match(pageText, /data-m1-task-id="task-1"/u);
  const script = await (await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui.js`)).text();
  assert.match(script, /panel\.dataset/u); assert.equal(script.includes("/Task:\\s*cancelled\\b/iu"), true);
  const submitHandler = script.indexOf("form.addEventListener('submit'");
  const livePanelLookup = script.indexOf("document.querySelector('#m1-task')");
  assert.ok(submitHandler >= 0 && livePanelLookup > submitHandler,
    "the task panel must be resolved when the operator clicks, after the application has rendered it");
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
  assert.throws(() => createWitnessUiProxy({ listenPort: 1234, upstreamPort: 1235,
    capability: { checkpointId: "wrong", token: "a".repeat(64) } }), /capability-invalid/u);
});

test("capability file may be the sealed in-flight checkpoint request", () => {
  const checkpointId = "11111111-2222-4333-8444-555555555555", token = "a".repeat(64);
  assert.deepEqual(capabilityFromFileValue({ schemaVersion: "runaai-m1-browser-checkpoint/v1", checkpointId,
    caseId: "agent-05-cancel-drain", stage: "in-flight",
    observationEndpoint: { schemaVersion: "runaai-m1-browser-observation-endpoint/v2", witnessToken: token } }),
  { checkpointId, token });
});

test("server-side capability keeps the browser URL neutral while injecting the one-use witness control", async t => {
  const upstream = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end('<!doctype html><body><div id="m1-task">Task: cancelled</div></body>');
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const capability = { checkpointId: "11111111-2222-4333-8444-555555555555", token: "a".repeat(64) };
  const proxy = createWitnessUiProxy({ listenPort: 0, upstreamPort: upstream.address().port,
    allowEphemeralListen: true, capability });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  t.after(() => Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]));
  const baseUrl = `http://127.0.0.1:${proxy.address().port}`;
  const page = await fetch(`${baseUrl}/`), text = await page.text();
  assert.equal(page.url, `${baseUrl}/`); assert.match(text, /Acceptance observation/u);
  assert.match(text, new RegExp(capability.checkpointId, "u")); assert.match(text, new RegExp(capability.token, "u"));
  const redirect = await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui`, { redirect: "manual" });
  assert.equal(redirect.status, 303); assert.equal(redirect.headers.get("location"), "/");
});

test("prestarted proxy passes through until the sealed capability file appears", async t => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><body><p>Prepared application</p></body>");
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const directory = mkdtempSync(path.join(tmpdir(), "m1-witness-lazy-")), capabilityFile = path.join(directory, "request.json");
  const proxy = createWitnessUiProxy({ listenPort: 0, upstreamPort: upstream.address().port,
    allowEphemeralListen: true, capabilityFile });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  t.after(() => Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))])
    .finally(() => rmSync(directory, { recursive: true, force: true })));
  const baseUrl = `http://127.0.0.1:${proxy.address().port}`;
  assert.match(await (await fetch(`${baseUrl}/`)).text(), /Acceptance observation/u,
    "the browser control must be armed before cancellation without exposing a capability");
  assert.equal((await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui-capability`)).status, 404);
  writeFileSync(capabilityFile, JSON.stringify({ checkpointId: "11111111-2222-4333-8444-555555555555", token: "a".repeat(64) }));
  const capability = await (await fetch(`${baseUrl}/__acceptance/browser-observation-witness-ui-capability`)).json();
  assert.equal(capability.checkpointId, "11111111-2222-4333-8444-555555555555");
  assert.equal(capability.token, "a".repeat(64));
});

test("post-witness operator publishes only the matching acknowledgement", () => {
  const source = readFileSync(path.join(import.meta.dirname,
    "Publish-ControlBrowserAckAfterWitnessR15.ps1"), "utf8");
  assert.match(source, /Write-ControlBrowserAck\.ps1/u);
  assert.match(source, /-Mode graded/u);
  assert.match(source, /liveWitnessRepublished=\$false/u);
  assert.match(source, /observedWitness\.taskStatus-cne\$value\.details\.taskStatus/u);
  assert.doesNotMatch(source, /Publish-BrowserWitnessAndAck/u,
    "the browser already published the live witness; the operator must not publish it again");
  assert.doesNotMatch(source, /publishBrowserWitness/u);
});
