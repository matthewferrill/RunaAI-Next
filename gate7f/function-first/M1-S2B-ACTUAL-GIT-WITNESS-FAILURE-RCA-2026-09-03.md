# M1-S2B actual Git witness failure RCA — 2026-09-03

Status: actual Git acceptance stopped on its first operation. This is an actual-system witness/method
failure under investigation, not a Git result failure and not a model failure. No successor Git verb,
network probe, browser, model or production route ran.

## Exact stopped attempt

- Sealed source: `2b774224ac6cc515eb2784c7562ea57d724bcec2`.
- Prerequisite actual Windows proof: passed all 19/19 DPAPI/path/file/cleanup checks with
  `productionChanged:false` and `modelCalled:false`.
- Command: `node gate7f/function-first/omen-local/actual-git-proof.mjs` on Omen.
- Result: exit 1, schema `runaai-m1-omen-git-error/v1`, code `omen-git-source-changed`, stage
  `contained-git-status`, no child exit/stderr fields and `privateValuesIncluded:false`.
- The runner returned its normal bounded error after `finally`, establishing disposable-root cleanup. It
  did not run log, diffstat, branches, remotes, show, hostile cases, process audit, timeout or network arms.

## What is and is not known

The recursive Node `fs.watch` witness saw at least one repository notification before the first contained
result could be released. It records no event category or durable before/after state in its error, and the
actual runner did not reach its post-operation tree digest. Therefore the retained result cannot determine
whether a name/content/attribute changed, MXC temporarily changed access control, or another actor touched
the disposable repository. The stop is correct; treating the notification as either harmless or a real
mutation without evidence would not be correct.

There is a specific evidence-backed hypothesis. The same repository's prior actual R15 diagnosis recorded
MXC AppContainer/DACL setup and cleanup as `Security`-only `FileSystemWatcher` events, with zero file-name,
directory-name, size, last-write or attribute events and unchanged durable bytes/sets/security state. The
current MXC policy also declares `allowDaclMutation:true`. Node `fs.watch` cannot classify the Windows
notify filter, so it may conflate that expected reversible containment transition with source mutation.
That prior result guides the diagnostic but does not prove this failure.

## Bounded diagnostic design

Before any correction or acceptance retry, run one separately reviewed, disposable, no-model diagnostic:

1. Use the exact sealed native helper, Git, MXC executor, policy template and system Git pins.
2. Create one synthetic repository and the same first `status` operation; do not run other verbs or probes.
3. Start independent recursive Windows `FileSystemWatcher` instances with separate notify filters for
   names, last-write/size, attributes/creation time and security. Retain aggregate counts and error counts
   only—no paths or source text.
4. Hash the complete repository file/directory set and file bytes before and after. Capture canonical
   owner/group/DACL state before and after. Require exact cleanup and zero survivors.
5. Retain the observer outcome, exact contained-process exit class, aggregate event categories and durable
   equality booleans. No notification is suppressed in the diagnostic.

Disposition is prospective: security-only events plus exact durable byte/set/security equality identify a
false-positive witness boundary and permit a narrowly classified watcher design with independent durable
postchecks. Any name/content/attribute event, durable drift, watcher error, process anomaly or cleanup issue
requires a different RCA and remains stopped. The diagnostic source must pass static checks, independent
P0/P1 review and a source commit before its one run. No blind retry is permitted.

## Diagnostic implementation checkpoint before `fe0e3be`

At this checkpoint, the bounded diagnostic was implemented but had not run. `diagnose-git-witness.mjs` creates only an owned
Windows-temp repository, verifies the production release pins before fixture creation, invokes exactly one
contained `status`, records the observer code and contained lifecycle, compares complete repository-set and
byte digests, and guarantees guarded cleanup. `Classify-RunaRepositoryEvents.ps1` uses four independent
recursive watchers and the previously reviewed bounded quiescence helper to retain aggregate category/error
counts plus canonical owner/group/DACL equality only. Its public records contain no paths, names, source text
or security descriptors. Static source assertions, Node syntax and parsing in the pinned Windows PowerShell
host passed. Those were preflight results only; independent exact-byte review and a source commit remained
required before the one diagnostic run, while Git acceptance and all successors remained paused.

