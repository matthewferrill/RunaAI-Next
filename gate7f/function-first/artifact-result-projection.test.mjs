import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { decodeCanonicalBase64 } from "./artifact-result-contracts.mjs";
import {
  listConversationResults, listTaskResults, readConversationResult, readTaskResult,
} from "./artifact-result-projection.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const h = character => character.repeat(64);
const at = second => `2026-09-04T00:00:${String(second).padStart(2, "0")}.000Z`;
const baseEvidence = () => ({ schemaVersion: "runaai-answer-evidence/v2", citations: [],
  ground: "no-ground-needed", retrieval: { attempted: false, skipped: true, skipReason: "none", empty: true,
    degraded: false, evidenceCount: 0, unavailable: [], omissions: [] }, workspace: null,
  completion: { reason: "complete", timedOut: false, outputLimited: false },
  execution: { status: "not-executed" }, review: null, researchWorkflow: null });

function conversation(turns, experience = "chat") {
  return { schemaVersion: "runaai-result-conversation-source/v1", chatId: "chat_01", projectId: "project_01",
    experience, updatedAt: at(59), turnCount: turns.length, turns };
}

function turn(turnOrdinal, route, assistant, evidence = baseEvidence(), occurredAt = at(turnOrdinal)) {
  return { turnOrdinal, occurredAt, route, assistant, evidence };
}

function researchEvidence() {
  const value = baseEvidence();
  const citation = { sourceId: "policy", sectionId: "provided", contentSha256: h("a"), ordinal: 1 };
  value.citations = [citation];
  value.retrieval = { attempted: true, skipped: false, skipReason: "", empty: false, degraded: false,
    evidenceCount: 1, unavailable: [], omissions: [] };
  value.workspace = { explicitSources: 1, resolvedSources: 1, extraReads: 0, citationStatus: "recognized" };
  value.researchWorkflow = { sourceEnvelope: "supplied-source-only", limitation: "Only supplied sources were used.",
    plan: { steps: [{ stepId: "step_01", text: "Check the supplied policy", status: "submitted" }] },
    progress: { status: "report-ready", selectedSources: 1, resolvedSources: 1, passesPlanned: 1, passesRun: 1,
      passagesRead: 1, degraded: false, truncated: false, omissionCount: 0, unansweredCount: 0 },
    sources: [{ sourceId: citation.sourceId, sectionId: citation.sectionId,
      contentSha256: citation.contentSha256 }],
    conflict: { status: "not-structured", message: "No agreement is inferred." }, missingEvidence: [],
    report: { status: "attributable", checker: { kind: "evidence-research", performed: true, corrected: false,
      attemptCount: 1, finalAnswerOrigin: "primary" }, citationOrdinals: [1] } };
  return value;
}

function reviewEvidence() {
  const value = baseEvidence();
  const citation = { sourceId: "policy", sectionId: "provided", contentSha256: h("b"), ordinal: 1 };
  value.citations = [citation];
  value.retrieval = { attempted: true, skipped: false, skipReason: "", empty: false, degraded: false,
    evidenceCount: 1, unavailable: [], omissions: [] };
  value.workspace = { explicitSources: 1, resolvedSources: 1, extraReads: 0, citationStatus: "recognized" };
  value.review = { status: "accepted-primary", contexts: [{ contextType: "source", targetId: "policy",
    sourceId: citation.sourceId, sectionId: citation.sectionId, contentSha256: citation.contentSha256,
    label: "Policy" }], checker: { initialVerdict: "accept", finalVerdict: "accept", revisionPasses: 0,
    attemptCount: 1, finalAnswerOrigin: "primary" }, findings: [{ findingId: "finding_01",
    severity: "unclassified", citationOrdinals: [1] }] };
  return value;
}

function readBytes(source, descriptor, reader) {
  const result = reader(source, { resultId: descriptor.resultId, contentSha256: descriptor.contentSha256 });
  return decodeCanonicalBase64(result.contentBase64, descriptor);
}

