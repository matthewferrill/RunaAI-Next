import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import tls from "node:tls";
import { once } from "node:events";
import { createGitBrokerHttp } from "./git-broker-transport.mjs";
import { createGitBrokerChildForTest, GitBrokerChild } from "./git-broker-child.mjs";
import { FramedGitBrokerClient, decodeGitStreamRecords, encodeGitStreamRecord,
  signGitStreamRecord } from "./git-stream-codec.mjs";
import { GitTlsConnector, createGitTlsConnectorForTest } from "./git-tls-connector.mjs";
import { canonicalStringify } from "./materialization-contracts.mjs";

const openssl = "C:\\Program Files\\Git\\usr\\bin\\openssl.exe";
const channelId = "channel_01", requestId = "request_01", sourceId = "source_0001";
const nonce = "a".repeat(64), repositoryHttpsUrl = "https://git.example/org/fixture.git", key = Buffer.alloc(32, 9);
const deadline = (milliseconds = 5_000) => Date.now() + milliseconds;
let root, certificate, privateKey, server, port, mode = "ok";
const requests = [], connectOptions = [];

function head(ordinal, contentLength = ordinal === 0 ? 0 : 3) {
  return { schemaVersion: "runa-public-git-http-request/v1", requestOrdinal: ordinal,
    method: ordinal === 0 ? "GET" : "POST",
    pathAndQuery: ordinal === 0 ? "/org/fixture.git/info/refs?service=git-upload-pack" : "/org/fixture.git/git-upload-pack",
    accept: ordinal === 0 ? "application/x-git-upload-pack-advertisement" : "application/x-git-upload-pack-result",
    contentType: ordinal === 0 ? null : "application/x-git-upload-pack-request", contentLength };
}
async function listen(target) { target.listen(0, "127.0.0.1"); await once(target, "listening"); return target.address().port; }
before(async () => {
  root = mkdtempSync(path.join(realpathSync(os.tmpdir()), "runa-git-tls-"));
  execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.crt",
    "-days", "1", "-subj", "/CN=git.example", "-addext", "subjectAltName=DNS:git.example",
    "-addext", "basicConstraints=critical,CA:TRUE"], { cwd: root, stdio: "ignore", timeout: 15_000, windowsHide: true });
  privateKey = readFileSync(path.join(root, "server.key")); certificate = readFileSync(path.join(root, "server.crt"));
  server = https.createServer({ key: privateKey, cert: certificate }, async (request, response) => {
    if (mode === "reject-before-finish") { request.socket.destroy(); return; }
    const chunks = [];
    try { for await (const chunk of request) chunks.push(Buffer.from(chunk)); }
    catch { return; }
    requests.push({ method: request.method, url: request.url, host: request.headers.host,
      contentType: request.headers["content-type"] ?? null, body: Buffer.concat(chunks).toString("utf8") });
    if (mode === "stall") return;
    if (mode === "redirect") { response.writeHead(302, { Location: "https://other.example/escape.git" }); response.end(); return; }
    const type = request.method === "GET" ? "application/x-git-upload-pack-advertisement" : "application/x-git-upload-pack-result";
    response.setHeader("Content-Type", mode === "wrong-type" ? "text/plain" : type);
    if (mode === "large-header") response.setHeader("X-Fill", "x".repeat(33_000));
    if (mode === "large-body") { response.setHeader("Content-Length", "100663297"); response.end(); return; }
    if (mode === "wrong-length") { response.setHeader("Content-Length", "5"); response.end("abc"); return; }
    if (request.method === "GET") response.setHeader("Content-Length", "13");
    response.end(request.method === "GET" ? "advertisement" : `result:${Buffer.concat(chunks).toString("utf8")}`);
  });
  port = await listen(server);
});
after(async () => {
  if (server) { server.close(); await once(server, "close"); }
  if (root) { const resolved = realpathSync(root); assert.equal(path.dirname(resolved), realpathSync(os.tmpdir()));
    assert.match(path.basename(resolved), /^runa-git-tls-/u); rmSync(resolved, { recursive: true, force: false }); }
});
const resolver = async hostname => {
  assert.equal(hostname, "git.example");
  return [{ family: 4, address: "8.8.8.8" }, { family: 6, address: "2606:4700:4700::1111" }];
};
function mappedTls(options, variant = "normal") {
  connectOptions.push(options); assert.equal(options.host, "8.8.8.8");
  const socket = tls.connect({ ...options, host: "127.0.0.1", port, ca: variant === "untrusted" ? undefined : certificate });
  if (variant === "fast-idle") { const original = socket.setTimeout.bind(socket);
    socket.setTimeout = (ms, callback) => original(ms === 0 ? 0 : 25, callback); }
  return socket;
}
const connectorFactory = (variant = "normal") => createGitTlsConnectorForTest({ resolver,
  tlsConnect: options => mappedTls(options, variant), ca: variant === "untrusted" ? undefined : certificate });
