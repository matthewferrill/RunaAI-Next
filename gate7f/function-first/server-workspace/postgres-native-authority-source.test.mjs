import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./postgres.mjs", import.meta.url);

function between(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, start); assert.notEqual(to, -1, end);
  return source.slice(from, to);
}

function lockedOuterJoinQueries(source) {
  const outerJoin = /\b(?:LEFT|RIGHT|FULL)(?:\s+OUTER)?\s+JOIN\b/iu;
  const rowLock = /\bFOR\s+(?:NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\b/iu;
  return [...source.matchAll(/\.query\s*\(\s*`([\s\S]*?)`/gu)]
    .map(match => match[1])
    .filter(sql => outerJoin.test(sql) && rowLock.test(sql));
}

test("candidate PostgreSQL source is additive and stores immutable encrypted authority and publication evidence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /const s = this\.sqlSchema/u);
  for (const table of ["operation_authorities", "workspace_effect_claims",
    "workspace_publication_authorities", "outbox"]) {
    assert.match(source, new RegExp("CREATE TABLE IF NOT EXISTS \\$\\{s\\}\\." + table, "u"));
  }
  assert.match(source, /operation_authorities_immutable/u);
  assert.match(source, /workspace_effect_claims_immutable/u);
  assert.match(source, /workspace_publication_authorities_immutable/u);
  assert.match(source, /authority_envelope_sha256/u);
  assert.match(source, /authority_manifest_digest/u);
  assert.match(source, /this\.encode\("publication-authority"/u);
  assert.doesNotMatch(source, /DROP TABLE[\s\S]*(?:operation_authorities|workspace_effect_claims|workspace_publication_authorities)/u);
});

test("scoped admission locks only exact principal project source and returns verified retained locators", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = between(source, "async admitMaterializationRequest", "async beginMaterialization");
  assert.match(body, /principal_id=\$1 AND project_id=\$2 AND source_id=\$3 FOR UPDATE/u);
  assert.match(body, /request_scope_digest=\$4 FOR UPDATE OF authority,workspace/u);
  assert.match(body, /this\.#candidateAuthorityFromRow/u);
  assert.match(body, /disposition: "reconciliation-required"/u);
  assert.doesNotMatch(body, /count\(\*\)|LIMIT\s+\d+|OFFSET|readdir|glob/u);
});

test("outer-join row locks name only the concrete workspace side", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const lockedOuterJoins = lockedOuterJoinQueries(source);
  assert.equal(lockedOuterJoins.length, 2);
  const migration = lockedOuterJoins.find(sql => sql.includes("workspace_row.lifecycle IN"));
  const admission = lockedOuterJoins.find(sql => sql.includes("workspace.lifecycle IN"));
  assert.ok(migration); assert.ok(admission);
  assert.match(migration, /\bFOR\s+UPDATE\s+OF\s+workspace_row\s*$/iu);
  assert.match(admission, /\bFOR\s+UPDATE\s+OF\s+workspace\s*$/iu);
});

test("atomic begin binds watchdog authority workspace and digest outbox without retry loops", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = between(source, "async #beginCandidateMaterialization", "#effectClaimFromRow");
  assert.match(body, /this\.verifyWatchdogAuthority\(authority\)/u);
  assert.match(body, /INSERT INTO \$\{this\.sqlSchema\}\.workspaces/u);
  assert.match(body, /INSERT INTO \$\{this\.sqlSchema\}\.operation_authorities/u);
  assert.match(body, /INSERT INTO \$\{this\.sqlSchema\}\.outbox/u);
  assert.match(body, /disposition: "converged-existing"/u);
  assert.match(body, /disposition: "exact-replay"/u);
  assert.doesNotMatch(body, /while\s*\(|for\s*\([^)]*retry|setTimeout|sleep/u);
});

test("response-loss lookup is one repeatable-read scoped snapshot with complete durable evidence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const body = between(source, "async lookupMaterializationByOperation", "async claimEffect");
  assert.match(body, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(body, /principal_id=\$1 AND authority\.project_id=\$2/u);
  assert.match(body, /effectClaims/u);
  assert.match(body, /publicationAuthority/u);
  assert.match(body, /workspaceReceipt/u);
  assert.match(body, /operationReceipt/u);
  assert.doesNotMatch(body, /INSERT|UPDATE|DELETE/u);
});

test("effect claims and candidate transitions include exact replay without repeating external effects", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const claims = between(source, "async claimEffect", "async getWorkspace");
  assert.match(claims, /workspace_effect_claims/u);
  assert.match(claims, /created = false/u);
  assert.match(claims, /publication-claimed/u);
  const staging = between(source, "async #recordCandidateStaging", "async #recordCandidatePublished");
  assert.match(staging, /replayCandidate/u);
  assert.match(staging, /row\.last_transition_digest !== transitionDigest/u);
  assert.match(staging, /changed: false/u);
  const published = between(source, "async #recordCandidatePublished", "async recordStaging");
  assert.match(published, /replayCandidate/u);
  assert.match(published, /observed_final_identity/u);
  assert.match(published, /publicationAuthority/u);
  assert.match(published, /changed: false/u);
});

test("determinate candidate terminals lock publication authority and reject a claimed or ambiguous effect", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const transition = between(source, "async #transition", "async #recordCandidateStaging");
  assert.match(transition, /workspace_publication_authorities[\s\S]*FOR UPDATE/u);
  assert.match(transition, /assertCandidateDeterminatePublicationState/u);
  const determinateUpdate = between(transition,
    "else if (requireOperationAuthority && [\"failed\", \"cancelled\"].includes(successor)",
    "else if (requireOperationAuthority && successor === \"unknown\"");
  assert.match(determinateUpdate, /WHERE workspace_id=\$1 AND state='staging-authorized'/u);
  assert.doesNotMatch(determinateUpdate, /publication-claimed|published-observed/u);
});
