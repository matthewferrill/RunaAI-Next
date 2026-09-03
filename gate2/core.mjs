import { createHash, randomBytes } from "node:crypto";
import { ReadOnlyAnswerSlice, requiresProjectRecord } from "../gate1/core.mjs";
import { parseGate2AnswerRequest, parseGate2AnswerResponse, GATE2_LANE_CAPABILITIES, GATE2_MODEL_ROLES } from "./contracts.mjs";
import { approvedKnowledgeReceipt, providerAdvisoryFromDelivery } from "../gate4c/answer-context.mjs";
import { answerExecutionStamp } from "../gate7e/contracts.mjs";
import { requestsProtectedRead, requestsUnavailableEffect, requestsLiveInformation, claimsUnperformedAction }
  from "../gate7f/function-first/conversation-policy.mjs";
import { INCOMPLETE_ANSWER_REASONS } from "../gate7f/function-first/conversation-outcome.mjs";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const sessionRecallPattern = /\bwhat did i (?:ask|say) before|previous (?:question|message)\b/i;

function normalizedRequestId(request) {
  return `g2-${sha256(`${request.lane}\u0000${request.requestId}`).slice(0, 40)}`;
}

function gate1Request(request) {
  return {
    schemaVersion: "runa2-answer-request/v1",
    requestId: normalizedRequestId(request),
    lane: request.lane === "research" ? "research" : "general",
    participant: request.participant,
    project: request.project,
    thread: request.thread,
    message: request.message,
    history: request.history,
    budgets: request.budgets,
  };
}

function emptyV1(request, { answer, reason, auditCode, ground = "no-ground-needed" }) {
  return {
    schemaVersion: "runa2-answer-response/v1",
    requestId: normalizedRequestId(request),
    participantId: request.participant.principalId,
    projectId: request.project.projectId,
    threadId: request.thread.threadId,
    lane: request.lane === "research" ? "research" : "general",
    answer,
    ground,
    retrieval: { attempted: false, skipped: true, skipReason: reason, empty: true, degraded: false,
      evidenceCount: 0, unavailable: [], omissions: [] },
    research: request.lane === "research" ? { passesPlanned: 0, passesRun: 0, passesWithNothing: 0,
      passagesRead: 0, unanswered: [], truncated: false } : null,
    citations: [],
    model: { role: "not-invoked", provider: "none", modelId: "none" },
    completion: { reason, timedOut: false, outputLimited: false },
    trace: { correlationId: randomBytes(16).toString("hex") },
    effects: [],
    auditCodes: auditCode ? [auditCode] : [],
  };
}

class ExplicitIndex {
  constructor(delegate, references, { preserveExactSelection = false } = {}) {
    this.delegate = delegate;
    this.references = references;
    this.preserveExactSelection = preserveExactSelection;
    this.searches = [];
  }
  async search({ projectId, query, maximumPassages, deadlineMs }) {
    this.searches.push({ projectId, query });
    if (this.preserveExactSelection) {
      return { references: structuredClone(this.references), degraded: false, unavailable: [] };
    }
    if (typeof this.delegate?.searchSelected === "function") {
      const result = await this.delegate.searchSelected({ projectId, query, maximumPassages, deadlineMs,
        references: this.references });
      const allowed = new Set(this.references.map(reference =>
        `${reference.projectId}\0${reference.sourceId}\0${reference.sectionId}\0${reference.contentSha256}`));
      if (!Array.isArray(result?.references) || result.references.some(reference => !allowed.has(
        `${reference.projectId}\0${reference.sourceId}\0${reference.sectionId}\0${reference.contentSha256}`))) {
        throw Object.assign(new Error("Selected retrieval returned a reference outside the selected revision."),
          { code: "selected-source-scope-mismatch" });
      }
      return result;
    }
    return { references: this.references.filter(item => item.projectId === projectId).slice(0, maximumPassages),
      degraded: false, unavailable: [] };
  }
  async rerank(query, sources, maximumPassages, options) {
    if (this.preserveExactSelection) {
      const exact = sources.length === this.references.length && sources.every((source, index) => {
        const reference = this.references[index];
        return source.projectId === reference.projectId && source.sourceId === reference.sourceId
          && source.sectionId === reference.sectionId && source.contentSha256 === reference.contentSha256
          && typeof source.content === "string" && sha256(source.content) === reference.contentSha256;
      });
      if (!exact || maximumPassages < sources.length) {
        throw Object.assign(new Error("Review evidence no longer matches the complete selected revisions."),
          { code: "review-context-not-fully-supplied" });
      }
      return { sources: structuredClone(sources), degraded: false, unavailable: [], truncated: false };
    }
    if (typeof this.delegate?.rerank !== "function") {
      return { sources: sources.slice(0, maximumPassages), degraded: true, unavailable: ["reranker"] };
    }
    return this.delegate.rerank(query, sources, maximumPassages, options);
  }
}

