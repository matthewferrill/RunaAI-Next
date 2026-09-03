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
P0=0/P1=0. At that point, a source commit remained required before the one typed diagnostic.

## Third sealed diagnostic stop and incompatible monitor RCA

Commit `b2cd9af` sealed the exact-schema correction. Its single run again stopped before category watching,
MXC or Git, now conclusively at `process-audit-wmi-start-failed`. The pinned PowerShell call to
`ManagementEventWatcher.Start()` threw `System.Management.Automation.MethodInvocationException` with HResult
`-2146233087`; the bounded 253-byte error record has SHA-256
`1d704a9e92c1ac5ff7bda240c1abf54582905f27da5d90714c1753d69c6d2bfb`, no overflow and no private values.
Read-only postchecks found zero owned roots and monitor processes. The event-subscription monitor is therefore
incompatible with the actual ordinary Omen execution context and is retired rather than retried.

An attempted replacement used repeated `Get-CimInstance Win32_Process` snapshots and a real Windows
parent/child proof. Independent exact-byte review stopped it before execution with P0=0/P1=3: finite polling
could miss short-lived descendants while later logic treated the result as exhaustive, the proof did not bind
evidence to the exact expected root/leaf PIDs and parent relationship, and abnormal cleanup had not been
exercised with safe PID-reuse/read-failure handling. The polling bytes and proof were removed; no polling proof
or Git operation ran.

The event-classification diagnostic is instead narrowed to facts its existing actual surfaces can prove: it
requires exactly one pinned MXC wrapper child to close with exit 0, the native guard to release with no
surviving guard, repository tree and security descriptor equality, aggregate category evidence with zero
watcher errors, and exact disposable-root cleanup. It does not claim that the wrapper had no unobserved
descendants. Exhaustive process accounting remains a separate Git-acceptance blocker, and the WMI event
monitor remains recorded as incompatible with ordinary Omen execution. Focused preflight and independent
exact-byte review must pass before a source commit and one event-classification diagnostic resume. Git
acceptance remains paused; no model, browser, network or production action is included.

## Narrowed-diagnostic review stop and cleanup correction

The first review of the narrowed bytes returned P0=0/P1=2 without executing them. First, the code recorded
`ownedFixtureRemoved` after `rm` but did not gate successful return on it. Second, the injected MXC child
record retained no process handle or terminal promise, so an abnormal observer terminal miss could release the
guard and allow root deletion while the exact wrapper remained alive.

The correction retains the exact child handle and one close promise outside the main operation. On every
abnormal path it kills through that handle and requires bounded terminal close; if closure cannot be proven,
cleanup fails and deliberately preserves the evidence root. After permitted root removal, successful return
now requires `ownedFixtureRemoved=true`. Focused source assertions cover both close reconciliation and the
post-cleanup success gate. The focused suite passes 17/17, roadmap verification passes 15/15, Node
syntax/diff checks are green, and independent exact-byte re-review returned GO with P0=0/P1=0. The reviewed
bytes remain unexecuted and must be source-committed before the one diagnostic resume.

## Fourth sealed diagnostic stop and publication RCA

Commit `c46c7e1` sealed the narrowed and independently approved method. Its one execution reached
`finish-category-witness`, which proves only that the single observer attempt returned or threw and the runner
proceeded to witness finalization. It attempted at most one contained local status operation; whether the MXC
wrapper or Git process started or completed is unknowable from retained evidence. It stopped with
`diagnostic-lifecycle-invalid` and no successor ran. Read-only
postchecks found zero disposable diagnostic roots and zero matching helper processes after excluding the
inspection process itself. No model, browser, network or production surface was called.

The immediate lifecycle condition is unknowable from the retained error because the CLI published only the
generic error and stage even though the runner held exact aggregate values in memory. The root cause is a
publication-contract gap: internal validation became more specific while the public failure schema and tests
still collapsed all lifecycle gates into one code. This is a diagnostic/harness failure, not a model or Git
result, and it blocks any retry.

The correction evaluates every narrowed gate into fixed allowlisted codes and publishes a fixed aggregate
containing only observer code, integer counts/exit codes, booleans and nulls. Unknown observer codes collapse
to `unknown`; paths, PIDs, command lines, raw events and exception messages cannot cross the boundary. Focused
regressions require independent gate identification, exact useful values, private-field exclusion and unknown
code collapse. Focused checks pass 19/19, roadmap checks pass 15/15, syntax/diff checks are green, and fresh
exact-byte review returned GO with P0=0/P1=0. The revised bytes remain unexecuted and require a source commit;
only then may one diagnostic resume. Git acceptance remains paused.

