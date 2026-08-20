import { randomUUID } from "node:crypto";
import { requireAuthenticatedIntent, sha256 } from "./provenance.mjs";

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function normalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("arguments cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new TypeError("arguments cannot contain undefined");
      out[key] = normalize(value[key]);
    }
    return out;
  }
  throw new TypeError("arguments must contain JSON values only");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function canonicalizeArguments(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("arguments must be an object");
  return JSON.stringify(normalize(args));
}

export function argumentHash(args) {
  return sha256(canonicalizeArguments(args));
}

export function createActionRequest({
  intent,
  actorId,
  action,
  resourceId,
  arguments: args,
  issuedAt = new Date().toISOString(),
  expiresAt,
  requestId = randomUUID(),
  idempotencyKey = randomUUID(),
}) {
  requireAuthenticatedIntent(intent);
  required(actorId, "actorId");
  required(action, "action");
  required(resourceId, "resourceId");
  required(requestId, "requestId");
  required(idempotencyKey, "idempotencyKey");
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) {
    throw new TypeError("expiresAt must be later than issuedAt");
  }
  const canonicalArguments = canonicalizeArguments(args);
  const normalizedArguments = deepFreeze(JSON.parse(canonicalArguments));
  return Object.freeze({
    schemaVersion: 1,
    requestId,
    actorId,
    action,
    resourceId,
    arguments: normalizedArguments,
    canonicalArguments,
    argumentHash: sha256(canonicalArguments),
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    idempotencyKey,
    intentSourceId: intent.sourceId,
    intentContentSha256: intent.contentSha256,
    intentCreatedAt: intent.createdAt,
  });
}
