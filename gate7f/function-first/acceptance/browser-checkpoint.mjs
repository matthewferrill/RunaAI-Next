import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { enumerateCaseChecks } from "./assertions.mjs";
import { fail } from "./runner-contract.mjs";

const TRANSIENT_WINDOWS_OBSERVATION = new Set(["ENOENT", "EBUSY", "EPERM"]);
export const AGENT05_IN_FLIGHT_OBSERVATION_MS = 24_000;
export const AGENT05_BOUNDED_DRAIN_NOTICE = "Cancellation requested. No new steps will start. An already-dispatched step may still be finishing or awaiting reconciliation; its actual result will be retained when observed.";

async function readAckFile(ackPath) {
  const info = await lstat(ackPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) throw fail("m1-browser-ack-invalid");
  const raw = await readFile(ackPath);
  if (raw.byteLength > 262144) throw fail("m1-browser-ack-invalid");
  return raw.toString("utf8");
}

function parseAck(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 262144) throw fail("m1-browser-ack-invalid");
  try { return JSON.parse(raw); } catch { throw fail("m1-browser-ack-invalid"); }
}

function validateGradedAck(ack, descriptors, observation) {
  const pendingEvidence = [], identifiers = new Map();
  for (const evidence of ack.evidence) {
    if (evidence.source !== "browser" || typeof evidence.id !== "string" || !evidence.id || identifiers.has(evidence.id)
      || typeof evidence.kind !== "string" || !evidence.kind || !evidence.data || typeof evidence.data !== "object") {
      throw fail("m1-browser-evidence-invalid");
    }
    const pendingId = `evidence-${observation.evidence.length + pendingEvidence.length + 1}`;
    pendingEvidence.push({ kind: evidence.kind, data: structuredClone(evidence.data) });
    identifiers.set(evidence.id, pendingId);
  }
  const descriptorKeys = new Set(descriptors.map(value => `${value.checkId}\u0000${value.kind}`));
  const seenChecks = new Set(), pendingChecks = [];
  for (const check of ack.checks) {
    const key = `${check.checkId}\u0000${check.kind}`;
    if (!descriptorKeys.has(key) || seenChecks.has(key) || !Array.isArray(check.evidenceRefs) || check.evidenceRefs.length < 1) {
      throw fail("m1-browser-check-invalid");
    }
    seenChecks.add(key);
    const seenRefs = new Set();
    const evidenceRefs = check.evidenceRefs.map(value => {
      const refKey = `${value?.id}\u0000${value?.pointer}`;
      if (!identifiers.has(value?.id) || typeof value?.pointer !== "string" || seenRefs.has(refKey)) {
        throw fail("m1-browser-reference-invalid");
      }
      seenRefs.add(refKey);
      return { id: identifiers.get(value.id), pointer: value.pointer };
    });
    pendingChecks.push({ checkId: check.checkId, kind: check.kind, actual: structuredClone(check.actual), evidenceRefs });
  }
  if (seenChecks.size !== descriptorKeys.size) throw fail("m1-browser-check-invalid");
  return { pendingEvidence, pendingChecks };
}

function timestamp(value, code) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw fail(code);
  return parsed;
}

