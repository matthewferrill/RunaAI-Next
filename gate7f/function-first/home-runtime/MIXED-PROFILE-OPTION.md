# Conditional mixed-profile option: design only

This is not model selection or permission to activate a scheduler. Complete the same three-model
functional campaign first. If no single candidate qualifies for all selected roles, the smallest safe
extension is serial, bounded profile switching under the same one-primary lifecycle owner. Do not
silently substitute an unqualified model to reduce waiting time.

Keep deterministic role bindings in the signed application release. An application request identifies
the selected role/model and profile digest; neither user text nor a model plan selects hardware settings.
The operator accepts only profiles individually qualified at their exact hashes, 32K context, template,
reasoning controls and MTP settings. Nomic remains the same qualified auxiliary; BGE stays separate.

The existing operator would need one additional serial state machine:

1. Enqueue a bounded, cancellable admission request with no inference dispatch. Report "waiting for
   the selected model" explicitly. Bound queue count, bytes, waiting time and per-user concurrency.
2. Stop admitting the old primary when another qualified profile reaches the head of the fair queue.
   Drain all outstanding generation-bound grants; cancellation does not count as completed execution
   until the request finishes or its exact worker is proved stopped.
3. Unload only the old owned primary and verify its absence. Never load the replacement until the
   complete inventory proves there is no other primary. Preserve Nomic only if its exact ownership,
   context and residency remain verified; otherwise close rather than infer continuity.
4. At 160 W and within the same thermal/memory limits, record a new durable load intent, load the exact
   replacement profile, verify every returned and observed setting, then publish a new generation.
5. Admit only queued requests matching that generation/profile. Preserve their request and response
   bytes, token ceilings and qualified inference deadlines. A model switch does not rewrite or replay
   a dispatched request. Canceled or expired queue entries never execute.

Queue/cold-load time must be a separately visible bounded budget; it must not silently consume or
extend the qualified 30/60-second inference budgets. The existing single HTTP deadline cannot hide a
several-minute load. A small application "prepare selected model" admission operation before the actual
inference call, or an existing durable task waiting state, is preferable to an unbounded proxy queue.
This needs an explicit application/operator protocol change and end-to-end browser tests; it is not a
configuration-only switch. Prevent starvation with bounded batches, not constant warm-model priority.

Any unknown load outcome, foreign resident, stale engine, profile drift, failed drain or watchdog loss
closes admissions. Retain the load intent and exact ownership for reconciliation; do not blindly retry,
restore higher power with possible residency, or fall back to JIT. A replacement failure leaves the
selected operation unavailable, never routed to the old model as if it passed.

Additional proof required: alternating role requests, simultaneous different roles, queue cancellation
before/after dispatch, stale generations, bounded fairness, crash at every load/swap phase, retained
Nomic identity, restart with unknown load outcome, exact one-primary observations throughout, and
rollback to the previous single-profile release. A cold boot without Matthew login remains a separate
unproved runtime availability condition. No runtime upgrade or multi-primary residency is proposed.

Tradeoff: this preserves the tested hardware/runtime envelope and permits role-specific quality, but
switches can be slow and visible. A single qualified profile is operationally simpler. If the measured
switch cost is unacceptable, co-residency or different hardware is a new explicitly measured option,
not an automatic relaxation of this design.
