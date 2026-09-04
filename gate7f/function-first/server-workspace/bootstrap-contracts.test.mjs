import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalStringify } from "./materialization-contracts.mjs";
import {
  BOOTSTRAP_KEY_BYTES,
  BOOTSTRAP_LENGTH_PREFIX_BYTES,
  BOOTSTRAP_MAX_HEADER_BYTES,
  BOOTSTRAP_MAX_PAYLOAD_BYTES,
  BOOTSTRAP_MAX_WIRE_BYTES,
  bootstrapHeaderSchema,
  createBootstrapAdmission,
  createBootstrapRecordSet
} from "./bootstrap-contracts.mjs";

const ids = Object.freeze({
  operationId: "operation_12345678",
  requestId: "request_12345678",
  nonce: "ab".repeat(32)
});
const keys = Object.freeze({
  controlCoordinator: Buffer.alloc(32, 0x11),
  coordinatorMaterializer: Buffer.alloc(32, 0x22),
  coordinatorBroker: Buffer.alloc(32, 0x33),
  gitStreamKey: Buffer.alloc(32, 0x44)
});

function gitInput(overrides = {}) {
  return {
    operationMode: "public-git",
    ...ids,
    channels: {
      controlCoordinator: "channel_control_01",
      coordinatorMaterializer: "channel_materializer_01",
      coordinatorBroker: "channel_broker_01"
    },
    controlKeys: {
      controlCoordinator: Buffer.from(keys.controlCoordinator),
      coordinatorMaterializer: Buffer.from(keys.coordinatorMaterializer),
      coordinatorBroker: Buffer.from(keys.coordinatorBroker)
    },
    gitStreamKey: Buffer.from(keys.gitStreamKey),
    ...overrides
  };
}

function snapshotInput(overrides = {}) {
  return {
    operationMode: "folder-snapshot",
    ...ids,
    channels: {
      controlCoordinator: "channel_control_01",
      coordinatorMaterializer: "channel_materializer_01"
    },
    controlKeys: {
      controlCoordinator: Buffer.from(keys.controlCoordinator),
      coordinatorMaterializer: Buffer.from(keys.coordinatorMaterializer)
    },
    ...overrides
  };
}

function sourceBuffers(value, found = new Set(), visited = new Set()) {
  if (Buffer.isBuffer(value)) {
    found.add(value);
  } else if (value !== null && typeof value === "object" && !visited.has(value)) {
    visited.add(value);
    for (const nested of Object.values(value)) sourceBuffers(nested, found, visited);
  }
  return [...found];
}

function assertZero(buffer) {
  assert.equal(buffer.every(byte => byte === 0), true);
}

function assertSourcesZero(input) {
  const buffers = sourceBuffers(input);
  assert.ok(buffers.length > 0);
  for (const buffer of buffers) assertZero(buffer);
}

function expectedControlKey(binding) {
  return {
    "control-coordinator": keys.controlCoordinator,
    "coordinator-materializer": keys.coordinatorMaterializer,
    "coordinator-broker": keys.coordinatorBroker
  }[binding.channelRelationship];
}

async function consumeRecord(record, observedReferences = []) {
  const copies = [];
  const result = await record.writeOnce(bytes => {
    assert.ok(Buffer.isBuffer(bytes));
    observedReferences.push(bytes);
    copies.push(Buffer.from(bytes));
  });
  for (const reference of observedReferences) assertZero(reference);
  assert.equal(record.state().phase, "consumed");
  assert.equal(record.state().generatedBytesZeroized, true);
  const wire = Buffer.concat(copies);
  assert.equal(result.wireBytes, wire.length);
  return wire;
}

function parseWire(wire) {
  assert.ok(Buffer.isBuffer(wire));
  const headerLength = wire.readUInt32BE(0);
  const headerBytes = wire.subarray(BOOTSTRAP_LENGTH_PREFIX_BYTES,
    BOOTSTRAP_LENGTH_PREFIX_BYTES + headerLength);
  const headerText = headerBytes.toString("utf8");
  const headerValue = JSON.parse(headerText);
  assert.equal(canonicalStringify(headerValue), headerText);
  const header = bootstrapHeaderSchema.parse(headerValue);
  return {
    headerLength,
    headerBytes,
    header,
    payload: wire.subarray(BOOTSTRAP_LENGTH_PREFIX_BYTES + headerLength)
  };
}