async function bytes(body) { const chunks = []; for await (const chunk of body) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }

test("canonical encoder is exact and decoder streams many coalesced records one at a time", async () => {
  const payload = Buffer.from("synthetic");
  const record = signGitStreamRecord({ channelId, direction: "materializer-to-broker", frameType: "request-body",
    nonce, payload, requestId, requestOrdinal: 1, sequence: 1 }, key);
  const parsed = JSON.parse(record.rawHeader.toString("utf8")), unsigned = { ...parsed }; delete unsigned.hmacSha256;
  assert.equal(parsed.payloadSha256, createHash("sha256").update(payload).digest("hex"));
  assert.equal(parsed.hmacSha256, createHmac("sha256", key).update(canonicalStringify(unsigned)).update(payload).digest("hex"));
  const wire = encodeGitStreamRecord(record); assert.equal(wire.readUInt32BE(0), record.rawHeader.length);
  assert.deepEqual(wire.subarray(4 + record.rawHeader.length), payload);
  const second = signGitStreamRecord({ channelId, direction: "materializer-to-broker", frameType: "request-body",
    nonce, payload: Buffer.from("second"), requestId, requestOrdinal: 1, sequence: 2 }, key);
  const decoded = decodeGitStreamRecords(Readable.from([Buffer.concat([wire, encodeGitStreamRecord(second)])]))[Symbol.asyncIterator]();
  const firstYield = await decoded.next();
  assert.equal(JSON.parse(firstYield.value.rawHeader.toString("utf8")).sequence, 1);
  const secondYield = await decoded.next();
  assert.equal(JSON.parse(secondYield.value.rawHeader.toString("utf8")).sequence, 2);
  assert.equal((await decoded.next()).done, true);
  assert.throws(() => signGitStreamRecord({ channelId, direction: "materializer-to-broker", frameType: "request-body",
    nonce, payload, requestId, requestOrdinal: 1, sequence: 1, path: "C:\\private" }, key), /git-frame-encode-input-invalid/u);
});

test("invalid client deadline acquires no stream or secret resource", () => {
  const readable = new PassThrough(), writable = new PassThrough(), suppliedKey = Buffer.alloc(32, 17);
  assert.throws(() => new FramedGitBrokerClient({ readable, writable, repositoryHttpsUrl, sourceId, channelId,
    requestId, nonce, key: suppliedKey, deadlineAt: Date.now() - 1 }), /git-ipc-deadline-invalid/u);
  assert.equal(readable.destroyed, false); assert.equal(writable.destroyed, false);
  assert.deepEqual(suppliedKey, Buffer.alloc(32, 17)); readable.destroy(); writable.destroy();
});