test("conversation results use turn ordinal order, preserve exact text, and are restart-stable", () => {
  const source = conversation([
    turn(1, "general-chat", "  first\r\n", baseEvidence(), at(20)),
    turn(2, "guarded-chat", "second\n", baseEvidence(), at(10)),
  ]);
  const first = listConversationResults(source), repeated = listConversationResults(structuredClone(source));
  assert.deepEqual(repeated, first);
  assert.deepEqual(first.results.map(result => result.sourceRecordId), ["turn:1", "turn:2"]);
  assert.deepEqual(first.results.map(result => result.ordinal), [1, 2]);
  assert.equal(readBytes(source, first.results[0], readConversationResult).toString("utf8"), "  first\r\n");
  const changed = structuredClone(source); changed.turns[0].assistant = "changed";
  assert.throws(() => readConversationResult(changed, { resultId: first.results[0].resultId,
    contentSha256: first.results[0].contentSha256 }), error => error.code === "result-stale");
});

test("missing and incomplete ordinary answer evidence remains listed and non-readable", () => {
  const missing = conversation([turn(1, "general-chat", "answer", null)]);
  const unavailable = listConversationResults(missing).results[0];
  assert.deepEqual({ readiness: unavailable.readiness, errorCode: unavailable.errorCode,
    byteLength: unavailable.byteLength, contentSha256: unavailable.contentSha256 },
  { readiness: "unavailable", errorCode: "source-integrity-unavailable", byteLength: null, contentSha256: null });
  assert.throws(() => readConversationResult(missing, { resultId: unavailable.resultId, contentSha256: null }),
    error => error.code === "result-not-ready");
  const limitedEvidence = baseEvidence(); limitedEvidence.completion.outputLimited = true;
  const limited = listConversationResults(conversation([turn(1, "general-chat", "partial", limitedEvidence)])).results[0];
  assert.equal(limited.readiness, "incomplete");
  assert.equal(limited.errorCode, "source-output-limited");
});

test("Research and Review produce exact positive report and metadata bytes", () => {
  const research = conversation([turn(1, "research-chat", "Research answer.\n", researchEvidence())]);
  const researchList = listConversationResults(research);
  assert.deepEqual(researchList.results.map(result => result.kind), ["research-report", "research-metadata"]);
  assert.equal(readBytes(research, researchList.results[0], readConversationResult).toString(), "Research answer.\n");
  assert.equal(readBytes(research, researchList.results[1], readConversationResult).toString(),
    `{"schemaVersion":"runaai-public-research-metadata/v1","reportStatus":"attributable","limitation":"Only supplied sources were used.","progress":{"status":"report-ready","selectedSources":1,"resolvedSources":1,"passesPlanned":1,"passesRun":1,"passagesRead":1,"degraded":false,"truncated":false,"omissionCount":0,"unansweredCount":0},"citations":[{"ordinal":1,"sourceId":"policy","sectionId":"provided","contentSha256":"${h("a")}"}],"checker":{"attempted":true,"corrected":false,"attemptCount":1,"finalAnswerOrigin":"primary"},"missingEvidence":[]}`);

  const review = conversation([turn(1, "review-chat", "Review accepted.", reviewEvidence())]);
  const reviewList = listConversationResults(review);
  assert.deepEqual(reviewList.results.map(result => result.kind), ["review-report", "review-metadata"]);
  assert.equal(readBytes(review, reviewList.results[1], readConversationResult).toString(),
    `{"schemaVersion":"runaai-public-review-metadata/v1","status":"accepted-primary","contexts":[{"contextType":"source","targetId":"policy","sourceId":"policy","sectionId":"provided","contentSha256":"${h("b")}"}],"checker":{"initialVerdict":"accept","finalVerdict":"accept","revisionPasses":0,"attemptCount":1,"finalAnswerOrigin":"primary"},"findings":[{"findingId":"finding_01","severity":"unclassified","citationOrdinals":[1]}]}`);
  const metadata = readBytes(review, reviewList.results[1], readConversationResult).toString();
  assert.equal(metadata.includes("Policy"), false, "private labels are not projected");
});

