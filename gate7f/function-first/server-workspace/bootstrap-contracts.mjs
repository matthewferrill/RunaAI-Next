import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { canonicalStringify, parseCanonicalWire } from "./materialization-contracts.mjs";

export const BOOTSTRAP_LENGTH_PREFIX_BYTES = 4;
export const BOOTSTRAP_KEY_BYTES = 32;
export const BOOTSTRAP_MAX_PAYLOAD_BYTES = 64;
// The longest valid canonical header is the public-Git materializer record with
// all three bounded identifiers at 128 ASCII bytes.
export const BOOTSTRAP_MAX_HEADER_BYTES = 853;
export const BOOTSTRAP_MAX_WIRE_BYTES = BOOTSTRAP_LENGTH_PREFIX_BYTES
  + BOOTSTRAP_MAX_HEADER_BYTES
  + BOOTSTRAP_MAX_PAYLOAD_BYTES;

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{7,127}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const nonce = z.string().regex(/^[a-f0-9]{64}$/u);
const keyBuffer = z.custom(
  value => Buffer.isBuffer(value) && value.length === BOOTSTRAP_KEY_BYTES,
  "bootstrap key must be an exact 32-byte Buffer"
);

export const bootstrapOperationModeSchema = z.enum(["public-git", "folder-snapshot"]);
export const bootstrapChannelRelationshipSchema = z.enum([
  "control-coordinator",
  "coordinator-materializer",
  "coordinator-broker"
]);
export const bootstrapRecipientSchema = z.enum([
  "control-to-coordinator",
  "control-to-materializer",
  "control-to-broker"
]);
export const bootstrapKeyNameSchema = z.enum([
  "control-coordinator-key",
  "coordinator-materializer-key",
  "coordinator-broker-key",
  "git-stream-key"
]);

const controlKeyName = Object.freeze({
  "control-coordinator": "control-coordinator-key",
  "coordinator-materializer": "coordinator-materializer-key",
  "coordinator-broker": "coordinator-broker-key"
});

function keyLayoutFor(operationMode, channelRelationship, bootstrapRecipient) {
  const git = operationMode === "public-git";
  const coordinatorCopy = bootstrapRecipient === "control-to-coordinator";
  const materializerCopy = bootstrapRecipient === "control-to-materializer";
  const brokerCopy = bootstrapRecipient === "control-to-broker";
  if (channelRelationship === "control-coordinator") {
    return coordinatorCopy ? [controlKeyName[channelRelationship]] : null;
  }
  if (channelRelationship === "coordinator-materializer") {
    if (coordinatorCopy) return [controlKeyName[channelRelationship]];
    if (materializerCopy) {
      return git
        ? [controlKeyName[channelRelationship], "git-stream-key"]
        : [controlKeyName[channelRelationship]];
    }
    return null;
  }
  if (channelRelationship === "coordinator-broker" && git) {
    if (coordinatorCopy) return [controlKeyName[channelRelationship]];
    if (brokerCopy) return [controlKeyName[channelRelationship], "git-stream-key"];
  }
  return null;
}

const bindingShape = {
  operationMode: bootstrapOperationModeSchema,
  channelRelationship: bootstrapChannelRelationshipSchema,
  bootstrapRecipient: bootstrapRecipientSchema,
  operationId: id,
  channelId: id,
  requestId: id,
  nonce
};

function refineTopology(value, context) {
  if (keyLayoutFor(value.operationMode, value.channelRelationship, value.bootstrapRecipient) === null) {
    context.addIssue({ code: "custom", message: "bootstrap relationship/recipient is invalid for operation mode" });
  }
}

export const bootstrapChannelBindingSchema = z.object({
  schemaVersion: z.literal("runa-control-worker-bootstrap-binding/v1"),
  ...bindingShape
}).strict().superRefine(refineTopology);