## Fifth sealed diagnostic: exact dual-failure RCA

Commit `b2e0ff0` sealed the privacy-safe lifecycle publication. Its one resume returned the exact aggregate and
then stopped. It created exactly one MXC wrapper, which closed with decimal status `3221225794`; local Windows
`certutil -error 0xC0000142` identifies that status as `STATUS_DLL_INIT_FAILED`. The observer returned
`omen-git-source-changed`. The independent category witness recorded 0 name, 0 content, 0 metadata, 84
security and 0 error events. Repository tree and the complete final security descriptor were equal to their
pre-operation values. Native guard release/no-survivor, watcher exit and owned-root removal all passed. A
read-only postcheck independently found zero diagnostic roots and zero matching helpers.

This establishes two separate actual-system faults:

1. **False source-mutation classification.** The production observer uses Node `fs.watch` as a single
   untyped mutation counter. MXC's documented AppContainer+DACL fallback temporarily changes access control
   while establishing and clearing the sandbox. The typed actual witness proves every notification was
   security-only and the final descriptor was restored. Treating those notifications as source content/name
   mutation is therefore wrong.
2. **Git target initialization failure under the frozen policy.** The wrapper closed normally from the parent
   API but its target status was `STATUS_DLL_INIT_FAILED`. The frozen configuration intentionally omits
   `process.env`, writable paths and a launcher because actual Omen MXC 0.8.0 rejects any non-empty
   `config.process.env` before `CreateProcessW`, and the approved command boundary is the fixed absolute
   `git.exe` plus closed CLI flags. Read-only PE inspection shows that this pinned executable imports
   `USER32.dll`; the installed MXC SDK documents that some Windows command-line programs cannot start when UI
   is blocked. This makes `ui.allowWindows:false` the bounded leading hypothesis. It is not yet proven as the
   cause of this exact loader status; only one reviewed final-configuration proof may establish that.

### Rejected first correction design

Independent review stopped the first correction design before implementation at P0=0/P1=3. A proposed
non-empty child environment was already known to be rejected by actual Omen MXC and contradicted the frozen
criteria. The proposed writable runtime/environment/executable surface was not bounded tightly enough. The
typed watcher design also lacked exact first-event abort ordering, one-use root/operation binding and complete
error/timeout/invalid-output cleanup semantics. None of those rejected bytes ran.

### Correction design before any retry

- Preserve the proven Omen-compatible process boundary: omit `config.process.env`, grant no writable path,
  invoke the pinned absolute `git.exe` directly with the closed status flags, close stdin and deny all network
  directions. Do not introduce `cmd.exe`, PowerShell, a writable temp/home/config directory or any inherited
  environment/credential channel.
- Amend only `ui.allowWindows` to `true`. This permits Win32 UI/window creation; it is not merely a loader
  initialization exception. Retain and read back ProcessContainer UI isolation `container`, clipboard `none`,
  input injection false, desktop-system control false, system settings `none` and IME false. Pin and normalize
  the capability increase and every retained denial. This remains a hypothesis until the single corrected
  proof succeeds; it does not close the separate exhaustive descendant-accounting blocker.
- Arm a separately pinned event-driven UI witness before spawn. On one dedicated native thread it opens the
  current session's input desktop with `OpenInputDesktop`, assigns that desktop with `SetThreadDesktop`, installs
  out-of-context `SetWinEventHook` hooks for `EVENT_OBJECT_CREATE` and `EVENT_OBJECT_SHOW` with process/thread
  filters zero, keeps the delegate pinned, and runs a Win32 message loop. It accepts only events whose object is
  `OBJID_WINDOW` and child is `CHILDID_SELF`. This deliberately covers the interactive input desktop, not the
  isolated ProcessContainer desktop. Exact generated-policy readback that UI isolation is `container` is the
  separate evidence that permitted windows are assigned away from the input desktop; the proof claims zero
  interactive-desktop exposure, not zero window creation inside the isolated container.
- The UI witness uses the same 8,192-byte newline-framed unpadded-base64url limit and one lowercase operation
  UUID. Its start object has exactly `schemaVersion`, `operationId`, `mxcImage` and `gitImage`, with schema
  `runa-omen-ui-witness-start/v1`; images are exact 3..32,767-code-unit native-final absolute path strings. Its
  ready record has exactly schema `runa-omen-ui-witness-ready/v1` and matching operation id and must arrive
  within 10,000 ms before spawn. The hook buffers event time, hwnd and owning PID internally only, capped at
  10,000 events, including events between ready and wrapper binding.
