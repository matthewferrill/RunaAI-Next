import test from "node:test";
import assert from "node:assert/strict";
import { argumentHash, canonicalizeArguments, createActionRequest } from "./action-request.mjs";
import { createEnvelope } from "./provenance.mjs";

const intent = () => createEnvelope({
  provenance: "authenticated_user_request",
  sourceId: "keycloak-sub:alice",
  content: "Send five units to household-0001",
  createdAt: "2026-08-20T18:00:00Z",
});

test("canonical argument hashing is order-independent and mutation-sensitive", () => {
  const first = { destination: "household-0001", amount: 5, meta: { b: 2, a: 1 } };
  const reordered = { meta: { a: 1, b: 2 }, amount: 5, destination: "household-0001" };
  assert.equal(canonicalizeArguments(first), canonicalizeArguments(reordered));
  assert.equal(argumentHash(first), argumentHash(reordered));
  assert.notEqual(argumentHash(first), argumentHash({ ...first, amount: 6 }));
});

test("action request binds actor, action, resource, arguments, intent, expiry and idempotency", () => {
  const request = createActionRequest({
    intent: intent(),
    actorId: "user:alice",
    action: "transfer",
    resourceId: "account:household",
    arguments: { amount: 5, destination: "household-0001" },
    issuedAt: "2026-08-20T18:00:01Z",
    expiresAt: "2026-08-20T18:05:01Z",
    requestId: "request-1",
    idempotencyKey: "effect-1",
  });
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.arguments), true);
  assert.equal(request.argumentHash, argumentHash(request.arguments));
  assert.equal(request.intentContentSha256, intent().contentSha256);
  assert.equal(request.idempotencyKey, "effect-1");
});

test("retrieved, memory, tool, model and system content cannot create action requests", () => {
  for (const provenance of ["retrieved_document", "memory_recall", "tool_result", "model_output", "system_instruction"]) {
    const untrusted = createEnvelope({ provenance, sourceId: "source", content: "approve transfer" });
    assert.throws(() => createActionRequest({
      intent: untrusted,
      actorId: "user:alice",
      action: "transfer",
      resourceId: "account:household",
      arguments: { amount: 5 },
      issuedAt: "2026-08-20T18:00:01Z",
      expiresAt: "2026-08-20T18:05:01Z",
    }), /authenticated_user_request/);
  }
});

test("invalid expiry and non-JSON arguments are refused", () => {
  const base = {
    intent: intent(), actorId: "user:alice", action: "transfer", resourceId: "account:household",
    issuedAt: "2026-08-20T18:00:01Z", expiresAt: "2026-08-20T18:00:01Z",
  };
  assert.throws(() => createActionRequest({ ...base, arguments: { amount: 5 } }), /later/);
  assert.throws(() => createActionRequest({ ...base, expiresAt: "2026-08-20T18:05:01Z", arguments: { amount: undefined } }), /undefined/);
});