function frame(headerBytes, payload) {
  const prefix = Buffer.alloc(BOOTSTRAP_LENGTH_PREFIX_BYTES);
  prefix.writeUInt32BE(headerBytes.length, 0);
  return Buffer.concat([prefix, headerBytes, payload]);
}

function admitWire(admission, wire, widths) {
  let offset = 0;
  let index = 0;
  while (offset < wire.length) {
    const width = widths[index % widths.length];
    const end = Math.min(wire.length, offset + width);
    admission.admitBytes(wire.subarray(offset, end));
    offset = end;
    index += 1;
  }
}

function rejectConstructionAndZero(input) {
  assert.throws(() => createBootstrapRecordSet(input));
  assertSourcesZero(input);
}

test("public Git emits the exact five records, consumes distribution copies, and writes once", async () => {
  const input = gitInput();
  const set = createBootstrapRecordSet(input);
  assertSourcesZero(input);
  assert.equal(set.records.length, 5);
  assert.deepEqual(set.records.map(record => [record.binding.channelRelationship, record.binding.bootstrapRecipient]), [
    ["control-coordinator", "control-to-coordinator"],
    ["coordinator-materializer", "control-to-coordinator"],
    ["coordinator-materializer", "control-to-materializer"],
    ["coordinator-broker", "control-to-coordinator"],
    ["coordinator-broker", "control-to-broker"]
  ]);
  for (const record of set.records) {
    const wire = await consumeRecord(record);
    const { header, payload } = parseWire(wire);
    const worker = record.binding.bootstrapRecipient !== "control-to-coordinator";
    assert.equal(header.payloadBytes, worker ? 64 : 32);
    assert.deepEqual(payload.subarray(0, 32), expectedControlKey(record.binding));
    assert.deepEqual(worker ? payload.subarray(32) : null, worker ? keys.gitStreamKey : null);
    assert.equal(header.payloadSha256, createHash("sha256").update(payload).digest("hex"));
    wire.fill(0);
  }
  assert.equal(set.state().generatedBytesZeroized, true);
});

test("folder snapshot emits exactly three records and never distributes a broker or Git key", async () => {
  const input = snapshotInput();
  const set = createBootstrapRecordSet(input);
  assertSourcesZero(input);
  assert.equal(set.records.length, 3);
  assert.deepEqual(set.records.map(record => [record.binding.channelRelationship, record.binding.bootstrapRecipient]), [
    ["control-coordinator", "control-to-coordinator"],
    ["coordinator-materializer", "control-to-coordinator"],
    ["coordinator-materializer", "control-to-materializer"]
  ]);
  for (const record of set.records) {
    const wire = await consumeRecord(record);
    const { header, payload } = parseWire(wire);
    assert.equal(header.payloadBytes, 32);
    assert.equal(header.keyLayout.includes("git-stream-key"), false);
    assert.deepEqual(payload, expectedControlKey(record.binding));
    wire.fill(0);
  }
});

test("public-Git Git key rejects byte aliasing with each of the three control keys", () => {
  for (const controlName of ["controlCoordinator", "coordinatorMaterializer", "coordinatorBroker"]) {
    const input = gitInput();
    input.gitStreamKey = Buffer.from(input.controlKeys[controlName]);
    rejectConstructionAndZero(input);
  }
});

test("every valid record admits across arbitrary prefix, header, and payload chunk boundaries", async () => {
  for (const rawInput of [gitInput(), snapshotInput()]) {
    const set = createBootstrapRecordSet(rawInput);
    for (const record of set.records) {
      const wire = await consumeRecord(record);
      for (const widths of [[1], [2, 3, 5, 7], [3, 509, 1, 64], [wire.length]]) {
        const admission = createBootstrapAdmission(record.binding);
        admitWire(admission, wire, widths);
        assert.equal(admission.state().phase, "await-eof");
        admission.end();
        assert.equal(admission.state().wireCopiesZeroized, true);
        const channel = admission.openChannel(record.binding);
        assert.equal(channel.owner, "authenticated-channel");
        assert.deepEqual(channel.controlKey, expectedControlKey(record.binding));
        const expectsGit = record.binding.operationMode === "public-git"
          && record.binding.bootstrapRecipient !== "control-to-coordinator";
        assert.deepEqual(channel.gitStreamKey, expectsGit ? keys.gitStreamKey : null);
        assert.equal(admission.state().bootstrapCopiesZeroized, true);
        channel.destroy();
        assert.equal(channel.state().zeroized, true);
      }
      wire.fill(0);
    }
  }
});

