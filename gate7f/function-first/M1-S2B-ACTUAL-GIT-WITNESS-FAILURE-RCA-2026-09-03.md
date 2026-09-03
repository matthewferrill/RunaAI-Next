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
  `watcher-count-overflow`, `witness-drain-timeout`, `security-snapshot-failed`, `security-baseline-changed` or
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

### Corrected implementation review checkpoint

The frozen correction design received independent GO at P0=0/P1=0 and was source-sealed as doc-only commit
`904d52e`. The first independent review of the implementation stopped it before any actual preflight or Git
operation at P0=0/P1=8. It found: a repository-sidecar leak if UI-sidecar construction threw synchronously;
terminal-timeout state being mistaken for a real child close; an abort-to-spawn race; a stale final-security
snapshot interval; path-based ACL reads that could follow a replacement/reparse target; no clean pre-bind UI
cancel path; excessive desktop rights plus false-green process-image and unchecked Win32 cleanup failures; and
an out-of-date actual-proof manifest with no early policy-pin assertion. These are implementation/method
defects, not Git or model results.

The current unexecuted correction places every sidecar under one guarded nullable lifecycle, tracks actual
child close separately from operation outcome, re-kills and requires close after a missed terminal, checks an
abort immediately before spawn and after the child stop function is armed, and cleanly cancels a UI sidecar
that was never bound. Repository owner/group/DACL snapshots now open every root/entry with pinned native
handles using `FILE_FLAG_OPEN_REPARSE_POINT`, verify final containment and root volume/file identity before
querying security by handle, and use an active A/B quiet barrier followed by watcher disable, callback drain
and a C snapshot. Success requires the initial, armed, A, B and C count/digest states to agree. The UI witness
requests only read/enumerate/hook-control desktop rights, distinguishes a vanished process from an
instrumentation error, and latches failures from process-handle close, event unhook, thread-stop posting,
desktop close and message-loop operations. The actual proof now validates the normalized policy pin before
creating its fixture and includes both sidecar identities plus the explicit UI capability in its expected
release manifest.

Deterministic observer/protocol/native-sidecar checks currently pass 26/26, both exact PowerShell files parse
and their embedded C# compiles in the pinned Windows PowerShell 5.1 runtime, and Node syntax is green. A new
explicitly gated disposable actual witness preflight covers a clean junction without following its target, a
replacement during the completion/drain boundary, and UI cancellation before PID binding. That preflight has
not run: the corrected bytes first require fresh independent exact-byte GO and a source commit. Only a green
committed preflight may admit one actual Git proof; any actual failure stops again for RCA and redesign.

The next exact-byte review confirmed that all original eight production-observer/sidecar findings were closed,
but remained NO-GO at P0=0/P1=3 on the new deployment/preflight layer. The sidecar hashes were not protected
from Windows line-ending conversion, failure paths could delete the disposable fixture without proving every
sidecar terminal, and `securityEqual` alone did not prove that a static junction target was excluded. The
working-tree correction pins both PowerShell files to LF in `.gitattributes`, tracks/terminates/awaits every
preflight witness and preserves the fixture if terminal state is unresolved, and requires the exact three-entry
clean snapshot (root, `.git`, junction). Deterministic coverage now also enforces the LF attributes. These
amended bytes remain unexecuted and require another independent exact-byte review before commit.
That fresh current-byte review returned GO with P0=0/P1=0. It independently verified all eight original
production findings and all three follow-up deployment/preflight findings closed, both raw sidecar hashes
matching their LF-stable release pins, 26/26 focused checks, 15/15 roadmap checks, five Node syntax checks and
a clean diff check. The actual preflight remains unexecuted until this complete reviewed tree is committed.