export const bootstrapHeaderSchema = z.object({
  schemaVersion: z.literal("runa-control-worker-bootstrap-header/v1"),
  ...bindingShape,
  keyLayout: z.array(bootstrapKeyNameSchema).min(1).max(2),
  payloadBytes: z.number().int().min(BOOTSTRAP_KEY_BYTES).max(BOOTSTRAP_MAX_PAYLOAD_BYTES),
  payloadSha256: digest
}).strict().superRefine((value, context) => {
  const expectedLayout = keyLayoutFor(value.operationMode, value.channelRelationship, value.bootstrapRecipient);
  if (expectedLayout === null) {
    context.addIssue({ code: "custom", message: "bootstrap relationship/recipient is invalid for operation mode" });
    return;
  }
  if (value.keyLayout.length !== expectedLayout.length
      || value.keyLayout.some((name, index) => name !== expectedLayout[index])) {
    context.addIssue({ code: "custom", message: "bootstrap key layout mismatch" });
  }
  if (value.payloadBytes !== expectedLayout.length * BOOTSTRAP_KEY_BYTES) {
    context.addIssue({ code: "custom", message: "bootstrap payload byte length mismatch" });
  }
});

const publicGitSetSchema = z.object({
  operationMode: z.literal("public-git"),
  operationId: id,
  requestId: id,
  nonce,
  channels: z.object({
    controlCoordinator: id,
    coordinatorMaterializer: id,
    coordinatorBroker: id
  }).strict(),
  controlKeys: z.object({
    controlCoordinator: keyBuffer,
    coordinatorMaterializer: keyBuffer,
    coordinatorBroker: keyBuffer
  }).strict(),
  gitStreamKey: keyBuffer
}).strict();

const folderSnapshotSetSchema = z.object({
  operationMode: z.literal("folder-snapshot"),
  operationId: id,
  requestId: id,
  nonce,
  channels: z.object({
    controlCoordinator: id,
    coordinatorMaterializer: id
  }).strict(),
  controlKeys: z.object({
    controlCoordinator: keyBuffer,
    coordinatorMaterializer: keyBuffer
  }).strict()
}).strict();

export const bootstrapRecordSetSchema = z.discriminatedUnion("operationMode", [
  publicGitSetSchema,
  folderSnapshotSetSchema
]).superRefine((value, context) => {
  const channelIds = Object.values(value.channels);
  if (new Set(channelIds).size !== channelIds.length) {
    context.addIssue({ code: "custom", message: "bootstrap channel IDs must be distinct" });
  }
  const controlKeys = Object.values(value.controlKeys);
  for (let left = 0; left < controlKeys.length; left += 1) {
    for (let right = left + 1; right < controlKeys.length; right += 1) {
      if (timingSafeEqual(controlKeys[left], controlKeys[right])) {
        context.addIssue({ code: "custom", message: "named control keys must be byte-distinct" });
      }
    }
  }
  if (value.operationMode === "public-git") {
    for (const controlKey of controlKeys) {
      if (timingSafeEqual(value.gitStreamKey, controlKey)) {
        context.addIssue({ code: "custom", message: "Git-stream key must be byte-distinct from every control key" });
      }
    }
  }
});

const fail = code => Object.assign(new Error(code), { code });
const zero = buffer => {
  if (Buffer.isBuffer(buffer)) buffer.fill(0);
};
const allZero = buffer => !Buffer.isBuffer(buffer) || buffer.every(byte => byte === 0);

function collectSourceBuffers(value, buffers = new Set(), visited = new Set()) {
  if (Buffer.isBuffer(value)) {
    buffers.add(value);
    return buffers;
  }
  if (value === null || typeof value !== "object" || visited.has(value)) return buffers;
  visited.add(value);
  for (const nested of Object.values(value)) collectSourceBuffers(nested, buffers, visited);
  return buffers;
}

function bindingFor(input, channelRelationship, bootstrapRecipient, channelKey) {
  return Object.freeze({
    schemaVersion: "runa-control-worker-bootstrap-binding/v1",
    operationMode: input.operationMode,
    channelRelationship,
    bootstrapRecipient,
    operationId: input.operationId,
    channelId: input.channels[channelKey],
    requestId: input.requestId,
    nonce: input.nonce
  });
}

