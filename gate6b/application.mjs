import { createHash } from "node:crypto";
import { unverifiedParticipant } from "../gate5/identity.mjs";
import { assertSelectedAuthority } from "./authority.mjs";
import { assertConversationContext } from "../gate7f/function-first/conversation-context.mjs";
import { answerLaneAllowed } from "./function-contract.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const lanes = new Set(["general", "research", "code", "review"]);
const experiences = new Set(["chat", "code"]);
const PERSONAL_SCOPE = "runa:personal";
const EPHEMERAL_SCOPE = "runa:ephemeral";

const finiteInt = (value, fallback, minimum, maximum) => {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw coded("request-budget-invalid", "A request budget is outside the release boundary.");
  }
  return number;
};

function answerRequest(body, participant, totalDeadlineMs) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw coded("request-invalid", "A JSON request is required.");
  if (!lanes.has(body.lane)) throw coded("request-lane-invalid", "The requested lane is unavailable.");
  const experience = body.experience ?? (body.lane === "code" ? "code" : "chat");
  if (!experiences.has(experience) || !answerLaneAllowed(experience, body.lane)) {
    throw coded("request-experience-invalid", "The requested Chat or Code experience does not match its route.");
  }
  const verified = participant.verified === true;
  if (!verified && body.workspace) throw coded("workspace-authentication-required", "Workspace evidence requires a verified participant.");
  const projectId = verified ? String(body.projectId ?? PERSONAL_SCOPE) : EPHEMERAL_SCOPE;
  if (!/^[^\u0000-\u001f\u007f]{1,160}$/.test(projectId)) throw coded("request-project-invalid", "A bounded project scope is required.");
  const requestId = String(body.requestId ?? "").trim();
  const threadId = String(body.threadId ?? "").trim();
  if (!requestId || requestId.length > 160 || !threadId || threadId.length > 160) throw coded("request-id-invalid", "Bounded request and thread identifiers are required.");
  if (verified && body.contextRevision !== undefined
      && (!Number.isSafeInteger(body.contextRevision) || body.contextRevision < 0)) {
    throw coded("request-revision-invalid", "A nonnegative conversation revision is required.");
  }
  const workspace = ["research", "review"].includes(body.lane) ? (body.workspace ?? null) : null;
  return {
    schemaVersion: "runa2-answer-request/v2",
    requestId,
    lane: body.lane,
    experience,
    participant: { principalId: verified ? participant.principalId : "ephemeral", verified },
    project: { projectId },
    thread: { threadId },
    message: String(body.message ?? ""),
    history: Array.isArray(body.history) ? body.history : [],
    ...(verified && body.contextRevision !== undefined ? { contextRevision: body.contextRevision } : {}),
    workspace,
    budgets: {
      deadlineMs: finiteInt(body.budgets?.deadlineMs, totalDeadlineMs, 100, totalDeadlineMs),
      maximumPasses: finiteInt(body.budgets?.maximumPasses, 8, 1, 12),
      maximumPassages: finiteInt(body.budgets?.maximumPassages, 12, 1, 24),
      maximumEvidenceCharacters: finiteInt(body.budgets?.maximumEvidenceCharacters, 24_000, 128, 48_000),
    },
  };
}

function credentialPresent(credential) {
  return typeof credential === "string" && credential.length > 0;
}

export class SelectedCoreApplication {
  constructor({ mode = "shadow", targetGeneration, cutoverStatus, answerService, actionService,
    authenticator, authorizer, continuity = null, requestCoordinator = null, codeExecution = null,
    now = () => new Date(),
    stepUpMaxAgeMs = 5 * 60_000, totalDeadlineMs = 60_000 }) {
    if (!Number.isInteger(totalDeadlineMs) || totalDeadlineMs < 100 || totalDeadlineMs > 120_000) {
      throw coded("application-deadline-invalid", "The total answer deadline is outside the release boundary.");
    }
    this.mode = mode;
    this.targetGeneration = targetGeneration;
    this.cutoverStatus = cutoverStatus;
    this.answerService = answerService;
    this.actionService = actionService;
    this.authenticator = authenticator;
    this.authorizer = authorizer;
    this.continuity = continuity ?? answerService?.continuity ?? null;
    this.requestCoordinator = requestCoordinator;
    this.codeExecution = codeExecution;
    this.now = now;
    this.stepUpMaxAgeMs = stepUpMaxAgeMs;
    this.totalDeadlineMs = totalDeadlineMs;
  }

