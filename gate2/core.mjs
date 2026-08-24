import { createHash, randomBytes } from "node:crypto";
import { ReadOnlyAnswerSlice, requiresProjectRecord } from "../gate1/core.mjs";
import { parseGate2AnswerRequest, parseGate2AnswerResponse, GATE2_LANE_CAPABILITIES, GATE2_MODEL_ROLES } from "./contracts.mjs";
import { approvedKnowledgeReceipt, providerAdvisoryFromDelivery } from "../gate4c/answer-context.mjs";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const protectedPattern = /\b(device vault|dpapi|windows hello|credential store|private key|machine[- ]bound ciphertext)\b/i;
const currentLookupPattern = /\b(today|current weather|current news|current price|live score|near me|showtimes?)\b/i;
const effectRequestPattern = /\b(write|delete|execute|deploy|approve|learn|remember)\b/i;
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
  async search({ projectId, query, maximumPassages }) {
    this.searches.push({ projectId, query });
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
  if (protectedPattern.test(request.message)) return emptyV1(request, {
    answer: "That protected source is outside this synthetic read-only gate.",
    reason: "protected-source-denied", auditCode: "protected-source-denied",
  });
  if (sessionRecallPattern.test(request.message)) {
    const prior = [...request.history].reverse().find(turn => turn.role === "user");
    return emptyV1(request, {
      answer: prior ? `Your previous question was: ${prior.content}` : "There is no earlier user turn in this session.",
      reason: "session-recall", auditCode: "session-recall-deterministic",
    });
  }
  if (currentLookupPattern.test(request.message)) return emptyV1(request, {
    answer: "A current source would be needed; this Gate 2 slice has no external or live lookup capability.",
    reason: "current-source-required", auditCode: "external-network-not-used",
  });
  if (effectRequestPattern.test(request.message)) return emptyV1(request, {
    answer: "This Gate 2 route is read-only and cannot perform, approve, or learn from that effect.",
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
  const codes = [`answer-gates-executed:${request.lane}`];
  if (response.auditCodes.includes("unknown-citation")) codes.push("citation-unknown-visible");
  if (/\bI (?:checked|looked up|ran)\b/i.test(response.answer) && !response.retrieval.attempted) {
    codes.push("claimed-lookup-without-receipt");
  }
  const unsupportedNumber = response.answer.match(/\b\d{4,}\b/)?.[0];
  if (unsupportedNumber && !request.message.includes(unsupportedNumber) && response.citations.length === 0) {
    codes.push("unsupported-numeric-claim");
  }
  if (codes.length > 1) {
    response.answer += `\n\nAnswer gate: ${codes.slice(1).join(", ")}.`;
    for (const code of codes.slice(1)) if (!response.auditCodes.includes(code)) response.auditCodes.push(code);
  }
  return { executed: true, codes };
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
    const knowledgeRequired = request.lane !== "general" || requiresProjectRecord(request.message, request.history);
    let resolvedWorkspace = { references: [], denied: [] };
    let knowledgeDelivery = null;
    let response = deterministicResponse(request);
    let knowledgeFallbackReason = response ? "not-evaluated-deterministic-boundary"
      : knowledgeRequired ? "adapter-disabled" : "not-applicable-general-conversation";
    if (!response && request.lane === "workspace") {
      resolvedWorkspace = await this.workspaceResolver.resolve(request.project.projectId, request.workspace.sources);
      if (resolvedWorkspace.denied.length) response = emptyV1(request, {
        answer: "The requested source belongs to another project and was denied before model delivery.",
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
            answer: "Approved knowledge was unavailable, so the request was not sent to the model.",
            reason: knowledgeReceipt.errorCode,
            auditCode: knowledgeReceipt.errorCode,
          });
        }
      }
    }

    if (!response) {
      const selectedIndex = request.lane === "workspace"
        ? new ExplicitIndex(this.index, resolvedWorkspace.references)
        : this.index;
      const selectedRecords = request.participant.verified ? this.records : new EphemeralRecordProxy(this.records);
      const provider = providerFor(this.providers, role);
      const advisoryContext = providerAdvisoryFromDelivery(knowledgeDelivery);
      const slice = new ReadOnlyAnswerSlice({ records: selectedRecords, index: selectedIndex, provider, advisoryContext,
        retrievalPolicy: request.lane === "workspace" ? "required" : "conversation-aware" });
      try {
        response = await slice.answer(gate1Request(request));
      } catch (error) {
        if (!["provider-model-mismatch", "provider-role-unavailable"].includes(error?.code)) throw error;
        response = emptyV1(request, { answer: "The configured provider identity did not match the deterministic route.",
          reason: error.code, auditCode: error.code, ground: "record-silent" });
        if (advisoryContext) response.auditCodes.push("approved-knowledge-delivered");
      }
      if (response.model.role !== "not-invoked" && response.model.role !== role) {
        response.answer = "The provider returned under a role that did not match the deterministic application route.";
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
    const incompleteReasons = new Set(["timeout", "output-limited", "provider-output-empty",
      "provider-response-invalid", "provider-shape-invalid", "provider-incomplete",
      "provider-transport-failed", "provider-model-mismatch", "provider-role-mismatch",
      "provider-role-unavailable"]);
    const continuityResult = incompleteReasons.has(response.completion.reason)
      ? { turnRecorded: false, source: "not-recorded-incomplete-answer" }
      : await this.continuity.recordAnswer(request, response);
    const continuityStatus = await this.continuity.status();
    const dependency = await this.statusProvider({ request, response });
    response.workspace = request.lane === "workspace" ? {
      explicitSources: request.workspace.sources.length,
      resolvedSources: resolvedWorkspace.references.length,
      extraReads: 0,
      citationStatus: citationStatus(response),
    } : null;
    response.gates = gates;
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
    response.approvedKnowledge = approvedKnowledgeReceipt(knowledgeDelivery, knowledgeFallbackReason, {
      delivered: response.auditCodes.includes("approved-knowledge-delivered"),
    });
    response.effects = [];
    return parseGate2AnswerResponse(response);
  }
}
