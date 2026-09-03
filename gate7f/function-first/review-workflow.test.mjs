import test from "node:test";
import assert from "node:assert/strict";
import { Gate2ReadOnlyService } from "../../gate2/core.mjs";
import { MemoryContinuityStore, MemoryWorkspaceResolver } from "../../gate2/continuity.mjs";
import { MemoryIndex, MemoryRecordStore, ScriptedProvider } from "../../gate1/adapters/memory.mjs";
import { sourceSection } from "../../gate1/core.mjs";
import { answerEvidence, readAnswerEvidence } from "./conversation-evidence.mjs";
import { reviewResultPresentation } from "../../gate6b/public/function-panel.mjs";

const projectId = "synthetic-review-project";
const principalId = "synthetic-reviewer";
const contexts = [
  { contextType: "source", targetId: "policy", sourceId: "policy", sectionId: "provided",
    label: "Current policy", content: "Dispatch must wait for approval." },
  { contextType: "artifact", targetId: "report", sourceId: "report", sectionId: "provided",
    label: "Generated report", content: "The report says dispatch already completed." },
  { contextType: "diff", targetId: "change", sourceId: "change", sectionId: "provided",
    label: "Proposed change", content: "- waitForApproval();\n+ dispatch();" },
].map(value => ({ ...value, ...sourceSection({ projectId, sourceId: value.sourceId,
  sectionId: value.sectionId, content: value.content }) }));

function request(requestId = "review-request", sourceContexts = contexts, budgetOverrides = {}) {
  return { schemaVersion: "runa2-answer-request/v2", requestId, lane: "review", experience: "chat",
    participant: { principalId, verified: true }, project: { projectId }, thread: { threadId: "review-thread" },
    message: "Review the selected context and cite the contradiction.", history: [], contextRevision: 0,
    workspace: { sources: sourceContexts.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })) },
    budgets: { deadlineMs: 10_000, maximumPasses: 2, maximumPassages: 6,
      maximumEvidenceCharacters: 24_000, ...budgetOverrides } };
}

function service(reply, { requireReviewCheck = true, sourceContexts = contexts } = {}) {
  const continuity = new MemoryContinuityStore();
  continuity.seedProject({ projectId, participantId: principalId, displayName: "Review fixture", experience: "chat" });
  const index = new MemoryIndex({ references: sourceContexts });
  index.rerank = async (_query, sources) => ({ sources, degraded: false, unavailable: [] });
  const provider = new ScriptedProvider({ role: "review", reply });
  const descriptionCalls = [];
  const reviewContextResolver = { async describeReviewContexts(scope, references) {
    descriptionCalls.push(structuredClone(references));
    assert.deepEqual(scope, { principalId, projectId });
    return references.map(reference => {
      const context = sourceContexts.find(value => value.sourceId === reference.sourceId);
      assert.equal(reference.contentSha256, context.contentSha256);
      return { contextType: context.contextType, targetId: context.targetId, sourceId: context.sourceId,
        sectionId: context.sectionId, contentSha256: context.contentSha256, label: context.label };
    });
  } };
  const records = new MemoryRecordStore(sourceContexts);
  const workspaceResolver = new MemoryWorkspaceResolver(sourceContexts);
  return { provider, continuity, descriptionCalls, index, records, workspaceResolver,
    value: new Gate2ReadOnlyService({ records, index, providers: { review: provider }, continuity, workspaceResolver,
      reviewContextResolver, requireReviewCheck }) };
}