  async authority() {
    let cutover;
    try { cutover = await this.cutoverStatus(); }
    catch { throw coded("cutover-authority-unavailable", "The selected authority store is unavailable."); }
    return assertSelectedAuthority({ mode: this.mode, targetGeneration: this.targetGeneration, cutover });
  }

  async answer({ credential = null, body }) {
    await this.authority();
    const participant = credentialPresent(credential)
      ? await this.authenticator.authenticate(credential, { requireOnline: false })
      : unverifiedParticipant();
    const action = "chat-ephemeral";
    const projectId = participant.verified ? String(body?.projectId ?? PERSONAL_SCOPE) : EPHEMERAL_SCOPE;
    const decision = await this.authorizer.authorize({ participant, action, resource: `project:${PERSONAL_SCOPE}` });
    if (!decision?.allowed) throw coded(decision?.reason ?? "authorization-denied", "The selected read route was denied.");
    const request = answerRequest(body, participant, this.totalDeadlineMs);
    let preparedRequest = request;
    if (request.participant.verified) {
      const store = this.continuity;
      if (typeof store?.prepareAnswerContext !== "function") {
        throw coded("conversation-context-unavailable", "Authoritative conversation context is unavailable.");
      }
      const scope = { participantId: request.participant.principalId, projectId: request.project.projectId,
        threadId: request.thread.threadId, experience: request.experience };
      let context;
      try { context = assertConversationContext(await store.prepareAnswerContext(scope), scope); }
      catch (error) {
        if (["project-not-found", "project-scope-denied", "project-experience-denied", "chat-not-found",
          "chat-scope-denied", "chat-experience-denied", "conversation-context-invalid"].includes(error?.code)) throw error;
        throw coded("conversation-context-unavailable", "Authoritative conversation context is unavailable.");
      }
      // The browser can select a chat, but cannot supply its retained history or authority.
      preparedRequest = { ...request, history: context.history, contextRevision: context.turnCount };
    }
    const run = () => {
      if (request.contextRevision !== undefined && request.contextRevision !== preparedRequest.contextRevision) {
        throw coded("conversation-revision-conflict", "The conversation changed. Reload the chat before retrying.");
      }
      return this.answerService.answer(preparedRequest);
    };
    return this.requestCoordinator && request.participant.verified ? this.requestCoordinator.runOnce({
      operation: "answer", requestId: request.requestId, actorId: request.participant.principalId,
      inputDigest: sha256(JSON.stringify(request)), execute: run,
    }) : run();
  }

  async navigation({ credential, experience }) {
    await this.authority();
    const participant = await this.#personalParticipant(credential);
    return this.#continuity().navigation(participant.principalId, this.#experience(experience));
  }

