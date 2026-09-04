import { createHash } from "node:crypto";
import {
  LIST_PRIVACY, READ_PRIVACY, RESULT_LIMITS, assertWireBudget, canonicalBase64, canonicalBoundedJson,
  canonicalFullReplacementDiff, canonicalSortedJson, canonicalTextBytes, requireScalarString,
  resultDescriptorSchema, resultFailure, resultListSchema, resultReadSchema,
} from "./artifact-result-contracts.mjs";
import { parseConversationResultSource, parseTaskResultSource } from "./artifact-result-sources.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const sortedDigest = value => hash(Buffer.from(canonicalSortedJson(value), "utf8"));
const stringToken = value => JSON.stringify(requireScalarString(value, { safeText: true }));
const numberToken = value => {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) throw resultFailure("result-source-invalid");
  return JSON.stringify(value);
};
const booleanToken = value => value ? "true" : "false";
const orderedObject = entries => `{${entries.map(([key, token]) => `${JSON.stringify(key)}:${token}`).join(",")}}`;
const orderedArray = tokens => `[${tokens.join(",")}]`;

const format = Object.freeze({
  "conversation-answer": ["txt", "txt", "text/plain; charset=utf-8"],
  "research-report": ["txt", "txt", "text/plain; charset=utf-8"],
  "research-metadata": ["json", "json", "application/json; charset=utf-8"],
  "review-report": ["txt", "txt", "text/plain; charset=utf-8"],
  "review-metadata": ["json", "json", "application/json; charset=utf-8"],
  "code-diff": ["diff", "diff", "text/x-diff; charset=utf-8"],
  "inspected-text": ["txt", "txt", "text/plain; charset=utf-8"],
  "test-outcome": ["json", "json", "application/json; charset=utf-8"],
  "task-receipt": ["json", "json", "application/json; charset=utf-8"],
});

function unavailableBytes(builder, invalidCode = "source-format-unavailable") {
  try { return { bytes: builder(), readiness: "ready", errorCode: null }; }
  catch (error) {
    if (error?.code === "result-too-large") return { bytes: null, readiness: "unavailable", errorCode: "source-too-large" };
    return { bytes: null, readiness: "unavailable", errorCode: invalidCode };
  }
}

function nonready(readiness, errorCode) { return { bytes: null, readiness, errorCode }; }

function finalCandidate(candidate, owner, ownerRevision, ordinal) {
  const [outputFormat, suffix, mediaType] = format[candidate.kind];
  const bytes = candidate.bytes;
  const contentSha256 = bytes ? hash(bytes) : null;
  const provenance = { ...candidate.provenance, contentSha256 };
  const locator = { schemaVersion: "runaai-m1-result-locator/v1", owner, ownerRevision,
    sourceRecordKind: candidate.sourceRecordKind, sourceRecordId: candidate.sourceRecordId,
    sourceRevision: candidate.sourceRevision, kind: candidate.kind, format: outputFormat, ordinal,
    byteLength: bytes?.length ?? null, contentSha256 };
  const descriptor = { schemaVersion: "runaai-m1-result-descriptor/v1",
    resultId: `r1.${sortedDigest(locator)}`, owner, ownerRevision, sourceRecordKind: candidate.sourceRecordKind,
    sourceRecordId: candidate.sourceRecordId, sourceRevision: candidate.sourceRevision, kind: candidate.kind,
    format: outputFormat, ordinal, filename: `${candidate.kind}-${String(ordinal).padStart(6, "0")}.${suffix}`,
    mediaType, byteLength: bytes?.length ?? null, contentSha256, readiness: candidate.readiness,
    errorCode: candidate.errorCode, createdAt: candidate.createdAt, provenance, privacy: LIST_PRIVACY };
  const parsed = resultDescriptorSchema.safeParse(descriptor);
  if (!parsed.success) throw resultFailure("result-source-invalid");
  return { descriptor: parsed.data, bytes };
}

function conversationRevision(turn) {
  const evidenceSha256 = sortedDigest(turn.evidence);
  const assistantSha256 = hash(Buffer.from(turn.assistant, "utf8"));
  return { sourceRevision: sortedDigest({ turnOrdinal: turn.turnOrdinal, occurredAt: turn.occurredAt,
    route: turn.route, assistantSha256, evidenceSha256 }), evidenceSha256 };
}

