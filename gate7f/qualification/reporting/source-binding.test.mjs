import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { responseDigest } from "./judgments.mjs";
import { bindJudgmentBundleSource, validateJudgmentBundleSource } from "./source-binding.mjs";

// Only fabricated packet bytes/records. No real model output or expected acceptance answers are read.
function fixture() {
  const expectedIdentities = Array.from({ length: 39 }, (_, index) =>
    Array.from({ length: 3 }, (_, attempt) => ({ caseId: `fabricated-${index}`, attempt: attempt + 1, turnIndex: 0 }))).flat();
  const responses = expectedIdentities.map((identity, index) => ({ ...identity,
    content: index === 1 ? null : `Fabricated response ${index}.\n`,
    toolCalls: index === 1 ? [{ id: "call-fixture", type: "function", function: { name: "workspace_inspect", arguments: '{ "path": "sample.txt" }' } }] : [],
    finishReason: index === 1 ? "tool_calls" : index === 2 ? "length" : "stop" }));
  const packet = { schemaVersion: "runa2-qualification-blind-review-packet/v1", candidateLabel: "Candidate-A", responses,
    acceptancePrefixSha256: "a".repeat(64), suppliedBundleSha256: "b".repeat(64), fullCaptureVerificationPending: true };
  const records = responses.map(row => {
    const response = { content: row.content, toolCalls: structuredClone(row.toolCalls) };
    return { caseId: row.caseId, attempt: row.attempt, turnIndex: row.turnIndex, response,
      responseSha256: responseDigest(response),
      transport: { status: row.finishReason === "length" ? "incomplete-response" : "completed", finishReason: row.finishReason,
        errorCode: null, ...(row.finishReason === "length" ? { reason: "Fabricated truncated transport." } : {}) },
      deterministic: { status: "review-required", checks: [] },
      semantic: { outcome: "review-required", reason: "Fabricated fixture, no semantic grading here.", evidence: [], reviewQuestion: "Independent meaning review remains required." } };
  });
  const bundle = { schemaVersion: "runa2-gate7f-qualification-judgments/v1", armId: "blind-candidate-a",
    records, evaluator: { id: "fabricated-evaluator" } };
  const encode = () => Buffer.from(JSON.stringify(packet, null, 2) + "\n");
  const packetBytes = encode();
  return { bundle, packet, packetBytes, expectedPacketSha256: createHash("sha256").update(packetBytes).digest("hex"),
    expectedIdentities, expectedArmId: "blind-candidate-a", encode };
}

test("all 117 exact source turns bind without modifying prose, judgments, or truncation", () => {
  const f = fixture(), original = structuredClone(f.bundle);
  const bound = bindJudgmentBundleSource(f);
  assert.deepEqual(f.bundle, original);
  assert.deepEqual(bound.records, original.records);
  assert.equal(bound.sourcePacket.sha256, f.expectedPacketSha256);
  assert.equal(bound.sourcePacket.packetCandidateLabel, "Candidate-A");
  assert.equal(bound.sourcePacket.semanticJudgmentsAutomaticallyValidated, false);
  assert.equal(bound.sourcePacket.rawCaptureVerificationRequired, true);
  assert.equal(bound.records[2].transport.status, "incomplete-response");
  assert.equal(validateJudgmentBundleSource({ ...f, bundle: bound }).passed, true);
});

test("a locally rehashed replacement response is rejected against original source bytes", () => {
  const f = fixture();
  f.bundle.records[0].response.content = "An improved answer.";
  f.bundle.records[0].responseSha256 = responseDigest(f.bundle.records[0].response);
  assert.throws(() => bindJudgmentBundleSource(f), /response-replaced/);
});

test("whitespace, Unicode or trailing newline changes are not silently normalized", () => {
  for (const content of ["Fabricated response 0.", "Fabricated response 0. \n", "Fäbricated response 0.\n"]) {
    const f = fixture();f.bundle.records[0].response.content = content;
    f.bundle.records[0].responseSha256 = responseDigest(f.bundle.records[0].response);
    assert.throws(() => bindJudgmentBundleSource(f), /response-replaced/);
  }
});

test("tool arguments, call ID and metadata must equal the packet exactly", () => {
  for (const change of [
    call => { call.function.arguments = '{"path":"sample.txt"}'; },
    call => { call.function.arguments = '{"path":"other.txt"}'; },
    call => { call.id = "different-call"; },
    call => { call.model = "extra-provider-metadata"; },
  ]) {
    const f = fixture();change(f.bundle.records[1].response.toolCalls[0]);
    f.bundle.records[1].responseSha256 = responseDigest(f.bundle.records[1].response);
    assert.throws(() => bindJudgmentBundleSource(f), /response-replaced/);
  }
});

