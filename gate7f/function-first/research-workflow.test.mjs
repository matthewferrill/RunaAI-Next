import test from "node:test";
import assert from "node:assert/strict";
import { Gate2ReadOnlyService } from "../../gate2/core.mjs";
import { MemoryContinuityStore, MemoryWorkspaceResolver } from "../../gate2/continuity.mjs";
import { MemoryIndex, MemoryRecordStore, ScriptedProvider } from "../../gate1/adapters/memory.mjs";
import { sourceSection } from "../../gate1/core.mjs";
import { answerEvidence, readAnswerEvidence } from "./conversation-evidence.mjs";
import { researchResultPresentation } from "../../gate6b/public/function-panel.mjs";

const projectId = "synthetic-research-project";
const participantId = "synthetic-researcher";
const sources = [
  sourceSection({ projectId, sourceId: "policy", sectionId: "provided",
    content: "Policy requires approval within 72 hours. No exception is recorded." }),
  sourceSection({ projectId, sourceId: "report", sectionId: "provided",
    content: "The supplied report proposes implementation in 96 hours." }),
];
const locator = source => ({ sourceId: source.sourceId, sectionId: source.sectionId,
  contentSha256: source.contentSha256 });

function request(requestId = "research-request", selected = sources) {
  return { schemaVersion: "runa2-answer-request/v2", requestId, lane: "research", experience: "chat",
    participant: { principalId: participantId, verified: true }, project: { projectId },
    thread: { threadId: "research-thread" }, message: "Policy report",
    history: [], contextRevision: 0, workspace: { sources: selected.map(locator) },
    researchPlan: { steps: ["Confirm the timing claims", "Compare the selected sources",
      "Identify conflicts and missing evidence", "Prepare a cited report"] },
    budgets: { deadlineMs: 10_000, maximumPasses: 6, maximumPassages: 6, maximumEvidenceCharacters: 24_000 } };
}

function harness({ available = sources, reply, indexSetup, recordsSetup, approvedKnowledge = null } = {}) {
  const continuity = new MemoryContinuityStore();
  continuity.seedProject({ participantId, projectId, displayName: "Research fixture", experience: "chat" });
  const records = new MemoryRecordStore(available);
  if (recordsSetup) recordsSetup(records);
  const index = new MemoryIndex({ references: available });
  index.rerank = async (_query, values, maximum) => ({ sources: values.slice(0, maximum),
    degraded: false, unavailable: [], truncated: false });
  if (indexSetup) indexSetup(index, records);
  const provider = new ScriptedProvider({ role: "research", reply: reply ?? (({ evidence }) => ({
    answer: "The 96-hour report conflicts with the 72-hour policy; no approved exception is supplied.",
    citations: evidence.map(locator), responseCheck: { kind: "evidence-research", performed: true,
      corrected: true, finalAnswerOrigin: "checker-correction", attemptCount: 2 },
  })) });
  const workspaceResolver = new MemoryWorkspaceResolver(available);
  return { provider, records, index, workspaceResolver, value: new Gate2ReadOnlyService({ records, index,
    providers: { research: provider }, continuity, workspaceResolver, approvedKnowledge }) };
}