function conversationProvenance(source, turn, revision) {
  return { schemaVersion: "runaai-result-provenance/v1", type: "conversation-turn", chatId: source.chatId,
    turnOrdinal: turn.turnOrdinal, route: turn.route, sourceRevision: revision.sourceRevision,
    evidenceSha256: revision.evidenceSha256 };
}

function researchReady(evidence) {
  const workflow = evidence.researchWorkflow;
  if (!(workflow?.progress?.status === "report-ready" && workflow.report?.status === "attributable"
    && workflow.progress.selectedSources >= 1 && workflow.progress.resolvedSources === workflow.progress.selectedSources
    && workflow.progress.passesRun === workflow.progress.passesPlanned && !workflow.progress.degraded
    && !workflow.progress.truncated && workflow.progress.omissionCount === 0 && workflow.progress.unansweredCount === 0
    && workflow.missingEvidence.length === 0 && workflow.report.checker && workflow.report.citationOrdinals.length > 0
    && evidence.citations.length > 0 && !evidence.completion.timedOut && !evidence.completion.outputLimited)) return false;
  const ordinals = evidence.citations.map(citation => citation.ordinal);
  if (new Set(ordinals).size !== ordinals.length
      || JSON.stringify(workflow.report.citationOrdinals) !== JSON.stringify(ordinals)) return false;
  return evidence.citations.every(citation => workflow.sources.filter(source => source.sourceId === citation.sourceId
    && source.sectionId === citation.sectionId && source.contentSha256 === citation.contentSha256).length === 1);
}

function researchOutcome(evidence) {
  if (evidence.completion.outputLimited || evidence.completion.timedOut) {
    return nonready("incomplete", "source-output-limited");
  }
  if (researchReady(evidence)) return null;
  if (evidence.researchWorkflow.progress.status === "incomplete"
      || evidence.researchWorkflow.report.status === "incomplete") {
    return nonready("incomplete", "source-citations-incomplete");
  }
  return nonready("unavailable", "source-integrity-unavailable");
}

function researchMetadata(evidence) {
  const workflow = evidence.researchWorkflow, progress = workflow.progress, checker = workflow.report.checker;
  const citations = orderedArray(evidence.citations.map(citation => orderedObject([
    ["ordinal", numberToken(citation.ordinal)], ["sourceId", stringToken(citation.sourceId)],
    ["sectionId", stringToken(citation.sectionId)], ["contentSha256", stringToken(citation.contentSha256)],
  ])));
  const progressToken = orderedObject([
    ["status", stringToken("report-ready")], ["selectedSources", numberToken(progress.selectedSources)],
    ["resolvedSources", numberToken(progress.resolvedSources)], ["passesPlanned", numberToken(progress.passesPlanned)],
    ["passesRun", numberToken(progress.passesRun)], ["passagesRead", numberToken(progress.passagesRead)],
    ["degraded", booleanToken(false)], ["truncated", booleanToken(false)], ["omissionCount", numberToken(0)],
    ["unansweredCount", numberToken(0)],
  ]);
  const checkerToken = orderedObject([["attempted", "true"], ["corrected", booleanToken(checker.corrected)],
    ["attemptCount", numberToken(checker.attemptCount)], ["finalAnswerOrigin", stringToken(checker.finalAnswerOrigin)]]);
  return Buffer.from(orderedObject([["schemaVersion", stringToken("runaai-public-research-metadata/v1")],
    ["reportStatus", stringToken("attributable")], ["limitation", stringToken(workflow.limitation)],
    ["progress", progressToken], ["citations", citations], ["checker", checkerToken], ["missingEvidence", "[]"]]), "utf8");
}

