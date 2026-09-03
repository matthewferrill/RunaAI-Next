import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { canonicalStringify } from "./materialization-contracts.mjs";
import { GitFrameDecoder, GitStreamSession } from "./git-stream-session.mjs";

const key = Buffer.alloc(32, 7);
const wrongKey = Buffer.alloc(32, 8);
const channelId = "channel_01";
const requestId = "request_01";
const nonce = "a".repeat(64);
const sequences = { "materializer-to-broker": 0, "broker-to-materializer": 0 };

function resetSequences() {
  sequences["materializer-to-broker"] = 0;
  sequences["broker-to-materializer"] = 0;
}

function record(direction, requestOrdinal, frameType, value = null, overrides = {}) {
  const payload = value === null ? Buffer.alloc(0) : Buffer.isBuffer(value) ? Buffer.from(value)
    : Buffer.from(canonicalStringify(value));
  const unsigned = {
    schemaVersion: "runa-materialization-pipe-frame/v2",
    channelId,
    sequence: ++sequences[direction],
    requestId,
    nonce,
    payloadSha256: createHash("sha256").update(payload).digest("hex"),
    payloadBytes: payload.length,
    direction,
    requestOrdinal,
    frameType,
    ...overrides.header,
  };
  const signingKey = overrides.key ?? key;
  const hmacSha256 = createHmac("sha256", signingKey).update(canonicalStringify(unsigned)).update(payload).digest("hex");
  return { rawHeader: Buffer.from(canonicalStringify({ ...unsigned, hmacSha256 })), payload };
}

const requestHead = (ordinal, contentLength = ordinal ? 3 : 0) => ({
  schemaVersion: "runa-public-git-http-request/v1",
  requestOrdinal: ordinal,
  method: ordinal ? "POST" : "GET",
  pathAndQuery: ordinal ? "/org/fixture.git/git-upload-pack"
    : "/org/fixture.git/info/refs?service=git-upload-pack",
  accept: ordinal ? "application/x-git-upload-pack-result" : "application/x-git-upload-pack-advertisement",
  contentType: ordinal ? "application/x-git-upload-pack-request" : null,
  contentLength,
});

const responseHead = (ordinal, length) => ({
  schemaVersion: "runa-public-git-http-response/v1",
  requestOrdinal: ordinal,
  status: 200,
  contentType: ordinal ? "application/x-git-upload-pack-result"
    : "application/x-git-upload-pack-advertisement",
  contentLength: length,
  headerBytes: 80,
});

function session() {
  return new GitStreamSession({ channelId, requestId, nonce, repositoryPath: "/org/fixture.git", key });
}

function acceptThroughFirstResponse(target, length = 0) {
  target.accept(record("materializer-to-broker", 0, "open-request", requestHead(0)));
  target.accept(record("materializer-to-broker", 0, "end-request"));
  target.accept(record("broker-to-materializer", 0, "open-response", responseHead(0, length)));
  if (length > 0) target.accept(record("broker-to-materializer", 0, "response-body", Buffer.alloc(length, 1)));
  target.accept(record("broker-to-materializer", 0, "end-response"));
}

function wire(item) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(item.rawHeader.length);
  return Buffer.concat([prefix, item.rawHeader, item.payload]);
}

test("online session validates a complete exchange, both EOFs, and zeroizes its private key", () => {
  resetSequences();
  const target = session();
  const records = [
    record("materializer-to-broker", 0, "open-request", requestHead(0)),
    record("materializer-to-broker", 0, "end-request"),
    record("broker-to-materializer", 0, "open-response", responseHead(0, 2)),
    record("broker-to-materializer", 0, "response-body", Buffer.from("ok")),
    record("broker-to-materializer", 0, "end-response"),
    record("materializer-to-broker", 1, "open-request", requestHead(1)),
    record("materializer-to-broker", 1, "request-body", Buffer.from("ask")),
    record("materializer-to-broker", 1, "end-request"),
    record("broker-to-materializer", 1, "open-response", responseHead(1, null)),
    record("broker-to-materializer", 1, "response-body", Buffer.from("yes")),
    record("broker-to-materializer", 1, "end-response"),
    record("broker-to-materializer", 1, "terminal"),
  ];
  for (const item of records) assert.equal(target.accept(item).payload, item.payload);
  target.endDirection("materializer-to-broker");
  target.endDirection("broker-to-materializer");
  assert.deepEqual(target.finish(), {
    requestBytes: 3,
    responseBytes: 5,
    terminal: true,
    requestFrames: 5,
    responseFrames: 7,
  });
  assert.equal(target.keyDestroyed(), true);
  assert.equal("records" in target, false);
  assert.equal("key" in target, false);
  assert.throws(() => target.accept(record("broker-to-materializer", 1, "terminal")),
    error => error.code === "pipe-frame-after-terminal");
  assert.throws(() => target.finish(), error => error.code === "pipe-session-failed");
});