test("accepted-revision Review uses only the exact corrected checker variant", () => {
  const evidence = reviewEvidence();
  evidence.review.status = "accepted-revision";
  evidence.review.checker = { initialVerdict: "revise", finalVerdict: "accept", revisionPasses: 1,
    attemptCount: 2, finalAnswerOrigin: "checker-correction" };
  const source = conversation([turn(1, "review-chat", "Corrected review.", evidence)]);
  const list = listConversationResults(source);
  assert.ok(list.results.every(result => result.readiness === "ready"));
  const metadata = JSON.parse(readBytes(source, list.results[1], readConversationResult).toString());
  assert.deepEqual(metadata.checker, evidence.review.checker);
  assert.equal(metadata.status, "accepted-revision");
});

test("accepted Research and Review cross-binding mismatches fail unavailable", () => {
  const research = researchEvidence(); research.researchWorkflow.report.citationOrdinals = [2];
  const researchResults = listConversationResults(conversation([turn(1, "research-chat", "answer", research)])).results;
  assert.ok(researchResults.every(result => result.readiness === "unavailable"
    && result.errorCode === "source-integrity-unavailable"));
  const review = reviewEvidence(); review.review.contexts[0].contentSha256 = h("c");
  const reviewResults = listConversationResults(conversation([turn(1, "review-chat", "answer", review)])).results;
  assert.ok(reviewResults.every(result => result.readiness === "unavailable"
    && result.errorCode === "source-integrity-unavailable"));
});

test("valid incomplete Research and Review evidence remains visible and non-readable", () => {
  const research = researchEvidence();
  research.researchWorkflow.progress.status = "incomplete";
  research.researchWorkflow.progress.resolvedSources = 0;
  research.researchWorkflow.report = { status: "incomplete", checker: null, citationOrdinals: [] };
  research.researchWorkflow.missingEvidence = ["The evidence pass did not complete."];
  const researchSource = conversation([turn(1, "research-chat", "Partial research.", research)]);
  const researchResults = listConversationResults(researchSource).results;
  assert.ok(researchResults.every(result => result.readiness === "incomplete"
    && result.errorCode === "source-citations-incomplete"));
  assert.throws(() => readConversationResult(researchSource, { resultId: researchResults[0].resultId,
    contentSha256: null }), error => error.code === "result-not-ready");

  const review = reviewEvidence();
  review.review = { status: "incomplete", contexts: [], checker: null, findings: [] };
  const reviewSource = conversation([turn(1, "review-chat", "Partial review.", review)]);
  const reviewResults = listConversationResults(reviewSource).results;
  assert.ok(reviewResults.every(result => result.readiness === "incomplete"
    && result.errorCode === "source-citations-incomplete"));
});

function proposal({ proposalId, capabilityId, prepared, createdAt, status = "completed" }) {
  return { proposalId, taskId: "task_01", status, policy: status === "pending-approval"
    ? "approval-required" : "automatic", capabilityId, proposalDigest: digest(`proposal:${proposalId}`),
    expectedProjectRevision: 1, beforeWorkspaceSha256: h("1"), createdAt, updatedAt: at(30), prepared };
}

function receipt({ receiptId, proposal, recordedAt, effectKind, output, afterSha256 = h("2") }) {
  return { receiptId, taskId: "task_01", proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest, receiptDigest: digest(`receipt:${receiptId}`),
    capabilityId: proposal.capabilityId, argumentsDigest: h("3"), beforeRevision: 1, afterRevision: 2,
    beforeSha256: h("1"), afterSha256, effectKind, executionStatus: "completed", cancellationRequested: false,
    grantRevokedAfterDispatch: false, currentAtRecording: true, recordedAt, output };
}

