import { createHash } from "node:crypto";
import { unverifiedParticipant } from "../gate5/identity.mjs";
import { assertSelectedAuthority } from "./authority.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const lanes = new Set(["general", "research", "guarded", "workspace"]);
const PERSONAL_SCOPE = "runa:personal";
const EPHEMERAL_SCOPE = "runa:ephemeral";

const finiteInt = (value, fallback, minimum, maximum) => {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw coded("request-budget-invalid", "A request budget is outside the release boundary.");
  }
  return number;
};

function answerRequest(body, participant) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw coded("request-invalid", "A JSON request is required.");
  if (!lanes.has(body.lane)) throw coded("request-lane-invalid", "The requested lane is unavailable.");
  const verified = participant.verified === true;
  if (!verified && body.lane === "workspace") throw coded("workspace-authentication-required", "Workspace evidence requires a verified participant.");
  const projectId = verified ? String(body.projectId ?? PERSONAL_SCOPE) : EPHEMERAL_SCOPE;
  if (!/^[^\u0000-\u001f\u007f]{1,160}$/.test(projectId)) throw coded("request-project-invalid", "A bounded project scope is required.");
  const requestId = String(body.requestId ?? "").trim();
  const threadId = String(body.threadId ?? "").trim();
  if (!requestId || requestId.length > 160 || !threadId || threadId.length > 160) throw coded("request-id-invalid", "Bounded request and thread identifiers are required.");
  const workspace = body.lane === "workspace" ? body.workspace : null;
  return {
    schemaVersion: "runa2-answer-request/v2",
    requestId,
    lane: body.lane,
    participant: { principalId: verified ? participant.principalId : "ephemeral", verified },
    project: { projectId },
    thread: { threadId },
    message: String(body.message ?? ""),
    history: Array.isArray(body.history) ? body.history : [],
    workspace,
    budgets: {
      deadlineMs: finiteInt(body.budgets?.deadlineMs, 30_000, 100, 30_000),
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
    authenticator, authorizer, requestCoordinator = null, now = () => new Date(),
    stepUpMaxAgeMs = 5 * 60_000 }) {
    this.mode = mode;
    this.targetGeneration = targetGeneration;
    this.cutoverStatus = cutoverStatus;
    this.answerService = answerService;
    this.actionService = actionService;
    this.authenticator = authenticator;
    this.authorizer = authorizer;
    this.requestCoordinator = requestCoordinator;
    this.now = now;
    this.stepUpMaxAgeMs = stepUpMaxAgeMs;
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
    const action = body?.lane === "workspace" ? "use-local-workspace-evidence" : "chat-ephemeral";
    const projectId = participant.verified ? String(body?.projectId ?? PERSONAL_SCOPE) : EPHEMERAL_SCOPE;
    const decision = await this.authorizer.authorize({ participant, action, resource: `project:${projectId}` });
    if (!decision?.allowed) throw coded(decision?.reason ?? "authorization-denied", "The selected read route was denied.");
    const request = answerRequest(body, participant);
    const run = () => this.answerService.answer(request);
    return this.requestCoordinator && request.participant.verified ? this.requestCoordinator.runOnce({
      operation: "answer", requestId: request.requestId, actorId: request.participant.principalId,
      inputDigest: sha256(JSON.stringify(request)), execute: run,
    }) : run();
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
