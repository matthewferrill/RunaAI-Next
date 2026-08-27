import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { responseDigest, turnKey } from "./judgments.mjs";

const clone = value => structuredClone(value);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const exactKeys = (value, expected, code) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), code);
};
const identity = value => {
  assert.ok(typeof value?.caseId === "string" && value.caseId.length > 0, "judgment-source-case-id-invalid");
  assert.ok(Number.isSafeInteger(value.attempt) && value.attempt >= 1, "judgment-source-attempt-invalid");
  assert.ok(Number.isSafeInteger(value.turnIndex) && value.turnIndex >= 0, "judgment-source-turn-invalid");
  return turnKey(value);
};

function indexIdentities(rows, expected, label) {
  assert.ok(Array.isArray(rows), `judgment-source-${label}-array-required`);
  assert.equal(rows.length, 117, `judgment-source-${label}-count`);
  const indexed = new Map();
  for (const row of rows) {
    const key = identity(row);
    assert.ok(expected.has(key), `judgment-source-${label}-unexpected-turn`);
    assert.ok(!indexed.has(key), `judgment-source-${label}-duplicate-turn`);
    indexed.set(key, row);
  }
  assert.equal(indexed.size, expected.size, `judgment-source-${label}-missing-turn`);
  return indexed;
}

function packetResponse(row) {
  exactKeys(row, ["caseId", "attempt", "turnIndex", "content", "toolCalls", "finishReason"], "judgment-source-packet-row-shape");
  assert.ok(typeof row.content === "string" || row.content === null, "judgment-source-packet-content-invalid");
  assert.ok(Array.isArray(row.toolCalls), "judgment-source-packet-calls-invalid");
  for (const call of row.toolCalls) {
    exactKeys(call, ["id", "type", "function"], "judgment-source-packet-call-metadata");
    exactKeys(call.function, ["name", "arguments"], "judgment-source-packet-function-metadata");
    assert.equal(call.type, "function", "judgment-source-packet-call-type");
    assert.ok(typeof call.id === "string" && call.id.length > 0, "judgment-source-packet-call-id");
    assert.ok(typeof call.function.name === "string" && call.function.name.length > 0, "judgment-source-packet-call-name");
    assert.equal(typeof call.function.arguments, "string", "judgment-source-packet-call-arguments");
  }
  assert.equal(new Set(row.toolCalls.map(call => call.id)).size, row.toolCalls.length, "judgment-source-packet-duplicate-call-id");
  assert.ok(["stop", "tool_calls", "length"].includes(row.finishReason), "judgment-source-packet-finish-reason");
  return { content: row.content, toolCalls: clone(row.toolCalls) };
}

/**
 * Verify byte-pinned anonymized source, not prose meaning. The root must pin the packet hash before
 * adjudication and separately verify its raw capture/package provenance. expectedIdentities comes
 * from expectedTurnIdentities(frozenCorpus); it is not inferred from whichever judgments were kept.
 * expectedArmId is an explicit anonymous label, never a model name or candidate mapping.
 */
function checkedSource({ bundle, packetBytes, expectedPacketSha256, expectedIdentities, expectedArmId }) {
  assert.ok(Buffer.isBuffer(packetBytes) || packetBytes instanceof Uint8Array || typeof packetBytes === "string",
    "judgment-source-packet-bytes-required");
  const bytes = Buffer.from(packetBytes);
  assert.ok(digest(expectedPacketSha256), "judgment-source-pinned-packet-hash-required");
  assert.equal(hash(bytes), expectedPacketSha256, "judgment-source-packet-hash-mismatch");
  const packet = JSON.parse(bytes.toString("utf8"));
  assert.equal(packet.schemaVersion, "runa2-qualification-blind-review-packet/v1", "judgment-source-packet-schema");
  assert.match(packet.candidateLabel, /^Candidate-[AB]$/, "judgment-source-anonymous-packet-label");
  assert.equal(expectedArmId, `blind-${packet.candidateLabel.toLowerCase()}`, "judgment-source-anonymous-arm-binding");
  assert.equal(bundle?.armId, expectedArmId, "judgment-source-bundle-arm-mismatch");
  assert.equal(bundle.schemaVersion, "runa2-gate7f-qualification-judgments/v1", "judgment-source-bundle-schema");
  assert.ok(Array.isArray(expectedIdentities) && expectedIdentities.length === 117, "judgment-source-expected-count");
  const expectedKeys = expectedIdentities.map(identity), expected = new Set(expectedKeys);
  assert.equal(expected.size, 117, "judgment-source-expected-duplicates");
  const packetRows = indexIdentities(packet.responses, expected, "packet");
  const records = indexIdentities(bundle.records, expected, "records");
  const bindings = [];
  for (const key of expectedKeys) {
    const packetRow = packetRows.get(key), record = records.get(key), response = packetResponse(packetRow);
    exactKeys(record.response, ["content", "toolCalls"], "judgment-source-record-response-shape");
    assert.deepEqual(record.response, response, "judgment-source-response-replaced");
    const responseSha256 = responseDigest(response);
    assert.equal(record.responseSha256, responseSha256, "judgment-source-response-digest-mismatch");
    assert.equal(record.transport?.finishReason, packetRow.finishReason, "judgment-source-finish-reason-replaced");
    const status = packetRow.finishReason === "length" ? "incomplete-response" : "completed";
    assert.equal(record.transport.status, status, "judgment-source-transport-status-relabeled");
    bindings.push({ turnId: key, responseSha256, finishReason: packetRow.finishReason, transportStatus: status });
  }
  for (const field of ["acceptancePrefixSha256", "suppliedBundleSha256"]) {
    if (packet[field] !== undefined) assert.ok(digest(packet[field]), `judgment-source-${field}-invalid`);
  }
  return {
    schemaVersion: "runa2-qualification-judgment-source/v1",
    sha256: expectedPacketSha256,
    packetCandidateLabel: packet.candidateLabel,
    armId: expectedArmId,
    records: 117,
    acceptancePrefixSha256: packet.acceptancePrefixSha256 ?? null,
    suppliedBundleSha256: packet.suppliedBundleSha256 ?? null,
    responseBindingsSha256: responseDigest(bindings),
    rawCaptureVerificationRequired: true,
    semanticJudgmentsAutomaticallyValidated: false,
  };
}

/** Attach provenance only; never change a response, finish reason, deterministic result or judgment. */
export function bindJudgmentBundleSource(options) {
  const sourcePacket = checkedSource(options);
  if (options.bundle.sourcePacket !== undefined) {
    assert.deepEqual(options.bundle.sourcePacket, sourcePacket, "judgment-source-existing-binding-mismatch");
  }
  return { ...clone(options.bundle), sourcePacket };
}

/** Use again immediately before final aggregation/publication, along with validateJudgmentBundle. */
export function validateJudgmentBundleSource(options) {
  const sourcePacket = checkedSource(options);
  assert.deepEqual(options.bundle.sourcePacket, sourcePacket, "judgment-source-provenance-missing-or-altered");
  return { schemaVersion: "runa2-qualification-judgment-source-verification/v1", passed: true,
    sourcePacket: clone(sourcePacket), responseTurns: 117, semanticJudgmentsAutomaticallyValidated: false };
}
