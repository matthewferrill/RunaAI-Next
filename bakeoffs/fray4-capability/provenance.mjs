import { createHash } from "node:crypto";

export const PROVENANCE_CLASSES = Object.freeze([
  "system_instruction",
  "authenticated_user_request",
  "retrieved_document",
  "memory_recall",
  "tool_result",
  "model_output",
]);
const allowed = new Set(PROVENANCE_CLASSES);

export function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

export function createEnvelope({ provenance, sourceId, content, createdAt = new Date().toISOString() }) {
  if (!allowed.has(provenance)) throw new TypeError(`unsupported provenance: ${provenance}`);
  requiredString(sourceId, "sourceId");
  if (typeof content !== "string") throw new TypeError("content must be a string");
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) throw new TypeError("createdAt must be an ISO-compatible timestamp");
  return Object.freeze({
    schemaVersion: 1,
    provenance,
    sourceId,
    contentSha256: sha256(content),
    createdAt: new Date(parsed).toISOString(),
    content,
  });
}

export function requireAuthenticatedIntent(envelope) {
  if (!Object.isFrozen(envelope) || envelope?.provenance !== "authenticated_user_request") {
    throw new Error("capability intent must be an immutable authenticated_user_request envelope");
  }
  if (sha256(envelope.content) !== envelope.contentSha256) throw new Error("intent content digest mismatch");
  return envelope;
}

export function renderUntrustedContext(envelopes) {
  if (!Array.isArray(envelopes)) throw new TypeError("envelopes must be an array");
  return envelopes.map(envelope => {
    if (!allowed.has(envelope?.provenance)) throw new TypeError("invalid provenance envelope");
    if (sha256(envelope.content) !== envelope.contentSha256) throw new Error("context content digest mismatch");
    const authority = envelope.provenance === "system_instruction" || envelope.provenance === "authenticated_user_request"
      ? "authority-bearing-origin"
      : "untrusted-data-only";
    return [
      `<context provenance="${envelope.provenance}" authority="${authority}" source-sha256="${sha256(envelope.sourceId)}" content-sha256="${envelope.contentSha256}">`,
      envelope.content,
      "</context>",
    ].join("\n");
  }).join("\n\n");
}
