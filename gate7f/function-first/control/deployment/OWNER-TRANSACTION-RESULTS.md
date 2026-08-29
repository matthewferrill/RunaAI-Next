# Prospective owner-side transaction results

Date: 2026-08-29. Criteria: `OWNER-TRANSACTION-CRITERIA.md` revision
`2026-08-28.1` plus the committed activation-authority addendum.

## Implemented

- `OwnerDeploymentJournal` is a create-only, owner-private, hash-linked,
  transition/descriptor/package-bound authority record. Unknown writer,
  dispatch or effect outcomes remain pending across restart and cannot be
  replayed or rolled back automatically.
- `createOwnerDeploymentAuthority` reloads the owner and Caddy journals and
  observes the actual candidate-closed Caddy file, adapted runtime config and
  ETag at effect time. It permits only the exact current writer's already-
  recorded dispatch.
- `validateManagedCallerClosure` requires all five scopes: Next provider9770,
  legacy primary1234, legacy embedding1234, Home native1234 and the unchanged
  legacy reranker8412. A Next-only or idle-only claim is not sufficient.
- `createTwoHostDeploymentCoordinator` advances one durable effect per call:
  managed caller closure, Home settings transition and fresh confirmation,
  candidate-closed Caddy, supervised application change and independent
  successor observation, then final Caddy. Rollback consumes exact forward
  receipts in safe reverse order.
- The closed companion now distinguishes the exact current in-flight app
  dispatch from Caddy mutation authority. A second Home/held-state failure
  after recording the dispatch intent cannot launch a child.
- The outer coordinator requires a fresh exact activation-authority receipt.
  The current diagnostic descriptor has blockers and
  `activationPermitted:false`, so it cannot construct a live coordinator.

## Verification

- Deployment directory: 127/127 tests passed, including real local Windows
  bounded-child/watchdog behavior, crash/lost-receipt recovery, strict package
  pins and the new two-host transaction cases.
- Focused new/changed transaction set: 51/51 tests passed.
- Neighboring Home/native/quiescence run: 225/226 tests passed in the managed
  shell. The sole failure was the existing read-only
  `New-ScheduledTaskSettingsSet` construction check being denied by the shell's
  CIM permissions. The exact seven-test runtime-installation file was rerun
  outside that restriction and passed 7/7. No scheduled task was registered.
- Syntax checks passed for the new journal, authority, caller-closure and
  two-host modules. `git diff --check` reported no content errors.

All verification used disposable local files and synthetic trusted adapters.
It did not contact Home or Control, load a model, start a service, publish a
route, read a protected value or modify production configuration.

## Still blocked before any live activation

1. A preservation-safe, tested legacy primary/embedding admission closure must
   implement the exact managed-caller adapter and prove both logical callers
   drained while leaving reranker8412 available.
2. Home must supply a current authoritative task/process/native/mTLS readiness
   receipt after its owner command; command return alone is insufficient.
3. A new qualified application source, runtime seal and grades must replace the
   diagnostic constants and produce an exact activation-authority receipt.
4. The real Control/Home adapters and rollback path must be exercised in a
   separately evidenced preproduction transition before production routing.

Until those conditions are satisfied, this work is packaging and durable
orchestration readiness, not a deployment or production-readiness claim.