function positiveTask() {
  const before = "old\n", after = "new\n", inspected = "receipt text\n";
  const apply = proposal({ proposalId: "proposal_apply", capabilityId: "project.apply-change", createdAt: at(1),
    prepared: { kind: "apply", path: "main.js", beforeSha256: digest(before), afterSha256: digest(after),
      beforeContent: before, afterContent: after, afterWorkspaceSha256: h("2") } });
  const inspect = proposal({ proposalId: "proposal_inspect", capabilityId: "project.inspect", createdAt: at(2),
    prepared: { kind: "inspect", path: "notes.txt", sha256: digest("prepared text"),
      bytes: Buffer.byteLength("prepared text"), content: "prepared text" } });
  const runTests = proposal({ proposalId: "proposal_tests", capabilityId: "project.run-tests", createdAt: at(3),
    prepared: { kind: "test", suiteId: "suite_01", suiteSha256: h("4"), testIds: ["double"] } });
  const inspectReceipt = receipt({ receiptId: "receipt_inspect", proposal: inspect, recordedAt: at(4),
    effectKind: "observed", afterSha256: h("1"), output: { path: "notes.txt", sha256: digest(inspected),
      bytes: Buffer.byteLength(inspected), content: inspected } });
  const testReceipt = receipt({ receiptId: "receipt_tests", proposal: runTests, recordedAt: at(5),
    effectKind: "sandbox-tested", output: { suiteId: "suite_01", suiteSha256: h("4"), workspaceSha256: h("2"),
      status: "passed", passed: true, checks: [{ testId: "double", expected: { "10": "ten", "2": "two" },
        actual: { "2": "two", "10": "ten" }, errorCode: null, passed: true }] } });
  return { source: { schemaVersion: "runaai-result-task-source/v1",
    task: { taskId: "task_01", status: "active", updatedAt: at(40) },
    project: { revision: 2, workspaceSha256: h("2") }, proposals: [apply, inspect, runTests],
    receipts: [inspectReceipt, testReceipt], intents: [apply, inspect, runTests].map(item => ({
      proposalId: item.proposalId, status: "recorded", effectId: `effect_${item.proposalId}`,
      updatedAt: at(30) })) }, before, after, inspected };
}

test("task projection derives exact diff, receipt-backed inspect/tests, and public receipts", () => {
  const { source, inspected } = positiveTask();
  const list = listTaskResults(source);
  assert.deepEqual(list.results.map(result => result.kind),
    ["code-diff", "inspected-text", "test-outcome", "task-receipt", "task-receipt"]);
  assert.equal(readBytes(source, list.results[0], readTaskResult).toString(),
    "--- a/main.js\n+++ b/main.js\n@@ -1,1 +1,1 @@\n-old\n+new\n");
  assert.equal(readBytes(source, list.results[1], readTaskResult).toString(), inspected);
  assert.equal(readBytes(source, list.results[2], readTaskResult).toString(),
    `{"schemaVersion":"runaai-public-test-outcome/v1","suiteId":"suite_01","suiteSha256":"${h("4")}","workspaceSha256":"${h("2")}","status":"passed","passed":true,"checks":[{"testId":"double","expected":{"10":"ten","2":"two"},"actual":{"10":"ten","2":"two"},"errorCode":null,"passed":true}]}`);
  const publicReceipt = JSON.parse(readBytes(source, list.results[3], readTaskResult).toString());
  assert.equal(publicReceipt.receiptId, "receipt_inspect");
  assert.equal("output" in publicReceipt, false);
  assert.equal("environmentId" in publicReceipt, false);
});

