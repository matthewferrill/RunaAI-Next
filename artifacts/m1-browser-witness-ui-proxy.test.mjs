import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
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

test("loopback relay exposes bounded cleanup even before accepting a client", () => {
  const stage = `m1-task-native-${"b".repeat(32)}`;
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage });
  assert.equal(typeof server.stopAll, "function");
  server.stopAll();
});

test("loopback relay releases an abandoned browser connection before its SSH child exits", async t => {
  const stage = `m1-task-native-${"c".repeat(32)}`;
  const spawned = [];
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.killCalls = 0;
    child.kill = () => { child.killCalls += 1; return true; };
    spawned.push(child); return child;
  };
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage, spawnProcess });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const sockets = [];
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.stopAll(); server.close();
  });
  const open = async () => {
    const socket = connect(server.address().port, "127.0.0.1"); sockets.push(socket); await once(socket, "connect"); return socket;
  };
  for (let index = 0; index < 8; index += 1) await open();
  assert.equal(spawned.length, 8);
  const rejected = connect(server.address().port, "127.0.0.1"); sockets.push(rejected);
  const rejectedClose = once(rejected, "close"); await once(rejected, "connect"); await rejectedClose;
  assert.equal(spawned.length, 8, "the ninth simultaneous connection remains bounded");

  const abandoned = sockets[0], abandonedClose = once(abandoned, "close"); abandoned.destroy(); await abandonedClose;
  assert.equal(spawned[0].killCalls, 1, "the abandoned per-connection SSH child is terminated");
  await open();
  assert.equal(spawned.length, 9, "the released slot admits a successor without waiting for SSH exit");
  for (const child of spawned) child.emit("exit", 0);
});

test("loopback relay bounds repeatedly abandoned children that have not exited", async t => {
  const stage = `m1-task-native-${"d".repeat(32)}`, spawned = [], sockets = [];
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => true; spawned.push(child); return child;
  };
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage, spawnProcess });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { for (const child of spawned) child.emit("exit", 0); for (const socket of sockets) socket.destroy(); server.stopAll(); server.close(); });
  for (let index = 0; index < 16; index += 1) {
    const socket = connect(server.address().port, "127.0.0.1"); sockets.push(socket);
    const closed = once(socket, "close"); await once(socket, "connect"); socket.destroy(); await closed;
  }
  assert.equal(spawned.length, 16);
  const bounded = connect(server.address().port, "127.0.0.1"), boundedClose = once(bounded, "close");
  sockets.push(bounded); await once(bounded, "connect"); await boundedClose;
  assert.equal(spawned.length, 16, "unsettled child ownership has an independent hard cap");
});

test("loopback relay fails closed when an abandoned SSH child cannot be signalled", async t => {
  const stage = `m1-task-native-${"e".repeat(32)}`;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => false;
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage, spawnProcess: () => child });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { child.emit("exit", 0); server.stopAll(); server.close(); });
  const fatal = once(server, "relayFatal"), socket = connect(server.address().port, "127.0.0.1");
  await once(socket, "connect"); socket.destroy();
  const [error] = await fatal;
  assert.match(error.message, /relay-child-stop-unconfirmed/u);
});

test("loopback relay fails closed when a signalled abandoned child misses its exit deadline", async t => {
  const stage = `m1-task-native-${"f".repeat(32)}`;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => true;
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage,
    spawnProcess: () => child, childStopTimeoutMs: 10 });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { child.emit("exit", 0); server.stopAll(); server.close(); });
  const fatal = once(server, "relayFatal"), socket = connect(server.address().port, "127.0.0.1");
  await once(socket, "connect"); socket.destroy();
  const [error] = await fatal;
  assert.match(error.message, /relay-child-stop-timeout/u);
});

test("relay shutdown waits for every owned child before reporting success", async t => {
  const stage = `m1-task-native-${"1".repeat(32)}`;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => true;
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage,
    spawnProcess: () => child, childStopTimeoutMs: 100 });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { child.emit("exit", 0); server.stopAll(); server.close(); });
  const socket = connect(server.address().port, "127.0.0.1"); await once(socket, "connect");
  const shutdown = server.shutdown({ timeoutMs: 100 });
  let resolved = false; shutdown.then(() => { resolved = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(resolved, false, "server socket closure alone cannot report child cleanup success");
  child.emit("exit", 0);
  assert.deepEqual(await shutdown, { exitCode: 0, childrenSettled: true });
});