test("all record-set construction failures consume and zero dedicated source copies", () => {
  let input = gitInput();
  input.controlKeys.extra = Buffer.alloc(32, 0x55);
  rejectConstructionAndZero(input);

  input = gitInput();
  delete input.controlKeys.coordinatorBroker;
  rejectConstructionAndZero(input);

  rejectConstructionAndZero(gitInput({ gitStreamKey: Buffer.alloc(31, 0x44) }));
  rejectConstructionAndZero(gitInput({ gitStreamKey: Buffer.alloc(33, 0x44) }));
  rejectConstructionAndZero({ ...snapshotInput(), gitStreamKey: Buffer.alloc(32, 0x44) });

  input = snapshotInput();
  input.channels.coordinatorBroker = "channel_broker_01";
  rejectConstructionAndZero(input);

  rejectConstructionAndZero({ ...gitInput(), unexpected: true });

  input = gitInput();
  input.channels.coordinatorBroker = input.channels.coordinatorMaterializer;
  rejectConstructionAndZero(input);

  input = gitInput();
  input.controlKeys.coordinatorBroker = Buffer.from(input.controlKeys.coordinatorMaterializer);
  rejectConstructionAndZero(input);
});

test("one record sender failure immediately poisons and zeroizes the entire record set", async () => {
  const input = gitInput();
  const set = createBootstrapRecordSet(input);
  assertSourcesZero(input);
  const failedReferences = [];
  await assert.rejects(set.records[0].writeOnce(bytes => {
    failedReferences.push(bytes);
    throw new Error("bootstrap-child-start-failed");
  }), /bootstrap-child-start-failed/u);

  for (const reference of failedReferences) assertZero(reference);
  assert.deepEqual({
    phase: set.state().phase,
    poisoned: set.state().poisoned,
    destroyed: set.state().destroyed,
    generatedBytesZeroized: set.state().generatedBytesZeroized
  }, {
    phase: "poisoned",
    poisoned: true,
    destroyed: true,
    generatedBytesZeroized: true
  });
  for (const [index, record] of set.records.entries()) {
    assert.equal(record.state().phase, "poisoned", `record ${index} was not poisoned`);
    assert.equal(record.state().destroyed, true, `record ${index} was not destroyed`);
    assert.equal(record.state().generatedBytesZeroized, true, `record ${index} retained generated bytes`);
  }

  set.destroy();
  assert.equal(set.state().generatedBytesZeroized, true);
});

test("sender success, write failure, and destroy all zero generated bytes and deny replay", async () => {
  let set = createBootstrapRecordSet(gitInput());
  let record = set.records[0];
  const successReferences = [];
  const wire = await consumeRecord(record, successReferences);
  await assert.rejects(record.writeOnce(() => {}), /bootstrap-sender-already-consumed/u);
  wire.fill(0);
  set.destroy();

  for (const failureAt of [1, 2, 3]) {
    set = createBootstrapRecordSet(gitInput());
    record = set.records[1];
    const failedReferences = [];
    let writeCount = 0;
    await assert.rejects(record.writeOnce(bytes => {
      writeCount += 1;
      failedReferences.push(bytes);
      if (writeCount === failureAt) throw new Error(`transport-write-failed-${failureAt}`);
    }), new RegExp(`transport-write-failed-${failureAt}`, "u"));
    for (const reference of failedReferences) assertZero(reference);
    assert.equal(record.state().generatedBytesZeroized, true);
    assert.equal(record.state().phase, "poisoned");
    assert.equal(set.state().poisoned, true);
    assert.equal(set.state().generatedBytesZeroized, true);
    await assert.rejects(record.writeOnce(() => {}), /bootstrap-sender-already-consumed/u);
    set.destroy();
  }

  set = createBootstrapRecordSet(snapshotInput());
  record = set.records[2];
  const interruptedReferences = [];
  await assert.rejects(record.writeOnce(bytes => {
    interruptedReferences.push(bytes);
    record.destroy();
  }), /bootstrap-sender-destroyed-during-write/u);
  for (const reference of interruptedReferences) assertZero(reference);
  assert.equal(record.state().generatedBytesZeroized, true);
  set.destroy();

  set = createBootstrapRecordSet(snapshotInput());
  record = set.records[2];
  record.destroy();
  assert.equal(record.state().generatedBytesZeroized, true);
  await assert.rejects(record.writeOnce(() => {}), /bootstrap-sender-already-consumed/u);
  set.destroy();
});