test("editable supplied-source Research produces a progress record and attributable checked report", async () => {
  const fixture = harness();
  const result = await fixture.value.answer(request());
  assert.equal(result.completion.reason, "complete");
  assert.equal(result.researchWorkflow.sourceEnvelope, "supplied-source-only");
  assert.match(result.researchWorkflow.limitation, /did not search the live web/i);
  assert.deepEqual(result.researchWorkflow.plan.steps.map(step => step.text), request().researchPlan.steps);
  assert.ok(result.researchWorkflow.plan.steps.every(step => step.status === "submitted"));
  assert.equal(result.researchWorkflow.progress.status, "report-ready");
  assert.equal(result.researchWorkflow.progress.selectedSources, 2);
  assert.equal(result.researchWorkflow.progress.resolvedSources, 2);
  assert.equal(result.researchWorkflow.progress.degraded, false);
  assert.equal(result.researchWorkflow.progress.truncated, false);
  assert.equal(result.researchWorkflow.progress.omissionCount, 0);
  assert.equal(result.researchWorkflow.progress.unansweredCount, 0);
  assert.equal(result.researchWorkflow.report.status, "attributable");
  assert.deepEqual(result.researchWorkflow.report.checker, { kind: "evidence-research", performed: true,
    corrected: true, attemptCount: 2, finalAnswerOrigin: "checker-correction" });
  assert.deepEqual(result.researchWorkflow.report.citationOrdinals, [1, 2]);
  assert.equal(result.researchWorkflow.conflict.status, "not-structured");
  assert.match(result.researchWorkflow.conflict.message, /no agreement between sources is inferred/i);
  assert.deepEqual(result.researchWorkflow.sources, sources.map(source => ({ sourceId: source.sourceId,
    sectionId: source.sectionId, contentSha256: source.contentSha256 })));
  assert.equal("researchPlan" in fixture.provider.calls[0], false, "the qualified provider contract is unchanged");
  assert.equal("researchPlan" in fixture.provider.calls[0].request, false);
  const shown = researchResultPresentation(result);
  assert.equal(shown.attributable, true);
  assert.equal(shown.sources.length, 2);

  const retained = answerEvidence(result);
  assert.deepEqual(readAnswerEvidence(retained), retained);
  assert.deepEqual(retained.researchWorkflow.plan, result.researchWorkflow.plan);
  assert.equal(JSON.stringify(retained).includes(result.answer), false);
  assert.equal(JSON.stringify(retained).includes(sources[0].content), false);
});

test("production-composed approved knowledge is bypassed for explicit supplied-source Research", async () => {
  let knowledgeCalls = 0;
  const approvedKnowledge = { async select() {
    knowledgeCalls += 1;
    throw new Error("supplied-source Research must not open approved knowledge");
  } };
  const fixture = harness({ approvedKnowledge, reply: input => {
    assert.equal(input.advisory, null);
    return { answer: "The selected policy and report disagree on timing.",
      citations: input.evidence.map(locator), responseCheck: { kind: "evidence-research", performed: true,
        corrected: false, finalAnswerOrigin: "primary", attemptCount: 1 } };
  } });
  const result = await fixture.value.answer(request("research-with-production-knowledge"));
  assert.equal(knowledgeCalls, 0);
  assert.equal(fixture.provider.calls.length, 1);
  assert.equal(fixture.provider.calls[0].advisory, null);
  assert.equal(result.completion.reason, "complete");
  assert.equal(result.approvedKnowledge.delivered, false);
  assert.equal(result.approvedKnowledge.errorCode, null);
});

test("Research presents missing evidence and refuses to label an unchecked answer attributable", async () => {
  const fixture = harness({ reply: ({ evidence }) => ({ answer: "Only the policy is supported.",
    citations: [locator(evidence[0])] }) });
  const result = await fixture.value.answer(request("unchecked-research"));
  assert.equal(result.completion.reason, "complete");
  assert.equal(result.researchWorkflow.progress.status, "incomplete");
  assert.equal(result.researchWorkflow.report.status, "incomplete");
  assert.equal(result.researchWorkflow.report.checker, null);
  assert.deepEqual(result.researchWorkflow.report.citationOrdinals, []);
  assert.ok(result.researchWorkflow.missingEvidence.some(item => /evidence check was not completed/i.test(item)));
  assert.equal(researchResultPresentation(result).attributable, false);
});

test("revoked, missing, foreign and stale selected Research sources never reach the provider", async t => {
  await t.test("revoked or missing same-project locator", async () => {
    const revoked = { ...sources[0], active: false };
    const fixture = harness({ available: [revoked, sources[1]] });
    await assert.rejects(fixture.value.answer(request("revoked-research", [revoked])),
      error => error.code === "research-source-selection-denied");
    assert.equal(fixture.provider.calls.length, 0);
  });
  await t.test("foreign project locator", async () => {
    const foreign = sourceSection({ projectId: "foreign-project", sourceId: "foreign", sectionId: "provided",
      content: "Foreign synthetic canary." });
    const fixture = harness({ available: [foreign] });
    const result = await fixture.value.answer(request("foreign-research", [foreign]));
    assert.equal(result.completion.reason, "workspace-cross-project-denied");
    assert.equal(fixture.provider.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /Foreign synthetic canary/);
  });
  await t.test("stale derived revision", async () => {
    const fixture = harness({ indexSetup(index) {
      index.searchSelected = async ({ references }) => ({ references: [{ ...references[0], contentSha256: "0".repeat(64) }],
        degraded: false, unavailable: [] });
    } });
    const result = await fixture.value.answer(request("stale-research", [sources[0]]));
    assert.equal(result.completion.reason, "dependency-unavailable");
    assert.ok(result.retrieval.unavailable.includes("selected-source-scope-mismatch"));
    assert.equal(fixture.provider.calls.length, 0);
  });
});

