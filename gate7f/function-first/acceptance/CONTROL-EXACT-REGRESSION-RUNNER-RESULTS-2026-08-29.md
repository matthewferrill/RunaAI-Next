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
0 skipped and 0 todo. The hardened supervisor, resource failure path and final
authority corrections bring the current focused result to 19 passed with zero
fail, cancel, skip or todo. The added coverage includes safe-only inherited
environment, concurrent dual-stream overflow and complete descendant-tree stop,
partial-start port retention, external dispatcher pinning before parsing,
nonblocking base64 bootstrap transport, complete dependency verification before
repository import, an invoked eval transport and actionable finite-terminal data.

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

## Complete diagnostic run and prospective shared corrections

The fresh diagnostic stage
`m1-task-native-3820e9d9c0a4458bb7538a6eea1cbf0f` on source
`5063f98e08c95c15ab846d9203e9ec81ef9d9e60` completed the entire zero-skip
suite instead of stalling. Prospective run `7f79edb805414b69bde8ccac5c8aa118`
retained 1,740 tests: 1,721 passed, 19 failed and none skipped. Cleanup passed:
the owned PostgreSQL and Qdrant processes were stopped, their owned runtime/data
were removed, and production remained unchanged. The retained TAP log is the
authority for its complete SHA-256. This failed run is diagnostic evidence, not
qualification.

The 19 failures resolved into six shared causes rather than model behavior:

1. an existing typed MXC ancestor-path denial was omitted from one unit-test
   allowlist even though the mandatory resource preflight passed;
2. the sanitized Windows child environment omitted the fixed `OS` value;
3. one watchdog fixture cleanup needed a bounded retry for transient Windows
   `EBUSY` after its stop proof;
4. processing-proof packaging consulted `.git` inside an extracted archive;
5. `File.Replace` added only `SE_DACL_AUTO_INHERITED` to the post-replacement
   target descriptor; and
6. the project filesystem adapter treated benign PowerShell first-use CLIXML on
   stderr as a protocol failure despite exact stdout and exit status.

The prospective corrections replace each ambient assumption with an explicit
contract. Windows constants are derived exactly without inheriting provider or
credential variables; the typed MXC denial remains constrained by its existing
zero-output diagnostics; cleanup retry is bounded; the processing proof uses a
hash-pinned repository-root `SOURCE-IDENTITY.json` and a frozen archived request
without Git; the project child accepts only exact bounded terminal JSON plus an
exact exit/status combination while keeping capped stderr non-authoritative.

The ACL correction is deliberately narrower than a normalized-SDDL comparison.
It records an exact descriptor fingerprint, a replacement-equivalence
fingerprint and the original flags. It requests the SACL with `Get-Acl -Audit`,
binds exact owner, group, DACL and SACL bytes/order, and permits only a
post-`ReplaceFile` `0x0400` addition. Preapply, unstarted and owned-preimage
checks remain exact; flag removal or any other descriptor difference fails
closed. Intent and receipts advance to v3, and duplicate, legacy, missing,
unknown or mistyped authority fields are rejected before use. A read-only Control
probe confirmed the owner identity is an administrator and can request audit
security data; the final zero-skip run must still prove the actual transactions.

Independent review found no remaining blocker in the prospective diff. The
focused shared-correction suite passes on Omen; twelve real SACL transaction
cases are intentionally skipped there because its current token cannot read
audit security data, while the implementation itself fails closed. Those cases
must run with zero skips under the Control owner token. The complete local suite
exited successfully on the final prospective worktree, and roadmap verification
passed 15/15 while retaining all 17 capability families. Local success does not
replace the required fresh immutable Control run.

The next fresh stage, `m1-task-native-d55ee8c867054a0eb9ca443d6f74f2bd`,
used source `7d7c0aab359fc082c8f6a70647ca3f8e12e6ebe7` and prospective run
`710fc2825ead46d58dfd9d7856222dac`. The Node child was absent after both
deadlines, but the dedicated PowerShell host again remained resident and no
evidence directory or disposable service had been created. The exact
`RUNA-CONTROL\Matthew` PowerShell process had no descendant, was reverified by
PID, owner and command, and was stopped. No model or protected data was accessed
and production was unchanged. This stage is disqualified and must not be reused.

That result disproves the remaining assumption that polling `HasExited` avoids
the Control PowerShell host defect. The replacement no longer executes the
stage dispatcher directly. A reviewed Omen builder creates an encoded preloader
bound to an external dispatcher SHA-256; Control hashes the exact dispatcher
bytes before parsing those same bytes. The dispatcher purges its ambient
PowerShell environment using .NET APIs, validates fixed pins, carries the
externally pinned bootstrap as a base64 argument and closes stdin without
writing. The final form retains the owner session with one finite wait for the
exact watchdog and returns that watchdog's exit code.

