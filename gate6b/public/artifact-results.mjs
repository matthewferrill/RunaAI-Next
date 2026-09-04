const DESCRIPTOR_KEYS = Object.freeze([
  "schemaVersion", "resultId", "owner", "ownerRevision", "sourceRecordKind", "sourceRecordId",
  "sourceRevision", "kind", "format", "ordinal", "filename", "mediaType", "byteLength",
  "contentSha256", "readiness", "errorCode", "createdAt", "provenance", "privacy",
]);
const LIST_KEYS = Object.freeze(["schemaVersion", "owner", "ownerRevision", "results", "privacy"]);
const READ_KEYS = Object.freeze(["schemaVersion", "descriptor", "encoding", "contentBase64", "privacy"]);
const PRIVACY_KEYS = Object.freeze([
  "schemaVersion", "dataScope", "resultContentIncluded", "resultContentSensitivity",
  "applicationCredentialFieldsIncluded", "internalOperationalFieldsIncluded",
]);
const KINDS = new Set([
  "conversation-answer", "research-report", "research-metadata", "review-report", "review-metadata",
  "code-diff", "inspected-text", "test-outcome", "task-receipt",
]);
const READINESS = new Set(["ready", "pending", "incomplete", "failed", "unavailable"]);
const FORMATS = Object.freeze({
  txt: Object.freeze({ suffix: ".txt", mediaType: "text/plain; charset=utf-8" }),
  json: Object.freeze({ suffix: ".json", mediaType: "application/json; charset=utf-8" }),
  diff: Object.freeze({ suffix: ".diff", mediaType: "text/x-diff; charset=utf-8" }),
});
const KIND_LABELS = Object.freeze({
  "conversation-answer": "Conversation answer", "research-report": "Research report",
  "research-metadata": "Research citations and metadata", "review-report": "Review report",
  "review-metadata": "Review contexts and metadata", "code-diff": "Code diff",
  "inspected-text": "Inspected text", "test-outcome": "Test outcome", "task-receipt": "Task receipt",
});
const FILE_STEMS = Object.freeze({
  "conversation-answer": "conversation-answer", "research-report": "research-report",
  "research-metadata": "research-metadata", "review-report": "review-report",
  "review-metadata": "review-metadata", "code-diff": "code-diff", "inspected-text": "inspected-text",
  "test-outcome": "test-outcome", "task-receipt": "task-receipt",
});
const KIND_CONTRACTS = Object.freeze({
  "conversation-answer": Object.freeze({ source: "chat-turn", provenance: "conversation-turn", format: "txt", rank: 0 }),
  "research-report": Object.freeze({ source: "chat-turn", provenance: "conversation-turn", format: "txt", rank: 1 }),
  "research-metadata": Object.freeze({ source: "chat-turn", provenance: "conversation-turn", format: "json", rank: 2 }),
  "review-report": Object.freeze({ source: "chat-turn", provenance: "conversation-turn", format: "txt", rank: 3 }),
  "review-metadata": Object.freeze({ source: "chat-turn", provenance: "conversation-turn", format: "json", rank: 4 }),
  "code-diff": Object.freeze({ source: "task-proposal", provenance: "task-proposal", format: "diff", rank: 5 }),
  "inspected-text": Object.freeze({ source: "task-proposal", provenance: "task-proposal", format: "txt", rank: 6 }),
  "test-outcome": Object.freeze({ source: "task-proposal", provenance: "task-proposal", format: "json", rank: 7 }),
  "task-receipt": Object.freeze({ source: "task-receipt", provenance: "task-receipt", format: "json", rank: 8 }),
});
const CONVERSATION_FAMILIES = Object.freeze({
  "conversation-answer": "answer",
  "research-report": "research", "research-metadata": "research",
  "review-report": "review", "review-metadata": "review",
});
const ERROR_COPY = Object.freeze({
  "source-pending": "The authoritative source has not produced this result yet.",
  "source-incomplete": "The source stopped before this result was complete.",
  "source-output-limited": "The source output limit prevented a complete result.",
  "source-citations-incomplete": "Required citations are incomplete, so this is not a ready report.",
  "source-reconciliation-required": "The current result is not known. Reconcile the task before relying on an older result or starting successor work.",
  "source-outcome-unknown": "The current result is unknown. It is not shown as a success and is not retried here.",
  "source-failed": "The source recorded a failed result.",
  "source-tests-failed": "The selected tests failed. The failed outcome remains recorded but is not downloadable as a passing result.",
  "source-proposal-denied": "The proposed action was denied and produced no ready result.",
  "source-cancelled": "The source was cancelled before a ready result was recorded.",
  "source-content-unavailable": "The retained source does not contain usable result content.",
  "source-integrity-unavailable": "The source integrity could not be verified, so no content is shown.",
  "source-format-unavailable": "The source cannot be represented in an allowed text format.",
  "source-too-large": "The result is larger than the supported preview and download limit.",
});
const ERRORS_BY_READINESS = Object.freeze({
  pending: new Set(["source-pending"]),
  incomplete: new Set(["source-incomplete", "source-output-limited", "source-citations-incomplete",
    "source-reconciliation-required", "source-outcome-unknown"]),
  failed: new Set(["source-failed", "source-tests-failed", "source-proposal-denied", "source-cancelled"]),
  unavailable: new Set(["source-content-unavailable", "source-integrity-unavailable",
    "source-format-unavailable", "source-too-large"]),
});

