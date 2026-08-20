export async function executeGovernedTransfer({
  store,
  capabilityId,
  actorId,
  action = "transfer",
  resourceId,
  arguments: args,
  identity,
  authorization,
  now = new Date().toISOString(),
  injectFailureAfterDeed = false,
}) {
  const reservation = await store.reserve({ capabilityId, actorId, action, resourceId, arguments: args, identity, authorization, now });
  if (reservation.outcome !== "reserved") return { ...reservation, deed: null };
  try {
    const performed = await store.performDeed(reservation, { actorId, resourceId, arguments: args }, now);
    if (injectFailureAfterDeed) throw new Error("injected-after-deed-before-acknowledgement");
    const deed = await store.postcondition(reservation.idempotencyKey);
    if (!deed) return { outcome: "unknown/reconcile", reason: "postcondition-missing", reservation, deed: null };
    await store.markOutbox(reservation.idempotencyKey, "committed", now);
    return { outcome: "committed", reason: performed.inserted ? "deed-created" : "deed-already-present", reservation, deed };
  } catch (error) {
    try {
      const reconciled = await store.reconcile(reservation.idempotencyKey, now);
      return { ...reconciled, reservation, injectedError: error.message };
    } catch (reconcileError) {
      return { outcome: "unknown/reconcile", reason: "reconciliation-unavailable", reservation,
        injectedError: error.message, reconcileError: reconcileError.message, deed: null };
    }
  }
}
