# Current slice: Milestone 1, function-first Runa

Roadmap revision: 2026-08-28.1
Milestone: M1
Slice ID: M1-S2
Status: M1-S2A product-foundation implementation and independent review are green. On 2026-09-03 the steward
replaced the Omen-local primary Code path with Control-orchestrated server-managed Git workspaces. M1-S2B
server-worker criteria, implementation, actual-system acceptance, application release and product qualification
remain open. The Omen transition is historical/deferred and must not run on the primary path.

Product-foundation checkpoint, 2026-09-02: the single-canvas workspace now implements participant-scoped
conversation search/rename/archive/unarchive/branch/export/soft-delete, persisted low-risk appearance
settings, and an honest browser/Control/Home system-status view. Local folders, Local Git, GitHub and Web
research remain visibly unavailable rather than decorative controls. Focused and cross-gate verification
pass 12/12 and 91/91; roadmap checks pass 15/15; the owned predecessor-upgrade PostgreSQL proof passes
25/25. A restricted tracked run's four Windows ACL/process
failures all passed in one exact required-context rerun (31/31), so they are method/environment results,
not model or application failures. Independent publication review returned GO with zero P0/P1 findings.
No model call, actual Control database acceptance, Control deployment or
production routing occurred. Exact evidence and remaining gates are in
`../gate7f/function-first/M1-S2A-CONVERSATION-SETTINGS-SYSTEM-RESULTS-2026-09-02.md`.

Local-context connection freeze, 2026-09-02: `M1-S2B-OMEN-LOCAL-CONTEXT-CONNECTION-CRITERIA-2026-09-02.md`
binds the next slice to the real Omen/Control split. Omen alone owns native folder selection, DPAPI root
custody, bounded file reads and allowlisted local Git. Control PostgreSQL owns participant/project/device
authorization, lifecycle and revocation. Browser-relayed results require signed receipts. No model,
automatic indexing, write, Git mutation, remote operation or production route is included. The original
criteria were published in `3c1dc57`, after which implementation began. Only the Git layer is now paused
pending independent review and publication of the actual-startup amendment.

Architecture correction, 2026-09-03: the prior paragraph and its later retained failure/review history no longer
select the active implementation. The browser is only the interface; Control orchestrates an isolated worker that
clones or materializes the project in a server-managed workspace, and Home remains model-only. Remote Git is the
primary Code connection. A one-time local folder snapshot needs no installed worker; a persistent local-folder
bridge is optional, non-elevated file/delta transport with hash-guarded approved writeback and no command/Git
surface. Fully local execution is deferred. Control's accepted Gate 7E sandbox is reusable foundation but does not
prove repository or multi-file execution. Exact corrected topology, contracts, security gates, implementation order
and exclusions are in
`../gate7f/function-first/M1-S2B-SERVER-MANAGED-WORKSPACE-ARCHITECTURE-2026-09-03.md`.
The worker boundary is source-neutral rather than Git-branded. The first proof accepts only exact allowlisted public
HTTPS Git plus one non-Git snapshot. The common Git architecture can later support GitHub, GitLab, Bitbucket,
Azure Repos Git, self-hosted and SSH endpoints only after their separate authentication/endpoint acceptance;
Perforce, Subversion, TFVC, Mercurial, cloud drives and remote folders retain distinct native semantics behind later
adapters. Work-management connectors remain context only and remote development environments remain execution
backends. This proves the interface without implementing speculative providers. The
adapter register is
`../gate7f/function-first/M1-S2B-PROJECT-SOURCE-ADAPTER-REGISTER-2026-09-03.md`.

Independent architecture review returned GO for publication with P0=0/P1=0. It closed the initial Git-ingress
SSRF/redirect/DNS boundary, capability-version, cross-workspace isolation, historical sequencing, Gate 7E
scope-inheritance and first-transport overbreadth findings. This is not implementation or actual-system acceptance.
Review: `../gate7f/function-first/M1-S2B-SERVER-MANAGED-WORKSPACE-INDEPENDENT-REVIEW-2026-09-03.md`.

M1-S2B1 corrected prospective criteria freeze, 2026-09-03: the first independent design review stopped the draft at
P0=0/P1=7 before implementation or actual operations. The correction now freezes executable strict schemas, literal
capability version/digest and closed lifecycle/receipt tables; separates a network-denied materializer from a
workspace-blind enforcing HTTPS broker; defines crash-safe non-replacing Windows publication/reconciliation; makes
browser observability and the upload protocol exact; proves same-user/cross-project plus cross-user isolation; leaves
actual Home untouched; and freezes production-path fault methods. It still includes no model, private credential,
execution, change, commit or push. Deterministic contract tests receive no actual acceptance credit. Fresh independent
P0/P1 review is required before implementation. Criteria:
`../gate7f/function-first/M1-S2B1-SERVER-WORKSPACE-MATERIALIZATION-CRITERIA-2026-09-03.md`.

Corrected-criteria review infrastructure stop, 2026-09-03: three fresh read-only review dispatches across two
independent workers returned the same service-side HTTP 404 before a verdict. This is not a product, Control, browser,
Git or model disposition. Contract checks pass 6/6 and roadmap checks pass 15/15, but implementation remains blocked
without P0=0/P1=0. Resume with one review of the source-committed corrected bytes after service recovery; do not replay
the failed dispatches. Incident:
`../gate7f/function-first/M1-S2B1-CORRECTED-CRITERIA-REVIEW-INFRASTRUCTURE-STOP-2026-09-03.md`.