const fail = code => Object.assign(new Error(code), { code });
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const publicId = value => typeof value === "string" && value.length <= 160
  && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value);

function strictObject(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key, index) => key !== keys[index])) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return keys.every(key => descriptors[key]?.get === undefined && descriptors[key]?.set === undefined);
}

function ownerIsValid(owner) {
  if (!owner || Object.getPrototypeOf(owner) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(owner), descriptors = Object.getOwnPropertyDescriptors(owner);
  if (keys.some(key => typeof key !== "string" || descriptors[key]?.get || descriptors[key]?.set)) return false;
  if (descriptors.kind?.value === "conversation") return keys.length === 2 && keys[0] === "kind" && keys[1] === "chatId"
    && publicId(descriptors.chatId?.value);
  return descriptors.kind?.value === "task" && keys.length === 2 && keys[0] === "kind" && keys[1] === "taskId"
    && publicId(descriptors.taskId?.value);
}

function sameOwner(left, right) {
  return ownerIsValid(left) && ownerIsValid(right) && left.kind === right.kind
    && (left.kind === "conversation" ? left.chatId === right.chatId : left.taskId === right.taskId);
}

function privacyIsValid(value, includesContent) {
  return strictObject(value, PRIVACY_KEYS)
    && value.schemaVersion === "runaai-result-privacy/v1"
    && value.dataScope === "authenticated-participant-project"
    && value.resultContentIncluded === includesContent
    && value.resultContentSensitivity === (includesContent ? "not-classified" : "not-included")
    && value.applicationCredentialFieldsIncluded === false
    && value.internalOperationalFieldsIncluded === false;
}

function timestamp(value) {
  if (typeof value !== "string") return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function provenanceIsValid(value, descriptor) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const type = Object.getOwnPropertyDescriptor(value, "type")?.value;
  const contentMatches = Object.getOwnPropertyDescriptor(value, "contentSha256")?.value === descriptor.contentSha256;
  if (type === "conversation-turn") {
    return strictObject(value, ["schemaVersion", "type", "chatId", "turnOrdinal", "route", "sourceRevision",
      "evidenceSha256", "contentSha256"])
      && value.schemaVersion === "runaai-result-provenance/v1" && publicId(value.chatId)
      && descriptor.owner.kind === "conversation" && value.chatId === descriptor.owner.chatId
      && descriptor.sourceRecordKind === "chat-turn" && descriptor.sourceRecordId === `turn:${value.turnOrdinal}`
      && Number.isSafeInteger(value.turnOrdinal) && value.turnOrdinal > 0
      && ["general-chat", "guarded-chat", "research-chat", "review-chat", "workspace-chat", "code-chat"].includes(value.route)
      && value.sourceRevision === descriptor.sourceRevision && sha(value.evidenceSha256) && contentMatches;
  }
  if (type === "task-proposal") {
    return strictObject(value, ["schemaVersion", "type", "taskId", "proposalId", "proposalDigest",
      "expectedProjectRevision", "beforeWorkspaceSha256", "afterWorkspaceSha256", "sourceRevision", "contentSha256"])
      && value.schemaVersion === "runaai-result-provenance/v1" && publicId(value.taskId) && publicId(value.proposalId)
      && descriptor.owner.kind === "task" && value.taskId === descriptor.owner.taskId
      && descriptor.sourceRecordKind === "task-proposal" && value.proposalId === descriptor.sourceRecordId
      && sha(value.proposalDigest) && Number.isSafeInteger(value.expectedProjectRevision) && value.expectedProjectRevision > 0
      && sha(value.beforeWorkspaceSha256) && (value.afterWorkspaceSha256 === null || sha(value.afterWorkspaceSha256))
      && value.sourceRevision === descriptor.sourceRevision && contentMatches;
  }
  if (type === "task-receipt") {
    return strictObject(value, ["schemaVersion", "type", "taskId", "proposalId", "proposalDigest", "receiptId",
      "receiptDigest", "beforeRevision", "afterRevision", "beforeWorkspaceSha256", "afterWorkspaceSha256",
      "sourceRevision", "contentSha256"])
      && value.schemaVersion === "runaai-result-provenance/v1" && publicId(value.taskId) && publicId(value.proposalId)
      && descriptor.owner.kind === "task" && value.taskId === descriptor.owner.taskId
      && descriptor.sourceRecordKind === "task-receipt" && value.receiptId === descriptor.sourceRecordId
      && sha(value.proposalDigest) && publicId(value.receiptId) && sha(value.receiptDigest)
      && Number.isSafeInteger(value.beforeRevision) && value.beforeRevision > 0
      && Number.isSafeInteger(value.afterRevision) && value.afterRevision > 0
      && sha(value.beforeWorkspaceSha256) && sha(value.afterWorkspaceSha256)
      && value.sourceRevision === descriptor.sourceRevision && contentMatches;
  }
  return false;
}

function descriptorIsValid(value, expectedOwner = null, expectedOwnerRevision = null) {
  if (!strictObject(value, DESCRIPTOR_KEYS) || value.schemaVersion !== "runaai-m1-result-descriptor/v1"
      || !/^r1\.[a-f0-9]{64}$/u.test(value.resultId ?? "") || !ownerIsValid(value.owner)
      || (expectedOwner && !sameOwner(value.owner, expectedOwner))
      || !sha(value.ownerRevision) || (expectedOwnerRevision && value.ownerRevision !== expectedOwnerRevision)
      || !["chat-turn", "task-proposal", "task-receipt"].includes(value.sourceRecordKind)
      || !publicId(value.sourceRecordId) || !sha(value.sourceRevision) || !KINDS.has(value.kind)
      || !Object.hasOwn(FORMATS, value.format) || !Number.isSafeInteger(value.ordinal)
      || value.ordinal < 1 || value.ordinal > 64 || !READINESS.has(value.readiness)
      || !timestamp(value.createdAt) || !privacyIsValid(value.privacy, false)
      || !provenanceIsValid(value.provenance, value)) return false;
  const kind = KIND_CONTRACTS[value.kind], format = FORMATS[value.format];
  if (!kind || value.sourceRecordKind !== kind.source || value.provenance.type !== kind.provenance
      || value.format !== kind.format) return false;
  if (value.kind === "conversation-answer"
      && !["general-chat", "guarded-chat", "workspace-chat", "code-chat"].includes(value.provenance.route)) return false;
  if (["research-report", "research-metadata"].includes(value.kind) && value.provenance.route !== "research-chat") return false;
  if (["review-report", "review-metadata"].includes(value.kind) && value.provenance.route !== "review-chat") return false;
  const exactFilename = `${FILE_STEMS[value.kind]}-${String(value.ordinal).padStart(6, "0")}${format.suffix}`;
  if (value.mediaType !== format.mediaType || typeof value.filename !== "string"
      || value.filename.length < 1 || value.filename.length > 120
      || !/^[a-z0-9][a-z0-9._-]*$/u.test(value.filename) || value.filename !== exactFilename) return false;
  if (value.readiness === "ready") return Number.isSafeInteger(value.byteLength)
    && value.byteLength >= 0 && value.byteLength <= 131_072 && sha(value.contentSha256)
    && value.errorCode === null;
  return value.byteLength === null && value.contentSha256 === null
    && ERRORS_BY_READINESS[value.readiness]?.has(value.errorCode) === true;
}

function sameJson(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Reflect.ownKeys(left), rightKeys = Reflect.ownKeys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
    && typeof key === "string" && sameJson(left[key], right[key]));
}