function reviewReady(evidence) {
  const review = evidence.review, checker = review?.checker, citations = evidence.citations;
  if (!review || !["accepted-primary", "accepted-revision"].includes(review.status) || !checker
      || review.contexts.length < 1 || review.findings.length !== 1 || citations.length < 1) return false;
  const expected = review.status === "accepted-primary"
    ? ["accept", 0, 1, "primary"] : ["revise", 1, 2, "checker-correction"];
  if (checker.initialVerdict !== expected[0] || checker.finalVerdict !== "accept"
      || checker.revisionPasses !== expected[1] || checker.attemptCount !== expected[2]
      || checker.finalAnswerOrigin !== expected[3]) return false;
  const ordinals = citations.map(citation => citation.ordinal);
  if (new Set(ordinals).size !== ordinals.length
      || JSON.stringify(review.findings[0].citationOrdinals) !== JSON.stringify(ordinals)) return false;
  return citations.every(citation => review.contexts.filter(context => context.sourceId === citation.sourceId
    && context.sectionId === citation.sectionId && context.contentSha256 === citation.contentSha256).length === 1);
}

function reviewOutcome(evidence) {
  if (evidence.completion.outputLimited || evidence.completion.timedOut) {
    return nonready("incomplete", "source-output-limited");
  }
  if (reviewReady(evidence)) return null;
  if (evidence.review.status === "incomplete") return nonready("incomplete", "source-citations-incomplete");
  return nonready("unavailable", "source-integrity-unavailable");
}

function reviewMetadata(evidence) {
  const review = evidence.review;
  const contexts = orderedArray(review.contexts.map(context => orderedObject([
    ["contextType", stringToken(context.contextType)], ["targetId", stringToken(context.targetId)],
    ["sourceId", stringToken(context.sourceId)], ["sectionId", stringToken(context.sectionId)],
    ["contentSha256", stringToken(context.contentSha256)],
  ])));
  const checker = review.checker;
  const checkerToken = orderedObject([["initialVerdict", stringToken(checker.initialVerdict)],
    ["finalVerdict", stringToken("accept")], ["revisionPasses", numberToken(checker.revisionPasses)],
    ["attemptCount", numberToken(checker.attemptCount)], ["finalAnswerOrigin", stringToken(checker.finalAnswerOrigin)]]);
  const finding = review.findings[0];
  const findings = orderedArray([orderedObject([["findingId", stringToken(finding.findingId)],
    ["severity", stringToken("unclassified")],
    ["citationOrdinals", orderedArray(finding.citationOrdinals.map(numberToken))]])]);
  return Buffer.from(orderedObject([["schemaVersion", stringToken("runaai-public-review-metadata/v1")],
    ["status", stringToken(review.status)], ["contexts", contexts], ["checker", checkerToken],
    ["findings", findings]]), "utf8");
}

function conversationCandidates(source) {
  const candidates = [];
  for (const turn of source.turns) {
    const revision = conversationRevision(turn), provenance = conversationProvenance(source, turn, revision);
    const common = { turnOrdinal: turn.turnOrdinal, sourceRank: 0, sortId: `turn:${turn.turnOrdinal}`,
      sourceRecordKind: "chat-turn", sourceRecordId: `turn:${turn.turnOrdinal}`, createdAt: turn.occurredAt,
      sourceRevision: revision.sourceRevision, provenance };
    if (["general-chat", "guarded-chat", "workspace-chat", "code-chat"].includes(turn.route)) {
      let outcome;
      if (!turn.evidence) outcome = nonready("unavailable", "source-integrity-unavailable");
      else if (turn.evidence.completion.outputLimited || turn.evidence.completion.timedOut) {
        outcome = nonready("incomplete", "source-output-limited");
      } else if (turn.evidence.completion.reason !== "complete") outcome = nonready("incomplete", "source-incomplete");
      else outcome = unavailableBytes(() => canonicalTextBytes(turn.assistant));
      candidates.push({ ...common, kindRank: 0, kind: "conversation-answer", ...outcome });
    } else if (turn.route === "research-chat") {
      const outcome = researchOutcome(turn.evidence);
      candidates.push({ ...common, kindRank: 1, kind: "research-report",
        ...(outcome ?? unavailableBytes(() => canonicalTextBytes(turn.assistant))) });
      candidates.push({ ...common, kindRank: 2, kind: "research-metadata",
        ...(outcome ?? unavailableBytes(() => researchMetadata(turn.evidence))) });
    } else {
      const outcome = reviewOutcome(turn.evidence);
      candidates.push({ ...common, kindRank: 3, kind: "review-report",
        ...(outcome ?? unavailableBytes(() => canonicalTextBytes(turn.assistant))) });
      candidates.push({ ...common, kindRank: 4, kind: "review-metadata",
        ...(outcome ?? unavailableBytes(() => reviewMetadata(turn.evidence))) });
    }
  }
  return candidates;
}