M1-S2B implementation checkpoint, 2026-09-02: the authority foundation and actual PostgreSQL lifecycle
are green. The prior Omen DPAPI/handle-based file proof was 14/14, but shared native/helper bytes have since
changed and that evidence is historical until one affected-scope rerun. The first actual
Git/MXC startup stopped before Git launched because Omen MXC rejects a non-empty custom environment. The
no-launcher command-line-control amendment has independent GO with P0=0/P1=0 and was published in
`44ead36`. Its corrected implementation passes 8/8 focused checks and awaits exact-byte independent review
and a source commit before one affected-scope actual retry. Independent review stopped those bytes at
P0=0/P1=7 before actual execution; all seven gaps are recorded in
`../gate7f/function-first/M1-S2B-GIT-IMPLEMENTATION-REVIEW-STOP-2026-09-02.md`. Their corrected implementation
and expanded actual-proof source passed 13 focused checks, but a second exact-byte review stopped at
P0=0/P1=8; a third review stopped the next bytes at P0=0/P1=5; and a fourth review found two remaining
watcher/proof-integrity gaps at P0=0/P1=2. The watcher now drains final queued events before returning and
the actual proof contains a mutate-and-restore arm. A fifth review found that close itself was not a drain
and that the mutation was injected too early, again P0=0/P1=2. The latest correction keeps the watcher
enabled through a bounded quiet/drain barrier and injects the byte-neutral mutation after successful child
termination. Both corrections and the amended proof pass 13 focused
checks; fresh independent review returned GO with P0=0/P1=0, and those reviewed bytes were committed as
`11fa6c1`. The affected actual Windows proof then
stopped at `confirm-and-protect-root`: pinned Windows PowerShell 5.1 lacks the helper's three-argument
`System.IO.File.Move` overload. No Git/MXC/network proof followed. The host-compatibility RCA and native
`MoveFileExW` correction are recorded in
`../gate7f/function-first/M1-S2B-ACTUAL-WINDOWS-FAILURE-RCA-2026-09-02.md`; the correction passes its six
syntax checks, 14/14 focused checks, PowerShell parser and updated release pin. Fresh independent review
returned GO with P0=0/P1=0. A source commit remains mandatory before one affected retry.
That correction was committed as `0b4e1d4`; the one affected proof stopped at the same stage. Read-only
diagnostics proved the exact embedded C# type compiled, then found the immediate cause: clean pinned
PowerShell 5.1 had not loaded the `System.Security` DPAPI assembly. Explicit assembly loading succeeds.
The `File.Move` defect was real but latent. The RCA now requires explicit assembly loading, fully qualified
DPAPI types and typed substep errors before another review/commit; no successor actual proof ran.
The first amended-correction review stopped at P0=0/P1=1 because the new PowerShell helper was accidentally
inside the embedded C# here-string. No actual proof ran. The placement is corrected; a pinned-host test now
extracts and compiles the exact embedded C# and asserts helper placement. Focused checks pass 15/15; fresh
independent review returned GO with P0=0/P1=0. Correction `2b77422` was source-sealed and passed the actual
Windows prerequisite 19/19. The separate actual Git proof stopped on its first `contained-git-status`
operation with `omen-git-source-changed`; no successor verb or network arm ran. Because Node's witness does
not classify the event, this is retained as an actual method failure pending one reviewed aggregate
Windows-notify/durable-state diagnostic, not attributed to Git or a model. See
`../gate7f/function-first/M1-S2B-ACTUAL-GIT-WITNESS-FAILURE-RCA-2026-09-03.md`.
That aggregate-only diagnostic is now implemented and passes Node syntax plus two focused source/parser
preflights in the pinned PowerShell host. It uses one status operation, four independently filtered Windows
watchers, complete repository byte/set and owner/group/DACL equality, bounded process/guard cleanup and no
private values. It has not run. Before its first review, independent exact-byte review and a source commit
both remained mandatory.
The first review stopped the draft at P0=0/P1=4 for nonfatal watcher errors, unproven abnormal cleanup,
vacuous process-audit acceptance and late policy-template-pin verification. The revision makes every watcher
error fatal, proves post-kill terminal exit before cleanup, requires observed pinned MXC and Git processes
with zero survivors, and verifies the normalized policy template before fixture creation. It remains
unexecuted. Focused checks pass 17/17, roadmap checks pass 15/15 and fresh exact-byte re-review returned GO
with P0=0/P1=0. Commit `fe0e3be` sealed those bytes. The single run then stopped before category watching,
MXC or Git because its process-audit helper did not publish ready within a five-second file-only wait.
Cleanup left zero owned roots/helpers. Because the method discarded helper stderr and ignored early exit at
readiness, the underlying WMI-start condition is not retained. The correction uses bounded aggregate stderr
metadata, races ready against error/exit, permits 30 seconds for actual Omen startup, begins the separate
30-second observation budget only after WMI is armed, and repins the helper. It remains unexecuted. Focused
checks pass 17/17, roadmap checks pass 15/15, pinned PowerShell parsing and the helper pin pass, and fresh
exact-byte review returned GO with P0=0/P1=0. At that point, a new source commit remained required and
acceptance remained paused. Commit `207194b` sealed the correction. Its single run stopped before category
watching, MXC or Git with exit 1 and a bounded 368-byte stderr fingerprint; cleanup left zero roots/helpers.
Read-only host probes show type resolution, watcher construction/configuration and disposal work, narrowing
the unobserved boundary to WMI start versus ready publication. The next correction emits and strictly validates
a privacy-safe typed stage, exception class, numeric HResult and optional management-status name while
excluding messages/paths; the monitor is repinned. It remains unexecuted pending preflight, independent review
and a source commit. The first review stopped at P0=0/P1=1 because the parser did not reject unknown fields
despite the exact-schema claim. It now requires the exact six-key set and has positive plus extra-key rejection
coverage. The revised bytes remain unexecuted. Focused checks pass 18/18, roadmap checks pass 15/15,
parser/pin checks pass, and fresh exact-byte re-review returned GO with P0=0/P1=0. A source commit remains
required before one typed diagnostic. Commit `b2cd9af` sealed it. The single run conclusively stopped before
category watching, MXC or Git at `process-audit-wmi-start-failed`; cleanup left zero roots/helpers. The
incompatible event-subscription design is retired. Independent review stopped a proposed CIM-polling
replacement before execution (P0=0/P1=3): polling was not exhaustive, exact expected PIDs were not bound, and
abnormal cleanup was not safely proven. No polling proof or Git operation ran. The diagnostic is now narrowed
to one pinned MXC wrapper child close/exit, native-guard release/no survivor, unchanged tree/security
descriptor, aggregate event categories, zero watcher errors and owned-root cleanup. It explicitly does not
prove exhaustive process accounting, which remains a separate Git-acceptance blocker. The first narrowed-byte
review stopped at P0=0/P1=2: cleanup removal was not enforced, and an abnormal MXC-wrapper terminal miss could
leave the exact child live while deleting its root. The correction retains its child handle/terminal promise,
kills and requires bounded close on abnormal paths, preserves the root if closure is unproven, and gates
success on verified root removal. The focused suite passes 17/17, roadmap verification passes 15/15, Node
syntax/diff checks are green, and independent exact-byte re-review returned GO with P0=0/P1=0. The reviewed
bytes remain unexecuted and must be source-committed before one diagnostic resume. No
model/network/acceptance work is included. Acceptance remains paused.
Commit `c46c7e1` sealed the reviewed method. Its one diagnostic attempted at most one contained local status
operation and stopped at `finish-category-witness` with `diagnostic-lifecycle-invalid`; whether the MXC wrapper
or Git process started or completed is unknowable from retained evidence. No successor ran. Cleanup
verification found zero roots/helpers. Because the public error omitted the exact lifecycle failures and aggregates, the
failed gate is unknowable from retained evidence. This diagnostic-publication defect now has an allowlisted
failure-code plus typed count/boolean contract with private/unknown values excluded. Focused checks pass
19/19, roadmap checks pass 15/15, syntax/diff checks are green, and fresh exact-byte review returned GO with
P0=0/P1=0. Revised bytes remain unexecuted and require a source commit before one diagnostic resume.
Acceptance remains paused.
Commit `b2e0ff0` sealed it. The one resume stopped with exact evidence: the sole MXC wrapper exited
`0xC0000142` (`STATUS_DLL_INIT_FAILED`), the observer reported `omen-git-source-changed`, but the classifier saw
only 84 security notifications with zero name/content/metadata/error events and equal final tree/security.
Guard, watcher, wrapper and owned-root cleanup completed; a read-only postcheck found zero roots/helpers. The
application therefore has two actual-system defects, not a model failure: broad watching mistakes MXC's
temporary DACL activity for source mutation, and the sandboxed Git target failed loader initialization under
the frozen no-environment/no-write/UI-blocked policy. Read-only PE inspection plus installed SDK guidance makes
UI blocking the bounded leading hypothesis, pending one corrected final-configuration proof. Independent
review stopped the first correction design before implementation at P0=0/P1=3 because its explicit environment
was incompatible with actual Omen MXC behavior and frozen criteria, its runtime surface was too broad, and its
watcher abort/cleanup ordering was incomplete. The replacement preserves omitted `process.env`, no writable
paths and direct fixed `git.exe`; sets `ui.allowWindows:true`, an explicit Win32 UI/window-creation capability,
while retaining ProcessContainer isolation and clipboard/input/system-control/settings/IME/network denials;
and freezes a pinned one-use typed witness with immediate prohibited-event latching,
child termination before parsing/publication, bounded drain through guard release, strict aggregate-only
schemas and fail-closed cleanup. Acceptance remains paused for corrected design review, implementation,
preflight, independent exact-byte review and commit before exactly one further proof. No browser, HTTPS, model
or production work has run.
The corrected design subsequently received independent GO at P0=0/P1=0 and was sealed in doc-only commit
`904d52e`. The first implementation review stopped the code before execution at P0=0/P1=8 for repository/UI
lifecycle cleanup, real terminal-state proof, abort-to-spawn ordering, the final security-snapshot barrier,
native no-follow ACL reads, pre-bind UI cancellation, least-privilege/fail-closed UI instrumentation and the
actual-proof manifest. The working-tree correction closes all eight. Focused Omen checks pass 26/26 and both
sidecars compile in pinned Windows PowerShell 5.1. A separately gated disposable actual witness preflight now
covers a static junction, a completion-boundary replacement and UI cancellation, but it remains unexecuted
until fresh independent exact-byte GO and a source commit. A green committed preflight is required before the
single corrected Git proof. Acceptance remains paused; no model/browser/HTTPS/network/production work ran.
A follow-up review verified the original eight findings closed but stopped at P0=0/P1=3 because Windows
line-ending conversion could break the pins, preflight failure cleanup did not prove every sidecar terminal,
and the clean junction check lacked an exact non-traversal discriminator. The working tree now pins both
sidecars to LF, retains and requires bounded terminal closure before fixture deletion, preserves an unresolved
fixture, and requires the exact three expected security entries. Focused checks remain 26/26. These amended
bytes are still unexecuted and await fresh independent GO plus a source commit.
Fresh current-byte review returned GO with P0=0/P1=0, independently verifying all eleven findings closed,
the LF-stable hashes, 26/26 focused checks, 15/15 roadmap checks, five syntax checks and a clean diff check.
The actual preflight remains unexecuted until this reviewed tree is source-committed.
Commit `ac10286` sealed the reviewed tree. The single gated actual Windows witness preflight then passed 4/4:
static-junction non-traversal, completion-boundary replacement detection, UI pre-bind cancellation and owned
fixture removal. It invoked no Git/MXC, model, browser, network or production surface. The one corrected actual
Omen Git proof is now admitted; any actual failure stops the slice again for RCA.
Documentation commit `495571d` sealed that result. The one admitted proof stopped on its first contained
`status`: Git initialized and exited 128 with 67 bounded stderr bytes and retained SHA-256
`be29fcd5bc1ca2b48bf12070ba2149e0e33c02730419a50a5cfbeae997c6a5d2`. No successor Git verb or network test
arm ran; the disposable root was removed and a separate postcheck found zero matching helpers. The prior
loader and false-mutation faults are corrected, but the public error has no safe Git-fatal category, so the
exact cause is unknowable. Acceptance is paused for the documented allowlisted classifier, deterministic
tests, independent review, commit and exactly one single-status diagnostic before any functional fix/proof.
The first review of the diagnostic design stopped before implementation at P0=0/P1=2 because classifier
signatures/ambiguity and diagnostic success/failure lifecycle schemas were incomplete. No diagnostic ran. The
RCA now freezes ordered case-sensitive whole-buffer signatures with every malformed, near or multi-category
match forced to `unknown`; exact completed/error key sets and null rules; shared first-status fixture bytes;
pre-fixture pins; terminal wrapper/witness/guard plus fixture-disposition evidence; and one-operation/no-successor
proof. Revised design bytes require fresh independent review before implementation.
The next review reduced the design stop to P0=0/P1=1 because the safe-directory advice block remained an
undefined token. The RCA now gives three literal LF-framed grammars with exact blank line, one-tab indentation,
quoted byte-identical private path reuse and `unknown` for every deviation. No diagnostic ran; fresh design GO
remains required before implementation.
Fresh design review returned GO with P0=0/P1=0 and doc-only commit `2dbe284` sealed the contract. The classifier,
exact completed/error schemas and one-status mode in the shared actual proof fixture are implemented but
unexecuted. That mode records exactly one wrapper, two typed witnesses and one native guard, branches before
every successor/network arm, and requires unchanged repository bytes plus terminal cleanup. Focused Omen tests
pass 33/33; four Node syntax checks and `git diff --check` pass. Fresh independent implementation review and a
source commit remain mandatory before the single admitted diagnostic.
The first implementation review returned NO-GO at P0=0/P1=4 for non-exact permission phrase counting,
collapsed contradictory operation state, live diagnostic listeners and delete-before-terminal cleanup. No
actual operation ran. The correction now requires exactly one permission phrase, rejects contradictory state,
uses inert identical remote bytes with no listener through the shared first status, defers full-proof listeners
until after that status, and retains/terminates/awaits exact wrapper, witness and guard resources before root
deletion. Unresolved cleanup preserves the fixture. Focused Omen tests pass 33/33; fresh independent review,
commit and then the one admitted diagnostic remain mandatory.
Fresh current-byte review returned GO with P0=0/P1=0 and independently reproduced 33/33 focused checks,
15/15 roadmap checks, four syntax checks and a clean diff check. No actual operation ran. These exact bytes may
now be committed before the single admitted diagnostic; acceptance remains paused.
Commit `69f3284` sealed the reviewed diagnostic. Its one actual status returned a completed, cleanup-green
`working-directory` fatal category with the same exit 128 and 67-byte hash, unchanged repository and no
successor/model/production action. This proves the fixed `working-directory` family, but not the private path,
exact message or failing cwd transition. Dual selected-root inner/outer cwd coupling is the bounded leading
adapter hypothesis. The frozen correction uses
the already-admitted pinned Git installation root for both cwd values and explicit `--git-dir=<root>\\.git` plus
`--work-tree=<root>` argv binding, without widening filesystem, environment, UI or network authority. It requires
an updated `<GIT_INSTALL_ROOT>` policy pin, pre-spawn inner/outer cwd assertions, deterministic five-verb
disposable-repository equivalence, unchanged-byte proof and timeout/network binding gates before fresh review and
commit. The first design review returned P0=0/P1=3 and caused these corrections. Only then may one corrected
single-status confirmation test the hypothesis. No correction or retry has run; acceptance remains paused.
Fresh corrected-design review returned GO with P0=0/P1=0. Roadmap checks pass 15/15 and the diff check is clean.
A doc-only design commit precedes implementation; no actual retry or model/production action has run.
Commit `e3434f9` sealed the design. The cwd decoupling, explicit repository arguments, updated policy pin and
timeout/network source gates are implemented but have not run through MXC. Native five-verb equivalence also
found and corrected two command-contract defects before actual execution: `core.excludesFile=NUL` is invalid in
current Windows Git and `show` had a duplicate NUL terminator. With an empty excludes override and one `show`
terminator, Omen checks pass 35/35, all five structured results match their selected-root baselines and repository
bytes remain unchanged; roadmap checks pass 15/15. Fresh implementation review and a source commit still gate
the sole permitted corrected single-status diagnostic. Acceptance and models remain paused.
The first implementation review returned P0=0/P1=3 without execution. It found that normalization could hide
read-authority drift, the native gate did not authenticate inputs/prove zero stderr and the empty excludes
override, and loose source regexes could false-pass outer cwd. The corrected gate validates exact canonical
read-only/write/deny authority, hashes the three Git inputs before fixture creation, proves a controlled global
ignore is defeated, requires zero stderr and uses a captured pinned-cwd spawn boundary plus exact observer/
timeout/network call sites. That stderr gate also found and closed an ambient `diffstat` line-ending warning with
`core.safecrlf=false`, preserving autocrlf semantics. Omen checks pass 35/35, roadmap checks pass 15/15, all
changed JavaScript parses and the diff check is clean. No actual operation ran; fresh re-review is the remaining
pre-commit gate.
The second review confirmed the code findings closed but stopped at P0=0/P1=1 because the normative M1-S2B
criteria still froze the superseded argv/cwd contract. The criteria now publish the exact explicit repository,
pinned inner/outer cwd, path-authority, excludes, safe-CRLF and show-delimiter amendment. No actual operation
ran; deterministic checks and fresh exact-byte review must repeat before commit.
Fresh exact-byte re-review returned GO with P0=0/P1=0 and reproduced 35/35 focused checks, 15/15 roadmap checks
and a clean diff check. No actual operation ran. A source commit is now the remaining gate before the one
single-status diagnostic.
Commit `77b3eeb` sealed the correction. Its sole actual status stopped at a new 50-byte, exit-128
`permission-denied` fatal; unchanged repository, terminal resources, fixture removal and a zero-root/helper
postcheck passed, and no successor/network/browser/model/production path ran. The prior cwd fatal is gone, but
the denied resource is not published. Acceptance is stopped. The frozen diagnostic next orders only existing
local read-only verbs `branches -> show -> diffstat -> status`, proves unchanged/terminal state between them,
stops at the first fatal/error and publishes fixed aggregates only. It gives no acceptance credit and requires
deterministic tests, independent review and a source commit before its one run.

