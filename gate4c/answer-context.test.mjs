import assert from "node:assert/strict";
import { test } from "node:test";

import { sourceSection } from "../gate1/core.mjs";
import { MemoryIndex, MemoryRecordStore, ScriptedProvider } from "../gate1/adapters/memory.mjs";
import { AdapterSelector, MemoryContinuityStore, MemoryWorkspaceResolver } from "../gate2/continuity.mjs";
import { Gate2ReadOnlyService } from "../gate2/core.mjs";
import { SyntheticApprovedKnowledgeAdapter } from "./answer-context.mjs";
import { acceptedFixture, approvedEvent, learningEvent, NOW } from "./fixtures.mjs";
import { buildApprovedKnowledgeProjection } from "./projection.mjs";

const project = "synthetic-project-a";
const otherProject = "synthetic-project-b";
const participant = "synthetic-participant-a";

function request(id, message, lane = "general", overrides = {}) {
  return { schemaVersion: "runa2-answer-request/v2", requestId: id, lane,
    participant: { principalId: overrides.participantId ?? participant, verified: overrides.verified !== false },
    project: { projectId: overrides.projectId ?? project }, thread: { threadId: `thread-${id}` },
    message, history: [], workspace: lane === "workspace" ? { sources: [{ sourceId: "README.md", sectionId: "one" }] } : null,
    budgets: { deadlineMs: 500, maximumPasses: 4, maximumPassages: 6, maximumEvidenceCharacters: 4_000 } };
}

function knowledge(payloads, { protectedLike = false } = {}) {
  if (protectedLike) {
    const event = learningEvent("protected-like", { lesson: "synthetic protected boundary guidance" });
    event.source.sourceType = "direct-teaching";
    event.authority.status = "approved";
    payloads = [["learning-event", event], ...approvedEvent("unused").slice(1)];
    payloads[1][1].targetEventId = "protected-like";
    payloads[1][1].targetIntegrity = event.integrity;
  }
  const fixture = acceptedFixture(payloads);
  const projection = buildApprovedKnowledgeProjection({ source: fixture.source, cipher: fixture.cipher, now: NOW });
  return new SyntheticApprovedKnowledgeAdapter({ projection, currentManifestHmac: projection.sourceManifestHmac,
    cipher: fixture.cipher, now: () => NOW });
}

function harness({ payloads = [], sources = [], adapter = null, providers = null } = {}) {
  const records = new MemoryRecordStore(sources);
  const index = new MemoryIndex({ references: sources.map(source => ({ ...source })) });
  const continuity = new MemoryContinuityStore();
  continuity.seedProject({ participantId: participant, projectId: project, displayName: "Synthetic" });
  continuity.seedProject({ participantId: participant, projectId: otherProject, displayName: "Synthetic Other" });
  const selectedProviders = providers ?? Object.fromEntries([["chat", "chat"], ["research", "research"], ["code", "code"]]
    .map(([key, role]) => [key, new ScriptedProvider({ role, reply: ({ advisory, evidence }) => ({
      answer: advisory?.lessonCount ? "The approved synthetic guidance applies." : "Only project evidence applies.",
      citations: evidence.length ? [{ sourceId: evidence[0].sourceId, sectionId: evidence[0].sectionId }] : [],
    }) })]));
  const approvedKnowledge = adapter ?? (payloads.length ? knowledge(payloads) : null);
  const service = new Gate2ReadOnlyService({ records, index, providers: selectedProviders, continuity,
    workspaceResolver: new MemoryWorkspaceResolver(sources), approvedKnowledge });
  return { service, providers: selectedProviders, records, continuity };
}

test("Gate 4C-3A delivers distinct advisory context through every read-only answer lane", async () => {
  const payloads = approvedEvent("global-answer", { lesson: "synthetic deployment boundary guidance", scope: "global" });
  for (const lane of ["general", "guarded", "research", "workspace"]) {
    const source = lane === "workspace" ? sourceSection({ projectId: project, sourceId: "README.md", sectionId: "one",
      content: "Synthetic workspace evidence." }) : null;
    const context = harness({ payloads, sources: source ? [source] : [] });
    const response = await context.service.answer(request(`lane-${lane}`, "Explain the synthetic deployment boundary.", lane));
    const provider = context.providers[lane === "workspace" ? "code" : lane === "research" ? "research" : "chat"];
    assert.equal(response.approvedKnowledge.delivered, true);
    assert.equal(response.approvedKnowledge.deliveryProvesCompliance, false);
    assert.equal(provider.calls[0].advisory.lessonCount, 1);
    assert.equal(provider.calls[0].advisory.mayAuthorizeAction, false);
    assert.equal(provider.calls[0].advisory.approvalRefHmac, undefined);
    assert.doesNotMatch(JSON.stringify(response), /synthetic deployment boundary guidance/);
    if (lane === "workspace") assert.equal(response.citations.length, 1);
    else { assert.equal(response.retrieval.evidenceCount, 0); assert.equal(response.citations.length, 0); }
  }
});