test("one authority deadline crosses client, child and connector for two smart-HTTP requests", async () => {
  mode = "ok"; requests.length = 0; connectOptions.length = 0; const deadlineAt = deadline();
  const requestPipe = new PassThrough(), responsePipe = new PassThrough();
  const client = new FramedGitBrokerClient({ readable: responsePipe, writable: requestPipe, repositoryHttpsUrl,
    sourceId, channelId, requestId, nonce, key, deadlineAt });
  let connectorDeadline;
  const child = createGitBrokerChildForTest({ readable: requestPipe, writable: responsePipe, repositoryHttpsUrl,
    channelId, requestId, nonce, key, deadlineAt }, options => { connectorDeadline = options.deadlineAt; return connectorFactory()(options); });
  const childRun = child.run();
  const transport = createGitBrokerHttp({ broker: client, repositoryHttpsUrl, sourceId, requestId, deadlineAt });
  const advertisement = await transport.request({ method: "GET", url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-advertisement" } });
  assert.equal((await bytes(advertisement.body)).toString(), "advertisement");
  const result = await transport.request({ method: "POST", url: `${repositoryHttpsUrl}/git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-result", "content-type": "application/x-git-upload-pack-request",
      "content-length": "3" },
    body: [Buffer.from("a"), Buffer.from("sk")] });
  assert.equal((await bytes(result.body)).toString(), "result:ask");
  const outcome = await childRun;
  assert.equal(connectorDeadline, deadlineAt); assert.equal(client.deadlineAt, deadlineAt); assert.equal(child.deadlineAt, deadlineAt);
  assert.equal(client.keyDestroyed(), true); assert.equal(child.keyDestroyed(), true); assert.equal(child.completed(), true);
  assert.equal(outcome.network.connections, 2); assert.equal(outcome.network.failed, false);
  assert.equal(connectOptions.every(value => value.host === "8.8.8.8" && value.port === 443
    && value.servername === "git.example" && value.rejectUnauthorized === true), true);
  assert.equal(requests[1].body, "ask"); assert.equal(JSON.stringify(outcome).includes("8.8.8.8"), false);
});

test("transport enforces declared and streamed request lengths before an attempt can succeed", async t => {
  const postUrl = `${repositoryHttpsUrl}/git-upload-pack`;
  const postHeaders = { accept: "application/x-git-upload-pack-result",
    "content-type": "application/x-git-upload-pack-request" };
  const primedTransport = async () => {
    let calls = 0;
    const broker = {
      async request(input) {
        calls += 1;
        return { statusCode: 200,
          url: input.requestOrdinal === 0
            ? `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`
            : postUrl,
          headers: { "content-type": input.accept },
          body: Object.freeze({ async *[Symbol.asyncIterator]() {} }) };
      },
      close() {}
    };
    const transport = createGitBrokerHttp({ broker, repositoryHttpsUrl, sourceId, requestId,
      deadlineAt: deadline() });
    await transport.request({ method: "GET",
      url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
      headers: { accept: "application/x-git-upload-pack-advertisement" } });
    return { transport, calls: () => calls };
  };
  await t.test("declared maximum is rejected before the broker", async () => {
    const { transport, calls } = await primedTransport();
    await assert.rejects(transport.request({ method: "POST", url: postUrl,
      headers: { ...postHeaders, "content-length": "2097153" }, body: [Buffer.from("x")] }),
    /git-broker-request-too-large/u);
    assert.equal(calls(), 1);
  });
  await t.test("known body must equal its declaration before the broker", async () => {
    const { transport, calls } = await primedTransport();
    await assert.rejects(transport.request({ method: "POST", url: postUrl,
      headers: { ...postHeaders, "content-length": "2" }, body: [Buffer.from("ask")] }),
    /git-broker-request-body-invalid/u);
    assert.equal(calls(), 1);
  });
  for (const [name, body] of [["async under-run", Readable.from([Buffer.from("as")])],
    ["async overrun", Readable.from([Buffer.from("asks")])]]) {
    await t.test(name, async () => {
      mode = "ok";
      const requestPipe = new PassThrough(), responsePipe = new PassThrough(), deadlineAt = deadline();
      const client = new FramedGitBrokerClient({ readable: responsePipe, writable: requestPipe,
        repositoryHttpsUrl, sourceId, channelId, requestId, nonce, key, deadlineAt });
      const child = createGitBrokerChildForTest({ readable: requestPipe, writable: responsePipe,
        repositoryHttpsUrl, channelId, requestId, nonce, key, deadlineAt }, connectorFactory());
      const childRun = child.run();
      const transport = createGitBrokerHttp({ broker: client, repositoryHttpsUrl, sourceId, requestId, deadlineAt });
      const advertisement = await transport.request({ method: "GET",
        url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
        headers: { accept: "application/x-git-upload-pack-advertisement" } });
      await bytes(advertisement.body);
      await assert.rejects(transport.request({ method: "POST", url: postUrl,
        headers: { ...postHeaders, "content-length": "3" }, body }), /git-framed-client-request-body-invalid/u);
      await assert.rejects(childRun);
      assert.equal(client.keyDestroyed(), true); assert.equal(child.keyDestroyed(), true);
    });
  }
});

test("raw URL canonicality is enforced before construction or composition", () => {
  for (const value of ["https://Git.Example/org/fixture.git", "https://git.example:443/org/fixture.git",
    "https://xn--bcher-kva.example/org/fixture.git", "https://git.example/org/%66ixture.git",
    "https://git.example/org/../fixture.git"]) {
    assert.throws(() => new GitTlsConnector({ repositoryHttpsUrl: value, deadlineAt: deadline() }), /repository-url-invalid/u);
  }
});

test("complete DNS denial and connector misuse poison the whole attempt before a socket", async () => {
  let sockets = 0;
  const deniedFactory = createGitTlsConnectorForTest({ resolver: async () => [{ family: 4, address: "8.8.8.8" }, { family: 4, address: "127.0.0.1" }],
    tlsConnect: () => { sockets += 1; } });
  const denied = deniedFactory({ repositoryHttpsUrl, deadlineAt: deadline() });
  await assert.rejects(denied.openRequest(head(0)), /network-resolver-answer-denied/u);
  assert.equal(sockets, 0); assert.equal(denied.poisoned(), true); assert.equal(denied.selectedAddressDestroyed(), true);
  const misuse = connectorFactory()({ repositoryHttpsUrl, deadlineAt: deadline() });
  await assert.rejects(misuse.openRequest(head(1)), /git-tls-request-order-invalid/u);
  await assert.rejects(misuse.openRequest(head(0)), /git-tls-request-order-invalid/u);
  assert.equal(misuse.poisoned(), true);
});

test("TLS certificate, ALPN, malformed socket and idle response failures poison and clean", async t => {
  const alpnFactory = createGitTlsConnectorForTest({ resolver, tlsConnect: options => {
    connectOptions.push(options); const socket = new PassThrough();
    socket.connecting = false; socket.encrypted = true; socket.authorized = true; socket.alpnProtocol = "h2";
    socket.setTimeout = () => socket; return socket;
  } });
  for (const [name, factory, expected] of [
    ["certificate", connectorFactory("untrusted"), /certificate|self-signed|unable to verify/iu],
    ["alpn", alpnFactory, /git-tls-peer-invalid/u],
    ["malformed-socket", createGitTlsConnectorForTest({ resolver, tlsConnect: () => ({ destroy() {} }) }), /git-tls-socket-invalid/u],
  ]) await t.test(name, async () => {
    const connector = factory({ repositoryHttpsUrl, deadlineAt: deadline() });
    await assert.rejects(connector.openRequest(head(0)), expected); assert.equal(connector.poisoned(), true);
    assert.equal(connector.selectedAddressDestroyed(), true);
  });
  await t.test("idle", async () => {
    mode = "stall"; const connector = connectorFactory("fast-idle")({ repositoryHttpsUrl, deadlineAt: deadline() });
    const transaction = await connector.openRequest(head(0));
    await assert.rejects(transaction.finish(), /git-tls-idle-timeout/u); assert.equal(connector.poisoned(), true);
  });
});

test("peer rejection before finish is handled immediately and still returned by finish", async () => {
  mode = "ok";
  const connector = connectorFactory()({ repositoryHttpsUrl, deadlineAt: deadline() });
  const advertisement = await connector.openRequest(head(0));
  const advertisementResponse = await advertisement.finish();
  await bytes(advertisementResponse.body);
  mode = "reject-before-finish";
  const unhandled = [];
  const captureUnhandled = reason => unhandled.push(reason);
  process.on("unhandledRejection", captureUnhandled);
  try {
    const rejected = await connector.openRequest(head(1));
    await rejected.writeBody(Buffer.from("ask"));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(unhandled, []);
    await assert.rejects(rejected.finish(), /socket hang up|ECONNRESET/u);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", captureUnhandled);
    connector.close(); mode = "ok";
  }
  assert.equal(connector.poisoned(), true);
  assert.equal(connector.selectedAddressDestroyed(), true);
});

test("redirect, header, declared body, length and media-type failures are terminal", async t => {
  for (const [failureMode, expected] of [["redirect", /git-tls-response-status-denied/u],
    ["wrong-type", /git-tls-response-header-invalid/u], ["large-header", /header|parse/iu],
    ["large-body", /git-tls-response-body-limit/u], ["wrong-length", /aborted|reset|length/iu]]) {
    await t.test(failureMode, async () => {
      mode = failureMode; const connector = connectorFactory()({ repositoryHttpsUrl, deadlineAt: deadline() });
      const transaction = await connector.openRequest(head(0));
      if (failureMode === "wrong-length") {
        const response = await transaction.finish(); await assert.rejects(bytes(response.body), expected);
      } else await assert.rejects(transaction.finish(), expected);
      assert.equal(connector.poisoned(), true); assert.equal(connector.selectedAddressDestroyed(), true);
    });
  }
});

test("IPC input and output stalls honor the same deadline and explicit close is idempotent", async () => {
  const stalledInput = new PassThrough(), childOutput = new PassThrough(); childOutput.resume();
  const child = createGitBrokerChildForTest({ readable: stalledInput, writable: childOutput, repositoryHttpsUrl,
    channelId, requestId, nonce, key, deadlineAt: deadline(35) }, () => ({ openRequest() {}, close() {}, observation() { return {}; } }));
  await assert.rejects(child.run(), /git-broker-child-absolute-deadline/u); assert.equal(child.keyDestroyed(), true);
  assert.equal(child.close(), false);
  const stalledOutput = new PassThrough({ highWaterMark: 1 }), clientInput = new PassThrough();
  const stalledDeadlineAt = deadline(35);
  const client = new FramedGitBrokerClient({ readable: clientInput, writable: stalledOutput, repositoryHttpsUrl,
    sourceId, channelId, requestId, nonce, key, deadlineAt: stalledDeadlineAt });
  const transport = createGitBrokerHttp({ broker: client, repositoryHttpsUrl, sourceId, requestId,
    deadlineAt: stalledDeadlineAt });
  await assert.rejects(transport.request({ method: "GET", url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-advertisement" } }),
  /git-(?:ipc-absolute|broker-request)-deadline/u);
  assert.equal(client.keyDestroyed(), true); assert.equal(client.close(), false);
});

test("abandoned response body closes both sides and zeroizes both keys", async () => {
  mode = "ok"; const requestPipe = new PassThrough(), responsePipe = new PassThrough(), deadlineAt = deadline();
  const client = new FramedGitBrokerClient({ readable: responsePipe, writable: requestPipe, repositoryHttpsUrl,
    sourceId, channelId, requestId, nonce, key, deadlineAt });
  const child = createGitBrokerChildForTest({ readable: requestPipe, writable: responsePipe, repositoryHttpsUrl,
    channelId, requestId, nonce, key, deadlineAt }, connectorFactory());
  const childRun = child.run(); const transport = createGitBrokerHttp({ broker: client, repositoryHttpsUrl,
    sourceId, requestId, deadlineAt });
  const response = await transport.request({ method: "GET", url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-advertisement" } });
  response.body.cancel(); await assert.rejects(childRun);
  assert.equal(client.keyDestroyed(), true); assert.equal(child.keyDestroyed(), true);
});

test("reusing the first response body poisons the attempt and prevents request one", async () => {
  mode = "ok"; const requestPipe = new PassThrough(), responsePipe = new PassThrough(), deadlineAt = deadline();
  const client = new FramedGitBrokerClient({ readable: responsePipe, writable: requestPipe, repositoryHttpsUrl,
    sourceId, channelId, requestId, nonce, key, deadlineAt });
  const child = createGitBrokerChildForTest({ readable: requestPipe, writable: responsePipe, repositoryHttpsUrl,
    channelId, requestId, nonce, key, deadlineAt }, connectorFactory());
  const childRun = child.run(); const transport = createGitBrokerHttp({ broker: client, repositoryHttpsUrl,
    sourceId, requestId, deadlineAt });
  const response = await transport.request({ method: "GET", url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-advertisement" } });
  assert.equal((await bytes(response.body)).toString(), "advertisement");
  await assert.rejects(bytes(response.body), /git-framed-client-body-reused/u);
  await assert.rejects(transport.request({ method: "POST", url: `${repositoryHttpsUrl}/git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-result",
      "content-type": "application/x-git-upload-pack-request", "content-length": "3" },
    body: Readable.from([Buffer.from("ask")]) }),
  /git-framed-client-state-invalid/u);
  await assert.rejects(childRun);
  assert.equal(client.keyDestroyed(), true); assert.equal(child.keyDestroyed(), true);
  assert.equal(requestPipe.destroyed, true); assert.equal(responsePipe.destroyed, true);
});