test("Research requires the exact selected revision and an actually submitted bounded plan", async () => {
  const fixture = harness();
  const noPlan = request("missing-plan", [sources[0]]); delete noPlan.researchPlan;
  await assert.rejects(fixture.value.answer(noPlan), /requires one through eight submitted plan steps/i);
  const staleRevision = request("stale-selected-revision", [sources[0]]);
  staleRevision.workspace.sources[0].contentSha256 = "0".repeat(64);
  await assert.rejects(fixture.value.answer(staleRevision), error => error.code === "research-source-selection-denied");
  assert.equal(fixture.provider.calls.length, 0);
});

test("post-admission partial, revoked or changed selected sources cannot reach the provider", async t => {
  await t.test("partial active subset", async () => {
    let calls = 0;
    const fixture = harness({ recordsSetup(records) {
      const activeSources = records.activeSources.bind(records);
      records.activeSources = async (...args) => (++calls === 1 ? activeSources(...args) : []);
    } });
    await assert.rejects(fixture.value.answer(request("post-check-partial", [sources[0]])),
      error => error.code === "research-source-selection-denied");
    assert.equal(fixture.provider.calls.length, 0);
  });
  await t.test("revoked during reranking", async () => {
    const fixture = harness({ indexSetup(index, records) {
      index.rerank = async (_query, values) => {
        records.revoke(projectId, sources[0].sourceId, sources[0].sectionId);
        return { sources: values, degraded: false, unavailable: [], truncated: false };
      };
    } });
    await assert.rejects(fixture.value.answer(request("post-check-revoked", [sources[0]])),
      error => error.code === "research-source-selection-denied");
    assert.equal(fixture.provider.calls.length, 0);
  });
  await t.test("revision changed during reranking", async () => {
    const fixture = harness({ indexSetup(index, records) {
      index.rerank = async (_query, values) => {
        const key = `${projectId}\u0000${sources[0].sourceId}\u0000${sources[0].sectionId}`;
        records.sources.set(key, { ...records.sources.get(key), content: "Changed after admission.",
          contentSha256: "f".repeat(64) });
        return { sources: values, degraded: false, unavailable: [], truncated: false };
      };
    } });
    await assert.rejects(fixture.value.answer(request("post-check-changed", [sources[0]])),
      error => error.code === "research-source-selection-denied");
    assert.equal(fixture.provider.calls.length, 0);
  });
});

test("degradation, omissions, unanswered terms, unknown citations and truncation cannot become report-ready", async t => {
  const cases = [
    ["degraded", { indexSetup(index) { index.rerank = async (_query, values) => ({ sources: values,
      degraded: true, unavailable: ["synthetic-reranker"], truncated: false }); } }, /degraded|unavailable/i],
    ["truncated", { indexSetup(index) { index.rerank = async (_query, values) => ({ sources: values,
      degraded: false, unavailable: [], truncated: true }); } }, /truncated|stopped/i],
    ["unanswered", { requestMutator(value) { value.message = "Policy report unobtainium"; } }, /unobtainium/i],
    ["unknown-citation", { reply: ({ evidence }) => ({ answer: "Checked answer.",
      citations: [locator(evidence[0]), { sourceId: "unknown", sectionId: "provided" }],
      responseCheck: { kind: "evidence-research", performed: true, corrected: false,
        finalAnswerOrigin: "primary", attemptCount: 1 } }) }, /outside the admitted/i],
  ];
  for (const [name, setup, expected] of cases) await t.test(name, async () => {
    const fixture = harness(setup); const input = request(`incomplete-${name}`);
    setup.requestMutator?.(input);
    const result = await fixture.value.answer(input);
    assert.equal(result.researchWorkflow.progress.status, "incomplete");
    assert.equal(result.researchWorkflow.report.status, "incomplete");
    assert.deepEqual(result.researchWorkflow.report.citationOrdinals, []);
    assert.match(result.researchWorkflow.missingEvidence.join(" "), expected);
    assert.equal(researchResultPresentation(result).attributable, false);
  });
});