function recordFor(input, channelRelationship, bootstrapRecipient, poisonRecordSet) {
  const channelKey = {
    "control-coordinator": "controlCoordinator",
    "coordinator-materializer": "coordinatorMaterializer",
    "coordinator-broker": "coordinatorBroker"
  }[channelRelationship];
  const keyLayout = keyLayoutFor(input.operationMode, channelRelationship, bootstrapRecipient);
  const binding = bindingFor(input, channelRelationship, bootstrapRecipient, channelKey);
  let prefixBytes = null;
  let headerBytes = null;
  let payloadBytes = null;
  let phase = "constructing";
  let writeAttempted = false;
  let destroyed = false;

  const zeroGenerated = () => {
    zero(prefixBytes);
    zero(headerBytes);
    zero(payloadBytes);
  };
  const generatedBytesZeroized = () => allZero(prefixBytes) && allZero(headerBytes) && allZero(payloadBytes);

  try {
    const keyParts = [input.controlKeys[channelKey]];
    if (keyLayout.includes("git-stream-key")) keyParts.push(input.gitStreamKey);
    payloadBytes = Buffer.concat(keyParts.map(value => Buffer.from(value)));
    const header = bootstrapHeaderSchema.parse({
      ...binding,
      schemaVersion: "runa-control-worker-bootstrap-header/v1",
      keyLayout,
      payloadBytes: payloadBytes.length,
      payloadSha256: createHash("sha256").update(payloadBytes).digest("hex")
    });
    headerBytes = Buffer.from(canonicalStringify(header), "utf8");
    if (headerBytes.length > BOOTSTRAP_MAX_HEADER_BYTES) throw fail("bootstrap-header-too-large");
    prefixBytes = Buffer.alloc(BOOTSTRAP_LENGTH_PREFIX_BYTES);
    prefixBytes.writeUInt32BE(headerBytes.length, 0);
    phase = "ready";
  } catch (error) {
    phase = "construction-failed";
    zeroGenerated();
    throw error;
  }

  const state = () => Object.freeze({
    phase,
    writeAttempted,
    destroyed,
    generatedBytesZeroized: generatedBytesZeroized()
  });

  const writeOnce = async write => {
    if (phase !== "ready") {
      const error = fail("bootstrap-sender-already-consumed");
      poisonRecordSet(error);
      throw error;
    }
    phase = "writing";
    writeAttempted = true;
    try {
      await write(prefixBytes);
      if (phase !== "writing") throw fail("bootstrap-sender-destroyed-during-write");
      await write(headerBytes);
      if (phase !== "writing") throw fail("bootstrap-sender-destroyed-during-write");
      await write(payloadBytes);
      if (phase !== "writing") throw fail("bootstrap-sender-destroyed-during-write");
      phase = "consumed";
      return Object.freeze({ binding, wireBytes: BOOTSTRAP_LENGTH_PREFIX_BYTES + headerBytes.length + payloadBytes.length });
    } catch (error) {
      poisonRecordSet(error);
      throw error;
    } finally {
      zeroGenerated();
    }
  };

  const destroy = () => {
    zeroGenerated();
    destroyed = true;
    if (phase === "ready" || phase === "writing") phase = "destroyed";
    return state();
  };

  const poison = () => {
    zeroGenerated();
    destroyed = true;
    phase = "poisoned";
    return state();
  };
  const record = Object.freeze({ binding, writeOnce, destroy, state });
  return Object.freeze({ record, destroy, poison });
}

export function createBootstrapRecordSet(rawInput) {
  const sourceBuffers = collectSourceBuffers(rawInput);
  const recordOwners = [];
  const records = [];
  let operationMode = null;
  let destroyed = false;
  let poisoned = false;
  let phase = "constructing";
  const poisonRecordSet = () => {
    poisoned = true;
    destroyed = true;
    phase = "poisoned";
    for (const owner of recordOwners) owner.poison();
  };
  try {
    const input = bootstrapRecordSetSchema.parse(rawInput);
    operationMode = input.operationMode;
    const specifications = input.operationMode === "public-git"
      ? [
          ["control-coordinator", "control-to-coordinator"],
          ["coordinator-materializer", "control-to-coordinator"],
          ["coordinator-materializer", "control-to-materializer"],
          ["coordinator-broker", "control-to-coordinator"],
          ["coordinator-broker", "control-to-broker"]
        ]
      : [
          ["control-coordinator", "control-to-coordinator"],
          ["coordinator-materializer", "control-to-coordinator"],
          ["coordinator-materializer", "control-to-materializer"]
        ];
    for (const [relationship, recipient] of specifications) {
      const owner = recordFor(input, relationship, recipient, poisonRecordSet);
      recordOwners.push(owner);
      records.push(owner.record);
    }
    phase = "active";
  } catch (error) {
    for (const owner of recordOwners) owner.poison();
    throw error;
  } finally {
    for (const buffer of sourceBuffers) zero(buffer);
  }

  const state = () => Object.freeze({
    operationMode,
    recordCount: records.length,
    phase,
    poisoned,
    destroyed,
    generatedBytesZeroized: records.every(record => record.state().generatedBytesZeroized)
  });
  const destroy = () => {
    for (const owner of recordOwners) owner.destroy();
    destroyed = true;
    if (!poisoned) phase = "destroyed";
    return state();
  };
  return Object.freeze({ records: Object.freeze(records), destroy, state });
}

