import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const AGENT05_BOUNDED_DRAIN_NOTICE = "Cancellation requested. No new steps will start. An already-dispatched step may still be finishing or awaiting reconciliation; its actual result will be retained when observed.";
export const AGENT05_BOUNDED_DRAIN = Object.freeze({
  noNewSteps: true,
  alreadyDispatchedMayFinish: true,
  awaitingReconciliation: true,
  resultWillBeRetained: true
});

const KEYS = ["boundedDrain", "claimedImmediateKill", "notice", "taskStatus"];
const DOM_BINDING_KEYS = ["cancellationAt", "experience", "projectId", "taskId", "taskObjective", "witnessedUrl"];
const plain = value => value && typeof value === "object" && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

export function canonicalBrowserWitness(value) {
  if (!plain(value) || !isDeepStrictEqual(Object.keys(value).sort(), KEYS)) throw new Error("m1-browser-witness-invalid");
  if (value.taskStatus !== "cancelled" || value.notice !== AGENT05_BOUNDED_DRAIN_NOTICE
      || value.claimedImmediateKill !== false || !isDeepStrictEqual(value.boundedDrain, AGENT05_BOUNDED_DRAIN)) {
    throw new Error("m1-browser-witness-invalid");
  }
  return {
    boundedDrain: { ...AGENT05_BOUNDED_DRAIN },
    claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE,
    taskStatus: "cancelled"
  };
}

export function browserWitnessFromAck(ack) {
  const data = ack?.evidence?.length === 1 ? ack.evidence[0]?.data : null;
  return canonicalBrowserWitness({
    boundedDrain: data?.boundedDrain,
    claimedImmediateKill: data?.claimedImmediateKill,
    notice: data?.notice,
    taskStatus: data?.taskStatus
  });
}

export function browserWitnessSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalBrowserWitness(value))).digest("hex");
}

export function canonicalBrowserDomBinding(value) {
  if (!plain(value) || !isDeepStrictEqual(Object.keys(value).sort(), DOM_BINDING_KEYS)
      || ![value.experience, value.projectId, value.taskId, value.taskObjective].every(item => typeof item === "string" && item.length > 0 && item.length <= 4096)
      || !Number.isFinite(Date.parse(value.cancellationAt))) throw new Error("m1-browser-dom-binding-invalid");
  let url;
  try { url = new URL(value.witnessedUrl); } catch { throw new Error("m1-browser-dom-binding-invalid"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw new Error("m1-browser-dom-binding-invalid");
  return Object.fromEntries(DOM_BINDING_KEYS.map(key => [key, value[key]]));
}

export function browserDomBindingFromAck(ack) {
  const data = ack?.evidence?.length === 1 ? ack.evidence[0]?.data : null;
  return canonicalBrowserDomBinding({ cancellationAt: data?.cancellationAt, experience: data?.experience,
    projectId: data?.projectId, taskId: data?.taskId, taskObjective: data?.taskObjective, witnessedUrl: data?.url });
}

export function browserDomBindingSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalBrowserDomBinding(value))).digest("hex");
}