export function admitResultList(value, owner) {
  if (!strictObject(value, LIST_KEYS) || value.schemaVersion !== "runaai-m1-result-list/v1"
      || !sameOwner(value.owner, owner) || !sha(value.ownerRevision) || !Array.isArray(value.results)
      || Object.getPrototypeOf(value.results) !== Array.prototype || value.results.length > 64
      || !privacyIsValid(value.privacy, false)
      || !value.results.every(result => descriptorIsValid(result, owner, value.ownerRevision))) {
    throw fail("result-client-list-invalid");
  }
  const ids = new Set(), logical = new Set(), conversationSources = new Map(), taskProposals = new Set();
  for (const [index, descriptor] of value.results.entries()) {
    const logicalId = `${descriptor.sourceRecordKind}\0${descriptor.sourceRecordId}\0${descriptor.kind}`;
    if (descriptor.ordinal !== index + 1 || ids.has(descriptor.resultId) || logical.has(logicalId)
        || (index > 0 && compareDescriptorOrder(value.results[index - 1], descriptor, owner) >= 0)) {
      throw fail("result-client-list-invalid");
    }
    if (owner.kind === "conversation") {
      const family = CONVERSATION_FAMILIES[descriptor.kind], prior = conversationSources.get(descriptor.sourceRecordId);
      if (!family || (prior && (prior.count >= 2 || prior.family !== family
          || !sameOwner(prior.descriptor.owner, descriptor.owner)
          || prior.descriptor.ownerRevision !== descriptor.ownerRevision
          || prior.descriptor.sourceRevision !== descriptor.sourceRevision
          || prior.descriptor.createdAt !== descriptor.createdAt
          || prior.descriptor.provenance.route !== descriptor.provenance.route
          || prior.descriptor.provenance.evidenceSha256 !== descriptor.provenance.evidenceSha256))) {
        throw fail("result-client-list-invalid");
      }
      conversationSources.set(descriptor.sourceRecordId, prior
        ? { ...prior, count: prior.count + 1 } : { family, count: 1, descriptor });
    } else if (descriptor.sourceRecordKind === "task-proposal") {
      if (taskProposals.has(descriptor.sourceRecordId)) throw fail("result-client-list-invalid");
      taskProposals.add(descriptor.sourceRecordId);
    }
    ids.add(descriptor.resultId); logical.add(logicalId);
  }
  return value;
}

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function compareDescriptorOrder(left, right, owner) {
  if (owner.kind === "conversation") {
    return left.provenance.turnOrdinal - right.provenance.turnOrdinal
      || KIND_CONTRACTS[left.kind].rank - KIND_CONTRACTS[right.kind].rank;
  }
  return compareText(left.createdAt, right.createdAt)
    || (left.sourceRecordKind === "task-proposal" ? 0 : 1) - (right.sourceRecordKind === "task-proposal" ? 0 : 1)
    || compareText(left.sourceRecordId, right.sourceRecordId)
    || KIND_CONTRACTS[left.kind].rank - KIND_CONTRACTS[right.kind].rank;
}