class EphemeralRecordProxy {
  constructor(delegate) { this.delegate = delegate; }
  async getCommitted() { return null; }
  async commit(_request, response) { return structuredClone(response); }
  async runOnce(_request, operation) { return structuredClone(await operation()); }
  async activeSources(projectId, references) { return this.delegate.activeSources(projectId, references); }
}

function deterministicResponse(request) {
  if (requestsProtectedRead(request.message)) return emptyV1(request, {
    answer: "That protected information is not available in this chat.",
    reason: "protected-source-denied", auditCode: "protected-source-denied",
  });
  if (sessionRecallPattern.test(request.message)) {
    const prior = [...request.history].reverse().find(turn => turn.role === "user");
    return emptyV1(request, {
      answer: prior ? `Your previous question was: ${prior.content}` : "There is no earlier user turn in this session.",
      reason: "session-recall", auditCode: "session-recall-deterministic",
    });
  }
  if (requestsLiveInformation(request.message)) return emptyV1(request, {
    answer: "I don't have live web or weather access in this chat, so I can't verify current information.",
    reason: "current-source-required", auditCode: "external-network-not-used",
  });
  if (request.lane !== "code" && requestsUnavailableEffect(request.message)) return emptyV1(request, {
    answer: "This chat is read-only and cannot perform that action, approve it, or learn from it.",
    reason: "effect-not-available", auditCode: "effects-empty-enforced",
  });
  return null;
}

function citationStatus(response) {
  if (response.auditCodes.includes("unknown-citation")) return "contains-unknown";
  if (response.citations.length) return "recognized";
  return response.retrieval.evidenceCount ? "missing" : "not-applicable";
}

function applyCommonAnswerGates(response, request) {
  const codes = [`answer-checks-performed:${request.lane}`];
  if (response.completion.reason === "complete" && claimsUnperformedAction(response.answer)) {
    response.answer = "Runa's response claimed an action without an execution receipt, so it was not accepted. No action was performed by this answer. Please ask for a draft or analysis, or use the available governed action workflow.";
    response.citations = [];
    response.completion.reason = "unverified-action-claim";
    codes.push("unverified-action-claim-withheld");
  }
  if (response.auditCodes.includes("unknown-citation")) codes.push("citation-unknown-visible");
  if (/\bI (?:checked|looked up|ran)\b/i.test(response.answer) && !response.retrieval.attempted) {
    codes.push("claimed-lookup-without-receipt");
  }
  const unsupportedNumber = response.answer.match(/\b\d{4,}\b/)?.[0];
  if (unsupportedNumber && !request.message.includes(unsupportedNumber) && response.citations.length === 0) {
    codes.push("unsupported-numeric-claim");
  }
  for (const code of codes.slice(1)) if (!response.auditCodes.includes(code)) response.auditCodes.push(code);
  return { performed: true, codes };
}

function providerFor(providers, role) {
  const provider = providers?.[role];
  if (!provider) throw Object.assign(new Error(`No provider is registered for deterministic role ${role}.`), { code: "provider-role-unavailable" });
  return provider;
}

class BoundReviewRecordProxy extends EphemeralRecordProxy {
  constructor(delegate, references, sources) {
    super(delegate);
    this.references = references;
    this.sources = sources;
  }
  async activeSources(projectId, references) {
    const exact = references.length === this.references.length && references.every((reference, index) => {
      const expected = this.references[index];
      return projectId === expected.projectId && reference.projectId === expected.projectId
        && reference.sourceId === expected.sourceId && reference.sectionId === expected.sectionId
        && reference.contentSha256 === expected.contentSha256;
    });
    if (!exact) throw Object.assign(new Error("Review evidence selection changed after admission."),
      { code: "review-context-not-fully-supplied" });
    return structuredClone(this.sources);
  }
}