test("relay shutdown reports nonzero when owned children miss the bounded settlement deadline", async t => {
  const stage = `m1-task-native-${"2".repeat(32)}`;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => true;
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage,
    spawnProcess: () => child, childStopTimeoutMs: 100 });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { child.emit("exit", 0); server.stopAll(); server.close(); });
  const socket = connect(server.address().port, "127.0.0.1"); await once(socket, "connect");
  assert.deepEqual(await server.shutdown({ timeoutMs: 10 }), { exitCode: 1, childrenSettled: false });
});

test("real relay reentrant fatal shutdown shares one promise, deadline and CLI terminal", async t => {
  const stage = `m1-task-native-${"3".repeat(32)}`;
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => false;
  const server = relayModule.createRelay({ listenPort: 58335, remotePort: 58335, stage,
    spawnProcess: () => child, childStopTimeoutMs: 100 });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { child.emit("exit", 0); server.stopAll(); server.close(); });
  const processObject = new EventEmitter(), exits = [], errors = [];
  processObject.exitCode = 0; processObject.exit = code => { exits.push(code); };
  processObject.stderr = { write: value => { errors.push(value); } };
  const handlers = relayModule.installCliShutdownHandlers({ server, processObject, timeoutMs: 25 });
  let fatalShutdown;
  server.once("relayFatal", () => { fatalShutdown = server.shutdown({ fatal: true, timeoutMs: 100 }); });
  const socket = connect(server.address().port, "127.0.0.1"); await once(socket, "connect");
  const startedAt = Date.now(), completion = handlers.beginShutdown(false);
  const publishedShutdown = server.shutdown({ timeoutMs: 100 });
  assert.strictEqual(fatalShutdown, publishedShutdown,
    "synchronous fail-closed reentry must observe the already-published shutdown promise");
  assert.strictEqual(completion, handlers.completion,
    "graceful and reentrant fatal CLI paths must share one terminal completion");
  assert.equal(await completion, 1);
  assert.deepEqual(await publishedShutdown, { exitCode: 1, childrenSettled: false });
  assert.deepEqual(exits, [1]);
  assert.match(errors.join(""), /relay-child-stop-unconfirmed/u);
  assert.ok(Date.now() - startedAt < 500, "the initiating CLI deadline remains bounded after fatal reentry");
});

test("CLI signal shutdown delays exit until settlement and preserves a later fatal outcome", async () => {
  const makeCli = () => {
    const processObject = new EventEmitter(), server = new EventEmitter(), exits = [], errors = [];
    processObject.exitCode = 0; processObject.exit = code => { exits.push(code); };
    processObject.stderr = { write: value => { errors.push(value); } };
    let fatal = false, release;
    const pending = new Promise(resolve => { release = resolve; });
    server.shutdown = ({ fatal: requestedFatal }) => {
      if (requestedFatal) fatal = true;
      return pending.then(() => ({ exitCode: fatal ? 1 : 0, childrenSettled: true }));
    };
    const handlers = relayModule.installCliShutdownHandlers({ server, processObject, timeoutMs: 100 });
    return { processObject, server, exits, errors, handlers, release };
  };

  const graceful = makeCli();
  graceful.processObject.emit("SIGTERM");
  assert.deepEqual(graceful.exits, [], "SIGTERM cannot report success before child settlement");
  graceful.release(); await graceful.handlers.completion;
  assert.deepEqual(graceful.exits, [0]);

  const fatal = makeCli();
  fatal.server.emit("relayFatal", new Error("relay-child-stop-timeout"));
  fatal.processObject.emit("SIGTERM");
  fatal.release(); await fatal.handlers.completion;
  assert.deepEqual(fatal.exits, [1], "a later signal cannot downgrade fatal relay shutdown");
  assert.match(fatal.errors.join(""), /relay-child-stop-timeout/u);
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
