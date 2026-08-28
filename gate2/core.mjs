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
  constructor(delegate, references) {
    this.delegate = delegate;
    this.references = references;
    this.searches = [];
  }
  async search({ projectId, query, maximumPassages, deadlineMs }) {
    this.searches.push({ projectId, query });
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

export class Gate2ReadOnlyService {
  constructor({ records, index, providers, continuity, workspaceResolver, telemetry = null,
    approvedKnowledge = null,
    statusProvider = () => ({ provider: "unknown", retrieval: "unknown", reranker: "unknown" }) }) {
    this.records = records;
    this.index = index;
    this.providers = providers;
    this.continuity = continuity;
    this.workspaceResolver = workspaceResolver;
    this.telemetry = telemetry;
    this.approvedKnowledge = approvedKnowledge;
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
      if (response) knowledgeFallbackReason = "not-evaluated-workspace-boundary";
    }

    if (!response && knowledgeRequired) {
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
        ? new ExplicitIndex(this.index, resolvedWorkspace.references)
        : this.index;
      // Application-bound conversations use the outer durable coordinator and
      // revision-checked continuity store. An inner answer cache must not replay
      // stale/incomplete output after the authoritative context advances.
      const selectedRecords = request.participant.verified && request.contextRevision === undefined
        ? this.records : new EphemeralRecordProxy(this.records);
      const advisoryContext = providerAdvisoryFromDelivery(knowledgeDelivery);
      try {
        const provider = providerFor(this.providers, role);
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
    const gates = applyCommonAnswerGates(response, request);
    const knowledgeReceipt = approvedKnowledgeReceipt(knowledgeDelivery, knowledgeFallbackReason, {
      delivered: response.auditCodes.includes("approved-knowledge-delivered"),
    });
    const incompleteReasons = new Set(INCOMPLETE_ANSWER_REASONS);
    const continuityResult = incompleteReasons.has(response.completion.reason) || Boolean(knowledgeReceipt.errorCode)
      ? { turnRecorded: false, source: "not-recorded-incomplete-answer" }
      : await this.continuity.recordAnswer(request, response);
    const continuityStatus = await this.continuity.status();
    const dependency = await this.statusProvider({ request, response });
    response.workspace = explicitSources ? {
      explicitSources: request.workspace.sources.length,
      resolvedSources: resolvedWorkspace.references.length,
      extraReads: 0,
      citationStatus: citationStatus(response),
    } : null;
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
      turnRecorded: continuityResult.turnRecorded === true,
      source: continuityResult.source,
    };
    if (request.contextRevision !== undefined) {
      response.contextRevision = request.contextRevision + (continuityResult.turnRecorded ? 1 : 0);
    }
    response.approvedKnowledge = knowledgeReceipt;
    response.effects = [];
    return parseGate2AnswerResponse(response);
  }
}
