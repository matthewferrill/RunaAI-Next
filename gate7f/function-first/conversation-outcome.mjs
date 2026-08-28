export const INCOMPLETE_ANSWER_REASONS = Object.freeze(["timeout", "output-limited", "provider-output-empty",
  "provider-response-invalid", "provider-shape-invalid", "provider-incomplete", "provider-transport-failed",
  "provider-model-mismatch", "provider-role-mismatch", "provider-role-unavailable", "unverified-action-claim",
  "dependency-unavailable"]);

// Only the read-only answer operation uses this retry rule. Action receipts and
// uncertain effect outcomes must never be sent through automatic answer retry.
export function isRetryableConversationFailure(response) {
  return response?.schemaVersion === "runa2-answer-response/v2"
    && Array.isArray(response.effects) && response.effects.length === 0
    && response.execution?.status === "not-executed"
    && (INCOMPLETE_ANSWER_REASONS.includes(response.completion?.reason)
      || Boolean(response.approvedKnowledge?.errorCode));
}