function proposalRevision(proposal, matchingIntent, matchingReceipt = null) {
  return sortedDigest({ proposalId: proposal.proposalId, taskId: proposal.taskId, status: proposal.status,
    policy: proposal.policy, capabilityId: proposal.capabilityId, proposalDigest: proposal.proposalDigest,
    expectedProjectRevision: proposal.expectedProjectRevision, beforeWorkspaceSha256: proposal.beforeWorkspaceSha256,
    createdAt: proposal.createdAt, updatedAt: proposal.updatedAt, prepared: proposal.prepared,
    intentStatus: matchingIntent?.status ?? null, receipt: matchingReceipt });
}

function proposalState(proposal, intent, hasReceipt) {
  if (proposal.status === "denied") return nonready("failed", "source-proposal-denied");
  if (proposal.status === "cancelled") return nonready("failed", "source-cancelled");
  if (["stale", "failed"].includes(proposal.status)) return nonready("failed", "source-failed");
  if (proposal.status === "unknown" || intent?.status === "unknown") return nonready("incomplete", "source-outcome-unknown");
  if (["dispatched", "not-published"].includes(proposal.status)
      || (intent && !["recorded", "not-published"].includes(intent.status))) {
    return nonready("incomplete", "source-reconciliation-required");
  }
  if (intent?.status === "not-published") return nonready("incomplete", "source-incomplete");
  if (!hasReceipt && ["pending-approval", "authorized"].includes(proposal.status)) return nonready("pending", "source-pending");
  return null;
}

function proposalProvenance(source, proposal, sourceRevision, afterWorkspaceSha256) {
  return { schemaVersion: "runaai-result-provenance/v1", type: "task-proposal", taskId: source.task.taskId,
    proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
    expectedProjectRevision: proposal.expectedProjectRevision, beforeWorkspaceSha256: proposal.beforeWorkspaceSha256,
    afterWorkspaceSha256, sourceRevision };
}

function testOutcomeBytes(output) {
  const checks = orderedArray(output.checks.map(check => orderedObject([
    ["testId", stringToken(check.testId)], ["expected", canonicalBoundedJson(check.expected)],
    ["actual", canonicalBoundedJson(check.actual)], ["errorCode", "null"], ["passed", "true"],
  ])));
  return Buffer.from(orderedObject([["schemaVersion", stringToken("runaai-public-test-outcome/v1")],
    ["suiteId", stringToken(output.suiteId)], ["suiteSha256", stringToken(output.suiteSha256)],
    ["workspaceSha256", stringToken(output.workspaceSha256)], ["status", stringToken("passed")],
    ["passed", "true"], ["checks", checks]]), "utf8");
}

function publicReceiptBytes(receipt) {
  return Buffer.from(orderedObject([["schemaVersion", stringToken("runaai-public-task-receipt/v1")],
    ["receiptId", stringToken(receipt.receiptId)], ["receiptDigest", stringToken(receipt.receiptDigest)],
    ["taskId", stringToken(receipt.taskId)], ["proposalId", stringToken(receipt.proposalId)],
    ["proposalDigest", stringToken(receipt.proposalDigest)], ["capabilityId", stringToken(receipt.capabilityId)],
    ["argumentsDigest", stringToken(receipt.argumentsDigest)], ["beforeRevision", numberToken(receipt.beforeRevision)],
    ["afterRevision", numberToken(receipt.afterRevision)], ["beforeSha256", stringToken(receipt.beforeSha256)],
    ["afterSha256", stringToken(receipt.afterSha256)], ["effectKind", stringToken(receipt.effectKind)],
    ["executionStatus", stringToken(receipt.executionStatus)],
    ["cancellationRequested", booleanToken(receipt.cancellationRequested)],
    ["grantRevokedAfterDispatch", booleanToken(receipt.grantRevokedAfterDispatch)],
    ["currentAtRecording", booleanToken(receipt.currentAtRecording)], ["recordedAt", stringToken(receipt.recordedAt)]]), "utf8");
}

