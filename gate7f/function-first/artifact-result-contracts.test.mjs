import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  LIST_PRIVACY, READ_PRIVACY, RESULT_LIMITS, assertWireBudget, canonicalBase64, canonicalBoundedJson,
  canonicalFullReplacementDiff, canonicalTextBytes, decodeCanonicalBase64, requireSafeProjectPath,
  requireScalarString, resultDescriptorSchema, resultListInputSchema, resultListSchema, resultReadInputSchema,
  resultReadSchema,
} from "./artifact-result-contracts.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const owner = { kind: "conversation", chatId: "chat_01" };
const d = "a".repeat(64);
const xDigest = hash(Buffer.from("x"));
const provenance = { schemaVersion: "runaai-result-provenance/v1", type: "conversation-turn",
  chatId: "chat_01", turnOrdinal: 1, route: "general-chat", sourceRevision: d,
  evidenceSha256: d, contentSha256: xDigest };
const ready = { schemaVersion: "runaai-m1-result-descriptor/v1", resultId: `r1.${d}`, owner,
  ownerRevision: d, sourceRecordKind: "chat-turn", sourceRecordId: "turn:1", sourceRevision: d,
  kind: "conversation-answer", format: "txt", ordinal: 1, filename: "conversation-answer-000001.txt",
  mediaType: "text/plain; charset=utf-8", byteLength: 1, contentSha256: xDigest, readiness: "ready",
  errorCode: null, createdAt: "2026-09-04T00:00:00.000Z", provenance, privacy: LIST_PRIVACY };

test("request and response contracts are strict and state combinations are closed", () => {
  assert.equal(resultListInputSchema.safeParse({ owner }).success, true);
  assert.equal(resultListInputSchema.safeParse({ owner, taskId: "leak" }).success, false);
  assert.equal(resultReadInputSchema.safeParse({ owner, resultId: `r1.${d}`, contentSha256: d }).success, true);
  assert.equal(resultReadInputSchema.safeParse({ owner, resultId: `r1.${d}`, contentSha256: d, ordinal: 1 }).success, false);
  assert.equal(resultDescriptorSchema.safeParse(ready).success, true);
  assert.equal(resultDescriptorSchema.safeParse({ ...ready, filename: "chosen.txt" }).success, false);
  assert.equal(resultDescriptorSchema.safeParse({ ...ready, sourceRecordId: "turn:2" }).success, false);
  assert.equal(resultDescriptorSchema.safeParse({ ...ready, mediaType: "application/json; charset=utf-8" }).success, false);
  assert.equal(resultDescriptorSchema.safeParse({ ...ready, readiness: "pending", errorCode: "source-pending" }).success, false);
  const pending = { ...ready, byteLength: null, contentSha256: null, readiness: "pending", errorCode: "source-pending",
    provenance: { ...provenance, contentSha256: null } };
  assert.equal(resultDescriptorSchema.safeParse(pending).success, true);
  assert.equal(resultDescriptorSchema.safeParse({ ...pending, errorCode: "source-failed" }).success, false);
  const list = { schemaVersion: "runaai-m1-result-list/v1", owner, ownerRevision: d, results: [ready],
    privacy: LIST_PRIVACY };
  assert.equal(resultListSchema.safeParse(list).success, true);
  assert.equal(resultListSchema.safeParse({ ...list, ownerRevision: "b".repeat(64) }).success, false);
  assert.equal(resultListSchema.safeParse({ ...list, results: [{ ...ready, ordinal: 2,
    filename: "conversation-answer-000002.txt" }] }).success, false);
  assert.equal(resultListSchema.safeParse({ ...list, privateValuesIncluded: false }).success, false);
  const read = { schemaVersion: "runaai-m1-result-read/v1", descriptor: ready, encoding: "base64",
    contentBase64: "eA==", privacy: READ_PRIVACY };
  assert.equal(resultReadSchema.safeParse(read).success, true);
  assert.equal(resultReadSchema.safeParse({ ...read, encoding: "utf8" }).success, false);
  assert.equal(resultReadSchema.safeParse({ ...read, contentBase64: "not-base64" }).success, false);
  assert.equal(resultReadSchema.safeParse({ ...read, contentBase64: "eQ==" }).success, false);
  assert.equal(resultReadSchema.safeParse({ ...read, descriptor: { ...ready, filename: "chosen.txt" } }).success, false);
  assert.equal(resultReadSchema.safeParse({ ...read, descriptor: { ...ready, sourceRecordId: "turn:2" } }).success, false);
  assert.equal(resultReadSchema.safeParse({ ...read, descriptor: { ...ready,
    mediaType: "application/json; charset=utf-8" } }).success, false);
});