The later host-prerequisite correction remains in implementation preflight. Real Windows ACL calls on owned temp
fixtures found that the OS preserves every old ACE and permits exact rollback/child isolation, but reorders the two
new AppContainer allows relative to the theoretical `SetEntriesInAclW` buffer. No root-drive write occurred. A
first relaxed-delta proposal was independently stopped at P0=0/P1=1 because it could admit an allow before an
applicable deny. The revised RCA requires Windows-canonical deny/allow/inherited order, exact ACL headers and raw
target ACEs, exact relative bytes for all old ACEs, atomic verified-actual-post journaling and revalidation on every
prepared/deprovision load. Fresh design GO precedes any implementation resume, commit, UAC operation or Git run.
Fresh design re-review returned GO with P0=0/P1=0 and reproduced the clean diff and 15/15 roadmap checks. No
implementation or actual operation ran; the design must now be source-committed before implementation.
Commit `67012ca` sealed that design. First implementation review returned NO-GO at P0=0/P1=3 for a successor-
after-fatal error-state hole, digest rebasing across unwitnessed gaps and source-text-only coordinator coverage.
The correction rejects fatal/count mismatch, uses one immutable before/after/final repository baseline and adds
executed pure transition tests across every fatal position, interruptions, mutations, partial startup and retained
cleanup. Focused Omen checks now pass 44/44 and six syntax checks pass. No actual operation ran. Roadmap/diff
checks and fresh independent implementation re-review still gate the source commit.
Fresh independent implementation re-review returned GO with P0=0/P1=0 and reproduced 44/44 focused checks,
six syntax checks, 15/15 roadmap checks and the clean diff. No actual operation ran. A source commit is now the
sole remaining gate before exactly one permission-boundary diagnostic execution.
Commit `acd2eb8` sealed the implementation. Its one actual run stopped on the first `branches` verb with the
same exit-128, 50-byte `permission-denied` hash as the prior `status`; no later verb ran. Repository/lifecycle/
cleanup passed and the read-only postcheck found zero roots/helpers. Native exact-argv equivalence passes on a
separate fixture outside MXC, making MXC visibility or a containment/fixture interaction the leading hypothesis,
not a proven resource-level cause; the denied resource remains private/unknown. Acceptance is paused.
Read-only host-prerequisite inspection then found the omitted gate: MXC's null-device verifier passes, but `C:\`
lacks both documented non-inheriting AppContainer read-attribute grants; the current token is not elevated. This
confirmed harness/deployment readiness defect is the leading Git-fatal cause, though the exact Git access remains
unpublished. Denial capture is paused. The frozen correction pins an aggregate-only prerequisite reader, tests/
reviews/commits it, performs reversible vendor `prepare-system-drive` once through UAC, verifies both root grants
plus null-device readiness, then admits one post-repair `branches` resume. No ACL has changed yet.
Independent design review stopped that first correction at P0=0/P1=3. The revised frozen design now defines
exact fail-closed reader/transition schemas, immediate full-descriptor drift and expected-delta checks, bounded
one-attempt preparation/rollback, a protected durable pre-state journal, full restoration proof, and deployment-
owned removal. Fresh design re-review is required before implementation; Git and ACL mutation remain paused.
Subsequent review converged those lifecycle controls, but a current upstream Microsoft high-impact bug then
invalidated the vendor system-drive writer: its `SetNamedSecurityInfoW` path can propagate ACL normalization into
descendants, and the proposed fix is unmerged. Vendor prepare/unprepare is now prohibited. The superseding design
uses a pinned Runa-owned root-only `SetFileSecurityW` transition, order-preserving DACL bytes, an actual disposable
target-only API probe, the same durable at-most-once journal, and a new independent review before implementation.
Fresh independent review returned GO with P0=0/P1=0. Implementation, its deterministic/adversarial test matrix,
fresh exact-byte review and a source commit now gate the one elevated execution; no ACL has changed.

