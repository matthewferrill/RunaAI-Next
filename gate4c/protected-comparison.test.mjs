import assert from "node:assert/strict";
import test from "node:test";
import { createEnvelopeCipher } from "../gate4/envelope.mjs";
import { assertProtectedComparisonAuthority, buildProtectedComparisonResult, COMPARISON_SCOPES,
  emptyScopeTally, sanitizeProtectedComparisonPass, tallyProtectedScopes } from "./protected-comparison.mjs";

const commitA = "a".repeat(40); const commitB = "b".repeat(40);
const authority = { legacyCommit: commitA, nextCommit: commitB, clean: true,
  ownerIdentityVerified: true, sourcePinsVerified: true };
const tally = values => ({ ...emptyScopeTally(), ...values });
const pass = (legacy = tally({ personal: 2, project: 1 }), projected = legacy) => ({ sourceEntries: 90,
  sourceIntegrityHealthy: true, legacy: { activeCount: 3, byScope: legacy },
  projected: { activeCount: 3, byScope: projected } });

test("Gate 4C-2 result retains only aggregate allowlisted evidence", () => {
  const result = buildProtectedComparisonResult({ authority, first: pass(), second: pass(), sourceUnchanged: true });
  assert.equal(result.passed, true); assert.equal(result.checks.countsEqual, true);
  assert.deepEqual(Object.keys(result), ["schemaVersion", "authority", "source", "legacy", "projected", "checks", "disallowedFieldsEmitted", "passed"]);
  assert.equal(JSON.stringify(result).includes("lesson"), false);
});

test("count, scope, repeatability, and source changes fail the gate", () => {
  const changedScope = pass(tally({ personal: 2, project: 1 }), tally({ personal: 1, project: 2 }));
  assert.equal(buildProtectedComparisonResult({ authority, first: changedScope, second: changedScope, sourceUnchanged: true }).passed, false);
  const changedCount = pass(); changedCount.projected = { activeCount: 2, byScope: tally({ personal: 1, project: 1 }) };
  assert.equal(buildProtectedComparisonResult({ authority, first: changedCount, second: changedCount, sourceUnchanged: true }).passed, false);
  assert.equal(buildProtectedComparisonResult({ authority, first: pass(), second: changedScope, sourceUnchanged: true }).passed, false);
  assert.equal(buildProtectedComparisonResult({ authority, first: pass(), second: pass(), sourceUnchanged: false }).passed, false);
});

test("aggregate sanitization rejects extra fields, unknown scopes, and inconsistent totals", () => {
  assert.throws(() => sanitizeProtectedComparisonPass({ ...pass(), lesson: "private" }), /disallowed fields/);
  assert.throws(() => tallyProtectedScopes([{ scope: "ethical-amendment-proposal" }]), error => error.code === "protected-comparison-scope-invalid");
  const inconsistent = pass(); inconsistent.legacy.activeCount = 4;
  assert.throws(() => sanitizeProtectedComparisonPass(inconsistent), /scope counts/);
  assert.deepEqual(Object.keys(tallyProtectedScopes([])), COMPARISON_SCOPES);
});

test("authority verifies owner, clean exact branches, commits, and every legacy source pin", () => {
  const calls = []; const exec = (file, args) => {
    calls.push([file, args]);
    if (file === "hostname") return "RUNA-CONTROL\n";
    if (file === "whoami") return "RUNA-CONTROL\\Matthew\n";
    const repo = args[3]; const command = args.slice(4);
    if (command[0] === "rev-parse" && command[1] === "HEAD") return `${repo.includes("legacy") ? commitA : commitB}\n`;
    if (command[0] === "branch") return `${repo.includes("legacy") ? "main" : "runa2/gate-4c-protected-comparison"}\n`;
    if (command[0] === "status") return "";
    if (command[0] === "rev-parse" && command[1].startsWith("HEAD:")) return `${"c".repeat(40)}\n`;
    throw new Error("unexpected command");
  };
  const result = assertProtectedComparisonAuthority({ legacyRepo: "C:\\legacy", nextRepo: "C:\\next",
    expectedLegacyCommit: commitA, expectedNextCommit: commitB,
    sourcePins: { schemaVersion: "v", recordedAt: "x", integrationBase: "x", controlLegacyHead: "x",
      publishedLegacyMainObserved: "x", historyStatus: "x", selectedSourceContentEquivalentAcrossObservedCheckouts: true,
      sources: [{ path: "one.mjs", gitBlobSha1: "c".repeat(40) }] }, exec });
  assert.equal(result.sourcePinsVerified, true); assert.equal(calls.at(-1)[1].at(-1), "HEAD:one.mjs");
});

test("authority fails before Git source access when owner identity is wrong", () => {
  let calls = 0; const exec = file => { calls += 1; return file === "hostname" ? "OTHER\n" : "user\n"; };
  assert.throws(() => assertProtectedComparisonAuthority({ legacyRepo: "C:\\legacy", nextRepo: "C:\\next",
    expectedLegacyCommit: commitA, expectedNextCommit: commitB, sourcePins: {}, exec }),
  error => error.code === "protected-comparison-owner-authority-mismatch");
  assert.equal(calls, 1);
});

test("disposable envelope ciphers destroy their copied key material", () => {
  const cipher = createEnvelopeCipher({ encryptionKey: Buffer.alloc(32, 1), hmacKey: Buffer.alloc(32, 2) });
  cipher.digest({ value: "before" }); assert.deepEqual(cipher.destroy(), { destroyed: true });
  assert.throws(() => cipher.digest({ value: "after" }), error => error.code === "envelope-key-destroyed");
  assert.deepEqual(cipher.destroy(), { destroyed: true });
});
