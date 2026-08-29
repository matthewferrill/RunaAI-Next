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
0 skipped and 0 todo. The hardened supervisor and resource failure path add four focused regressions:
safe-only inherited environment, concurrent dual-stream overflow and complete
descendant-tree stop, plus partial-start port retention. The corrected focused
result is 15 passed with zero fail, cancel, skip or todo.

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

The combined new-runner and established acceptance-runner suites passed 33/33
with zero skips. `npm run verify:roadmap` also passed all 15 roadmap checks, and
`git diff --check` reported no whitespace error.

The complete corrected local Windows suite then passed 1,682 of 1,747 tests with
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

A second fresh-stage attempt on corrected source `396937fc4af8ce8b2a1ea3f607cb8fca8d295665`
showed the actual post-child condition. The core failed closed with
`m1-native-preflight-unavailable` before tests; the PowerShell wrapper then
noncompleted while translating that already-safe nonzero exit into a new thrown
error. Direct bounded-supervisor execution retained the failed result. A later
disposable preflight on the disqualified stage passed and cleaned itself, so the
first native failure is treated as transient, not silently reclassified as a
pass. The old result lacked the preflight receipt because the runner discarded
`error.resourceReport` when resource creation failed.

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

The wrapper now propagates the supervisor's nonzero exit directly after restoring
its environment instead of throwing a second error. The core also retains a
resource-creation failure report and probes only ports that were actually
allocated, so a future preflight failure records its safe receipt and truthful
cleanup state without hanging or inventing absent ports.
Selected ports are recorded before PostgreSQL initialization or Qdrant start,
so a later partial-start failure also probes every possibly bound port.

A third fresh stage on source `a6561dbda46c7b90b4adbc8fe18290b57f9ddf01`
proved that direct PowerShell call-operator invocation could still leave the
PowerShell host resident after its Node child had exited. No Node child,
evidence directory or disposable service remained; the exact wrapper identity
was rechecked and stopped, and the stage was disqualified. The entry point now
uses `Start-Process -Wait -PassThru -NoNewWindow` without redirection. This
retains inherited output while moving the child wait out of PowerShell's
pipeline invocation layer; Node remains the bounded stream supervisor. A direct
Control probe completed normally and retained the deliberately selected child
exit code `7`, with no model, protected-data or production access.

A fourth fresh stage on source `70bab549ebb54b67c4112b96ce25d8ffc79746cb`
showed the same post-child residency with `Start-Process`, disproving the
pipeline-wait explanation. The exact wrapper was again verified and stopped,
with no Node child, evidence directory or disposable service remaining. The
factor common to both stalled variants was temporary mutation of the parent
PowerShell process environment. The entry point now leaves its own environment
untouched and instead supplies an explicit safe-only environment on a
nonredirected `.NET ProcessStartInfo` child. A direct Control probe of that
pattern completed and retained a deliberate child exit code `7`. This is still
prospective until a new immutable stage executes the full runner.

Phase-level evidence on that disqualified stage then retained all eleven
markers through child exit `1` and process disposal (trace SHA-256
`b970014c4523decc5e7ea20457c5a547026c7500a31e2fcabeb1191f4f8f270b`) while
the dedicated PowerShell host remained resident. This locates the stall in
normal PowerShell host teardown, after the runner was complete, rather than in
validation, child start, child wait, output, cleanup or disposal. A matched
Control probe using `[Environment]::Exit` returned the exact child exit `1` in
7.85 seconds. Because this is a dedicated noninteractive owner process and the
child has already been waited and disposed, the wrapper now terminates that host
directly with the exact child exit code instead of entering the faulty teardown
path.

Independent failure-path review identified that validation, start, wait or
dispose exceptions could otherwise still enter that same teardown layer. The
dedicated entry point therefore has one outer terminal boundary: pre-child or
wrapper exceptions map to fixed exit `125`, a started child is disposed in its
nested `finally`, an ordinary child result retains its exact exit code, and the
outermost `finally` calls `[Environment]::Exit` on every path. No exception can
skip child disposal or fall back into normal host teardown.

The next immutable stage confirmed the dedicated host could remain inside
`.WaitForExit()` after its Node child was no longer present. That API is now
removed. The wrapper polls the actual child handle's `HasExited` state at
100-millisecond intervals, retains the exact child code as soon as the OS marks
it terminal, and enforces a 1,050,000-millisecond outer ceiling. If that ceiling
is reached it stops only the recorded child tree with fixed `taskkill /PID <id>
/T /F` arguments and exits `124`; its nested `finally` repeats the exact-tree
stop if an exception occurred while the child was still live, then disposes the
handle without allowing cleanup exceptions to bypass the outer terminal exit.

Independent timeout-path review then caught that the first ceiling handler used
`Start-Process -Wait`, reintroducing the rejected wait mechanism only on that
rare path. `Stop-ExactTree` now starts fixed `taskkill.exe` through another
nonredirected `.NET ProcessStartInfo`, polls its handle for at most 10 seconds,
and accepts only exact exit `0`. It kills only that recorded stopper process if
the stopper itself exceeds the bound. Both the ceiling and nested-cleanup paths
use this helper; an unconfirmed tree stop returns wrapper failure `125` rather
than claiming timeout cleanup succeeded.

The next execution must create a fresh exact stage and prospective manifest for
the final selected source, then run the fixed PowerShell entry point on Control.
Only that execution can prove the pinned Control PostgreSQL/Qdrant/QuickJS/MXC
envelope and the complete repository test set. Its pass must retain the five
create-only evidence files and independently confirm owned resource cleanup.