Commit `ac10286` sealed the complete reviewed implementation. The single gated actual Windows witness
preflight then passed 4/4 on that committed source: the clean root contained exactly root, `.git` and one
junction security entry; the external target was not traversed; a directory-to-junction replacement issued
immediately after completion was detected; UI cancellation before wrapper binding closed normally; and the
owned disposable fixture was removed. Its public record states `productionChanged:false` and
`modelCalled:false`. No Git/MXC operation, network, browser or production surface was invoked. This green
preflight admits the one corrected actual Omen Git proof; any failure in that proof stops the campaign again.

Git acceptance remains paused. The model campaign remains closed and unaffected.

## Corrected actual proof stop: Git exit 128

Documentation commit `495571d` sealed the green preflight result. The one admitted corrected actual Omen Git
proof then stopped on its first `contained-git-status` operation. The production observer returned
`omen-git-process-failed`; the pinned Git target exited 128 with 67 stderr bytes and retained stderr SHA-256
`be29fcd5bc1ca2b48bf12070ba2149e0e33c02730419a50a5cfbeae997c6a5d2`. No successor Git verb or network
test arm ran. The proof's cleanup removed the disposable root, and a separate read-only postcheck found zero
matching repository/UI sidecars, MXC wrappers or Git helpers. No model, browser or production surface ran.

This result closes two prior hypotheses: `ui.allowWindows:true` allowed the pinned Git image to initialize, so
the earlier `STATUS_DLL_INIT_FAILED` startup fault is corrected; and the typed repository witness did not
misclassify MXC's security-only DACL notifications as source mutation. The new failure occurs inside Git after
startup. Exit 128 is a generic Git fatal status and the current aggregate retains neither a safe fatal category
nor redacted text. The exact underlying Git complaint therefore cannot be identified from sealed evidence.
That is a diagnostic-publication gap in the proof method, not evidence that Git functionality or a model is
wrong. Guessing from the exit code, blindly rerunning the same proof, or exposing raw stderr is prohibited.

### Correction design before one diagnostic resume

- Keep the exact committed process, repository witness, UI witness, native guard, fixed argv, no-environment,
  no-write and deny-network boundaries unchanged. Do not rerun the multi-operation actual proof.
- Add one pure bounded Git-fatal classifier at the observer's private stderr boundary. Input is 1..262,144
  bytes, strict UTF-8, with CRLF changed to LF; bare CR, NUL, non-tab C0/DEL controls, a missing/excess final
  LF, more than 16 lines or a line over 8,192 code units returns `unknown`. Matching is case-sensitive and
  each signature is anchored to the complete normalized buffer. Evaluate the following table in order, but
  collect matches rather than accepting the first: exactly one matching category returns that category;
  zero or multiple categories returns `unknown`. Multiple signatures inside one category count as one match.
  No substring/near-match, localized text or decoder failure is classified.

  | Order | Category | Complete-buffer signatures |
  |---:|---|---|
  | 1 | `dubious-ownership` | exactly one of the three literal grammars below; every instance of `<path>` in one buffer must be the same captured nonempty private string |
  | 2 | `repository-not-found` | one LF-terminated fatal line beginning exactly `fatal: not a git repository: `, `fatal: not a git repository (or any of the parent directories): `, or `fatal: not a git repository (or any parent up to mount point ` |
  | 3 | `working-directory` | one LF-terminated fatal line beginning exactly `fatal: Unable to read current working directory`, `fatal: cannot chdir to `, or `fatal: cannot come back to cwd` |
  | 4 | `configuration` | one LF-terminated fatal line beginning exactly `fatal: unable to read config file `, `fatal: bad config line `, or exactly `fatal: error processing config file(s)` plus optional colon detail |
  | 5 | `index-or-object-read` | one LF-terminated fatal line beginning exactly `fatal: index file corrupt`, `fatal: unable to read index file`, `fatal: failed to read object`, `fatal: bad object`, `fatal: invalid object`, or `fatal: object ` and ending with ` cannot be read` |
  | 6 | `option-or-usage` | either one LF-terminated line beginning exactly `fatal: unknown option`, `fatal: invalid option`, or `error: unknown option`, or `unknown option: <text>` followed by LF and a `usage: git <text>` block whose every remaining line is printable/tab text and LF-terminated |
  | 7 | `permission-denied` | one LF-terminated `fatal: ` line containing exactly one of `Permission denied`, `Access is denied`, or `Operation not permitted`, excluding all prefixes assigned to rows 1..6 |

  `<non-LF text>` means one or more permitted non-LF input characters and is never retained. Patterns may
  inspect private paths internally, but no matched text, capture, path, filename or command crosses the error.
  The three complete `dubious-ownership` grammars are frozen as follows; each displayed line ends LF, the
  displayed empty line is required, and `TAB` is exactly one U+0009 byte (spaces are not interchangeable):

  1. `fatal: detected dubious ownership in repository at '<path>'`
  2. `fatal: detected dubious ownership in repository at '<path>'` then
     `To add an exception for this directory, call:` then an empty line then
     `<U+0009>git config --global --add safe.directory '<path>'`
  3. `fatal: detected dubious ownership in repository at '<path>'` then
     `'<path>' is on a file system that does not record ownership` then
     `To add an exception for this directory, call:` then an empty line then
     `<U+0009>git config --global --add safe.directory '<path>'`

  `<path>` contains one or more permitted non-LF characters other than U+0027 single quote. The first capture
  is compared byte-for-byte with every later `<path>` occurrence, including slash direction and case. There
  is no leading/trailing whitespace on any line except the one required `TAB`; there is exactly one terminal
  LF after the last line and no additional line. Any quote variation, missing/repeated line, space indentation,
  path mismatch, extra advice or other deviation returns `unknown`.
