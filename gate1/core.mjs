import { createHash, randomBytes } from "node:crypto";
import { parseAnswerRequest, parseAnswerResponse } from "./contracts.mjs";
import { containsRetrievedAuthorityInstruction } from "./content-policy.mjs";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const protectedPattern = /\b(device vault|dpapi|windows hello|credential store|private key|machine[- ]bound ciphertext)\b/i;
const metaphysicalPattern = /\b(god|deity|soul|meaning of life|afterlife)\b/i;
const policySuspensionPattern = /\b(turn off|disable|suspend|ignore|bypass)\b.{0,40}\b(approval|policy|guard|gate)s?\b/i;
const crossProjectPattern = /\b(?:other|another) project(?:'s)?\b/i;
const stopWords = new Set(["a", "an", "and", "does", "explain", "how", "is", "of", "the", "to", "what"]);

export function planResearchPasses(question, maximumPasses) {
  const words = [...new Set(String(question).toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter(word => word.length > 2 && !stopWords.has(word));
  return ["whole-question", ...words.map(word => `term:${word}`)].slice(0, maximumPasses);
}

export function deterministicPreflight(message) {
  if (protectedPattern.test(message)) return {
    code: "protected-source-denied",
    answer: "That source is protected and is not available to this read-only migration slice.",
  };
  if (crossProjectPattern.test(message)) return {
    code: "cross-project-request-denied",
    answer: "This request is scoped to the trusted project in its request envelope; another project's record is not available.",
  };
  if (policySuspensionPattern.test(message)) return {
    code: "effect-policy-suspension-denied",
    answer: "The approval boundary is deterministic and remains active. Tell me the underlying goal and I can help with its read-only portion.",
  };
  if (/^\s*\//.test(message)) return {
    code: "unknown-command", answer: "That command is not available in this migration slice.",
  };
  return null;
}

export function classifyGround(message, evidence) {
  if (metaphysicalPattern.test(message)) return "not-a-question-of-fact";
  return evidence.length ? "record-answers" : "record-silent";
}

function baseResponse(request, correlationId) {
  return {
    schemaVersion: "runa2-answer-response/v1",
    requestId: request.requestId,
    participantId: request.participant.principalId,
    projectId: request.project.projectId,
    threadId: request.thread.threadId,
    lane: request.lane,
    answer: "",
    ground: "record-silent",
    retrieval: { attempted: false, skipped: false, skipReason: "", empty: true, degraded: false,
      evidenceCount: 0, unavailable: [], omissions: [] },
    research: request.lane === "research" ? { passesPlanned: 0, passesRun: 0, passesWithNothing: 0,
      passagesRead: 0, unanswered: [], truncated: false } : null,
    citations: [],
    model: { role: "not-invoked", provider: "none", modelId: "none" },
    completion: { reason: "complete", timedOut: false, outputLimited: false },
    trace: { correlationId },
    effects: [],
    auditCodes: [],
  };
}

const citationKey = value => `${value.sourceId}\u0000${value.sectionId}`;

function validateCitations(candidate, evidence) {
  const known = new Map(evidence.map(item => [citationKey(item), item]));
  const citations = [];
  const unknown = [];
  for (const [index, item] of (candidate ?? []).entries()) {
    const source = known.get(citationKey(item));
    if (!source) unknown.push(item);
    else citations.push({ sourceId: source.sourceId, sectionId: source.sectionId,
      contentSha256: source.contentSha256, ordinal: index + 1 });
  }
  return { citations, unknown };
}

function boundedEvidence(evidence, maximumCharacters) {
  let used = 0;
  let truncated = false;
  const result = [];
  for (const source of evidence) {
    const remaining = maximumCharacters - used;
    if (remaining <= 0) { truncated = true; break; }
    const content = source.content.slice(0, remaining);
    if (content.length < source.content.length) truncated = true;
    result.push({ ...source, content });
    used += content.length;
  }
  return { evidence: result, truncated };
}

export class ReadOnlyAnswerSlice {
  constructor({ records, index, provider, telemetry = null }) {
    this.records = records;
    this.index = index;
    this.provider = provider;
    this.telemetry = telemetry;
  }

  async answer(rawRequest) {
    const request = parseAnswerRequest(rawRequest);
    const existing = await this.records.getCommitted(request);
    if (existing) return existing;
    const correlationId = randomBytes(16).toString("hex");
    const execute = () => this.#execute(request, correlationId);
    const response = this.telemetry
      ? await this.telemetry.span("runaai.answer", request, { route: "read-only-answer", lane: request.lane,
        component: "gate1", operation: "answer", "schema.version": request.schemaVersion }, execute)
      : await execute();
    return this.records.commit(request, response);
  }

  async #execute(request, correlationId) {
    const response = baseResponse(request, correlationId);
    const preflight = deterministicPreflight(request.message);
    if (preflight) {
      response.answer = preflight.answer;
      response.retrieval.skipped = true;
      response.retrieval.skipReason = preflight.code;
      response.ground = "no-ground-needed";
      response.completion.reason = preflight.code;
      response.auditCodes.push(preflight.code);
      return parseAnswerResponse(response);
    }

    if (metaphysicalPattern.test(request.message)) {
      response.retrieval.skipped = true;
      response.retrieval.skipReason = "record-not-applicable";
      response.ground = "not-a-question-of-fact";
      return parseAnswerResponse(await this.#providerAnswer(request, [], response));
    }

    const passes = request.lane === "research"
      ? planResearchPasses(request.message, request.budgets.maximumPasses)
      : ["whole-question"];
    if (response.research) response.research.passesPlanned = passes.length;
    const references = new Map();
    let passesWithNothing = 0;
    try {
      for (const pass of passes) {
        const query = pass === "whole-question" ? request.message : pass.slice(5);
        const result = await this.index.search({ projectId: request.project.projectId, query,
          maximumPassages: request.budgets.maximumPassages });
        response.retrieval.attempted = true;
        if (!response.auditCodes.includes("project-scope-enforced")) response.auditCodes.push("project-scope-enforced");
        response.retrieval.degraded ||= result.degraded === true;
        response.retrieval.unavailable.push(...(result.unavailable ?? []));
        if (!(result.references?.length)) passesWithNothing += 1;
        for (const reference of result.references ?? []) references.set(citationKey(reference), reference);
        if (response.research) response.research.passesRun += 1;
      }
    } catch (error) {
      response.retrieval.attempted = true;
      response.retrieval.empty = false;
      response.retrieval.degraded = true;
      response.retrieval.unavailable = [String(error?.code ?? "retrieval-unavailable")];
      response.retrieval.omissions = ["Synthetic retrieval dependency was unavailable; this is not an empty-record result."];
      response.answer = "I could not check the synthetic project record because its retrieval dependency was unavailable.";
      response.ground = "record-silent";
      response.completion.reason = "dependency-unavailable";
      response.auditCodes.push("retrieval-dependency-unavailable");
      if (response.research) {
        response.research.passesWithNothing = passesWithNothing;
        response.research.unanswered = passes.map(pass => pass.replace(/^term:/, ""));
      }
      return parseAnswerResponse(response);
    }

    let active = await this.records.activeSources(request.project.projectId, [...references.values()]);
    const deniedInstructions = active.filter(source => containsRetrievedAuthorityInstruction(source.content));
    if (deniedInstructions.length) {
      active = active.filter(source => !deniedInstructions.includes(source));
      response.retrieval.omissions.push("Retrieved content containing authority or tool instructions was withheld before model processing.");
      response.auditCodes.push("retrieved-instruction-denied");
    }
    if (typeof this.index.rerank === "function" && active.length) {
      const reranked = await this.index.rerank(request.message, active, request.budgets.maximumPassages);
      active = reranked.sources;
      response.retrieval.degraded ||= reranked.degraded === true;
      response.retrieval.unavailable.push(...(reranked.unavailable ?? []));
    }
    const { evidence, truncated } = boundedEvidence(
      active.slice(0, request.budgets.maximumPassages), request.budgets.maximumEvidenceCharacters);
    response.retrieval.evidenceCount = evidence.length;
    response.retrieval.empty = evidence.length === 0;
    if (references.size > active.length) {
      response.retrieval.omissions.push("One or more derived references were stale, revoked, or outside the active project record.");
      response.auditCodes.push("inactive-derived-reference-excluded");
    }
    response.ground = classifyGround(request.message, evidence);
    if (response.research) {
      const terms = passes.filter(pass => pass.startsWith("term:")).map(pass => pass.slice(5));
      response.research.passesWithNothing = passesWithNothing;
      response.research.passagesRead = evidence.length;
      response.research.unanswered = terms.filter(term => !evidence.some(item => item.content.toLowerCase().includes(term)));
      response.research.truncated = truncated || passes.length === request.budgets.maximumPasses;
    }

    if (!evidence.length) {
      const instructionDenied = response.auditCodes.includes("retrieved-instruction-denied");
      response.answer = instructionDenied
        ? "The retrieved source was withheld because it contained instructions that could alter authority or invoke a tool."
        : "The synthetic project record did not contain evidence that answers that question.";
      response.completion.reason = instructionDenied ? "retrieved-instruction-denied" : "honest-empty";
      if (!instructionDenied) response.auditCodes.push("record-silent");
      return parseAnswerResponse(response);
    }
    return parseAnswerResponse(await this.#providerAnswer(request, evidence, response));
  }

  async #providerAnswer(request, evidence, response) {
    const started = Date.now();
    try {
      const generated = await this.provider.answer({
        request: { lane: request.lane, message: request.message, history: request.history },
        evidence: evidence.map(item => ({ sourceId: item.sourceId, sectionId: item.sectionId,
          contentSha256: item.contentSha256, content: item.content, provenance: "untrusted-retrieved-data" })),
      }, { deadlineMs: request.budgets.deadlineMs, maximumOutputBytes: 16_000 });
      if (Date.now() - started > request.budgets.deadlineMs + 250) {
        const error = new Error("provider exceeded deadline tolerance");
        error.code = "provider-timeout";
        throw error;
      }
      const checked = validateCitations(generated.citations, evidence);
      response.answer = String(generated.answer ?? "");
      response.citations = checked.citations;
      response.model = generated.model;
      response.completion.outputLimited = generated.outputLimited === true;
      response.completion.reason = generated.outputLimited ? "output-limited" : "complete";
      if (checked.unknown.length) {
        response.answer += "\n\nCitation check: one or more references were not present in the supplied evidence.";
        response.completion.reason = "citation-unverified";
        response.auditCodes.push("unknown-citation");
      }
      return response;
    } catch (error) {
      if (error?.code === "provider-output-limited") {
        response.answer = "The answer exceeded the configured output limit and was not partially delivered.";
        response.completion = { reason: "output-limited", timedOut: false, outputLimited: true };
        response.auditCodes.push("provider-output-limited");
        return response;
      }
      if (error?.code !== "provider-timeout" && error?.name !== "TimeoutError" && error?.name !== "AbortError") throw error;
      response.answer = "The answer was not completed before the request deadline.";
      response.completion = { reason: "timeout", timedOut: true, outputLimited: false };
      response.auditCodes.push("provider-timeout");
      return response;
    }
  }
}

export function sourceSection({ projectId, sourceId, sectionId, content, active = true }) {
  return { projectId, sourceId, sectionId, content, active, contentSha256: sha256(content) };
}