The first independent review stopped those prospective bytes at P0=0/P1=4 before execution. Watcher errors
were counted but not fatal; abnormal monitor/watcher cleanup did not prove post-kill terminal exit; process
audit accepted a missing root and zero descendants; and the normalized MXC policy-template pin was checked
only during the later observer operation rather than before fixture creation. The correction makes a nonzero
watcher-error count fatal, requires the pinned MXC root plus at least one pinned Git descendant and zero
survivors, performs bounded post-kill close waits before cleanup, and verifies the normalized policy-template
digest before creating the disposable root. Those revised bytes remained non-executable pending focused
preflight and independent re-review. The focused source/parser/observer/native suite then passed 17/17,
roadmap verification passed 15/15 and fresh exact-byte re-review returned GO with P0=0/P1=0. At that point,
a source commit remained mandatory before exactly one diagnostic execution; acceptance remained paused.

## Sealed diagnostic startup stop

The reviewed diagnostic was committed as `fe0e3be` and executed once. It stopped at
`start-process-audit` with `diagnostic-process-audit-ready-timeout`. The process monitor had not created
its ready file within the runner's five-second wait. This occurred before the category watcher started and
before MXC or Git was invoked, so no repository event classification was produced and no acceptance step,
network probe, browser, model or production route ran. A read-only postcheck found zero owned diagnostic
roots and zero matching process-audit helpers.

The exact retained root cause is in the diagnostic method, not the application: readiness was inferred only
from a file-polled five-second deadline, monitor stdout/stderr were discarded, and early monitor termination
was not raced against readiness. Consequently the retained result cannot distinguish slow WMI startup from
a typed PowerShell/WMI startup failure. The shared monitor also started its operation deadline before WMI was
armed, incorrectly consuming the observation budget during startup. The underlying WMI-start condition is
unknown because this harness discarded the evidence; it must not be guessed or scored against Git.

The finite correction pipes and bounds monitor stderr, publishes only byte count and SHA-256, races ready
publication against process error/exit, and uses a 30-second bounded ready window. The monitor's separate
30-second observation budget now starts only after WMI is armed and ready is published; the overall process
wait remains bounded at 65 seconds, and abnormal cleanup still requires terminal close before root removal.
The changed monitor is release-repinned and source-tested for the ordering invariant. These corrected bytes
remain unexecuted.
Focused checks pass 17/17, roadmap checks pass 15/15, pinned PowerShell parsing and the new monitor pin pass,
and fresh exact-byte review returned GO with P0=0/P1=0. At that point, a new source commit was the remaining
prerequisite. No acceptance retry was authorized by that correction.

## Second sealed diagnostic startup stop

Commit `207194b` sealed the reviewed readiness correction. Its single corrected diagnostic stopped again at
`start-process-audit`, now with `diagnostic-process-audit-startup-failed`, process exit 1, 368 stderr bytes,
SHA-256 `da49ffd40d89c76e2487f1e494bb52154b1ec43a1522a0ce698d59346ac2fd82`, and
`outputLimited:false`. The helper still emitted an ordinary PowerShell error, so the wrapper retained its
bounded fingerprint but not a safe internal stage. Category watching, MXC, Git and all acceptance successors
again did not run. Read-only postchecks again found zero owned roots and matching helper processes.

Clean pinned-host, read-only probes established that the short management type resolves without explicit
assembly loading and that constructing `ManagementEventWatcher`, configuring its timeout and disposing it
all succeed. They did not start WMI. This narrows the unobserved failure to `watcher.Start()` or ready-file
publication, but retained evidence does not justify choosing between them.

The finite correction emits one strict, privacy-safe structured error from the monitor for construct,
configure, WMI-start or ready-publication failure. It includes only the code, exception class, numeric HResult,
optional `ManagementStatus` name and `privateValuesIncluded:false`; exception messages and paths are excluded.
The Node wrapper accepts only that exact schema/allowlist and otherwise retains only the existing bounded byte
count/hash. Source checks require the typed WMI boundary and prohibit exception-message publication. The
monitor is repinned again. Focused preflight, independent exact-byte review and a new source commit are
required before one typed corrected diagnostic. Acceptance remains paused, with no Git-proof retry allowed.

The first review of that typed correction stopped before execution at P0=0/P1=1 because the parser required
the six known fields but did not reject an additional unknown field, contradicting the exact-schema claim.
The parser now requires exactly the six public keys and a focused regression accepts the valid schema while
rejecting an otherwise-valid record with an extra key. The revised bytes remain unexecuted. Focused checks
pass 18/18, roadmap checks pass 15/15, parser/pin checks pass, and fresh exact-byte re-review returned GO with
P0=0/P1=0. A source commit remains required before the one typed diagnostic.
