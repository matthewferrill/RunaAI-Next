export const CHAT_DEADLINE_MS = 65_000;

const retryableCompletionReasons = new Set([
  "timeout", "output-limited", "provider-output-empty", "provider-response-invalid",
  "provider-shape-invalid", "provider-response-check-invalid", "provider-incomplete", "provider-transport-failed",
  "provider-model-mismatch", "provider-role-mismatch", "provider-role-unavailable",
  "unverified-action-claim", "dependency-unavailable",
]);

const friendlyErrors = Object.freeze({
  "chat-response-empty": "Runa's response was interrupted before it reached this page.",
  "chat-response-invalid": "Runa returned a response this page could not finish reading.",
  "chat-request-timeout": "Runa took too long to respond.",
  "candidate-request-failed": "Runa could not complete that message.",
  "cutover-authority-unavailable": "Runa's service is temporarily unavailable.",
  "gate7a-browser-session-ambiguous": "More than one sign-in session is active. Sign out and sign in again.",
  "gate7a-ordinary-session-invalid": "Your session has ended. Sign in again to continue.",
  "identity-refresh-rejected": "Your session has ended. Sign in again to continue.",
  "identity-refresh-unavailable": "Runa could not renew your sign-in just now.",
  "identity-token-invalid": "Your session has ended. Sign in again to continue.",
  "request-timeout": "Runa took too long to respond.",
});

export class ChatClientError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw.trim()) throw new ChatClientError("chat-response-empty");
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new ChatClientError("chat-response-invalid"); }
  if (!response.ok) throw new ChatClientError(typeof value?.errorCode === "string"
    ? value.errorCode : "candidate-request-failed");
  if (typeof value?.answer !== "string" || !value.answer.trim()) {
    throw new ChatClientError("chat-response-invalid");
  }
  return value;
}

export function customerMessageFor(code) {
  return `${friendlyErrors[code] ?? "Runa could not complete that message."} Your message was not lost; you can retry it.`;
}

export function answerNeedsRetry(answer) {
  return retryableCompletionReasons.has(answer?.completion?.reason)
    || typeof answer?.approvedKnowledge?.errorCode === "string"
    || (answer?.continuity?.durableChatEligible === true && answer.continuity.turnRecorded !== true);
}

export function boundedHistory(history) {
  return history.slice(-24).map(turn => ({ role: turn.role, content: String(turn.content).slice(0, 8_000) }));
}

