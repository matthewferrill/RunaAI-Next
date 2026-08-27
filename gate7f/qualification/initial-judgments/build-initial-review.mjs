import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { loadAcceptanceCorpus } from "../acceptance/corpus.mjs";
import { expectedTurnIdentities, acceptanceSealDigest, makeJudgmentRecord, validateJudgmentBundle } from "../reporting/judgments.mjs";
import { aggregateJudgments } from "../reporting/aggregate.mjs";
import { INITIAL_SEMANTIC_DECISIONS, semanticDecisionFor } from "./semantic-decisions.mjs";

const ROOT = "D:/AI/CodexHome/visualizations/2026/08/20/01a02109-d801-7c71-a69e-511f1ddd5278/runaai-next-gate7e";
export const PACKET_PINS = Object.freeze({
  "Candidate-A": "4be726089b5022c776dc1f7acad2206d8639f6107f0d18ea05eaf22c0ab2336a",
  "Candidate-B": "54b072675c118e2739d703fc159d6b3e9889308b0427fc02f767032fd1f11847",
});

export async function buildInitialReview(label, root = ROOT) {
  assert.ok(Object.hasOwn(PACKET_PINS, label), "initial-review-label-invalid");
  const packetPath = resolve(root, "artifacts/runs/gate7f1/qualification-blind-review-packets", label + ".json");
  const packetBytes = readFileSync(packetPath);
  assert.equal(createHash("sha256").update(packetBytes).digest("hex"), PACKET_PINS[label], "initial-review-pre-adjudication-packet-pin-mismatch");
  const packet = JSON.parse(packetBytes);
  const corpus = loadAcceptanceCorpus();
  assert.equal(packet.candidateLabel, label);
  assert.deepEqual(Object.keys(INITIAL_SEMANTIC_DECISIONS[label]).sort(), corpus.cases.map(item => item.id).sort(), "initial-review-case-coverage");
  const sourceBinding = await import(pathToFileURL(resolve(root, "gate7f/qualification/reporting/source-binding.mjs")));
  const armId = "blind-" + label.toLowerCase();
  let bundle = {
    schemaVersion: "runa2-gate7f-qualification-judgments/v1", armId,
    acceptanceSealSha256: acceptanceSealDigest(),
    evaluator: {
      id: "independent-evaluation-agent-initial-review",
      candidateIdentitiesWithheld: true, acceptanceModifiedAfterOutputs: false, blindingDisclosures: [],
    },
    records: packet.responses.map(row => {
      const item = corpus.cases.find(entry => entry.id === row.caseId);
      assert.ok(item);
      return makeJudgmentRecord({
        caseId: row.caseId, attempt: row.attempt, turnIndex: row.turnIndex,
        message: { role: "assistant", content: row.content, tool_calls: row.toolCalls },
        transport: { status: row.finishReason === "length" ? "incomplete-response" : "completed",
          finishReason: row.finishReason, errorCode: null,
          ...(row.finishReason === "length" ? { reason: "The retained source response ended at the output limit." } : {}) },
        semantic: semanticDecisionFor(label, row, item),
      }, corpus);
    }),
  };
  const sourceOptions = { packetBytes, expectedPacketSha256: PACKET_PINS[label],
    expectedIdentities: expectedTurnIdentities(corpus), expectedArmId: armId };
  bundle = sourceBinding.bindJudgmentBundleSource({ bundle, ...sourceOptions });
  validateJudgmentBundle(bundle, corpus);
  const sourceVerification = sourceBinding.validateJudgmentBundleSource({ bundle, ...sourceOptions });
  const aggregate = aggregateJudgments(bundle, corpus);
  return { bundle, aggregate, sourceVerification };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildInitialReview(process.argv[2]);
  const part = process.argv[3] ?? "summary";
  if (part === "bundle") process.stdout.write(JSON.stringify(result.bundle, null, 2) + "\n");
  else if (part === "aggregate") process.stdout.write(JSON.stringify(result.aggregate, null, 2) + "\n");
  else if (part === "verification") process.stdout.write(JSON.stringify(result.sourceVerification, null, 2) + "\n");
  else if (part === "summary") process.stdout.write(JSON.stringify({
    armId: result.bundle.armId, turns: result.aggregate.turnResponses, attempts: result.aggregate.caseAttempts,
    counts: result.aggregate.counts, semanticTurnCounts: result.aggregate.semanticTurnCounts,
    roles: result.aggregate.roleResults, sourceVerified: result.sourceVerification.passed,
  }, null, 2) + "\n");
  else throw new Error("initial-review-output-part-invalid");
}