function requireCancellationBinding(observation, scope, cancellationAt) {
  const cancelledAt = timestamp(cancellationAt, "m1-browser-cancellation-binding-invalid");
  const records = observation.evidence.filter(entry => entry.source === "postgresql" && entry.kind === "fault-cancel-after-native-dispatch"
    && entry.data?.taskId === scope.taskId && entry.data?.cancellationAt === cancellationAt);
  if (records.length !== 1) throw fail("m1-browser-cancellation-binding-invalid");
  const record = records[0].data, result = record.result, held = record.held;
  if (result?.schemaVersion !== "runa-m1-task/v1" || result.status !== "cancelled" || result.taskId !== scope.taskId
      || result.participantId !== scope.principalId || result.projectId !== scope.projectId || result.updatedAt !== cancellationAt
      || timestamp(result.updatedAt, "m1-browser-cancellation-binding-invalid") !== cancelledAt
      || held?.nativeCompletedBeforeHold !== true || typeof held.receiptId !== "string" || !held.receiptId
      || typeof held.requestId !== "string" || !held.requestId || !/^[a-f0-9]{64}$/u.test(held.sourceSha256 ?? "")) {
    throw fail("m1-browser-cancellation-binding-invalid");
  }
  const heldRecords = observation.evidence.filter(entry => entry.source === "host-runtime" && entry.kind === "fault-native-result-held"
    && entry.data?.receiptId === held.receiptId && entry.data?.requestId === held.requestId
    && entry.data?.sourceSha256 === held.sourceSha256 && entry.data?.nativeCompletedBeforeHold === true);
  const receipts = Array.isArray(observation.native?.receipts) ? observation.native.receipts.map(value => value.receipt ?? value) : [];
  if (heldRecords.length !== 1 || receipts.length !== 1 || receipts[0]?.receiptId !== held.receiptId
      || receipts[0]?.requestId !== held.requestId || receipts[0]?.sourceSha256 !== held.sourceSha256
      || receipts[0]?.participantId !== scope.principalId || receipts[0]?.projectId !== scope.projectId) {
    throw fail("m1-browser-cancellation-binding-invalid");
  }
  return cancelledAt;
}

function validateInFlightAck(ack, request, prior, observation, observedAt, deadline) {
  const cancellationTime = requireCancellationBinding(observation, request.scope, request.cancellationAt);
  if (!isDeepStrictEqual(ack.preparedScope, request.scope) || ack.preparationCheckpointId !== prior.checkpointId
      || ack.cancellationAt !== request.cancellationAt || ack.evidence.length !== 1 || ack.checks.length !== 1) {
    throw fail("m1-browser-in-flight-binding-invalid");
  }
  const proof = ack.evidence[0], check = ack.checks[0], data = proof?.data;
  let url;
  try { url = new URL(data?.url); } catch { throw fail("m1-browser-in-flight-dom-invalid"); }
  const seenAt = timestamp(data?.observedAt, "m1-browser-in-flight-dom-invalid");
  const boundedDrain = data?.boundedDrain;
  if (proof.source !== "browser" || proof.kind !== "ui.claimedImmediateKill"
      || data?.checkId !== request.checks[0]?.checkId || data.actual !== false
      || !isDeepStrictEqual(data.scope, request.scope) || data.projectName !== request.projectName
      || data.projectId !== request.projectId || data.taskId !== request.taskId || data.experience !== request.experience
      || data.taskStatus !== "cancelled" || data.cancellationAt !== request.cancellationAt
      || data.notice !== AGENT05_BOUNDED_DRAIN_NOTICE || data.claimedImmediateKill !== false
      || !isDeepStrictEqual(boundedDrain, { noNewSteps: true, alreadyDispatchedMayFinish: true,
        awaitingReconciliation: true, resultWillBeRetained: true })
      || url.origin !== request.baseUrl || url.pathname !== "/" || url.username || url.password || url.search || url.hash
      || seenAt < cancellationTime || seenAt > deadline || seenAt > observedAt + 2000
      || check.checkId !== request.checks[0]?.checkId || check.kind !== "ui.claimedImmediateKill" || check.actual !== false
      || check.evidenceRefs?.length !== 1 || check.evidenceRefs[0]?.id !== proof.id || check.evidenceRefs[0]?.pointer !== "/actual") {
    throw fail("m1-browser-in-flight-dom-invalid");
  }
}