test("length decoder is chunk-independent, bounded, terminal on error, and rejects truncation", () => {
  resetSequences();
  const first = record("materializer-to-broker", 0, "open-request", requestHead(0));
  const second = record("materializer-to-broker", 0, "end-request");
  const joined = Buffer.concat([wire(first), wire(second)]);
  const observed = [];
  const decoder = new GitFrameDecoder();
  let decoded = 0;
  for (const byte of joined) decoded += decoder.push(Buffer.from([byte]), item => observed.push(item));
  assert.equal(decoded, 2);
  assert.deepEqual(observed, [first, second]);
  decoder.finish();

  resetSequences();
  const coalesced = new GitFrameDecoder();
  const together = [];
  assert.equal(coalesced.push(Buffer.concat([
    wire(record("materializer-to-broker", 0, "open-request", requestHead(0))),
    wire(record("materializer-to-broker", 0, "end-request")),
  ]), item => together.push(item)), 2);
  assert.equal(together.length, 2);
  coalesced.finish();

  const oversizedPrefix = Buffer.alloc(4);
  oversizedPrefix.writeUInt32BE(16_385);
  const oversized = new GitFrameDecoder();
  assert.throws(() => oversized.push(oversizedPrefix, () => {}), error => error.code === "git-frame-header-limit");
  assert.throws(() => oversized.push(Buffer.alloc(0), () => {}), error => error.code === "git-frame-decoder-failed");

  const incomplete = new GitFrameDecoder();
  const firstWire = wire(first);
  incomplete.push(firstWire.subarray(0, firstWire.length - 1), () => {});
  assert.throws(() => incomplete.finish(), error => error.code === "git-frame-truncated");
});

test("a sequence or declared-body failure atomically disables reuse and zeroizes the key", () => {
  resetSequences();
  const sequenceFailure = session();
  sequences["materializer-to-broker"] = 1;
  assert.throws(() => sequenceFailure.accept(record("materializer-to-broker", 0, "open-request", requestHead(0))),
    error => error.code === "pipe-channel-binding-invalid");
  assert.equal(sequenceFailure.keyDestroyed(), true);
  assert.throws(() => sequenceFailure.accept({}), error => error.code === "pipe-session-failed");

  resetSequences();
  const lengthFailure = session();
  lengthFailure.accept(record("materializer-to-broker", 0, "open-request", requestHead(0)));
  lengthFailure.accept(record("materializer-to-broker", 0, "end-request"));
  lengthFailure.accept(record("broker-to-materializer", 0, "open-response", responseHead(0, 2)));
  assert.throws(() => lengthFailure.accept(record("broker-to-materializer", 0, "end-response")),
    error => error.code === "pipe-head-body-length-mismatch");
  assert.equal(lengthFailure.keyDestroyed(), true);
  assert.throws(() => lengthFailure.endDirection("broker-to-materializer"),
    error => error.code === "pipe-session-failed");
});

test("a malformed record envelope cannot escape the fail-closed guard", () => {
  for (const malformed of [null, undefined, {}, {
    get rawHeader() { throw new Error("hostile-getter"); },
    payload: Buffer.alloc(0),
  }]) {
    resetSequences();
    const target = session();
    assert.throws(() => target.accept(malformed), error => error.code === "pipe-record-invalid");
    assert.equal(target.keyDestroyed(), true);
    assert.throws(() => target.accept(malformed), error => error.code === "pipe-session-failed");
  }
});