- Immediately after spawn the parent sends one bind frame with exactly schema
  `runa-omen-ui-witness-bind/v1`, operation id and `wrapperPid`, a decimal safe integer 1..4,294,967,295. The
  witness immediately enumerates all top-level windows on the captured input desktop, then classifies the
  buffered events and snapshot. A window is attributable when its PID equals the bound wrapper PID and its
  `QueryFullProcessImageName` final path equals the pinned MXC image, or when its resolved image equals the
  pinned Git image. PID reuse, image mismatch for the exact wrapper PID, inability to query an event/snapshot
  owner, hook/desktop/enumeration/message-loop error or buffer overflow fails closed; no polling or periodic
  process snapshot is acceptance evidence.
- An attributable create/show latches and emits one record with exactly schema
  `runa-omen-ui-witness-abort/v1`, operation id and code `interactive-window-observed`. Instrumentation failures
  use the same record with one of `ui-owner-unresolved`, `ui-wrapper-identity-mismatch`, `ui-hook-error`,
  `ui-event-overflow` or `ui-protocol-invalid`. No handle, PID, image or desktop name crosses the sidecar output.
  The parent races this abort with the child and uses the same immediate exact-child kill, bounded terminal and
  no-parse/no-publication path as a repository-witness abort.
- After child close, guard release and repository-witness completion, the parent sends exactly `complete\n`.
  The UI witness pumps/drains events to 250 ms quiet with an absolute 5,000 ms ceiling, re-enumerates the captured
  input desktop, unhooks, closes the desktop and exits. Its strict result has exactly schema
  `runa-omen-ui-witness-result/v1`, operation id, nonnegative safe integers `inputDesktopEvents`,
  `attributableWindowEvents`, `errors` capped at 10,000, booleans `overflow` and `survivorObserved`, and
  `privateValuesIncluded:false`. Result is required within 10,000 ms, exit 0 within 2,000 ms, aggregate
  stdout/stderr is capped at 65,536 bytes, any stderr byte or unknown/duplicate/out-of-order frame fails, and
  acceptance requires attributable/errors zero and overflow/survivor false. The same terminal/preservation
  cleanup rules apply. This is UI-specific evidence only and not exhaustive descendant-process accounting.
- Replace the untyped Node watcher with a pinned Windows `FileSystemWatcher` sidecar. Pass one bounded start
  frame over stdin, never argv; accept it once only; pin the sidecar path and hash. The frame is one
  newline-terminated, unpadded base64url encoding of at most 6,144 UTF-8 JSON bytes, with an encoded-line maximum
  of 8,192 bytes. The decoded object has exactly `schemaVersion`, `operationId` and `root`; schema is
  `runa-omen-repository-witness-start/v1`, operation id is one lowercase UUID, and `root` has exactly
  `rootFinalPath`, `gitFinalPath`, `volumeId` and `fileId`. The parent supplies the already native-validated
  final paths and root volume/file ids, revalidates them after the operation, and rejects a mismatch. All four
  identity values are JSON strings, never numbers. `volumeId` is exactly 8 lowercase hexadecimal characters;
  `fileId` is exactly 16. Each path is 3..32,767 UTF-16 code units, contains no NUL/control character, is an
  absolute drive-qualified final Win32 path returned by the pinned native bridge, and round-trips unchanged
  through `Path.GetFullPath`; `gitFinalPath` must be a strict descendant of `rootFinalPath` with an ordinal-
  ignore-case boundary comparison. No Unicode normalization or case folding changes stored path bytes. The
  sidecar rejects a second start, duplicate operation id, blank/extra frame, invalid UTF-8/base64url/JSON,
  unknown field, invalid identity/path relation, line overflow or EOF before completion.
- Internally capture the complete root-tree owner/group/DACL digest, arm typed
  name/content/metadata/security/error handlers, capture the armed digest, and emit ready only when the two
  digests are equal and no prohibited startup event/error has latched. The digest enumerates the root and at
  most 100,000 descendants without following reparse points. Each entry is classified `d`, `f` or `r`; its
  exact case-preserved relative path uses `/` separators (`.` for root) and is sorted by .NET ordinal string
  comparison. For each entry, the sidecar requests Owner, Group and Access sections and obtains SDDL. It hashes
  the strict UTF-8 concatenation `kind + NUL + relativePath + NUL + sddl + LF` for every sorted entry with
  SHA-256 and compares the lowercase 64-hex digest plus entry count. Enumeration, type/stat, ACL/SDDL, encoding,
  reparse handling or hashing error and entry overflow all fail closed as `security-snapshot-failed`; an
  attempted watcher-count overflow fails separately. Ready must arrive within 10,000 ms and
  is exactly `{"schemaVersion":"runa-omen-repository-witness-ready/v1","operationId":"<uuid>"}`.
