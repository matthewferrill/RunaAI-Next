import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { isDeepStrictEqual } from "node:util";
import { CodeExecutionReceiptSchema } from "../../../gate7e/contracts.mjs";

const fail = code => Object.assign(new Error(code), { code });
const sha256 = value => createHash("sha256").update(value).digest("hex");
const copy = value => structuredClone(value);
const safeId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(value);
const scopeOf = client => ({ participantId: client.principalId, projectId: client.projectId });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
};
const scoped = (expected, actual) => expected.participantId === actual.participantId && expected.projectId === actual.projectId;
export const AGENT05_POST_RECEIPT_HOLD_MS = 25_000;
async function bounded(promise, timeoutMs, code) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(fail(code)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}

function gate(scope, holdMs) {
  if (!safeId(scope?.participantId) || !scope.participantId.startsWith("m1-test-") || !safeId(scope.projectId)) throw fail("m1-fault-synthetic-scope-required");
  return { scope: copy(scope), ready: deferred(), release: deferred(), observed: null, holdMs };
}

/** Trusted construction-time test hooks. Never a browser/model-controlled API.
 * The native hook runs only AFTER the real executor has produced its receipt;
 * it delays delivery, not dispatch or execution, and changes none of its caps. */
export class AcceptanceFaultController {
  constructor({ getLedger = () => null, qdrant = null, maximumHoldMs = 15000,
    nativeReceiptHoldMs = AGENT05_POST_RECEIPT_HOLD_MS } = {}) {
    if (!Number.isInteger(maximumHoldMs) || maximumHoldMs < 100 || maximumHoldMs > 15000) throw fail("m1-fault-hold-budget-invalid");
    if (!Number.isInteger(nativeReceiptHoldMs) || nativeReceiptHoldMs < 100 || nativeReceiptHoldMs > AGENT05_POST_RECEIPT_HOLD_MS) throw fail("m1-native-hold-budget-invalid");
    this.getLedger = getLedger; this.qdrant = qdrant; this.maximumHoldMs = maximumHoldMs; this.nativeReceiptHoldMs = nativeReceiptHoldMs;
    this.providerDrop = null; this.nativeHold = null; this.materializationHold = null;
    this.taskHooks = Object.freeze({
      afterMaterialize: value => this.afterMaterialize(value),
      afterCommit: value => this.record("postgresql", "fault-observed-action-commit", { value }),
    });
  }
  record(source, kind, data) { return this.getLedger()?.evidence(source, kind, data); }
  armProviderResponseDrop(scope) {
    if (this.providerDrop) throw fail("m1-provider-fault-already-armed");
    this.providerDrop = { ...gate(scope, this.maximumHoldMs), used: false };
    this.record("host-runtime", "fault-provider-response-armed", { scope });
  }
  async deliverProviderResponse({ response, raw, item }) {
    const state = this.providerDrop;
    if (!state || state.used || !scoped(state.scope, item.scope ?? {})) return true;
    if (!Buffer.isBuffer(raw) || raw.length < 2 || !response?.socket) throw fail("m1-provider-fault-transport-invalid");
    state.used = true;
    // Advertise the upstream length but transmit only its first byte. This is a
    // real truncated TCP response, never an injected successful model answer.
    const event = { requestSequence: item.sequence, scope: state.scope, upstreamBytes: raw.length,
      deliveredBytes: 1, occurredAt: new Date().toISOString(), actualSocketDestroyed: false };
    response.writeHead(item.httpStatus ?? 200, { "content-type": "application/json", "content-length": raw.length });
    await new Promise(resolve => response.write(raw.subarray(0, 1), resolve));
    response.socket.destroy(); event.actualSocketDestroyed = true;
    item.injectedFault = { type: "truncated-provider-response", ...event };
    this.record("host-runtime", "fault-provider-response-truncated", event);
    state.observed = event; state.ready.resolve(copy(event));
    return false;
  }
  providerFaultObserved() { return this.providerDrop?.used === true && this.providerDrop?.observed?.actualSocketDestroyed === true; }
  armNativeReceiptHold(scope) {
    if (this.nativeHold) throw fail("m1-native-fault-already-armed");
    this.nativeHold = { ...gate(scope, this.nativeReceiptHoldMs), released: false };
  }
  async afterNativeReceipt({ request, receipt }) {
    const state = this.nativeHold;
    if (!state || state.observed || !scoped(state.scope, { participantId: request.participant.principalId, projectId: request.project.projectId })) return;
    if (!CodeExecutionReceiptSchema.safeParse(receipt).success || receipt.requestId !== request.requestId || receipt.sourceSha256 !== sha256(request.source)
        || receipt.participantId !== request.participant.principalId || receipt.projectId !== request.project.projectId
        || receipt.threadId !== request.thread.threadId) throw fail("m1-native-hold-receipt-mismatch");
    const value = { requestId: request.requestId, receiptId: receipt.receiptId, sourceSha256: receipt.sourceSha256,
      runtimeStatus: receipt.status, heldAt: new Date().toISOString(), nativeCompletedBeforeHold: true };
    state.observed = value; this.record("host-runtime", "fault-native-result-held", value); state.ready.resolve(copy(value));
    await bounded(state.release.promise, state.holdMs, "m1-native-delivery-hold-expired");
    this.record("host-runtime", "fault-native-result-released", { ...value, releasedAt: new Date().toISOString() });
  }
  waitNativeReceiptHeld(timeoutMs = 60000) {
    if (!this.nativeHold) throw fail("m1-native-fault-not-armed");
    return bounded(this.nativeHold.ready.promise, Math.min(timeoutMs, 60000), "m1-native-dispatch-not-observed");
  }
  releaseNativeReceipt() {
    if (!this.nativeHold?.observed) throw fail("m1-native-result-not-held");
    if (this.nativeHold.released) throw fail("m1-native-result-already-released");
    this.nativeHold.released = true;
    this.nativeHold.release.resolve();
  }
  armMaterializationHold(scope) {
    if (this.materializationHold) throw fail("m1-materialization-fault-already-armed");
    this.materializationHold = gate(scope, this.maximumHoldMs);
  }
  async afterMaterialize(value) {
    this.record("host-filesystem", "fault-observed-materialization", value);
    const state = this.materializationHold;
    if (!state || state.observed || !scoped(state.scope, value.proposal)) return;
    if (!["project.apply-change", "project.restore"].includes(value.proposal.capabilityId) || !safeId(value.proposal.proposalId)) throw fail("m1-materialization-hook-invalid");
    state.observed = copy(value); state.ready.resolve(copy(value));
    // Parent must kill the actual child while this hook is pending. A timeout is
    // a failed test, not an alternative simulated process crash or publication.
    await bounded(state.release.promise, state.holdMs, "m1-materialization-hold-expired");
    throw fail("m1-materialization-crash-not-performed");
  }
  waitMaterializationHeld(timeoutMs = 60000) {
    if (!this.materializationHold) throw fail("m1-materialization-fault-not-armed");
    return bounded(this.materializationHold.ready.promise, Math.min(timeoutMs, 60000), "m1-materialization-not-observed");
  }
  clear() {
    this.providerDrop = null;
    for (const key of ["nativeHold", "materializationHold"]) {
      this[key]?.release.reject(fail("m1-fault-cleared")); this[key]?.ready.reject(fail("m1-fault-cleared")); this[key] = null;
    }
  }
  async poisonSelectedPoint(reference) {
    const owned = this.qdrant;
    if (!owned?.syntheticOnly || !/^m1_[a-z0-9_]{1,70}$/u.test(owned.collection ?? "")) throw fail("m1-fault-owned-index-required");
    const target = new URL(owned.endpoint);
    if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.pathname !== "/" || target.username || target.password || target.search || target.hash) throw fail("m1-fault-owned-index-required");
    const expected = { projectId: reference.projectId, sourceId: reference.sourceId, sectionId: reference.sectionId, contentSha256: reference.contentSha256 };
    if (![expected.projectId, expected.sourceId, expected.sectionId].every(safeId) || !/^[a-f0-9]{64}$/u.test(expected.contentSha256 ?? "")) throw fail("m1-fault-reference-invalid");
    const key = sha256(JSON.stringify(expected));
    const pointId = `${key.slice(0,8)}-${key.slice(8,12)}-${key.slice(12,16)}-${key.slice(16,20)}-${key.slice(20,32)}`;
    const call = async (suffix, body) => {
      const response = await fetch(`${target.origin}/collections/${owned.collection}${suffix}`, { method: "POST", redirect: "error",
        headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw fail("m1-fault-index-http-failed");
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length; if (length > 65536) throw fail("m1-fault-index-response-limited"); chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    };
    const request = { ids: [pointId], with_payload: true, with_vector: false };
    const before = await call("/points", request);
    if (before.result?.length !== 1 || before.result[0].id !== pointId || !isDeepStrictEqual(before.result[0].payload, expected)) throw fail("m1-fault-point-authority-mismatch");
    const staleDigest = sha256(`m1-synthetic-withdrawn-revision:${expected.contentSha256}`);
    const changed = await call("/points/payload?wait=true", { points: [pointId], payload: { contentSha256: staleDigest } });
    if (changed.status !== "ok" || changed.result?.status !== "completed" || !Number.isSafeInteger(changed.result.operation_id)) throw fail("m1-fault-point-change-unconfirmed");
    const after = await call("/points", request);
    if (after.result?.length !== 1 || after.result[0].id !== pointId || !isDeepStrictEqual(after.result[0].payload, { ...expected, contentSha256: staleDigest })) throw fail("m1-fault-point-change-unconfirmed");
    const proof = { collection: owned.collection, pointId, before: expected, after: after.result[0].payload,
      canonicalSourceChanged: false, operationId: changed.result.operation_id, occurredAt: new Date().toISOString() };
    this.record("host-runtime", "fault-owned-point-stale", proof);
    return proof;
  }
}

/** Starts a real request but does not consume any acknowledgement body. The
 * server has already completed its handler when headers arrive. The caller then
 * explicitly destroys this socket, retains the original request, and retries. */
export async function holdApplicationAcknowledgement({ baseUrl, path = "/api/m1/workspace", body, sessionId, ledger, timeoutMs = 60000 }) {
  const target = new URL(baseUrl);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.pathname !== "/" || target.username || target.password || target.search || target.hash
      || path !== "/api/m1/workspace" || body?.operation !== "run.start" || !/^[a-f0-9]{64}$/u.test(sessionId ?? "")) throw fail("m1-ack-fault-boundary-invalid");
  const ready = deferred(), closed = deferred();
  const record = { sequence: ledger.observation.application.requests.length + 1, operation: "run.start", phase: ledger.phase,
    requestId: body.input?.requestId ?? null, input: copy(body), startedAt: new Date().toISOString(), response: null };
  let incoming, request, dropped = false;
  request = httpRequest(new URL(path, target), { method: "POST", headers: { "content-type": "application/json", origin: target.origin,
    "x-runa-workspace": "1", cookie: `__Host-runa_user_session=${sessionId}` } }, response => {
    incoming = response; incoming.pause();
    record.status = response.statusCode; record.headersObservedAt = new Date().toISOString();
    if (response.statusCode < 200 || response.statusCode >= 300) { request.destroy(); ready.reject(fail("m1-ack-fault-original-request-failed")); return; }
    ready.resolve();
  });
  request.on("error", error => { if (!dropped) ready.reject(fail("m1-ack-fault-request-failed")); closed.resolve({ code: error.code ?? null }); });
  request.on("close", () => closed.resolve({ code: null }));
  request.setTimeout(timeoutMs, () => { request.destroy(); ready.reject(fail("m1-ack-fault-request-timeout")); });
  request.end(JSON.stringify(body));
  try { await bounded(ready.promise, timeoutMs, "m1-ack-fault-headers-timeout"); }
  catch (error) { request.destroy(); throw error; }
  return {
    requestId: record.requestId,
    async drop() {
      if (dropped) throw fail("m1-ack-fault-already-dropped");
      dropped = true; incoming.destroy(); request.destroy();
      await bounded(closed.promise, 1000, "m1-ack-fault-socket-not-closed");
      Object.assign(record, { finishedAt: new Date().toISOString(), errorCode: "m1-acknowledgement-intentionally-lost", responseBodyRead: false });
      ledger.observation.application.requests.push(record);
      ledger.evidence("host-runtime", "fault-http-acknowledgement-dropped", { requestId: record.requestId,
        actualSocketDestroyed: request.destroyed, responseBodyRead: false, headersObservedAt: record.headersObservedAt, droppedAt: record.finishedAt });
      return copy(record);
    },
    close() { if (!dropped) { dropped = true; incoming.destroy(); request.destroy(); } },
  };
}