test("known task candidates remain listed with exact fail-closed readiness", () => {
  const { source } = positiveTask();
  source.receipts = []; source.intents = [];
  source.proposals = [
    proposal({ proposalId: "proposal_apply", capabilityId: "project.apply-change", createdAt: at(1),
      status: "pending-approval", prepared: null }),
    proposal({ proposalId: "proposal_inspect", capabilityId: "project.inspect", createdAt: at(2),
      status: "authorized", prepared: { kind: "inspect", path: "main.js", sha256: h("a"), bytes: 1,
        content: "x" } }),
    proposal({ proposalId: "proposal_tests", capabilityId: "project.run-tests", createdAt: at(3),
      status: "unknown", prepared: { kind: "test", suiteId: "suite_01", suiteSha256: h("b"),
        testIds: ["one"] } }),
  ];
  const results = listTaskResults(source).results;
  assert.deepEqual(results.map(result => [result.kind, result.readiness, result.errorCode]), [
    ["code-diff", "unavailable", "source-integrity-unavailable"],
    ["inspected-text", "pending", "source-pending"],
    ["test-outcome", "incomplete", "source-outcome-unknown"],
  ]);
});

test("proposal and outcome state families map to truthful non-ready descriptors", () => {
  const template = positiveTask().source;
  const applyState = status => {
    const value = structuredClone(template); value.proposals = [value.proposals[0]]; value.receipts = [];
    value.intents = []; value.proposals[0].status = status;
    return listTaskResults(value).results[0];
  };
  assert.deepEqual([applyState("pending-approval").readiness, applyState("pending-approval").errorCode],
    ["ready", null]);
  assert.deepEqual([applyState("denied").readiness, applyState("denied").errorCode],
    ["failed", "source-proposal-denied"]);
  assert.deepEqual([applyState("cancelled").readiness, applyState("cancelled").errorCode],
    ["failed", "source-cancelled"]);
  assert.deepEqual([applyState("stale").readiness, applyState("stale").errorCode],
    ["failed", "source-failed"]);
  assert.deepEqual([applyState("dispatched").readiness, applyState("dispatched").errorCode],
    ["incomplete", "source-reconciliation-required"]);
  assert.deepEqual([applyState("unknown").readiness, applyState("unknown").errorCode],
    ["incomplete", "source-outcome-unknown"]);
  const format = structuredClone(template); format.proposals = [format.proposals[0]]; format.receipts = [];
  format.intents = []; format.proposals[0].prepared.afterContent = "bad\r\n";
  format.proposals[0].prepared.afterSha256 = digest("bad\r\n");
  assert.deepEqual([listTaskResults(format).results[0].readiness, listTaskResults(format).results[0].errorCode],
    ["unavailable", "source-format-unavailable"]);
  const tooLarge = structuredClone(template); tooLarge.proposals = [tooLarge.proposals[0]]; tooLarge.receipts = [];
  tooLarge.intents = []; tooLarge.proposals[0].prepared.afterContent = "x".repeat(131_073);
  tooLarge.proposals[0].prepared.afterSha256 = digest(tooLarge.proposals[0].prepared.afterContent);
  assert.deepEqual([listTaskResults(tooLarge).results[0].readiness, listTaskResults(tooLarge).results[0].errorCode],
    ["unavailable", "source-too-large"]);

  const tests = structuredClone(template); tests.proposals = [tests.proposals[2]];
  tests.receipts = [tests.receipts[1]]; tests.intents = [tests.intents[2]];
  tests.receipts[0].output.status = "failed"; tests.receipts[0].output.passed = false;
  tests.receipts[0].output.checks[0].actual = "wrong"; tests.receipts[0].output.checks[0].passed = false;
  assert.deepEqual([listTaskResults(tests).results[0].readiness, listTaskResults(tests).results[0].errorCode],
    ["failed", "source-tests-failed"]);
  tests.receipts[0].output = { ...tests.receipts[0].output, status: "unavailable", passed: false, checks: [] };
  assert.deepEqual([listTaskResults(tests).results[0].readiness, listTaskResults(tests).results[0].errorCode],
    ["unavailable", "source-content-unavailable"]);

  const inspectState = status => {
    const value = structuredClone(template); value.proposals = [value.proposals[1]]; value.receipts = [];
    value.intents = []; value.proposals[0].status = status;
    return listTaskResults(value).results[0];
  };
  assert.deepEqual([inspectState("denied").readiness, inspectState("denied").errorCode],
    ["failed", "source-proposal-denied"]);
  assert.deepEqual([inspectState("unknown").readiness, inspectState("unknown").errorCode],
    ["incomplete", "source-outcome-unknown"]);
  assert.deepEqual([inspectState("completed").readiness, inspectState("completed").errorCode],
    ["unavailable", "source-integrity-unavailable"]);
});