function taskCandidates(source) {
  const candidates = [], intents = new Map(source.intents.map(intent => [intent.proposalId, intent]));
  const receiptsByProposal = new Map();
  for (const receipt of source.receipts) {
    const intent = intents.get(receipt.proposalId);
    if (!intent || intent.status !== "recorded") throw resultFailure("result-source-invalid");
    if (receiptsByProposal.has(receipt.proposalId)) throw resultFailure("result-source-invalid");
    receiptsByProposal.set(receipt.proposalId, receipt);
  }
  for (const proposal of source.proposals) {
    const intent = intents.get(proposal.proposalId), receipt = receiptsByProposal.get(proposal.proposalId);
    const proposalSourceRevision = proposalRevision(proposal, intent);
    const receiptSourceRevision = proposalRevision(proposal, intent, receipt ?? null);
    const common = { sortTime: proposal.createdAt, sourceRank: 0, sortId: proposal.proposalId,
      sourceRecordKind: "task-proposal", sourceRecordId: proposal.proposalId, createdAt: proposal.createdAt,
    };
    if (proposal.capabilityId === "project.apply-change") {
      const state = proposalState(proposal, intent, Boolean(receipt));
      const preview = proposal.prepared?.kind === "apply" ? proposal.prepared : null;
      const integrity = preview && preview.afterSha256 === hash(Buffer.from(preview.afterContent, "utf8"))
        && (preview.beforeContent === null
          ? preview.beforeSha256 === null
          : preview.beforeSha256 === hash(Buffer.from(preview.beforeContent, "utf8")));
      const provenance = proposalProvenance(source, proposal, proposalSourceRevision, preview?.afterWorkspaceSha256 ?? null);
      let outcome = state && state.readiness !== "pending" ? state : null;
      if (!outcome && !integrity) outcome = nonready("unavailable", "source-integrity-unavailable");
      candidates.push({ ...common, sourceRevision: proposalSourceRevision, kindRank: 5, kind: "code-diff", provenance,
        ...(outcome ?? unavailableBytes(() => canonicalFullReplacementDiff({ path: preview.path,
          before: preview.beforeContent ?? "", after: preview.afterContent }))) });
    }
    if (proposal.capabilityId === "project.inspect") {
      const state = proposalState(proposal, intent, Boolean(receipt));
      const preview = proposal.prepared?.kind === "inspect" ? proposal.prepared : null;
      const output = receipt?.output;
      const valid = preview && output && "content" in output && output.path === preview.path
        && output.sha256 === hash(Buffer.from(output.content, "utf8"))
        && output.bytes === Buffer.byteLength(output.content, "utf8");
      const provenance = proposalProvenance(source, proposal, receiptSourceRevision, null);
      candidates.push({ ...common, sourceRevision: receiptSourceRevision, kindRank: 6, kind: "inspected-text", provenance,
        ...(state ?? (valid ? unavailableBytes(() => canonicalTextBytes(output.content))
          : nonready("unavailable", "source-integrity-unavailable"))) });
    }
    if (proposal.capabilityId === "project.run-tests") {
      const state = proposalState(proposal, intent, Boolean(receipt)), output = receipt?.output;
      const preview = proposal.prepared?.kind === "test" ? proposal.prepared : null;
      const provenance = proposalProvenance(source, proposal, receiptSourceRevision, null);
      let outcome = state;
      const bound = preview && output && "checks" in output && output.suiteId === preview.suiteId
        && output.suiteSha256 === preview.suiteSha256 && output.workspaceSha256 === receipt.afterSha256;
      if (!outcome && !bound) outcome = nonready("unavailable", "source-integrity-unavailable");
      else if (!outcome && output.status === "failed") outcome = nonready("failed", "source-tests-failed");
      else if (!outcome && output.status === "unavailable") outcome = nonready("unavailable", "source-content-unavailable");
      else if (!outcome) outcome = unavailableBytes(() => testOutcomeBytes(output));
      candidates.push({ ...common, sourceRevision: receiptSourceRevision, kindRank: 7, kind: "test-outcome", provenance, ...outcome });
    }
  }
  for (const receipt of source.receipts) {
    const sourceRevision = sortedDigest(receipt);
    const provenance = { schemaVersion: "runaai-result-provenance/v1", type: "task-receipt",
      taskId: receipt.taskId, proposalId: receipt.proposalId, proposalDigest: receipt.proposalDigest,
      receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest, beforeRevision: receipt.beforeRevision,
      afterRevision: receipt.afterRevision, beforeWorkspaceSha256: receipt.beforeSha256,
      afterWorkspaceSha256: receipt.afterSha256, sourceRevision };
    candidates.push({ sortTime: receipt.recordedAt, sourceRank: 1, sortId: receipt.receiptId, kindRank: 8,
      kind: "task-receipt", sourceRecordKind: "task-receipt", sourceRecordId: receipt.receiptId,
      createdAt: receipt.recordedAt, sourceRevision, provenance, ...unavailableBytes(() => publicReceiptBytes(receipt)) });
  }
  return candidates;
}