// Operator bridge for the parent agent's actual in-app browser. This module never
// claims a DOM observation itself. The one-use nonce is synthetic-session access,
// retained only in the owned temporary evidence directory, not a production key.
export function createBrowserCheckpoint({ directory, maximumWaitMs = 300000, announce = () => {}, signal = null,
  readAck = readAckFile, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isInteger(maximumWaitMs) || maximumWaitMs < 1000 || maximumWaitMs > 300000) throw fail("m1-browser-checkpoint-budget-invalid");
  if (typeof readAck !== "function" || typeof now !== "function" || typeof pause !== "function") throw fail("m1-browser-checkpoint-reader-invalid");
  const prepared = new Map();
  return async ({ client, phase, stage, cancellationAt = null }) => {
    if (signal?.aborted) throw fail("m1-browser-checkpoint-aborted");
    const preparationOnly = stage === "before-native-dispatch", inFlight = stage === "in-flight";
    const observation = client.ledger.observation;
    const attemptKey = JSON.stringify([observation.caseId, observation.candidateId, observation.repetition]);
    const descriptors = preparationOnly ? [] : enumerateCaseChecks(observation.caseId).filter(value => value.kind.startsWith("ui."));
    if (!preparationOnly && !descriptors.length) return;
    let scope = null, prior = null;
    if (preparationOnly || inFlight) {
      if (observation.caseId !== "agent-05-cancel-drain" || !client.task?.taskId || !/^[a-f0-9]{64}$/u.test(client.session?.sessionId ?? "")) throw fail("m1-browser-preparation-scope-invalid");
      scope = { principalId: client.principalId, projectId: client.projectId, taskId: client.task.taskId,
        experience: client.experience, sessionSha256: createHash("sha256").update(client.session.sessionId).digest("hex") };
      if (preparationOnly && prepared.has(attemptKey)) throw fail("m1-browser-preparation-already-complete");
      if (inFlight) {
        prior = prepared.get(attemptKey);
        if (!prior || prior.expiresAt <= now() || prior.baseUrl !== client.host.baseUrl || !isDeepStrictEqual(prior.scope, scope)) throw fail("m1-browser-preparation-required");
        requireCancellationBinding(observation, scope, cancellationAt);
      }
    }
    const evidenceStart = observation.evidence.length;
    const checkpointId = randomUUID(), checkpointDirectory = path.join(directory, `browser-${checkpointId}`);
    await mkdir(checkpointDirectory, { recursive: false });
    // The 25-second native hold has not begun during preparation. Once it does,
    // retain the already-open same-session browser: no new login/navigation.
    const bootstrap = inFlight ? null : await client.host.createBootstrap(client.principalId, { session: client.session });
    const waitMs = inFlight ? Math.min(AGENT05_IN_FLIGHT_OBSERVATION_MS, maximumWaitMs) : maximumWaitMs;
    const deadline = now() + waitMs;
    const liveObservation = inFlight && typeof client.host.createBrowserObservation === "function"
      && typeof client.host.readBrowserObservation === "function" && typeof client.host.consumeBrowserObservation === "function";
    const observationEndpoint = liveObservation ? client.host.createBrowserObservation(checkpointId, deadline) : null;
    const request = { schemaVersion: "runaai-m1-browser-checkpoint/v1", checkpointId,
      caseId: client.ledger.observation.caseId, candidateId: client.ledger.observation.candidateId,
      repetition: client.ledger.observation.repetition, phase, stage,
      runtimeSealSha256: client.ledger.observation.runtimeSealSha256, baseUrl: client.host.baseUrl,
      bootstrap, principalId: client.principalId, projectId: client.projectId, projectName: client.item.setup.project,
      experience: client.experience, taskId: client.task?.taskId ?? null, runId: client.run?.runId ?? null,
      preparationOnly, reusePreparedBrowser: inFlight, scope, preparationCheckpointId: prior?.checkpointId ?? null,
      cancellationAt: inFlight ? cancellationAt : null,
      taskObjective: client.task?.objective ?? client.item.objective ?? null,
      checks: descriptors, ackPath: path.join(checkpointDirectory, "browser-ack.json"), observationEndpoint,
      expiresAt: new Date(deadline).toISOString() };
    const requestPath = path.join(checkpointDirectory, "request.json");
    await writeFile(requestPath, JSON.stringify(request, null, 2), { flag: "wx" });
    announce({ checkpointId, requestPath, baseUrl: request.baseUrl, caseId: request.caseId, phase, stage });
    try {
    while (inFlight ? now() <= deadline : now() < deadline) {
      if (signal?.aborted) throw fail("m1-browser-checkpoint-aborted");
      let raw, observed = false, receivedAt = null;
      try {
        if (liveObservation) {
          const envelope = client.host.readBrowserObservation(checkpointId);
          raw = envelope.raw; receivedAt = envelope.receivedAtMs;
        } else raw = await readAck(request.ackPath);
        observed = true;
      } catch (error) {
        // The owner-side publisher creates and fsyncs this file under an
        // exclusive Windows handle.  A reader can therefore observe a short
        // EBUSY/EPERM window after the directory entry exists but before the
        // completed JSON is shareable.  Retry only those filesystem states;
        // malformed, oversized or otherwise invalid evidence still fails shut.
        if (!TRANSIENT_WINDOWS_OBSERVATION.has(error.code)) throw error;
      }
      const readAt = now(), acceptedAt = liveObservation && observed ? receivedAt : readAt;
      if (!Number.isFinite(acceptedAt) || acceptedAt > deadline || (!inFlight && acceptedAt >= deadline)
          || (!observed && readAt >= deadline)) throw fail("m1-browser-checkpoint-unobserved");
      if (observed) {
        const ack = parseAck(raw);
        if (ack.schemaVersion !== "runaai-m1-browser-checkpoint-ack/v1" || ack.checkpointId !== checkpointId
          || ack.caseId !== request.caseId || ack.runtimeSealSha256 !== request.runtimeSealSha256
          || !Array.isArray(ack.evidence) || !Array.isArray(ack.checks)) throw fail("m1-browser-ack-invalid");
        if (preparationOnly) {
          const sameSession = observation.evidence.slice(evidenceStart).some(value => value.kind === "synthetic-session-bootstrap"
            && value.data?.principalId === client.principalId && value.data?.sameSessionReattached === true && value.data?.oneTimeNonceConsumed === true);
          const proof = ack.evidence.length === 1 ? ack.evidence[0] : null;
          let url;
          try { url = new URL(proof?.data?.url); } catch { throw fail("m1-browser-preparation-unproven"); }
          const seenAt = Date.parse(proof.data.observedAt), observedAt = now();
          if (ack.checks.length || !sameSession || !isDeepStrictEqual(ack.preparedScope, scope)
              || proof.source !== "browser" || proof.kind !== "browser-preparation" || !isDeepStrictEqual(proof.data.scope, scope)
              || proof.data.projectName !== request.projectName || proof.data.taskObjective !== request.taskObjective
              || !request.taskObjective || url.origin !== request.baseUrl || url.pathname !== "/" || url.username || url.password
              || !Number.isFinite(seenAt) || seenAt > observedAt + 2000 || observedAt - seenAt > 30000) throw fail("m1-browser-preparation-unproven");
          // Preparation data cannot satisfy any ui.* frozen check. In particular
          // do not copy ack.checks or set the graded browserExercised flag here.
          client.ledger.evidence("browser", "browser-preparation", proof.data);
          const ticket = { preparationOnly: true, checkpointId, scope, baseUrl: request.baseUrl,
            preparedAt: new Date(observedAt).toISOString(), expiresAt: observedAt + 300000 };
          prepared.set(attemptKey, ticket);
          await writeFile(path.join(checkpointDirectory, "consumed.json"), JSON.stringify({ checkpointId, consumedAt: ticket.preparedAt, preparationOnly: true }), { flag: "wx" });
          return structuredClone(ticket);
        }
        if (inFlight) validateInFlightAck(ack, request, prior, observation, acceptedAt, deadline);
        const pending = validateGradedAck(ack, descriptors, observation);
        const evidenceLength = observation.evidence.length, checksLength = observation.checks.length;
        const priorBrowserExercised = observation.browserExercised;
        try {
          for (const evidence of pending.pendingEvidence) client.ledger.evidence("browser", evidence.kind, evidence.data);
          observation.checks.push(...pending.pendingChecks);
          observation.browserExercised = true;
        } catch (error) {
          observation.evidence.length = evidenceLength;
          observation.checks.length = checksLength;
          observation.browserExercised = priorBrowserExercised;
          throw error;
        }
        if (inFlight) prepared.delete(attemptKey);
        await writeFile(path.join(checkpointDirectory, "consumed.json"), JSON.stringify({ checkpointId, consumedAt: new Date().toISOString() }), { flag: "wx" });
        return;
      }
      await pause(250);
    }
    throw fail("m1-browser-checkpoint-unobserved");
    } finally {
      // Live observation slots are one-use, bounded harness state.  Clear the
      // slot on every terminal path, including malformed, late and aborted
      // acknowledgements, so repeated failed attempts cannot exhaust the cap.
      if (liveObservation) client.host.consumeBrowserObservation(checkpointId);
    }
  };
}
