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