test("native tool call order is part of the original response binding", () => {
  const f = fixture();
  f.packet.responses[1].toolCalls.push({ id: "second-call", type: "function",
    function: { name: "workspace_inspect", arguments: '{"path":"second.txt"}' } });
  f.bundle.records[1].response.toolCalls = structuredClone(f.packet.responses[1].toolCalls);
  f.bundle.records[1].responseSha256 = responseDigest(f.bundle.records[1].response);
  f.packetBytes = f.encode();f.expectedPacketSha256 = createHash("sha256").update(f.packetBytes).digest("hex");
  assert.equal(bindJudgmentBundleSource(f).sourcePacket.records, 117);
  f.bundle.records[1].response.toolCalls.reverse();
  f.bundle.records[1].responseSha256 = responseDigest(f.bundle.records[1].response);
  assert.throws(() => bindJudgmentBundleSource(f), /response-replaced/);
});

test("source packet byte hash rejects replacement or reformatting after the root pinned it", () => {
  const f = fixture();
  assert.throws(() => bindJudgmentBundleSource({ ...f, packetBytes: JSON.stringify(f.packet) }), /packet-hash-mismatch/);
  f.packet.responses[0].content = "Replacement source.";
  assert.throws(() => bindJudgmentBundleSource({ ...f, packetBytes: f.encode() }), /packet-hash-mismatch/);
  assert.throws(() => bindJudgmentBundleSource({ ...f, expectedPacketSha256: null }), /pinned-packet-hash-required/);
});

test("truncation finish reason cannot be relabeled even if the answer is otherwise acceptable", () => {
  const f = fixture();f.bundle.records[2].transport.finishReason = "stop";
  f.bundle.records[2].transport.status = "completed";
  assert.throws(() => bindJudgmentBundleSource(f), /finish-reason-replaced/);
  const statusOnly = fixture();statusOnly.bundle.records[2].transport.status = "completed";
  assert.throws(() => bindJudgmentBundleSource(statusOnly), /transport-status-relabeled/);
});

test("a completed source response cannot be invented as a provider failure", () => {
  const f = fixture();f.bundle.records[0].transport.status = "provider-failure";
  assert.throws(() => bindJudgmentBundleSource(f), /transport-status-relabeled/);
});

test("missing, duplicate, extra and substituted record identities never shrink the denominator", () => {
  for (const mutate of [
    f => f.bundle.records.pop(),
    f => f.bundle.records.push(structuredClone(f.bundle.records[0])),
    f => { f.bundle.records[1] = structuredClone(f.bundle.records[0]); },
    f => { f.bundle.records[0].caseId = "unapproved-case"; },
  ]) { const f = fixture();mutate(f);assert.throws(() => bindJudgmentBundleSource(f)); }
});

test("the packet itself must have the same unique 117 approved identities", () => {
  const f = fixture();f.packet.responses[1] = structuredClone(f.packet.responses[0]);
  f.packetBytes = f.encode();f.expectedPacketSha256 = createHash("sha256").update(f.packetBytes).digest("hex");
  assert.throws(() => bindJudgmentBundleSource(f), /packet-duplicate-turn/);
  const expected = fixture();expected.expectedIdentities[1] = expected.expectedIdentities[0];
  assert.throws(() => bindJudgmentBundleSource(expected), /expected-duplicates/);
});

test("reordering records preserves all exact bindings and the response-set digest", () => {
  const f = fixture(), first = bindJudgmentBundleSource(f);
  f.bundle.records.reverse();const second = bindJudgmentBundleSource(f);
  assert.equal(first.sourcePacket.responseBindingsSha256, second.sourcePacket.responseBindingsSha256);
  assert.equal(second.records[0].caseId, f.bundle.records[0].caseId);
});

test("anonymous source arm and explicit expected arm cannot be crossed", () => {
  const f = fixture();
  assert.throws(() => bindJudgmentBundleSource({ ...f, expectedArmId: "blind-candidate-b" }), /anonymous-arm-binding/);
  f.bundle.armId = "blind-candidate-b";
  assert.throws(() => bindJudgmentBundleSource(f), /bundle-arm-mismatch/);
});

test("missing, changed, or previously conflicting source provenance cannot be silently replaced", () => {
  const f = fixture();
  assert.throws(() => validateJudgmentBundleSource(f), /provenance-missing-or-altered/);
  const bound = bindJudgmentBundleSource(f);bound.sourcePacket.sha256 = "0".repeat(64);
  assert.throws(() => validateJudgmentBundleSource({ ...f, bundle: bound }), /provenance-missing-or-altered/);
  assert.throws(() => bindJudgmentBundleSource({ ...f, bundle: bound }), /existing-binding-mismatch/);
});

test("semantic judgments remain unchanged and are not inferred from the source-binding pass", () => {
  const f = fixture();
  f.bundle.records[0].semantic = { outcome: "critical-error", reason: "Needs independent review, not a conclusion of this fabricated test.", evidence: [] };
  const first = bindJudgmentBundleSource(f);
  assert.deepEqual(first.records[0].semantic, f.bundle.records[0].semantic);
  f.bundle.records[0].semantic = { outcome: "acceptable", reason: "Different fabricated judgment; source binding does not decide meaning.", evidence: [] };
  const second = bindJudgmentBundleSource(f);
  assert.equal(first.sourcePacket.responseBindingsSha256, second.sourcePacket.responseBindingsSha256);
  assert.equal(second.sourcePacket.semanticJudgmentsAutomaticallyValidated, false);
});