function sameBinding(header, binding) {
  return header.operationMode === binding.operationMode
    && header.channelRelationship === binding.channelRelationship
    && header.bootstrapRecipient === binding.bootstrapRecipient
    && header.operationId === binding.operationId
    && header.channelId === binding.channelId
    && header.requestId === binding.requestId
    && header.nonce === binding.nonce;
}

function createChannelKeyOwner(header, controlKey, gitStreamKey) {
  let destroyed = false;
  const state = () => Object.freeze({
    owner: "authenticated-channel",
    destroyed,
    zeroized: destroyed && allZero(controlKey) && allZero(gitStreamKey)
  });
  const destroy = () => {
    zero(controlKey);
    zero(gitStreamKey);
    destroyed = true;
    return state();
  };
  return Object.freeze({
    owner: "authenticated-channel",
    controlKeyName: header.keyLayout[0],
    controlKey,
    gitStreamKey,
    destroy,
    state
  });
}

export function createBootstrapAdmission(rawExpectation) {
  const expectation = bootstrapChannelBindingSchema.parse(rawExpectation);
  const prefixBytes = Buffer.alloc(BOOTSTRAP_LENGTH_PREFIX_BYTES);
  let phase = "await-prefix";
  let poisoned = false;
  let destroyed = false;
  let eofAccepted = false;
  let prefixOffset = 0;
  let headerLength = null;
  let headerBytes = null;
  let headerOffset = 0;
  let header = null;
  let payloadBytes = null;
  let payloadOffset = 0;
  let streamBytesReceived = 0;
  let pendingControlKey = null;
  let pendingGitStreamKey = null;
  let channelKeysTransferred = false;
  let zeroizationPerformed = false;

  const zeroWireCopies = () => {
    zero(prefixBytes);
    zero(headerBytes);
    zero(payloadBytes);
    zeroizationPerformed = true;
  };
  const zeroBootstrapCopies = () => {
    zeroWireCopies();
    zero(pendingControlKey);
    zero(pendingGitStreamKey);
  };
  const poison = error => {
    poisoned = true;
    phase = "poisoned";
    zeroBootstrapCopies();
    throw error;
  };
  const demandUsable = () => {
    if (poisoned) {
      zeroBootstrapCopies();
      throw fail("bootstrap-admission-poisoned");
    }
    if (destroyed) poison(fail("bootstrap-admission-destroyed"));
  };
  const demandPhase = expectedPhase => {
    demandUsable();
    if (phase !== expectedPhase) poison(fail("bootstrap-admission-transition-invalid"));
  };
  const status = () => Object.freeze({
    phase,
    poisoned,
    destroyed,
    eofAccepted,
    channelReady: phase === "eof-accepted",
    channelOpened: channelKeysTransferred,
    channelKeysTransferred,
    streamBytesReceived,
    headerBytesExpected: headerLength,
    headerBytesReceived: headerOffset,
    payloadBytesExpected: header?.payloadBytes ?? null,
    payloadBytesReceived: payloadOffset,
    headerBufferAllocated: Buffer.isBuffer(headerBytes),
    zeroizationPerformed,
    wireCopiesZeroized: allZero(prefixBytes) && allZero(headerBytes) && allZero(payloadBytes),
    pendingKeyCopiesZeroized: allZero(pendingControlKey) && allZero(pendingGitStreamKey),
    bootstrapCopiesZeroized: allZero(prefixBytes)
      && allZero(headerBytes)
      && allZero(payloadBytes)
      && allZero(pendingControlKey)
      && allZero(pendingGitStreamKey)
  });

  const parseCompletedHeader = () => {
    header = parseCanonicalWire(bootstrapHeaderSchema, headerBytes, BOOTSTRAP_MAX_HEADER_BYTES);
    if (!sameBinding(header, expectation)) throw fail("bootstrap-binding-mismatch");
    payloadBytes = Buffer.alloc(header.payloadBytes);
    phase = "await-payload";
  };

  const admitBytes = chunk => {
    demandUsable();
    try {
      if (!Buffer.isBuffer(chunk) || chunk.length === 0) throw fail("bootstrap-stream-chunk-invalid");
      if (phase === "await-eof" || phase === "eof-accepted" || phase === "channel-opened") {
        throw fail("bootstrap-admission-transition-invalid");
      }
      if (streamBytesReceived + chunk.length > BOOTSTRAP_MAX_WIRE_BYTES) {
        throw fail("bootstrap-wire-too-large");
      }
      streamBytesReceived += chunk.length;
      let chunkOffset = 0;
      while (chunkOffset < chunk.length) {
        if (phase === "await-prefix") {
          const byteCount = Math.min(BOOTSTRAP_LENGTH_PREFIX_BYTES - prefixOffset, chunk.length - chunkOffset);
          chunk.copy(prefixBytes, prefixOffset, chunkOffset, chunkOffset + byteCount);
          prefixOffset += byteCount;
          chunkOffset += byteCount;
          if (prefixOffset === BOOTSTRAP_LENGTH_PREFIX_BYTES) {
            headerLength = prefixBytes.readUInt32BE(0);
            if (headerLength < 1 || headerLength > BOOTSTRAP_MAX_HEADER_BYTES) {
              throw fail("bootstrap-header-length-invalid");
            }
            headerBytes = Buffer.alloc(headerLength);
            phase = "await-header";
          }
          continue;
        }
        if (phase === "await-header") {
          const byteCount = Math.min(headerLength - headerOffset, chunk.length - chunkOffset);
          chunk.copy(headerBytes, headerOffset, chunkOffset, chunkOffset + byteCount);
          headerOffset += byteCount;
          chunkOffset += byteCount;
          if (headerOffset === headerLength) parseCompletedHeader();
          continue;
        }
        if (phase === "await-payload") {
          const byteCount = Math.min(header.payloadBytes - payloadOffset, chunk.length - chunkOffset);
          chunk.copy(payloadBytes, payloadOffset, chunkOffset, chunkOffset + byteCount);
          payloadOffset += byteCount;
          chunkOffset += byteCount;
          if (payloadOffset === header.payloadBytes) phase = "await-eof";
          continue;
        }
        throw fail("bootstrap-trailing-bytes");
      }
      return status();
    } catch (error) {
      return poison(error);
    }
  };

  const end = () => {
    demandUsable();
    if (phase !== "await-eof") {
      if (phase === "await-prefix" || phase === "await-header" || phase === "await-payload") {
        return poison(fail("bootstrap-stream-truncated"));
      }
      return poison(fail("bootstrap-admission-transition-invalid"));
    }
    try {
      const observedDigest = createHash("sha256").update(payloadBytes).digest();
      const expectedDigest = Buffer.from(header.payloadSha256, "hex");
      const integrityMatches = timingSafeEqual(observedDigest, expectedDigest);
      zero(observedDigest);
      zero(expectedDigest);
      if (!integrityMatches) throw fail("bootstrap-payload-integrity-failed");
      pendingControlKey = Buffer.from(payloadBytes.subarray(0, BOOTSTRAP_KEY_BYTES));
      if (header.keyLayout.length === 2) {
        pendingGitStreamKey = Buffer.from(payloadBytes.subarray(BOOTSTRAP_KEY_BYTES));
      }
      zeroWireCopies();
      eofAccepted = true;
      phase = "eof-accepted";
      return status();
    } catch (error) {
      return poison(error);
    }
  };

  const openChannel = rawBinding => {
    demandPhase("eof-accepted");
    try {
      const binding = bootstrapChannelBindingSchema.parse(rawBinding);
      if (!sameBinding(header, binding) || !sameBinding(header, expectation)) {
        throw fail("bootstrap-channel-binding-mismatch");
      }
      const channelKeyOwner = createChannelKeyOwner(header, pendingControlKey, pendingGitStreamKey);
      pendingControlKey = null;
      pendingGitStreamKey = null;
      channelKeysTransferred = true;
      phase = "channel-opened";
      return channelKeyOwner;
    } catch (error) {
      return poison(error);
    }
  };

  const destroy = () => {
    zeroBootstrapCopies();
    destroyed = true;
    if (!poisoned) phase = "destroyed";
    return status();
  };

  return Object.freeze({ admitBytes, end, openChannel, destroy, state: status });
}