test("selected sources, artifacts and diffs produce one context-linked accepted Review result", async () => {
  const finalAnswer = "The report and diff contradict the current approval policy.";
  const citations = contexts.map(({ sourceId, sectionId }) => ({ sourceId, sectionId }));
  const { value } = service(() => ({ answer: finalAnswer, citations,
    responseCheck: { kind: "evidence-review", performed: true, corrected: true,
      finalAnswerOrigin: "checker-correction", attemptCount: 2 } }));
  const result = await value.answer(request());
  assert.equal(result.answer, finalAnswer);
  assert.deepEqual(result.citations.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })), citations);
  assert.deepEqual(result.review.contexts.map(({ contextType, targetId }) => ({ contextType, targetId })), [
    { contextType: "source", targetId: "policy" }, { contextType: "artifact", targetId: "report" },
    { contextType: "diff", targetId: "change" },
  ]);
  assert.deepEqual(result.review.checker, { initialVerdict: "revise", finalVerdict: "accept",
    revisionPasses: 1, attemptCount: 2, finalAnswerOrigin: "checker-correction" });
  assert.equal(result.review.status, "accepted-revision");
  assert.equal(result.review.findings.length, 1);
  assert.equal(result.review.findings[0].text, finalAnswer);
  assert.deepEqual(result.review.findings[0].citationOrdinals, [1, 2, 3]);

  const retained = answerEvidence(result);
  assert.equal(retained.schemaVersion, "runaai-answer-evidence/v2");
  assert.deepEqual(readAnswerEvidence(retained), retained);
  assert.equal("text" in retained.review.findings[0], false);
  assert.equal(JSON.stringify(retained).includes(finalAnswer), false);
  assert.equal(reviewResultPresentation(result).summary,
    "Review accepted after one bounded revision and one accepting recheck.");
});

test("mismatched Review context metadata is rejected before the answer provider", async () => {
  const fixture = service(({ evidence }) => ({ answer: "Should not be called.", citations: evidence,
    responseCheck: { kind: "evidence-review", performed: true, corrected: false,
      finalAnswerOrigin: "primary", attemptCount: 1 } }));
  fixture.value.reviewContextResolver.describeReviewContexts = async (_scope, references) => references.map((reference, index) => ({
    contextType: "source", targetId: reference.sourceId, sourceId: index ? reference.sourceId : "different",
    sectionId: reference.sectionId, contentSha256: reference.contentSha256, label: "Forged" }));
  await assert.rejects(fixture.value.answer(request("context-mismatch")),
    error => error.code === "review-context-resolution-invalid");
  assert.equal(fixture.provider.calls.length, 0);
});

test("Review requires one through six explicit locators before provider or checker admission", async () => {
  let checkerCalls = 0;
  const fixture = service(() => { checkerCalls += 1; return { answer: "Should not run.", citations: [] }; });
  const withoutContext = request("review-without-context");
  withoutContext.workspace = null;
  await assert.rejects(fixture.value.answer(withoutContext), error => error?.name === "ZodError");
  assert.equal(fixture.provider.calls.length, 0);
  assert.equal(checkerCalls, 0);
  assert.equal(fixture.descriptionCalls.length, 0);
});

test("Review binds admission to every original locator in exact order before description or provider", async t => {
  for (const scenario of [
    { name: "same-project locator is absent or inactive", alter: references => references.slice(0, -1) },
    { name: "resolver changes locator order", alter: references => references.toReversed() },
  ]) await t.test(scenario.name, async () => {
    let checkerCalls = 0;
    const fixture = service(() => { checkerCalls += 1; return { answer: "Should not run.", citations: [] }; });
    const originalResolve = fixture.workspaceResolver.resolve.bind(fixture.workspaceResolver);
    fixture.workspaceResolver.resolve = async (...args) => {
      const resolved = await originalResolve(...args);
      return { ...resolved, references: scenario.alter(resolved.references) };
    };
    await assert.rejects(fixture.value.answer(request(`locator-${checkerCalls}-${scenario.name}`)),
      error => error?.code === "review-context-selection-denied");
    assert.equal(fixture.provider.calls.length, 0);
    assert.equal(checkerCalls, 0);
    assert.equal(fixture.descriptionCalls.length, 0);
  });
});