test("length prefix is incremental and rejects invalid header bounds before allocation", async () => {
  const set = createBootstrapRecordSet(gitInput());
  const record = set.records[2];
  const wire = await consumeRecord(record);
  const admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire.subarray(0, 1));
  admission.admitBytes(wire.subarray(1, 3));
  assert.equal(admission.state().headerBufferAllocated, false);
  admission.admitBytes(wire.subarray(3, 4));
  assert.equal(admission.state().headerBufferAllocated, true);
  admission.destroy();

  for (const invalidLength of [0, BOOTSTRAP_MAX_HEADER_BYTES + 1, 0xffffffff]) {
    const prefix = Buffer.alloc(BOOTSTRAP_LENGTH_PREFIX_BYTES);
    prefix.writeUInt32BE(invalidLength, 0);
    const rejected = createBootstrapAdmission(record.binding);
    assert.throws(() => rejected.admitBytes(prefix), /bootstrap-header-length-invalid/u);
    assert.equal(rejected.state().headerBufferAllocated, false);
    assert.equal(rejected.state().bootstrapCopiesZeroized, true);
  }
  wire.fill(0);
  set.destroy();
});

test("non-canonical, extra, missing, and wrong-layout headers poison and zero bootstrap copies", async () => {
  const set = createBootstrapRecordSet(gitInput());
  const record = set.records[2];
  const wire = await consumeRecord(record);
  const parsed = parseWire(wire);
  const value = JSON.parse(parsed.headerBytes.toString("utf8"));
  const cases = [
    Buffer.from(` ${parsed.headerBytes.toString("utf8")}`),
    Buffer.from(canonicalStringify({ ...value, unexpected: true })),
    Buffer.from(canonicalStringify({ ...value, keyLayout: ["coordinator-materializer-key"] })),
    Buffer.from(canonicalStringify({
      ...value,
      keyLayout: ["coordinator-materializer-key", "git-stream-key", "git-stream-key"]
    })),
    Buffer.from(canonicalStringify(Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "requestId")))),
    Buffer.from(canonicalStringify(Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "payloadBytes"))))
  ];
  for (const headerBytes of cases) {
    const rejected = createBootstrapAdmission(record.binding);
    assert.throws(() => rejected.admitBytes(frame(headerBytes, parsed.payload)));
    assert.equal(rejected.state().poisoned, true);
    assert.equal(rejected.state().bootstrapCopiesZeroized, true);
    assert.throws(() => rejected.admitBytes(Buffer.from([1])), /bootstrap-admission-poisoned/u);
  }
  wire.fill(0);
  set.destroy();
});

