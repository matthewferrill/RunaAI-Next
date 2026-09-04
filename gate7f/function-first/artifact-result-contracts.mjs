import { createHash } from "node:crypto";
import { z } from "zod";

export const RESULT_LIMITS = Object.freeze({
  maximumConversationTurns: 32,
  maximumTaskProposals: 16,
  maximumTaskReceipts: 24,
  maximumTaskIntents: 24,
  maximumResults: 64,
  maximumSourceRecordBytes: 524_288,
  maximumOwnerSourceBytes: 1_048_576,
  maximumResultBytes: 131_072,
  maximumListBytes: 32_768,
  maximumReadResponseBytes: 180_224,
  maximumBoundedJsonBytes: 32_768,
});

export const RESULT_KINDS = Object.freeze([
  "conversation-answer", "research-report", "research-metadata", "review-report", "review-metadata",
  "code-diff", "inspected-text", "test-outcome", "task-receipt",
]);

export const RESULT_STATE_CODES = Object.freeze({
  pending: Object.freeze(["source-pending"]),
  incomplete: Object.freeze(["source-incomplete", "source-output-limited", "source-citations-incomplete",
    "source-reconciliation-required", "source-outcome-unknown"]),
  failed: Object.freeze(["source-failed", "source-tests-failed", "source-proposal-denied", "source-cancelled"]),
  unavailable: Object.freeze(["source-content-unavailable", "source-integrity-unavailable",
    "source-format-unavailable", "source-too-large"]),
});

const KIND_CONTRACTS = Object.freeze({
  "conversation-answer": Object.freeze({ format: "txt", suffix: "txt", mediaType: "text/plain; charset=utf-8",
    sourceRecordKind: "chat-turn", provenanceType: "conversation-turn" }),
  "research-report": Object.freeze({ format: "txt", suffix: "txt", mediaType: "text/plain; charset=utf-8",
    sourceRecordKind: "chat-turn", provenanceType: "conversation-turn" }),
  "research-metadata": Object.freeze({ format: "json", suffix: "json", mediaType: "application/json; charset=utf-8",
    sourceRecordKind: "chat-turn", provenanceType: "conversation-turn" }),
  "review-report": Object.freeze({ format: "txt", suffix: "txt", mediaType: "text/plain; charset=utf-8",
    sourceRecordKind: "chat-turn", provenanceType: "conversation-turn" }),
  "review-metadata": Object.freeze({ format: "json", suffix: "json", mediaType: "application/json; charset=utf-8",
    sourceRecordKind: "chat-turn", provenanceType: "conversation-turn" }),
  "code-diff": Object.freeze({ format: "diff", suffix: "diff", mediaType: "text/x-diff; charset=utf-8",
    sourceRecordKind: "task-proposal", provenanceType: "task-proposal" }),
  "inspected-text": Object.freeze({ format: "txt", suffix: "txt", mediaType: "text/plain; charset=utf-8",
    sourceRecordKind: "task-proposal", provenanceType: "task-proposal" }),
  "test-outcome": Object.freeze({ format: "json", suffix: "json", mediaType: "application/json; charset=utf-8",
    sourceRecordKind: "task-proposal", provenanceType: "task-proposal" }),
  "task-receipt": Object.freeze({ format: "json", suffix: "json", mediaType: "application/json; charset=utf-8",
    sourceRecordKind: "task-receipt", provenanceType: "task-receipt" }),
});

const publicId = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().nonnegative().safe();
const positive = z.number().int().positive().safe();
const timestamp = z.string().refine(value => {
  const time = new Date(value);
  return Number.isFinite(time.valueOf()) && time.toISOString() === value;
});
const ownerLocator = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation"), chatId: publicId }).strict(),
  z.object({ kind: z.literal("task"), taskId: publicId }).strict(),
]);

const isPlainTree = value => {
  try { assertPlainJsonTree(value); return true; }
  catch { return false; }
};
const plainContract = schema => z.custom(isPlainTree, { message: "A strict plain JSON tree is required." }).pipe(schema);