- Preserve `stderrBytes` and `stderrSha256`. For nonzero Git exit, attach only `failureKind` from that fixed
  enum to the internal `omen-git-process-failed` error. Extend the actual diagnostic/public error schema to
  require that exact enum and continue excluding raw stderr and exception messages. Unknown text must remain
  `unknown`; classifier failure itself must fail closed as `unknown`.
- Add positive fixtures for every signature family and adversarial fixtures containing private paths, credentials,
  control bytes, malformed UTF-8 and near-miss text. Prove serialized public errors contain only the fixed
  category, byte count, digest, stage and existing booleans/nulls.
- Refactor one shared fixture builder so the diagnostic and full proof use identical bytes and lifecycle through
  the first `status`: same pinned native/Git/MXC/sidecar/policy checks before `mkdtemp`; same two-commit repository,
  inert submodule marker, remotes, working-tree change, DPAPI root confirmation, observer and native guard. The
  diagnostic invokes exactly one `status` and no successor. It starts no later network operation; any listeners
  required by the shared fixture are closed during cleanup.
- A completed diagnostic publishes exactly one object with keys `schemaVersion`, `outcome`, `operation`,
  `operationCount`, `successorStarted`, `exitCode`, `failureKind`, `stderrBytes`, `stderrSha256`,
  `repositoryUnchanged`, `wrapperTerminal`, `witnessesTerminal`, `guardReleased`, `fixtureRemoved`,
  `privateValuesIncluded`, `productionChanged` and `modelCalled`. Schema is
  `runaai-m1-omen-git-fatal-diagnostic/v1`; operation is `status`, operationCount is 1,
  successorStarted/privateValuesIncluded/productionChanged/modelCalled are false, and all five cleanup/state
  booleans are true. For `outcome:"git-fatal"`, exitCode is integer 1..4,294,967,295, failureKind is the enum,
  stderrBytes is 1..262,144 and stderrSha256 is lowercase 64-hex. For `outcome:"status-succeeded"`, exitCode is
  0, failureKind is null, stderrBytes is 0 and stderrSha256 is SHA-256 of empty bytes. Successful status with
  stderr, any other key/value/null combination or nonterminal cleanup is not a completed diagnostic.