test("Gate 4C-3A scopes personal project and capability lessons before provider delivery", async () => {
  const personal = approvedEvent("personal", { lesson: "synthetic preference boundary", scope: "personal", scopeId: participant });
  assert.equal((await harness({ payloads: personal }).service.answer(request("personal-ok", "preference boundary"))).approvedKnowledge.delivered, true);
  assert.equal((await harness({ payloads: personal }).service.answer(request("personal-anon", "preference boundary", "general", { verified: false }))).approvedKnowledge.delivered, false);

  const projectLesson = approvedEvent("project", { lesson: "synthetic repository boundary", scope: "project", scopeId: project });
  assert.equal((await harness({ payloads: projectLesson }).service.answer(request("project-wrong", "repository boundary", "guarded", { projectId: otherProject }))).approvedKnowledge.delivered, false);

  const capability = approvedEvent("capability", { lesson: "synthetic workspace boundary", scope: "capability", scopeId: "workspace-read" });
  assert.equal((await harness({ payloads: capability }).service.answer(request("cap-general", "workspace boundary"))).approvedKnowledge.delivered, false);
  const source = sourceSection({ projectId: project, sourceId: "README.md", sectionId: "one", content: "Synthetic evidence." });
  assert.equal((await harness({ payloads: capability, sources: [source] }).service.answer(request("cap-workspace", "workspace boundary", "workspace"))).approvedKnowledge.delivered, true);
});

test("Gate 4C-3A rejects fabricated, protected-like, stale, forbidden, and denied delivery", async () => {
  const fake = harness({ adapter: { async select() { return { providerContext: { lessonCount: 1 } }; } } });
  const fakeResponse = await fake.service.answer(request("fake", "synthetic guidance"));
  assert.equal(fakeResponse.approvedKnowledge.delivered, false);
  assert.equal(fakeResponse.approvedKnowledge.errorCode, "approved-knowledge-delivery-invalid");
  assert.equal(fake.providers.chat.calls.length, 0);

  const protectedAdapter = knowledge([], { protectedLike: true });
  const protectedResponse = await harness({ adapter: protectedAdapter }).service.answer(request("protected-like", "protected boundary guidance"));
  assert.equal(protectedResponse.approvedKnowledge.errorCode, "approved-knowledge-source-not-synthetic");

  const forbidden = approvedEvent("forbidden", { lesson: "synthetic production deployment", mustNotApply: ["when production is active"] });
  assert.equal((await harness({ payloads: forbidden }).service.answer(request("forbidden", "production deployment when production is active"))).approvedKnowledge.delivered, false);

  const deniedContext = harness({ payloads: approvedEvent("denied", { lesson: "synthetic device vault guidance" }) });
  const denied = await deniedContext.service.answer(request("denied", "Read the device vault guidance.", "guarded"));
  assert.equal(denied.approvedKnowledge.reason, "not-evaluated-deterministic-boundary");
  assert.equal(deniedContext.providers.chat.calls.length, 0);
  assert.deepEqual(denied.effects, []);
});

test("Gate 4C-3A duplicate execution invokes the provider once and rollback is adapter removal", async () => {
  const payloads = approvedEvent("duplicate", { lesson: "synthetic durability guidance" });
  const context = harness({ payloads });
  const envelope = request("duplicate", "durability guidance", "guarded");
  const [first, second] = await Promise.all([context.service.answer(envelope), context.service.answer(envelope)]);
  assert.equal(context.providers.chat.calls.length, 1);
  assert.equal(first.answer, second.answer);

  const disabled = harness();
  const prior = await disabled.service.answer(request("disabled", "durability guidance", "guarded"));
  assert.equal(prior.completion.reason, "honest-empty");
  assert.equal(prior.approvedKnowledge.reason, "adapter-disabled");
});

test("Gate 4C-3A distinguishes selection from actual model delivery", async () => {
  const payloads = approvedEvent("unavailable", { lesson: "synthetic unavailable dependency guidance" });
  const context = harness({ payloads });
  context.service.index.unavailable = true;
  const response = await context.service.answer(request("unavailable", "unavailable dependency guidance"));
  assert.equal(response.completion.reason, "dependency-unavailable");
  assert.equal(response.approvedKnowledge.selectedCount, 1);
  assert.equal(response.approvedKnowledge.delivered, false);
  assert.equal(response.approvedKnowledge.reason, "selected-but-not-delivered");
  assert.equal(context.providers.chat.calls.length, 0);
});

test("Gate 4C-3A adapter status does not alter continuity rollback ownership", () => {
  const legacy = new MemoryContinuityStore({ adapterName: "legacy-observer" });
  const selected = new MemoryContinuityStore({ adapterName: "postgres-synthetic" });
  const selector = new AdapterSelector({ legacyObserver: legacy, postgresSynthetic: selected });
  assert.equal(selector.rollback().name, "legacy-observer");
});