function exactReferenceOrder(projectId, expected, observed) {
  return Array.isArray(observed) && observed.length === expected.length && observed.every((reference, index) => {
    const value = expected[index];
    return projectId === value.projectId && reference.projectId === value.projectId
      && reference.sourceId === value.sourceId && reference.sectionId === value.sectionId
      && reference.contentSha256 === value.contentSha256;
  });
}

class BoundResearchRecordProxy extends EphemeralRecordProxy {
  constructor(delegate, request, references) {
    super(delegate); this.request = request; this.references = references;
  }
  async activeSources(projectId, references) {
    if (!exactReferenceOrder(projectId, this.references, references)) {
      throw Object.assign(new Error("Research evidence selection changed after admission."),
        { code: "research-source-selection-denied" });
    }
    const sources = await this.delegate.activeSources(projectId, references);
    return exactActiveResearchSources(this.request, this.references, sources);
  }
}

class BoundResearchProvider {
  constructor(delegate, records, request, references) {
    this.delegate = delegate; this.records = records; this.request = request; this.references = references;
  }
  async answer(input, options) {
    const active = await this.records.activeSources(this.request.project.projectId, this.references);
    const evidence = input?.evidence;
    const exact = Array.isArray(evidence) && evidence.length === active.length && evidence.every((item, index) => {
      const source = active[index];
      return item?.sourceId === source.sourceId && item.sectionId === source.sectionId
        && item.contentSha256 === source.contentSha256 && item.provenance === "untrusted-retrieved-data"
        && typeof item.content === "string" && source.content.startsWith(item.content);
    });
    if (!exact) throw Object.assign(new Error("Research provider evidence no longer matches the exact selected source set."),
      { code: "research-source-selection-denied" });
    return this.delegate.answer(input, options);
  }
}