- A harness/instrumentation failure publishes exactly `schemaVersion`, `errorCode`, `stage`, `exitCode`,
  `failureKind`, `stderrBytes`, `stderrSha256`, `wrapperTerminal`, `witnessesTerminal`, `guardReleased`,
  `fixtureDisposition`, `operationCount`, `successorStarted` and `privateValuesIncluded`. Schema is
  `runaai-m1-omen-git-fatal-diagnostic-error/v1`; errorCode and stage are fixed allowlists; exit/category/bytes/
  digest are all null unless a validated nonzero Git terminal was observed, in which case all four are non-null
  and satisfy the completed-fatal bounds; cleanup flags are booleans; fixtureDisposition is `removed` only when
  wrapper/witness/guard terminal proof is true and deletion succeeds, otherwise `retained`; operationCount is
  0 or 1, successorStarted/privateValuesIncluded are false. No path, PID, text or exception crosses this record.
- After deterministic tests, independent exact-byte review and a source commit, run exactly one disposable
  single-status diagnostic. Stop after that operation whether it succeeds or fails. Use a completed fatal result
  only to finish the Git RCA and design the real functional correction; an error-schema result stops again.
  No full proof retry is permitted from this diagnostic alone.

The first review of this diagnostic design returned NO-GO at P0=0/P1=2 because the category names lacked exact
matching/ambiguity rules and the one-status success/failure/cleanup publication contract was incomplete. The
ordered whole-buffer signatures, strict `unknown` behavior, exact shared fixture/lifecycle and schemas above
close those design gaps. These revised design bytes require fresh independent review before implementation.
That re-review remained NO-GO at P0=0/P1=1 because the optional safe-directory advice block was still named
rather than defined. The three literal grammars above now freeze its lines, blank line, one-tab indentation,
same-path rule, quoting and terminal LF; every deviation returns `unknown`. No diagnostic has run.

Fresh design review returned GO with P0=0/P1=0, and doc-only commit `2dbe284` sealed the frozen contract.
The implementation now adds the strict whole-buffer classifier, safe `failureKind`, exact completed/error
record builders and a diagnostic mode in the existing actual proof so fixture creation is byte-identical
through the first `status`. That mode records exactly one contained operation, branches before `log` or any
later/network arm, and requires unchanged repository bytes plus terminal wrapper, both witnesses, native guard
and fixture cleanup before a completed record. Successful Git with any stderr is a harness error rather than a
false completed diagnostic. Focused Omen tests pass 33/33, including all signature families, malformed/hostile
near misses, private-value non-publication, exact schemas and lifecycle/null rejection. Four Node syntax checks
and `git diff --check` pass. The source remains unexecuted and uncommitted pending independent exact-byte review.

The first implementation review returned NO-GO with P0=0/P1=4. It found that permission classification did
not require exactly one phrase, invalid operation/successor state could be collapsed in the error record, the
diagnostic inherited live probe listeners before its branch, and fixture deletion preceded independent proof
that every owned wrapper/witness/guard was terminal. No actual diagnostic ran. The correction now counts all
three permission phrases and requires a total of one; rejects rather than rewrites contradictory operation
state; uses identical inert remote bytes with no listener through the shared first status and starts live probes
only after that status in full-proof mode; and retains exact child, witness and guard handles/promises so cleanup
kills/releases and boundedly proves terminal state before root deletion. Any unresolved owned resource or
cleanup error preserves the fixture. Focused Omen tests pass 33/33, including repeated/mixed permission phrases,
contradictory lifecycle rejection, no-listener/no-successor ordering and terminal-before-delete source gates.
Fresh exact-byte review is required before commit or execution.

Fresh current-byte re-review returned GO with P0=0/P1=0. The reviewer independently reproduced 33/33 focused
Omen checks, 15/15 roadmap checks, four Node syntax checks and a clean diff check, and confirmed every prior
finding closed. No actual operation ran during review. These exact bytes may now be source-committed before the
single admitted diagnostic.

Git acceptance is paused at this new stop. The model campaign remains closed and unaffected.