test("a never-finishing POST body is cancelled by the shared deadline without retry or retained IPC state", async () => {
  mode = "ok"; requests.length = 0; connectOptions.length = 0;
  const requestPipe = new PassThrough(), responsePipe = new PassThrough(), deadlineAt = deadline(150);
  const client = new FramedGitBrokerClient({ readable: responsePipe, writable: requestPipe, repositoryHttpsUrl,
    sourceId, channelId, requestId, nonce, key, deadlineAt });
  const child = createGitBrokerChildForTest({ readable: requestPipe, writable: responsePipe, repositoryHttpsUrl,
    channelId, requestId, nonce, key, deadlineAt }, connectorFactory());
  let childError;
  const childRun = child.run().catch(error => { childError = error; });
  const transport = createGitBrokerHttp({ broker: client, repositoryHttpsUrl, sourceId, requestId, deadlineAt });
  const advertisement = await transport.request({ method: "GET",
    url: `${repositoryHttpsUrl}/info/refs?service=git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-advertisement" } });
  assert.equal((await bytes(advertisement.body)).toString(), "advertisement");
  let cancelled = false, nextCalls = 0;
  const stalledBody = { [Symbol.asyncIterator]() { return {
    next() { nextCalls += 1; return new Promise(() => {}); },
    return() { cancelled = true; return Promise.resolve({ done: true }); },
  }; } };
  await assert.rejects(transport.request({ method: "POST", url: `${repositoryHttpsUrl}/git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-result", "content-type": "application/x-git-upload-pack-request",
      "content-length": "3" }, body: stalledBody }),
  error => ["git-ipc-absolute-deadline", "git-broker-request-deadline"].includes(error.code));
  await childRun;
  assert.ok(["git-broker-child-absolute-deadline", "ERR_STREAM_PREMATURE_CLOSE"].includes(childError?.code));
  assert.equal(nextCalls, 1); assert.equal(cancelled, true);
  assert.equal(requests.length, 1); assert.equal(connectOptions.length, 2);
  assert.equal(client.keyDestroyed(), true); assert.equal(child.keyDestroyed(), true);
  assert.equal(requestPipe.destroyed, true); assert.equal(responsePipe.destroyed, true);
  await assert.rejects(transport.request({ method: "POST", url: `${repositoryHttpsUrl}/git-upload-pack`,
    headers: { accept: "application/x-git-upload-pack-result", "content-type": "application/x-git-upload-pack-request",
      "content-length": "3" }, body: [Buffer.from("ask")] }), /git-broker-attempt-closed/u);
});