export const resultListInputSchema = plainContract(z.object({ owner: ownerLocator }).strict());
export const resultReadInputSchema = plainContract(z.object({ owner: ownerLocator,
  resultId: z.string().regex(/^r1\.[a-f0-9]{64}$/u), contentSha256: sha256 }).strict());

const listPrivacySchema = z.object({ schemaVersion: z.literal("runaai-result-privacy/v1"),
  dataScope: z.literal("authenticated-participant-project"), resultContentIncluded: z.literal(false),
  resultContentSensitivity: z.literal("not-included"), applicationCredentialFieldsIncluded: z.literal(false),
  internalOperationalFieldsIncluded: z.literal(false) }).strict();
const readPrivacySchema = z.object({ schemaVersion: z.literal("runaai-result-privacy/v1"),
  dataScope: z.literal("authenticated-participant-project"), resultContentIncluded: z.literal(true),
  resultContentSensitivity: z.literal("not-classified"), applicationCredentialFieldsIncluded: z.literal(false),
  internalOperationalFieldsIncluded: z.literal(false) }).strict();

export const LIST_PRIVACY = Object.freeze({ schemaVersion: "runaai-result-privacy/v1",
  dataScope: "authenticated-participant-project", resultContentIncluded: false,
  resultContentSensitivity: "not-included", applicationCredentialFieldsIncluded: false,
  internalOperationalFieldsIncluded: false });
export const READ_PRIVACY = Object.freeze({ schemaVersion: "runaai-result-privacy/v1",
  dataScope: "authenticated-participant-project", resultContentIncluded: true,
  resultContentSensitivity: "not-classified", applicationCredentialFieldsIncluded: false,
  internalOperationalFieldsIncluded: false });

const conversationProvenance = z.object({ schemaVersion: z.literal("runaai-result-provenance/v1"),
  type: z.literal("conversation-turn"), chatId: publicId, turnOrdinal: positive,
  route: z.enum(["general-chat", "guarded-chat", "research-chat", "review-chat", "workspace-chat", "code-chat"]),
  sourceRevision: sha256, evidenceSha256: sha256, contentSha256: sha256.nullable() }).strict();
const proposalProvenance = z.object({ schemaVersion: z.literal("runaai-result-provenance/v1"),
  type: z.literal("task-proposal"), taskId: publicId, proposalId: publicId, proposalDigest: sha256,
  expectedProjectRevision: positive, beforeWorkspaceSha256: sha256, afterWorkspaceSha256: sha256.nullable(),
  sourceRevision: sha256, contentSha256: sha256.nullable() }).strict();
const receiptProvenance = z.object({ schemaVersion: z.literal("runaai-result-provenance/v1"),
  type: z.literal("task-receipt"), taskId: publicId, proposalId: publicId, proposalDigest: sha256,
  receiptId: publicId, receiptDigest: sha256, beforeRevision: positive, afterRevision: positive,
  beforeWorkspaceSha256: sha256, afterWorkspaceSha256: sha256, sourceRevision: sha256,
  contentSha256: sha256.nullable() }).strict();
export const resultProvenanceSchema = plainContract(z.discriminatedUnion("type",
  [conversationProvenance, proposalProvenance, receiptProvenance]));

const readyDescriptor = z.object({ schemaVersion: z.literal("runaai-m1-result-descriptor/v1"),
  resultId: z.string().regex(/^r1\.[a-f0-9]{64}$/u), owner: ownerLocator, ownerRevision: sha256,
  sourceRecordKind: z.enum(["chat-turn", "task-proposal", "task-receipt"]), sourceRecordId: publicId,
  sourceRevision: sha256, kind: z.enum(RESULT_KINDS), format: z.enum(["txt", "json", "diff"]),
  ordinal: z.number().int().min(1).max(64), filename: z.string().min(1).max(120)
    .regex(/^[a-z0-9][a-z0-9._-]*$/u),
  mediaType: z.enum(["text/plain; charset=utf-8", "application/json; charset=utf-8",
    "text/x-diff; charset=utf-8"]), byteLength: count.max(RESULT_LIMITS.maximumResultBytes),
  contentSha256: sha256, readiness: z.literal("ready"), errorCode: z.null(), createdAt: timestamp,
  provenance: resultProvenanceSchema, privacy: listPrivacySchema }).strict();