## Completed Git-fatal diagnostic and cwd RCA

Source commit `69f3284` sealed the independently reviewed diagnostic. Its single actual Omen execution completed
with schema `runaai-m1-omen-git-fatal-diagnostic/v1` and stopped without a successor. It observed exactly one
`status`, exit 128, `failureKind:"working-directory"`, 67 stderr bytes and the same retained SHA-256
`be29fcd5bc1ca2b48bf12070ba2149e0e33c02730419a50a5cfbeae997c6a5d2`. Repository bytes were unchanged; the
MXC wrapper, both typed witnesses and native guard were terminal; the owned fixture was removed. The record
reports no private value, production change or model call.

This conclusively resolves the previous unknown only to the fixed `working-directory` family. The record does
not expose which private path, which of the three bounded messages, or whether the outer MXC cwd, contained
process cwd or a later Git cwd transition failed. The application currently sets both `config.process.cwd` and
the outer MXC executor working directory to the selected root. That dual selected-root coupling is the bounded
leading, testable adapter cause—not yet a proven mechanism. The repository is already explicitly present in
`readonlyPaths`, so adding the same path again is not a correction; the installed SDK also states that cwd itself
does not grant filesystem access. The correction below tests removal of that unnecessary coupling while keeping
repository authority explicit. A completed corrected status is required to confirm the hypothesis. The result is
not a Git-content, model, browser or production failure.

### Frozen cwd-decoupling correction

- Keep the selected repository and pinned Git installation as the only read-only filesystem grants. Keep zero
  writable paths, omitted child environment, direct pinned `git.exe`, deny-all network and the reviewed UI/
  repository witnesses unchanged.
- Set both the contained `config.process.cwd` and the outer MXC executor cwd to the pinned Git installation root,
  which is already an admitted read-only runtime path. Do not add a user-profile, temporary-parent, drive-root or
  writable cwd grant.
- Bind repository semantics explicitly in the fixed Git argv before every command with exactly
  `--git-dir=<selected-root>\\.git` and `--work-tree=<selected-root>`, followed by the existing fixed `-c`
  closures including `safe.directory=<selected-root>`. Do not use `-C`, ambient discovery or a shell. Native root/
  `.git` identity, executable-extension rejection and command/policy digests remain mandatory before spawn.
- Apply the same runtime cwd to the timeout and network-proof children; their repository target remains explicit.
  Remote/network tests remain unstarted during the affected status confirmation.
- Before normalization, require `config.process.cwd` to equal the resolved pinned Git installation root. Normalize
  that field as `<GIT_INSTALL_ROOT>` rather than `<SELECTED_ROOT>`, update the policy-template release pin, and
  reverify it before fixture creation and before every spawn. Require the actual outer MXC cwd to equal the same
  pinned root and bind that role into the proof manifest/pre-spawn assertions so a regression to selected-root or
  another cwd cannot pass the old digest.
- Add a deterministic disposable-repository equivalence test that invokes and parses `status`, `log`, `diffstat`,
  `branches` and `show` from the decoupled runtime cwd, compares their structured results with the existing
  selected repository semantics, and proves repository bytes unchanged. Also source-gate the timeout `hash-object`
  and network `ls-remote` children to the same explicit `--git-dir`/`--work-tree` binding and both inner/outer
  pinned-root cwd values. Prove exact argv order, selected-root read policy, no `-C`/ambient discovery, updated
  policy pin and all prior lifecycle/privacy regressions. Obtain fresh independent exact-byte GO and a source
  commit before any actual execution.
- After those gates, run exactly one corrected disposable single-status confirmation using the existing diagnostic
  contract. Stop on any error or fatal category. Only a completed `status-succeeded` record may admit a fresh
  independently documented full Git proof; it does not itself complete Git acceptance.

No cwd correction has been implemented or executed. Git acceptance remains paused at this design-review gate.