test("Review fails incomplete before provider or checker rather than truncating a selected revision", async () => {
  const oversizedContexts = contexts.map((context, index) => index ? context : ({
    ...context,
    ...sourceSection({ projectId, sourceId: context.sourceId, sectionId: context.sectionId,
      content: "Full selected revision. ".repeat(12) }),
  }));
  let checkerCalls = 0;
  const fixture = service(() => { checkerCalls += 1; return { answer: "Should not run.", citations: [] }; },
    { sourceContexts: oversizedContexts });
  const result = await fixture.value.answer(request("oversize-review", oversizedContexts,
    { maximumEvidenceCharacters: 128 }));
  assert.equal(result.completion.reason, "review-context-not-fully-supplied");
  assert.equal(result.review.status, "incomplete");
  assert.deepEqual(result.review.contexts, []);
  assert.equal(result.continuity.turnRecorded, false);
  assert.equal(fixture.provider.calls.length, 0);
  assert.equal(checkerCalls, 0);
  assert.equal(fixture.descriptionCalls.length, 0);
});

test("Review bypasses reranking and supplies every admitted revision in exact order and in full", async () => {
  let rerankerCalls = 0;
  const fixture = service(({ evidence }) => ({ answer: "All selected revisions were reviewed.",
    citations: evidence.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })),
    responseCheck: { kind: "evidence-review", performed: true, corrected: false,
      finalAnswerOrigin: "primary", attemptCount: 1 } }));
  fixture.index.rerank = async (_query, sources) => {
    rerankerCalls += 1;
    return { sources: sources.slice(0, 1).toReversed(), degraded: false, unavailable: [], truncated: false };
  };
  const result = await fixture.value.answer(request("exact-full-review"));
  assert.equal(result.review.status, "accepted-primary");
  assert.equal(rerankerCalls, 0);
  assert.deepEqual(fixture.provider.calls[0].evidence.map(item => ({
    sourceId: item.sourceId, contentSha256: item.contentSha256, content: item.content,
  })), contexts.map(item => ({
    sourceId: item.sourceId, contentSha256: item.contentSha256, content: item.content,
  })));
});

test("application fails closed when the required Review checker attribution is absent", async () => {
  const { value, provider } = service(({ evidence }) => ({ answer: "Unreviewed model prose.",
    citations: evidence.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })) }));
  const result = await value.answer(request("missing-review-check"));
  assert.equal(provider.calls.length, 1);
  assert.equal(result.completion.reason, "provider-response-check-invalid");
  assert.equal(result.answer, "Runa could not complete the required Review check. No Review finding was accepted.");
  assert.deepEqual(result.citations, []);
  assert.equal(result.review.status, "incomplete");
  assert.equal(result.review.checker, null);
  assert.deepEqual(result.review.findings, []);
  assert.equal(result.continuity.turnRecorded, false);
});

test("application refuses a checked Review result without any selected citation", async () => {
  const { value } = service(() => ({ answer: "Unsupported finding.", citations: [],
    responseCheck: { kind: "evidence-review", performed: true, corrected: false,
      finalAnswerOrigin: "primary", attemptCount: 1 } }));
  const result = await value.answer(request("missing-review-citation"));
  assert.equal(result.completion.reason, "provider-response-check-invalid");
  assert.deepEqual(result.review.findings, []);
  assert.equal(result.continuity.turnRecorded, false);
});

test("accepted primary Review is displayed without trusting checker echo as a replacement", async () => {
  const primary = "The current policy requires approval before dispatch.";
  const { value } = service(({ evidence }) => ({ answer: primary,
    citations: evidence.slice(0, 1).map(({ sourceId, sectionId }) => ({ sourceId, sectionId })),
    responseCheck: { kind: "evidence-review", performed: true, corrected: false,
      finalAnswerOrigin: "primary", attemptCount: 1 } }));
  const result = await value.answer(request("accepted-primary"));
  assert.equal(result.review.status, "accepted-primary");
  assert.equal(result.review.checker.initialVerdict, "accept");
  assert.equal(result.review.checker.revisionPasses, 0);
  assert.equal(reviewResultPresentation(result).summary,
    "Review accepted the primary answer; checker echo could not alter it.");
});