const notReadyVariants = Object.entries(RESULT_STATE_CODES).flatMap(([readiness, codes]) => codes.map(errorCode =>
  z.object({ schemaVersion: z.literal("runaai-m1-result-descriptor/v1"),
    resultId: z.string().regex(/^r1\.[a-f0-9]{64}$/u), owner: ownerLocator, ownerRevision: sha256,
    sourceRecordKind: z.enum(["chat-turn", "task-proposal", "task-receipt"]), sourceRecordId: publicId,
    sourceRevision: sha256, kind: z.enum(RESULT_KINDS), format: z.enum(["txt", "json", "diff"]),
    ordinal: z.number().int().min(1).max(64), filename: z.string().min(1).max(120)
      .regex(/^[a-z0-9][a-z0-9._-]*$/u),
    mediaType: z.enum(["text/plain; charset=utf-8", "application/json; charset=utf-8",
      "text/x-diff; charset=utf-8"]), byteLength: z.null(), contentSha256: z.null(),
    readiness: z.literal(readiness), errorCode: z.literal(errorCode), createdAt: timestamp,
    provenance: resultProvenanceSchema, privacy: listPrivacySchema }).strict()));
export const resultDescriptorSchema = plainContract(z.union([readyDescriptor, ...notReadyVariants])).superRefine((value, context) => {
  const contract = KIND_CONTRACTS[value.kind];
  const expectedFilename = `${value.kind}-${String(value.ordinal).padStart(6, "0")}.${contract.suffix}`;
  const sourceMatches = value.sourceRecordKind === contract.sourceRecordKind
    && value.provenance.type === contract.provenanceType && value.sourceRevision === value.provenance.sourceRevision;
  let identityMatches = false;
  if (value.provenance.type === "conversation-turn") {
    identityMatches = value.owner.kind === "conversation" && value.owner.chatId === value.provenance.chatId
      && value.sourceRecordId === `turn:${value.provenance.turnOrdinal}`;
  } else if (value.provenance.type === "task-proposal") {
    identityMatches = value.owner.kind === "task" && value.owner.taskId === value.provenance.taskId
      && value.sourceRecordId === value.provenance.proposalId;
  } else {
    identityMatches = value.owner.kind === "task" && value.owner.taskId === value.provenance.taskId
      && value.sourceRecordId === value.provenance.receiptId;
  }
  const contentMatches = value.contentSha256 === value.provenance.contentSha256;
  if (value.format !== contract.format || value.mediaType !== contract.mediaType || value.filename !== expectedFilename
      || !sourceMatches || !identityMatches || !contentMatches) {
    context.addIssue({ code: "custom", message: "Result descriptor relationships are invalid." });
  }
});
export const resultListSchema = plainContract(z.object({ schemaVersion: z.literal("runaai-m1-result-list/v1"),
  owner: ownerLocator, ownerRevision: sha256,
  results: z.array(resultDescriptorSchema).max(RESULT_LIMITS.maximumResults), privacy: listPrivacySchema }).strict())
  .superRefine((value, context) => {
    const ids = new Set(), filenames = new Set();
    for (const [index, descriptor] of value.results.entries()) {
      const sameOwner = JSON.stringify(descriptor.owner) === JSON.stringify(value.owner);
      if (!sameOwner || descriptor.ownerRevision !== value.ownerRevision || descriptor.ordinal !== index + 1
          || ids.has(descriptor.resultId) || filenames.has(descriptor.filename)) {
        context.addIssue({ code: "custom", path: ["results", index], message: "Result list binding/order is invalid." });
      }
      ids.add(descriptor.resultId); filenames.add(descriptor.filename);
    }
  });