The first cwd-design review returned NO-GO with P0=0/P1=3 because the mechanism was stated more certainly than
the category evidence supports, cwd normalization would have hidden the security-relevant change from the
release pin, and the new explicit repository prefix lacked deterministic semantic coverage for every later verb
and child. The narrowed attribution, `<GIT_INSTALL_ROOT>` policy pin/pre-spawn outer-cwd assertion, five-verb
equivalence proof and timeout/network source gates above close those design omissions. No implementation or
actual operation has run; fresh design review remains mandatory.

Fresh corrected-design review returned GO with P0=0/P1=0, independently confirming the narrowed attribution,
visible `<GIT_INSTALL_ROOT>` pin, explicit inner/outer cwd assertions, five-verb equivalence and timeout/network
coverage. Roadmap checks pass 15/15 and the diff check is clean. No implementation or actual operation ran.
These exact design bytes may now be sealed before implementation.

### Cwd-decoupling implementation checkpoint

Commit `e3434f9` sealed the reviewed design. The correction is now implemented but has not been used for an
actual MXC/Git operation. Every contained Git command explicitly supplies `--git-dir=<selected-root>\.git` and
`--work-tree=<selected-root>` without `-C`; both the contained process and outer MXC wrapper use the pinned Git
installation root as cwd. The policy template rejects any other inner cwd, normalizes the admitted value as
`<GIT_INSTALL_ROOT>`, and is repinned. The status-timeout and network-proof children carry the same explicit
repository prefix and inner/outer cwd assertions.

The new native disposable-repository equivalence gate found two additional deterministic command-contract
defects before an actual retry. First, current Windows Git rejects `core.excludesFile=NUL`; using the empty
command-line value disables the ambient global excludes file without introducing a path. Second, the `show`
format ended with `%x00` while `-z` supplied the record terminator, producing a duplicate empty field that the
strict parser correctly rejected. The fixed command uses `core.excludesFile=` and removes the redundant final
`%x00`. These are preflight command-construction defects, not actual-system failures and not model failures.

The corrected equivalence test executes and parses `status`, `log`, `diffstat`, `branches` and `show` from both
the selected-repository baseline and the decoupled pinned-runtime cwd, requires identical structured fields and
an unchanged complete repository tree digest, and rejects regression to the selected-root policy cwd. All Omen
tests pass 35/35 and roadmap verification passes 15/15; syntax and diff checks remain required with independent
exact-byte review before a source commit. Git acceptance remains paused. Exactly one corrected single-status
diagnostic is the only actual operation permitted after those gates; no network, browser, model or production
action is included.

The first implementation review returned NO-GO with P0=0/P1=3 before execution. The normalizer validated cwd
but could mask missing, extra or reordered read-only paths; the equivalence gate did not authenticate the native
Git/config/attributes bytes, require zero stderr or prove the empty excludes override against an ambient source;
and loose source regexes could match a non-spawn occurrence of the pinned cwd. The correction validates the exact
canonical two-entry read-only list and empty write/deny lists before normalization, rejects missing/extra/
reordered/aliased/duplicate authority, and makes the proof checks exact. The native gate now hashes Git, system
config and system attributes before fixture creation; requires zero stderr for setup and all five baseline/
decoupled operations; and proves a controlled global ignore hides an untracked sentinel until
`core.excludesFile=` exposes it. A captured `spawnSandboxWithPinnedCwd` boundary supplies the outer cwd and
rejects selected/other inner cwd values, while exact call-site assertions bind observer, timeout and network
children to that boundary. The zero-stderr gate also exposed an ambient line-ending warning on `diffstat`;
`core.safecrlf=false` now suppresses only that warning while retaining the configured autocrlf semantics. No
actual operation ran. Focused Omen checks pass 35/35, roadmap checks pass 15/15, all changed JavaScript parses
and the diff check is clean. Fresh independent re-review remains mandatory before a source commit.