test("request head ordinal is bound to its authenticated frame ordinal", () => {
  resetSequences();
  const target = session();
  acceptThroughFirstResponse(target);
  assert.throws(() => target.accept(record("materializer-to-broker", 1, "open-request", requestHead(0))),
    error => error.code === "pipe-request-head-mismatch");
  assert.equal(target.keyDestroyed(), true);
});

test("response head ordinal is bound to its authenticated frame ordinal", () => {
  resetSequences();
  const target = session();
  acceptThroughFirstResponse(target);
  target.accept(record("materializer-to-broker", 1, "open-request", requestHead(1)));
  target.accept(record("materializer-to-broker", 1, "request-body", Buffer.from("ask")));
  target.accept(record("materializer-to-broker", 1, "end-request"));
  assert.throws(() => target.accept(record("broker-to-materializer", 1, "open-response", responseHead(0, 0))),
    error => error.code === "pipe-response-head-mismatch");
  assert.equal(target.keyDestroyed(), true);
});

test("wrong HMAC, channel, or nonce fails closed before reuse", async t => {
  for (const [name, overrides, expectedCode] of [
    ["HMAC", { key: wrongKey }, null],
    ["channel", { header: { channelId: "channel_wrong" } }, "pipe-channel-binding-invalid"],
    ["nonce", { header: { nonce: "b".repeat(64) } }, "pipe-channel-binding-invalid"],
  ]) {
    await t.test(name, () => {
      resetSequences();
      const target = session();
      const item = record("materializer-to-broker", 0, "open-request", requestHead(0), overrides);
      assert.throws(() => target.accept(item), error => expectedCode === null || error.code === expectedCode);
      assert.equal(target.keyDestroyed(), true);
      assert.throws(() => target.accept(item), error => error.code === "pipe-session-failed");
    });
  }
});

test("reordered phases and empty body frames fail closed", () => {
  resetSequences();
  const reordered = session();
  assert.throws(() => reordered.accept(record("materializer-to-broker", 0, "end-request")),
    error => error.code === "pipe-terminal-pattern-invalid");
  assert.equal(reordered.keyDestroyed(), true);

  resetSequences();
  const emptyBody = session();
  emptyBody.accept(record("materializer-to-broker", 0, "open-request", requestHead(0)));
  emptyBody.accept(record("materializer-to-broker", 0, "end-request"));
  emptyBody.accept(record("broker-to-materializer", 0, "open-response", responseHead(0, null)));
  assert.throws(() => emptyBody.accept(record("broker-to-materializer", 0, "response-body", Buffer.alloc(0))),
    error => error.code === "pipe-body-frame-empty");
  assert.equal(emptyBody.keyDestroyed(), true);
});

test("request aggregate admits the exact 2 MiB boundary and rejects the next byte", () => {
  const oneMiB = Buffer.alloc(1_048_576, 1);
  resetSequences();
  const exact = session();
  acceptThroughFirstResponse(exact);
  exact.accept(record("materializer-to-broker", 1, "open-request", requestHead(1, 2_097_152)));
  exact.accept(record("materializer-to-broker", 1, "request-body", oneMiB));
  exact.accept(record("materializer-to-broker", 1, "request-body", oneMiB));
  exact.accept(record("materializer-to-broker", 1, "end-request"));
  assert.equal(exact.requestBytes, 2_097_152);

  resetSequences();
  const exceeded = session();
  acceptThroughFirstResponse(exceeded);
  exceeded.accept(record("materializer-to-broker", 1, "open-request", requestHead(1, 2_097_152)));
  exceeded.accept(record("materializer-to-broker", 1, "request-body", oneMiB));
  exceeded.accept(record("materializer-to-broker", 1, "request-body", oneMiB));
  assert.throws(() => exceeded.accept(record("materializer-to-broker", 1, "request-body", Buffer.from([1]))),
    error => error.code === "pipe-request-body-limit");
  assert.equal(exceeded.keyDestroyed(), true);
});