const readableDescriptorSchema = resultDescriptorSchema.refine(value => value.readiness === "ready", {
  message: "Only a ready relationship-checked descriptor is readable.",
});
export const resultReadSchema = plainContract(z.object({ schemaVersion: z.literal("runaai-m1-result-read/v1"),
  descriptor: readableDescriptorSchema, encoding: z.literal("base64"), contentBase64: z.string(),
  privacy: readPrivacySchema }).strict()).superRefine((value, context) => {
    try { decodeCanonicalBase64(value.contentBase64, value.descriptor); }
    catch { context.addIssue({ code: "custom", path: ["contentBase64"], message: "Result bytes do not match the descriptor." }); }
  });

export function resultFailure(code) { return Object.assign(new Error(code), { code }); }

function requirePlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) throw resultFailure("result-source-invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string")) throw resultFailure("result-source-invalid");
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)
        || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
      throw resultFailure("result-source-invalid");
    }
  }
  return descriptors;
}

export function assertPlainJsonTree(value, depth = 0, seen = new Set()) {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return value;
  if (depth > 16 || typeof value !== "object" || seen.has(value)) throw resultFailure("result-source-invalid");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw resultFailure("result-source-invalid");
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const expected = Array.from({ length: value.length }, (_, index) => String(index));
      const names = Reflect.ownKeys(descriptors);
      if (names.some(name => typeof name !== "string") || names.length !== expected.length + 1
          || names.at(-1) !== "length" || expected.some((name, index) => names[index] !== name)) {
        throw resultFailure("result-source-invalid");
      }
      for (const name of expected) {
        const descriptor = descriptors[name];
        if (!descriptor.enumerable || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
          throw resultFailure("result-source-invalid");
        }
        assertPlainJsonTree(descriptor.value, depth + 1, seen);
      }
      return value;
    }
    const descriptors = requirePlainObject(value);
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable) throw resultFailure("result-source-invalid");
      requireScalarString(name);
      assertPlainJsonTree(descriptor.value, depth + 1, seen);
    }
    return value;
  } finally { seen.delete(value); }
}

export function requireScalarString(value, { safeText = false } = {}) {
  if (typeof value !== "string") throw resultFailure("result-source-invalid");
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw resultFailure("result-source-invalid");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw resultFailure("result-source-invalid");
  }
  if (safeText) for (const character of value) {
    const code = character.codePointAt(0);
    if ((code <= 0x1f && ![0x09, 0x0a, 0x0d].includes(code)) || (code >= 0x7f && code <= 0x9f)
        || code === 0x061c || (code >= 0x200e && code <= 0x200f)
        || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      throw resultFailure("result-source-invalid");
    }
  }
  return value;
}

export function requireSafeProjectPath(value) {
  requireScalarString(value);
  if (value.length < 1 || value.length > 240 || !/^[\x20-\x7e]+$/u.test(value) || value.startsWith("/")
      || value.includes("\\") || value.includes(":") || value.includes("%")) {
    throw resultFailure("result-source-invalid");
  }
  const segments = value.split("/");
  if (!segments.length || segments.some(segment => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)
      || segment === "." || segment === "..")) throw resultFailure("result-source-invalid");
  return value;
}

function primitiveJson(value, safeText) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw resultFailure("result-source-invalid");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(requireScalarString(value, { safeText }));
  return null;
}