  async createProject({ credential, body }) {
    await this.authority();
    const participant = await this.#personalParticipant(credential);
    const experience = this.#experience(body?.experience);
    const requestId = String(body?.requestId ?? "").trim();
    const displayName = String(body?.displayName ?? "").replace(/\s+/g, " ").trim();
    if (!requestId || requestId.length > 160) throw coded("request-id-invalid", "A bounded project request id is required.");
    if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) {
      throw coded("project-name-invalid", "A project name between one and 120 characters is required.");
    }
    const run = () => this.#continuity().createProject({ participantId: participant.principalId,
      requestId, experience, displayName });
    return this.requestCoordinator ? this.requestCoordinator.runOnce({ operation: "create-personal-project",
      requestId, actorId: participant.principalId,
      inputDigest: sha256(JSON.stringify({ experience, displayName })), execute: run }) : run();
  }

  async readChat({ credential, chatId, experience }) {
    await this.authority();
    const participant = await this.#personalParticipant(credential);
    const retainedChatId = String(chatId ?? "").trim();
    if (!retainedChatId || retainedChatId.length > 160) throw coded("chat-id-invalid", "A bounded chat id is required.");
    return this.#continuity().readChat(participant.principalId, retainedChatId, this.#experience(experience));
  }

  async executeCode({ credential, body }) {
    await this.authority();
    if (!this.codeExecution) throw coded("sandbox-unavailable", "Harmless JavaScript execution is unavailable.");
    const participant = await this.#personalParticipant(credential);
    if (body?.experience !== "code" || body?.language !== "javascript") {
      throw coded("request-experience-invalid", "This route accepts JavaScript from the Code experience only.");
    }
    const requestId = String(body?.requestId ?? "").trim();
    const threadId = String(body?.threadId ?? "").trim();
    const projectId = String(body?.projectId ?? PERSONAL_SCOPE).trim();
    if (!requestId || requestId.length > 160 || !threadId || threadId.length > 160) {
      throw coded("request-id-invalid", "Bounded request and thread identifiers are required.");
    }
    if (!/^[^\u0000-\u001f\u007f]{1,160}$/.test(projectId)) {
      throw coded("request-project-invalid", "A bounded project scope is required.");
    }
    return this.codeExecution.execute({
      schemaVersion: "runa2-code-execution-request/v1",
      requestId,
      participant: { principalId: participant.principalId, verified: true },
      project: { projectId },
      thread: { threadId },
      experience: "code",
      language: "javascript",
      source: typeof body?.source === "string" ? body.source : "",
      origin: { type: "authenticated-user-run-action" },
    });
  }

  async proposeSetting({ credential, body }) {
    await this.authority();
    const participant = await this.#verified(credential, false);
    const projectId = String(body?.projectId ?? PERSONAL_SCOPE);
    await this.#authorize(participant, "propose-own-preference", `project:${projectId}`);
    return this.actionService.propose({
      schemaVersion: "runa2-action-proposal-request/v1",
      requestId: String(body?.requestId ?? ""),
      participant: { principalId: participant.principalId, verified: true },
      project: { projectId },
      origin: { type: "steward-request", reference: body?.originReference ?? null },
      action: { kind: "participant-setting.set-default-intelligence-level",
        settingKey: "defaultIntelligenceLevel", value: body?.value },
      rollbackOfReceiptId: body?.rollbackOfReceiptId ?? null,
    });
  }

  async approveSetting({ credential, body }) {
    await this.authority();
    const participant = await this.#verified(credential, true);
    const projectId = String(body?.projectId ?? PERSONAL_SCOPE);
    await this.#authorize(participant, "approve-workspace-action", `project:${projectId}`);
    this.#freshStepUp(participant);
    return this.actionService.approveAndExecute({
      schemaVersion: "runa2-action-approval-request/v1",
      approvalId: String(body?.approvalId ?? ""),
      participant: { principalId: participant.principalId, verified: true },
      proposalId: String(body?.proposalId ?? ""),
      proposalDigest: String(body?.proposalDigest ?? ""),
      approvalPhrase: body?.approvalPhrase,
    });
  }

  async declineSetting({ credential, body }) {
    await this.authority();
    const participant = await this.#verified(credential, false);
    const projectId = String(body?.projectId ?? PERSONAL_SCOPE);
    await this.#authorize(participant, "propose-own-preference", `project:${projectId}`);
    return this.actionService.decline({
      schemaVersion: "runa2-action-decline-request/v1",
      participant: { principalId: participant.principalId, verified: true },
      proposalId: String(body?.proposalId ?? ""),
      proposalDigest: String(body?.proposalDigest ?? ""),
      reason: String(body?.reason ?? ""),
    });
  }

  async #verified(credential, requireOnline) {
    if (!credentialPresent(credential)) throw coded("identity-token-missing", "A verified session is required.");
    const participant = await this.authenticator.authenticate(credential, { requireOnline });
    if (!participant?.verified) throw coded("participant-authentication-required", "A verified session is required.");
    return participant;
  }

  async #personalParticipant(credential) {
    const participant = await this.#verified(credential, false);
    await this.#authorize(participant, "chat-ephemeral", `project:${PERSONAL_SCOPE}`);
    return participant;
  }

  #experience(value) {
    if (!experiences.has(value)) throw coded("request-experience-invalid", "Chat or Code experience is required.");
    return value;
  }

  #continuity() {
    if (!this.continuity) throw coded("continuity-unavailable", "Chat and project continuity is unavailable.");
    return this.continuity;
  }

  async #authorize(participant, action, resource) {
    const decision = await this.authorizer.authorize({ participant, action, resource });
    if (!decision?.allowed) throw coded(decision?.reason ?? "authorization-denied", "The selected action was denied.");
    return decision;
  }

  #freshStepUp(participant) {
    const authenticatedAt = Date.parse(participant.authenticatedAt);
    const age = this.now().getTime() - authenticatedAt;
    const methods = new Set(participant.methods ?? []);
    if (!Number.isFinite(authenticatedAt) || age < 0 || age > this.stepUpMaxAgeMs
        || !["webauthn", "passkey", "fido2", "windows-hello"].some(method => methods.has(method))) {
      throw coded("fresh-step-up-required", "A fresh WebAuthn or passkey step-up is required.");
    }
  }
}

export { PERSONAL_SCOPE, EPHEMERAL_SCOPE };