The second implementation review confirmed all three code/test findings closed but returned NO-GO at P0=0/
P1=1 because the normative M1-S2B criteria still froze the historical selected-root cwd command contract,
`core.excludesFile=NUL`, and no explicit repository arguments or safe-CRLF closure. No actual operation ran.
The criteria now mark those values superseded by this retained diagnostic, freeze both cwd values to the pinned
Git installation root, require the exact ordered two-path read authority, and publish the exact amended argument
order including `--git-dir`, `--work-tree`, empty excludes, `core.safecrlf=false` and the single-terminator show
format. Fresh deterministic checks and independent exact-byte review remain mandatory.
Fresh exact-byte re-review returned GO with P0=0/P1=0, independently reproducing 35/35 focused checks, 15/15
roadmap checks and a clean diff check. No actual operation ran. These bytes may now be source-committed before
the sole corrected single-status diagnostic.

## Corrected single-status permission stop

Commit `77b3eeb` sealed the independently reviewed cwd correction. Its one permitted actual execution again
stopped after exactly one `status`, but the prior working-directory fatal is no longer present. The completed
record reports exit 128, `failureKind:"permission-denied"`, 50 stderr bytes and SHA-256
`25796725b6f5b304af0f76f2361e36b924b4a4e74bbe8b36887a1af9d84b329a`. The repository was unchanged; one
wrapper, two witnesses and one guard were terminal/released; the fixture was removed; and no successor,
network, browser, model or production action ran. An independent read-only postcheck found zero matching owned
roots and helpers.

The retained record proves only a single LF/CRLF-normalized fatal line containing exactly one of the allowlisted
permission phrases and no competing fatal family. It does not expose the message stem, a path or the denied
resource, so it cannot distinguish Git-runtime, refs, objects, index, attributes or work-tree access. The cwd
correction demonstrably moved execution beyond the former cwd failure, but a successful status is not proven.
This is an actual Omen Git permission-boundary failure, not a model/browser/network/production failure. Blindly
rerunning status or widening filesystem authority is prohibited.

### Frozen permission-boundary diagnostic design

Implement one separately reviewed, source-sealed diagnostic using the same `77b3eeb` release pins, fixture,
observer, witnesses, guard, cleanup and privacy boundary. It may invoke only existing read-only local public
verbs, in this exact order: `branches`, `show` for the already-created exact commit, `diffstat`, then `status`.
The order provides progressively broader Git observations, but the verbs overlap in their access to configuration,
refs, objects, attributes, index and work-tree state. A first failure identifies only the earliest failing verb in
this fixed sequence; it does not by itself identify the denied resource or access surface.
After each operation it must prove the repository tree unchanged and all operation-owned resources terminal
before starting the next. The first fatal or any harness/parser/lifecycle error stops immediately; no later verb
starts. At most four wrappers, eight witnesses and four guards may exist. Remotes, timeout, process-audit,
network listeners/probes, browser, model and production paths remain unreachable.

A completed record has schema `runaai-m1-omen-git-permission-boundary-diagnostic/v1` and exactly these top-level
keys in this order: `schemaVersion`, `plannedOperations`, `outcome`, `operationCount`,
`successorAfterFailure`, `attempts`, `repositoryUnchanged`, `wrapperCount`, `witnessCount`, `guardCount`,
`wrappersTerminal`, `witnessesTerminal`, `guardsReleased`, `fixtureRemoved`, `privateValuesIncluded`,
`productionChanged`, `modelCalled`. `plannedOperations` is exactly
`["branches","show","diffstat","status"]`; `outcome` is `first-fatal` or `all-succeeded`;
`operationCount` is integer 1..4 and equals `attempts.length`; `successorAfterFailure` is false. Attempts are the
exact ordered prefix of `plannedOperations` and each has exactly these keys in this order: `operation`, `outcome`,
`exitCode`, `failureKind`, `stderrBytes`, `stderrSha256`, `repositoryUnchanged`, `wrapperTerminal`,
`witnessesTerminal`, `guardReleased`. The last four attempt booleans are true. Attempt `outcome` is `succeeded`
or `git-fatal`. A succeeded attempt has exit 0, null `failureKind`, zero stderr bytes and
`stderrSha256:"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`, the SHA-256 of empty bytes. A
fatal attempt has integer exit code 1..4,294,967,295, integer stderr bytes 1..262,144, lowercase 64-hex SHA-256
and `failureKind` exactly one of `dubious-ownership`, `repository-not-found`, `working-directory`,
`configuration`, `index-or-object-read`, `option-or-usage`, `permission-denied`, `unknown`. `first-fatal`
requires only the final attempt to be fatal and every predecessor to succeed; `all-succeeded` requires four
succeeded attempts. Top-level `repositoryUnchanged`, `wrappersTerminal`, `witnessesTerminal`, `guardsReleased`
and `fixtureRemoved` are true; `wrapperCount` and `guardCount` equal `operationCount`; `witnessCount` equals
twice `operationCount`; and the three privacy/effect booleans are false. Any extra key, invalid order, other
null shape, nonzero success stderr or nonterminal state rejects completed publication.