test("strict contracts and canonicalizers reject symbol, prototype, hidden, and accessor structure", () => {
  for (const mutate of [
    value => { value[Symbol("unknown")] = true; },
    value => { Object.defineProperty(value, "hidden", { value: true }); },
    value => { Object.defineProperty(value, "getter", { enumerable: true, get() { return true; } }); },
  ]) {
    const request = { owner: { kind: "conversation", chatId: "chat_01" } }; mutate(request);
    assert.equal(resultListInputSchema.safeParse(request).success, false);
    const bounded = { allowed: true }; mutate(bounded);
    assert.throws(() => canonicalBoundedJson(bounded), /result-source-invalid/u);
  }
  assert.equal(resultListInputSchema.safeParse(Object.assign(Object.create(null), { owner })).success, false);
  assert.throws(() => canonicalBoundedJson(Object.assign(Object.create(null), { allowed: true })),
    /result-source-invalid/u);
  const array = [1]; array[Symbol("unknown")] = 2;
  assert.throws(() => canonicalBoundedJson(array), /result-source-invalid/u);
  const inheritedArray = [1]; Object.setPrototypeOf(inheritedArray, Object.create(Array.prototype));
  assert.throws(() => canonicalBoundedJson(inheritedArray), /result-source-invalid/u);
  const response = { schemaVersion: "runaai-m1-result-list/v1", owner, ownerRevision: d,
    results: [], privacy: LIST_PRIVACY };
  Object.setPrototypeOf(response.results, Object.create(Array.prototype));
  assert.equal(resultListSchema.safeParse(response).success, false);
});

test("Unicode scalar and safe-text admission preserves allowed bytes and rejects controls", () => {
  const value = "  A\t😀\r\nB\n";
  assert.equal(requireScalarString(value, { safeText: true }), value);
  assert.deepEqual(canonicalTextBytes(value), Buffer.from(value, "utf8"));
  for (const invalid of ["\ud800", "\udc00", "a\0b", "a\u001bb", "a\u0085b", "a\u202eb", "a\u2066b"]) {
    assert.throws(() => requireScalarString(invalid, { safeText: true }), /result-source-invalid/u);
  }
});

test("BoundedJson uses recursive UTF-16 key order without ECMAScript array-index reordering", () => {
  const input = {};
  input["10"] = "ten";
  input["2"] = "two";
  input.a = { z: 1.25, a: [true, null, "x"] };
  assert.equal(canonicalBoundedJson(input), '{"10":"ten","2":"two","a":{"a":[true,null,"x"],"z":1.25}}');
  assert.throws(() => canonicalBoundedJson(-0), /result-source-invalid/u);
  assert.throws(() => canonicalBoundedJson(Number.POSITIVE_INFINITY), /result-source-invalid/u);
  assert.throws(() => canonicalBoundedJson(Array(1)), /result-source-invalid/u);
  const arrayWithHiddenValue = [1];
  Object.defineProperty(arrayWithHiddenValue, "hidden", { value: 2 });
  assert.throws(() => canonicalBoundedJson(arrayWithHiddenValue), /result-source-invalid/u);
  const accessor = {};
  Object.defineProperty(accessor, "x", { enumerable: true, get() { return 1; } });
  assert.throws(() => canonicalBoundedJson(accessor), /result-source-invalid/u);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalBoundedJson(cyclic), /result-source-invalid/u);
  let deep = "x";
  for (let index = 0; index < 9; index += 1) deep = [deep];
  assert.throws(() => canonicalBoundedJson(deep), /result-source-invalid/u);
  assert.throws(() => canonicalBoundedJson("x".repeat(RESULT_LIMITS.maximumBoundedJsonBytes)), /result-source-invalid/u);
});

