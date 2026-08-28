import assert from "node:assert/strict";
import path from "node:path";
import pg from "pg";
import { startSyntheticPostgres } from "./synthetic-postgres.mjs";
import { PostgresSuppliedSourceStore } from "./sources.mjs";
import { PostgresWorkspaceStore } from "../../gate6b/adapters/postgres-continuity.mjs";
import { testCipher } from "../../gate4/fixtures.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const database = await startSyntheticPostgres({ toolRoot: process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools",
  artifactRoot: path.join(root, "artifacts/runs/m1-s2") });
const pool = new pg.Pool({ connectionString: database.connectionString });
const checks = [];
try {
  const cipher = testCipher(), index = { calls: [], async upsert(value) { this.calls.push(value); } };
  const workspace = new PostgresWorkspaceStore({ pool, cipher }); await workspace.initialize();
  const sources = new PostgresSuppliedSourceStore({ pool, cipher, index }); await sources.initialize();
  const alice = { principalId: "alice", projectId: "project-alice", sessionId: "session-1" };
  const input = { requestId: "source-1", label: "Atlas launch", content: "M1_SOURCE_PRIVATE_CANARY: Atlas launch is April 9." };
  const first = await sources.attach(alice, input); assert.equal(first.indexed, true); checks.push("attach-indexed");
  const repeat = await sources.attach(alice, input); assert.equal(repeat.sourceId, first.sourceId); checks.push("idempotent-source");
  await assert.rejects(sources.attach(alice, { ...input, content: "different" }), /request-conflict/); checks.push("conflicting-request-denied");
  const selected = await sources.selected(alice, [first.sourceId]); assert.equal(selected[0].content, input.content); checks.push("exact-owned-content");
  const count = index.calls.length;
  await assert.rejects(sources.selected({ ...alice, principalId: "bob" }, [first.sourceId]), /selection-denied/);
  await assert.rejects(sources.selected({ ...alice, projectId: "project-bob" }, [first.sourceId]), /selection-denied/);
  assert.equal(index.calls.length, count); checks.push("foreign-selection-denied-before-index");
  const rows = (await pool.query("SELECT content_envelope FROM runa_workspace.source_sections")).rows;
  assert.equal(JSON.stringify(rows).includes("M1_SOURCE_PRIVATE_CANARY"), false); checks.push("source-encrypted-at-rest");
  const restarted = new PostgresSuppliedSourceStore({ pool, cipher, index });
  assert.equal((await restarted.list(alice))[0].label, input.label); checks.push("fresh-service-retains-selection");
  sources.index = { async upsert() { throw new Error("dependency unavailable"); } };
  const secondInput = { requestId: "source-2", label: "Beacon", content: "Beacon launch remains undecided." };
  const pending = await sources.attach(alice, secondInput);
  assert.equal(pending.indexed, false); assert.equal(pending.contentRetained, true); checks.push("index-outage-not-credited");
  sources.index = index;
  await assert.rejects(sources.retry({ ...alice, principalId: "bob" }, { sourceId: pending.sourceId }), /selection-denied/);
  await assert.rejects(sources.retry(alice, { sourceId: pending.sourceId, contentSha256: "f".repeat(64) }), /revision-conflict/);
  checks.push("repair-owner-and-revision-bound");
  const repaired = await sources.retry(alice, { sourceId: pending.sourceId, contentSha256: pending.contentSha256 });
  assert.equal(repaired.sourceId, pending.sourceId); assert.equal(repaired.indexed, true); checks.push("idempotent-index-repair");
  assert.equal((await sources.list(alice)).length, 2); checks.push("no-duplicate-canonical-source");
  await pool.query("UPDATE runa_workspace.source_sections SET content_sha256=$1 WHERE source_id=$2", ["f".repeat(64), first.sourceId]);
  await assert.rejects(sources.selected(alice, [first.sourceId]), /integrity-invalid/); checks.push("source-tamper-denied");
} finally {
  await pool.end(); const cleanup = await database.stop();
  console.log(JSON.stringify({ schemaVersion: "runaai-m1-source-postgres-integration/v1", checks, cleanup,
    realPostgres: true, indexTransport: "test-double-not-live-vector-proof", privateValuesIncluded: false }));
}
