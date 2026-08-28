import assert from "node:assert/strict";
import test from "node:test";
import { answerEvidence, readAnswerEvidence } from "./conversation-evidence.mjs";
import { PostgresSelectedContinuityStore } from "../../gate6b/adapters/postgres-continuity.mjs";

export const evidenceResponse = () => ({ answer: "Synthetic answer", citations: [{ sourceId: "source-one", sectionId: "provided",
  contentSha256: "a".repeat(64), ordinal: 1 }], ground: "record-answers",
  retrieval: { attempted: true, skipped: false, skipReason: "", empty: false, degraded: false,
    evidenceCount: 1, unavailable: [], omissions: [] }, workspace: { explicitSources: 1, resolvedSources: 1,
    extraReads: 0, citationStatus: "recognized" }, completion: { reason: "complete", timedOut: false, outputLimited: false },
  execution: { status: "not-executed", modelClaimsAreNotEvidence: true }, model: { modelId: "not-retained" } });

test("saved evidence retains exact application references but no answer, source text, model claims or model identifiers", () => {
  const response = evidenceResponse();
  const saved = answerEvidence(response);
  assert.equal(saved.citations[0].contentSha256, response.citations[0].contentSha256);
  assert.equal(saved.schemaVersion, "runaai-answer-evidence/v1");
  assert.deepEqual(saved.execution, { status: "not-executed" });
  assert.equal("answer" in saved, false); assert.equal("model" in saved, false);
  response.citations[0].sourceId = "changed";
  assert.equal(saved.citations[0].sourceId, "source-one");
  assert.deepEqual(readAnswerEvidence(saved), saved);
});
test("legacy, malformed, oversized or model-claimed execution metadata never becomes an application receipt", () => {
  assert.equal(readAnswerEvidence(undefined), null); assert.equal(answerEvidence({ answer: "Old answer" }), null);
  for (const mutate of [value => { value.execution.status = "executed"; },
    value => { value.citations[0].contentSha256 = "bad"; }, value => { value.citations = Array(25).fill(value.citations[0]); },
    value => { value.citations[0].sourceText = "private-source-copy"; }]) {
    const response = evidenceResponse(); mutate(response); assert.equal(answerEvidence(response), null);
  }
  assert.equal(readAnswerEvidence({ ...answerEvidence(evidenceResponse()), invented: "extra" }), null);
});
test("PostgreSQL read adapter returns new evidence and marks historical missing metadata without inventing it", async () => {
  const retained = answerEvidence(evidenceResponse()), when = new Date("2026-08-28T00:00:00Z");
  const store = new PostgresSelectedContinuityStore({ cipher: { decrypt: (_context, value) => value },
    pool: { async query(sql, args) {
      assert.equal(args[0], "synthetic-member");
      if (sql.includes("FROM runa_core.chat_turns")) return { rows: [
        { turn_ordinal: 1, occurred_at: when, route: "general-chat", content_envelope: { user: "Old", assistant: "Old answer" } },
        { turn_ordinal: 2, occurred_at: when, route: "research-chat", content_envelope: { user: "Source?", assistant: "Answer", evidence: retained } },
      ] };
      return { rows: [{ chat_id: "synthetic-chat", project_id: null, turn_count: 2, archived: false,
        updated_at: when, title_envelope: { title: "Synthetic", experience: "chat" } }] };
    } } });
  const read = await store.readChat("synthetic-member", "synthetic-chat", "chat");
  assert.equal(read.turns[0].evidence, null); assert.deepEqual(read.turns[1].evidence, retained);
  assert.equal(read.turns[0].assistant, "Old answer");
});