function answerRequest(client, action, requestId) {
  const selected = [...client.sources.values()].filter(source => client.item.setup.selected?.includes(source.alias));
  return { requestId, projectId: client.projectId, threadId: client.threadId, experience: client.experience,
    lane: ["research", "review"].includes(client.item.role) ? client.item.role : "general", message: action.message,
    history: [], contextRevision: client.contextRevision,
    ...(selected.length ? { workspace: { sources: selected.map(({ sourceId, sectionId }) => ({ sourceId, sectionId })) } } : {}) };
}
const m1RunInput = client => ({ requestId: client.id("run"), taskId: client.task.taskId, grantId: client.grant.grantId,
  grantRevision: client.grant.revision, workflow: client.item.role });

/** Returned action handlers supplement FunctionalHttpJourney. close() must be
 * called in the runner's finally block; it never cleans someone else's stores. */
export function createFaultActions({ checkpoint = null } = {}) {
  if (checkpoint !== null && typeof checkpoint !== "function") throw fail("m1-fault-checkpoint-invalid");
  const states = new Map();
  const state = client => { if (!states.has(client)) states.set(client, {}); return states.get(client); };
  const controller = client => {
    if (!(client.host.faults instanceof AcceptanceFaultController) && !client.host.faults?.armProviderResponseDrop) throw fail("m1-real-fault-controller-unavailable");
    return client.host.faults;
  };
  const contextSnapshot = client => client.host.continuity.prepareAnswerContext({ participantId: client.principalId,
    projectId: client.projectId, threadId: client.threadId, experience: client.experience });
  const inspectCheckpoint = async (client, stage, bindings = {}) => {
    const observe = checkpoint ?? client.checkpoint ?? client.host.checkpoint;
    if (typeof observe === "function") return observe({ client, phase: client.ledger.phase, stage, ...bindings });
    client.ledger.evidence("application", "fault-browser-checkpoint-unavailable", { stage, browserObserved: false });
  };
  const actions = {
    "fault.provider-before-response": async client => {
      if (client.item.id !== "chat-08-retry-incomplete") throw fail("m1-fault-case-mismatch");
      controller(client).armProviderResponseDrop(scopeOf(client));
      state(client).before = await contextSnapshot(client);
    },
    "fault.clear": async client => {
      client.host.faults?.setIndexUnavailable?.(false);
      client.host.faults?.clear?.();
      client.ledger.evidence("host-runtime", "fault-cleared", { cleared: true });
    },
    "answer": async (client, action) => {
      if (client.item.id !== "chat-08-retry-incomplete") return client.answer(action);
      const current = state(client);
      current.answerInput ??= answerRequest(client, action, client.id("retry-answer"));
      if (current.answerInput.message !== action.message) throw fail("m1-fault-retry-question-changed");
      const result = await client.http("answer", "/api/selected/answer", current.answerInput, { allowFailure: action.id === "retryable" });
      if (action.id === "retryable") {
        const after = await contextSnapshot(client);
        if (!controller(client).providerFaultObserved() || result.completion?.reason === "complete" || result.continuity?.turnRecorded === true
            || !Number.isSafeInteger(after.turnCount) || after.turnCount !== current.before.turnCount
            || !isDeepStrictEqual(after.history, current.before.history)) throw fail("m1-incomplete-response-fault-not-contained");
        client.ledger.evidence("postgresql", "fault-incomplete-answer-continuity", { before: current.before, after, requestId: current.answerInput.requestId });
      } else {
        client.contextRevision = result.contextRevision ?? client.contextRevision;
        client.ledger.observation.application.final = result;
      }
      return result;
    },
    "fault.stale-vector-reference": async client => {
      if (client.item.id !== "research-06-stale-derived-record") throw fail("m1-fault-case-mismatch");
      const selected = client.item.setup.selected.map(alias => client.sources.get(alias));
      if (selected.length !== 1 || !selected[0]) throw fail("m1-fault-reference-invalid");
      state(client).canonical = await client.host.m1.sources.selected(client.context(), selected.map(value => value.sourceId));
      state(client).stale = await controller(client).poisonSelectedPoint({ projectId: client.projectId, ...selected[0] });
    },
    "answer.expect-source-failure": async client => {
      const current = state(client);
      if (!current.stale) throw fail("m1-stale-vector-fault-not-injected");
      const callsBefore = client.ledger.observation.provider.calls.length;
      const message = client.item.journey.find(action => action.id === "current")?.message;
      const result = await client.http("answer", "/api/selected/answer", answerRequest(client, { message }, client.id("stale-source-answer")), { allowFailure: true });
      const canonical = await client.host.m1.sources.selected(client.context(), client.item.setup.selected.map(alias => client.sources.get(alias).sourceId));
      if (client.ledger.observation.provider.calls.length !== callsBefore || result.model?.role && result.model.role !== "not-invoked"
          || !isDeepStrictEqual(canonical, current.canonical)) throw fail("m1-stale-source-fault-not-contained");
      client.contextRevision = result.contextRevision ?? client.contextRevision;
      client.ledger.evidence("postgresql", "fault-stale-source-contained", { canonicalBefore: current.canonical, canonicalAfter: canonical,
        providerCallsBefore: callsBefore, providerCallsAfter: client.ledger.observation.provider.calls.length });
      return result;
    },
    "run.start": async client => {
      const current = state(client);
      if (client.item.id === "agent-05-cancel-drain") {
        controller(client).armNativeReceiptHold(scopeOf(client));
        client.startInput = m1RunInput(client);
        current.pendingRun = client.m1("run.start", client.startInput); current.pendingRun.catch(() => {});
        current.held = await controller(client).waitNativeReceiptHeld();
        return current.held;
      }
      if (client.item.id === "agent-06-crash-reconcile") {
        if (!client.host.worker?.armMaterializationHold) throw fail("m1-actual-application-worker-required");
        await client.host.worker.armMaterializationHold(scopeOf(client));
        client.startInput = m1RunInput(client);
        current.pendingRun = client.m1("run.start", client.startInput); current.pendingRun.catch(() => {});
        current.staged = await client.host.worker.waitMaterializationHeld();
        const runs = await client.m1("run.list", {});
        const matching = runs.runs.filter(run => run.taskId === client.task.taskId);
        if (matching.length !== 1) throw fail("m1-crash-run-identity-unavailable");
        client.run = matching[0];
        return { runId: client.run.runId, proposalId: current.staged.proposal.proposalId, staged: true };
      }
      if (client.item.id === "agent-07-lost-ack") {
        client.startInput = m1RunInput(client);
        await client.host.syncPhase?.(client.ledger.phase, { participantId: client.principalId, projectId: client.projectId, threadId: client.threadId });
        current.ack = await holdApplicationAcknowledgement({ baseUrl: client.host.baseUrl, sessionId: client.session.sessionId, ledger: client.ledger,
          body: { projectId: client.projectId, experience: client.experience, operation: "run.start", input: client.startInput } });
        const status = await client.m1("task.status", { taskId: client.task.taskId });
        if (!status.receipts.some(receipt => receipt.capabilityId === "project.run-tests" && receipt.output?.executionReceipt)) throw fail("m1-ack-fault-no-durable-runtime-receipt");
        current.committedReceipts = status.receipts;
        client.ledger.evidence("postgresql", "fault-pre-loss-committed-receipts", { receipts: status.receipts });
        return { requestId: client.startInput.requestId, acknowledgementHeld: true };
      }
      return client.startRun();
    },
    "user.cancel-after-native-dispatch": async client => {
      if (!state(client).held) throw fail("m1-native-dispatch-not-observed");
      try {
        const result = await client.m1("task.cancel", { taskId: client.task.taskId });
        const cancelledAt = typeof result?.updatedAt === "string" ? Date.parse(result.updatedAt) : NaN;
        if (result?.schemaVersion !== "runa-m1-task/v1" || result.status !== "cancelled" || result.taskId !== client.task.taskId
            || result.participantId !== client.principalId || result.projectId !== client.projectId || !Number.isFinite(cancelledAt)) {
          throw fail("m1-cancel-result-invalid");
        }
        const cancellationAt = result.updatedAt;
        client.ledger.evidence("postgresql", "fault-cancel-after-native-dispatch", { taskId: client.task.taskId,
          result, held: state(client).held, cancellationAt });
        await inspectCheckpoint(client, "in-flight", { cancellationAt });
        return result;
      } finally { controller(client).releaseNativeReceipt(); }
    },
    "run.observe-drain": async client => {
      if (!state(client).pendingRun) throw fail("m1-cancel-run-not-pending");
      return client.recordState(await bounded(state(client).pendingRun, 15000, "m1-cancel-drain-not-observed"));
    },
    "fault.kill-worker-after-materialization": async client => {
      if (!state(client).staged) throw fail("m1-materialization-not-observed");
      const result = await client.host.worker.crash();
      if (!result.actualProcessExit || !Number.isInteger(result.pid)) throw fail("m1-real-worker-exit-not-observed");
      await state(client).pendingRun.catch(() => {});
      client.ledger.evidence("host-runtime", "fault-actual-worker-crashed", result); return result;
    },
    "worker.restart": async client => {
      const priorSession = client.session.sessionId;
      await client.host.worker.restart();
      await client.http("session.status", "/api/session/status", undefined, { method: "GET" });
      const status = await client.m1("run.status", { runId: client.run.runId });
      if (client.session.sessionId !== priorSession || status.run.grantId !== client.grant.grantId) throw fail("m1-worker-restart-authority-changed");
      const result = await client.recordState(status);
      await inspectCheckpoint(client, "unknown"); return result;
    },
    "proposal.reconcile": async client => {
      const proposalId = state(client).staged?.proposal?.proposalId;
      if (!proposalId) throw fail("m1-crash-proposal-not-retained");
      const result = await client.m1("proposal.reconcile", { proposalId });
      if (!result.receipt || result.executionRepeated === true) throw fail("m1-crash-reconciliation-not-complete");
      await client.recordState(); return result;
    },
    "run.resume": async client => client.recordState(await client.m1("run.resume", { runId: client.run.runId })),
    "fault.drop-http-ack-after-commit": async client => {
      const current = state(client);
      if (!current.ack || !current.committedReceipts) throw fail("m1-ack-fault-not-held-after-commit");
      const result = await current.ack.drop();
      await inspectCheckpoint(client, "acknowledgement-lost"); return result;
    },
  };
  return { actions: Object.freeze(actions), async drain({ maximumMs = 10000 } = {}) {
    if (!Number.isInteger(maximumMs) || maximumMs < 1 || maximumMs > 10000) throw fail("m1-fault-drain-budget-invalid");
    // Capture these promises before close() releases holds and clears the map.
    // Settling an HTTP call is not a pass: its actual rejection/output remains
    // in the same journey ledger and must be graded independently.
    const pending = [...states.values()].map(value => value.pendingRun).filter(Boolean);
    await bounded(Promise.allSettled(pending), maximumMs, "m1-fault-work-undrained");
    return { pendingSettled: pending.length };
  }, close() {
    for (const [client, current] of states) { current.ack?.close(); client.host.faults?.clear?.(); }
    states.clear();
  } };
}