function sameConversationSource(left, right) {
  return left.sourceRecordKind === "chat-turn" && right.sourceRecordKind === "chat-turn"
    && left.sourceRecordId === right.sourceRecordId && left.sourceRevision === right.sourceRevision
    && left.createdAt === right.createdAt && left.ownerRevision === right.ownerRevision
    && left.provenance.chatId === right.provenance.chatId
    && left.provenance.turnOrdinal === right.provenance.turnOrdinal
    && left.provenance.route === right.provenance.route
    && left.provenance.evidenceSha256 === right.provenance.evidenceSha256;
}

function companionFor(descriptor, results) {
  const kind = descriptor.kind === "research-report" ? "research-metadata"
    : descriptor.kind === "review-report" ? "review-metadata" : null;
  if (!kind) return null;
  const matches = results.filter(value => value.kind === kind && sameConversationSource(descriptor, value));
  return matches.length === 1 && matches[0].readiness === "ready" ? matches[0] : null;
}

export function currentResultContext({ experience, state, taskView }) {
  const projectId = state?.projectId;
  const savedProject = publicId(projectId) && !["runa:personal", "runa:ephemeral"].includes(projectId)
    && ["chat", "code"].includes(experience);
  const taskId = taskView?.dataset?.m1TaskId;
  const taskSelected = savedProject && experience === "code" && publicId(taskId)
    && taskView.dataset.m1ProjectId === projectId && taskView.dataset.m1Experience === experience;
  const owner = taskSelected ? { kind: "task", taskId }
    : savedProject && publicId(state?.activeChatId) ? { kind: "conversation", chatId: state.activeChatId } : null;
  return { experience, projectId, owner };
}