- Implement the callbacks as genuinely asynchronous .NET delegates with an atomic first-failure latch. On the
  first name/content/metadata event or watcher error, emit exactly one fixed abort record containing no
  filename/path and latch permanently. Abort is one UTF-8 JSON line with exactly `schemaVersion`, `operationId`
  and `errorCode`; schema is `runa-omen-repository-witness-abort/v1` and the code is one of
  `repository-name-event`, `repository-content-event`, `repository-metadata-event`, `watcher-error`,
  `watcher-count-overflow`, `security-snapshot-failed`, `security-baseline-changed` or
  `witness-protocol-invalid`. Security events increment
  only a bounded count; every category count is capped at 1,000,000 and an attempted overflow latches
  `watcher-count-overflow`. Security-only activity is permitted only when the final digest exactly equals the
  initial digest.
- The parent races contained-child completion against sidecar abort/fault. On abort, watcher error, invalid or
  oversized output, early sidecar close or timeout, immediately terminate the exact MXC wrapper/child handle,
  await terminal close for at most 5,000 ms, and suppress Git output parsing/publication. The contained
  operation deadline remains 15,000 ms plus the existing 500 ms delivery allowance. Keep the sidecar armed
  through child close, MXC teardown and native-guard release.
- After guard release, send exactly the ASCII control frame `complete\n` once; any other control bytes, second
  control frame or premature EOF is protocol failure. The sidecar drains to 250 ms of quiet with an absolute
  5,000 ms drain ceiling, freezes counts, captures the final descriptor, disables and closes all watchers, and
  publishes one strict allowlisted result. Result must arrive within 10,000 ms of completion and has exactly
  `schemaVersion`, `operationId`, `counts`, `securityEntries`, `securityEqual` and `privateValuesIncluded`;
  schema is `runa-omen-repository-witness-result/v1`, `counts` has exactly nonnegative safe integers `name`,
  `content`, `metadata`, `security`, `errors` within the 1,000,000 cap, security entries is 1..100,000, and the
  final flag is false. Each stdout record is one newline-terminated strict UTF-8 JSON object of at most 4,096
  bytes; at most ready, one abort and one result may appear, in that order. Combined stdout/stderr is capped at
  65,536 bytes and any stderr byte fails. The sidecar must exit 0 within 2,000 ms after result. The parent
  validates the matching operation id, exact field sets/order-independent values, zero
  name/content/metadata/error counts and
  descriptor equality after guard release and before parsing or publishing Git output. The operation fails if
  schema/framing/order is invalid, output is oversized, or terminal cleanup cannot be proven.
- Close or terminate the exact wrapper and sidecar handles on every path. In the disposable proof, remove the
  one-use owned root only after both are proven terminal; preserve it if terminal state is unresolved. The
  publication boundary permits only fixed codes, bounded integer counts and booleans—never paths, filenames,
  PIDs, command lines, raw events or exception text.
- A second independent design review also stopped before implementation at P0=0/P1=3. It found the frozen
  `event-free` rule inconsistent with restored security-only notifications, the sidecar wire protocol and
  bounds incomplete, and the `allowWindows:true` security increase understated. The operational criteria and
  correction above now replace `event-free` with typed security restoration, freeze exact frames/schemas/
  limits/order/timing/identity/replay handling, state that visible window creation is permitted, and require
  pinned actual UI isolation/no-window/no-survivor evidence. These corrected bytes require a fresh review.
- The next independent review remained NO-GO at P0=0/P1=2: native identity/security-digest encodings and
  canonicalization were incomplete, and the UI witness could false-green on a transient or isolated-desktop
  window. The revision now makes volume/file ids lossless fixed-width strings, freezes final-path constraints
  and the complete ordinal UTF-8/SHA-256 owner/group/DACL snapshot, fails every traversal/ACL/overflow error,
  and distinguishes the captured interactive input desktop from the isolated container desktop. It replaces
  UI polling with ready-before-spawn WinEvent hooks, immediate/final enumeration, exact PID/image binding,
  strict aggregate-only frames and bounded drain/exit. These bytes also require fresh independent review.
- First run deterministic source/schema/negative/cleanup tests and roadmap validation. Obtain independent
  exact-byte review and source-commit the complete production plus proof path. Then run exactly one disposable
  actual Omen Git proof using that final configuration. Any failure stops again; no model, browser, network or
  production operation is part of this correction.

Git acceptance remains paused. The model campaign remains closed and unaffected.