test("response aggregate admits the exact 96 MiB boundary and rejects the next frame", () => {
  const oneMiB = Buffer.alloc(1_048_576, 2);
  resetSequences();
  const exact = session();
  exact.accept(record("materializer-to-broker", 0, "open-request", requestHead(0)));
  exact.accept(record("materializer-to-broker", 0, "end-request"));
  exact.accept(record("broker-to-materializer", 0, "open-response", responseHead(0, 100_663_296)));
  for (let index = 0; index < 96; index += 1) {
    exact.accept(record("broker-to-materializer", 0, "response-body", oneMiB));
  }
  exact.accept(record("broker-to-materializer", 0, "end-response"));
  assert.equal(exact.responseBytes, 100_663_296);

  resetSequences();
  const exceeded = session();
  exceeded.accept(record("materializer-to-broker", 0, "open-request", requestHead(0)));
  exceeded.accept(record("materializer-to-broker", 0, "end-request"));
  exceeded.accept(record("broker-to-materializer", 0, "open-response", responseHead(0, null)));
  for (let index = 0; index < 96; index += 1) {
    exceeded.accept(record("broker-to-materializer", 0, "response-body", oneMiB));
  }
  assert.throws(() => exceeded.accept(record("broker-to-materializer", 0, "response-body", Buffer.from([1]))),
    error => error.code === "pipe-response-body-limit");
  assert.equal(exceeded.keyDestroyed(), true);
});

test("each direction has a strict 128-frame ceiling", () => {
  resetSequences();
  const target = session();
  target.accept(record("materializer-to-broker", 0, "open-request", requestHead(0)));
  target.accept(record("materializer-to-broker", 0, "end-request"));
  target.accept(record("broker-to-materializer", 0, "open-response", responseHead(0, null)));
  for (let index = 0; index < 127; index += 1) {
    target.accept(record("broker-to-materializer", 0, "response-body", Buffer.from([index])));
  }
  assert.equal(target.frameCounts["broker-to-materializer"], 128);
  assert.throws(() => target.accept(record("broker-to-materializer", 0, "response-body", Buffer.from([1]))));
  assert.equal(target.keyDestroyed(), true);

  resetSequences();
  const materializer = session();
  acceptThroughFirstResponse(materializer);
  materializer.accept(record("materializer-to-broker", 1, "open-request", requestHead(1, 126)));
  for (let index = 0; index < 125; index += 1) {
    materializer.accept(record("materializer-to-broker", 1, "request-body", Buffer.from([index])));
  }
  assert.equal(materializer.frameCounts["materializer-to-broker"], 128);
  assert.throws(() => materializer.accept(record("materializer-to-broker", 1, "request-body", Buffer.from([1]))));
  assert.equal(materializer.keyDestroyed(), true);
});

test("directional EOF is accepted only at its protocol boundary", () => {
  resetSequences();
  const earlyMaterializer = session();
  assert.throws(() => earlyMaterializer.endDirection("materializer-to-broker"),
    error => error.code === "pipe-direction-eof-invalid");
  assert.equal(earlyMaterializer.keyDestroyed(), true);

  resetSequences();
  const earlyBroker = session();
  assert.throws(() => earlyBroker.endDirection("broker-to-materializer"),
    error => error.code === "pipe-direction-eof-invalid");
  assert.equal(earlyBroker.keyDestroyed(), true);

  resetSequences();
  const validMaterializer = session();
  acceptThroughFirstResponse(validMaterializer);
  validMaterializer.accept(record("materializer-to-broker", 1, "open-request", requestHead(1)));
  validMaterializer.accept(record("materializer-to-broker", 1, "request-body", Buffer.from("ask")));
  validMaterializer.accept(record("materializer-to-broker", 1, "end-request"));
  validMaterializer.endDirection("materializer-to-broker");
  assert.throws(() => validMaterializer.accept(record("materializer-to-broker", 1, "request-body", Buffer.from([1]))),
    error => error.code === "pipe-frame-after-eof");
  assert.equal(validMaterializer.keyDestroyed(), true);
});