function writeCanonical(value, depth, maximumDepth, safeText, seen) {
  const primitive = primitiveJson(value, safeText);
  if (primitive !== null) return primitive;
  if (depth >= maximumDepth || value === null || typeof value !== "object" || seen.has(value)) {
    throw resultFailure("result-source-invalid");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw resultFailure("result-source-invalid");
      const names = Reflect.ownKeys(value);
      const expected = Array.from({ length: value.length }, (_, index) => String(index));
      if (value.length > 64 || names.some(name => typeof name !== "string")
          || names.length !== expected.length + 1 || names.at(-1) !== "length"
          || expected.some((name, index) => names[index] !== name)) throw resultFailure("result-source-invalid");
      for (const name of expected) {
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor?.enumerable || !("value" in descriptor)) throw resultFailure("result-source-invalid");
      }
      return `[${value.map(item => writeCanonical(item, depth + 1, maximumDepth, safeText, seen)).join(",")}]`;
    }
    const descriptors = requirePlainObject(value);
    const keys = Object.keys(descriptors).sort();
    if (keys.length > 64) throw resultFailure("result-source-invalid");
    const entries = keys.map(key => {
      requireScalarString(key, { safeText });
      return `${JSON.stringify(key)}:${writeCanonical(descriptors[key].value, depth + 1, maximumDepth, safeText, seen)}`;
    });
    return `{${entries.join(",")}}`;
  } finally { seen.delete(value); }
}

export function canonicalBoundedJson(value) {
  const text = writeCanonical(value, 0, 8, true, new Set());
  if (Buffer.byteLength(text, "utf8") > RESULT_LIMITS.maximumBoundedJsonBytes) {
    throw resultFailure("result-source-invalid");
  }
  return text;
}

export function canonicalSortedJson(value, { maximumBytes = RESULT_LIMITS.maximumOwnerSourceBytes,
  maximumDepth = 16 } = {}) {
  const text = writeCanonical(value, 0, maximumDepth, false, new Set());
  if (Buffer.byteLength(text, "utf8") > maximumBytes) throw resultFailure("result-source-too-large");
  return text;
}

export function boundedJsonDigest(value) {
  return createHash("sha256").update(canonicalBoundedJson(value), "utf8").digest("hex");
}

export function canonicalTextBytes(value) {
  const bytes = Buffer.from(requireScalarString(value, { safeText: true }), "utf8");
  if (bytes.length > RESULT_LIMITS.maximumResultBytes) throw resultFailure("result-too-large");
  return bytes;
}

function records(value) { return value.match(/[^\n]*\n|[^\n]+$/gu) ?? []; }

export function canonicalFullReplacementDiff({ path, before, after }) {
  requireSafeProjectPath(path);
  requireScalarString(before, { safeText: true });
  requireScalarString(after, { safeText: true });
  if (before.includes("\r") || after.includes("\r") || before === after) {
    throw resultFailure("result-source-invalid");
  }
  const oldRecords = records(before), newRecords = records(after);
  let text = `--- a/${path}\n+++ b/${path}\n@@ -${oldRecords.length ? 1 : 0},${oldRecords.length} +${newRecords.length ? 1 : 0},${newRecords.length} @@\n`;
  for (const [prefix, source] of [["-", oldRecords], ["+", newRecords]]) for (const record of source) {
    text += `${prefix}${record}`;
    if (!record.endsWith("\n")) text += "\n\\ No newline at end of file\n";
  }
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > RESULT_LIMITS.maximumResultBytes) throw resultFailure("result-too-large");
  return bytes;
}

export function canonicalBase64(bytes) {
  if (!Buffer.isBuffer(bytes)) throw resultFailure("result-source-invalid");
  return bytes.toString("base64");
}

export function decodeCanonicalBase64(value, { byteLength, contentSha256 }) {
  if (typeof value !== "string" || !Number.isSafeInteger(byteLength) || byteLength < 0
      || !sha256.safeParse(contentSha256).success || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw resultFailure("result-source-invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== byteLength || bytes.toString("base64") !== value
      || createHash("sha256").update(bytes).digest("hex") !== contentSha256) {
    throw resultFailure("result-source-invalid");
  }
  return bytes;
}

export function assertWireBudget(value, maximumBytes, code) {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > maximumBytes) throw resultFailure(code);
  return bytes;
}