function runtimeDefaults() {
  return { atob: globalThis.atob, btoa: globalThis.btoa, crypto: globalThis.crypto,
    Blob: globalThis.Blob, URL: globalThis.URL, TextDecoder: globalThis.TextDecoder };
}

function decodeBase64(value, runtime) {
  if (typeof value !== "string" || value.length > 180_224 || value.length % 4 !== 0
      || (value !== "" && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))) {
    throw fail("result-client-base64-invalid");
  }
  let binary;
  try { binary = runtime.atob(value); } catch { throw fail("result-client-base64-invalid"); }
  if (runtime.btoa(binary) !== value) throw fail("result-client-base64-invalid");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function digest(bytes, runtime) {
  const value = await runtime.crypto?.subtle?.digest("SHA-256", bytes);
  if (!(value instanceof ArrayBuffer)) throw fail("result-client-digest-unavailable");
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyResultRead(value, selected, runtimeOverrides = {}) {
  const runtime = { ...runtimeDefaults(), ...runtimeOverrides };
  if (!descriptorIsValid(selected) || selected.readiness !== "ready"
      || !strictObject(value, READ_KEYS) || value.schemaVersion !== "runaai-m1-result-read/v1"
      || value.encoding !== "base64" || !descriptorIsValid(value.descriptor)
      || !sameJson(value.descriptor, selected) || !privacyIsValid(value.privacy, true)) {
    throw fail("result-client-read-invalid");
  }
  const bytes = decodeBase64(value.contentBase64, runtime);
  if (bytes.byteLength !== selected.byteLength) throw fail("result-client-length-mismatch");
  if (await digest(bytes, runtime) !== selected.contentSha256) throw fail("result-client-digest-mismatch");
  let text;
  try { text = new runtime.TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw fail("result-client-text-invalid"); }
  return Object.freeze({ bytes, text });
}

export function downloadVerifiedResult(root, selected, verified, runtimeOverrides = {}) {
  const runtime = { ...runtimeDefaults(), ...runtimeOverrides };
  if (!descriptorIsValid(selected) || selected.readiness !== "ready"
      || !(verified?.bytes instanceof Uint8Array) || typeof verified.text !== "string") {
    throw fail("result-client-download-invalid");
  }
  const blob = new runtime.Blob([verified.bytes], { type: selected.mediaType });
  if (blob.size !== selected.byteLength || blob.type !== selected.mediaType) throw fail("result-client-download-invalid");
  const url = runtime.URL.createObjectURL(blob), anchor = root.createElement("a");
  try {
    anchor.href = url; anchor.download = selected.filename; anchor.hidden = true;
    root.body?.append(anchor); anchor.click();
  } finally {
    anchor.remove?.(); runtime.URL.revokeObjectURL(url);
  }
}

function element(root, tag, className = null, text = null) {
  const node = root.createElement(tag); if (className) node.className = className;
  if (text !== null) node.textContent = text; return node;
}

function provenanceSummary(value) {
  if (value?.type === "conversation-turn") return `Conversation turn ${value.turnOrdinal} · ${value.route} · source ${value.sourceRevision}`;
  if (value?.type === "task-proposal") return `Task proposal ${value.proposalId} · source ${value.sourceRevision}`;
  if (value?.type === "task-receipt") return `Application receipt ${value.receiptId} · source ${value.sourceRevision}`;
  return "Application provenance unavailable";
}

function ownerSummary(owner) {
  return owner.kind === "conversation" ? `saved conversation ${owner.chatId}` : `Code task ${owner.taskId}`;
}

function readinessCopy(descriptor) {
  if (descriptor.readiness === "ready") return `Ready · ${descriptor.byteLength} bytes`;
  return `${descriptor.readiness[0].toUpperCase()}${descriptor.readiness.slice(1)} · ${ERROR_COPY[descriptor.errorCode]}`;
}

async function readAndVerify({ request, context, descriptor, runtime }) {
  const response = await request("/api/m1/workspace", { projectId: context.projectId,
    experience: context.experience, operation: "result.read", input: { owner: descriptor.owner,
      resultId: descriptor.resultId, contentSha256: descriptor.contentSha256 } });
  return verifyResultRead(response, descriptor, runtime);
}

function strictArray(value, minimum, maximum) {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length >= minimum && value.length <= maximum;
}

function safeCount(value, minimum = 0) { return Number.isSafeInteger(value) && value >= minimum; }

function safeText(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function admitResearchMetadata(value) {
  const progressKeys = ["status", "selectedSources", "resolvedSources", "passesPlanned", "passesRun",
    "passagesRead", "degraded", "truncated", "omissionCount", "unansweredCount"];
  if (!strictObject(value, ["schemaVersion", "reportStatus", "limitation", "progress", "citations", "checker", "missingEvidence"])
      || value.schemaVersion !== "runaai-public-research-metadata/v1" || value.reportStatus !== "attributable"
      || !safeText(value.limitation) || !strictObject(value.progress, progressKeys)
      || value.progress.status !== "report-ready" || !safeCount(value.progress.selectedSources, 1)
      || value.progress.selectedSources > 6 || value.progress.resolvedSources !== value.progress.selectedSources
      || ![value.progress.passesPlanned, value.progress.passesRun, value.progress.passagesRead,
        value.progress.omissionCount, value.progress.unansweredCount].every(item => safeCount(item))
      || value.progress.passesRun !== value.progress.passesPlanned || value.progress.degraded !== false
      || value.progress.truncated !== false || value.progress.omissionCount !== 0 || value.progress.unansweredCount !== 0
      || !strictArray(value.citations, 1, 24) || !strictArray(value.missingEvidence, 0, 0)
      || !strictObject(value.checker, ["attempted", "corrected", "attemptCount", "finalAnswerOrigin"])
      || value.checker.attempted !== true || typeof value.checker.corrected !== "boolean"
      || ![1, 2].includes(value.checker.attemptCount)
      || !["primary", "checker-correction"].includes(value.checker.finalAnswerOrigin)) return false;
  const ordinals = new Set();
  return value.citations.every(citation => strictObject(citation, ["ordinal", "sourceId", "sectionId", "contentSha256"])
    && safeCount(citation.ordinal, 1) && !ordinals.has(citation.ordinal) && ordinals.add(citation.ordinal)
    && publicId(citation.sourceId) && publicId(citation.sectionId) && sha(citation.contentSha256));
}

function admitReviewMetadata(value) {
  if (!strictObject(value, ["schemaVersion", "status", "contexts", "checker", "findings"])
      || value.schemaVersion !== "runaai-public-review-metadata/v1"
      || !["accepted-primary", "accepted-revision"].includes(value.status)
      || !strictArray(value.contexts, 1, 6) || !strictArray(value.findings, 1, 1)
      || !strictObject(value.checker, ["initialVerdict", "finalVerdict", "revisionPasses", "attemptCount", "finalAnswerOrigin"])) return false;
  const primary = value.status === "accepted-primary";
  if (value.checker.initialVerdict !== (primary ? "accept" : "revise") || value.checker.finalVerdict !== "accept"
      || value.checker.revisionPasses !== (primary ? 0 : 1) || value.checker.attemptCount !== (primary ? 1 : 2)
      || value.checker.finalAnswerOrigin !== (primary ? "primary" : "checker-correction")) return false;
  if (!value.contexts.every(context => strictObject(context,
    ["contextType", "targetId", "sourceId", "sectionId", "contentSha256"])
      && ["source", "artifact", "diff"].includes(context.contextType) && publicId(context.targetId)
      && publicId(context.sourceId) && publicId(context.sectionId) && sha(context.contentSha256))) return false;
  const finding = value.findings[0];
  if (!strictObject(finding, ["findingId", "severity", "citationOrdinals"]) || !publicId(finding.findingId)
      || finding.severity !== "unclassified" || !strictArray(finding.citationOrdinals, 1, 24)) return false;
  const ordinals = new Set();
  return finding.citationOrdinals.every(ordinal => safeCount(ordinal, 1) && !ordinals.has(ordinal) && ordinals.add(ordinal));
}

function admitCompanionMetadata(text, kind) {
  let value;
  try { value = JSON.parse(text); } catch { throw fail("result-client-companion-invalid"); }
  const valid = kind === "research-metadata" ? admitResearchMetadata(value)
    : kind === "review-metadata" ? admitReviewMetadata(value) : false;
  if (!valid || JSON.stringify(value) !== text) throw fail("result-client-companion-invalid");
  return value;
}

export async function renderArtifactResults({ root = document, container, request, context,
  isCurrent = () => true, runtime = {} }) {
  container.replaceChildren();
  const introduction = element(root, "p", "product-muted", context?.owner
    ? `Current results for ${ownerSummary(context.owner)}. Content is read only after you select a ready result.`
    : "Select a saved project conversation or an opened Code task to view its current results.");
  container.append(introduction);
  if (!context?.owner || !publicId(context.projectId) || ["runa:personal", "runa:ephemeral"].includes(context.projectId)) {
    const empty = element(root, "section", "product-card");
    empty.append(element(root, "h2", null, "No selected result owner"), element(root, "p", "product-muted",
      "Files and artifacts shows only the current saved conversation or opened Code task in an authorized project. Local folders and uploads are not enabled here."));
    container.append(empty); return Object.freeze({ resultCount: 0 });
  }
  const status = element(root, "p", "artifact-status", "Loading result metadata…"); status.setAttribute("role", "status");
  const workspace = element(root, "div", "artifact-workspace"), inventory = element(root, "div", "artifact-inventory"),
    preview = element(root, "section", "artifact-preview product-card");
  preview.append(element(root, "h2", null, "Preview"), element(root, "p", "product-muted", "Select a ready result to verify and preview it."));
  workspace.append(inventory, preview); container.append(status, workspace);
  let listed;
  try {
    listed = admitResultList(await request("/api/m1/workspace", { projectId: context.projectId,
      experience: context.experience, operation: "result.list", input: { owner: context.owner } }), context.owner);
  } catch (error) {
    if (!isCurrent()) return Object.freeze({ resultCount: 0 });
    status.textContent = error?.code === "result-owner-not-found"
      ? "No current results were found for this saved conversation or task."
      : "Results could not be safely loaded. No content or success is inferred.";
    return Object.freeze({ resultCount: 0 });
  }
  if (!isCurrent()) return Object.freeze({ resultCount: 0 });
  status.textContent = listed.results.length ? `${listed.results.length} current result${listed.results.length === 1 ? "" : "s"}.`
    : "This saved conversation or task has no result descriptors yet.";
  let selection = 0;
  const select = async descriptor => {
    const selectedAt = ++selection;
    preview.replaceChildren(element(root, "h2", null, KIND_LABELS[descriptor.kind]),
      element(root, "p", "product-muted", "Reading and independently verifying bytes…"));
    try {
      const companion = companionFor(descriptor, listed.results);
      const companionRequired = ["research-report", "review-report"].includes(descriptor.kind);
      if (companionRequired && !companion) throw fail("result-client-companion-unavailable");
      let companionVerified = null;
      if (companion) {
        companionVerified = await readAndVerify({ request, context, descriptor: companion, runtime });
        admitCompanionMetadata(companionVerified.text, companion.kind);
      }
      const verified = await readAndVerify({ request, context, descriptor, runtime });
      if (!isCurrent() || selectedAt !== selection) return;
      const heading = element(root, "h2", null, KIND_LABELS[descriptor.kind]);
      const meta = element(root, "p", "product-muted", `${descriptor.filename} · ${descriptor.format.toUpperCase()} · ${descriptor.byteLength} bytes · SHA-256 ${descriptor.contentSha256}`);
      const content = element(root, "pre", "artifact-preview-content");
      content.textContent = verified.text;
      const download = element(root, "button", "primary-button", "Download verified result"); download.type = "button";
      download.disabled = true;
      download.addEventListener("click", () => downloadVerifiedResult(root, descriptor, verified, runtime));
      preview.replaceChildren(heading, meta, content, download);
      download.disabled = false;
      if (companion && companionVerified) {
        const companionBox = element(root, "section", "artifact-companion");
        companionBox.append(element(root, "h3", null, KIND_LABELS[companion.kind])); preview.append(companionBox);
        const companionContent = element(root, "pre", "artifact-preview-content");
        companionContent.textContent = companionVerified.text; companionBox.append(companionContent);
      }
    } catch {
      if (!isCurrent() || selectedAt !== selection) return;
      preview.replaceChildren(element(root, "h2", null, "Preview unavailable"),
        element(root, "p", "product-muted", "The returned bytes, length, digest, descriptor, or UTF-8 text could not be independently verified. Preview and download remain disabled."));
    }
  };
  for (const descriptor of listed.results) {
    const row = element(root, "section", "artifact-row product-card");
    const copy = element(root, "div", "artifact-row-copy");
    copy.append(element(root, "h2", null, KIND_LABELS[descriptor.kind]),
      element(root, "p", "artifact-filename", descriptor.filename),
      element(root, "p", "product-muted", `${descriptor.format.toUpperCase()} · ${descriptor.createdAt}`),
      element(root, "p", "product-muted artifact-provenance", provenanceSummary(descriptor.provenance)),
      element(root, "p", `system-state artifact-readiness artifact-readiness-${descriptor.readiness}`, readinessCopy(descriptor)));
    row.append(copy);
    const companionRequired = ["research-report", "review-report"].includes(descriptor.kind);
    const companionReady = !companionRequired || companionFor(descriptor, listed.results) !== null;
    if (descriptor.readiness === "ready" && companionReady) {
      const open = element(root, "button", "quiet-button", "Verify and preview"); open.type = "button";
      open.addEventListener("click", () => select(descriptor)); row.append(open);
    } else if (descriptor.readiness === "ready" && companionRequired) {
      copy.append(element(root, "p", "product-muted",
        "This report is not actionable because its matching ready citation/context metadata is unavailable."));
    }
    inventory.append(row);
  }
  if (!listed.results.length) inventory.append(element(root, "section", "product-card", "No results have been recorded for this owner."));
  return Object.freeze({ resultCount: listed.results.length });
}