test("truncation, integrity failure, trailing bytes, and oversized wire poison and zero copies", async () => {
  const set = createBootstrapRecordSet(gitInput());
  const record = set.records[4];
  const wire = await consumeRecord(record);

  let admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire.subarray(0, wire.length - 1));
  assert.throws(() => admission.end(), /bootstrap-stream-truncated/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  const corrupt = Buffer.from(wire);
  corrupt[corrupt.length - 1] ^= 0xff;
  admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(corrupt);
  assert.throws(() => admission.end(), /bootstrap-payload-integrity-failed/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  admission = createBootstrapAdmission(record.binding);
  assert.throws(() => admission.admitBytes(Buffer.concat([wire, Buffer.from([1])])), /bootstrap-trailing-bytes/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire);
  assert.throws(() => admission.admitBytes(Buffer.from([1])), /bootstrap-admission-transition-invalid/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  admission = createBootstrapAdmission(record.binding);
  assert.throws(() => admission.admitBytes(Buffer.alloc(BOOTSTRAP_MAX_WIRE_BYTES + 1)), /bootstrap-wire-too-large/u);
  assert.equal(admission.state().streamBytesReceived, 0);
  assert.equal(admission.state().headerBufferAllocated, false);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  corrupt.fill(0);
  wire.fill(0);
  set.destroy();
});

test("operation, channel, request, nonce, mode, relationship, and recipient bindings are exact", async () => {
  const set = createBootstrapRecordSet(gitInput());
  const record = set.records[2];
  const wire = await consumeRecord(record);
  const mutations = [
    { operationId: "operation_wrong_01" },
    { channelId: "channel_wrong_001" },
    { requestId: "request_wrong_001" },
    { nonce: "cd".repeat(32) },
    { operationMode: "folder-snapshot" },
    { channelRelationship: "control-coordinator" },
    { bootstrapRecipient: "control-to-coordinator" },
    { channelRelationship: "control-coordinator", bootstrapRecipient: "control-to-coordinator" }
  ];
  for (const mutation of mutations) {
    const expectation = { ...record.binding, ...mutation };
    let admission;
    try {
      admission = createBootstrapAdmission(expectation);
    } catch {
      continue;
    }
    assert.throws(() => admission.admitBytes(wire), /bootstrap-binding-mismatch/u);
    assert.equal(admission.state().bootstrapCopiesZeroized, true);
  }

  const admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire);
  admission.end();
  assert.throws(() => admission.openChannel({ ...record.binding, requestId: "request_wrong_001" }),
    /bootstrap-channel-binding-mismatch/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);
  wire.fill(0);
  set.destroy();
});

test("channel access before EOF and post-EOF replay poison and zero bootstrap-owned key copies", async () => {
  const set = createBootstrapRecordSet(gitInput());
  const record = set.records[4];
  const wire = await consumeRecord(record);

  let admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire.subarray(0, wire.length - 1));
  assert.throws(() => admission.openChannel(record.binding), /bootstrap-admission-transition-invalid/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire);
  admission.end();
  assert.equal(admission.state().pendingKeyCopiesZeroized, false);
  assert.throws(() => admission.end(), /bootstrap-admission-transition-invalid/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  admission = createBootstrapAdmission(record.binding);
  admission.admitBytes(wire);
  admission.end();
  assert.throws(() => admission.admitBytes(Buffer.from([1])), /bootstrap-admission-transition-invalid/u);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  wire.fill(0);
  set.destroy();
});

test("channel-key ownership transfer is one-use and independent of the bootstrap lifecycle", async () => {
  const set = createBootstrapRecordSet(gitInput());
  const record = set.records[4];
  const wire = await consumeRecord(record);
  const admission = createBootstrapAdmission(record.binding);
  admitWire(admission, wire, [2, 11, 1, 37]);
  admission.end();
  const channel = admission.openChannel(record.binding);
  const controlBefore = Buffer.from(channel.controlKey);
  const gitBefore = Buffer.from(channel.gitStreamKey);
  assert.equal(admission.state().bootstrapCopiesZeroized, true);

  assert.throws(() => admission.openChannel(record.binding), /bootstrap-admission-transition-invalid/u);
  assert.deepEqual(channel.controlKey, controlBefore);
  assert.deepEqual(channel.gitStreamKey, gitBefore);
  admission.destroy();
  assert.deepEqual(channel.controlKey, controlBefore);
  assert.deepEqual(channel.gitStreamKey, gitBefore);
  assert.equal(channel.state().owner, "authenticated-channel");
  channel.destroy();
  assertZero(channel.controlKey);
  assertZero(channel.gitStreamKey);
  assert.equal(channel.state().zeroized, true);

  controlBefore.fill(0);
  gitBefore.fill(0);
  wire.fill(0);
  set.destroy();
});

test("exact maximum header, payload, and framed wire bounds are reachable and one byte over is rejected", async () => {
  const longestId = `a${"b".repeat(127)}`;
  const channelIds = ["c", "d", "e"].map(prefix => `${prefix}${"b".repeat(127)}`);
  const input = gitInput({
    operationId: longestId,
    requestId: longestId,
    channels: {
      controlCoordinator: channelIds[0],
      coordinatorMaterializer: channelIds[1],
      coordinatorBroker: channelIds[2]
    }
  });
  const set = createBootstrapRecordSet(input);
  const maximum = set.records.find(record => record.binding.bootstrapRecipient === "control-to-materializer");
  const wire = await consumeRecord(maximum);
  const parsed = parseWire(wire);
  assert.equal(BOOTSTRAP_KEY_BYTES, 32);
  assert.equal(parsed.headerLength, BOOTSTRAP_MAX_HEADER_BYTES);
  assert.equal(parsed.payload.length, BOOTSTRAP_MAX_PAYLOAD_BYTES);
  assert.equal(wire.length, BOOTSTRAP_MAX_WIRE_BYTES);
  const admission = createBootstrapAdmission(maximum.binding);
  admitWire(admission, wire, [1]);
  admission.end();
  const channel = admission.openChannel(maximum.binding);
  assert.equal(channel.gitStreamKey.length, 32);
  channel.destroy();
  wire.fill(0);
  set.destroy();

  const tooLongInput = gitInput({ operationId: `a${"b".repeat(128)}` });
  rejectConstructionAndZero(tooLongInput);
});