test("task content integrity and read locators fail closed", () => {
  const { source } = positiveTask();
  const original = listTaskResults(source);
  const badApply = structuredClone(source); badApply.proposals[0].prepared.afterSha256 = h("f");
  const badDiff = listTaskResults(badApply).results.find(result => result.kind === "code-diff");
  assert.equal(badDiff.readiness, "unavailable");
  const badTest = structuredClone(source); badTest.receipts[1].output.workspaceSha256 = h("e");
  const badOutcome = listTaskResults(badTest).results.find(result => result.kind === "test-outcome");
  assert.equal(badOutcome.readiness, "unavailable");
  const receiptChanged = structuredClone(source); receiptChanged.receipts[0].receiptDigest = h("9");
  const changedInspect = listTaskResults(receiptChanged).results.find(result => result.kind === "inspected-text");
  const originalInspect = original.results.find(result => result.kind === "inspected-text");
  assert.notEqual(changedInspect.sourceRevision, originalInspect.sourceRevision);
  assert.throws(() => readTaskResult(source, { resultId: original.results[0].resultId,
    contentSha256: h("0") }), error => error.code === "result-stale");
  const changed = structuredClone(source); changed.project.revision = 3;
  assert.throws(() => readTaskResult(changed, { resultId: original.results[0].resultId,
    contentSha256: original.results[0].contentSha256 }), error => error.code === "result-stale");
});

test("content privacy canaries stay out of list metadata and remain exact in classified reads", () => {
  const canary = "token=SECRET-LIKE C:\\private\\file <script>alert(1)</script>\n";
  const source = conversation([turn(1, "general-chat", canary)]);
  const list = listConversationResults(source);
  assert.equal(JSON.stringify(list).includes("SECRET-LIKE"), false);
  assert.equal(list.privacy.resultContentIncluded, false);
  const read = readConversationResult(source, { resultId: list.results[0].resultId,
    contentSha256: list.results[0].contentSha256 });
  assert.equal(read.privacy.resultContentSensitivity, "not-classified");
  assert.equal(readBytes(source, list.results[0], readConversationResult).toString(), canary);
});

test("actual maximum result and list wire budgets are measured on complete response objects", () => {
  const source = conversation([turn(1, "general-chat", "x".repeat(131_072))]);
  source.chatId = "c".repeat(160);
  const list = listConversationResults(source), descriptor = list.results[0];
  assert.equal(descriptor.byteLength, 131_072);
  const read = readConversationResult(source, { resultId: descriptor.resultId,
    contentSha256: descriptor.contentSha256 });
  assert.ok(Buffer.byteLength(JSON.stringify(read)) <= 180_224);
  let lastGood = null, firstFailure = null;
  for (let count = 1; count <= 32; count += 1) {
    const rows = Array.from({ length: count }, (_, index) => turn(index + 1, "general-chat", "x",
      baseEvidence(), at((index + 1) % 60)));
    try { lastGood = listConversationResults(conversation(rows)); }
    catch (error) { firstFailure = error; break; }
  }
  assert.ok(lastGood && Buffer.byteLength(JSON.stringify(lastGood)) <= 32_768);
  assert.equal(firstFailure?.code, "result-list-too-large");
});