function auditValue(response, prefix) {
  const entry = response.auditCodes.find(code => code.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function reviewChecker(response) {
  if (auditValue(response, "response-check-kind:") !== "evidence-review"
      || auditValue(response, "response-check-performed:") !== "true") return null;
  const corrected = auditValue(response, "response-check-corrected:") === "true";
  const attemptCount = Number(auditValue(response, "response-check-attempt-count:"));
  const finalAnswerOrigin = auditValue(response, "response-check-final-origin:");
  if ((corrected && (attemptCount !== 2 || finalAnswerOrigin !== "checker-correction"))
      || (!corrected && (attemptCount !== 1 || finalAnswerOrigin !== "primary"))) return null;
  return { initialVerdict: corrected ? "revise" : "accept", finalVerdict: "accept",
    revisionPasses: corrected ? 1 : 0, attemptCount, finalAnswerOrigin };
}

function researchChecker(response) {
  if (auditValue(response, "response-check-kind:") !== "evidence-research"
      || auditValue(response, "response-check-performed:") !== "true") return null;
  const corrected = auditValue(response, "response-check-corrected:") === "true";
  const attemptCount = Number(auditValue(response, "response-check-attempt-count:"));
  const finalAnswerOrigin = auditValue(response, "response-check-final-origin:");
  if ((corrected && (attemptCount !== 2 || finalAnswerOrigin !== "checker-correction"))
      || (!corrected && (attemptCount !== 1 || finalAnswerOrigin !== "primary"))) return null;
  return { kind: "evidence-research", performed: true, corrected, attemptCount, finalAnswerOrigin };
}

function reviewResult(request, response, contexts) {
  if (request.lane !== "review") return null;
  const checker = response.completion.reason === "complete" && response.citations.length > 0
    ? reviewChecker(response) : null;
  const status = !checker ? "incomplete" : checker.revisionPasses ? "accepted-revision" : "accepted-primary";
  const findings = status === "incomplete" ? [] : [{
    findingId: `review-${sha256(JSON.stringify([request.requestId, response.answer, response.citations])).slice(0, 32)}`,
    text: response.answer,
    severity: "unclassified",
    citationOrdinals: response.citations.map(citation => citation.ordinal),
  }];
  return { status, contexts, checker, findings };
}

function researchWorkflowResult(request, response, references) {
  if (request.lane !== "research" || !request.workspace) return null;
  const checker = response.completion.reason === "complete" ? researchChecker(response) : null;
  const missingEvidence = [];
  for (const item of response.research?.unanswered ?? []) {
    missingEvidence.push(`No selected evidence answered: ${String(item).slice(0, 240)}.`);
  }
  for (const item of response.retrieval.omissions ?? []) missingEvidence.push(String(item).slice(0, 400));
  for (const item of response.retrieval.unavailable ?? []) {
    missingEvidence.push(`Selected-source dependency unavailable: ${String(item).slice(0, 320)}.`);
  }
  if (!response.citations.length) missingEvidence.push("The final report has no recognized citation.");
  if (response.auditCodes.includes("unknown-citation")) missingEvidence.push("The answer included a citation outside the admitted selected evidence.");
  if (!checker) missingEvidence.push("The qualified Research evidence check was not completed.");
  if (response.retrieval.degraded) missingEvidence.push("Selected-source retrieval was degraded.");
  if (response.research?.truncated) missingEvidence.push("The selected-source Research pass was truncated.");
  if ((response.research?.passesRun ?? 0) !== (response.research?.passesPlanned ?? 0)) {
    missingEvidence.push("Not every planned Research pass completed.");
  }
  const cleanMissingEvidence = [...new Set(missingEvidence)].slice(0, 24);
  const selectedSources = request.workspace.sources.length;
  const resolvedSources = references.length;
  const passesPlanned = response.research?.passesPlanned ?? 0;
  const passesRun = response.research?.passesRun ?? 0;
  const unansweredCount = response.research?.unanswered?.length ?? 0;
  const omissionCount = response.retrieval.omissions?.length ?? 0;
  const attributable = response.completion.reason === "complete" && response.citations.length > 0 && Boolean(checker)
    && resolvedSources === selectedSources && !response.retrieval.degraded && !(response.retrieval.unavailable?.length)
    && omissionCount === 0 && unansweredCount === 0 && response.research?.truncated !== true
    && passesRun === passesPlanned && cleanMissingEvidence.length === 0;
  const plan = request.researchPlan.steps;
  return {
    sourceEnvelope: "supplied-source-only",
    limitation: "This report uses only the source sections explicitly supplied and selected in this project. It did not search the live web or inspect unselected material.",
    plan: { steps: plan.map((text, index) => ({ stepId: `research-step-${index + 1}`, text, status: "submitted" })) },
    progress: { status: attributable ? "report-ready" : "incomplete",
      selectedSources, resolvedSources, passesPlanned, passesRun,
      passagesRead: response.research?.passagesRead ?? 0, degraded: response.retrieval.degraded,
      truncated: response.research?.truncated === true, omissionCount, unansweredCount },
    sources: references.map(({ sourceId, sectionId, contentSha256 }) => ({ sourceId, sectionId, contentSha256 })),
    conflict: { status: "not-structured",
      message: "The current qualified Research contract does not classify conflicts separately. Inspect the final report and its citations; no agreement between sources is inferred." },
    missingEvidence: cleanMissingEvidence,
    report: { status: attributable ? "attributable" : "incomplete", checker,
      citationOrdinals: attributable ? response.citations.map(citation => citation.ordinal) : [] },
  };
}

function exactReviewContexts(references, contexts) {
  const values = Array.isArray(contexts) ? contexts : [];
  if (values.length !== references.length) throw Object.assign(new Error("Review context resolution was incomplete."),
    { code: "review-context-resolution-invalid" });
  return references.map((reference, index) => {
    const value = values[index];
    const valid = value && ["source", "artifact", "diff"].includes(value.contextType)
      && typeof value.targetId === "string" && value.targetId.length > 0 && value.targetId.length <= 160
      && value.sourceId === reference.sourceId && value.sectionId === reference.sectionId
      && value.contentSha256 === reference.contentSha256
      && (value.label === null || (typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 120));
    if (!valid) throw Object.assign(new Error("Review context resolution did not match the selected revisions."),
      { code: "review-context-resolution-invalid" });
    return { contextType: value.contextType, targetId: value.targetId, sourceId: value.sourceId,
      sectionId: value.sectionId, contentSha256: value.contentSha256, label: value.label };
  });
}

function exactRequestedEvidenceReferences(request, references) {
  const requested = request.workspace.sources;
  const locatorKeys = requested.map(locator => `${locator.sourceId}\u0000${locator.sectionId}`);
  const exact = references.length === requested.length && new Set(locatorKeys).size === locatorKeys.length
    && references.every((reference, index) => reference.projectId === request.project.projectId
      && reference.sourceId === requested[index].sourceId && reference.sectionId === requested[index].sectionId
      && /^[a-f0-9]{64}$/.test(reference.contentSha256)
      && (requested[index].contentSha256 === undefined || requested[index].contentSha256 === reference.contentSha256));
  if (!exact) {
    const review = request.lane === "review";
    throw Object.assign(new Error(`${review ? "Review" : "Research"} requires every requested locator in its original order.`),
      { code: review ? "review-context-selection-denied" : "research-source-selection-denied" });
  }
  return references;
}

function exactActiveResearchSources(request, references, sources) {
  const values = Array.isArray(sources) ? sources : [];
  const exact = values.length === references.length && values.every((source, index) => {
    const reference = references[index];
    return source && source.active !== false && source.projectId === request.project.projectId
      && source.sourceId === reference.sourceId && source.sectionId === reference.sectionId
      && source.contentSha256 === reference.contentSha256 && typeof source.content === "string"
      && sha256(source.content) === reference.contentSha256;
  });
  if (!exact) throw Object.assign(new Error("A selected Research source is unavailable or no longer at the admitted revision."),
    { code: "research-source-selection-denied" });
  return structuredClone(values);
}

function exactBoundReviewSources(request, references, sources) {
  const values = Array.isArray(sources) ? sources : [];
  const exact = values.length === references.length && values.every((source, index) => {
    const reference = references[index];
    return source && source.active !== false && source.projectId === request.project.projectId
      && source.sourceId === reference.sourceId && source.sectionId === reference.sectionId
      && source.contentSha256 === reference.contentSha256 && typeof source.content === "string"
      && sha256(source.content) === reference.contentSha256;
  });
  const characters = exact ? values.reduce((total, source) => total + source.content.length, 0) : Infinity;
  if (!exact || values.length > request.budgets.maximumPassages
      || characters > request.budgets.maximumEvidenceCharacters) {
    throw Object.assign(new Error("Review cannot supply every selected revision in full within the server-owned bounds."),
      { code: "review-context-not-fully-supplied" });
  }
  return structuredClone(values);
}

export class Gate2ReadOnlyService {
  constructor({ records, index, providers, continuity, workspaceResolver, telemetry = null,
    approvedKnowledge = null,
    reviewContextResolver = null, requireReviewCheck = false,
    statusProvider = () => ({ provider: "unknown", retrieval: "unknown", reranker: "unknown" }) }) {
    this.records = records;
    this.index = index;
    this.providers = providers;
    this.continuity = continuity;
    this.workspaceResolver = workspaceResolver;
    this.telemetry = telemetry;
    this.approvedKnowledge = approvedKnowledge;
    this.reviewContextResolver = reviewContextResolver;
    this.requireReviewCheck = requireReviewCheck === true;
    this.statusProvider = statusProvider;
  }

  async answer(rawRequest) {
    const request = parseGate2AnswerRequest(rawRequest);
    const execute = () => this.#execute(request);
    if (!this.telemetry) return execute();
    return this.telemetry.span("runaai.gate2.answer", request, { route: "gate2-read-only-continuity",
      lane: request.lane, component: "gate2", operation: "answer", "model.role": GATE2_MODEL_ROLES[request.lane],
      "schema.version": request.schemaVersion }, execute);
  }

  async #execute(request) {
    const role = GATE2_MODEL_ROLES[request.lane];
    const explicitSources = Boolean(request.workspace);
    const knowledgeRequired = ["research", "guarded", "workspace"].includes(request.lane)
      || explicitSources
      || (request.lane === "general" && requiresProjectRecord(request.message, request.history));
    let resolvedWorkspace = { references: [], denied: [] };
    let reviewContexts = [];
    let boundReviewSources = null;
    let boundResearchRecords = null;
    let knowledgeDelivery = null;
    let response = deterministicResponse(request);
    if (!response && knowledgeRequired && !explicitSources && this.index.requiresExplicitSelection === true) {
      response = emptyV1(request, { answer: "Select the source sections you want me to use, then ask your research or review question.",
        reason: "selected-sources-required", auditCode: "selected-sources-required", ground: "record-silent" });
    }
    let knowledgeFallbackReason = response ? "not-evaluated-deterministic-boundary"
      : knowledgeRequired ? "adapter-disabled"
        : request.lane === "code" ? "not-applicable-code-conversation" : "not-applicable-general-conversation";
    if (!response && explicitSources) {
      resolvedWorkspace = await this.workspaceResolver.resolve(request.project.projectId, request.workspace.sources);
      if (resolvedWorkspace.denied.length) response = emptyV1(request, {
        answer: "That information belongs to another project and is not available in this chat.",
        reason: "workspace-cross-project-denied", auditCode: "workspace-cross-project-denied",
      });
      if (!response && request.lane === "review") {
        exactRequestedEvidenceReferences(request, resolvedWorkspace.references);
        try {
          const sources = await this.records.activeSources(request.project.projectId, resolvedWorkspace.references);
          boundReviewSources = exactBoundReviewSources(request, resolvedWorkspace.references, sources);
        } catch (error) {
          if (error?.code !== "review-context-not-fully-supplied") throw error;
          response = emptyV1(request, {
            answer: "Runa could not review every selected revision in full within the current evidence bounds.",
            reason: error.code, auditCode: error.code, ground: "record-silent",
          });
        }
      }
      if (!response && request.lane === "research") {
        exactRequestedEvidenceReferences(request, resolvedWorkspace.references);
        const active = await this.records.activeSources(request.project.projectId, resolvedWorkspace.references);
        exactActiveResearchSources(request, resolvedWorkspace.references, active);
        boundResearchRecords = new BoundResearchRecordProxy(this.records, request, resolvedWorkspace.references);
      }
      if (!response && request.lane === "review") {
        const described = this.reviewContextResolver
          ? await this.reviewContextResolver.describeReviewContexts({
            principalId: request.participant.principalId, projectId: request.project.projectId,
          }, resolvedWorkspace.references)
          : resolvedWorkspace.references.map(reference => ({ contextType: "source", targetId: reference.sourceId,
            sourceId: reference.sourceId, sectionId: reference.sectionId,
            contentSha256: reference.contentSha256, label: null }));
        reviewContexts = exactReviewContexts(resolvedWorkspace.references, described);
      }
      if (response) knowledgeFallbackReason = "not-evaluated-workspace-boundary";
    }

    const suppliedSourceResearch = request.lane === "research" && explicitSources;
    if (!response && knowledgeRequired && !suppliedSourceResearch) {
      if (this.approvedKnowledge) {
        try {
          knowledgeDelivery = await this.approvedKnowledge.select({
            requestScope: {
              participantId: request.participant.verified ? request.participant.principalId : null,
              projectId: request.project.projectId,
              capabilities: GATE2_LANE_CAPABILITIES[request.lane],
            },
            task: request.message,
          });
        } catch {
          knowledgeDelivery = {};
        }
        const knowledgeReceipt = approvedKnowledgeReceipt(knowledgeDelivery);
        if (knowledgeReceipt.errorCode) {
          response = emptyV1(request, {
            answer: "The information needed to answer that project question is temporarily unavailable.",
            reason: knowledgeReceipt.errorCode,
            auditCode: knowledgeReceipt.errorCode,
          });
        }
      }
    }

    if (!response) {
      const selectedIndex = explicitSources
        ? new ExplicitIndex(this.index, resolvedWorkspace.references,
          { preserveExactSelection: request.lane === "review" })
        : this.index;
      // Application-bound conversations use the outer durable coordinator and
      // revision-checked continuity store. An inner answer cache must not replay
      // stale/incomplete output after the authoritative context advances.
      const selectedRecords = boundReviewSources
        ? new BoundReviewRecordProxy(this.records, resolvedWorkspace.references, boundReviewSources)
        : boundResearchRecords
          ? boundResearchRecords
        : request.participant.verified && request.contextRevision === undefined
          ? this.records : new EphemeralRecordProxy(this.records);
      const advisoryContext = suppliedSourceResearch ? null : providerAdvisoryFromDelivery(knowledgeDelivery);
      try {
        const configuredProvider = providerFor(this.providers, role);
        const provider = boundResearchRecords
          ? new BoundResearchProvider(configuredProvider, boundResearchRecords, request, resolvedWorkspace.references)
          : configuredProvider;
        const slice = new ReadOnlyAnswerSlice({ records: selectedRecords, index: selectedIndex, provider, advisoryContext,
          retrievalPolicy: explicitSources ? "required"
            : ["code", "review"].includes(request.lane) ? "none" : "conversation-aware" });
        response = await slice.answer(gate1Request(request));
      } catch (error) {
        if (!["provider-model-mismatch", "provider-role-unavailable"].includes(error?.code)) throw error;
        response = emptyV1(request, { answer: "Runa could not complete that message because the selected model was unavailable.",
          reason: error.code, auditCode: error.code, ground: "record-silent" });
        if (advisoryContext) response.auditCodes.push("approved-knowledge-delivered");
      }
      if (response.model.role !== "not-invoked" && response.model.role !== role) {
        response.answer = "Runa could not complete that message because the selected model was unavailable.";
        response.completion.reason = "provider-role-mismatch";
        response.auditCodes.push("provider-role-mismatch");
        response.model.role = role;
      }
    }

    response = structuredClone(response);
    response.schemaVersion = "runa2-answer-response/v2";
    response.requestId = request.requestId;
    response.lane = request.lane;
    if (response.model.role !== "not-invoked") response.model.role = role;
    if (request.lane === "review" && this.requireReviewCheck && response.completion.reason === "complete"
        && (!reviewChecker(response) || response.citations.length === 0)) {
      response.answer = "Runa could not complete the required Review check. No Review finding was accepted.";
      response.citations = [];
      response.completion.reason = "provider-response-check-invalid";
      response.auditCodes.push("required-review-check-missing");
    }
    const gates = applyCommonAnswerGates(response, request);
    const knowledgeReceipt = approvedKnowledgeReceipt(knowledgeDelivery, knowledgeFallbackReason, {
      delivered: response.auditCodes.includes("approved-knowledge-delivered"),
    });
    // Stamp and validate all application-owned evidence before persistence. The
    // private turn store must see the same source/execution metadata as the UI.
    const continuityStatus = await this.continuity.status();
    const dependency = await this.statusProvider({ request, response });
    response.workspace = explicitSources ? {
      explicitSources: request.workspace.sources.length,
      resolvedSources: resolvedWorkspace.references.length,
      extraReads: 0,
      citationStatus: citationStatus(response),
    } : null;
    response.review = reviewResult(request, response, reviewContexts);
    response.researchWorkflow = researchWorkflowResult(request, response, resolvedWorkspace.references);
    response.gates = gates;
    response.execution = answerExecutionStamp(request.lane);
    response.status = {
      lane: request.lane,
      modelRole: role,
      provider: response.model.provider === "none" ? (dependency.provider ?? "not-used") : response.model.provider,
      retrieval: response.retrieval.degraded ? "degraded" : (response.retrieval.attempted ? "available" : "not-used"),
      reranker: response.retrieval.unavailable.includes("reranker") ? "unavailable" : (dependency.reranker ?? "available"),
      chatAdapter: continuityStatus.chatAdapter,
      projectAdapter: continuityStatus.projectAdapter,
      settingsAdapter: continuityStatus.settingsAdapter,
      protectedStoresOpened: false,
      rollbackAvailable: continuityStatus.rollbackAvailable === true,
    };
    response.continuity = {
      durableChatEligible: request.participant.verified,
      turnRecorded: false,
      source: "not-recorded-yet",
    };
    if (request.contextRevision !== undefined) {
      response.contextRevision = request.contextRevision;
    }
    response.approvedKnowledge = knowledgeReceipt;
    response.effects = [];
    response = parseGate2AnswerResponse(response);
    const incompleteReasons = new Set(INCOMPLETE_ANSWER_REASONS);
    const continuityResult = incompleteReasons.has(response.completion.reason) || Boolean(knowledgeReceipt.errorCode)
      ? { turnRecorded: false, source: "not-recorded-incomplete-answer" }
      : await this.continuity.recordAnswer(request, response);
    response.continuity = {
      durableChatEligible: request.participant.verified,
      turnRecorded: continuityResult.turnRecorded === true,
      source: continuityResult.source,
    };
    if (request.contextRevision !== undefined) {
      response.contextRevision = request.contextRevision + (continuityResult.turnRecorded ? 1 : 0);
    }
    return parseGate2AnswerResponse(response);
  }
}