test("forged frames and throwing factories/cleanup preserve original failure and zeroize", async t => {
  await t.test("factory", async () => {
    const input = new PassThrough(), output = new PassThrough(); output.resume();
    const child = createGitBrokerChildForTest({ readable: input, writable: output, repositoryHttpsUrl,
      channelId, requestId, nonce, key, deadlineAt: deadline() }, () => { throw Object.assign(new Error("factory-failed"), { code: "factory-failed" }); });
    await assert.rejects(child.run(), /factory-failed/u); assert.equal(child.keyDestroyed(), true);
  });
  await t.test("cleanup", async () => {
    const input = new PassThrough(), output = new PassThrough(); output.resume(); let opened = 0;
    const child = createGitBrokerChildForTest({ readable: input, writable: output, repositoryHttpsUrl,
      channelId, requestId, nonce, key, deadlineAt: deadline() }, () => ({ openRequest() { opened += 1; },
      close() { throw new Error("cleanup-failed"); }, observation() { return {}; } }));
    const run = child.run();
    const forged = signGitStreamRecord({ channelId, direction: "materializer-to-broker", frameType: "open-request",
      nonce, payload: Buffer.from(canonicalStringify(head(0))), requestId, requestOrdinal: 0, sequence: 1 }, Buffer.alloc(32, 4));
    input.end(encodeGitStreamRecord(forged));
    await assert.rejects(run, /pipe-hmac-mismatch/u); assert.equal(opened, 0); assert.equal(child.keyDestroyed(), true);
  });
});
