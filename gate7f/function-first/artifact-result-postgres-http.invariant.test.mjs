import assert from "node:assert/strict";
import test from "node:test";

import { assertCompletedInvariant } from "./artifact-result-postgres-http.integration-child.mjs";

function snapshot(contentSha256) {
  return { schemaVersion: "runaai-artifact-result-authority-snapshot/v1",
    schemas: [{ schemaName: "runa_core" }],
    inventory: [{ schemaName: "runa_core", tableName: "chat_turns" }],
    tables: [{ schemaName: "runa_core", tableName: "chat_turns", rowCount: 1, contentSha256 }] };
}

test("request failures cannot bypass or mask the completed authority invariant", () => {
  const requestError = Object.assign(new Error("synthetic-request-failed"), { code: "synthetic-request-failed" });
  const before = snapshot("a".repeat(64));
  const mutated = snapshot("b".repeat(64));

  let mutationFailure = null;
  try { assertCompletedInvariant({ before, after: mutated, requestError }); }
  catch (error) { mutationFailure = error; }
  assert.ok(mutationFailure instanceof AggregateError);
  assert.equal(mutationFailure.errors.length, 2);
  assert.strictEqual(mutationFailure.errors[0], requestError);
  assert.equal(mutationFailure.errors[1].name, "AssertionError");
  assert.match(mutationFailure.errors[1].message, /Expected values to be strictly deep-equal/u);

  const snapshotError = Object.assign(new Error("synthetic-snapshot-failed"), { code: "synthetic-snapshot-failed" });
  let snapshotFailure = null;
  try { assertCompletedInvariant({ before, after: null, requestError, snapshotError }); }
  catch (error) { snapshotFailure = error; }
  assert.ok(snapshotFailure instanceof AggregateError);
  assert.deepEqual(snapshotFailure.errors, [requestError, snapshotError]);
  assert.doesNotThrow(() => assertCompletedInvariant({ before, after: structuredClone(before) }));
});