An embedded built-in-only Node watchdog retains the watchdog/bootstrap PIDs and
bounds source and dependency hashing plus the regression at 1,080,000
milliseconds. The bootstrap checks identity, manifest, every extracted source
byte, the complete 30,036-file release artifact, the exact dependency junction
and pinned Node before importing repository code. The inner supervisor retains
the core PID and has a finite post-stop/pipe-drain ceiling. Unconfirmed cleanup
therefore returns actionable process identity rather than waiting forever or
claiming a pass. Direct `-File` and direct Node invocation are unsupported.

The current focused launcher suite passed 20/20, including an actual forced
second-journal-write failure that stopped its child and terminated promptly. The invoked `-e` sentinel proved
that bootstrap main actually executes, and independent re-review found no
remaining blocker to one fresh synthetic Control qualification. The complete
local Windows suite exited zero with 1,681 passing and 77 expected host-specific
skips; roadmap verification passed 15/15. The suite also proved that its Windows
file-observation helper retries transient `EBUSY`/`EPERM` sharing windows instead
of misclassifying a complete fsynced watchdog record as a product failure. The next execution must use a fresh
commit, archive, exact stage and prospective manifest through the encoded
preloader. Only its five create-only evidence files, zero-skip result and exact
cleanup proof can qualify the Control PostgreSQL/Qdrant/QuickJS/MXC envelope.

The first encoded-preloader exercise used fresh stage
`m1-task-native-02b4f51d1d3042e28649df1f6e5b1989`, source
`705e7d7f89cb93bf9d7017e11e469baf23ea9985` and prospective run
`f4e10ca61d3845d688eadea40edecac5`. The dispatcher and outer-watchdog receipts
were observed, then both exact processes ended before the core created evidence.
Independent stage observation confirmed that no disposable directory, service,
model, protected-data read or production change remained. Because the inherited
owner connection had already closed, the bootstrap's error text was not retained;
the stage is disqualified and is not reused. The correction makes the outer
watchdog create and fsync a predispatch JSONL intent before child start, append
the exact child PID before best-effort owner output, and retain bounded
stdout/stderr files. This is a diagnostic correction, not a reclassification of
the failed run.

The next immutable exercise used stage
`m1-task-native-681d4731486846d18303db9ea2a96f49`, source
`6dc91a2b2a6ffb3d85ce343f056b6b07b5de3e25` and prospective run
`84347e187a4e4984815d5265de171ddf`. Its fsynced intent and exact watchdog/child
PIDs were retained, but both processes were absent after the SSH owner session
closed; the journal had no terminal record and the bounded output and evidence
files were empty. No disposable service, model, protected-data read or production
change occurred. This proves Windows OpenSSH places the session tree in a
kill-on-close job: a nominally detached child cannot outlive the connection.
The stage is disqualified and is not reused. The corrected dispatcher therefore
keeps the owner connection open with one 1,095,000-millisecond wait, bounded
slightly beyond the watchdog's own ceiling. Connection loss now remains a safe
whole-tree stop and an explicitly failed attempt; it is not treated as a
recoverable terminal.

The first retained-session exercise used fresh stage
`m1-task-native-c11c0bd6b8fd49bcbdb88e793b557efc`, source
`04906e2988a5972e862f78be900c13c01b7568da` and prospective run
`d1fbeffbc19b47f49bd5bde724008577`. It verified all 2,231 archived source files
and all 30,036 released dependency files, entered the resource envelope, then
failed closed before tests with `m1-native-preflight-unavailable`. The retained
system-stamped receipt was the exit-`1` `sandbox-start-failed` condition with
empty public output. Cleanup removed every owned directory and
confirmed no services, models, protected-data read or production change. A
subsequent established disposable Control preflight on the disqualified stage
immediately executed both the startup program and arithmetic through
`appcontainer-dacl`, then cleaned itself. The separate environment diagnostic
also distinguished profile-ancestor and unsupported-environment variants from
this owned-envelope event.

The correction does not turn that failed attempt into a pass. Resource startup
may issue one second preflight only when that exact receipt is accompanied by an
internal observation proving the child started and produced zero raw stdout,
zero raw stderr and no result marker. The observation retains counts and
classification, not raw text; both preflight records are retained. Access
denial, timeout, partial output, executed failure, any other code or a second failure stops the run. This is the
ordinary harmless-envelope retry already permitted for user code, not a test
retry, selective rerun or success override.