function compose(source, owner, candidates) {
  const ownerRevision = sortedDigest(source);
  const codeUnitCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  candidates.sort(owner.kind === "conversation"
    ? (left, right) => left.turnOrdinal - right.turnOrdinal || left.kindRank - right.kindRank
    : (left, right) => codeUnitCompare(left.sortTime, right.sortTime) || left.sourceRank - right.sourceRank
      || codeUnitCompare(left.sortId, right.sortId) || left.kindRank - right.kindRank);
  if (candidates.length > RESULT_LIMITS.maximumResults) throw resultFailure("result-owner-over-capacity");
  const entries = candidates.map((candidate, index) => finalCandidate(candidate, owner, ownerRevision, index + 1));
  const response = { schemaVersion: "runaai-m1-result-list/v1", owner, ownerRevision,
    results: entries.map(entry => entry.descriptor), privacy: LIST_PRIVACY };
  const parsed = resultListSchema.safeParse(response);
  if (!parsed.success) throw resultFailure("result-source-invalid");
  assertWireBudget(parsed.data, RESULT_LIMITS.maximumListBytes, "result-list-too-large");
  return { response: parsed.data, entries };
}

export function listConversationResults(rawSource) {
  const source = parseConversationResultSource(rawSource), owner = { kind: "conversation", chatId: source.chatId };
  return compose(source, owner, conversationCandidates(source)).response;
}

export function listTaskResults(rawSource) {
  const source = parseTaskResultSource(rawSource), owner = { kind: "task", taskId: source.task.taskId };
  return compose(source, owner, taskCandidates(source)).response;
}

export function readConversationResult(rawSource, { resultId, contentSha256 }) {
  const source = parseConversationResultSource(rawSource), owner = { kind: "conversation", chatId: source.chatId };
  return readComposed(compose(source, owner, conversationCandidates(source)), resultId, contentSha256);
}

export function readTaskResult(rawSource, { resultId, contentSha256 }) {
  const source = parseTaskResultSource(rawSource), owner = { kind: "task", taskId: source.task.taskId };
  return readComposed(compose(source, owner, taskCandidates(source)), resultId, contentSha256);
}

function readComposed(composed, resultId, contentSha256) {
  const entry = composed.entries.find(value => value.descriptor.resultId === resultId);
  if (!entry || entry.descriptor.contentSha256 !== contentSha256) throw resultFailure("result-stale");
  if (!entry.bytes || entry.descriptor.readiness !== "ready") throw resultFailure("result-not-ready");
  if (hash(entry.bytes) !== contentSha256 || entry.bytes.length !== entry.descriptor.byteLength) {
    throw resultFailure("result-unavailable");
  }
  const response = { schemaVersion: "runaai-m1-result-read/v1", descriptor: entry.descriptor,
    encoding: "base64", contentBase64: canonicalBase64(entry.bytes), privacy: READ_PRIVACY };
  const parsed = resultReadSchema.safeParse(response);
  if (!parsed.success) throw resultFailure("result-source-invalid");
  assertWireBudget(parsed.data, RESULT_LIMITS.maximumReadResponseBytes, "result-too-large");
  return parsed.data;
}
