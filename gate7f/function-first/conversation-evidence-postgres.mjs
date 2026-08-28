import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { testCipher } from "../../gate4/fixtures.mjs";
import { PostgresGate4aStore } from "../../gate4/adapters/postgres.mjs";
import { PostgresSelectedContinuityStore, PostgresRequestCoordinator } from "../../gate6b/adapters/postgres-continuity.mjs";
import { answerEvidence } from "./conversation-evidence.mjs";

// Run only against the explicitly supplied disposable synthetic fixture owned by
// the parent runner. Add uniquely scoped records; never drop schemas or stop it.
const url = new URL(process.env.RUNA_M1_SYNTHETIC_DATABASE_URL ?? "https://invalid");
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.username !== "m1_synthetic"
  || url.pathname !== "/postgres") throw new Error("m1-explicit-synthetic-database-required");
const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 2000, query_timeout: 8000 });
const cipher = testCipher(), id = `evidence-${randomUUID()}`, checks = {};
try {
  const continuity = new PostgresSelectedContinuityStore({ pool, cipher });
  await new PostgresGate4aStore({ pool }).initialize();
  await continuity.initialize();
  const request = { requestId: `${id}-first`, participant: { verified: true, principalId: id },
    project: { projectId: "runa:personal" }, thread: { threadId: id }, experience: "chat", lane: "research",
    message: "Synthetic evidence request", contextRevision: 0 };
  const response = { answer: "Synthetic evidence answer", citations: [{ sourceId: "synthetic-source-reference", sectionId: "provided", ordinal: 1,
    contentSha256: "a".repeat(64) }], ground: "record-answers", retrieval: { attempted: true, skipped: false, skipReason: "",
    empty: false, degraded: false, evidenceCount: 1, unavailable: [], omissions: [] }, workspace: { explicitSources: 1,
    resolvedSources: 1, extraReads: 0, citationStatus: "recognized" }, completion: { reason: "complete", timedOut: false, outputLimited: false },
    execution: { status: "not-executed" }, sourceText: "DO_NOT_DUPLICATE_SOURCE_TEXT", model: { modelId: "DO_NOT_COPY_MODEL_CLAIMS" } };
  await continuity.recordAnswer(request, response);
  const stored = await pool.query("SELECT content_envelope FROM runa_core.chat_turns WHERE participant_id=$1 AND chat_id=$2", [id, id]);
  const serialized = JSON.stringify(stored.rows[0]);
  checks.evidenceEncryptedAtRest = !serialized.includes("synthetic-source-reference") && !serialized.includes(response.answer);
  const reopened = new PostgresSelectedContinuityStore({ pool, cipher });
  const record = await reopened.readChat(id, id, "chat");
  assert.deepEqual(record.turns[0].evidence, answerEvidence(response));
  checks.exactReferencesAfterReopen = true;
  checks.noSourceTextOrModelClaims = !JSON.stringify(record).includes("DO_NOT_");
  await reopened.recordAnswer({ ...request, requestId: `${id}-legacy`, contextRevision: 1, message: "Legacy-shaped synthetic turn" }, { answer: "Legacy answer" });
  const legacy = await reopened.readChat(id, id, "chat");
  checks.historicalMissingEvidenceExplicit = legacy.turns[1].evidence === null && legacy.turns[1].assistant === "Legacy answer";
  await assert.rejects(reopened.readChat(`${id}-foreign`, id, "chat"), { code: "chat-not-found" });
  checks.foreignParticipantCannotReadEvidence = true;
  const context = await reopened.prepareAnswerContext({ participantId: id, projectId: "runa:personal", threadId: id, experience: "chat" });
  checks.providerHistoryStillOnlyConversation = context.history.length === 4
    && !JSON.stringify(context.history).includes("synthetic-source-reference");
  const coordinator = new PostgresRequestCoordinator({ pool, cipher });
  let calls = 0;
  const cached = { operation: "answer", requestId: `${id}-cache`, actorId: id, inputDigest: "c".repeat(64),
    execute: async () => { calls++; return response; } };
  await coordinator.runOnce(cached);
  assert.deepEqual(await new PostgresRequestCoordinator({ pool, cipher }).runOnce(cached), response);
  checks.cacheReplayAfterReopenWithoutInference = calls === 1;
  const cache = (await pool.query("SELECT response_envelope FROM runa_runtime.route_responses_v2 WHERE operation=$1 AND request_id=$2", ["answer", cached.requestId])).rows[0];
  checks.privateReplyCacheEncrypted = !JSON.stringify(cache).includes(response.answer)
    && !JSON.stringify(cache).includes("DO_NOT_DUPLICATE_SOURCE_TEXT");
  checks.noNewPlaintextCacheRows = (await pool.query("SELECT 1 FROM runa_runtime.route_responses WHERE request_id=$1", [cached.requestId])).rowCount === 0;
  await assert.rejects(coordinator.runOnce({ ...cached, actorId: `${id}-foreign` }), { code: "request-id-conflict" });
  await assert.rejects(coordinator.runOnce({ ...cached, inputDigest: "d".repeat(64) }), { code: "request-id-conflict" });
  checks.cacheScopeMismatchDenied = calls === 1;
  await pool.query("UPDATE runa_runtime.route_responses_v2 SET input_digest=$3 WHERE operation=$1 AND request_id=$2", ["answer", cached.requestId, "e".repeat(64)]);
  await assert.rejects(coordinator.runOnce({ ...cached, inputDigest: "e".repeat(64) }), { code: "private-envelope-invalid" });
  checks.cacheRowScopeTamperFailsAuthentication = calls === 1;
  assert.ok(Object.values(checks).every(Boolean));
  process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-evidence-postgres-proof/v1", passed: true,
    checks, productionChanged: false, modelCalled: false, privateValuesIncluded: false }) + "\n");
} finally { await pool.end(); }
