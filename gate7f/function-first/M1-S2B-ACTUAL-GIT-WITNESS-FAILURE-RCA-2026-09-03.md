# M1-S2B actual Git witness failure RCA — 2026-09-03

Status: actual Git acceptance stopped on its first operation. This is an actual-system witness/method
failure under investigation, not a Git result failure and not a model failure. No successor Git verb,
network probe, browser, model or production route ran.

## Host-repair implementation preflight findings

### Fast-exit output overflow

- **Scope:** deterministic owned-temp contained-process preflight only; no system-drive change, Git diagnostic, browser witness, model call, or campaign retry occurred.
- **Observed failure:** the new adversarial output-overflow case produced more than the configured byte limit but could finish before the 50 ms process polling loop marked `OutputOverflow`.
- **Root cause:** `RunaContainedProcess` enforced the byte limit while the child was running, but did not re-evaluate the final aggregate byte count after both output drains completed.
- **Correction:** enforce `OutputBytes > outputLimit` again after both drains become terminal. This closes the fast-exit race while preserving bounded capture and kill-on-close job containment.
- **Resume rule:** rerun the focused preflight once after source parsing/compilation; any further failure stops this implementation stage for a new retained RCA.

### Owned-temp ACL probe cleanup

- **Scope:** disposable ACL API test directory under the current user's temporary directory; `C:\` was never targeted.
- **Observed failure:** the real `SetFileSecurityW` parent-only transition and readback completed, but the unelevated test process could not delete the fixture afterward.
- **Root cause:** the first correction restored only the parent descriptor. The child retained the deliberately restrictive inherited ACL, so unelevated recursive deletion still lacked the required child access. That ACL is correct for the eventual elevated probe but not for this unelevated owned-temp preflight.
- **Correction:** before deletion, explicitly replace both disposable child and parent ACLs with current-owner full control, then require complete removal. The test-only cleanup never targets `C:\` or another pre-existing directory. Cleanup remains a hard pass condition.

### Owned-temp ACL probe setup

- **Scope:** disposable ACL API test directory under the current user's temporary directory; the root-drive coordinator did not run.
- **Observed failure:** the corrected isolated test stopped while creating its child, before the target ACE transition.
- **Root cause:** `ConfigureProbeParent` granted the current owner read/execute before child creation and therefore implicitly depended on an elevated Administrators token. The deterministic preflight intentionally runs without that token.
- **Correction:** begin with current-owner full control inherited by the child; then `BuildProbeSetupExpected` reduces only the parent owner ACE to read/execute. This creates the required inheritance-inconsistent baseline while keeping setup and cleanup valid for the real unelevated Omen preflight.
- **Diagnostic hold:** after this correction, setup and cleanup both completed and the fixture was removed, but the aggregate semantic result remained false. Before another preflight, the record was expanded with bounded booleans for setup write, target write, restore write, parent readback and child preservation so one diagnostic run can identify the exact invariant without exposing descriptors or paths.
- **First diagnostic result:** all three target-only API calls returned success and the child remained exact, but the final parent canonical descriptor did not reproduce the theoretical setup snapshot. The next diagnostic separates immediate DACL equality from full canonical equality at setup, target and restore boundaries to determine whether Windows normalized control metadata or DACL bytes.
- **Second diagnostic result:** setup DACL bytes were exact while full canonical bytes differed; the target-add readback differed at both full canonical and raw-DACL levels; restoring from the actual stable setup snapshot was exact; the child remained exact. A final bounded comparison now separates control flags, ACL header and ordered ACE bytes before the production design can resume.
- **Final diagnostic result:** target control flags remained exact, but the ordered ACE sequence differed from the theoretical `SetEntriesInAclW` result. Exact rollback from the actual stable setup bytes and exact child preservation both passed. This proves Windows reorders the target additions and invalidates theoretical whole-descriptor equality as the post-write acceptance rule.

### Revised actual-post acceptance after review stop

The first proposed relaxation was rejected at P0=0/P1=1 because removal-and-compare alone could accept a new allow ACE before an applicable existing deny. The corrected rule is conjunctive:

1. Both pre and actual-post descriptors parse losslessly. Owner, group and control flags are byte/exact-value equal.
2. Both DACLs are Windows-canonical. Each raw ACL header has the same valid revision; zero reserved fields; `AclSize` equal to the complete header-plus-ACE byte length with no trailing bytes; and actual `AceCount = pre AceCount + 2`.
3. The additions are exactly one standard non-object `ACCESS_ALLOWED_ACE` for `S-1-15-2-1` and one for `S-1-15-2-2`: ACE type allow, flags zero, exact `0x00120088` mask, exact standard ACE length and SID payload, and no callback/object/conditional bytes.
4. Both additions are confined to the canonical explicit-allow block: after every explicit deny and before every inherited ACE. The complete DACL canonicality check also rejects any other deny/allow/inherited ordering defect.
5. Removing only those two exact target ACEs from actual post reproduces every pre-existing ACE byte-for-byte in identical relative order. No other header, count, ACE or descriptor delta is admitted.
6. A pre-write `authorized`/`prepare-started` journal may retain the theoretical planned post only as a plan and validates its exact two-ACE delta separately; it is never accepted as prepared authority. After the API returns, a successful semantic readback replaces both expected-post fields with the actual verified canonical bytes **in the same atomic, write-through `prepare-terminal` journal transition**. There is no intermediate terminal journal containing the theoretical post.
7. Every later journal load is phase-aware: `prepared`, deprovision phases and any prepared-state terminal record must revalidate the full canonical pre-to-actual-post predicate above before any state claim or write. Deprovision still requires exact current bytes equal to that revalidated stored actual post and restores exact stored pre bytes.
8. Any header, canonicality, placement, raw-target, prior-ACE, journal-write or readback mismatch enters the existing one-shot exact-pre rollback or reconciliation-required path. The aggregate prerequisite reader also requires the canonical/header/exact-target placement checks and is invoked only after exact equality to the revalidated actual journal post.
9. The disposable probe includes an applicable explicit deny ahead of its allow block, applies the same actual-post predicate, freezes its actual post only for that probe, exact-restores the actual setup baseline, proves the child exact, and requires complete cleanup.

### Static symbol spelling

- **Scope:** source-presence assertion only.
- **Observed failure:** the assertion searched for `CREATE_SUSPENDED`, while the reviewed C# constant is named `CreateSuspended` and carries the required `0x00000004` value.
- **Root cause:** test spelling did not match the source-language identifier; runtime behavior was not implicated.
- **Correction:** assert the actual identifier and retain the compiled/behavioral contained-process checks.

### Disabled-launch publication test

- **Scope:** fail-closed script-launch test with the actual gate disabled; the transition script body, Windows ACL APIs and host state did not run.
- **Observed failure:** pinned Windows PowerShell refused to load the test script under the machine's default restricted execution policy.
- **Root cause:** the test invocation omitted the explicit `-ExecutionPolicy Bypass` argument already frozen into the real source-controlled launcher.
- **Correction:** make the test use the same explicit noninteractive launch contract and then validate that exactly one schema-valid `pin-drift` record is emitted with exit 1.

### Mutex abandoned-state test lifecycle

- **Scope:** deterministic local named-mutex test only; the host transition and UAC path did not run.
- **Observed failure:** after the worker thread abandoned the mutex, `OpenExisting` reported that no named object remained.
- **Root cause:** the abandoning worker also closed the last kernel handle, so Windows destroyed the named mutex before the assertion could observe its abandoned state.
- **Correction:** retain an unowned anchor handle while the worker acquires and abandons through a second handle; assert `AbandonedMutexException` on the anchor and release it only in that exception path.

### Identity-guard junction cleanup

- **Scope:** an owned junction and directory tree under the current user's temporary directory; no protected or production path ran.
- **Observed failure:** recursive parent deletion refused at the junction boundary after all identity assertions completed.
- **Root cause:** the fixture cleanup asked `Directory.Delete(..., recursive:true)` to process a tree that still contained the deliberately rejected junction.
- **Correction:** delete the exact owned junction entry non-recursively first, then recursively remove only the already-validated random fixture parent and require complete removal.

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
Before `branches` it captures one immutable repository-tree baseline. Before and after every operation, and once
again after the final attempted operation, the tree digest must equal that same baseline; no later operation may
rebase equality after an unwitnessed gap. Each operation must also prove all operation-owned resources terminal
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
observation, `operationCount - 1`. `wrapperCount` and `guardCount` are integers from `attempts.length` through
`operationCount`, and `witnessCount` is integer from twice `attempts.length` through twice `operationCount`;
the three terminal fields are booleans. If the attempt prefix ends in `git-fatal`, `operationCount` must equal
`attempts.length`; a larger count would prove an invalid successor started after failure and rejects publication.
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

Commit `67012ca` sealed the approved design. The model-free implementation adds the exact completed/error
contract, a distinct CLI entry, the ordered fail-closed mode and adversarial/source contract tests. The first
implementation review returned NO-GO at P0=0/P1=3 because an error record could conceal a successor after a
fatal, per-operation digest rebasing left inter-operation gaps unprotected, and the coordinator was checked only
as source text. The correction requires fatal prefixes to consume the full operation count, uses one immutable
baseline before/after every operation and at finalization, and executes a pure coordinator through every fatal
position, observer interruption, mutation gap, partial resource startup and retained-cleanup publication. The
focused Omen suite now passes 44/44 and six changed-file syntax checks pass. No actual operation ran. Roadmap/
diff checks and fresh independent exact-byte implementation re-review remain mandatory before source commit.

Fresh independent implementation re-review returned GO with P0=0/P1=0 and independently reproduced 44/44
focused checks, six syntax checks, 15/15 roadmap checks and the clean diff. No actual operation ran. A source
commit is now the sole remaining gate before exactly one permission-boundary diagnostic execution.

## Permission-boundary earliest-verb result

Commit `acd2eb8` sealed the reviewed diagnostic implementation. Its one permitted actual execution stopped at
the first planned verb, `branches`; `show`, `diffstat` and `status` did not start. The completed record was
`outcome:"first-fatal"`, operationCount 1, exit 128, `failureKind:"permission-denied"`, stderrBytes 50 and
stderr SHA-256 `25796725b6f5b304af0f76f2361e36b924b4a4e74bbe8b36887a1af9d84b329a`. The single attempt and top-level
record both proved the repository unchanged; one wrapper and guard and two witnesses were terminal/released;
the fixture was removed; and successor/private-value/production-change/model-call booleans were false. A
separate read-only postcheck returned `ownedRoots:0` and `matchingHelpers:0`.

This is the same exit/category/byte/hash tuple produced by the earlier single `status`, now on the narrower
`for-each-ref` branches verb. The deterministic native equivalence gate executes the same pinned Git binary,
argv shapes and runtime cwd outside MXC on a separate deterministic repository and passes all five public verbs
without stderr or repository change. That contrast makes an MXC/AppContainer visibility or containment/fixture
interaction the leading hypothesis, but it does not exclude fixture-specific repository/configuration behavior
and does not prove the denied resource. Git runtime/config, common repository metadata and other process
prerequisites remain possible. Adding a broad user/profile/system root is not an acceptable fix.

Acceptance remains stopped. The next method must use the pinned SDK's deny-and-record capability in `block`
mode against exactly one `branches` operation so the access remains denied while a disposable private report is
classified into fixed resource categories. The design must keep ETL retention false, place output only in an
owned disposable directory, publish no path/text/PID and remove the report with the fixture after bounded
terminal proof. Its exact report parser, privacy contract, support preflight, lifecycle and public schema require
deterministic adversarial tests, independent review and a source commit before one execution. No further actual
Git, full proof, browser, network, model or production operation is authorized from this result.

The first independent review of this result/RCA returned NO-GO at P0=0/P1=1 because the native equivalence gate
uses a separate fixture and therefore could not prove the stated MXC causal class. The bounded comparison and
leading-hypothesis wording above closes that overclaim. Fresh review remains required before commit.

Fresh independent re-review returned GO with P0=0/P1=0 and reproduced the clean diff and 15/15 roadmap checks.
No actual operation ran during review.

## Host-prerequisite root cause and correction design

The installed Microsoft-signed `wxc-host-prep.exe` is version 0.8.0, SHA-256
`a9b8b14a11a1c5888641297c26abca547c2afa4435085c03ccfebd1deface310`. The pinned SDK documentation requires
AppContainer access preparation for both the Windows null device and the system-drive root. One read-only vendor
`verify-null-device` returned exit 0, proving that descriptor matches. An aggregate-only ACL readback of `C:\`
then found neither required non-inheriting read-attribute grant: `ALL APPLICATION PACKAGES` (`S-1-15-2-1`) and
`ALL RESTRICTED APPLICATION PACKAGES` (`S-1-15-2-2`) were both false. The current token is not elevated.

This confirms a host-readiness defect that the RunaAI preflight omitted. Microsoft documents that AppContainer
processes can fail with `ERROR_ACCESS_DENIED` during startup when these system-drive grants are absent. That is a
sufficient reason to reject the host as ready and is the leading cause of the Git fatal, but the aggregate public
record still does not prove which Git access produced the exact 50-byte line. The previously proposed denial-
capture run is paused: a known missing prerequisite must be corrected and verified first, avoiding another
unnecessary diagnostic and its additional ETW/WPR support risk.

Freeze the correction as follows before changing the host:

1. Pin the signed 0.8.0 host-prep binary, a dedicated aggregate-only prerequisite reader and the privileged
   transition coordinator, with each path and SHA-256 in the release manifest. The reader validates exactly the
   two system-drive SID/right/non-inheritance tuples with no conflicting explicit ACE for either target SID and invokes only the
   pinned host-prep binary with `verify-null-device` and no optional flags. A completed record has keys in this exact order:
   `schemaVersion`, `outcome`, `systemDrivePrepared`, `nullDevicePrepared`, `ready`,
   `privateValuesIncluded`. The literals are `schemaVersion:"runa-omen-host-prerequisites/v1"` and
   `outcome:"completed"`; the next three values are booleans, `ready` must equal the conjunction of the two
   prepared booleans, and `privateValuesIncluded` must be false.
2. A reader error has keys in this exact order: `schemaVersion`, `outcome`, `stage`, `code`, `childExitCode`,
   `childOutputBytes`, `privateValuesIncluded`. Its schema literal is the same, `outcome` is `error`, `stage` is
   one of `pins`, `token`, `system-drive`, `null-device` or `result`; `code` is one of `pin-invalid`, `pin-drift`,
   `token-not-elevated`, `acl-read-failed`, `acl-shape-invalid`, `child-start-failed`, `child-timeout`,
   `child-exit-invalid`, `child-output-unexpected`, `child-terminal-unresolved` or `result-invalid`.
   Stage/code pairs are exact: pins permits pin-invalid or pin-drift; token permits token-not-elevated;
   system-drive permits acl-read-failed or acl-shape-invalid; null-device permits child-start-failed,
   child-timeout, child-exit-invalid, child-output-unexpected or child-terminal-unresolved; result permits only
   result-invalid. `childExitCode` is null before child start, on start failure or unresolved termination, and
   otherwise is the terminal child's normalized unsigned 32-bit value from 0 through 4294967295;
   `childOutputBytes` is null before child start and otherwise an integer from 0 through 8192. Raw child output
   is never parsed or published and cannot affect the readiness decision; bounded unstructured status output is
   captured privately and discarded. Crossing the 8192-byte combined stdout/stderr bound terminates the child and
   produces `child-output-unexpected`; a fresh kill-on-close, non-breakaway job must prove terminal/no-survivor
   status within five seconds or the fixed error is `child-terminal-unresolved`. The child timeout is 30 seconds.
   Exit 0 means null prepared, exit 1 means null not prepared, and every other terminal exit produces
   `child-exit-invalid`. Actual use requires an elevated token and otherwise returns `token-not-elevated`; the
   post-preparation read executes inside the already elevated coordinator, so it creates no second UAC prompt.
3. Unit/adversarial tests exercise exact key order/literals, conjunction and false-private invariants, every fixed
   error, missing/extra/elevated/unexpected ACE shapes, null-device exits 0/1/other, timeout/output bounds, binary/
   script pin drift and raw ACL/path/text rejection. Coordinator tests additionally cover every phase and crash
   boundary; mutex busy, abandoned and wrong-security paths; malformed, oversized, truncated, duplicate-key,
   reparse, hardlink and path-identity journal cases; job assignment before process resume; every terminal and
   no-survivor result; all pre/post/partial descriptor branches; every phase-write and journal-delete failure;
   rollback/deprovision exit, timeout and output outcomes; every exact public matrix and redaction invariant; and
   proof that each stopped path launches zero successor writers. These are deterministic preflight checks, not
   actual acceptance. The pinned PowerShell parser must pass under Windows PowerShell 5.1. No Git/model/browser/
   network operation may run from these tests or the reader.
4. A separate privileged transition coordinator owns the one preparation. Immediately before mutation it must
   revalidate the exact pinned executable/hash and argv, read the complete canonical system-drive owner/group/
   DACL, and require the reviewed baseline shape with both target ACEs absent; any partial or drifted starting
   state stops without mutation. The coordinator first acquires the zero-wait exclusive named mutex
   `Global\RunaAI-SystemDrivePreparation-v1`, created with protected DACL
   `D:P(A;;GA;;;SY)(A;;GA;;;BA)`, and holds it until every child and verification handle is terminal. Busy mutex
   acquisition stops; `WAIT_ABANDONED` always publishes reconciliation-required and starts no child.
   It opens `C:\ProgramData`, `RunaAI` and `host-state` by native no-reparse directory handles, rejects reparse
   points/aliases or any parent identity change, and creates the journal with create-new/no-replacement semantics;
   the temporary and final files must each have one hard link and remain on the held parent volume. It writes the
   full pre-state, its digest, transaction id, expected post-state and phase to
   `C:\ProgramData\RunaAI\host-state\system-drive-preparation-v1.json`, flushes file and directory metadata, then
   atomically renames without replacement before starting the child. The fixed journal file and directories use
   protected, non-inheriting DACLs granting full control only to local SYSTEM and BUILTIN Administrators. An
   existing journal must pass the same no-reparse/single-link/path-identity checks and validate exactly. Journal
   JSON is at most 524288 UTF-8 bytes, rejects BOM, duplicate/unknown/missing keys and trailing data, and has exact
   ordered keys `schemaVersion`, `transactionId`, `operation`, `phase`, `hostPrepSha256`, `prepareArgv`,
   `unprepareArgv`, `preDescriptorBase64`, `preDescriptorSha256`, `expectedPostDescriptorBase64`,
   `expectedPostDescriptorSha256`, `prepareAttempt`, `rollbackAttempt`, `deprovisionAttempt`, `systemDriveState`,
   `rollbackVerified`. The schema literal is `runa-omen-system-drive-journal/v1`; transactionId is 32 lowercase
   hexadecimal characters from 16 cryptographic random bytes; operation is prepare or deprovision; hashes are 64
   lowercase hex characters. The argv arrays are exactly `["prepare-system-drive","--target","C:\\"]` and
   `["unprepare-system-drive","--target","C:\\"]`. Each attempt has exact ordered keys `started`, `terminal`,
   `exitCode`, `outputBytes`: the first two are booleans, exitCode is null unless terminal and otherwise uint32,
   and outputBytes is null unless started and otherwise 0..8192. Descriptor Base64 decodes to 1..131072 bytes.
   Its canonical binary digest domain is UTF-8 `runa-omen-system-drive-descriptor/v1` plus NUL plus: length-prefixed
   owner SID bytes, group SID bytes, uint32 DACL control flags, ACE count 0..512, then every length-prefixed raw ACE
   byte sequence sorted lexicographically; duplicate ACEs remain duplicated. Expected-post bytes are exactly that
   pre-state plus the two target raw allow ACEs before sorting. Each descriptor SHA-256 covers those domain bytes.
   The only
   stable reusable phase is `prepared`, whose current descriptor must equal its expected post-state and which may
   be consumed only by an explicit `deprovision` operation. Every other preexisting phase requires owner
   reconciliation and starts no child. Phases are exactly `authorized`, `prepare-started`, `prepare-terminal`,
   `rollback-started`, `rollback-terminal`, `prepared`, `deprovision-started` and `deprovision-terminal`; each
   transition is an atomic flushed journal replacement. `prepare-started`, `rollback-started` or
   `deprovision-started` is durably committed before its corresponding child launch. Authorized permits prepare
   operation, all attempts false/null, unprepared state and rollback-unverified. Prepare-started changes only its
   attempt to started/nonterminal and state unknown. Prepare-terminal requires that attempt terminal with exit/
   output and equality-derived state. Rollback-started additionally requires terminal prepare, rollback started/
   nonterminal, state unknown and rollback-unverified. Rollback-terminal requires terminal prepare and rollback
   attempts plus equality-derived state and sets rollbackVerified exactly when state is unprepared. Prepared
   requires terminal exit-0 in-bounds prepare, exact prepared state, no rollback/deprovision and rollback-unverified.
   Deprovision-started requires the prior prepared invariants, operation deprovision, and a started/nonterminal
   deprovision attempt with state unknown. Deprovision-terminal additionally requires terminal exit/output and an
   equality-derived state. A phase replacement failure before a writer launch starts no child; after any writer
   may have started it publishes reconciliation-required and starts no successor writer. This deliberately sacrifices
   automatic crash recovery to preserve at-most-once writes and the no-blind-retry rule. The exact preparation
   child is the pinned executable with `prepare-system-drive --target C:\`, one attempt, 30-second timeout and
   8192-byte combined-output cap. Output remains private and is never published.
5. After the terminal preparation child, the coordinator rereads the complete canonical owner/group/DACL before
   deciding on rollback. Exact structural equality to the journaled pre-state means no ACL change occurred: it
   publishes `prepare-failed-no-change`, retains the journal for RCA and starts no rollback writer. Exact equality
   to expected post-state after exit 0 is success; owner, group, DACL flags, ACE order after canonicalization and
   every other ACE must be unchanged except the two documented additions. A nonzero exit with exact post-state or
   any partial/unknown descriptor starts at most one bounded `unprepare-system-drive --target C:\`; an exit-0
   descriptor mismatch does the same. Rollback then requires full canonical equality to the journaled pre-state.
   Every privileged child runs inside a fresh non-breakaway Windows job
   with kill-on-close. On timeout or output overflow the coordinator closes the job, waits at most five seconds
   for the process handle to signal and the job's active-process count to reach zero, and only then may inspect
   or roll back. If terminal/no-survivor proof is unresolved, it retains the journal and stops without starting a
   second ACL writer. Git stays prohibited. If equality is not restored, retain the protected journal and stop
   for owner reconciliation; do not retry or apply a broader ACL rewrite.
6. The coordinator's only public record has exact ordered keys `schemaVersion`, `operation`, `outcome`, `stage`,
   `code`, `systemDriveState`, `rollbackAttempted`, `rollbackVerified`, `journalState`,
   `privateValuesIncluded`. `schemaVersion` is `runa-omen-system-drive-preparation/v1`; `operation` is `prepare` or
   `deprovision`; `outcome` is `prepared`, `restored`, `deprovisioned` or `error`; `stage` is `preflight`,
   `prepare`, `verify`, `rollback`, `deprovision` or `complete`; `systemDriveState` is `prepared`, `unprepared` or
   `unknown`; `journalState` is `absent`, `retained`, `removed` or `unknown`; the two rollback fields and
   `privateValuesIncluded` are booleans, with the last always false. `systemDriveState` may be prepared only after
   exact expected-post equality, unprepared only after exact pre-state equality, and otherwise is unknown.
   Codes are exactly `prepared`, `prepare-failed-no-change`, `prepare-failed-restored`,
   `post-state-mismatch-restored`, `deprovisioned`, `precondition-failed`, `pin-drift`, `journal-failed`,
   `reconciliation-required`, `child-start-failed`, `child-terminal-unresolved`, `journal-removal-failed`,
   `rollback-failed`, `deprovision-failed-no-change`, `deprovision-failed-prepared` or `result-invalid`.
7. The valid terminal matrices are frozen. Prepare success is prepare/prepared/complete/prepared, state prepared,
   rollback false/false, journal retained. Unchanged failure is prepare/error/prepare/prepare-failed-no-change,
   state unprepared, rollback false/false, journal retained. Verified rollback is prepare/restored/complete with
   code prepare-failed-restored or post-state-mismatch-restored, state unprepared, rollback true/true, journal
   removed. Prepare journal-removal failure is prepare/error/rollback/journal-removal-failed, state unprepared,
   rollback true/true, journal retained. Deprovision success is deprovision/deprovisioned/complete/deprovisioned,
   state unprepared, rollback false/false, journal removed. Deprovision journal-removal failure is deprovision/
   error/deprovision/journal-removal-failed, state unprepared, rollback false/false, journal retained. For either
   operation, pin drift is error/preflight/pin-drift with state unknown and journal absent; precondition failure is
   error/preflight/precondition-failed with equality-derived state and journal absent; journal failure is error/
   preflight/journal-failed with state unprepared for prepare or prepared for deprovision and journal unknown;
   reconciliation is error/preflight/reconciliation-required with equality-derived state and journal retained or
   unknown. Prepare child-start failure is error/prepare/child-start-failed with state unprepared and journal
   retained; deprovision child-start failure is error/deprovision/child-start-failed with state prepared and journal
   retained. Child-terminal-unresolved for the prepare or deprovision child uses that matching stage, state
   unknown, rollback false/false and journal retained; unresolved rollback is prepare/error/rollback/
   child-terminal-unresolved with state unknown, rollback true/false and journal retained. A terminal deprovision
   child that is not exit 0 and in bounds uses
   deprovision/error/deprovision/deprovision-failed-no-change when exact pre-state is observed, or deprovision/
   error/deprovision/deprovision-failed-prepared when exact post-state remains; both use rollback false/false and
   journal retained. Any other deprovision descriptor uses deprovision/error/complete/reconciliation-required,
   unknown state, rollback false/false and retained journal. Rollback
   failure is prepare/error/rollback/rollback-failed, rollback true/false, journal retained and state prepared only
   on exact post equality, otherwise unknown. The sole canonical fallback per known operation is operation/error/
   complete/result-invalid, state unknown, rollback false/false, journal unknown, private false. Every other tuple
   is rejected. Reconciliation-required always uses stage complete; state is unknown unless exact pre/post equality
   was read after a terminal child, rollback flags reflect only a durably started and terminal verified rollback,
   and journal state is retained or unknown. `rollbackVerified` can be true only when `rollbackAttempted` is true
   and full pre-state equality passed. No path, ACL, SDDL, SID, account, process id, raw output, transaction id or
   descriptor digest may enter the public
   record.
8. On `prepared`, the prerequisite intentionally remains installed because MXC requires it. The protected journal
   remains owned by the RunaAI host deployment until MXC is deprovisioned. Removal must use this same reviewed
   coordinator: it first requires the current complete canonical descriptor to match the journaled expected
   post-state, atomically commits `deprovision-started`, invokes one bounded vendor
   `unprepare-system-drive --target C:\`, proves terminal/no-survivor status before descriptor inspection, atomically
   commits `deprovision-terminal`, then requires exit 0, output within bounds and exact equality with the journaled
   pre-state before deleting the journal. A terminal nonzero/timeout/output failure with exact pre-state publishes
   deprovision-failed-no-change and retains the journal; exact post-state publishes deprovision-failed-prepared;
   any other state requires owner reconciliation. Unresolved termination publishes child-terminal-unresolved and
   performs no read/delete. Drift or failed restoration retains the journal and stops for owner
   reconciliation. The vendor command is therefore a bounded rollback mechanism, not presumed exact without the
   full-descriptor comparison.
9. Independent exact-byte review and a source commit gate remediation. Then run the sealed coordinator once under
   an explicitly elevated owner token. The reader executes inside that same elevated coordinator after transition
   verification, so the entire operation requires one UAC prompt, and emits its separate aggregate record. If the
   transition is not `prepared`, either readiness boolean is false, or either record errors, stop with retained
   RCA; do not execute Git. If both readiness booleans are true, source-record that host evidence and admit exactly
   one post-repair execution of sealed commit `acd2eb8`, resuming at `branches`.
10. Any fatal/error stops again. `all-succeeded` proves only the four bounded read-only verbs on the disposable
   actual host fixture and requires a separate admission decision before the full Omen proof. Network, browser,
   model and production remain prohibited throughout this correction.

The direct vendor remediation requires UAC because the current token is not elevated. User interaction is not
needed until the reviewed source checkpoint is ready and the single elevation prompt must be accepted. No host
ACL has been changed yet.

The first independent review of this host-prerequisite correction returned NO-GO at P0=0/P1=3: the reader
schemas were not exact enough, the privileged change lacked an immediate drift check and full-descriptor delta
proof, and rollback plus durable ownership were underspecified. A later re-review found three remaining crash,
unnecessary-rollback and public-lifecycle representation gaps; items 1 through 10 now also freeze conservative
at-most-once recovery, state-first rollback admission and exact prepare/deprovision/journal-cleanup matrices.
Fresh independent design re-review remains required before implementation.

## Upstream host-prep safety finding and superseding correction

The order-preservation check exposed a separate upstream blocker. Microsoft issue 648, still open and labeled a
high-impact Windows bug on 2026-09-03, reports that `prepare-system-drive` and `unprepare-system-drive` can cause
`SetNamedSecurityInfoW` to normalize descendant ACLs recursively. Its proposed target-only `SetFileSecurityW` fix
in pull request 649 was closed on 2026-08-28 pending Microsoft discussion and was not merged. The installed 0.8.0
binary's own documented implementation still names `SetNamedSecurityInfoW`. Therefore the preceding vendor
system-drive mutation design is retained only as rejected design history: the installed vendor prepare/unprepare
commands must not run on `C:\`.

The following design supersedes items 4 through 10 above:

1. The Microsoft-signed host-prep binary remains pinned solely for the read-only elevated
   `verify-null-device` check. A new pinned RunaAI transition script owns system-drive preparation and removal.
   Its only root write API is `SetFileSecurityW` with exactly `DACL_SECURITY_INFORMATION`; Microsoft documents
   that security applied to a directory by this API is not inherited by its children. Source and static tests
   reject `SetNamedSecurityInfo`, `SetSecurityInfo`, `Set-Acl`, `icacls`, recursion and vendor system-drive verbs.
   Before any probe DACL call, the elevated script rehashes its exact source against the release pin, validates
   that its loaded binding resolves only Advapi32 `SetFileSecurityW`/`SetEntriesInAclW` with the frozen constants,
   and opens the literal protected probe root through held no-reparse handles with volume/file/final-path identity
   checks. Pin, binding, constant or path drift stops before any write.
2. Before touching `C:\`, the elevated script performs one actual target-only API probe on a newly created,
   access-restricted parent/child tree beneath the protected host-state directory. It first gives the parent an
   inheritable allow ACE and creates the child so that ACE is inherited. It captures both raw DACLs before changing
   the parent's inheritable ACE through `SetFileSecurityW`, then requires the parent's exact planned raw DACL plus
   identical owner/group and permits only DACL auto-inheritance control-bit normalization; the child's exact before
   bytes remain unchanged. Only that proof establishes the
   deliberately older inherited child ACE and the inheritance-inconsistent shape reported upstream. It then
   captures that proven inconsistent baseline and adds the
   two target ACEs only to the parent through the exact production in-memory merge and `SetFileSecurityW` path,
   requires parent-after to pass the reviewed canonical/header/exact-target/prior-ACE relation and child-after to
   equal child-before byte-for-byte, restores the parent from the captured actual setup bytes, proves both parent
   and child equal their captured baselines, and removes the
   tree. Cleanup failure retains the owned protected tree for reconciliation and stops before the system-drive
   journal or root write. Any no-op, wrong parent bytes, child normalization, restoration or cleanup failure is a
   failed probe. This is an actual Windows API/hardware preflight, not acceptance evidence for Git or a model.
3. Descriptor authority is order-preserving. Canonical bytes are UTF-8
   `runa-omen-system-drive-descriptor/v3`, NUL, one-byte DACL-present and one-byte DACL-null flags, uint32-LE DACL
   control flags, uint32-LE owner-SID length plus bytes, uint32-LE group-SID length plus bytes, then uint32-LE raw
   ACL length and the complete raw ACL header plus ACE byte sequence. The raw header retains revision, reserved
   fields, `AclSize`, `AceCount` and absence of trailing bytes for restart-time validation.
   No sorting occurs. Planned-post DACL bytes are generated in memory by `SetEntriesInAclW` against the exact
   pre-DACL using two `GRANT_ACCESS` entries in fixed order S-1-15-2-1 then S-1-15-2-2, mask 0x00120088 and
   inheritance 0. The returned ACL's exact sequence is authoritative; deleting exactly those two target ACEs from
   it must reproduce every pre-existing ACE byte-for-byte and ordinal-for-ordinal. The theoretical result is plan-
   only because Windows can reorder the additions on write. Actual post acceptance uses the reviewed canonical
   deny/allow/inherited placement, exact header and target-ACE shape and prior-ACE preservation rule; the verified
   actual post replaces the planned fields atomically in the terminal journal write.
4. The protected journal is version 2 and at most 524288 UTF-8 bytes. It rejects BOM, duplicate/unknown/missing
   keys, trailing data and decoded descriptors above 131072 bytes. Exact ordered keys are `schemaVersion`,
   `transactionId`, `operation`, `phase`, `transitionScriptSha256`, `writeApi`, `target`,
   `preDescriptorBase64`, `preDescriptorSha256`, `expectedPostDescriptorBase64`,
   `expectedPostDescriptorSha256`, `prepareAttempt`, `rollbackAttempt`, `deprovisionAttempt`,
   `systemDriveState`, `rollbackVerified`. Literals are schema `runa-omen-system-drive-journal/v2`, API
   `SetFileSecurityW:DACL_SECURITY_INFORMATION` and target `C:\`; transaction and digest formats and the exact
   path/mutex/no-reparse/single-link/atomic-flush controls remain as frozen above. Each attempt has ordered keys
   `started`, `terminal`, `win32Success`, `win32Error`: the first two are booleans, win32Success is null until
   terminal and then boolean, and win32Error is null before terminal or on success and otherwise uint32.
5. After the probe and immediately before publishing `authorized`, the script rehashes its own exact pinned bytes,
   revalidates the write API constant and literal target, opens the actual `C:\` root with a native no-reparse
   handle, and binds its volume serial, file id and final root path while holding that handle. It rereads complete
   owner/group/DACL bytes, requires both target trustees absent with no conflicting explicit target ACE, builds
   the reversible expected post through the exact in-memory merge, and proves removal of the two inserted ACEs
   reproduces the complete ordered pre-DACL. The journal prestate comes only from this read. Immediately after
   durably publishing `prepare-started` and before the write call, it rechecks script hash, held root identity and
   exact current descriptor equality to journal prestate; any drift stops without the API call. Immediately after
   the call it rechecks held root identity before accepting any descriptor readback. A name/identity or post-state
   mismatch can never be success.
6. Version-2 phases remain `authorized`, `prepare-started`, `prepare-terminal`, `rollback-started`,
   `rollback-terminal`, `prepared`, `deprovision-started`, `deprovision-terminal`. The same at-most-once rules
   apply: the matching started phase is durably committed before each API call; the terminal phase is committed
   after it returns and full readback completes; abandoned ownership or any preexisting nonstable phase starts no
   writer. Prepare-started/rollback-started/deprovision-started each make state unknown until exact readback.
   Prepared is the only stable retained phase and can be consumed only by explicit deprovision.
7. The public record schema is `runa-omen-system-drive-transition/v2` with exact ordered keys `schemaVersion`,
   `operation`, `outcome`, `stage`, `code`, `systemDriveState`, `rollbackAttempted`, `rollbackVerified`,
   `journalState`, `targetOnlyProbePassed`, `privateValuesIncluded`. The enums and invariants above remain, with
   targetOnlyProbePassed and privateValuesIncluded boolean and the latter always false. Before-probe failures use
   false; every path reaching the root journal/write requires true. Codes are exactly `prepared`,
   `prepare-failed-no-change`, `prepare-failed-restored`, `post-state-mismatch-restored`, `deprovisioned`,
   `deprovision-failed-unprepared`, `deprovision-failed-prepared`, `precondition-failed`, `pin-drift`,
   `probe-failed`, `probe-cleanup-failed`, `journal-failed`, `journal-removal-failed`,
   `reconciliation-required`, `rollback-failed` or `result-invalid`. An API false/GetLastError result or API-
   success readback mismatch with exact pre-state launches no
   rollback and uses prepare/error/prepare/prepare-failed-no-change. Any other prepare state admits exactly one
   journaled root-only rollback; exact restoration uses prepare/restored/complete with code prepare-failed-restored
   or post-state-mismatch-restored. Unknown restoration uses prepare/error/rollback/rollback-failed. The canonical
   result-invalid tuple uses the known operation, error/complete/result-invalid, unknown state, rollback false/
   false, journal unknown, probe false and private false.
8. The complete v2 public matrix is below; `/` separates operation/outcome/stage/code. Every row has
   `privateValuesIncluded:false`, and every combination not listed is rejected.

   | tuple | state | rollback | journal | probe |
   | --- | --- | --- | --- | --- |
   | prepare/error/preflight/probe-failed | unknown | false/false | absent | false |
   | prepare/error/preflight/probe-cleanup-failed | unknown | false/false | absent | false |
   | prepare/error/preflight/pin-drift | unknown | false/false | absent | false |
   | prepare/error/preflight/pin-drift | unknown | false/false | absent | true |
   | prepare/error/preflight/precondition-failed | unknown | false/false | absent | false |
   | prepare/error/preflight/precondition-failed | unknown | false/false | absent | true |
   | prepare/error/preflight/journal-failed | unprepared | false/false | unknown | true |
   | prepare/error/prepare/prepare-failed-no-change | unprepared | false/false | retained | true |
   | prepare/prepared/complete/prepared | prepared | false/false | retained | true |
   | prepare/restored/complete/prepare-failed-restored | unprepared | true/true | removed | true |
   | prepare/restored/complete/post-state-mismatch-restored | unprepared | true/true | removed | true |
   | prepare/error/rollback/journal-removal-failed | unprepared | true/true | retained | true |
   | prepare/error/rollback/rollback-failed | unknown | true/false | retained | true |
   | prepare/error/complete/reconciliation-required | unknown | false/false | retained | true |
   | prepare/error/complete/reconciliation-required | unknown | false/false | unknown | true |
   | prepare/error/complete/reconciliation-required | unknown | false/false | unknown | false |
   | prepare/error/complete/reconciliation-required | unknown | true/false | retained | true |
   | prepare/error/complete/result-invalid | unknown | false/false | unknown | false |
   | deprovision/error/preflight/pin-drift | unknown | false/false | unknown | false |
   | deprovision/error/preflight/pin-drift | prepared | false/false | retained | true |
   | deprovision/error/preflight/precondition-failed | unknown | false/false | retained or unknown | false |
   | deprovision/error/preflight/probe-failed | prepared | false/false | retained | false |
   | deprovision/error/preflight/probe-cleanup-failed | prepared | false/false | retained | false |
   | deprovision/error/preflight/journal-failed | prepared | false/false | unknown | true |
   | deprovision/deprovisioned/complete/deprovisioned | unprepared | false/false | removed | true |
   | deprovision/error/deprovision/deprovision-failed-unprepared | unprepared | false/false | retained | true |
   | deprovision/error/deprovision/deprovision-failed-prepared | prepared | false/false | retained | true |
   | deprovision/error/deprovision/journal-removal-failed | unprepared | false/false | retained | true |
   | deprovision/error/complete/reconciliation-required | unknown | false/false | retained | true |
   | deprovision/error/complete/reconciliation-required | unknown | false/false | retained | false |
   | deprovision/error/complete/reconciliation-required | unknown | false/false | unknown | false |
   | deprovision/error/complete/result-invalid | unknown | false/false | unknown | false |

   `state` is `systemDriveState`; rollback is attempted/verified; journal is `journalState`; probe is
   `targetOnlyProbePassed`. The repeated pin-drift rows are the exact before-probe false and after-probe true
   variants and start no later write. The repeated reconciliation rows are the only permitted variants: prepare uses
   false/false with retained or unknown before rollback starts and true/false with retained after rollback starts;
   deprovision uses retained/probe true after probe or retained-or-unknown/probe false before it. `journal-failed`
   means a phase publication failed before the corresponding root
   API began. Any phase failure after an API may have started maps only to reconciliation-required. API false uses
   prepare-failed-no-change or prepare-failed-restored according to readback; API success with mismatched readback
   uses prepare-failed-no-change or post-state-mismatch-restored. This distinguishes API return failure, semantic
   mismatch, phase failure and restoration failure without publishing Win32 error text.
9. Deprovision requires the stable prepared journal and exact expected-post readback, commits its started phase,
   calls root-only `SetFileSecurityW` with the exact journaled pre-DACL, commits terminal readback and requires API
   success plus exact pre-state before journal removal. API failure with exact pre-state is deprovision/error/
   deprovision/deprovision-failed-unprepared; exact post-state is deprovision/error/deprovision/
   deprovision-failed-prepared; any other state is reconciliation-required. Journal-removal failure remains a
   truthful error with exact state and retained journal. No vendor system-drive command or descendant write runs.
10. The deterministic/adversarial coordinator matrix in item 3 above applies to version 2, replacing child-job
   cases with every Win32 success/error/crash boundary, exact SetEntriesInAcl order preservation, target-only probe
   failure/cleanup and proof that every stop launches zero later root writes. Independent exact-byte review and a
   source commit still gate one elevated execution. After `prepared`, the same elevated process runs the sealed
   aggregate prerequisite reader; only ready=true admits one sealed `acd2eb8` Git diagnostic from `branches`.

This upstream safety discovery invalidates the earlier assumption that the vendor command affected only the root.
No host ACL or descendant ACL has been changed, and the vendor system-drive mutation is now explicitly prohibited.

Fresh independent review of the superseding version-2 design returned GO with P0=0/P1=0. It reproduced the clean
diff and 15/15 roadmap checks and confirmed the pre-probe trust gate, inheritance-inconsistent actual API probe,
immediate root binding/revalidation, order-preserving descriptor authority, durable at-most-once journal, complete
public matrix, exact direct restore/deprovision and vendor-command prohibition. No actual operation ran. The design
may proceed to implementation; tests, fresh exact-byte implementation review and a source commit remain mandatory
before the single elevated execution.

## Exact-byte implementation review and identity-guard preflight stop

The first independent exact-byte implementation review returned NO-GO with P0=0/P1=9. It found invalid mutex
type namespaces and abandoned-owner handling; incomplete protected-path and identity enforcement; a probe identity
gap; a false-green deprovision branch when the native API returned false but readback matched prestate; no immediate
prewrite rollback gate; journal schema/path drift; incomplete JavaScript journal semantics plus acceptance of a
negative Win32 error; an invalid post-probe pin-drift tuple; and no complete coordinator failure/crash matrix while
the living status still described an earlier checkpoint. No actual system mutation ran. The implementation was
held locally and each finding was corrected before any attempt to resume the actual witness.

The first post-correction identity-guard smoke run then stopped the sequence with this retained aggregate result:

`{"schemaVersion":"runa-omen-identity-guard-smoke/v1","passed":false,"exactPath":false,"renameBlocked":false,"hardlinkRejected":true,"reparseRejected":true,"fixtureRemoved":true,"privateValuesIncluded":false}`

This is a test/guard implementation failure, not a host-preparation, Git, browser, model or product result. The
temporary fixture was removed and no protected path was touched. The root causes are:

1. The smoke test constructed the expected extended Win32 path as `\?\...` instead of the required `\\?\...`.
   That guarantees `exactPath:false` even when `GetFinalPathNameByHandleW` returns the correct path.
2. The test assumed that omitting `FILE_SHARE_DELETE` from the held directory handle would always make a separate
   path-based `Directory.Move` fail. The actual Omen Windows/.NET operation completed, so that assumption is not a
   valid security invariant on the deployed stack. Microsoft documents the normal share-delete rule, but the
   guard must accept only behavior it verifies on the actual host rather than convert that documentation into a
   false test oracle.
3. The existing helper already detects a name swap by reopening the literal path and comparing volume serial,
   file ID, final path, reparse status and link count, but the smoke test treated rename prevention as the proof.
   The contract therefore conflated prevention with detection and failed without identifying which property was
   authoritative.

The corrected design is fail-closed and does not depend on rename blocking. The protected RunaAI and host-state
directories remain SYSTEM/Administrators-only, journal path operations remain serialized by the exact secured
mutex, and every path-based journal/probe action must be bracketed by `PathStillMatches` checks against the held
identity. The actual `C:\` root cannot be substituted through the protected state path; it is independently bound
and rechecked immediately before and after the sole root API call. The identity smoke must use the exact
`\\?\` prefix, prove that a rename (whether blocked or permitted by this Windows build) cannot remain undetected,
prove the original path fails its held identity after a successful rename, and continue to reject multi-link and
reparse-point objects. A rename being allowed is recorded as platform behavior, not treated as a passing lock
guarantee. No further test may run until this RCA/design amendment is in the working tree; the repaired identity
smoke is then the only admitted next execution. If it fails again, the sequence stops again without retrying.

That one admitted rerun passed: exact extended-path comparison, rename-change detection, hardlink rejection,
reparse rejection and cleanup were all true. `renameBlocked:false` is retained as observed platform behavior;
`renameDetected:true` is the corrected invariant. Afterward, one optional ad-hoc PowerShell parser invocation
failed before parsing because its `$` variables were expanded by the outer command shell. It made no file or
system change and is classified as an operator-command quoting error, not a source/test/product failure. It was
not retried. The repository-owned parser test, which passes argument bytes without that nested quoting path,
subsequently parsed the transition and reader successfully.

The next independent exact-byte implementation review reproduced focused Omen 62/62, roadmap 15/15 and a clean
diff, but correctly returned NO-GO at P0=0/P1=6 before execution. It found that the mutex DACL was not explicitly
protected, abandoned ownership was not released, and deprovision mutex failures could collapse to result-invalid;
temporary journal publication lacked exact temp link/path/volume identity; prepare and deprovision used only the
held-object root check rather than path rebinding immediately before their writes; JavaScript journal validation
did not reject a differently shaped explicit ACE for either target SID; a raw probe deletion exception could be
misclassified as `probe-failed`; and the coordinator matrix executed a parallel model plus source-string checks
rather than production control flow. The six-point correction gate is therefore:

1. Protect the mutex DACL against inheritance, compare its literal protected SDDL, release ownership obtained by
   `AbandonedMutexException`, and execute exact prepare/deprovision publication cases for busy, abandoned and
   wrong-security outcomes.
2. Open each temporary journal through the identity guard after its ACL is applied; prove one link, exact final
   path and the held state-directory volume before atomic rename. Prove the final journal has the same volume and
   exact final path while both state and file identities are held.
3. Run the path-binding `Assert-RunaRootIdentity` immediately before the prepare and deprovision read/API sequence,
   matching the already corrected rollback gate.
4. Make the JavaScript descriptor relation SID-aware and reject every non-exact explicit ACE for either target
   SID; add differently masked and differently flagged adversarial cases.
5. Convert every probe cleanup exception, including recursive-delete exceptions, to the exact
   `probe-cleanup-failed` code and execute retained-fixture/delete-failure behavior without touching protected or
   root paths.
6. Replace the disconnected coordinator oracle with the same production coordinator state machine imported by
   the PowerShell wrapper or execute the production coordinator through injected journal/API/identity adapters.
   The matrix must assert actual call order, root-write count, cleanup and public record for every failure/crash
   boundary.

No actual system mutation ran. The 62/62 result remains evidence for the reviewed bytes only and is superseded as
a commit gate until all six corrections, fresh tests, living-status update and another independent review pass.

The first post-review mutex smoke stopped with `aclExact:false` while busy rejection, abandoned-owner rejection
and wrong-security rejection were all true. No global production mutex, protected path or ACL was changed; the
test used a unique local kernel-object name and disposed it. The failure is limited to the literal SDDL oracle:
the protected `MutexSecurity` serialization on pinned Windows PowerShell 5.1 did not equal the initially frozen
`D:P(A;;GA;;;SY)(A;;GA;;;BA)` text. The next and only admitted action is a read-only serialization diagnostic on
a new unique local mutex containing only the public SYSTEM and Builtin Administrators SIDs. It must publish the
template and readback SDDL only, establish whether Windows reorders ACEs or omits/repositions the protection flag,
then freeze the actual exact form in both production and the smoke test. Any other failed field would require a
new stop rather than an oracle adjustment.

The first diagnostic launcher failed before creating a mutex because it ran inline through the outer PowerShell 7
host, whose `New-Object` overload binding rejected the four-argument constructor expression used successfully by
the pinned Windows PowerShell 5.1 test. Its null cleanup errors were secondary. It produced no SDDL evidence and
made no object or system change. The corrected method is a fixed script launched directly with pinned
`powershell.exe -File`, eliminating both the host mismatch and nested quoting/constructor ambiguity; it remains the
same single read-only serialization diagnostic.

The pinned-5.1 diagnostic completed once. Both template and created-object readback were exactly
`D:P(A;;0x1f0001;;;SY)(A;;0x1f0001;;;BA)`: the protected flag and ACE order were correct; Windows serializes
`MutexRights.FullControl` as the exact numeric mask `0x1f0001`, not generic-all `GA`. Production and the smoke
oracle now freeze that observed exact form. The diagnostic used a unique local name, disposed the object and
included no private identity.

The first production-path mutex publication test then stopped in the abandoned-owner fixture before invoking the
abandoned child case. The ordinary test identity created and retained the initial handle, but a worker thread used
`Mutex.OpenExisting`; the intentionally protected SYSTEM/Administrators-only DACL correctly denied that new open
with `UnauthorizedAccessException`. Busy and wrong-security subprocess cases had run, but the interrupted run
earns no gate credit. This is a fixture design error, not a production mutex failure. The corrected fixture passes
the already-authorized `Mutex` object to the worker thread, lets that thread acquire and exit without release, and
keeps the anchor handle alive. It does not broaden the ACL. The next admitted run is the corrected six-case
production-path publication test; any further failure stops again.

That corrected cross-process run also stopped and invalidated the entire fixture approach. `busyBothOperations`
was false and `abandonedOwnershipReleased` was false; wrong-security and the apparent abandoned records were true.
The cause is the same protected-object boundary at the child constructor: an ordinary child cannot obtain the
full-control handle requested by the four-argument `Mutex` constructor when an existing object permits only SYSTEM
and Administrators. Busy therefore never reached `WaitOne`. The apparent abandoned pass was a false positive:
the outer production catch published the same reconciliation tuple after handle-open denial, and no abandoned
ownership was acquired or released. No root/protected path was reached.

Cross-process ordinary-user publication is therefore rejected as an invalid oracle. The corrected design moves
the actual zero-time wait into a production C# helper that receives an already-authorized mutex handle and returns
only `acquired`, `busy` or `abandoned`; it releases ownership immediately when `AbandonedMutexException` grants
the caller ownership. The production PowerShell path opens and literal-verifies the protected global object, calls
that helper, maps busy to the operation-specific precondition tuple and abandoned to reconciliation, and only
marks the mutex held for `acquired`. The smoke uses the same production helper and the same handle across worker
threads, so it exercises real Windows mutex ownership without reopening or weakening the DACL. Exact public tuple
tests for both operations plus source wiring checks cover the two mappings. The failed cross-process fixture is
removed and must not be retried.

The first same-handle helper smoke stopped at test compilation before any mutex operation: pinned PowerShell 5.1
compiled the exact production helper into an in-memory `Add-Type` assembly, then the separate test-driver
`Add-Type` invocation could not resolve `RunaMutexWait` from that prior dynamic assembly. This is a PowerShell test
assembly-reference error, not a helper result. The corrected test compiles the exact production C# source bytes
and the test-only driver in one `Add-Type` unit, with no production test hook and no changed security. Its single
next run remains the admitted helper proof.

The one-unit compile still stopped before mutex execution because the appended test driver retained C# `using`
directives after the production source's type declarations. C# requires all such directives before types. This is
a second compile-fixture defect, with no runtime or system effect. The final mechanical correction removes those
late directives and fully qualifies the test-only `Mutex`, `Thread` and `ManualResetEventSlim` names. The exact
production source bytes remain unmodified by the fixture.

The corrected same-handle helper smoke then passed the exact protected ACL, real busy detection, real abandoned
detection with immediate ownership release, and wrong-security rejection. All six P1 corrections are now present:
the production transition calls that helper; every successful journal publication proves held temp/final file ID,
single-link/final-path and state-volume identity; prepare, rollback and deprovision each rebind the literal root
path immediately before the write; JavaScript rejects differently masked or flagged explicit target-SID ACEs;
the production cleanup helper was executed against a locked owned-temp file and proved both fixed failure detection
with retention and recovery after release; and `RunaSystemDriveCoordinator` now traces the production probe,
journal phases, root/rollback calls and removal. Production completion is rejected to `result-invalid` unless that
trace matches the public tuple. Its PowerShell matrix executed 33 success/failure/crash sequences plus invalid-order,
missing-write and wrong-completion adversaries. The disconnected JavaScript coordinator model was removed.

The complete current focused Omen suite passes 61/61. It includes actual owned-temp Windows ACL, atomic move,
hardlink/reparse, cleanup-failure and mutex operations; it is still deterministic preflight and is not actual-root,
Git or model acceptance. Executable-source pins match. Fresh independent exact-byte review, roadmap verification,
clean diff and a source commit still gate the one elevated transition. No UAC, `C:\` ACL, Git diagnostic, browser,
network or model operation has run.

Fresh re-review confirmed all six prior P1 findings closed but returned NO-GO at P0=0/P1=1 for a new cleanup
path-rebinding defect. The probe finally block detected state/probe identity mismatch only by setting a flag, then
disposed the held identity and still called pathname `TryRemoveTree($probeRoot)`. A privileged concurrent rename
and replacement could therefore cause deletion of the replacement while the owned evidence tree remained at a new
name, contradicting fail-closed retention. The correction is exact: open and hold the probe identity immediately
after creation; if the state identity, held file ID/final path/link, or name binding mismatches, perform no pathname
delete and return `probe-cleanup-failed`. When they match, a production `TryRemoveOwnedTree` helper revalidates the
held identity against the literal path immediately before the bounded tree removal. An owned-temp adversarial test
must rename the held directory, create a replacement plus marker at the original name, and prove cleanup returns
false while both the moved original and replacement marker remain untouched. Only the test's final harness cleanup
may then remove its own fixture.

The corrected adversarial identity smoke passed all fields, including `renameDetected:true`,
`replacementPreserved:true`, exact path, hardlink/reparse rejection, atomic file-ID preservation and final fixture
removal. The production cleanup now performs no delete after any state/name/identity mismatch. Executable source
pins were refreshed; the complete focused Omen suite passes 61/61. Independent re-review remains before commit or
elevation.

Final independent exact-byte re-review returned GO with P0=0/P1=0. It verified the immediate held probe identity,
short-circuit no-delete behavior on every state/name/identity mismatch, production owned-tree revalidation before
delete, and the actual temp rename/replacement marker preservation proof. It also reconfirmed all prior six
corrections, reproduced the focused suite 61/61, roadmap 15/15, executable release pins 6/6 and the clean diff.
No actual operation ran. A source commit is now the only repository gate before the one elevated transition.
