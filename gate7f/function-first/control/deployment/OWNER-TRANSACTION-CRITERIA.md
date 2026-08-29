# Prospective owner-side two-host transaction criteria

Roadmap revision `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This is bounded M1 C06/C07/C12/C15 deployment/recovery work. It does not
complete M1 or any of the remaining 17 capability families.

## Baseline and retained boundaries

The existing Caddy quiescence journal closes and drains only selected Next
Caddy routes. The finite watchdog and closed companion can change the
application while admission remains closed, but its constructor authority is
still injected. Home now has an owner-identity command executor, native mutation
journal, settings bridge and apply/restore functions. None of those proves that
the direct legacy primary/embedding calls to Home port1234 have stopped. Legacy
reranker port8412 must remain available and must not be mislabeled native work.

The qualified application constants in `assembly.mjs` remain the diagnostic
9556/416102 baseline. This slice must not update them, publish a route, invoke a
Home command, load a model, read a protected value or activate a service.

## Durable owner authority

1. Add a create-only, owner-private deployment journal bound to one transition,
   descriptor hash and package hash. Every record has a strict schema,
   monotonically increasing revision, previous-record hash and binding hash.
   A missing, partial, reordered, linked, foreign or swapped record fails closed.
2. `withExclusiveClosedPhase` publishes a writer intent before its callback.
   A crash leaves that writer unresolved. A new process may inspect/reconcile
   but may not execute, replay, roll back or erase it. Concurrent writers cannot
   both publish the next revision.
3. The concrete authority reloads both deployment and Caddy journals at every
   effect check. It binds the actual candidate-closed Caddy file hash, runtime
   config hash/ETag and exact transition. It rejects every unresolved Caddy
   mutation.
4. Held-phase state distinguishes Caddy mutation authority from application
   dispatch authority. Before dispatch no application effect may be pending.
   After the exact current writer records its exact operation/request/
   descriptor/package intent, only that same pending dispatch may continue.
   A foreign, stale, terminal, absent or differently bound dispatch is denied.
   The exact forward result settles it; a lost result remains unknown.
5. Qualification and Home-readiness hooks accept versioned, exact, fresh
   receipts with source/runtime/profile/installation/task/process/native/mTLS
   bindings. A boolean `ready`, listener marker, cached receipt, source mismatch
   or expired receipt is not authority.
6. The outer coordinator additionally requires a fresh, versioned activation-
   authority receipt bound to the exact descriptor and companion package. The
   receipt must name the qualified source, runtime seal and grades and state
   `activationPermitted:true`. The current diagnostic descriptor states
   `activationPermitted:false`; therefore it cannot be executed by the outer
   coordinator even when constructor adapters are present. Synthetic tests use
   an explicit test-only bypass and never call a host.

## Managed caller closure

Create a versioned `runaai-managed-native-closure/v1` receipt and validator.
It binds one transition and a fresh observation (maximum5 seconds), has no
pending effect, and contains exactly:

- Next provider9770: terminal Caddy admission receipt plus three current zero
  upstream-counter samples;
- legacy primary and embedding on Home1234: one independently terminal legacy
  admission effect plus three zero samples for both logical callers;
- Home1234: fresh native observer identity/pin with zero established
  connections;
- legacy reranker8412: exact unchanged/available observation, not a false
  closure claim.

Each entry binds authority ID, intent ID, terminal receipt hash and current
observation hash. Next-only closure, an idle snapshot, stale counters, duplicate
scope, nonterminal effect or changed reranker fails. Restore consumes the exact
forward receipt and independently terminal inverse receipts. An unknown/lost
closure or restore receipt blocks all native/application mutation.

The actual preservation-safe legacy admission mechanism is not selected by
this slice. The concrete outer transaction therefore remains blocked unless a
trusted caller-closure adapter supplies the complete tested receipt. No test
may fabricate completion by omitting legacy callers.

## Outer continuation

Add a finite coordinator with trusted constructor-only adapters. It must:

1. reload the latest owner and Caddy journals and validate qualification;
2. require a fresh complete managed-caller closure;
3. call the existing Home `applyNativeSettingsTransition` with the same
   transaction/baseline/native journal, retaining returned failure/unknown;
4. require a fresh confirmed Home observation after the owner command; the
   command-return receipt alone is never native confirmation;
5. publish the candidate-closed Caddy projection through one durable exact
   intent/CAS/terminal receipt, then independently probe the health allowlist;
6. observe the exact predecessor application, execute the closed companion,
   and observe the exact successor application before settling that effect;
7. publish the final Caddy bytes only after every previous effect is terminal
   and independently observed; and
8. on failure, keep admission closed and return `needs-reconciliation`.

Rollback runs in reverse effect order and only for exact owned terminal forward
receipts. It restores the application, calls Home restore/reconciliation, then
restores Caddy and caller admission. It never retries an unknown effect or
reopens admission based on an old snapshot. The predecessor data/config and
non-M1 keys remain intact; no database rollback is introduced.

## Deterministic acceptance

Tests use only disposable files, synthetic receipts and loopback-free adapters.
They cover: exact successful phase order; journal restart; concurrent writer;
lost writer result; lost app receipt; exact in-flight dispatch continuation;
foreign/stale dispatch denial; pending Caddy mutation; stale qualification/Home
receipt; Next-only and legacy-only closure; duplicate/missing caller; stale/one-
sample/nonzero counters; changed8412; Home command returned but not confirmed;
failure before and after each phase; exact reverse recovery; unknown effect
blocking rollback/replay; source/package/descriptor drift; no final publication
before independent successor observation; and no live host/model/service calls.

Existing quiescence, deployment, watchdog, Home journal/settings/owner-command
and roadmap suites must remain green. Result documentation must distinguish
implemented packaging/orchestration from blocked live caller closure, final
model qualification, Home installation and production activation.
