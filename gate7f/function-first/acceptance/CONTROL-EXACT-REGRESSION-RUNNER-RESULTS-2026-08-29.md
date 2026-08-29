# Exact Control regression owner-runner results — 2026-08-29

## Outcome

The prospective reusable runner is implemented and its corrected local suites
pass. A first owner-context Control attempt exposed the retained wrapper failure
described below before an evidence directory or disposable service was created.
No model was loaded and no production or protected state was read or changed.
This remains implementation and failed-attempt evidence; it is not the final
Control regression receipt.

## Focused verification

Command:

```text
node --test gate7f/function-first/acceptance/control-exact-regression.test.mjs
```

Result before the real-host correction: 11 tests passed, 0 failed, 0 cancelled,
0 skipped and 0 todo. The hardened supervisor adds three focused regressions:
safe-only inherited environment, concurrent dual-stream overflow and complete
descendant-tree stop. The corrected focused result is 14 passed with zero fail,
cancel, skip or todo.

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

The combined new-runner and established acceptance-runner suites passed 32/32
with zero skips. `npm run verify:roadmap` also passed all 15 roadmap checks, and
`git diff --check` reported no whitespace error.

The complete corrected local Windows suite then passed 1,681 of 1,746 tests with
zero failures, cancellations or todo and 65 expected absent-host integration
skips. Those skips are not accepted as qualification; the exact Control runner
requires the same source to execute with zero skips.

## Remaining real gate

The first real owner invocation against source
`c39fd4d64f8d435e8ab03cb51bd1bc7af9f85089`, stage
`m1-task-native-55fe553c4dfa45848eae110c44214142` and prospective run
`6ce7131909a5498aa2a1b767d6a80218` exposed a wrapper noncompletion before the
core retained an evidence directory. Process-tree and retained-file probes
confirmed there was then no child process, disposable service, model invocation,
protected-data access or production change. The exact hung wrapper was stopped;
the failed/interrupted stage and manifest are retained and must not be reused.

An initial proposed correction blamed Windows PowerShell 5 task assignment and
read redirected pipes only after child exit. Independent review rejected both
claims: an actual PowerShell 5 probe returned both `Task<String>` objects in
milliseconds, while a one-megabyte dual-stream child deadlocked when waiting
before draining. A separate read-only Control measurement verified all30,036
installed-release files in12.103 seconds, so release hashing was not the delay.
The precise original noncompletion cause remains unproven and is not recorded as
an RCA.

The hardened correction removes redirected child-process handling from Windows
PowerShell. A fixed Node supervisor concurrently drains both streams with a
65,536-byte cap, enforces the1,020-second whole-run deadline, and uses the exact
owned PID with Windows `taskkill /T /F` on timeout or overflow. The PowerShell
entry point retains the owner, stage, manifest and Node pins, clears its process
environment to the same safe operating-system allowlist before the pinned Node
can interpret `NODE_OPTIONS` or `NODE_PATH`, then synchronously invokes only that
fixed supervisor and restores its own environment afterward. Actual subprocess regressions require dual
stream overflow to stop without deadlock and a timed-out child plus descendant
to be absent afterward. A new source archive, stage and prospective run are
required for the real qualification.

The next execution must create a fresh exact stage and prospective manifest for
the final selected source, then run the fixed PowerShell entry point on Control.
Only that execution can prove the pinned Control PostgreSQL/Qdrant/QuickJS/MXC
envelope and the complete repository test set. Its pass must retain the five
create-only evidence files and independently confirm owned resource cleanup.