The first exact-byte implementation review stopped the prospective source at P0=0/P1=9 before execution. The
corrected bytes now include the secured mutex and abandoned-owner stop, protected path/identity enforcement,
probe identity, native-API-false truth handling, an immediate rollback gate, one journal schema/path, complete
JavaScript journal/Win32 validation, the truthful deprovision pin-drift tuple and an executed coordinator crash/
write matrix. The first corrected identity smoke then stopped on a bad expected `\\?\` test literal and an invalid
assumption that this Windows build would block a directory rename. The retained RCA changed the invariant to
exact name/identity change detection. Its sole amended rerun passed exact path, rename detection, hardlink and
reparse rejection, and cleanup. The complete focused Omen suite passes 62/62 and executable source pins match. No UAC,
root ACL, Git diagnostic, browser or model operation ran. Fresh exact-byte implementation review and a source
commit still gate the one elevated execution.
That re-review reproduced focused 62/62, roadmap 15/15 and a clean diff but returned NO-GO at P0=0/P1=6. It
requires an explicitly protected mutex plus truthful abandoned/busy/deprovision paths; held temp/final journal
identity; path-binding prepare/deprovision root gates; rejection of every conflicting target-SID ACE; exact cleanup-
failure classification; and execution of production coordinator control flow rather than a disconnected test
model. The RCA records the finite correction gate. Commit, elevation and acceptance remain stopped.
The first corrected mutex smoke stopped only on its literal protected-SDDL oracle while busy, abandoned and wrong-
security behavior passed. One aggregate-safe local serialization diagnostic is admitted before correcting that
oracle; no successor test or actual action has run.
The one pinned-5.1 diagnostic proved the exact protected SYSTEM/Administrators mutex SDDL uses numeric
`0x1f0001` rights rather than `GA`; production and the smoke oracle now freeze that actual form.
The first production-path mutex-publication matrix stopped when its ordinary-user abandoned-owner fixture tried to
reopen the protected object and was correctly denied. The fixture is corrected to abandon the already-authorized
handle without weakening security; the interrupted run provides no acceptance credit.
The next run proved cross-process ordinary-user testing cannot reach either protected wait path and can false-green
the abandoned tuple through the outer catch. That fixture is retired. The wait moves into a production helper that
uses the already-authorized handle and is exercised with real same-handle Windows ownership across threads.
The first such smoke stopped at a PowerShell 5.1 dynamic-assembly reference error before any wait. The corrected
fixture compiles the exact production C# bytes and test driver in one unit; no production test hook is added.
The combined compile then exposed late test-driver `using` directives after production types; the fixture now uses
fully qualified threading names. No mutex operation or system path ran.
The corrected helper and all six review remediations now pass the complete focused Omen suite 61/61. Production
itself traces probe, journal phases, root/rollback calls and removal, rejecting any completion that does not match
the trace; 33 lifecycle/failure/crash sequences plus invalid-order adversaries execute that same coordinator. Held
journal identity, all root path gates, target-SID conflicts and cleanup retention/recovery are covered. Fresh exact-
byte review, roadmap/diff checks and source commit remain before any elevation.
Fresh re-review confirmed the six corrections but stopped at P0=0/P1=1 because mismatch cleanup could still delete
a replacement path after releasing the held probe identity. The correction forbids delete on mismatch and adds a
held-identity removal helper plus actual temp rename/replacement preservation proof.
That adversarial proof now passes: mismatch was detected, the replacement marker and moved original survived the
production cleanup helper, and final harness cleanup succeeded. The complete focused Omen suite passes 61/61;
fresh re-review remains before commit.
Final independent exact-byte re-review returned GO with P0=0/P1=0 and reproduced focused 61/61, roadmap 15/15,
pins 6/6 and the clean diff. Commit `4388d0a` sealed those bytes, and a post-commit Git-blob check matched all five
transition source pins. The first launcher invocation was blocked before process creation because its persistent
protected `C:\` security-descriptor write requires explicit informed approval. No UAC, root ACL mutation or Git
diagnostic occurred; this is an authorization checkpoint, not an acceptance failure. At that historical checkpoint,
one sealed elevated transition and its automatically chained permission-boundary diagnostic were proposed next.
The 2026-09-03 server-managed-workspace decision superseded that sequence; they must not run on the primary path.

Historical read-only alternative assessment, 2026-09-03: a Codex-style Runa-owned low-privilege Windows worker is
technically feasible and can avoid changing the `C:\` root DACL, but it is a new privileged broker/account/
firewall/lifecycle backend rather than a drop-in. WSL2 is not runnable on current Omen because no distribution is
installed and firmware virtualization is disabled; it would also require a new Windows/D:/Git/identity/witness
contract. Windows Sandbox is not viable on the current Home/firmware configuration. The closest future replacement,
MXC BaseContainer, requires build 26600+ and its OS feature; current build 26200 selects only
`appcontainer-dacl`. AppContainer+BFS is disabled in shipping MXC. The sealed root-DACL transition therefore
was the only ready contract-equivalent path for the then-selected Omen-local design. The later steward decision
removed that design from the primary Code path, so the transition is no longer next and must not run. No system
change or acceptance operation ran. See
`../gate7f/function-first/M1-S2B-OMEN-ISOLATION-ALTERNATIVES-ASSESSMENT-2026-09-03.md`.

Workspace baseline checkpoint: see
`gate7f/function-first/M1-S2-WORKSPACE-BASELINE-IMPLEMENTATION-RESULTS-2026-09-02.md` for the accepted
single-canvas implementation, deterministic verification, and the complete 10-failure RCA from its first
tracked test run. No failure was attributed to a model and the model campaign remained paused.

Implementation checkpoint, 2026-09-02: model comparison is tabled. The active slice configures Gemma as
the single primary for Chat, Research, Code, Agent and Review, preserves the previously qualified Research
checker semantics, isolates the simplified `accept`/`revise` checker to Review, and creates a
machine-enforced composite qualification record. The accepted UX hierarchy uses one primary work canvas;
Chat, Code and Research are contextual task types rather than a permanent top tab row. Agent is a governed
task state inside Code and Review is contextual to selected sources, artifacts or diffs. Deterministic implementation tests cannot qualify the model or
actual application. Any actual method failure stops the gate for RCA and correction before retry.

The application is now under a product-foundation rebaseline before final customer acceptance: complete
the shell and conversation lifecycle, real Settings and Omen/Control/Home status, authorized local-folder
and local-Git connections, Research/Code/artifact work surfaces and governed local changes, then run the
bounded actual-system journeys. No new LLM campaign is part of that work unless a qualified model contract
materially changes. See
`../gate7f/function-first/M1-S2-GEMMA-PRIMARY-APPLICATION-SLICE-2026-09-02.md`,
`../gate7f/function-first/RUNAAI-PRODUCT-FOUNDATION-AND-UX-BASELINE-2026-09-02.md` and
`../gate7f/function-first/M1-S2-DEFERRED-ADVERSARIAL-MODEL-DESIGN-2026-09-02.md`.

Focused actual-system Review result, 2026-09-02: the failed 120-attempt/browser R15 method remains retired
and is not resumed. A reduced Omen -> Control -> Home method used the eight frozen Review scenarios once
each. Gemma produced 8/8 semantically correct Review answers. After actual evidence exposed ambiguity in
the checker token `correct` and a non-semantic ordered-citation echo requirement, the application checker
was reduced to an unconditional non-null `accept`/`revise` contract: accepted output remains
application-owned; revisions retain the one-recheck limit; all citations must remain unique selected
evidence. The final actual checker run returned 8/8 valid `accept` decisions with zero nullable fields,
foreign citations, model errors, infrastructure errors or cleanup errors. Home finished with zero loaded
models and both GPUs restored to 260 W. Gemma is therefore the selected single candidate for this bounded
Review role; no Review model pool is needed. This does not qualify Agent, browser/UI, production routing,
statistical reliability or the product. Evidence and all actual-run RCAs are indexed in
`../gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-RESULTS-2026-09-02.md`. A separate static review of
the frozen evidence and contract returned `GO` with no P0/P1 commit blocker; it ran no model, browser,
mock or test campaign.

Five-function disposition, 2026-09-02: R13 remains immutable valid actual-system evidence for Gemma Chat
24/24, Research 23/24, Code 24/24 and Agent 24/24. R13 used exclusive Home leases, the required actual
application/browser checkpoints, 12/12 controls, candidate-blind semantic review and exact cleanup. The
later R15 method failures do not erase those completed results. Combined with the focused Review pass,
Gemma now has a qualifying route for all five bounded M1 model functions. No further LLM qualification
campaign is required unless a material model, inference-setting, prompt, checker-semantic or frozen-contract
change occurs. The remaining work is exact-current-application acceptance, production routing and the
customer trial, not another model campaign.

The historical halt text below is retained as evidence of the retired method, not current progress.

Campaign halt, 2026-09-02: fresh zero-model stage `b230075b107b439480bfbecd64189e62`
completed 11/12 controls and stopped when the browser reached ordinary sign-in rather than the sealed
synthetic bootstrap. It records no model invocation, production change or protected-data read. Independent
review then returned NO-GO on the proposed handoff correction because `Clear-Clipboard` is unavailable on
the actual PowerShell 5.1 and 7.6.4 host. The selected deterministic checks did not exercise that dependency.
The rejected draft is preserved by audit commit `ae69d6e416a29e6ccb73bc2ca4fc360cadd4e822` and absent
from the active tree by revert `7445d0044c549c0ca8710eb5fc8f47a2670f5270`. No further retry is
permitted until the exact host-real, zero-model dress rehearsal and independent GO specified in
`../gate7f/function-first/M1-S2-R15-CAMPAIGN-HALT-AND-COST-RCA-2026-09-02.md`. Any failure re-halts the
campaign before a model lease or new stage. Earlier updates below are retained history, not current progress.

V14 execution update, 2026-09-02: fresh stage `4109cda2788e4311a6f5832d41446dc5`
reached control 10's live browser checkpoint after finalizing all 2,465 source entries. The first neutral
page loaded, but sign-in and later requests returned `ERR_EMPTY_RESPONSE`. The eight-slot loopback relay
released a browser slot only when its per-connection SSH child exited; abandoned browser connections
could therefore leave all slots occupied by stalled children and cause every successor connection to be
destroyed. Its old tests never exercised browser-style connection turnover. The checkpoint expired,
the stage was retained, no campaign result exists, cleanup left zero stage-owned processes, and Gemma
remains at zero new scored attempts. The repair releases a closed/error client slot at once and terminates
the abandoned child while retaining cleanup ownership until exit. Independent review found that its first
revision still lacked a bound when kill failed or the child stalled; the completed revision adds a separate
16-child cap and makes failed kill or a 10-second exit miss fatal to the relay. Later review found and closed
two shutdown races: premature success/fatal downgrade before child settlement, then duplicate promise/timer
creation during synchronous failed-kill reentry. Shutdown now publishes one shared deferred before cleanup,
waits for listener closure plus zero owned children, keeps fatal status sticky and has one bounded terminal.
Focused relay/proxy tests pass 16/16 and the campaign harness passes 206/206; both independent re-reviews
report GO with no P0/P1 findings. The restricted tracked run passed 1,975 checks, skipped 78 and exposed five
permission-only Windows ACL/process/probe failures; their exact two source files pass 32/32 in the required
host context, accounting for all 2,058 checks with no unresolved failure. Repair commit
`2431ad3ca52d8ec3a87d042c298d2c1de61339da` is pushed. Fresh package
`20260902-campaign-r15-common-v15` binds that exact source, archive
`85445369814694a15ba42bab2c5d70ea3688c02e5ec4ee14c97b74a353258911`, runtime seal
`45e2d5bd0086b0da5170596395959fd543ebbff31edee151b41e22986ea2e7da` and verified 2,465-entry
manifest `078d41257e39a87d47bf0ac026e7f4065f76abb0a55047456b8d2a6982dc06f9`; the propagated harness
passes 206/206. This seal commit, a fresh 12-control stage and separate live-browser proof remain before
inference.

V12 method-gate update, 2026-09-02: fresh stage `08fdd8ae4cce45dd9cb2ee3e0fb17e91`
recorded 11 completed model-free controls and one failed browser-dependent control, with no model calls.
The browser checkpoint ran from 04:17 to 04:32 EDT, but its displayed URL was attempted around 07:46 EDT.
That stale handoff is an operator-method failure, not Edge or Gemma. The outer watcher separately rejected
26 harmless content notifications on four sealed directories while hashes, exact sets and runtime security
state remained unchanged. Independent review stopped packaging on relay-liveness/expiry supervision, a
pre-use classifier race, package/hash propagation and stale status. The repair now couples the live relay
to the exact checkpoint expiry, confirms owned process-tree shutdown, inlines the classifier in the pinned
validator and updates all living status. The final focused suite passes 76/76 and the complete tracked
suite passes 1,971/2,049 with 78 intentional skips and zero failures. Two independent re-reviews returned
GO with no P0/P1 findings. The reviewed repair is committed as
`c760419885e5ba5729335f272f177ef74931b83a`. Fresh package
`20260902-campaign-r15-common-v13` was built from that exact commit, verified against all 2,465
source-tree entries and pinned into the operators by this seal update. A fresh model-free stage, 12
controls and the separate real-browser proof remain required. V12 is retained and not reused; Gemma
has zero new scored attempts in the simplified arm.

V13 execution update, 2026-09-02: fresh stage `9fa6b29e728f4d41ae15580f4f57b421` finalized all
2,465 verified source entries, then stopped at its first browser checkpoint before relay publication or
inference. PowerShell 7 converted the valid ISO UTC expiry string into `System.DateTime`, but the
local operator required a string. The repaired parser accepts only an exact UTC/zero-offset value and is
covered by an actual PowerShell 5/7 `ConvertFrom-Json` coercion regression. Focused checks pass 31/31,
the campaign harness passes 198/198, and the isolated tracked suite passes 1,972/2,050 with 78 intentional
skips and zero failures. Two independent re-reviews returned GO with no P0/P1 findings. The repair is
committed as `4369bcdbf03200cb6334261a5f2820eede1e0602`; package
`20260902-campaign-r15-common-v14` was built and verified against all 2,465 source entries, then pinned
into the operators by this seal update. V13 is retained and not reused; a new model-free stage is required,
and Gemma remains at zero attempts.

V11 finalization-key-order update, 2026-09-02: fresh stage `4b57aec1ddca418dbf20c2df7ddac6da`
finalized all 2,464 source files, then stopped before the first control because the validator's manually
written sorted property list put `runtimeSealSha256` after the `runtimeSecurity*` fields. Its actual
`Sort-Object` output puts `runtimeSealSha256` first, so an otherwise exact receipt was rejected. No control
result or model attempt was recorded. The order is corrected and a regression now derives the actual
finalizer receipt fields and requires the validator list to match their sorted order. Focused checks pass
8/8, the campaign harness passes 197/197, and the full suite passes 1,967/2,045 with 78 intentional skips
and zero failures when its disposable payload directory is writable. Two independent reviewers returned
GO with no P0/P1 findings. The failed stage is retained and not reused; commit/reseal and a fresh stage
remain.

V10 method-gate update, 2026-09-02: fresh stage `288236b61f1e4944a0a77d360f704a51` stopped on its
first model-free normalization preflight, before controls or inference, and has zero matching processes.
The test double had inverted the actual MXC contract: successful execution returns
`startupObservation:null`; a populated observation records startup failure. The real success was therefore
rejected by the outer assertion. The corrected normalizer now requires the complete exact receipt and null
failure observation, while the regression rejects any populated failure observation. Focused checks pass
34/34, the complete model-free harness passes 196/196, and the full repository suite passes 1,966/2,044
with 78 intentional environment-dependent skips and zero failures. Two independent reviewers returned GO
with no P0/P1 findings. The stage is retained and not reused. Commit/reseal and a fresh stage remain before
Gemma.

Gemma-only eligibility update, 2026-09-02: the steward selected one fresh 120-attempt Gemma arm to
conserve compute. It contains 24 ordered attempts per M1 role and permits Nomic only for embeddings. The
simplified unconditional Review contract and completion/review publication chain pass 195/195 model-free
harness checks. Two final independent reviews returned GO with no P0/P1 blocker after adversarially
checking Windows path identity, durable publication, linked ancestors, visible-review evidence, canonical
Home completion and retained operator locks. The complete tracked suite passes 1,965/2,043 with 78
intentional environment-dependent skips and zero failures. No candidate call has occurred. Exact packaging/reseal, 12
controls and the separate real-browser proof remain before inference. A five-role Gemma pass would support
one generation/reasoning model for this bounded route, not comparative R15 completion, product
qualification, production routing or customer-trial acceptance.

V8 method-gate update, 2026-09-02: commit `bf1ec7fdc1aacd1239e6513c29943fb93f4d6342`
was sealed and stage `635e8cecd7b64b6296d9b23043b52015` completed all 12 inner model-free controls
with zero failed drivers and no model calls. The outer witness failed closed on 1,910 runtime `Changed`
notifications despite clean final byte hashes and exact file/directory sets. A bounded one-preflight
reproduction classified all 314 reproduced notifications as `Security` only; no name, size, write-time or
attribute event occurred, and idempotent host ACL preparation emitted none. MXC temporarily applies and
restores runtime access rules as part of process-container startup. The witness now suppresses only those
runtime `Security` notifications while retaining all root/source/tool security monitoring, runtime
name/write/size/attribute monitoring and read locks. It also rehashes and re-enumerates the complete runtime
and compares every file/directory owner/group/DACL before and after execution. Lasting drift still fails
closed. The focused suite passes 27/27 and the complete tracked suite passes 1,937/2,015 with 78 intentional
skips and zero failures; independent P0/P1 review returned GO. Commit/reseal, fresh controls and separate
browser-publication proof still precede the Gemma-only 120-attempt eligibility arm. No v8 candidate identity
was consumed, and the original three-model comparative R15 is not silently declared complete.

V7 method-gate update, 2026-09-02: source `188048537e4770e3ac7719bff55417bb0994c293` was
sealed and a fresh stage reached model-free browser control 10. Final independent review found a late-event
race: after a fixed delay, the validator could see one empty PowerShell event snapshot and stop draining
before an asynchronous filesystem callback arrived. The stage was failed closed, its owned services were
confirmed absent and no model/campaign identity was invoked. The correction drains through a bounded quiet
interval while watchers are enabled, disables and disposes them, drains through a second bounded quiet
interval, and repeats exact-set verification while source/runtime locks remain. The shared helper has
deterministic delayed-event and post-disposal queued-event regressions. Three sequential host runs passed
and independent final review returned GO with no P0/P1 finding. Commit/reseal, controls and browser proof
remain mandatory before the steward-directed Gemma-first 120-attempt arm. The complete tracked suite passes
1,936/2,014 with 78 intentional environment-dependent skips and zero failures; roadmap verification passes
15/15.

V6 method-gate update, 2026-09-01: a fresh sealed stage completed 12/12 model-free controls with no
model calls, then the whole-stage recursive mutation watcher failed after the post-run exact-set check had
passed. The retained failure is harness-only. The corrected operator excludes only the already-bounded
high-churn mutable roots from recursive observation, watches immutable trees separately, disables before
draining, and retains source/runtime locks plus fail-closed diagnostics. Gemma testing remains paused until
fresh controls and the separate browser-publication proof pass.

R15 containment update, 2026-09-01: independent prelaunch review found that the corrected exact-source
stage did not yet prebuild the compact native runtime and that the provisional runtime root would grant
MXC read access to the whole extracted application. Launch remained stopped before inference. The local
correction now create-once manifests the compact runtime, validates its exact archive/source/node-bound
file set, locks every entry read-only before application Node, and retains it as immutable evidence while
cleaning only disposable data/process resources. Focused checks pass 49/49, the complete suite passes
1,933/2,011 with 78 intentional skips and zero failures, the campaign harness passes 164/164, Gate 7F
passes 28/28, and roadmap verification passes 15/15. Independent re-review returned GO with no P0/P1
finding. Commit/reseal, 12 controls and the real-browser proof still precede any Gemma or other candidate
request.

R15 implementation update, 2026-09-01: the prospective model-neutral correction was frozen before
implementation in
`../gate7f/function-first/M1-S2-R15-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`. It addresses only
R14's genuine Review checker-shape, exhaustive evidence-limit/counterexample reasoning, read-only Agent
type/formula reasoning and failed-check repair-context defects. Candidates, cases, 360+12 denominator,
thresholds, authority and existing deadlines remain unchanged. R14 is not replayed, pooled or regraded.
The implementation and its two independent P0/P1 reviews are complete with no remaining finding. After the
archive-binding and watchdog-timestamp corrections, the complete tracked repository suite passes 1,929 of
2,007 tests with 78 intentional skips and zero failures; exact results
and deterministic failure disposition are in
`../gate7f/function-first/M1-S2-R15-CORRECTION-IMPLEMENTATION-RESULTS-2026-09-01.md`. Source
`2e81d94b3f362c6d8d2d04bbf6a486a091228af7` is committed, pushed and resealed. Fresh controls passed
12/12 and a real Brave model-free proof passed all witness/publication/native-release assertions after
five retained method-only failures were corrected. No candidate call was made by those preflights. The
next operation is the fresh full 360-attempt campaign and candidate-blind review, with pause-and-resume
at the first unconsumed identity for any non-model failure.

R15 prelaunch update, 2026-09-01: the first scored-stage rehearsal stopped before a Home lease, provider
call or consumed campaign identity because the create-before-load lease builder rejected eight
source/operator byte hashes. The files had not changed; the plan had hashed CRLF-normalized Windows
checkout bytes while the lease consumed LF bytes from the sealed Git archive. The campaign is paused. The
common builder correction now extracts and hashes the supplied archive, independently verifies every plan
pin against that extraction, and binds the resulting plan hash into the new seal. The related Windows
watchdog correction uses OS process time only for exact identity and durable records for event ordering;
its terminal-present regression and independent P0/P1 review are green. Fresh lease packages for all three
candidates, 12 controls and the real-browser proof must pass before the 360-attempt campaign starts.

R14 completion update, 2026-09-01: R14 is complete and immutable. The corrected method resumed Qwen
at the first unconsumed identity, recorded the remaining 51 rows, and composed an exact disclosed
68 + 1 + 51 history. All 360 attempts and 12/12 controls are complete; the candidate-blind review has
360 determinate grades, zero inconclusive grades and no critical model/product failure. Chat, Research,
Code and Agent have qualifying routes. Review does not: Gemma is 7/24, Coder 20/24 and Qwen3.6 21/24.
Product qualification and the customer trial remain false. The method RCA and exact final pins are in
`../gate7f/function-first/M1-S2-CAMPAIGN-HARNESS-RCA-AND-CONTINUITY-CORRECTION-2026-09-01.md` and
`../gate7f/function-first/M1-S2-R14-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`. The next work is a
prospectively frozen R15 correction for the genuine Review evidence-limit/structured-output defects and
the two nonqualifying Agent defects. R14 must not be replayed, selectively pooled or regraded.

R14 correction update, 2026-09-01: R13 is complete and immutable. All 360 attempts and 12/12 controls
were recorded and independently reviewed candidate-blind with 360 determinate grades. Chat, Research,
Code and Agent have qualifying routes. Review does not: Qwen3.6 is closest at 21/24 and omitted the
relevance of one stated authentication control in all three path-boundary repetitions. Exact results
are in `../gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`. R14 is frozen in
`../gate7f/function-first/M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`; it strengthens only
generic stated-control coverage in the Review answerer/checker and keeps the complete 360+12 denominator,
cases, candidates, thresholds, budgets and independent evaluator unchanged. Its focused deterministic
proof is green at 81/81. No production route or customer trial is authorized yet.

R13 correction update, 2026-08-31: the exact Agent and Review deficits from the immutable R12 review
are prospectively frozen and the model-neutral application corrections are implemented. The contract is
`../gate7f/function-first/M1-S2-R13-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-08-31.md`. It permits only
model-neutral, case-agnostic improvements to grounded Agent completion/repair evidence and strict
structured Review verification. It keeps all candidates, 40 cases, 360 model attempts, 12 controls,
role thresholds and candidate-blind grading unchanged. Deterministic verification is green at 1,919
tests with zero failures; exact implementation evidence is in
`../gate7f/function-first/M1-S2-R13-CORRECTION-IMPLEMENTATION-RESULTS-2026-08-31.md`. No R13 model
inference, role selection, production promotion or customer trial has started. The next operation is
the fresh committed R13 source archive and runtime seal followed by the complete 360+12 campaign.

R12 evaluation update, 2026-08-31: candidate-blind independent review is complete for all 360 rows,
with 963 explicit semantic checks, 350 determinate final grades, 10 retained inconclusive grades and
12/12 model-free controls. Gemma qualifies for Chat, Research and Code; Coder qualifies for Chat and
Code; Qwen3.6 qualifies for Code. No candidate qualifies for Agent or Review, so no all-five-function
route or customer trial is ready. Exact results are in
`../gate7f/function-first/M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md`. No route was selected or
promoted.

R10 evaluation update, 2026-08-30: the frozen corrected application completed all
360 model attempts, 12/12 shared controls, strict lifecycle retention and
candidate-blind independent review. Exact results are in
`../gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md`.
Gemma and Coder qualify only for Chat and Code. No candidate qualifies for
Research, Agent or Review, so no all-five-function route or customer trial is
ready. No production route was selected or promoted.

R9 and R10 are immutable evidence. R11 implemented the prospective criteria in
`../gate7f/function-first/M1-S2-R11-CORRECTIVE-CRITERIA-2026-08-30.md` correct
the exact checker-citation, Research-completeness, repair-continuation and actual
browser-witness mechanics without changing cases, candidates, thresholds or the
independent evaluator. Its first diagnostic arm then exposed a separate time-critical
operator-publication defect; its 120 rows are retained but ineligible. The frozen R12
criteria bind witness-first publication and its matching acknowledgement into one
source-pinned owner process without changing the 24-second observation interval,
25-second native hold or full 360+12 denominator. Role routing stays deterministic and application-owned; a model
cannot select itself, change authority or inherit a pass from another role.

The first remaining-13 supplemental attempt then stopped after 3/13 rows because
the owner browser witness/ack wrappers admitted only full `campaign-*`
directories, not the runner's exact `supplemental-qwen36-27b-mtp-*` directory.
That failed r33 stage remains evidence and is not pooled with immutable R12. The
prospective correction changes only that narrow directory binding; a fresh
source/archive/runtime seal, 12 controls, Home lease and Control stage precede
the next exact 13-attempt run.

The second supplemental arm then reached the Agent05 short-window checkpoint
and exposed a remaining seal-position predicate in both witness wrappers. That
r34 arm was stopped and cleaned with no qualification credit. The complete
prospective correction now binds the runtime-seal prefix at its exact position
in the Qwen supplemental name while retaining the full-campaign suffix rule;
fresh source, controls, Home, and Control ownership are still required.

Completion update, 2026-08-31: corrected r37 recorded all 13 previously
unexecuted Qwen identities with all five actual-browser observations accepted,
no runner stop, complete Control drain, and verified Home cleanup. The steward
clarified that the 13 rows should be composed with the first 107 when the gap is
timing-only. A machine audit proved identical model-facing seals and exactly
three non-model-facing seal differences; the derived result preserves both
execution windows and all 120 Qwen identities. All 360 three-candidate rows were bound into a
candidate-blind review input. Independent semantic review and frozen role scorecards are now complete.
Agent and Review have no qualifying candidate, so no production route or customer trial is authorized
by R12.

Read `PRODUCT-ROADMAP.md` first. This slice is the first milestone only; it does not replace, complete
or retire the rest of the roadmap. All 17 capability families remain tracked in `capabilities.json`.
The current Git branch continues the existing Gate 7F foundation descended from integration `f092d358`;
it preserves local documentation `0702210` and prior qualification `be094bd`. No integration merge,
production route switch or protected-data change is represented by this contract commit.

## Authorization and correction to the old sequence

On 2026-08-28 the steward directed the full roadmap to be hardened, documented, retrieved for every
next-slice decision, committed and pushed, then authorized whatever non-destructive work is needed for
this first milestone, with human involvement for actual testing rather than recurring approvals.

This supersedes the old requirement to select a model before building/testing real disposable project
functions. Build the shared functions, test them deterministically, run all three candidates through
the same functions, then select by role. Old sealed results and prior scope decisions remain historical
evidence; this dated amendment does not rewrite them.

## Immediate order and finite deliverables

1. Publish the roadmap, retrieval guard and this acceptance contract before product implementation.
   The contract commit is `333912a`. Publication initially stopped at the environment check; after the
   steward reaffirmed the existing permission, an ordinary fast-forward push succeeded on 2026-08-28.
   GitHub's `codex/gate7f-agent-foundation` tip was verified as
   `25494137b755828adaef66b72822a4b1258446d3`, including the roadmap and M1-S1 wiring. The publication
   blocker is resolved; it is not a new permission gate for the already authorized M1 work.
2. Add independently selectable model roles behind the existing provider interface. Preserve legacy
   single-model configuration and exact rollback. No model chooses its own authority or fallback.
3. Diagnose Qwen3.6's retained timeout failure and validate three-model runtime readiness; do not silently
   omit it, change the denominator or download a substitute. Root owns Home residency and verifies exact
   artifacts before running one large model at a time. This can run alongside independent local work.
4. Complete each function below through the real application architecture, starting with chat and
   context. Reuse working code. At each function: deterministic checks -> matched model task attempts ->
   actual application route/journey -> independent evidence review. Do not build another mock-only demo.
5. Wire the bounded customer UI and validate recovery/loading/role choices under the intended operating
   profile. Expose a usable test to the steward only after the automated acceptance passes.
6. Retain exact release/rollback evidence and publish the accepted scope. No winner is assumed; if a role
   fails, retain the working route, correct the specific defect and rerun affected fresh acceptance.

## Five functions and customer acceptance scenarios

Each function needs at least eight distinct, prospectively frozen scenarios, three attempts per model
where the model participates. Repetitions are reported separately from unique tasks. Model-free control
tests run once per implementation/version, not three times merely because three models exist. Development
fixtures and known failures are regressions, not unseen acceptance. Freeze the final scenario bundle,
role-specific time/context/output budgets and versioned runtime settings before scored model responses.
This document freezes the implementation acceptance baseline, not the later scored-run corpus/runtime
seal. That separately committed seal is required before model qualification begins.

| Function | Capability IDs | Required scenarios (minimum coverage, not eight restatements of one task) |
|---|---|---|
| Chat/continuity | C01 C02 C15 C16 | new login/new chat; reopen and continue; correct current-turn topic; preserve explicit constraints; meaningful rewrite/summary; sign-out/in recovery; separate projects/users; provider/incomplete-response recovery without saving a false completed turn |
| Approved-source research | C03 C04 | retrieve relevant sections through selected adapters; exact citations; conflicting versions; honest missing evidence; unauthorized-source denial; revoked/stale source exclusion; injected instructions/fake receipt rejection; source/dependency loss without fabricated support |
| Bounded real Code | C06 C07 | inspect project; create a function; change existing function; execute passing tests; observe/fix failing tests; reject unsafe/outside-root access; detect concurrent/stale changes; restore an exact owned change and re-run verification |
| Conversational actions | C12 C15 | plan then execute/observe; read-only denial; ask-every-time approval; bounded safe-autopilot; revoke before effect; cancel/stop; restart/duplicate reconciliation; truthful pending/failed/completed/rolled-back display |
| Deeper review | C02 C06 | cross-file bug; long-document contradiction; current vs obsolete policy; planted security issue; unsupported assertion; evidence-backed explanation; malicious quoted tool result; honest insufficient-context report |

Minimum model quality remains >=90% acceptable task attempts and zero critical failures for each
reported role. Exact contract checks and mandatory product scenarios require 100%. Report a task's final
success and any repaired model mistake separately. A model that cannot run is `blocked`, not passed,
and remains on the roster with diagnostic evidence. No role can be selected without its own evidence.

## Concrete M1 execution/data boundary

- Use isolated, disposable projects with generated non-private fixtures. Real filesystem effects must
  be contained in application-created roots, reject symlink/reparse/path escapes and have exact pre/post
  hashes. No legacy repository or real household project is a test fixture.
- First code envelope: JavaScript text/project files and explicitly selected tests, actual execution
  through the reviewed local isolation boundary, finite wall-clock/memory/output/process budgets, no
  stdin/secrets/network. Preserve the existing Gate 7E primitive; no unrestricted terminal, package manager,
  Git publication, deployment, desktop automation or connector is silently enabled by M1.
- PostgreSQL owns durable task/grant/receipt/effect state; LangGraph owns resumable workflow state.
  Do not promote the synthetic in-memory snapshot adapter or introduce JSON files as another authority.
- Keep trusted application state separate from source/tool text. Recheck actor/project/task/grant,
  expiry, revocation, exact arguments and current state immediately before the effect. Receipt text in
  a file is never execution evidence. An uncertain after-effect crash requires reconciliation, not rerun.
- Research in M1 means explicitly supplied/project-authorized sources. The actual Nomic/Qdrant/windowed
  BGE path must be tested when search is required; direct explicit-source reads are not relabeled vector
  search. Live web is C04/M2, visibly remaining work rather than an unmentioned permanent limitation.
- Chat does not silently gain project executors. Owner/admin/learning/recovery controls are unchanged.
- Synthetic candidate data only; do not open private conversations or protected stores for evaluation.
  No production model-routing change until exact candidate/customer checks and rollback pass.

## Completion evidence and rollback

For each delivered function retain source commit, deterministic test results, exact scenario/model/runtime
pins, every model attempt, independent output/effect checks, application-route/browser evidence and
remaining limitations. The selected function must work without the evaluator injecting its expected
answer or bypassing the application's scope/approval path.

M1 closes only after all five functions have accepted evidence, three-model dispositions are explicit,
the user completes the bounded customer trial, and the deployed scope/recovery is reconciled. A partial
module commit is progress, not M1 completion. Keep the current release/config as predecessor; roll back
only the candidate route/owned effects, preserving later user data. A failed trial returns the affected
function to work without erasing passed historical evidence or unrelated roadmap items.

## Next implementation slice

Active work remains M1-S2, specified in
`../gate7f/function-first/M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`. The complete R10
result leaves only Chat and Code qualified and does not support a customer route.
R12 was the next finite correction under its prospectively frozen criteria. The
steward reaffirmed continuation until completion or genuinely needed human
testing. Internal module, commit and publication checkpoints are not turn-ending
gates. R12, R13 and R14 model execution and independent review are complete. R14 provides qualifying
Chat, Research, Code and Agent routes but no Review route. The prospective R15 contract and deterministic
implementation now address the measured generic Review evidence-limit/structured-output defects and the
two nonqualifying Agent defects without candidate branching, case-answer injection, threshold change,
subset retry or favorable pooling. The next gate is commit/reseal, fresh controls and real-browser proof,
then a fresh full 360+12 qualification plus candidate-blind independent review. The customer trial stays
hidden until all five M1 functions have a qualifying route. The M1-S1 result below is retained history.

M1-S1: role-separated provider contract and compatibility wiring, with current-state/receipt acceptance
requirements captured for the later project tools. This is first because all three model comparisons and
real functions need a common boundary. No three-model result, new project executor or product release is
claimed by M1-S1. Human testing is not needed until the candidate customer journey is ready.

Local implementation update, 2026-08-28: M1-S1 source wiring and deterministic verification now pass;
see `../gate7f/function-first/M1-S1-RESULTS-2026-08-28.md`. This does not close the five-function milestone.
The next-slice decision must retrieve this roadmap and record its own finite acceptance before extending
chat/context and real project functions. The Qwen3.6 readiness plan is
`../gate7f/function-first/QWEN36-READINESS-PLAN-2026-08-28.md`; it can run alongside shared function work.
Neither the old two-arm runner nor its seals may be widened in place.

Live R15 gate update: inference is still paused. Three fresh create-only stages exposed only method
defects: stale archive-count publication, transient-root exact-set admission, and a resource watchdog
whose 15-minute lifetime equaled the permitted 15-minute browser-witness wait. The first two stopped
before controls; the third completed controls 01-09, timed out at the browser witness, and invoked no
model. Functional-control resources now live 30 minutes for one 15-minute witness window; the separate
publication proof lives 45 minutes for its two sequential witness windows. Deterministic tests require
both resource windows to exceed their complete permitted waits. Commit/reseal and one fresh
controls/browser pair must pass before the Gemma-first arm begins.
