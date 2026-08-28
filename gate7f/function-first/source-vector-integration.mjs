import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import path from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { startSyntheticPostgres } from "./synthetic-postgres.mjs";
import { startSyntheticQdrant } from "./synthetic-qdrant.mjs";
import { PostgresSuppliedSourceStore, SelectedSourceIndex } from "./sources.mjs";
import { PostgresWorkspaceStore } from "../../gate6b/adapters/postgres-continuity.mjs";
import { OpenAICompatibleEmbedder, WindowedBgeReranker } from "../../gate1/adapters/qdrant.mjs";
import { testCipher } from "../../gate4/fixtures.mjs";

const root = path.resolve(import.meta.dirname, "../.."), artifactRoot = path.join(root, "artifacts/runs/m1-s2");
const toolRoot = process.env.RUNALAB_TOOL_ROOT ?? "D:/Projects/Runalab/artifacts/tools";
const live = process.argv.includes("--live-auxiliary");
if (live && (!process.env.M1_EMBEDDING_URL || !process.env.M1_RERANKER_URL)) throw new Error("m1-live-auxiliary-endpoints-required");
const modelId = "text-embedding-nomic-embed-text-v1.5";
const checks = [], dependencyCalls = [];
let stub, database, vector, pool, passed = false;
try {
  let embeddingUrl = process.env.M1_EMBEDDING_URL, rerankerUrl = process.env.M1_RERANKER_URL;
  if (!live) {
    stub = createServer(async (request, response) => {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString()); dependencyCalls.push(request.url);
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url.endsWith("/embeddings")) response.end(JSON.stringify({ model: modelId,
        data: input.input.map((value, index) => ({ index, embedding: Array.from({ length: 768 }, (_, i) =>
          createHash("sha256").update(value).digest()[i % 32] / 255) })) }));
      else response.end(JSON.stringify({ results: input.documents.map((_, index) => ({ index, score: 1 / (index + 1) })) }));
    });
    stub.listen(0, "127.0.0.1"); await once(stub, "listening");
    embeddingUrl = `http://127.0.0.1:${stub.address().port}/v1`; rerankerUrl = `http://127.0.0.1:${stub.address().port}`;
  }
  database = await startSyntheticPostgres({ toolRoot, artifactRoot });
  // Qdrant's native Windows gridstore does not support arbitrary deep worktree paths.
  // Use an owned short temporary parent, while retaining results in the repository evidence.
  vector = await startSyntheticQdrant({ toolRoot, artifactRoot: path.join(tmpdir(), "runa-m1-vector-tests") });
  pool = new pg.Pool({ connectionString: database.connectionString });
  const cipher = testCipher(), workspace = new PostgresWorkspaceStore({ pool, cipher }); await workspace.initialize();
  const index = new SelectedSourceIndex({ endpoint: vector.endpoint, collection: "m1_vector_integration",
    embedder: new OpenAICompatibleEmbedder({ baseURL: embeddingUrl, modelId, dimension: 768, timeoutMs: 15_000 }),
    reranker: new WindowedBgeReranker({ baseURL: rerankerUrl, timeoutMs: 15_000 }), timeoutMs: 15_000 });
  await index.initialize(); const sources = new PostgresSuppliedSourceStore({ pool, cipher, index }); await sources.initialize();
  const alice = { principalId: "alice", projectId: "project-atlas", sessionId: "session-a" };
  const first = await sources.attach(alice, { requestId: "atlas", label: "Atlas decision", content: "Atlas launches on April 9. The review owner is Lena." });
  assert.equal(first.indexed, true); checks.push("real-vector-completed-acknowledgement");
  const second = await sources.attach(alice, { requestId: "beacon", label: "Beacon decision", content: "Beacon launches on May 16. The review owner is Jules." });
  assert.equal(second.indexed, true);
  const foreign = await sources.attach({ ...alice, principalId: "bob", projectId: "project-bob" },
    { requestId: "bob", label: "Bob only", content: "Atlas launches on January 1. This foreign project must never be supplied." });
  assert.equal(foreign.indexed, true);
  const selected = await sources.selected(alice, [first.sourceId]);
  const references = selected.map(({ projectId, sourceId, sectionId, contentSha256 }) => ({ projectId, sourceId, sectionId, contentSha256 }));
  const found = await index.searchSelected({ projectId: alice.projectId, query: "When does Atlas launch?", references, maximumPassages: 6 });
  assert.deepEqual(found.references, references); checks.push("actual-vector-project-source-revision-filter");
  const reranked = await index.rerank("When does Atlas launch?", selected, 6);
  assert.equal(reranked.degraded, false); assert.equal(reranked.sources[0].contentSha256, first.contentSha256); checks.push("actual-http-explicit-window-rerank");
  await assert.rejects(sources.selected(alice, [foreign.sourceId]), /selection-denied/); checks.push("foreign-registry-denied");
  const stale = await index.searchSelected({ projectId: alice.projectId, query: "When does Atlas launch?",
    references: references.map(value => ({ ...value, contentSha256: "f".repeat(64) })), maximumPassages: 6 });
  assert.deepEqual(stale.references, []); checks.push("stale-revision-not-retrieved");
  await sources.retry(alice, { sourceId: first.sourceId, contentSha256: first.contentSha256 });
  const counts = await index.request("POST", "/points/count", { exact: true });
  assert.equal(counts.result.count, 3); checks.push("idempotent-reindex-no-extra-vector");
  assert.equal((await sources.list(alice)).length, 2); checks.push("postgres-canonical-isolation");
  passed = true;
} finally {
  const diagnostics = passed ? null : vector?.logTail();
  if (pool) await pool.end();
  const vectorCleanup = vector ? await vector.stop() : null;
  const databaseCleanup = database ? await database.stop() : null;
  if (stub) await new Promise(resolve => { stub.close(resolve); stub.closeAllConnections(); });
  console.log(JSON.stringify({ schemaVersion: "runaai-m1-source-vector-integration/v1", checks, passed, diagnostics,
    realPostgres: true, realQdrant: true, auxiliaryTransport: live ? "real-nomic-and-bge" : "HTTP-test-doubles-not-model-proof",
    dependencyCalls: live ? null : dependencyCalls, vectorCleanup, databaseCleanup, privateValuesIncluded: false }));
}
