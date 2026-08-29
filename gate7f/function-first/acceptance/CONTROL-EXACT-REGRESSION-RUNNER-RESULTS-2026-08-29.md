# Exact Control regression owner-runner results — 2026-08-29

## Outcome

The prospective reusable runner is implemented and its local focused suite
passes. No Control host was contacted, no stage or live database was created,
no model was loaded and no production or protected state was read or changed.
This is implementation evidence only; it is not the prospective final Control
regression receipt.

## Focused verification

Command:

```text
node --test gate7f/function-first/acceptance/control-exact-regression.test.mjs
```

Result: 11 tests passed, 0 failed, 0 cancelled, 0 skipped and 0 todo.

The tests cover strict prospective manifest/pin validation; refusal of override
surfaces; exact unfiltered serial Node arguments; environment allowlisting;
create-only success and collision evidence; skip, resource and cleanup failure;
an actual disposable Node test child; whole-run timeout and process-tree stop;
bounded log capture; actual loopback-port and owned-directory cleanup probes;
and Windows PowerShell 5.1 parsing/static boundary checks.

The first focused invocation exposed two local implementation defects before
commit: the timeout promise retained its timer after a fast child exit, and the
test fixture inherited Node's recursive-test marker. The timer is now cleared
on every outcome, while the production allowlisted environment already excludes
that marker. The corrected focused suite is the result recorded above.

The combined new-runner and established acceptance-runner suites passed 29/29
with zero skips. `npm run verify:roadmap` also passed all 15 roadmap checks, and
`git diff --check` reported no whitespace error.

## Remaining real gate

A later operator must create a fresh exact stage and prospective manifest for
the final selected source, then run the fixed PowerShell entry point on Control.
Only that execution can prove the pinned Control PostgreSQL/Qdrant/QuickJS/MXC
envelope and the complete repository test set. Its pass must retain the five
create-only evidence files and independently confirm owned resource cleanup.