test("project paths are exact POSIX-relative ASCII paths", () => {
  for (const value of ["main.js", "src/lib/a-1.js", "A/hidden/file_1.txt"]) assert.equal(requireSafeProjectPath(value), value);
  for (const value of ["", "/main.js", "../main.js", "src/./a.js", "src//a.js", "C:/a.js", "a\\b.js", "a%2fb.js",
    "a b.js", ".hidden/a.js", "é.js"]) assert.throws(() => requireSafeProjectPath(value), /result-source-invalid/u);
});

test("full-replacement diff bytes are exact for add delete change and terminal newline", () => {
  assert.equal(canonicalFullReplacementDiff({ path: "a.js", before: "", after: "x\n" }).toString(),
    "--- a/a.js\n+++ b/a.js\n@@ -0,0 +1,1 @@\n+x\n");
  assert.equal(canonicalFullReplacementDiff({ path: "a.js", before: "x\n", after: "" }).toString(),
    "--- a/a.js\n+++ b/a.js\n@@ -1,1 +0,0 @@\n-x\n");
  assert.equal(canonicalFullReplacementDiff({ path: "a.js", before: "old", after: "new" }).toString(),
    "--- a/a.js\n+++ b/a.js\n@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n");
  assert.throws(() => canonicalFullReplacementDiff({ path: "a.js", before: "x\r\n", after: "y\n" }),
    /result-source-invalid/u);
  assert.throws(() => canonicalFullReplacementDiff({ path: "a.js", before: "x", after: "x" }),
    /result-source-invalid/u);
});

test("text result ceiling is inclusive and oversize has no returned bytes", () => {
  assert.equal(canonicalTextBytes("x".repeat(131_072)).length, 131_072);
  assert.throws(() => canonicalTextBytes("x".repeat(131_073)), error => error.code === "result-too-large");
});

test("BoundedJson and diff enforce their exact inclusive byte ceilings", () => {
  const exactJson = "x".repeat(RESULT_LIMITS.maximumBoundedJsonBytes - 2);
  assert.equal(Buffer.byteLength(canonicalBoundedJson(exactJson)), RESULT_LIMITS.maximumBoundedJsonBytes);
  assert.throws(() => canonicalBoundedJson(`${exactJson}x`), /result-source-invalid/u);
  const oneByte = canonicalFullReplacementDiff({ path: "a.js", before: "", after: "x" });
  const exactLength = 1 + RESULT_LIMITS.maximumResultBytes - oneByte.length;
  const exactDiff = canonicalFullReplacementDiff({ path: "a.js", before: "", after: "x".repeat(exactLength) });
  assert.equal(exactDiff.length, RESULT_LIMITS.maximumResultBytes);
  assert.throws(() => canonicalFullReplacementDiff({ path: "a.js", before: "",
    after: "x".repeat(exactLength + 1) }), error => error.code === "result-too-large");
});

test("base64 decode requires canonical spelling, exact length and digest", () => {
  const bytes = Buffer.from([0, 1, 2, 253, 254, 255]);
  const encoded = canonicalBase64(bytes), digest = hash(bytes);
  assert.equal(encoded, "AAEC/f7/");
  assert.deepEqual(decodeCanonicalBase64(encoded, { byteLength: bytes.length, contentSha256: digest }), bytes);
  assert.throws(() => decodeCanonicalBase64(`${encoded}=`, { byteLength: bytes.length, contentSha256: digest }));
  assert.throws(() => decodeCanonicalBase64(encoded, { byteLength: bytes.length + 1, contentSha256: digest }));
  assert.throws(() => decodeCanonicalBase64(encoded, { byteLength: bytes.length, contentSha256: d }));
});

test("ordinary JSON wire budgets are enforced on complete response objects", () => {
  const exact = { value: "x".repeat(20) };
  const bytes = Buffer.byteLength(JSON.stringify(exact));
  assert.equal(assertWireBudget(exact, bytes, "result-list-too-large"), bytes);
  assert.throws(() => assertWireBudget(exact, bytes - 1, "result-list-too-large"),
    error => error.code === "result-list-too-large");
});