A harness/instrumentation failure publishes schema
`runaai-m1-omen-git-permission-boundary-diagnostic-error/v1` with exactly these top-level keys in this order:
`schemaVersion`, `errorCode`, `stage`, `plannedOperations`, `operationCount`, `successorAfterFailure`,
`attempts`, `wrapperCount`, `witnessCount`, `guardCount`, `wrappersTerminal`, `witnessesTerminal`,
`guardsReleased`, `fixtureDisposition`, `privateValuesIncluded`. `plannedOperations` and attempt keys/value
rules are identical to the completed schema; attempts are only a validated terminal prefix and contain at most
one fatal, which may only be last. `operationCount` is integer 0..4 and counts started observer invocations;
`attempts.length` is either `operationCount` or, when the current invocation did not reach a valid terminal Git
observation, `operationCount - 1`. `wrapperCount` and `guardCount` are integers 0..`operationCount`, and
`witnessCount` is integer 0..twice `operationCount`; the three terminal fields are booleans.
`successorAfterFailure` and `privateValuesIncluded` are false. `stage` is exactly one of `preflight`,
`create-owned-repository`, `confirm-owned-git-root`, `contained-git-branches`, `contained-git-show`,
`contained-git-diffstat`, `contained-git-status`, `cleanup`, `publication`; `errorCode` is exactly one of
`diagnostic-preflight-failed`, `diagnostic-fixture-failed`, `diagnostic-observer-failed`,
`diagnostic-cleanup-failed`, `diagnostic-contract-invalid`. Cleanup uses bounded waits for every started wrapper,
witness and guard. `fixtureDisposition` is `removed` only when all started resources are proved terminal/released
and deletion is verified; if any closure is unresolved, deletion is forbidden and the fixture is `retained`.
Raw stderr, paths, PIDs, command lines, Git fields, exception text and any extra key never cross either schema.

This diagnostic gives no acceptance credit. A first fatal localizes the next RCA only to the earliest failing
verb in the fixed sequence; `all-succeeded` would establish only that the failure did not recur in this bounded sequence and would
still require a fresh full-proof admission decision. Deterministic contract/lifecycle/adversarial tests,
roadmap checks, exact-byte independent review and a source commit are mandatory before its one execution.
Acceptance remains paused.

The first independent review of this design returned NO-GO at P0=0/P1=3: it rejected resource-level
localization from overlapping verbs, found the completed schema inexact and found abnormal cleanup/error
publication underspecified. The exact verb-only claim, completed/error key sets, enums, null/bound rules,
prefix/count relationships and fail-closed fixture-retention rule above close those findings. These revised
design bytes require fresh independent review before implementation.

Fresh independent design re-review returned GO with P0=0/P1=0 and reproduced the clean diff check and 15/15
roadmap checks. No implementation or actual operation ran. A documentation-only source commit is now the
remaining gate before implementing this exact contract.
