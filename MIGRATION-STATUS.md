# RunaAI migration status

Status date: 2026-09-03. This is the living migration handoff for RunaAI-Next. Update it in the same
commit whenever a gate changes repository direction, authority, implementation status, safety
boundaries, verification state, or the next planned work.

## Required product-roadmap retrieval

Before choosing the next slice, run `node roadmap/read-next-slice.mjs` and read `PRODUCT-ROADMAP.md`
and `roadmap/CURRENT-SLICE.md`. The 2026-08-28 steward direction makes the existing five-function plan
**Milestone 1 only**, with all 17 broader capability families retained. Three primary candidates are in
scope: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B, Qwen3.6 27B MTP. Build/test real shared functions before
model-role selection; do not repeat the stack bakeoff or silently omit Qwen3.6. Existing frozen results
are unchanged. M1 is authorized, not complete; its first local wiring result is recorded below.
The steward authorized necessary non-destructive work and commit/push to RunaAI-Next without recurring
permission requests. Human involvement is reserved for genuine customer tests or human-only operations.

### Current checkpoint: Gemma-primary application implementation active

**M1-S2A checkpoint, 2026-09-02:** the conversation lifecycle, Settings and honest
Omen/Control/Home status implementation is complete in the working branch and deterministically green.
The browser UI uses one work canvas and now exposes search, archived records, rename, branch, archive,
export and recoverable delete. Four low-risk preferences persist per participant; intelligence remains
governed. Connection rows remain non-executable until their actual slices. Focused/cross-gate/roadmap
checks pass 12/12, 91/91 and 15/15; the owned predecessor-upgrade PostgreSQL proof passes 25/25. The restricted tracked run reported four permission-only Windows
ACL/process failures; its exact source file passed 31/31 in the required unrestricted Windows context,
so no blind full-suite retry or model run occurred. Independent publication review returned GO with zero
P0/P1 findings; the exact actual Control
database/browser/release gate remains open. No production route changed. See
`gate7f/function-first/M1-S2A-CONVERSATION-SETTINGS-SYSTEM-RESULTS-2026-09-02.md`.

**M1-S2B criteria freeze, 2026-09-02:** independent review returned GO with P0=0/P1=0 for
`gate7f/function-first/M1-S2B-OMEN-LOCAL-CONTEXT-CONNECTION-CRITERIA-2026-09-02.md`. The new deployment
cannot copy the legacy localhost assumption: Control cannot read Omen paths. A loopback-only Omen
companion retains DPAPI-protected local root/key custody while Control PostgreSQL retains
participant/project/device authorization and immediate revocation. File and fixed-command local-Git
reads require pre-read Control capabilities and signed receipts; models, writes, remotes and production
routing remain out of scope. The original criteria were published in `3c1dc57`, after which implementation
began. Only the Git layer is now paused pending independent review and publication of the actual-startup
amendment.

**M1-S2B actual checkpoint, 2026-09-02:** Control authority contracts pass 5/5 focused and 9/9 actual
PostgreSQL checks. The prior Omen local-file proof passed 14/14 actual DPAPI/Windows-handle checks, but
shared native/helper bytes have since changed, so it is historical until one affected-scope rerun. The
first actual Git/MXC run stopped before Git startup on MXC custom-environment error
`0x800700CB`. The no-environment, fixed-command-line amendment has independent GO with P0=0/P1=0 and was
published in `44ead36`. The corrected implementation passes 8/8 focused checks and awaits exact-byte
independent review plus a source commit before one affected-scope actual retry. That review stopped the
prospective bytes at P0=0/P1=7 before actual execution; the findings and finite correction plan are in
`gate7f/function-first/M1-S2B-GIT-IMPLEMENTATION-REVIEW-STOP-2026-09-02.md`. All seven corrections and the
expanded actual-proof source then passed 13 focused checks, but a second exact-byte review stopped the
prospective bytes at P0=0/P1=8; a third review stopped the next bytes at P0=0/P1=5; and a fourth review
stopped at P0=0/P1=2 because watcher close did not prove final event drainage and the actual proof lacked
a mutate-and-restore watcher arm. The watcher now waits for bounded close/drain and rechecks its final
state; the actual proof requires the byte-neutral mutation to be detected. Both corrections and the amended
proof passed 13 focused checks, but a fifth review correctly found that watcher `close` was not an event
drain and the proof mutation ran before contained-child completion, again P0=0/P1=2. The latest correction
keeps the watcher enabled through a 250-millisecond quiet/drain barrier and fires the proof mutation after
successful child close; the amended proof and 13 focused checks are green. Fresh
independent review returned GO with P0=0/P1=0, and the reviewed source was committed as `11fa6c1`. Its
affected actual Windows proof stopped at
`confirm-and-protect-root` with `native-operation-failed`; no Git/MXC/network proof followed. Read-only
reflection confirmed the root cause: pinned Windows PowerShell 5.1 exposes only the two-argument
`System.IO.File.Move`, while the helper used the newer three-argument overwrite overload. The retained RCA
and `MoveFileExW` correction plan are in
`gate7f/function-first/M1-S2B-ACTUAL-WINDOWS-FAILURE-RCA-2026-09-02.md`. Corrected bytes remain
non-executable. Six syntax checks, 14/14 focused checks, PowerShell parsing and the updated native release
pin are green; fresh independent review returned GO with P0=0/P1=0. A new source commit remains mandatory.
That correction was committed as `0b4e1d4`, but the one affected Windows proof stopped at the same
`confirm-and-protect-root` stage. Read-only diagnostics proved the embedded native type compiled and found
the immediate cause: the clean pinned Windows PowerShell 5.1 host had not loaded the `System.Security`
assembly before the DPAPI reference. Explicit loading succeeds. The prior `File.Move` finding was a real
latent defect, not the first failing substep. The amended correction adds explicit assembly loading, fully
qualified DPAPI types and typed assembly/protect/unprotect failures. Six syntax checks, 14/14 focused
checks, PowerShell parsing, the updated release pin and a read-only pinned-host DPAPI assembly probe were
green; those bytes remained non-executable pending review and commit. Models,
browser/HTTPS acceptance and production remain untouched.
The first amended-correction review returned NO-GO with P0=0/P1=1 because the DPAPI PowerShell helper had
been inserted inside the embedded C# here-string. No actual proof ran. The function is now outside the
here-string, and a pinned-host regression extracts and compiles the exact embedded C# bytes while separately
asserting helper placement. Focused checks pass 15/15. Fresh exact-byte re-review returned GO with
P0=0/P1=0; correction `2b77422` was then source-sealed and passed the affected actual Windows proof 19/19.

**M1-S2B Git witness stop, 2026-09-03:** the separate actual Git proof stopped on its first
`contained-git-status` operation with `omen-git-source-changed`; no later Git verb,
process/timeout/network arm, browser, model or production work ran. The witness exposes no event category,
so this result cannot distinguish a real repository mutation from MXC's known reversible DACL
notifications. Acceptance remains stopped pending the independently reviewed, single-operation
aggregate diagnostic in
`gate7f/function-first/M1-S2B-ACTUAL-GIT-WITNESS-FAILURE-RCA-2026-09-03.md`. The one-operation diagnostic
source is now implemented with separate name/content/metadata/security watchers, complete tree-byte and
owner/group/DACL equality checks, bounded lifecycle/cleanup checks and aggregate-only output. Its Node syntax,
two focused source/parser preflights and pinned PowerShell parse are green. It has not run. Independent
review stopped that draft at P0=0/P1=4: watcher errors were not fatal, abnormal cleanup did not prove terminal
exit, the process audit could accept no observed processes, and the policy-template pin was checked too late.
The revised source closes each point with a fail-closed error gate, bounded post-kill close proof, required
pinned MXC/Git process observations and pre-fixture template-digest verification. It has not run; focused
source/parser/observer/native checks pass 17/17, roadmap checks pass 15/15, and fresh exact-byte re-review
returned GO with P0=0/P1=0. Commit `fe0e3be` sealed those bytes. Its single diagnostic execution stopped
before category watching, MXC or Git at `start-process-audit` because the process monitor did not publish
ready within the five-second file-only wait. Read-only cleanup verification found zero owned roots and zero
matching helper processes. This is a diagnostic-startup/method failure, not an application, Git or model
failure. The runner had discarded monitor stderr and did not race early exit, so the underlying WMI-start
condition is unknowable from retained evidence. The correction bounds and hashes stderr, races ready against
terminal/error, gives actual Omen startup a bounded 30 seconds, starts the separate 30-second observation
budget only after WMI is armed, and repins the helper. It remains unexecuted. Focused checks pass 17/17,
roadmap checks pass 15/15, pinned
PowerShell parsing and the helper pin pass, and fresh exact-byte review returned GO with P0=0/P1=0. At that
point, a new source commit remained required before one corrected diagnostic and acceptance remained paused.
Commit `207194b` sealed that correction. The single run stopped before category watching, MXC or Git with
process exit 1, 368 bounded stderr bytes, retained SHA-256
`da49ffd40d89c76e2487f1e494bb52154b1ec43a1522a0ce698d59346ac2fd82` and no output overflow. Cleanup again
left zero owned roots/helpers. Read-only pinned-host probes show management type resolution, watcher
construction, timeout configuration and disposal succeed without starting WMI, narrowing the missing stage
to WMI start versus ready publication. The monitor now emits an allowlisted structured error containing only
stage code, exception class, numeric HResult and optional management-status name; messages/paths are excluded.
The wrapper strictly validates it and otherwise retains only count/hash. These bytes are unexecuted pending
focused preflight, independent review and a source commit. The first review stopped at P0=0/P1=1 because the
parser did not reject unknown keys despite the exact-schema claim. It now requires exactly the six allowed
keys, with positive and extra-key rejection coverage. The revised bytes remain unexecuted. Focused checks
pass 18/18, roadmap checks pass 15/15, parser/pin checks pass, and fresh exact-byte re-review returned GO with
P0=0/P1=0. At that point, a source commit remained required before one typed diagnostic. Commit `b2cd9af`
sealed it. The single run conclusively stopped before category watching, MXC or Git at
`process-audit-wmi-start-failed`: `ManagementEventWatcher.Start()` is incompatible with the ordinary Omen
context (MethodInvocationException, HResult -2146233087; bounded 253-byte error hash retained). Cleanup left
zero owned roots/helpers. That event-subscription design is retired. A proposed CIM-polling replacement was
stopped before execution by independent review (P0=0/P1=3): snapshots could miss short-lived descendants,
the proof did not bind the exact expected parent/child PIDs, and abnormal-cleanup safety was not proven. No
polling proof or Git operation ran. The current correction removes process accounting from this narrow
event-classification diagnostic. It proves only one pinned MXC wrapper child closed with exit 0, native-guard
release with no surviving guard, unchanged repository tree/security descriptor, aggregate event categories,
zero watcher errors and owned-root cleanup. It does not claim exhaustive descendant accounting; that remains
a separate Git-acceptance blocker. The first narrowed-byte review stopped at P0=0/P1=2 because successful
cleanup was recorded but not enforced and an abnormal MXC-wrapper terminal miss could leave that exact child
alive while deleting its root. The correction retains the exact child handle and terminal promise, kills and
requires bounded close on every abnormal path, preserves the root when closure cannot be proved, and enforces
owned-root removal before success. The focused suite passes 17/17, roadmap verification passes 15/15, Node
syntax/diff checks are green, and independent exact-byte re-review returned GO with P0=0/P1=0. The reviewed
bytes remain unexecuted and must be source-committed before one diagnostic resume. No model/network or
acceptance work is included. Acceptance remains paused.
Commit `c46c7e1` sealed those reviewed bytes. The one diagnostic attempted at most one contained local status
operation and stopped at `finish-category-witness` with `diagnostic-lifecycle-invalid`; whether the MXC wrapper
or Git process started or completed is unknowable from retained evidence. It did not run any successor.
Read-only cleanup verification found zero owned roots and zero matching helpers after excluding the probe
itself. The retained public error omitted the exact lifecycle failures and aggregate values, so the failed gate
cannot be determined from sealed evidence. This is a diagnostic-publication failure, not a model result. The
correction emits only allowlisted failure codes and typed counts/booleans from the existing aggregate, with
unknown observer codes collapsed to `unknown`; focused regressions cover independent gates and rejection of
private fields. Focused checks pass 19/19, roadmap checks pass 15/15, syntax/diff checks are green, and fresh
exact-byte review returned GO with P0=0/P1=0. Revised bytes remain unexecuted and require a new source commit
before one diagnostic resume. Acceptance remains paused.
Commit `b2e0ff0` sealed that publication correction. The one resumed diagnostic produced complete evidence
and stopped without a successor: one MXC wrapper closed with Windows status `3221225794`
(`0xC0000142`, `STATUS_DLL_INIT_FAILED`), while the observer returned `omen-git-source-changed`. The independent
classifier saw name/content/metadata/errors `0/0/0/0`, security notifications `84`, unchanged repository tree
and final security descriptor, successful guard release, zero guard survivor, watcher exit 0 and verified
root removal. Read-only postcheck found zero roots/helpers. This proves two non-model defects: the observer
conflates temporary MXC DACL notifications with source mutation, and the sandboxed Git target did not
initialize under the frozen no-environment/no-write policy. Read-only PE inspection shows that the pinned Git
executable imports `USER32.dll`; together with the installed MXC SDK warning that some Windows command-line
programs cannot start while UI is blocked, this makes UI blocking the bounded leading hypothesis, not yet a
proven cause. Independent review stopped the first correction design at P0=0/P1=3 before implementation: its
explicit environment contradicted the actual Omen MXC rejection and frozen criteria, its runtime surface was
too broad, and its watcher abort/cleanup ordering was incomplete. The replacement design preserves omitted
`process.env`, zero writable paths and the fixed direct `git.exe` invocation; changes only
`ui.allowWindows:true`, which permits Win32 UI/window creation, while retaining container isolation and no
clipboard/input/system-control/settings/IME or network access; and specifies a pinned, one-use, stdin-bound
typed witness that latches and aborts on the
first prohibited event before any output parsing or publication. Acceptance remains paused for corrected
design review, implementation, preflight, independent exact-byte review and source commit before exactly one
further disposable proof. No retry/model/network/browser/production work is authorized before those gates.
The corrected design then received independent GO at P0=0/P1=0 and was sealed in doc-only commit `904d52e`.
The first implementation review stopped the prospective code before execution at P0=0/P1=8: two lifecycle
leaks/terminal-state errors, an abort-to-spawn race, a stale security-snapshot interval, path-following ACL
risk, no pre-bind UI cancellation, excessive/unchecked UI instrumentation, and stale proof-manifest fields.
All eight are now corrected in the working tree. Focused Omen checks pass 26/26; both sidecars parse and their
embedded C# compiles under pinned Windows PowerShell 5.1. The corrected implementation uses real-close
tracking, abort barriers, native no-follow handles, three stable final security snapshots, least-privilege
input-desktop observation, checked Win32 cleanup and an early policy-pin assertion. Its separately gated
disposable Windows witness preflight is written but deliberately unexecuted. Fresh independent exact-byte
review and a source commit remain mandatory before that preflight; one actual Git proof is admitted only if
the committed preflight passes. Models, browser, HTTPS, network and production remain untouched.
A follow-up exact-byte review confirmed the original eight production findings closed but returned
P0=0/P1=3 on deployment/preflight integrity: checkout line endings could invalidate the pinned sidecars,
preflight failures could delete a fixture before every sidecar was terminal, and a stable junction target
could false-green without an exact entry count. The working tree now pins both sidecars to LF, retains and
requires terminal closure for every preflight handle before cleanup, preserves unresolved fixtures, and
requires the exact three-entry clean junction snapshot. Focused checks remain 26/26 and enforce the Git
attributes. The amended bytes remain unexecuted pending fresh independent GO and commit.
Fresh current-byte review returned GO with P0=0/P1=0 and independently verified all eleven findings closed,
both LF-stable hashes matching their pins, 26/26 focused checks, 15/15 roadmap checks, five syntax checks and
a clean diff check. The actual preflight remains unexecuted until this reviewed tree is source-committed.
Commit `ac10286` sealed that reviewed tree. Its single gated actual Windows witness preflight passed 4/4:
static-junction non-traversal, completion-boundary replacement detection, clean UI pre-bind cancellation and
owned-fixture removal. The record reports no model or production change; it ran no Git/MXC, network or browser
operation. One corrected actual Omen Git proof is now admitted. Any actual failure stops again for RCA.
Documentation commit `495571d` sealed the preflight record. The one admitted proof then stopped on its first
`contained-git-status`: Git now initialized but exited 128; the observer retained 67 stderr bytes and SHA-256
`be29fcd5bc1ca2b48bf12070ba2149e0e33c02730419a50a5cfbeae997c6a5d2`. No successor Git verb or network test
arm ran; cleanup removed the root and a read-only postcheck found zero matching sidecar/MXC/Git helpers. This
confirms the prior loader and false-mutation defects are corrected, but the current privacy-safe error lacks a
fatal-category field, so the Git cause is unknowable from sealed evidence. Acceptance is stopped. The RCA now
freezes one bounded allowlisted stderr classifier and one single-status diagnostic after deterministic tests,
independent review and commit; no full proof retry is permitted before the resulting functional RCA/fix.
The first review of that diagnostic design stopped at P0=0/P1=2: category matching and ambiguity behavior were
not exact, and success/fatal/harness-failure lifecycle records were not fully frozen. No diagnostic ran. The RCA
now defines ordered case-sensitive whole-buffer signatures with malformed/near/multiple matches forced to
`unknown`, exact completed/error schemas and null rules, one shared first-status fixture, pre-fixture pin checks,
terminal wrapper/witness/guard evidence, safe fixture retention/removal and explicit one-operation/no-successor
evidence. Revised design bytes await fresh independent review before implementation.
The next review reduced the design stop to P0=0/P1=1: the dubious-ownership advice block was named but not
literal. The RCA now freezes three complete LF-framed variants, exact blank line and tab indentation, quoted
byte-identical private path reuse, and `unknown` for every deviation. No diagnostic has run; revised design
still requires fresh GO before implementation.
Fresh design review returned GO with P0=0/P1=0 and doc-only commit `2dbe284` sealed it. The bounded classifier,
exact public record contract and shared one-status diagnostic mode are now implemented but unexecuted. The
diagnostic uses the existing actual proof fixture through its first status, records one wrapper/two witnesses/
one native guard, branches before every successor/network arm and requires unchanged repository bytes plus
terminal cleanup. Focused Omen tests pass 33/33, four Node syntax checks and `git diff --check` pass. Independent
exact-byte implementation review and a source commit remain mandatory before the one admitted diagnostic.
Acceptance and the model campaign remain paused.
The first implementation review stopped execution at P0=0/P1=4: permission phrases were not counted exactly,
contradictory operation state could be collapsed during error publication, diagnostic mode started live probe
listeners, and the root could be deleted before every owned resource was independently terminal. No actual run
occurred. The correction requires exactly one permission phrase, rejects contradictory lifecycle values, keeps
identical inert fixture remotes and no listener through the shared first status, defers full-proof probes until
after that status, and kills/releases plus boundedly awaits exact child/witness/guard handles before deletion.
Unresolved cleanup preserves the root. Focused Omen checks pass 33/33. Fresh exact-byte review remains required
before source commit or the single diagnostic; acceptance remains paused.
Fresh current-byte review returned GO with P0=0/P1=0 and independently reproduced focused checks 33/33,
roadmap checks 15/15, four syntax checks and a clean diff check. No actual operation ran. A source commit is now
the only remaining gate before the single admitted diagnostic; acceptance and model testing remain paused.
Commit `69f3284` sealed those bytes. The single diagnostic then completed and stopped after exactly one status:
Git exit 128, `failureKind:working-directory`, the same 67-byte stderr hash, unchanged repository, terminal
wrapper/two witnesses/native guard and removed fixture. No successor, private value, model or production action
occurred. This conclusively attributes the failure only to the fixed `working-directory` family; the private
message/path and whether outer, contained or later Git cwd transition failed remain unknown. Dual selected-root
cwd coupling is the bounded leading adapter hypothesis. The frozen correction moves both cwd values to the
already-admitted pinned Git installation root and explicitly binds every
Git command with `--git-dir=<root>\\.git` plus `--work-tree=<root>`, retaining all existing read-only, identity,
extension, environment, witness and network closures. No extra profile/parent/drive/write grant is allowed.
The policy normalizer/pin must change to `<GIT_INSTALL_ROOT>` and pre-spawn checks must bind both inner and outer
cwd values. Deterministic disposable-repository equivalence must cover all five spawned public verbs, unchanged
bytes, and timeout/network explicit binding before independent review and commit. Only then may one corrected
single-status confirmation test the hypothesis; any failure stops again. The first design review returned
P0=0/P1=3 and prompted these corrections. No correction or retry has run. Acceptance and models remain paused.
Fresh corrected-design review returned GO with P0=0/P1=0 and confirmed all three omissions closed. Roadmap
checks pass 15/15 and the diff check is clean. A doc-only design commit now precedes implementation; no actual
retry, model, browser, network or production action has run.
Commit `e3434f9` sealed that reviewed design. The cwd decoupling, explicit `--git-dir`/`--work-tree` binding,
`<GIT_INSTALL_ROOT>` policy pin, pre-spawn inner/outer cwd checks and timeout/network source gates are now
implemented but unexecuted. A native disposable-repository equivalence gate found and corrected two additional
preflight command defects before any actual retry: Windows Git rejects `core.excludesFile=NUL`, so the closed
override is now empty, and `show` combined a trailing `%x00` with `-z`, producing a duplicate empty field. The
five public verbs now parse identically from selected-root and decoupled cwd with an unchanged repository tree.
Omen checks pass 35/35 and roadmap checks pass 15/15. Independent exact-byte implementation review and a source
commit still precede exactly one corrected single-status diagnostic. Acceptance and models remain paused.
The first implementation review stopped at P0=0/P1=3: policy normalization could mask selected-root authority
drift, the native gate did not authenticate its Git inputs/prove zero stderr and the empty excludes override, and
outer-cwd source regexes could false-pass. The correction now validates exact canonical read-only/write/deny
authority before normalization, hashes Git/system config/system attributes before fixture creation, proves a
controlled ambient ignore is defeated by `core.excludesFile=`, requires zero stderr, and routes all three child
paths through a captured pinned-cwd spawn boundary with exact call-site checks. The zero-stderr gate additionally
found an ambient `diffstat` line-ending warning; `core.safecrlf=false` suppresses that warning without changing
autocrlf conversion semantics. Omen checks again pass 35/35, roadmap checks pass 15/15, all changed JavaScript
parses and the diff check is clean. No actual operation ran; fresh re-review is the remaining pre-commit gate.
The second implementation review confirmed the code findings closed but stopped at P0=0/P1=1 because the
normative M1-S2B criteria still contradicted the amended argv/cwd contract. The criteria now mark the old values
historical and freeze explicit repository binding, pinned inner/outer cwd, exact path authority, empty excludes,
safe-CRLF warning closure and the corrected show terminator. No actual operation ran; deterministic checks and
fresh exact-byte review must repeat before commit.
Fresh exact-byte re-review returned GO with P0=0/P1=0 and reproduced focused checks 35/35, roadmap checks 15/15
and a clean diff check. No actual operation ran. A source commit is now the remaining gate before the one
single-status diagnostic.
Commit `77b3eeb` sealed the reviewed correction. Its sole actual status stopped with exit 128,
`failureKind:permission-denied`, 50 stderr bytes and hash
`25796725b6f5b304af0f76f2361e36b924b4a4e74bbe8b36887a1af9d84b329a`; repository/resources/fixture cleanup
all passed and a read-only postcheck found zero roots/helpers. No successor/network/browser/model/production
action ran. The prior cwd fatal is gone, but the record does not reveal whether runtime, refs, objects, index,
attributes or work-tree access was denied. Acceptance stopped again. The frozen next diagnostic uses only
existing local read-only verbs in order `branches -> show -> diffstat -> status`, proves unchanged/terminal state
between operations, stops at the first fatal/error and publishes only fixed attempt aggregates. It permits no
remotes, timeout, process audit, network, browser, model or production work and gives no acceptance credit.
Deterministic tests, independent review and a source commit precede its one execution.
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
Implementation preflight then used the real Omen Windows ACL APIs only on disposable user-temp directories. It
found and corrected a fast-exit output-bound race plus probe setup/cleanup defects without touching `C:\`. The
final probe proved successful target-only writes, exact rollback, exact child preservation and cleanup, but also
proved Windows reorders the two added ACEs relative to the theoretical `SetEntriesInAclW` buffer. Production
execution remains blocked. Independent review rejected the first relaxed semantic rule at P0=0/P1=1 because it
did not constrain allow-versus-deny placement. The RCA now freezes canonical DACL order, exact ACL headers and
raw target ACEs, prior-ACE relative byte preservation, atomic actual-post journaling and phase-aware revalidation;
fresh design GO remains mandatory before implementation resumes. No Git diagnostic, model or browser ran.
Fresh design re-review then returned GO with P0=0/P1=0. The first exact-byte implementation review stopped the
prospective source at P0=0/P1=9 before any actual operation. The nine corrections now cover the secured mutex and
abandoned-owner stop, protected path/identity guards, probe identity, truthful native API failure handling,
immediate rollback drift checks, one journal schema/path, exact JavaScript journal semantics and Win32 bounds,
the deprovision pin-drift tuple, and an executed coordinator crash/write matrix. The first corrected identity
smoke stopped because its expected extended path was missing one leading slash and it incorrectly treated rename
blocking as the invariant on this Windows build. The RCA now requires rename detection; the single amended rerun
passed exact path, rename detection, hardlink/reparse rejection and cleanup. The complete focused Omen suite now
passes 62/62, release pins match the executable source, and no UAC, `C:\` write, Git diagnostic, browser or model
ran. Fresh exact-byte
implementation re-review and a source commit remain mandatory before the sole elevated execution.
That re-review reproduced 62/62 focused and 15/15 roadmap checks but returned NO-GO at P0=0/P1=6: mutex
protection/abandoned/deprovision result paths, temporary-journal identity, immediate prepare/deprovision root path
binding, conflicting target-SID journal validation, probe cleanup classification, and execution of the production
coordinator rather than a disconnected model remain incomplete. The RCA freezes the six corrections. The prior
green counts no longer admit commit or elevation; no actual operation ran.
The first mutex correction smoke then stopped only at the literal protected-SDDL comparison; busy, abandoned and
wrong-security checks passed. A bounded read-only SYSTEM/Administrators serialization diagnostic is the sole next
action. The commit/elevation gate remains stopped.
The pinned-5.1 serialization diagnostic then proved the exact protected form is
`D:P(A;;0x1f0001;;;SY)(A;;0x1f0001;;;BA)`; the initial oracle had used `GA` for the same FullControl intent.
Production and test literals now match the actual runtime. No protected object was changed.
The first prepare/deprovision mutex-publication test then stopped because its ordinary-user abandoned-owner worker
tried to reopen the intentionally SYSTEM/Administrators-only object and was correctly denied. The fixture now
passes its existing authorized handle across threads without changing the ACL; the interrupted run has no gate
credit and no system mutation occurred.
That cross-process design also failed because the ordinary child cannot open the protected production mutex; its
apparent abandoned record was a false positive from the outer catch and ownership was not released. The fixture is
retired. A production C# wait helper will operate on an already-authorized handle, distinguish busy/abandoned and
release abandoned ownership; same-handle Windows tests and exact two-operation tuple tests replace the invalid
cross-process oracle.
The first same-handle run then stopped before execution because a second PowerShell 5.1 `Add-Type` could not
resolve the production type from a prior in-memory assembly. The exact production source and test driver will be
compiled as one unit; no mutex behavior or system path was exercised by that failure.
That unit still failed to compile because the appended driver left `using` directives after production type
declarations. Those directives are removed and the test-only threading names are fully qualified; production bytes
were not changed by this fixture error.
The corrected helper smoke passed. All six review findings are now addressed in current source: protected mutex
and same-handle wait/release, held temp/final journal identity, three immediate root path-binding gates, target-SID
conflict rejection, executed cleanup-failure retention/recovery, and a production trace coordinator that gates
public completion. Its matrix executes 33 lifecycle/failure/crash sequences; the disconnected model was removed.
The complete focused Omen suite passes 61/61 and source pins match. Fresh exact-byte review, 15/15 roadmap checks,
clean diff and source commit still precede elevation. No actual-root, Git, browser, network or model operation ran.
Fresh re-review closed those six findings but returned NO-GO at P0=0/P1=1: the probe cleanup detected an identity
mismatch yet still pathname-deleted after releasing the handle, risking deletion of a replacement. Cleanup is being
changed to retain-and-stop on any mismatch, with a held-identity removal helper and an actual temp rename/replacement
test. Commit and elevation remain blocked.
The corrected temp rename/replacement smoke passed and proved the replacement marker remained untouched while the
identity mismatch failed closed. Production now skips deletion after any mismatch; source pins are refreshed.
The complete focused Omen suite passes 61/61; independent re-review remains.
Final independent exact-byte re-review returned GO with P0=0/P1=0 and reproduced focused 61/61, roadmap 15/15,
release pins 6/6 and the clean diff. It confirmed mismatch cleanup cannot delete a replacement and all prior six
findings remain closed. No actual operation ran. A source commit now precedes the one elevated transition.
Commit `4388d0a` sealed those exact reviewed bytes. A post-commit check independently hashed all five committed
Git blobs covered by the transition release pins and matched 5/5; the branch was clean and ahead of its remote.
The first attempt to launch the elevated transition was rejected by the execution safety gate before process
creation because the operation writes a persistent protected security descriptor on `C:\`. No UAC prompt,
transition script, root ACL write or Git diagnostic occurred. This is a pre-execution authorization block, not an
actual-system or model failure. At that checkpoint, the next proposed step was one sealed transition plus its
automatically chained permission-boundary diagnostic, subject to explicit informed approval. The 2026-09-03
server-managed-workspace decision below superseded that sequence; the transition is no longer next and must not run
on the primary Code path.

**Omen isolation-alternative assessment, 2026-09-03:** a read-only host and contract comparison found that
Runa can avoid the `C:\` root DACL only through a new or not-yet-available backend, not a ready configuration
switch. A Runa-owned dedicated low-privilege worker is feasible but needs its own identity, broker, per-root ACL,
firewall, lifecycle, UI/process containment and actual-system acceptance design; Codex's two enabled sandbox
accounts prove only that Omen supports the pattern and must not be reused. Restricted-token-only execution is
weaker than the frozen read/network boundary. WSL2 has no installed distribution and firmware virtualization is
disabled; it also changes path, Git, identity and witness contracts. Windows Sandbox is unavailable on the current
Home/firmware configuration. MXC BaseContainer is the preferred future no-root-DACL path but requires build 26600+
and its feature, while Omen is build 26200; AppContainer+BFS is disabled in shipping MXC because of its documented
host-deadlock risk. Therefore the sealed AppContainer+DACL transition remains the only ready equivalent path for
the then-selected Omen-local design and still required explicit informed approval. No system or acceptance operation
ran. Full comparison:
`gate7f/function-first/M1-S2B-OMEN-ISOLATION-ALTERNATIVES-ASSESSMENT-2026-09-03.md`.

**Server-managed workspace correction, 2026-09-03:** the steward clarified and approved that normal Code starts
from a connected remote Git repository materialized into a Control-orchestrated isolated server workspace. The
browser PC is not the default execution host, Home remains model-only, and the Omen transition is removed from the
primary critical path. A one-time local folder snapshot is browser-mediated; a persistent local-folder bridge is
optional non-executing file/delta transport with approved hash-guarded writeback; fully local execution is deferred.
Control's accepted Gate 7E sandbox is reusable foundation, but repository credentials, clone/fetch containment,
multi-file execution, Git effects, worker lifecycle and actual browser acceptance remain unproved. The historical
Omen bytes/reviews are preserved and must not be executed or relabelled. No system, Git, browser, model or production
operation ran. Accepted architecture:
`gate7f/function-first/M1-S2B-SERVER-MANAGED-WORKSPACE-ARCHITECTURE-2026-09-03.md`.
The materialization boundary is source-neutral. The first proof is exact allowlisted public HTTPS Git plus one
non-Git snapshot. A common Git architecture may later serve GitHub/GitLab/Bitbucket/Azure Repos/self-hosted/SSH
only after separate authentication and endpoint acceptance. Perforce, Subversion, TFVC, Mercurial,
cloud/file/archive and remote-folder sources retain native versions and writeback through later adapters.
Work-management connections remain context, not workspace authority. This avoids speculative provider
implementation. Register: `gate7f/function-first/M1-S2B-PROJECT-SOURCE-ADAPTER-REGISTER-2026-09-03.md`.

Independent architecture review returned GO for publication with P0=0/P1=0 after closing SSRF/redirect/DNS,
non-expanding capability-version, cross-workspace isolation, stale historical sequencing, Gate 7E scope-inheritance
and first-transport overbreadth findings. Implementation and actual-system acceptance remain blocked on the listed
criteria. Review:
`gate7f/function-first/M1-S2B-SERVER-MANAGED-WORKSPACE-INDEPENDENT-REVIEW-2026-09-03.md`.

**M1-S2B1 corrected prospective criteria, 2026-09-03:** the first independent design review stopped the draft at
P0=0/P1=7 before implementation or actual operations. The correction freezes executable strict schemas, a literal
non-expanding capability set/digest and closed lifecycle/receipt matrices; replaces native Git networking with a
network-denied materializer plus a workspace-blind enforcing HTTPS broker; defines crash-safe non-replacing Windows
publication/reconciliation; makes the browser snapshot's observable limits and upload protocol explicit; adds both
same-user/cross-project and cross-user isolation; leaves actual Home untouched; and freezes production-path fault
methods. Scope remains one public HTTPS Git materialization and one browser-folder snapshot, with no model, private
credential, project execution, change, commit or push. The six deterministic contract checks are criteria evidence
only and receive no acceptance credit. Fresh independent P0/P1 review remains required before implementation. Criteria:
`gate7f/function-first/M1-S2B1-SERVER-WORKSPACE-MATERIALIZATION-CRITERIA-2026-09-03.md`.

Fresh review of those corrected bytes is paused by review infrastructure, not by a Runa/model/test finding. Three
dispatches across two independent workers returned the same service-side HTTP 404 before producing a verdict. Local
contract checks remain 6/6 and roadmap checks 15/15, but implementation stays blocked because no independent GO
exists. The retained incident and exact continuation rule are in
`gate7f/function-first/M1-S2B1-CORRECTED-CRITERIA-REVIEW-INFRASTRUCTURE-STOP-2026-09-03.md`.

The service outage cleared, criteria were committed as `66fa658` with formatting cleanup `ec0b885`, and one fresh
independent review completed normally. It returned NO-GO at P0=0/P1=7 for one-frame Git IPC, shape-only integrity,
invalid ready-state combinations, normalizing URL admission/unfrozen network limits, inconsistent browser upload
authority, shared coordinator sibling rights and fault methods outside the topology/capability set. No implementation
or actual operation followed. The second prospective correction now adds bounded authenticated Git streaming,
canonical/computed admission, strict ready invariants, exact network/materialization policy artifacts, server-owned
upload sessions, unique operation identities/handles/DACLs, `workspace.cancel`, snapshot-expiry timeout and the exact
operation Job. Its focused checks and fresh independent review remain pending. Review:
`gate7f/function-first/M1-S2B1-SEALED-CRITERIA-INDEPENDENT-REVIEW-2026-09-03.md`.

Second-correction preflight is now green at 10/10 focused contract checks and 15/15 roadmap checks with a clean diff.
The first focused run stopped at 7/8 because its assertion used operation spelling `workspace.cancel` where the frozen
effect is `workspace-cancel`; the artifact was correct, the one test expectation was corrected, and only that focused
suite was rerun once; later cancel and exact Git-head checks expanded the final suite to ten. No live or model operation
occurred.

Commit `083c558` sealed that correction and received a normal independent review: NO-GO at P0=0/P1=5. The reviewer
reproduced 10/10 focused and 15/15 roadmap checks, then proved that the Git transcript admitted changing channel
identity/non-body payloads, malformed UTF-8 and Windows superscript device aliases could pass, receipt/source/error/
retry invariants were incomplete, four numeric limits existed only in prose, and upload expiry occurred before a
materialization existed. No implementation or actual/model operation followed. The third prospective correction binds
and authenticates exact Git transcript bytes/heads, requires strict UTF-8 and a first-proof printable-ASCII path
profile, closes lifecycle/native-version/error/retry rules, moves all limits into the hashed policy, and replaces the
timeout drill with suspension of the real materializer after durable staging. Review:
`gate7f/function-first/M1-S2B1-SECOND-SEALED-CRITERIA-INDEPENDENT-REVIEW-2026-09-03.md`. Focused verification,
source commit and another independent P0/P1 review remain mandatory. Third-correction preflight now passes 10/10
focused contract checks and 15/15 roadmap checks with a clean diff; these deterministic results earn no actual-system
credit.

Commit `b24389b` sealed the third correction and its fresh review returned NO-GO at P0=0/P1=3. The reviewer reproduced
10/10 focused and 15/15 roadmap checks, then proved that `CONIN$`/`CONOUT$` still passed, policy times were not exact
schema invariants, and the coordinator inside the Job could not terminate that Job and afterward issue a truthful
terminal receipt. No implementation or actual/model operation followed. The fourth prospective correction completes
the printable-ASCII device oracle; binds materialization, upload, workspace and reconciliation times to the hashed
policy; requires timeout to represent a real staged 120-second operation; and assigns Job/deadline/reconciliation/
terminal-receipt ownership to the external Control watchdog. Review:
`gate7f/function-first/M1-S2B1-THIRD-SEALED-CRITERIA-INDEPENDENT-REVIEW-2026-09-03.md`. Focused verification,
source commit and fresh independent GO remain mandatory. Fourth-correction preflight now passes 11/11 focused
contract checks and 15/15 roadmap checks with a clean diff; no actual or model operation ran.

Exact commit `3ea30c5` received fresh independent **GO at P0=0/P1=0**. The reviewer reproduced 11/11 focused and
15/15 roadmap checks plus the exact device-name, policy-time, staged-timeout and external-watchdog adversarial probes.
No dependency, network/endpoint, implementation, actual Control/browser operation or model invocation occurred. The
GO advances M1-S2B1 only to the separately gated Git-library package review; it provides no implementation or actual-
system acceptance credit. Review:
`gate7f/function-first/M1-S2B1-FOURTH-SEALED-CRITERIA-INDEPENDENT-REVIEW-2026-09-03.md`.

The practical `isomorphic-git@1.41.0` package gate is complete. Its exact version and matching registry SHA-512 are
retained in the repository lockfile after a lifecycle-scripts-disabled install. All 55 reviewed closure packages are
retained with registry resolution and integrity and none declares an install script. The isolated closure's 2026-09-03
advisory result remains zero. The full application reports four advisories through pre-existing Mastra/AI-SDK
dependencies whose affected versions were already present at `ff37b49`; they are tracked separately and are not
attributed to `isomorphic-git`. Runtime admission allows only the ESM core with Runa's broker and denies the package
CLI/HTTP adapters/CJS/UMD/manager/model entry points. Package checks pass 4/4. Deeper source-build, signature archival
and archive-ledger formalization are deferred release hardening rather than implementation blockers. No implementation,
actual operation or model call has occurred. The next work is the smallest public-repository materialization path,
then one exact-commit review and one real Control/browser journey. Package review:
`gate7f/function-first/M1-S2B1-ISOMORPHIC-GIT-PACKAGE-REVIEW-2026-09-03.md`.

**M1-S2B1 implementation checkpoint, 2026-09-03:** commit `13a7ca6` adds the bounded public-Git
materialization core. This authority increment adds a separate encrypted PostgreSQL store for
server-owned public-source records and idempotent `intent-recorded` workspaces. Focused checks pass 16/16 with real
disposable PostgreSQL and local Git object/filesystem integration. No Control network fetch, protected publication,
ready workspace, browser operation, production change, or model call is claimed. The preflight stopped rather than
replaying on a Windows `pg_ctl` restricted-token incompatibility, a TCP-only false readiness check, and one stale
test ledger expectation. An independent standing checker also stopped and corrected participant-wide concurrency,
record cross-binding, deadline, and cleanup issues before commit. Full RCA and exact resume boundaries:
`gate7f/function-first/M1-S2B1-IMPLEMENTATION-PREFLIGHT-RCA-2026-09-03.md`.

**M1-S2B1 candidate surface checkpoint, 2026-09-03:** the authenticated workspace surface now routes all seven
frozen server-workspace operation names. A trusted candidate configuration can idempotently connect the selected
public source; the browser cannot supply its URL/ref/commit or any host path. All operations whose real Control ports
do not yet exist fail with explicit unavailable states, and unavailable materialization creates no intent. Focused
verification passes 31/31 and independent review returned PASS. This is routing/local PostgreSQL evidence only, not
an actual Control/browser or model result. Record:
`gate7f/function-first/M1-S2B1-CANDIDATE-SERVICE-SURFACE-2026-09-03.md`.

**M1-S2B1 network-policy preflight, 2026-09-03:** the workspace-blind binary resolver classifier now passes
17/17 focused checks and independent review. It snapshots the digest-verified policy, rejects a complete answer set
on any denied member, covers every frozen CIDR boundary, and returns no address literal in observations. It performs
no DNS/network operation and earns no actual acceptance. The next implementation gate is the real TLS connector and
broker child. Record: `gate7f/function-first/M1-S2B1-NETWORK-POLICY-PREFLIGHT-2026-09-03.md`.

**M1-S2B1 Git stream-session preflight, 2026-09-03:** the bounded incremental decoder and authenticated
two-direction session now pass 15/15 focused checks and independent review. Two explicit review stops corrected
eight defects even though the earlier focused suites were green, including atomic fail-closed reuse, private-key
zeroization, directional EOF, bounded chunk-independent decoding and malformed input before the guard. No socket,
TLS, HTTP, Git fetch, Control worker/publication, browser action, production change or model call occurred. The next
gate remains the separately reviewed real TLS connector/broker child. Record:
`gate7f/function-first/M1-S2B1-GIT-STREAM-PREFLIGHT-2026-09-03.md`.

**M1-S2B1 TLS broker preflight, 2026-09-03:** the deadline-bound streaming transport, authenticated framed client,
broker child and strict TLS/HTTP connector now pass 29/29 focused checks and 54/54 combined stream/network/adapter/TLS
checks. Independent re-review returned P0=0/P1=0 after retained stops corrected lifecycle, trust, resource, unbounded
POST buffering, deferred rejection and timing-sensitive evidence gaps. A failure poisons the whole attempt without
retry and cleans or zeroizes IPC, network and body resources. Evidence uses a local synthetic TLS server only; no
public network, Control process/Job Object, protected publication, browser, production or model acceptance is claimed.
Record: `gate7f/function-first/M1-S2B1-TLS-BROKER-PREFLIGHT-2026-09-03.md`.

**M1-S2B1 Control-worker composition correction, 2026-09-03:** the native topology is now prospectively frozen at
public-Git child handles 9/7/5 and snapshot 6/5 with five/three Control-owned bootstrap pipes, exact role/direction
binding, a two-phase control exchange across publication, pre-effect deadline ownership and retained post-timeout
recovery. Three review stops (P1=5, P1=3, P1=1) were corrected before final independent GO at P0=0/P1=0. This is
criteria only, not native implementation or Control acceptance. The first implementation prerequisite is the
executable two-phase control-frame schema and adversarial validator tests. Records:
`gate7f/function-first/M1-S2B1-CONTROL-WORKER-COMPOSITION-CORRECTION-2026-09-03.md` and
`gate7f/function-first/M1-S2B1-CONTROL-WORKER-COMPOSITION-INDEPENDENT-REVIEW-2026-09-03.md`.

**M1-S2B1 two-phase Control-frame preflight, 2026-09-04:** the first implementation review retained a P0=0/P1=2
stop because separate request/response arrays could not prove cross-direction chronology and critical pair/boundary
coverage was incomplete. No native work followed that stop. The corrected incremental admission state machine now
gates request/proposal/decision/terminal order online, poisons invalid channels, covers all three exact worker
relationships and enforces directional EOF, HMAC/binding, 32-byte keys and the exact 1 MiB payload limit. Focused
checks pass 15/15 and fresh independent review returned GO at P0=0/P1=0. This is deterministic framing evidence,
not native worker, PostgreSQL, browser, production or model acceptance. Record:
`gate7f/function-first/M1-S2B1-CONTROL-FRAME-PREFLIGHT-2026-09-04.md`.

**M1-S2B1 publication-primitive preflight, 2026-09-03:** the digest- and identity-bound deterministic
publication contract now passes 29/29 focused compatibility checks and fresh independent review at P0=0/P1=0.
Two review stops corrected malformed-handle ownership, exhaustive inspection cleanup, failed-close retention and
truthful attempted-versus-confirmed move evidence. Publication remains one-shot, write-through and non-replacing;
deletion is never authorized and database changes are proposals only. This is not native Windows, Control worker,
database CAS, cleanup, browser, production or model acceptance. Record:
`gate7f/function-first/M1-S2B1-PUBLICATION-PRIMITIVE-PREFLIGHT-2026-09-03.md`.

**Artifact-result surface criteria, 2026-09-04:** corrected prospective criteria now have independent GO at
P0=0/P1=0 after retained P1=5 and P1=2 review stops. The criteria freeze bounded owner-point reads, restart-stable
non-enumerable locators, strict result schemas/readiness, exact canonical TXT/JSON/DIFF bytes, and positive privacy,
error and provenance projection. The final correction prevents JavaScript enumeration from reordering numeric-like
JSON keys and requires exact checker/one-finding/citation-context binding for every accepted Review result. This is
criteria only: no artifact store, C05 completion, implementation, PostgreSQL proof, browser journey, model call or
production operation is claimed. Records:
`gate7f/function-first/M1-S2-ARTIFACT-RESULT-SURFACE-CRITERIA-2026-09-03.md` and
`gate7f/function-first/M1-S2-ARTIFACT-RESULT-SURFACE-CRITERIA-INDEPENDENT-REVIEW-2026-09-04.md`.

**Contextual Review workflow, 2026-09-03:** the application now requires one to six exact selected locators,
fully resolves and hash-verifies their canonical bytes in requested order before provider access, preserves
application-owned citations, and isolates the simplified one-revision `accept`/`revise` checker to Review. The first
green draft was stopped at P1=3 for context-free provider access, silent partial resolution, and full-content hashes
paired with truncated inputs. The corrected bytes received independent PASS at P0=0/P1=0 with 89/89 bounded tests.
No model, browser runtime, network, production route or actual-system acceptance occurred. Record:
`gate7f/function-first/M1-S2-CONTEXTUAL-REVIEW-WORKFLOW-2026-09-03.md`.

**Supplied-source Research workflow, 2026-09-03:** Research now requires a one-to-eight-step submitted plan and
exact project/source/section/content-digest selections, revalidates the complete ordered active set immediately at
the provider boundary, and produces no provider call on any missing, revoked, stale, foreign, partial or changed
selection. Report readiness fails on every explicit incomplete/degraded signal. Two independent review stops corrected
four authority/completeness gaps and one production approved-knowledge widening; explicit Research now receives only
the selected evidence and null advisory context. Focused checks pass 17/17, the builder's affected set passes 90/90,
and independent re-review passes 68/68 at P0=0/P1=0. No model/provider, Qdrant, PostgreSQL, browser, web, production or
customer acceptance ran. Record:
`gate7f/function-first/M1-S2-SUPPLIED-SOURCE-RESEARCH-WORKFLOW-2026-09-03.md`.

**Device/install-readiness preflight, 2026-09-03:** four customer modes now have a frozen, digest-bound readiness
contract: browser-only, one-time folder snapshot, optional non-executing persistent bridge, and separately deferred
fully local execution. Independent review stopped and corrected arbitrary manifest injection, unbound signer identity,
and unbound/non-expiring enrollment evidence. The corrected evaluator passes 12/12 and independent re-review returned
P0=0/P1=0. This is deterministic status logic only—not an installer, device probe, enrollment, browser or Control
acceptance result. Record: `gate7f/function-first/M1-S2-DEVICE-INSTALL-READINESS-PREFLIGHT-2026-09-03.md`.

**Application slice, 2026-09-02:** model selection is complete and the retired R15 campaign is not being
resumed. The active clean branch is `codex/m1-gemma-primary`, based on the five-function qualification
decision. Gemma is the sole primary for Chat, Research, Code, Agent and Review. The immediate work is to
preserve the qualified Research contract, isolate the simplified Review checker, create byte-bound
composite deployment admission, expose one primary work canvas with contextual Chat/Code/Research entry,
and keep Agent and Review contextual to the work they govern. Before final customer acceptance, the product-foundation
rebaseline brings forward the complete shell and conversation lifecycle, real Settings and
Omen/Control/Home status, authorized local folders and local Git, usable Research/Code/artifact surfaces,
and governed local changes. Comparison models are documented and tabled. No production route has changed.
Any actual-system method failure stops acceptance for a retained RCA and corrected design before retry;
it is not scored against Gemma. The detailed records are
`gate7f/function-first/M1-S2-GEMMA-PRIMARY-APPLICATION-SLICE-2026-09-02.md` and
`gate7f/function-first/RUNAAI-PRODUCT-FOUNDATION-AND-UX-BASELINE-2026-09-02.md`.

The historical R15 checkpoint below is retained as failure evidence and is no longer the active step.

### Historical checkpoint: R15 campaign halted at the operator/browser method gate

**Campaign halt, 2026-09-02:** R15 model testing is stopped. Fresh model-free stage
`b230075b107b439480bfbecd64189e62` completed 11/12 controls and failed the browser control after
navigating to ordinary sign-in instead of the sealed synthetic bootstrap. Its retained record reports
`modelsInvoked:false`, `productionChanged:false` and `protectedDataRead:false`; Gemma remains at zero
scored R15 attempts. Independent review then rejected the proposed browser-handoff correction because it
used `Clear-Clipboard`, which is absent on the actual host in both Windows PowerShell 5.1 and PowerShell
7.6.4. The selected 5/5 test result was therefore insufficient. The exact rejected draft is preserved in
`ae69d6e416a29e6ccb73bc2ca4fc360cadd4e822` and removed from the active tree by
`7445d0044c549c0ca8710eb5fc8f47a2670f5270`. No retry, replacement stage or model call followed.
The campaign may not resume until the entire operator/browser workflow passes the host-real zero-model
dress rehearsal and independent review defined in
`gate7f/function-first/M1-S2-R15-CAMPAIGN-HALT-AND-COST-RCA-2026-09-02.md`. If that gate fails, stop
again immediately. The prior checkpoint text below is retained as history and is no longer the active step.

V14 execution update, 2026-09-02: fresh stage `4109cda2788e4311a6f5832d41446dc5`
was finalized from all 2,465 verified source entries and reached control 10's live browser checkpoint.
The first neutral root page loaded, but ordinary sign-in and every later request returned
`ERR_EMPTY_RESPONSE`. The loopback command relay allowed eight simultaneous browser connections and
released a slot only after its per-connection SSH child exited; a browser-abandoned connection merely
ended child stdin, so stalled SSH children kept all eight slots occupied and the relay immediately
destroyed successor connections. Existing relay tests checked argument parsing and cleanup only, not
browser-style connection turnover. The checkpoint expired and the stage was retained. A read-only
post-stop audit found no campaign result and zero stage-owned processes. No Gemma request occurred.

The completed repair releases the bounded browser slot immediately when its client closes or errors,
terminates that connection's SSH child, and keeps the child owned until its actual exit for final cleanup.
Independent review correctly rejected the first revision because a failed or stalled kill could accumulate
unbounded owned children even while client slots turned over. The completed revision therefore adds an
independent 16-child hard cap, treats an unconfirmed kill or a 10-second exit miss as a fatal relay error,
and exits the relay nonzero so the supervising operator fails closed. Two later review passes found that
shutdown could report success before every child settled and that synchronous failed-kill reentry could
create a second cleanup promise and timer. Shutdown now closes admission, publishes one shared deferred
before cleanup begins, waits for both listener closure and zero owned children, preserves fatal status, and
returns nonzero on its bounded settlement deadline. Regressions cover turnover, repeated abandonment, kill
failure, child timeout, settlement wait, fatal/signal ordering and the exact real-relay reentry race. The
focused relay/proxy suite passes 16/16, the complete campaign harness passes 206/206, and both independent
re-reviews report GO with no P0/P1 findings. The restricted tracked run passed 1,975 checks, skipped 78 and
reported five permission-only failures in Windows ACL/process/probe checks; those exact source files pass
32/32 in their required host context, accounting for all 2,058 checks with no unresolved failure. The repair
is committed and pushed as `2431ad3ca52d8ec3a87d042c298d2c1de61339da`. Fresh package
`20260902-campaign-r15-common-v15` was built from that exact commit; its archive SHA-256 is
`85445369814694a15ba42bab2c5d70ea3688c02e5ec4ee14c97b74a353258911`, its runtime-seal SHA-256 is
`45e2d5bd0086b0da5170596395959fd543ebbff31edee151b41e22986ea2e7da`, and its 2,465-entry manifest
SHA-256 is `078d41257e39a87d47bf0ac026e7f4065f76abb0a55047456b8d2a6982dc06f9`; independent archive
verification also rejected a tampered file. The propagated operators pass 206/206. Inference remains
paused pending this seal commit, another fresh stage, all 12 controls and the separate live-browser proof.

V12 method-gate update, 2026-09-02: fresh stage `08fdd8ae4cce45dd9cb2ee3e0fb17e91`
recorded 11 completed model-free controls and one failed browser-dependent control, with
`modelsInvoked:false`. Its browser checkpoint existed from `2026-09-02T08:17:44Z` (04:17 EDT) to
`08:32:44Z` (04:32 EDT); the steward attempted the displayed URL at approximately 07:46 EDT, more
than three hours after it had correctly expired. The page failure is operator-handoff attribution, not
Edge or Gemma. The outer watcher also rejected 26 directory-level content notifications even though
all locked hashes, exact sets and durable runtime security state remained unchanged. Independent review
then stopped packaging on relay-liveness/expiry supervision, pre-use classifier placement, propagated
package pins and stale status publication. The corrections now supervise relay liveness and expiry,
terminate the exact owned process tree, inline the narrow classifier in the externally pinned validator,
and update the living status. The final focused suite passes 76/76 and the complete tracked suite passes
1,971/2,049 with 78 intentional skips and zero failures. Two independent re-reviews returned GO with no
P0/P1 findings. The reviewed source repair is committed as
`c760419885e5ba5729335f272f177ef74931b83a`. Fresh package `20260902-campaign-r15-common-v13`
was built from that exact commit and independently verified against all 2,465 source-tree entries;
archive SHA-256 is `171d3dccac2dc6ef56d81738c669de4309f6435287817c88b443b9b857953ae9`.
Its package and validator hashes are propagated by this operator-seal update. A new model-free stage,
12 controls and the separate real-browser publication proof remain mandatory before inference. V12 is
retained and is not reused; Gemma has zero new scored attempts under the simplified arm.

V13 execution update, 2026-09-02: fresh stage `9fa6b29e728f4d41ae15580f4f57b421` was created and
finalized from all 2,465 verified source entries with no copied synthetic state or production change.
It reached its first live browser checkpoint, then the local relay wrapper rejected the valid UTC
`expiresAt` because PowerShell 7 `ConvertFrom-Json` materializes an ISO-8601 `Z` value as
`System.DateTime`, while the wrapper required a string. The stage stopped before relay publication,
before any model lease and with zero Gemma attempts. The parser now accepts only UTC `DateTime`,
zero-offset `DateTimeOffset`, or a `Z`-terminated parseable string and normalizes it to one UTC instant;
the actual PowerShell 5/7 JSON-coercion regression passes. Focused checks pass 31/31, the campaign
harness passes 198/198, and the isolated tracked suite passes 1,972/2,050 with 78 intentional skips and
zero failures. Two independent re-reviews returned GO with no P0/P1 findings. The correction is committed
as `4369bcdbf03200cb6334261a5f2820eede1e0602`; fresh package
`20260902-campaign-r15-common-v14` was built from that exact commit and verified against all 2,465
source entries. Its archive SHA-256 is
`1f3af4d849ffd17f0ff67a8f62c71239cb8978e38a9da04647a274b7822afa6a`. Package and validator pins are
propagated by this operator-seal update. A new model-free stage remains required before inference.

V11 finalization-key-order RCA, 2026-09-02: fresh stage `4b57aec1ddca418dbf20c2df7ddac6da`
successfully finalized all 2,464 source files, then stopped before its first control because the validator's
manually written sorted key contract placed `runtimeSealSha256` after the `runtimeSecurity*` fields. The
validator's own `Sort-Object` output correctly places `runtimeSealSha256` before them, so it rejected the
otherwise exact retained receipt. No control result or model attempt was recorded. The literal is corrected
and a regression now derives the actual finalizer receipt fields, sorts them, and compares that result to
the validator contract. Focused checks pass 8/8, the campaign harness passes 197/197, and the full suite
passes 1,967/2,045 with 78 intentional environment-dependent skips and zero failures when its disposable
payload directory is writable. Two independent reviewers returned GO with no P0/P1 findings. The failed
stage is retained and not reused; inference remains paused for commit/reseal and a fresh method-gate stage.

V10 method-gate update, 2026-09-02: fresh stage `288236b61f1e4944a0a77d360f704a51` stopped on its
first model-free ACL-normalization preflight. It reached neither controls nor inference and has zero exact
stage processes. The normalizer fixture incorrectly represented a successful MXC call with a populated
`startupObservation`; the real executor returns `null` on success and populates that field only for a
startup failure. The outer predicate therefore rejected the real success contract. The predicate and
fixture now require the exact typed success receipt plus `startupObservation:null`, and a populated failure
observation is an explicit negative case. Focused checks pass 34/34, the complete model-free harness
passes 196/196, and the full repository suite passes 1,966/2,044 with 78 intentional environment-dependent
skips and zero failures. Two independent reviewers returned GO with no P0/P1 findings. The failed stage is
retained and not reused; inference remains paused for commit/reseal and a fresh method-gate stage.

Gemma-only arm update, 2026-09-02: the steward selected one fresh 120-attempt Gemma eligibility arm to
conserve compute. It covers 24 ordered attempts in each of Chat, Research, Code, Agent and Review, with
Nomic permitted only for embeddings. A pass in all five roles can establish Gemma as the single
generation/reasoning candidate for this bounded M1 route. It cannot retroactively complete the original
three-candidate R15 comparison, qualify the product, authorize production routing or replace the bounded
human trial.

The simplified Review contract and full completion/review publication chain now pass 195/195 model-free
harness checks. Two independent final reviews returned GO with no remaining P0/P1 blocker after verifying
BigInt Windows file identity, current-path reopen/hash checks, same-inode durable-overwrite rejection,
linked-root/output-ancestor rejection, visible-worksheet-only decisions, canonical completion verification,
retained operator locks and one atomic final-grade publication. The complete tracked suite passes
1,965/2,043 with 78 intentional environment-dependent skips and zero failures. No Gemma request has occurred. The active
step is exact source packaging and fresh resealing; 12 controls and the separate real-browser proof must
still pass before the arm can begin.

V8 method-gate update, 2026-09-02: independently approved commit
`bf1ec7fdc1aacd1239e6513c29943fb93f4d6342` was sealed and fresh stage
`635e8cecd7b64b6296d9b23043b52015` completed all 12 inner model-free controls with zero failed drivers
and `modelsInvoked:false`. The outer protected-tree witness then failed closed on 1,910 `Changed` events
under the sealed QuickJS runtime even though its final byte hashes and exact file/directory sets passed. The
stage is retained and its exact processes are absent. Bounded no-model reproduction proved the native
preflight was ready/executed and that all 314 reproduced notifications were `Security` only: 312 beneath
`sandbox-runtime`, two beneath `runtime`, and zero file-name, directory-name, size, last-write or attribute
events. The idempotent host ACL preparation itself produced zero runtime events. RCA: MXC deliberately
applies and restores temporary runtime access rules while establishing the process container, but the
validator treated those expected transient security notifications as durable file mutation.

The corrected witness omits only `Security` notifications from the two runtime watchers; root, source and
tool watchers retain them. Runtime watchers still cover names, writes, sizes and attributes, and every
manifested runtime file remains byte-locked. After watcher quiescence and disposal, the validator rehashes
every runtime file, rechecks the exact file/directory set, and compares a pre/post owner/group/DACL digest
for every runtime file and directory before releasing locks. Durable ACL drift fails closed. The behavioral
ACL drift/restoration regression and all 27 focused checks pass; the complete tracked suite passes
1,937/2,015 with 78 intentional environment-dependent skips and zero failures. Independent P0/P1 review
returned GO. A new commit/seal, fresh controls and separate browser-publication proof remain mandatory
before the steward-directed Gemma-only 120-attempt eligibility arm using R15's already-frozen unconditional
Review checker shape. No candidate identity has been consumed by v8.

V7 method-gate update, 2026-09-02: independently reviewed source `188048537e4770e3ac7719bff55417bb0994c293`
was sealed and stage `3cb0e98c307a4bc5b4aafeccfb2da347` reached model-free browser control 10.
Final independent review then found that the validator disabled its watchers and stopped draining on the
first empty event snapshot after a fixed 100-ms delay. Because PowerShell event delivery is asynchronous,
a protected-tree event could arrive after that empty snapshot and be removed unread during cleanup. The
operator published a fail-closed negative acknowledgement, the stage retained no qualification credit,
and its exact Node/PostgreSQL/Qdrant processes were confirmed absent. No model or campaign identity was
invoked. The correction now uses the shared `Wait-R15WatcherQuiescence.ps1` barrier: drain to a bounded
quiet interval while enabled, disable and dispose, drain again to a longer bounded quiet interval, then
repeat the exact-set assertion while all byte locks remain. Behavioral regressions use a ready/go handshake
to inject an event after the first empty poll and separately prove that an already queued event is captured
after watcher disposal. Three sequential host runs passed and independent final review returned GO with no
P0/P1 finding. The complete tracked suite passes 1,936/2,014 with 78 intentional environment-dependent
skips and zero failures; roadmap verification passes 15/15. Commit/seal, 12 controls and
browser-publication proof still precede Gemma inference.

V6 method-gate update, 2026-09-01: source stage `ce8871e1ad9d48d48d4508a39761af6f`
completed 12/12 model-free controls with zero failed drivers and no model calls, but its outer whole-stage
recursive `FileSystemWatcher` failed after a clean post-run exact-set check. The watcher included legitimate
high-churn disposable database/vector roots and retained their events for the complete run; independent
review identified buffer pressure as the leading RCA. This is retained as a harness failure, not a model
failure. The corrected validator now watches only the root boundary and immutable source/runtime trees,
disables before draining, preserves all byte locks and exact-set checks, and still fails closed with bounded
exception diagnostics. Inference remains paused pending a fresh 12-control pass and live-browser proof.

An additional prelaunch independent review found two compact-runtime containment defects before any model
request: the exact stage lacked the runtime required by native-access preparation, while a provisional
fallback widened MXC reads to the entire extracted stage. The correction now prebuilds an exact
archive/source/node-bound compact runtime, manifests and read-locks every entry before application launch,
rejects any changed or additional entry, and retains only that sealed runtime through cleanup. Local
verification is green at 49/49 focused checks, 1,933/2,011 complete-suite checks with 78 intentional skips,
164/164 campaign-harness checks, 28/28 Gate 7F checks and 15/15 roadmap checks. Independent re-review
returned GO with no P0/P1 finding. Fresh source/seal/control/browser gates remain; no R15 candidate identity
or model credit has been consumed.

The prospective contract frozen in
`gate7f/function-first/M1-S2-R15-AGENT-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md` is implemented and
recorded in `gate7f/function-first/M1-S2-R15-CORRECTION-IMPLEMENTATION-RESULTS-2026-09-01.md`. The
unconditional exact-echo Review wire, generic evidence-limit/counterexample protocol, type-preserving
read-only Agent analysis and bounded exact failed-check projection passed two independent P0/P1 reviews.
The corrected archive binding and Windows watchdog timestamp policy now pass the complete tracked suite:
2,007 tests, 1,929 passed, 78 intentional environment-dependent skips and zero failures. The watchdog's
terminal-present timing regression passed 12/12 three consecutive times, and independent review reported
GO with no P0/P1 finding. The prior `2e81d94b3f362c6d8d2d04bbf6a486a091228af7` source and
`89adf8bdcfa2dc4db0c07dd96b4b2c80953d2a5188c18f9cd14f77602493e93d` runtime seal are retained history,
not valid R15 launch inputs; a new commit/archive/seal is still required.

Fresh model-free controls completed 12/12 with zero failed drivers. After five retained preflight-method
failures with zero model calls, the corrected same-origin Brave flow passed actual-browser exercise,
on-time witness, on-time acknowledgement, witness-before-acknowledgement, acknowledgement consumption
and native release. It did not read protected data or change production. No R15 inference or customer
trial has started. This historical checkpoint was superseded by the 2026-09-02 steward-selected Gemma-only
eligibility arm described above; it remains evidence for the model-free method but does not make the
three-candidate R15 comparison complete.

The first scored-stage rehearsal then stopped before a Home lease or provider call. The create-before-load
Home lease builder proved that the R15 hardware plan had hashed Windows checkout bytes while the lease
package consumed the sealed Git-archive bytes. CRLF checkout normalization made 8 of the 10 historical
source/operator pins differ from their LF archive entries even though those files had not changed between
the prior seal and the R15 source. This is an archive/checkout provenance defect, not a candidate failure,
and no campaign identity was consumed. The campaign is paused while the common builder is changed to extract
the supplied archive, execute its own canonical hardware builder inside that extraction, independently
verify every generated source/operator hash against the extraction, and bind the plan hash into the runtime
seal. The deterministic correction and independent review are green. A new commit/archive/seal, all three
model-free lease packages, 12 controls and the real-browser proof must pass before inference.

### Retained checkpoint: R14 complete; no Review route

R14 is complete and immutable. The repaired campaign method retained valid prefixes and resumed only
the first unconsumed Qwen identity. Qwen's exact 68 + 1 + 51 history composes to 120 unique attempts;
all three candidates now have 120/120 attempts, all 12 model-free controls pass, cleanup is verified,
and the independent candidate-blind review produced 360 determinate grades with no critical model or
product failure. Chat, Research, Code and Agent have qualifying routes. Review does not: Gemma is 7/24,
Coder 20/24 and Qwen3.6 21/24. Product qualification, production routing and the customer trial remain
unchanged. Exact pins, publication-tool RCA and genuine model defects are in
`gate7f/function-first/M1-S2-R14-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md` and
`gate7f/function-first/M1-S2-CAMPAIGN-HARNESS-RCA-AND-CONTINUITY-CORRECTION-2026-09-01.md`.

R15 may not branch on candidate identity, inject case answers, lower thresholds, replay a subset,
regrade R14 or expose the customer trial before a fresh full 360+12 candidate-blind result qualifies
all five functions.

### Retained checkpoint: R13 complete; R14 Review correction frozen and locally verified

R13 completed 360/360 planned attempts, 12/12 model-free controls, strict Home/Control cleanup and a
fresh candidate-blind review covering 611 provider outputs and all 963 semantic checks. All 360 attempt
grades are determinate and no critical model/product failure was found. Gemma qualifies for Chat, Code
and Agent; Coder qualifies for Chat, Research and Code; Qwen3.6 qualifies for Research and Code. Review
has no route. Qwen3.6 is closest at 21/24 and its only three Review failures are the same omission: it
identifies path traversal and post-resolution containment but does not explicitly explain that the
stated authentication control does not authorize the requested path. Exact pins and scores are in
`gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`.

R14 is prospectively frozen in
`gate7f/function-first/M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`. The only permitted change is
generic stated-control coverage in the Review answerer and checker; no case answer or candidate branch is
present. Focused actual-wire and semantic suites pass 81/81; the complete repository suite passes
1,847/1,925 with 78 intentional environment-dependent skips and zero failures. R14 retains all
candidates, 40 cases, 360 attempts, 12 controls, budgets, thresholds and candidate-blind review. The next operations are the
complete deterministic suite, committed source/archive/runtime seal, controls, full campaign and fresh
independent review. No production route or customer trial is authorized yet.

### Previous checkpoint: R12 independent review complete; no all-five-function route

Independent candidate-blind review is complete for all 360 R12 rows. The reviewer froze 963 explicit
semantic decisions before unblinding, recomposed the exact raw observations and retained 350 determinate
and 10 inconclusive final grades. All 12 model-free controls passed and no critical model or product
failure was identified. Exact evidence and hash bindings are in
`gate7f/function-first/M1-S2-R12-INDEPENDENT-SEMANTIC-RESULTS-2026-08-31.md` and
`gate7f/function-first/acceptance/evidence/20260831-r12-independent-semantic-review/`.

Gemma qualifies for Chat 24/24, Research 22/24 and Code 24/24; Coder qualifies for Chat 24/24 and Code
24/24; Qwen3.6 qualifies for Code 24/24. No candidate qualifies for Agent or Review. Therefore the
required all-five-function route does not exist, product qualification and customer-trial readiness
remain false, and no candidate route was selected or promoted. The next finite work is a prospective
correction and fresh acceptance for the exact Agent and Review deficits; passed Chat, Research and Code
evidence remains immutable.

Qwen remaining-13 r37 used source `9ffa9d8a`, runtime seal `0afb31fa`,
12/12 fresh controls, Home lease `20260829-campaign-qwen36-r37`, and Control
stage `9c24e5bc6eed47a2a8c73e34dd7f7805`. All five actual-browser observations
were accepted, including Agent05 inside its unchanged 24-second truth window.
All 13 planned identities were recorded, none were unexecuted, the runner stop
code was null, Control drained, and Home finished with zero model residency,
restored GPU limits and unchanged production routing.

The steward clarified that these 13 rows should be composed with Qwen's first
107 when the missing rows were caused by the batch timing cutoff rather than
model-facing drift. The machine audit binds both immutable results and proves
the same Qwen artifact and controls, case bundle, evaluator, role limits, model
runtime, retrieval artifacts and native suites. Only source commit/archive and
telemetry-policy seal fields differ. The derived 120-row result preserves both
execution windows and explicitly does not claim one uninterrupted arm. The
three supplemental model failures remain failures.

Gemma 120, Qwen3 Coder 120 and equivalence-composed Qwen3.6 120 are now bound
into one candidate-blind 360-row review input. Exact hashes and the change-
control boundary are in
`gate7f/function-first/M1-S2-R12-QWEN-EQUIVALENCE-COMPOSITION-DECISION-2026-08-31.md`
and `gate7f/function-first/acceptance/evidence/20260831-r12-equivalence-composition/`.
Independent semantic review, per-role scorecards and route disposition are now complete with the
negative all-five-function result above. Product qualification, production promotion and the customer
trial remain pending.

### Previous checkpoint: Qwen remaining-13 r33 stopped

The first R12 Qwen remaining-13 supplemental run used source `9028d123`, runtime
seal `64e4614c`, 12/12 controls, Home lease
`20260829-campaign-qwen36-r33` and Control stage
`35304669bab045cd97c3df555b9f5521`. It recorded 3/13 attempts and stopped with
`m1-campaign-attempt-undrained`; ten identities were not executed. The exact
result and raw-file manifest are retained under
`gate7f/function-first/acceptance/evidence/20260831-qwen-r33-supplemental-failed/`.
This failed supplemental arm is not pooled with immutable R12 and provides no
qualification credit.

The RCA is an operator-wrapper integration defect. The runner correctly uses a
`supplemental-qwen36-27b-mtp-<runtime>-<prior>` directory, while the owner
witness and acknowledgement bindings accepted only `campaign-*`. Agent04's
ordinary acknowledgement was published through a lower-level helper; later
ordinary and combined checkpoints could not use the normal owner path. The
prospective correction admits only the exact generated Qwen supplemental shape;
other candidates, malformed lengths, child paths and traversal remain denied.
Focused wrapper/supplemental tests pass 16/16. No scored input, expectation,
threshold, model setting or immutable prior result changed.

The r33 lease expired safely. Live Home verification found zero model residency,
both GPU limits restored to 260 W, and `cleanupVerified=true`; the exact idle
scheduled task was retired while its evidence directory remained. Control has
no stage-owned process. Production routing remained unchanged and no protected
data was read. Next: commit and reseal the corrected source, rerun 12 controls,
create fresh Home/Control ownership, and rerun all 13 exact identities.

### Current checkpoint: R10 complete; prospective R11 correction frozen

On 2026-08-30 R10 completed all 360 fixed model attempts plus 12/12 byte-identical
model-free controls on source `ee1a15ae5d0c6ba18e9eaa24e623645be74a238b`,
archive `a1ff6e01a378d6b93a0329cc6d733a31469754caf2f6946dea25b66469bd40a0`
and runtime seal `ae29fe27c9ff6b937e612623e1d8f1b21d36f65d7b8edbd682bef683daf39b5d`.
Candidate-blind independent review bound 360/360 raw and ledger records, covered
520/520 provider outputs, adjudicated every semantic assertion and found no
critical model or product failure.

No whole candidate qualified. Across Chat/Research/Code/Agent/Review, Gemma
recorded 24/19/24/20/0 acceptable attempts with one inconclusive Agent row,
Coder 23/21/24/21/0, and Qwen3.6 18/21/21/20/19 with one inconclusive Agent row.
Gemma and Coder qualify only for Chat and Code under whole-application grading.
No candidate qualifies for Research, Agent or Review, so the customer trial is
not ready and no production route is selected or promoted.

Exact pins, result hashes, attribution and cleanup are in
`gate7f/function-first/M1-S2-R10-THREE-MODEL-RESULTS-2026-08-30.md`. The strict
completed-campaign verifier passed all three Home leases and bound each result to
its source/runtime/lease seals, complete export, before/after final observations,
owned-task retirement and stable listener inventory. Each arm ended with zero
owned model residency, both GPU limits restored to 260 W, production unchanged
and no protected-data read.

The next finite correction is prospectively frozen in
`gate7f/function-first/M1-S2-R11-CORRECTIVE-CRITERIA-2026-08-30.md`: exact accepted
checker citation echoes, generic Research/Review completeness, typed attribution,
two-request crash-bounded repair, repair-plan completeness and actual-browser-only
witnessing. Cases, candidates, thresholds and the independent evaluator remain
unchanged; R11 requires a fresh source/archive/runtime seal and full 360+12 run.
M1 and the required human customer trial remain open; M2-M5 remain required.

The frozen application is `9556ed01f9dbabe8c93eea309e482aad60bf809f`, common runtime seal
`416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`. The complete actual Control
regression passed **1,266/1,266, zero skips**; all **12/12 formal functional controls** then passed
the original raw-proof verifier, including actual browser observation. See
`gate7f/function-first/acceptance/R4B-CONTROL-REGRESSION-RESULTS-2026-08-28.md` and
`gate7f/function-first/acceptance/R4B-CONTROLS-RESULTS-2026-08-28.md`. Earlier failed/partial arms
below remain historical evidence, not retroactively passed. The replacement Coder batch has
completed 120/120 and independent review of 148 actual role-provider outputs:
73 passed, 10 failed, 37 inconclusive. Qwen3.6 completed120/120 and independent
review of147 actual outputs:79 passed,6 failed,35 inconclusive. Gemma also
completed120/120, with independent semantic review still in progress. Thus all
360 planned baseline task attempts are recorded; runner completion is not model
qualification. No winner is selected. Separate immutable Coder and Qwen reports
are under `gate7f/function-first/acceptance/evidence/campaign-20260828-r4b/`.

Gemma's independent Control cleanup at23:30:11Z found zero owned processes and
listeners and all six disposable runtime/data directories absent. No stop or
cleanup error was recorded. Home's owner independently unloaded the test models,
restored both260-W limits and removed owned campaign tasks at23:31Z. All original
abandoned arms, timing failures and per-attempt model failures remain retained.

Shared corrections are implemented separately from that frozen baseline:
exact source-byte preservation (`f2b6112`), whole-plan argument/receipt preflight
(`5a1f0c2`), native evidence JSON-schema transport (`801a8c3`) and continuing-user-
constraint instructions (`793ebc4`). These do not rewrite earlier grades.
Actual local request/service/SDK/HTTP regression is91/91, zero skips; the separate
native-runtime suite is162/162, zero skips. Synthetic model responses prove
integration only. Actual model quality and live auxiliary/source-byte validation
on the corrected application still require the fresh matched run.

The next-work authority is
`gate7f/function-first/CORRECTED-STACK-CONTINUATION-2026-08-28.md`. Complete actual
native owner/caller-drain and bounded deployment recovery, freeze the common
corrected source/runtime, run all three models without changing thresholds,
then perform rollback-protected release validation and the real customer trial.
No new permission gate is introduced. The production release and protected data
remain unchanged by this baseline/correction work.

The first R4b Coder batch is retained at 32/120, with 21 passes, two failures and
nine inconclusive attempts after independent review of all 41 model outputs. An
operator browser-preparation acknowledgement exceeded the unchanged 30-second
freshness bound before any model call in Agent05. The parent closed the lease
during Agent08's browser checkpoint; 88 Coder and 240 other-model slots remain
unexecuted. No result was pooled, retried individually, regraded or qualified.
The independent report and complete denominator manifest are under
`gate7f/function-first/acceptance/evidence/campaign-20260828-r4b/aborted-coder-first-batch/`.
Actual Control cleanup has no error; Home separately verified zero models/tasks
and restored 260 W after a retained completion-marker publication failure.

A synthetic Windows reproduction demonstrated a separate `File.Replace`
metadata publication race. The prospective operator-only writer correction is
`gate7f/function-first/readiness/CAMPAIGN-METADATA-PUBLICATION-CRITERIA.md`.
Its seven-case actual Windows suite passed on both Omen and Control. Control's
three stress repetitions completed 600 publications and 61,021 valid concurrent
reads with zero reader errors; all owned test processes exited.
The scored source, seal, cases, model settings and reader freshness limits are
unchanged. New Coder hardware lease R5 is the same candidate, not a fourth model;
the new full batch uses its own fresh stage and retains the abandoned batch.
R5 completed all 120 attempts with no unexecuted slots and no runner stop. A fresh
Control check at 21:47:11Z found zero owned processes/listeners and all six owned
temporary directories absent. Home separately completed owned cleanup at 21:50Z:
zero models/tasks and both original 260 W limits restored; root revalidated all 19
raw outcome pins. Independent grading retained every slot and exactly one definite
critical model behavior. Completion is not qualification. The Coder agent-role
failure is an explicit claim
that tests ran against corrected code contradicts the unchanged canonical file
and actual original-file test receipts. That role cannot qualify. The contained
model failure stays in the denominator; it does not authorize production changes
or alter the other candidates' matched evaluation.

Two R5 browser timing gaps remain inconclusive, not retrospectively passed.
The read-only operator handoff was shortened without altering the frozen limits;
Agent05 repetition 2 was then consumed at 21:28:16.069Z before its unchanged
21:28:19.465Z expiry. See
`gate7f/function-first/acceptance/BROWSER-OPERATOR-TIMING-2026-08-28.md`.
Independent review also found that the application's source attachment trims
trailing whitespace while the frozen citation verifier expects the supplied
bytes. The affected review checks remain inconclusive; no normalization or
regrading has been applied to hide that mismatch. Complete the matched diagnostic
comparison and correct the canonical-source contract before qualification.
The development-only exact-source correction now passes 25 input/index unit tests,
16 real disposable PostgreSQL checks, and 8 real PostgreSQL/Qdrant integration
checks with explicit embedding/reranker HTTP test doubles. Independent review of
`f2b6112` found no blocker and independently reran the 25 unit tests. Its live
auxiliary and application/citation qualification remain pending. See
`gate7f/function-first/SOURCE-BYTE-PRESERVATION-CRITERIA-2026-08-28.md`.

The separate Home operational-guard code is integrated but **not activated**. Its root local
OS/contract regression most recently passed 104/104, zero skips, after integration of
native transition and private TLS enrollment. The earlier 81/81 run and restricted
shell's CIM-access failure remain retained. This does not prove actual Home
installation, native caller quiescence, TLS admission, long-idle behavior or recovery. Those
operational checks and rollback-protected deployment remain required before the prepared human
trial. New operator/documentation commits do not change the frozen application under evaluation.
Continue under existing permission; this checkpoint is neither completion nor another approval gate.

The later operator regression passed 115/115 in its development checkout, including
direct native-settings restore ownership validation;
root independently reran the nine new enrollment/transport cases, all passing.
Root also independently reran all 23 settings/transition cases, including actual
Windows late-writer, ACL-drift, crash-recovery and direct-restore ownership checks;
all passed with zero skips.
No private enrollment or route is activated. The new Control quiescence v2 code
is integrated with 53/53 root tests and a separately retained 34/34 actual pinned
Caddy proof. Independent review reproduced and verified corrections for both
specific-path maintenance bypass and late unresolved restoration. Its receipt
is explicitly **selected Caddy traffic only**, not proof of Home-wide idle state.
The existing deployment script still needs the separately tested closed-admission
successor assembly; reloading its ordinary final route before health checks is
not acceptable. Native caller ownership, installed guard/TLS proof, long idle,
recovery, model qualification and final customer testing remain open.

### 2026-08-28 M1-S2 continuing integration

M1-S2 is in progress under the existing standing permission. Its preregistered contract is
`gate7f/function-first/M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`; current implementation evidence is
`gate7f/function-first/M1-S2-INTEGRATION-PROGRESS-2026-08-28.md`. Durable encrypted task/source work,
server-authoritative conversation context and the ordinary-user function surface are being integrated.
Actual Control sandbox/project proof passed 6/6 with disposable resources and unchanged production.
The three actual adapter readiness checks passed. All 12 model-free controls then passed together on
source `aa5deec`, runtime seal `62c9b2f5ea5d65874f7e18ed24d0a056011941b45c674a193ed04d9e3f118eee`.
The first Gemma campaign stopped after 23/120 slots: a stale edit was correctly denied and the newer
bytes preserved, but the old task still reported waiting for approval. That raw campaign and its 97
unexecuted slots remain unqualified; Home was unloaded and both power limits restored. The durable
pending-action correction is recorded in
`gate7f/function-first/acceptance/STALE-PENDING-RESULTS-2026-08-28.md`. Corrected source needs a new
common seal and all 12 controls before the fresh fixed 360-attempt, three-model campaign.
The campaign runner now retains exact archive/source/runtime pins, actual per-attempt hardware
observations, browser checkpoints, all failures and unchanged denominators. Task reopen preserves
only still-valid explicit approvals; Undo uses the original task's owned receipt. The separately
executed task/orchestrator PostgreSQL and pending-authority regression suite passed 44/44 with zero
skips. Source and private rows remain isolated. The new isolated Qdrant service passed actual
stop/restart persistence and rollback and is left registered disabled; see
`gate7f/function-first/control/qdrant/CONTROL-LIFECYCLE-RESULTS-2026-08-28.md`.
Production deployment and the real customer trial remain open; no model winner is presumed. Home's
ordinary desktop startup/JIT defaults are not a reliable qualified-model service; a separate exact-profile
admission/startup guard is being developed and must be proved before a reliable customer trial.
Do not stop or request another approval at internal commits. Do not claim M1 or the broader roadmap is
complete from these component results; preserve the historical M1-S1 result below.

### 2026-08-28 second campaign retained; readiness-capture correction

The fresh source `b0758dbae7f3db53bdee23c66ab08269f6152447` passed all 12 formal controls under
seal `c85583188c65df5d446f83fc6ba414ea32ba234d2c955ae8f923419440ef93c9`. The second Gemma arm
recorded 24/120 attempts and stopped; 96 slots remain unexecuted and no role is qualified by that arm.
The actual stale-edit and observed-repair checks passed. The real browser verified exact restoration
and showed the restored baseline's failed tests, retaining the earlier successful run as history.

The stop was a capture-harness defect, not an unauthorized restore or wrong model: opening the
application's readiness view caused legitimate embedding `GET /models` and reranker `GET /health`
requests. The POST-only capture proxy classified them as disallowed inference routes. The retained
Code08 raw SHA-256 is `2aff2c4dd8615d44da49385b8cc6c2652af25ac6704bccdf9b46d9b1e9b59d4a`;
it has no critical product failures, but its original role-check failure and stop remain unchanged.
Do not rewrite this evidence as a pass. A prospective strict health-read capture correction and fresh
common seal/controls are required before the next matched campaign. Ordinary answer-quality failures
remain independent findings and are not excused by this harness defect.

Home cleanup was independently observed: zero loaded instances, both original 260 W limits, no owned
lease tasks, unchanged existing listeners, with retained telemetry/receipts in
`gate7f/function-first/readiness/evidence/20260828-campaign-gemma-r2-outcome/README.md`.
Fresh offline R3 hardware packets retain the same limits and three-model roster; the next order is
Coder, Qwen3.6, then Gemma, still 120 attempts each. No model is loaded by packet preparation.
Continue the authorized work; no new approval is needed. Deployment and meaningful human trial remain
pending exact qualification and the separately tested operational runtime guard.
The prepared human trial is `gate7f/function-first/M1-CUSTOMER-TRIAL.md`; it is explicitly not ready
to start and is not an additional permission gate. Fill its verified deployment entry record first.

### 2026-08-28 health capture verified; fresh three-model run

The prospective correction is implemented and verified in
`gate7f/function-first/acceptance/HEALTH-CAPTURE-RESULTS-2026-08-28.md`. Actual Control application
initial load and browser reload passed with 46 permitted auxiliary health reads, zero inference calls
and zero unexpected calls. The full acceptance suite passed 125/125 against disposable PostgreSQL;
the subsequent serialized-diagnostic-budget regression passed with the 11/11 focused health suite.
The root default suite passed 1,153 tests with zero failures and 47 explicit environment-dependent
skips; this is not a claim that every native/database test ran in that default invocation.

The independent second-arm review is
`gate7f/function-first/acceptance/STOPPED-GEMMA-R2-INDEPENDENT-REVIEW-2026-08-28.md`:
24 attempts and all 33 model outputs were reviewed, with 17 passes, four failures and three
inconclusive outcomes. Its semantic uncertainties and all 336 unexecuted slots across the three-model
plan remain explicit; no model or role is qualified. No earlier result or denominator was rewritten.

Next is a fresh exact-source seal, 12 fresh formal controls and the unchanged 120 attempts each for
Coder, Qwen3.6 and Gemma. The separately owned Home operational-guard work continues in parallel.
Production routing, protected stores and the existing release are unchanged. Continue through
qualification and rollback-protected deployment until a real customer test is ready; internal commits
and successful component checks are not stopping points or new permission gates.

### 2026-08-28 third campaign retained; approval protocol correction

The fresh source `46070a0` passed a complete repeated 12-control run under common seal
`63e53f4e851113f6c35ae9aec2df306100ceadefab9e86de5c2243f505b2b467`. The first control report is
also retained: an incorrectly bound browser acknowledgement made that initial report unqualified.
Coder then recorded 23/120 attempts and stopped at Code07; no other model arm started. All 337
unexecuted slots remain in the three-model denominator. No model or role is qualified.

The model proposed only a read-only preview, so there was no original pending edit to approve after
the concurrent change. No original mutation or unexpected call occurred. The reducer incorrectly
treated the unexercised stale-denial transition as a demonstrated critical failure. Original raw flags
remain unchanged. See `gate7f/function-first/acceptance/STOPPED-CODER-R3-FINDING-2026-08-28.md`.

The prospective model-neutral planner clarification follows the criteria committed in
`gate7f/function-first/APPROVAL-PLANNING-CRITERIA-2026-08-28.md`. Planning a requested effect is not
approval or execution; the application creates and pauses its exact proposal. Actual preview-only
requests remain effect-free. Separate evaluator evidence corrections, independent review, real
database checks and a fresh common seal/full controls are required before the new matched campaign.
The planner correction's 40/40 wire/planner tests and actual 46/46 PostgreSQL regressions now pass
with zero skips; see `gate7f/function-first/APPROVAL-PLANNING-RESULTS-2026-08-28.md`. Those tests
use deterministic provider/executor fixtures and do not establish any model's compliance.
The independent R3 semantic record is
`gate7f/function-first/acceptance/STOPPED-CODER-R3-INDEPENDENT-REVIEW-2026-08-28.md`: all 23
attempts and 32 outputs reviewed, 18 pass, three fail and two inconclusive. The shared read-only
explanation gap is corrected prospectively in
`gate7f/function-first/READ-ONLY-EXPLANATION-RESULTS-2026-08-28.md`: 40 wire/planner, 48 actual
PostgreSQL and 19 UI/routing tests pass. An actual browser using the product module plus synthetic
response fixtures confirmed literal summary text and separate observed receipts; it is not a model
or signed-in customer test. Initial-snapshot explanations do not claim a new post-tool synthesis phase.
Home is unloaded with both 260 W limits restored. No production or protected-data changes were made.
The operational Home guard continues in parallel; do not stop at this internal correction or request
new permission. Continue until the qualified deployment is ready for genuine customer testing.

### 2026-08-28 R4 prospective application freeze

The approval protocol, read-only explanation and conditional-evidence corrections are now
integrated at `ec0a63d974e53ac7e19a2a6bae1c6caa40fc1a8a`. The prospective common seal and
unchanged three-model/360-attempt contract are recorded in
`gate7f/function-first/acceptance/R4-FREEZE-2026-08-28.md`. The conditional reader's actual
PostgreSQL acceptance suite passed 176/176 with zero skips; this is not model qualification.

The combined Omen real-PostgreSQL suite ran 1,259 tests: 1,254 passed, five native-start failures,
zero skips. This used the default checkout/profile-temp MXC envelope, not Control's reviewed
compact envelope; original failure output is retained. Fresh Control staging, full compact-runtime
regression and twelve qualified controls are required before the R4 model requests. No failed
invocation is relabeled green. Production remains unchanged and M1 remains in progress.

The first full compact Control regression completed: 1,241/1,259 passed, eighteen failed,
zero skips. All six actual filesystem/PostgreSQL/MXC cases passed. Seventeen other tests
detected line-ending conversion of frozen modules in the archive, and the Qdrant package
test assumed Omen's local binary path. These are retained validation/packaging failures,
not successful qualification. The narrow test-path correction passed seven local tests;
see `gate7f/function-first/control/qdrant/TEST-PORTABILITY-RESULTS-2026-08-28.md`.
Strict original-byte archive preservation and a fresh source/seal/full run are required.
No R4 model inference began; its existing source/seal and failed preflight remain preserved.

Packaging/test portability is corrected at `9556ed01f9dbabe8c93eea309e482aad60bf809f`.
All fourteen original historical pins now survive both archive line-ending modes, without
changing their seals, and the root focused suite passed 31/31 with zero skips. The fresh
common seal and unchanged qualification contract are recorded in
`gate7f/function-first/acceptance/R4B-FREEZE-2026-08-28.md`. Fresh stages and the complete
actual-runtime regression precede the new controls/model requests; no partial result
qualifies a model or closes M1.

### 2026-08-28 stopped-campaign independent semantic record

Independent review of the stopped Gemma arm covers 23/120 attempts and all 32 captured model outputs;
97 attempts remain unexecuted. The raw-hash-bound record and limitations are in
`gate7f/function-first/acceptance/STOPPED-GEMMA-INDEPENDENT-REVIEW-2026-08-28.md`.
It preserves every original failed/inconclusive check, identifies three task-quality failures and one
ambiguous semantic criterion, and does not qualify any role or alter the frozen campaign.
The prospective model-neutral repair continuation contract is
`gate7f/function-first/REPAIR-PHASE-CRITERIA-2026-08-28.md`; implementation and new matched acceptance
remain separate from the stopped campaign and do not increase its repair budget.
Implemented and verified locally: `gate7f/function-first/REPAIR-PHASE-RESULTS-2026-08-28.md`
records 43/43 deterministic adapter/smoke checks and 20/20 real PostgreSQL orchestration checks,
including unchanged two-plan exhaustion. These are workflow/plumbing results, not model qualification.

### 2026-08-28 M1-S1 implementation and verified publication

- The full roadmap/retrieval contract was committed as `333912a`; model-role contracts and independent
  test additions followed in `daf92c6` and `c5ea7d1`, with final wiring/results in `2549413`. All five
  commits, including the prior `0702210` documentation, are published on `codex/gate7f-agent-foundation`.
  This is not an integration merge or deployment.
- M1-S1 now wires independent chat/research/code selections into the actual answer-service composition,
  with separate v2 configuration/manifest schemas and exact startup model binding. Review/agent selections
  remain inert; no route, executor or grant is created. Legacy ordinary v1 values/digests are preserved.
- Local validation: full suite **797/797**, role contracts **12/12**, role integration **15/15**, roadmap
  **15/15**, all three prior seals intact. Independent review found no blocking issue. The tests use
  synthetic inputs and provider doubles; they do not qualify a model, live stack or production release.
- Results and limitations: `gate7f/function-first/M1-S1-RESULTS-2026-08-28.md`. Specific Qwen3.6 runtime
  diagnosis: `gate7f/function-first/QWEN36-READINESS-PLAN-2026-08-28.md`. Historical timeouts are not a
  demonstrated model-quality failure; the old reasoning directive and transport need controlled diagnosis.
- The initial environment publication block is resolved. The steward reaffirmed already-given permission;
  a fresh fetch confirmed ancestry, then the normal non-force push advanced GitHub from `be094bd` to
  `25494137b755828adaef66b72822a4b1258446d3`. `git ls-remote` independently confirmed the exact branch tip.
  No indirect route, force push or new product approval gate was used. Continue under the recorded M1
  authorization; ask only for genuinely needed human testing/presence, not repeat permission for this work.
- No Home/Control command, model load/download, service change, production routing change, protected-data
  access or source-repository edit was made for this increment. The running-release details below are
  retained prior evidence, not a fresh 2026-08-28 live-status check.
- Next: retrieve the full roadmap, finish the M1 customer-function work (starting chat/context) and run
  bounded third-model readiness in parallel. Freeze the actual functional acceptance cases/runtime before
  matched three-model runs. Do not declare M1 or any of the 17 complete from this wiring result.

## Repository identity and authority

| Repository or branch | Current role | Authority |
|---|---|---|
| Legacy `RunaAI` repository | Intact rollback system and behavior reference | Verified fallback; no longer selected-core write authority after Gate 6D close |
| `Runalab` repository | Completed stack-selection and evidence archive | Historical component evidence only; no new product implementation |
| RunaAI-Next `main` | Exact inherited RunaLab completion baseline | Stable integration target only after reviewed migration completion |
| RunaAI-Next `runa2/integration` | Accumulated accepted migration gates | Development integration; not production |
| Short-lived `runa2/*` gate branches | One approved, measured migration slice | Experimental until validated and approved |
| Control release `runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc` | Running selected-core RunaAI application and bounded JavaScript sandbox at the canonical LAN origin | Production authority for the exact selected read-only core, reviewed Chat/Code navigation, and harmless JavaScript Run envelope; later product capabilities remain separately decision-gated |

The product name is RunaAI. `RunaAI-Next`, `runa2`, and similar labels are repository and branch
identifiers during migration, not product identities.

## Verified lineage

```text
RunaLab source commit: ec5e3466f6f937c8c610bdecf62a09c2491c7137
RunaAI legacy reference at bootstrap: 71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2
RunaAI-Next baseline tag: runalab-stack-baseline-2026-08-20
RunaAI-Next origin: https://github.com/matthewferrill/RunaAI-Next.git
```

`runalab` and `runaai-legacy` are configured as fetch-only remotes in the Omen bootstrap checkout.
Their histories are reference inputs. Never merge the unrelated legacy RunaAI history into this
repository and never push migration work into either source repository.

## Current status

- Repository lineage and source remotes are established.
- GitHub branch protection is active on `main` and `runa2/integration`: pull requests and resolved
  conversations are required; stale reviews are dismissed; admins are included; force-pushes and
  deletion are blocked. Required status checks remain unset until a real CI check exists.
- `main` remains at the exact RunaLab completion baseline. `runa2/integration` contains accepted work
  through the reconciled Gate 6D production release and post-cutover hardening.
- The completed laboratory evidence, seals, probes, stack bakeoff, model findings, architecture
  assessment, and conditional estimates are inherited.
- Gate 1 contains an isolated synthetic-only implementation of the smallest ordinary read-only
  chat/research path. Its approved code-review remediation and refreshed evidence were accepted by the
  steward on 2026-08-21 and merged into `runa2/integration` as `7107ead`. It is development evidence,
  not an authority for production behavior.
- The one approved Gate 4A aggregate inventory opened only the named project/chat roots and decrypted
  chat records in memory under Matthew's Control identity. It emitted no protected value and copied,
  converted, imported, or migrated no record.
- Gate 7F-1 has downloaded only the explicitly authorized, pinned Gemma 4 26B A4B Q4_0 artifact to
  Home. Its 14,439,363,584 bytes and full SHA-256 match; no multimodal projection or other model was
  downloaded. Download evidence is `gate7f/evidence/GATE7F1-GEMMA-DOWNLOAD-2026-08-27.json`.
- Gate 6D activated the exact private Control production path for the selected core. No model was
  downloaded, no provider credential was introduced, and no external spending path was activated.
  Candidate PostgreSQL, Keycloak, OpenFGA, Node, and Caddy are retained; only private Caddy TLS is
  exposed, while the other candidate listeners remain loopback-bound.
- Gate 7A's canonical LAN origin is active at `https://runa.bridgebuildersai.com`. The Porkbun A record
  resolves to Control's private address, the ordinary WebPKI certificate is trusted from Omen, Caddy is
  the only new LAN-facing service on TCP 443, and every backend remains loopback-bound. Keycloak now
  advertises the same-origin `/auth` issuer and `runa.bridgebuildersai.com` RP ID. The session cookie is
  host-only, `Secure`, `HttpOnly`, and explicitly `SameSite=Lax`; off-LAN ingress remains disabled.
- The exact active release is `runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc`, commit
  `747aabc03b291badf4f8a16743a7bd019d384451`, and artifact digest
  `248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167`. Authority remains active,
  cutover is closed, and PostgreSQL, Keycloak, OpenFGA, the model provider, and the JavaScript sandbox
  are ready. The exact Gate 7D predecessor remains the automatic application rollback target;
  configuration, identity policy, model, legacy, and protected product data are unchanged. Ordinary
  verified users may explicitly run only the accepted harmless JavaScript envelope.
- Gate 7A is not closed. Canonical-origin owner passkey sign-in has completed and the protected
  `matthew-owner` path remains passkey-only. The steward approved a separate ordinary-user model:
  invitation-only enrollment, an individual username/password, verified-email recovery, and an
  optional passkey for ordinary chat. Public self-registration remains disabled. The local
  implementation uses a separate exact password-only Keycloak client, separate encrypted sessions,
  owner-role password denial, an exact automatically reversible application successor, and short-lived
  rollback-safe invitations. Focused Gate 7A validation is 67/67. The separate client and password route
  reconcile exactly, the owner client is unchanged, and selected-core authority/protected data remain
  unchanged. SMTP, the first ordinary invitation, password setup, ordinary sign-in, and the initial
  conversational UI are active. A second PC, a phone, off-LAN ingress, and certificate renewal remain
  separate checks.

- Gate 7B is now frozen by
  `gate7b/GATE7B-CUSTOMER-JOURNEY-SCOPE-AND-GREEN-CRITERIA-2026-08-24.md`. It replaces symptom-by-symptom
  chat repair with one login-to-logout acceptance unit covering sustained ordinary chat, safe provider
  results, retries, continuity, all internal read-only answer lanes, and truthful workspace/code limits.
  No new effect, source picker, web research, code execution, learning activation, protected-owner
  capability, or off-LAN ingress is included.
- Gate 7B's source correction now passes 393/393 repository tests and all 11 checks in the executable
  login-to-logout synthetic customer journey. The already-running Control private model passed all
  five aggregate checks for cold/warm plain chat, evidence-bearing research, evidence-bearing workspace,
  exact model identity, deterministic role routing, and citation mode. Ordinary chat no longer requires
  model-generated JSON; incomplete model results are typed, not recorded as completed turns, and receive
  a customer-safe retry path. The bounded deadline chain is 60 seconds application, 65 seconds browser
  and provider proxy, and 70 seconds public application proxy. The rollback-protected application/Caddy
  successor is active. Omen live acceptance proved ordinary password sign-in, session entry, ten sustained
  customer turns, general model conversation, honest live-lookup refusal, and continued recovery after
  the prior failures. It also exposed two presentation defects: `.mjs` was served as generic binary data,
  preventing Edge from running the page, and typed audit labels were appended to otherwise valid customer
  prose. Both are corrected in the Gate 7B exact release. The steward's exact-release recheck returned the
  correct square root of pi without an audit label and the live-weather limitation without Gate terminology.
  Gate 7B is complete.
- Gate 7C is frozen by
  `gate7c/GATE7C-UI-SHELL-SCOPE-AND-GREEN-CRITERIA-2026-08-24.md` and implemented on the isolated
  `codex/gate7c-ui-shell` review branch at `1490a9b`. The presentation-only slice restores the familiar
  RunaAI three-column workspace around the existing ordinary chat: independent empty left and right
  expansion areas, the central transcript and composer, warm Dawn styling, and no labels, feature
  wiring, persistence, or data access. Gate 7C passes 5/5 focused checks, Gate 6B
  passes 32/32, Gate 7B passes 17/17, and the full repository suite passes 398/398. Disposable
  loopback visual checks passed at wide desktop, constrained desktop, and phone widths after correcting
  mobile grid placement. The exact rollback-protected successor is now active on Control as the release
  named above; its configuration digest is unchanged, owner proof and both login routes reconciled, and
  its predecessor remains retained. Full evidence is in
  `gate7c/GATE7C-UI-SHELL-RESULTS-2026-08-24.md`. The steward accepted the proportions and visual
  direction before Gate 7D added the first rail capability.
- The steward accepted Gate 7C's overall visual direction and requested the first left-rail capability.
  Gate 7D is frozen and implemented on the dependent `codex/gate7d-chat-code-navigation` branch.
  It replaces the generic ordinary-member label with a bounded initials avatar and signed-in display
  name, and adds separate Chat and Code navigation areas. Each area has its own New action, encrypted
  participant-scoped projects, durable chat-record list, and independent in-memory selection state.
  PostgreSQL remains the only record authority; the browser gains no local catalog. Code is a distinct
  deterministic conversational role with no repository, file, terminal, execution, network, learning,
  or protected-record capability. Focused validation passes 8/8, the full repository suite passes
  406/406, `git diff --check` passes, and desktop/phone visual checks passed against a disposable
  loopback preview. Source commits are `27fa026` for frozen criteria, `7b9b3bb` for implementation,
  `3ddaee0` for source evidence, `fa1ac32` for rollback-window live validation, and `65b907b` for exact
  successor launcher binding. The corrected exact release is active on Control. Authority, protected
  data, identity, Caddy configuration, network exposure, model configuration, and legacy RunaAI remain
  unchanged. The retained Gate 7C release is the automatic application rollback target. Full evidence
  is in `gate7d/GATE7D-CHAT-CODE-NAVIGATION-RESULTS-2026-08-24.md`; the remaining Gate 7D decision is
  ordinary-user live review followed by a separate merge decision. The first live review passed fresh
  ordinary sign-in, new Chat creation, exact record reopening, switching between retained chats, and
  continued history, but blocked merge on five end-to-end defects: a generic `test` false-positive in
  project-intent routing, approved-knowledge failures retained as completed turns, standalone Code
  incorrectly requiring project knowledge, and an ordinary session capped by the short-lived access
  token despite retaining a refresh credential. A separate current-message relevance failure repeated
  the prior Italy answer for a France question. The bounded correction is frozen in
  `gate7d/GATE7D-END-TO-END-FLOW-CORRECTION-SCOPE-AND-GREEN-CRITERIA-2026-08-25.md`; the active release
  remains unmerged and no model or protected authority changed.
- The first correction successor fixed Chat routing, failed-turn retention, standalone Code routing,
  current-message instructions, and ordinary-session renewal. Live Chat then passed, while Code
  invented `64/12` context and returned `76` for the retained `14+12` follow-up. Direct private-model
  probes ruled out request replay, Caddy caching, role drift, and a consistently bad endpoint; the
  remaining defect was unverified model-output relevance and arithmetic consistency. Standalone Code
  received a bounded second-pass response review, and any correction had to verify before retention.
  That successor passed the opening and retained `14+12=26` live checks but failed twice on the next
  `15+15` request. Exact replay proved the draft was correctly `30` while the verifier promoted the
  previous `14+12` turn into current authority and proposed `26`; fail-closed re-verification prevented
  that stale correction from being retained. The verifier now receives only the current request and
  candidate answer, while conversation continuity remains with the drafting provider. Source and exact-
  Control suites pass 423/423. The exact active release at `e10e3db` accepted `15+15=30` 3/3, rejected
  stale `14+12=26` 3/3, and passed the integrated active-release history smoke 3/3. The `16adbca`
  predecessor is retained for automatic rollback. Ordinary-browser acceptance then returned
  `15+15=30`, `115+25=140`, a correct new four-parameter program, and the retained composite result
  `25` without an incomplete response or stale values. Gate 7D merged into `runa2/integration` as
  `3d95e503d6e56b61c16324eba650ef0c8161b5fa`. The merged tree exactly matched the accepted branch,
  the full post-merge suite passed 423/423, and the source branch remains retained.
- Gate 7D's first exact activation attempt failed closed because its staged launcher was still bound to
  Gate 7C while its manifest named Gate 7D. Artifact verification rejected the mismatch and the guarded
  operator automatically restored the exact Gate 7C release and readiness state. The corrected operator
  now rejects a predecessor-bound launcher before creating release or rollback paths. The second attempt
  used a newly generated successor-bound launcher, activated the exact commit and artifact, reconciled
  owner and ordinary login routes, and validated every required live HTML and controller marker before
  reporting success. No protected or private values were retained in the evidence.
- Gate 7E-0 / 7E-1 is active and accepted as a bounded extension: truthful drafted-versus-executed
  status and one harmless, authenticated, ordinary-user JavaScript Run action. The source implementation
  merged into `runa2/integration` as `f092d358a18f0ec0b6c2eaaeaf9a057b1d7f6d68`; the corrective branch
  replaced unsafe MXC drive-root propagation with a repository-owned target-only operator, preserved
  AppContainer isolation, and activated the exact release named above. Local, Control, and active-runtime
  suites pass 441/441. A real SYSTEM-context sandbox run returned exact stdout `140`, and ordinary-browser
  acceptance proved **Draft -- not run**, explicit **Run in sandbox**, **Ran in sandbox**, and exact output
  `140`. It does not add network, packages, repositories, persistent files, Git, terminal access, or
  broader Code work. Full evidence is in
  `gate7e/GATE7E-CONTROL-REPAIR-AND-ACTIVATION-RESULTS-2026-08-26.md`.
- The steward accepted Runa Agent Mode as the broader Code product direction on 2026-08-26. Runa will
  support conversational project work with selectable approval profiles, isolated workspaces,
  deterministic capability governance, truthful execution receipts, and rollback. The accepted sequence
  is to build the inert/model-independent foundation first, run the separately reviewed Gemma and
  incumbent burn-in against that realistic harness, and activate broader project effects only after a
  model role and exact capability set pass their own gates. The direction and non-authorization boundary
  are recorded in `gate7f/GATE7F-RUNA-AGENT-MODE-DIRECTION-AND-SEQUENCING-2026-08-26.md`.
- Gate 7F-0 is implemented and locally green on the isolated `codex/gate7f-agent-foundation` branch.
  The model-independent control plane covers project-scoped tasks, a closed synthetic capability
  registry, deterministic approval profiles, exact proposals, remembered allow/deny choices,
  executor-issued receipts, idempotency, restart continuity, scoped audit, and separately governed
  rollback. Focused validation passes 28/28 and the full repository suite passes 469/469 across 451
  subtests. The aggregate synthetic journey passes denial, approval, restart replay, rollback, and safe
  autopilot without a real filesystem, process, network, provider, model, protected-data, or production
  effect. It is not browser-wired or deployed. Full evidence is in
  `gate7f/GATE7F0-INERT-AGENT-FOUNDATION-RESULTS-2026-08-26.md`.
- Gate 7F-1 is preregistered and sealed before any model output. The exact first new arm is Google's
  first-party Apache-2.0 Gemma 4 26B A4B instruction-tuned QAT Q4_0 GGUF; Gemma 4 31B is an exact
  conditional quality arm, and the installed Qwen3 Coder remains the mandatory incumbent rerun. The
  deterministic corpus contains 35 cases repeated three times, with hard all-attempt gates for
  current-turn relevance, authority boundaries, and execution honesty. Focused validation passes
  11/11, the complete 105/105 offline stub denominator passes, the five-file seal passes, and the full
  repository suite passes 480/480 across 462 subtests. No model was downloaded, loaded, called, or
  selected. Full evidence is in
  `gate7f/GATE7F1-OFFLINE-PREREGISTRATION-RESULTS-2026-08-26.md`.
- On 2026-08-27 the steward explicitly authorized the pinned Gemma 4 26B A4B download and Home-only
  sealed comparison against the installed Qwen incumbent, one model at a time, with exact hashes,
  synthetic evidence, telemetry, and unload afterward. Control and production routing must remain
  unchanged. The execution plan is `gate7f/GATE7F1-HOME-EXECUTION-PLAN-2026-08-27.md`; the initial
  read-only Home preflight found no LM Studio instance loaded. The exact download is now verified.
  Home capture is complete to the sealed stop condition, not accepted as a model comparison: each arm
  retained 66 complete observations, then hit the 256-token cap on the first execution-honesty case.
  Both exact instances were unloaded, GPU memory returned to its prior baseline, all nine raw evidence
  transfer hashes match, and the original five-file seal is unchanged. The selected runtime was the
  already-installed Vulkan 2.28.2; an initial unscored CUDA-manifest mismatch was retained and corrected
  before any scored output, without changing runtime settings. Focused capture/metadata/summary tests
  pass 17/17 and the complete repository passes 497/497 across 479 subtests. Numeric/keyword grading
  defects and an incomplete model-facing nested JSON contract prevent a clean role-selection result;
  genuine model-layer authority confusion is recorded separately. Full evidence and the proposed
  decision to correct/reseal the evaluation are in
  `gate7f/GATE7F1-HOME-BURNIN-RESULTS-2026-08-27.md`. No Control or production change was made.
- The steward subsequently authorized correction/resealing and a fresh rerun of both exact artifacts
  under the same Home-only boundary. The committed v2 criteria are
  `gate7f/GATE7F1-V2-CORRECTION-PLAN-2026-08-27.md`. V2 lives alongside the unchanged v1 package,
  supplies the complete nested schema, uses explicit current-answer fields and numeric tolerance for
  bounded fact cases, flags ambiguous prose for review, and freezes equal larger output caps with
  cutoff-as-failed-observation accounting. Criteria commit `25b6c5a` precedes implementation/seal commit
  `9e1e36c`; the 21-file v2 seal was frozen before either model call. Both Home arms completed all
  105 observations with zero cutoffs and unloaded. Qwen has 75 automatic passes, 18 failures, and
  12 reviews; Gemma has 90 passes, six failures, and nine reviews. Twelve Qwen failures are correct
  answers missing the requested label, not wrong facts. Gemma proposed an unauthorized change in all
  three simulated tool-output-authority attempts; both models also have planning or supplied-state
  gaps. Neither is automatically eligible. Full validation is 512/512, v2 focused tests are 15/15,
  both seals pass, and all six raw evidence transfer hashes match. Full results and limitations are
  `gate7f/GATE7F1-V2-HOME-RERUN-RESULTS-2026-08-27.md`. The correction/reseal/rerun task is complete;
  no post-output tuning, Control change, model switch, push, merge, or production activation occurred.
- The first ordinary-user activation attempt failed closed before identity creation or application
  restart. RCA: Windows PowerShell 5.1 collapsed the empty Keycloak client response to `$null`, and
  strict mode rejected `.Count`. Normalized reconciliation then proved zero ordinary clients, zero
  ordinary flows, no generated secret, unchanged registration/username policy, and the exact prior
  application release. The operator now array-wraps empty and single-item API results before counting;
  focused and full validation remain green before retry.
- The second attempt reached the successor and preserved selected-core readiness, then failed its final
  route probe because the operator expected HTTP 302 while the tested application contract uses HTTP
  303 for browser sign-in redirects. Automatic rollback restored the exact predecessor and removed the
  attempt-created ordinary client, flow, and secret. The probe now requires 303; application behavior
  is unchanged.
- The third attempt proved the ordinary password route initialized, then failed closed because the
  successor's owner route required the completed owner proof to be bound to that exact immutable
  release. The proof correctly remained predecessor-bound, and the deployment omitted the audited
  completed-owner rebind that earlier canonical activation already required. A wrapped Windows
  PowerShell HTTP exception obscured the safe component error. Automatic rollback restored the exact
  predecessor and removed the attempt-created client, flow, and secret. The corrected deployment now
  rebinds only the completed owner proof, retains the prior proof, changes no authority or protected
  product data, is idempotent for an exact retry, and safely unwraps nested HTTP exceptions. Focused
  Gate 7A validation is 67/67 and the full suite is 370/370.
- The fourth attempt reached the successor and failed closed before owner-proof mutation because the
  successor's stricter configuration parser rejected the older predecessor configuration, which
  correctly predates the ordinary-client block. Automatic rollback restored the exact predecessor and
  removed the attempt-created client, flow, and secret. The rebind operator now validates each config
  with the parser shipped by its own immutable release while still comparing the exact shared authority,
  database, key, and canonical-origin bindings. Native Node stderr is captured without letting Windows
  PowerShell convert a safe structured error into an early terminating error.
- The first interactive Porkbun enrollment attempt failed closed with no credential retained. RCA: a
  clean Windows PowerShell 5.1 process had not loaded `System.Security`, so the DPAPI `ProtectedData`
  type was unavailable. A secret-free owner probe proved DPAPI and restricted-directory writes healthy.
  Enrollment and preflight now load the assembly explicitly before DPAPI use, and unexpected enrollment
  failures report only a safe stage-specific code.
- The remediated Control-local Porkbun enrollment passed under `RUNA-CONTROL\Matthew`; the credential is
  retained only as DPAPI CurrentUser data in the existing ACL-restricted candidate secrets root. The
  authenticated read-only preflight passed for `bridgebuildersai.com` and confirmed zero existing
  `runa` A/AAAA/CNAME records at that time. No private value was retained in evidence. The wildcard
  certificate was subsequently staged, validated, and activated without exposing its private value.
- No migration gate is approved merely by this bootstrap.
- Bootstrap documentation and clean-clone validation were reviewed and merged into
  `runa2/integration` as `94ba860`.
- Gate 0 contract/evidence freeze was approved by the steward on 2026-08-20 for integration through
  PR #2. The steward separately approved Gate 1 implementation on 2026-08-20.
- Gate 1 prerequisites are complete: exact Node 22.22.0 is installed and green, Node 22.23.2 is
  rejected by the sealed latency gate, and the low npm advisory has an explicit synthetic-slice-only
  disposition.
- Gate 1 implementation was explicitly approved and built on `runa2/gate-1-read-only-slice`. The
  remediated deterministic suite passes 24/24 and the disposable real-stack integration passes 25/25
  with clean shutdown. The full repository suite passes 38/38, 10/10 seals and all 12 pinned legacy
  suites remain green, and Qwen3 Coder passes 12/12 refreshed live synthetic acceptance runs. On 2026-08-20 the steward approved
  a Gate 1 scope amendment deferring Qwen3.6 deliberate review and the existing live BGE endpoint;
  neither is silently replaced or credited. The steward subsequently accepted the regenerated Gate 1
  evidence. Protected review then found total-deadline, concurrent-idempotency, and post-window-32
  reranker gaps. The steward approved the narrow remediation on 2026-08-21; it completed with green
  refreshed evidence on 2026-08-21, which the steward accepted the same day. The steward separately
  approved the protected merge, completed as `7107ead` on 2026-08-21. The source branch remains
  available.
- Gate 2 planning and implementation are isolated on `runa2/gate-2-read-only-continuity` from
  `7107ead`. The steward approved Gate 2A on 2026-08-21. The bounded synthetic implementation now
  passes all 34 frozen corpus cases and 21/21 disposable selected-stack integration checks with clean
  shutdown and Gate-2-only rollback. Gate 2 regression review exposed an intermittent Gate 1 Qdrant
  timeout-label race; the steward approved a narrow remediation on 2026-08-21. The refreshed Gate 1
  deterministic suite passes 26/26, Gate 1 integration passes 25/25, and full Gate 0 verification
  passes 48/48 plus 10/10 seals. Timeout and genuine dependency loss are now deterministically
  distinguished. The steward accepted Gate 2B evidence and separately approved Gate 2C on
  2026-08-21. The protected merge completed as `4c4767f`, preserving the reviewed Gate 2 commits and
  source branch. Live-model validation was not run and remains separately decision-gated.
- Gate 3 was explicitly approved and implemented on `runa2/gate-3-governed-action` from integration
  head `93cc44e`. The bounded slice has one action only: changing the synthetic verified participant's
  default intelligence level in an owned managed-project context. Its 26/26 contract suite and 16/16
  disposable PostgreSQL/LangGraph integration checks pass, including response-loss resume, direct and
  concurrent replay, atomic failure rollback, stale-revision denial, one deed/one receipt/outbox, and a
  separately governed rollback from `High` to `Medium`. The full 74/74 Node profile, 10/10 seals,
  12/12 pinned legacy suites, and Gate 1/2 integration regressions remain green. The steward accepted
  the evidence and separately approved the protected merge, completed as `0680cfb` on 2026-08-21.
  The source branch remains available; this is not production authorization.
- Gate 4A is isolated on `runa2/gate-4a-project-chat-plan` from `0680cfb`. The steward approved Gate
  4A-1 on 2026-08-21. The synthetic project/chat migration at `1f5f8be` implements the typed
  `runa_core` authority, immutable `runa_migration` ledger, application AES-256-GCM envelopes,
  external keyed reconciliation, content-free tombstones, idempotent/restart-safe imports, scoped
  reads, and Gate-4A-only rollback. All 19/19 frozen Gate 4A cases, 16/16 disposable PostgreSQL
  integration checks, and the full 93/93 Node profile pass. Gate 1, 2, and 3 disposable integration
  regressions pass 25/25, 21/21, and 16/16 respectively; Gate 0 passes with 10/10 seals and all 12
  pinned legacy suites. The aggregate-only owner inventory tool is implemented and fails closed on
  authority mismatch. RUNA-CONTROL's clean production checkout is at `b4db040`, while live GitHub
  `main` was observed at the rewritten `71ce985` history. All ten Gate 4A legacy source selections are
  content-equivalent after `utf8-lf` canonicalization; the inventory now verifies those pins, bound
  to `b4db040`, before protected roots can open. The approved owner-context execution passed on
  RUNA-CONTROL: 25 readable unassigned chats, 75 turns, zero projects or project-memory records, zero
  unreadable/relationship findings, deterministic second pass, and no disallowed output. No record
  was exported, copied, converted, imported, repaired, or migrated during inventory. The steward then
  approved Gate 4A-2, and the Control-local protected rehearsal at `04bfb7d` preserved all 25 chats and
  75 turns with identical whole-domain logical digests, one committed run, 100 ledger items, atomic
  failure rollback, idempotent restart/replay, owner-bound DPAPI key recovery, scoped-read denial, and
  no private value in retained evidence or target/log scans. The source remained byte-exact. The
  temporary target schemas, data, key, backup, runtime, listener, and root were removed. On 2026-08-21
  the steward accepted the Gate 4A-2 evidence and separately approved the Gate 4A protected merge into
  `runa2/integration`. The protected merge completed as `90572a0`, preserving the reviewed Gate 4A
  commits and source branch. Post-merge verification passed the full 93/93 Node profile, Gate 1–4
  disposable integration regressions, 10/10 seals, and all 12 pinned legacy suites. No production
  adapter or cutover is authorized.
- Gate 4B planning is isolated on `runa2/gate-4b-learning-events-plan` from accepted integration head
  `9b0d4a4`. The steward approved synthetic contract work and a protected aggregate-inventory design
  on 2026-08-21. The branch preserves the complete E6 append-only learning-event and approval-history
  chain in authenticated envelopes, enforces append-only successors and retry safety, and keeps all
  approved-knowledge projection and retrieval disabled. Its frozen corpus contains 20 synthetic
  cases. The steward approved Gate 4B-I on 2026-08-21; its fail-closed Control runner adds five
  synthetic checks for exact owner/host/commit/branch/source-pin authority, two-pass determinism, and
  reconstructed allowlisted output. The one approved Control owner inventory passed on 2026-08-21:
  90 healthy E6 entries contain 63 learning events, 10 lifecycle entries, and 63 approval decisions in
  17 batches; 53 lessons are active and 10 corrected, with zero unreadable, integrity, or lineage
  findings. One readable E3 inbox record remains unresolved; E4 has two authority records but no
  review transactions/capsules; E5 is absent; and the device vault remains owner-bound and unchanged.
  No protected value was retained and no data was copied or migrated. The steward then approved the
  E6-only Gate 4B-R rehearsal. At `4ee5e93`, the complete 90-entry journal was re-encrypted into
  disposable loopback PostgreSQL, read back in exact order, and removed. Source and target logical
  digests matched; transaction rollback, concurrent replay, changed-run refusal, restart retry,
  encrypted typed storage, and private-value scans passed. E3, E4, E5, the device vault, and every
  protected source byte remained unchanged. The temporary schemas, database, key, backup, runtime,
  listener, Control root, and Omen staging root were deleted. Focused Gate 4B tests pass 25/25 and the
  full repository suite passes 118/118. The steward accepted the evidence and approved the protected
  development merge on 2026-08-21. The merge completed as `61d364b`, preserving the reviewed commits
  and source branch. It does not authorize a retained migration, learning activation, Gate 4C, or
  production cutover.
- The steward selected projection-first Gate 4C-1 on 2026-08-21. The isolated branch
  `runa2/gate-4c-approved-knowledge-projection` reconstructs active approved knowledge only from an
  authenticated accepted Gate 4B chain, requires explicit participant/project/capability scope before
  deterministic bounded relevance, uses keyed provenance, and denies stale or lifecycle-due
  projections. Curriculum catalogs remain inactive candidate templates. Its frozen corpus passes
  28/28, the full Node suite passes 146/146, and Gate 0 plus Gate 1-4 disposable regressions are green.
  No protected data was opened; model-context activation, answer-lane wiring, persistent projection,
  Qdrant, embeddings, BGE, and production routing remain disabled. The steward accepted Gate 4C-1A
  and approved its development merge on 2026-08-21. The merge completed as `d203cc7`, preserving the
  reviewed commits and source branch.
- Gate 4C-2's explicitly authorized Control comparison reconstructed the complete E6 active boundary
  independently in legacy RunaAI and the Gate 4C projection. Both produced 53 active lessons with
  exact scope parity: 1 personal, 5 project, 16 capability, and 31 global. No protected content or
  identifier was retained, both Control repositories remained unchanged, the temporary dependency
  copy was removed, and the full Node suite passed 152/152. The steward accepted and merged the
  comparison-only development evidence into `runa2/integration` as `4ed6a52` on 2026-08-21. It did
  not activate answer lanes, persist a projection, or authorize a derived index.
- The accelerated synthetic closeout contract for Gate 4C-3A, Gate 4D, and Gate 4E was frozen from
  accepted integration head `4ed6a52` on `runa2/gate-4-closeout-synthetic`. It preserves the standing
  no-protected-data/no-network/no-persistent-service boundary and stops on any hard safety failure.
- The accelerated synthetic closeout was accepted and merged into `runa2/integration` as `2c38dd5`
  on 2026-08-21. Gate 4C-3A supplies scoped synthetic approved knowledge through
  every read-only lane as non-authoritative advisory context; Gate 4D proves the one-setting
  compatibility boundary and retires/defer-dispositions the legacy provider surface; Gate 4E records
  a current skip for a separate approved-knowledge index, with semantic remeasurement triggers. The
  full 167/167 Node suite, 10/10 seals, 12/12 pinned legacy suites, and disposable Gate 1–4 integration
  regressions are green. No protected data, model endpoint, persistent service, or production route
  was opened or changed. The reviewed source branch remains available.
- Gate 5 planning is isolated on `runa2/gate-5-operations-security` from accepted integration head
  `2c38dd5`. Its frozen synthetic train preserves Runa's household authority policy while replacing
  Windows-bound target authentication/session plumbing with Keycloak OIDC, OpenFGA enforcement,
  one-time capabilities, private Caddy transport, secret references, allowlisted telemetry, and
  authoritative PostgreSQL recovery. Protected E3/E4/device-vault access, production identity,
  non-loopback networking, retained services, and cutover remain separately blocked.
- Gate 5's synthetic implementation and local review are complete. The focused suite passes 40/40,
  the full Node suite passes 207/207, Gate 0 passes 10/10 seals and 12/12 pinned legacy suites, and
  disposable Gate 1-5 integrations are green with clean shutdown. The existing disposable Keycloak
  and OpenFGA bakeoff also passed from an isolated tool copy. No protected store, owner credential,
  production secret, non-loopback listener, retained service, or production route was opened. E3
  remains deferred; E4/device-vault ciphertext will not be copied and requires later witnessed
  re-enrolment; E5 is absent. The steward accepted Gate 5 and its protected merge completed as
  `a986419` on 2026-08-21. The source branch remains available. The merge accepts the application
  contracts and disposable evidence; it is not proof that a production target is deployed.
- Gate 6 planning is isolated on `runa2/gate-6-selected-core-cutover` from accepted integration head
  `a986419`. The steward approved proceeding under the production boundary on 2026-08-21. The frozen
  Gate 6 contract limits promotion to the three read-only lanes, project/chat/setting continuity, the
  complete E6 chain and scoped approved-knowledge projection, one governed setting action, and the
  Gate 5 security boundary. E3 remains deferred; E4 credentials are re-enrolled rather than migrated;
  E5 is absent; device-vault/DPAPI/session/private-key ciphertext is not copied; the separate approved-
  knowledge vector index and broader legacy surfaces remain Gate 7 decisions. Gate 6 begins with an
  executable fail-closed release/cutover rehearsal because the repository currently contains
  selected-core libraries and harnesses, not a production application entry point or steward UI.
- Gate 6A's executable release/readiness/cutover boundary is green locally. Its focused suite passes
  25/25; the full repository run passes 232/232; Gate 0 passes 10/10 seals and all 12 pinned legacy
  suites; and disposable Gate 1-6 integrations are green with every component stopped. The Gate 6
  PostgreSQL rehearsal survives restart and response loss, refuses mismatched live identity without
  advancing state, closes only after the frozen observation window, and proves target-session-aware
  rollback to legacy. Retained evidence is aggregate-only. A read-only Control inventory found the
  live legacy runtime clean and commit-aligned at `b4db040`. At that Gate 6A observation, the clean
  RunaAI-Next verification checkout was still at `4ed6a52` with no Gate 6, dependency tree, release
  entry point, or persistent selected-stack service. That was the hard blocker Gate 6B subsequently
  closed; no production traffic or protected data changed during the Gate 6A inventory.
- Gate 6B's exact release-composition and parallel-candidate criteria are frozen on
  `runa2/gate-6b-release-composition` from accepted integration commit `2b15ef1`. The release must
  wire `runa_core`, `runa_learning`, the selected setting/action receipts, Gate 5 security, and Gate 6
  authority into one fail-closed Node 22.22.0 entry point. It may run on Control only as an isolated
  empty shadow candidate; protected data, owner credentials, selected-write freeze, and traffic
  promotion remain Gate 6C/6D boundaries.
- Gate 6B is green and complete, including the accepted host-restart criterion. The exact running
  release is
  `runaai-next-selected-core-2026-08-21-77f3017` (`77f3017`). Control now runs candidate-owned
  PostgreSQL 18.6, Keycloak 26.7.2, OpenFGA 1.18.3, Node 22.22.0, and Caddy 2.11.4 with only the exact
  private Caddy bind exposed and every other candidate listener on loopback. The live artifact's
  29,380 files verify; all dependency, service-restart, shadow-denial, and encrypted distinct-target
  restore checks are green. The full suite passes 252/252, the focused suite 19/19, and the disposable
  Gate 6B and Gate 6 integrations pass 11/11 and 10/10. Legacy Control remains reachable, clean, and
  commit-aligned at `b4db040` on its original loopback listeners. No protected data, owner credential,
  legacy-write freeze, traffic change, or promotion occurred. Recurring protected-data backup and a
  recurring protected-data backup remains deferred until before Gate 6C import. The owner-approved
  Control reboot passed: all five candidate tasks started at boot, the exact candidate returned after
  its 29,380-file cold scan within the ten-minute allowance, and legacy returned after Matthew's login
  at the exact pre-restart commit. Pre/post schema, counts, and complete logical authority digests match
  for the application, Keycloak, and OpenFGA databases. Gate 6B is closed without importing protected
  data or changing authority.
- Gate 6C preparation was merged to accepted integration as `ff15c61`. Its frozen train binds the
  exact four selected domains, new target owner
  ceremony, recurring encrypted backup, bounded selected-write freeze, aggregate owner preflight,
  memory-only retained delta, exact reconciliation, abort cleanup, and promotion-ready handoff. The
  setting value and selected action-receipt count remain unknown until an authorized aggregate-only
  preflight. Non-protected implementation may proceed, but owner enrollment, protected-store access,
  legacy write freeze, retained import, and traffic promotion remain blocked until the coordinated
  maintenance window.
- Gate 6C's first non-protected preparation tranche is green. Its focused suite passes 27/27, the
  full Node suite 280/280, Gate 0 and all disposable Gate 1-6C integrations are green, and every
  disposable service stopped. The tranche implements exact authority contracts, the owner-ceremony
  state machine, encrypted backup/scheduled restore tooling, a fail-closed selected setting/action
  inventory, four-domain PostgreSQL staging, exact reconciliation, restart/replay, and target-only
  rollback. The exact merged release `runaai-next-gate6c-shadow-2026-08-22-ff15c61` now runs on
  Control at commit `ff15c618`, verified artifact `fff3c379`, and verified configuration `f8db543c`.
  Its browser entry point is green and stopped at `verify-recovery-authority`; selected data and target
  users remain empty. It opened no protected store and changed no legacy service, ACL, credential,
  retained protected row, traffic, or authority. Legacy has no reliable selective maintenance switch;
  the prepared safe default is a reversible whole-state write deny that preserves reads and requires a
  named maintenance-window decision before activation. The current hard boundary is the witnessed
  recovery-authority and owner passkey ceremony; synthetic evidence or an admin token cannot
  substitute for witnessed owner sign-in, step-up, revocation, and recovery.
- Gate 6C target-owner and backup readiness is now complete on Control. The exact running release is
  `runaai-next-gate6c-readiness-2026-08-22-669139e` at commit `669139e`, artifact `d8a39de1`, and
  configuration `c0980e45`. The witnessed ceremony is complete at revision 7 with two distinct
  passwordless credentials. The SYSTEM-owned recurring backup passed under that release, and
  generation `20260822T0843051927477Z` restored all three databases into distinct disposable targets
  that were then destroyed. The read-only freeze preflight passed, but no freeze is active. The live
  readiness result is deliberately `ownerCredentialEnrolled=true` and `authority=shadow`; cutover is
  still `planned` revision zero, protected data is not imported, production traffic is unchanged, and
  legacy remains clean at `b4db040`. Owner completion is not candidate promotion.
- The steward explicitly authorized the protected Gate 6C/6D maintenance window on 2026-08-22. The
  bounded operator is implemented with exact-pinned promotion-candidate deployment, read-only
  preflight, whole-state freeze, two-pass four-domain capture, retained-row and approved-knowledge
  reconciliation, promotion/rollback, fresh passkey live validation, 120-sample one-hour observation,
  and verified freeze release. Synthetic and disposable verification is green at 293/293 overall,
  24/24 Gate 6B, and 36/36 Gate 6C; this entry does not claim the live window has run.
- The first exact promotion-candidate deployment failed closed on SQLSTATE `42P01` because readiness
  queried the Gate 6C run table before the protected-import schema existed. Automatic rollback restored
  the exact prior shadow release and backup action; live confirmation retained planned revision zero,
  legacy authority, no protected import, no traffic change, and no freeze marker. The bootstrap state
  now means “not imported,” while all other database errors still fail readiness closed.
- The first authorized protected attempt failed before any cutover transition. Target rollback kept
  legacy authority; ACL restoration succeeded, but marker finalization initially failed because two
  audit properties were absent. Bounded recovery finalized the marker as `released` and confirmed zero
  deny rules, no import, no traffic change, and planned revision zero. The corrected design archives a
  released lease before a distinct retry, inserts audit fields explicitly, runs operator prerequisites
  before freeze activation, and emits a safe step-specific failure code.
- Gate 6D is complete and closed. Exact release
  `runaai-next-gate6d-promotion-2026-08-22-a886754` at `a886754` is authoritative for the selected
  core on Control. The four approved domains reconciled exactly with 102 project/chat records, 90 E6
  entries, one selected setting, zero selected action receipts, and 53 active approved-knowledge
  lessons. A fresh owner passkey session, all three representative read-only lanes, the governed
  setting change and rollback, target-session revocation, 120/120 samples over 60 minutes, 14 freeze
  checks, and final reconciliation passed. Cutover closed, the freeze was released with reason
  `gate6-closed`, and legacy remains healthy and tracked-clean at `b4db040` as the rollback system.
  Matthew's exact Caddy root is trusted only in `CurrentUser\Root`; Windows-native chain validation
  reaches the private HTTPS entry point with status 200 and no certificate bypass. Full verification
  passes 298/298 and the combined Gate 6B/6C focused suites pass 65/65. Details are in
  `gate6c/GATE6D-CUTOVER-RESULTS-2026-08-22.md`.

## Bootstrap findings

- The inherited Node suite passes **14/14** in the repository-owner context. The sandbox-only first run
  could not create `probes/results/_payloads` in the newly added checkout and reset its localhost stub;
  the exact owner-context rerun passed.
- All **10/10** current seal verifiers pass in this fresh Windows clone.
- Clean-clone validation found four seal verifiers hashing raw checkout bytes while the repository's
  existing `seal-file.mjs` helper canonicalized Git's LF/CRLF transport difference. The four verifiers
  now use that helper. No sealed preregistration, runner, result, seal hash, or adjudication changed.
- `npm ci --cache .npm-cache` installed the committed lockfile: 336 packages, one low-severity audit
  advisory, and an engine warning because installed `posthog-node@5.49.1` requests Node `^20.20.0` or
  `>=22.22.0` while Omen currently provides Node `22.21.0`. Do not run `npm audit fix` or change the
  runtime implicitly. Gate 0 must select a supported Node patch and explicitly disposition the advisory.

## Selected foundation

- Mastra plus AI SDK/OpenAI-compatible application/provider boundary;
- LangGraph JS with PostgreSQL checkpointing;
- PostgreSQL as authoritative records, idempotency, outbox, and postcondition store;
- Nomic embeddings, Qdrant derived vectors, and existing BGE with explicit overlapping windows;
- Caddy as outer transport and timeout boundary;
- OpenTelemetry with allowlisted/redacted attributes;
- deterministic application routing across the selected model roster; and
- one-time scoped capabilities for governed effects; and
- Keycloak and OpenFGA only after functional/data parity.

This list selects infrastructure. It does not replace Runa's identity, constitution, authority,
consent-first learning, typed knowledge, project/participant scope, provenance, honest uncertainty,
plain-language steward experience, or governed action pathway.

## Gate tracker

| Gate | Scope | Status | Approval required to start |
|---|---|---|---|
| Bootstrap | Establish repository lineage, remotes, branches, instructions, and status | Complete | Reviewed and merged as `94ba860` |
| 0 | Freeze contracts, parity corpus, data inventory, redaction policy, and green thresholds | Complete | Approved by steward 2026-08-20; PR #2 accepted for integration |
| 1 | Smallest disposable read-only chat/research slice | Complete; accepted and merged as `7107ead` | Complete |
| 2 | All three read-only answer lanes plus chat/project/settings continuity | Complete; evidence accepted and merged as `4c4767f` | Complete |
| 3 | One reversible governed idempotent action | Complete; accepted and merged as `0680cfb` | Complete |
| 4 | Governed data migration, one domain at a time | Complete; accepted and merged as `2c38dd5`; legacy unchanged | Complete |
| 5 | Operations, private transport, authentication/authorization, recovery | Complete; accepted and merged as `a986419` | Complete |
| 6 | Selected-core production cutover and rollback window | Complete and closed; exact selected-core release is authoritative, observation green, freeze released, legacy rollback healthy | Complete |
| 7A | Multi-device access foundation | Canonical LAN origin, owner passkey path, SMTP/invitation, separate ordinary password client, and Omen customer acceptance active | Representative clients, certificate renewal, and off-LAN boundary remain |
| 7B | Complete customer journey through the selected read-only stack | Complete; production sign-in, sustained chat, safe presentation, exact-release recheck, and rollback evidence green | Approved by steward 2026-08-24; completed 2026-08-24 |
| 7C | First user-interface shell | Complete and superseded on Control by the Gate 7D presentation release | Source integration remains part of the Gate 7D review chain |
| 7D | Identity-aware Chat/Code navigation and end-to-end flow correction | Complete; accepted and merged as `3d95e50`; current-turn verifier successor active on Control at `e10e3db`; post-merge and exact-Control suites 423/423 | Complete |
| 7E-0/1 | Truthful execution status and harmless bounded JavaScript Run | Complete; exact successor active and ordinary-browser acceptance green; local, Control, and active-runtime suites 441/441 | Complete |
| 7F | Conversational Agent Mode with selectable approval profiles | Matched qualification complete: 256 requests and one-hour endurance per model; independent blind review and provenance complete; 755/755 repository tests; neither meets a complete frozen role threshold | Gemma is the stronger development candidate; fix and requalify the bounded workflow before any model switch or effectful activation |
| M1 | First useful agent milestone; five functions, three primary model candidates | Authorized, not complete; scope and acceptance in `roadmap/CURRENT-SLICE.md` | Standing 2026-08-28 authorization; human customer test before closure |
| M2-M5 | Remaining full-product capability families | Required destination in `PRODUCT-ROADMAP.md`; not satisfied by M1 | Preserve explicit scope, governance and evidence for each capability |

## Bootstrap validation

Before closing bootstrap:

1. Confirm `main`, `runa2/integration`, and the baseline tag resolve to `ec5e346` before documentation.
2. Confirm `runalab/main` resolves to `ec5e346` and `runaai-legacy/main` resolves to `71ce985`.
3. Confirm source remotes have disabled push URLs.
4. Run the inherited 14 Node tests and all 10 current seal verifiers. **Complete: 14/14 and 10/10.**
5. Run `git diff --check` for the bootstrap documentation. **Complete before staging.**
6. Stage explicit paths, commit on `runa2/bootstrap`, and push only to RunaAI-Next origin.
7. Review the bootstrap branch before merging it into `runa2/integration`.

## Gate 0 evidence

`gate0/` freezes the proposed Gate 1 request/response contract, 18-case synthetic parity corpus,
seven exact deterministic sample outputs, legacy source/test hashes, 12-suite focused profile,
data-inventory command contract, trace allowlist, 24-hour synthetic retention, and hard green
thresholds. The Gate 0 verifier passes 14/14 inherited Node tests, 10/10 seal verifiers, and 12/12
focused legacy suites in the repository-owner context.

The full legacy portable verifier ran 128 applicable checks: 127 passed and one action-executor test
failed because the sandbox identity cannot read `C:\Users\matth\.config\git\ignore`; Git's warning
text entered an assertion that expected an empty change list. Owner DPAPI and configured-provider checks
were correctly skipped, and live approved-library provenance was explicitly not checked because no
application service was started. This is recorded as an environment limitation, not as guarded-lane
or Gate 1 parity evidence.

The Gate 1 prerequisite batch installed exact Node 22.22.0 and reran the full Gate 0 verifier green.
Node 22.23.2 was tested and rejected because its sealed stub average repeatedly measured 12.54–14.70
ms; installed Node 22.22.0 measured 0.66–0.78 ms. The repository now pins the accepted patch.

The npm result is two low dependency entries for one underlying uncontrolled-resource-consumption
advisory, `GHSA-866g-f22w-33x8` / `CVE-2026-8769`, through
`@mastra/core@1.59.0 -> @ai-sdk/provider-utils-v5@3.0.30`. GitHub lists no first patched version and
the newest published 3.x observed during disposition was 3.0.32, within the advertised affected range.
The risk is temporarily accepted only for Gate 1's disposable synthetic boundary with hard time,
byte, abort, and retry controls. It continues to block production and widened network/provider scope.
No dependency was changed during the prerequisite disposition. Full evidence is in
`gate0/GATE1-PREREQUISITES-2026-08-20.md`.

## Next operation

Active continuation is M1-S2. R14 is closed with no qualifying Review route. Its committed green criteria are
`gate7f/function-first/M1-S2-FUNCTIONS-AND-GREEN-CRITERIA.md`: real conversation/context, supplied-source
research/review, disposable project execution, durable governed tasks and customer integration. Continue
under standing permission until completion or meaningful human testing; do not stop after internal commits.
The R15 corrective contract is now frozen from the exact R14 model defects. Implement and verify its
generic model-neutral correction without models, commit/reseal the source, then require fresh controls
and real-browser proof before a fresh complete 360+12 campaign and candidate-blind review.
Do not replay or regrade R14.

The roadmap/retrieval guard and M1-S1 role wiring are implemented, tested and published through `2549413`.
Retrieve the full roadmap before the next bounded chat/context function slice, alongside the separate
Qwen3.6 readiness diagnosis. The full sequence, failure criteria, human-test boundary and remaining work
are in `roadmap/CURRENT-SLICE.md`. The publication blocker is resolved, not a reason to re-request permission.
Model identity, tool authority and durable records remain application-owned. Preserve the current
Control release and all protected data while validating the candidate. This replaces the old
two-model/qualification-before-disposable-functions next-step sequence below.

## Previous qualification closeout (2026-08-27, retained evidence)

The steward has now authorized the coordinated qualification package, reversible environment work on
Omen/Home/Control, parallel agents, documentation, commits and branch pushes, with no destructive work.
`gate7f/GATE7F-QUALIFICATION-AUTHORIZATION-AND-CRITERIA-2026-08-27.md` freezes the work boundary and
role criteria before implementation: independent fresh cases/review, shared context/structured-output
and authority corrections, matched synthetic end-to-end runs, and an initial one-hour soak per model.
Production routing and protected data remain unchanged. Human input is reserved for human-only testing.

The coordinated qualification is complete. The first `RUN-SEAL.json` arm completed
Qwen's 117 quality requests but stopped safely on a GPU boundary before integration/soak; its exact
failing sample was not retained, so heat remains the leading explanation rather than a proven exact
sample. That capture and seal are preserved. Both models completed under the identical temporary
160-W/GPU envelope in `gate7f/qualification/RUN-SEAL-POWER-V2.json`, with unchanged 85-C cutoff,
new unsafe-sample retention, exact UUID/power telemetry, cool starts, and required verified restoration to
260 W afterward; restoration was verified by the operator and a separate final Home read. No answers
were inspected to tune this environmental change. These are repeated
acceptance inputs, not a newly unseen holdout. Details are in `THERMAL-RESEAL-2026-08-27.md`.
The design and diagnostic findings are in
`gate7f/qualification/QUALIFICATION-FREEZE-2026-08-27.md`. Both models completed the 42 protocol
probes and nine corrected full-schema probes. Large decoder string limits caused a pre-generation
grammar rejection; a single-factor adapter change resolves that rejection while the unchanged
application parser retains its limits. Dropped second-system state was not reproduced in the simple
state probes. Exact task grants, effect-time policy checks and receipt-bound state now cover the
independently found synthetic authority races. These corrections are not production Agent Mode.

Both 117-request acceptance sets, eight actual synthetic application round-trip requests and 131-request
one-hour endurance arms per model are complete: 256 requests each, no provider failures or incomplete
responses, and verified unload. Both full arms passed independent source and measurement checks.
Final Home status confirms no model left loaded and original 260-W GPU settings. Control's final
runtime/health records match its initial baseline; production routing and release remain unchanged.
Independent blinded grading and adjudication of all 234 responses are retained in qualification's
`initial-judgments` and `results` directories; initial records are not overwritten. All semantic
ambiguities are resolved; an underspecified source-label comparator remains an explicit measurement
limitation with its original protocol failures intact. Only afterward was Candidate-A revealed as Gemma
and Candidate-B as Qwen. Gemma is stronger on this bounded conversational/static-code set, but neither
passes every frozen complete-role threshold. Both have three repeated critical model failures of
different kinds. No current candidate is promoted.

The final source-bound composition verifies both complete captures against the original review
snapshots, anonymous packets and final independent judgments; no semantic regrading is involved.
The evidence-backed recommendation, hardware limits, retained-source paths and read-only reproduction
command are in `gate7f/GATE7F-QUALIFICATION-RESULTS-2026-08-27.md`. Final regression validation is
755/755 tests with all original/new seals and initial judgment hashes intact.

The follow-up role clarification and ordered work are in
`gate7f/GATE7F-ROLE-DISPOSITION-AND-NEXT-STEPS-2026-08-27.md`. All four product areas had bounded
coverage, not four independent role approvals: coding was static drafting/explanation, tools were
synthetic, and research used supplied sources rather than the live web. Qwen here means Qwen3 Coder,
not the separately deferred Qwen3.6 deliberate-review model; no comparison with Qwen3.6 was performed.

The next work is a bounded workflow successor: independently selectable role/model contracts,
model-independent grant/revocation enforcement and truthful receipt presentation, exact-proposal and
calculation reliability, and a prospective source-label correction. Then qualify the changed workflow
on newly sealed independent cases before validating exact routing/residency and the customer trial.
Prioritize Gemma as an ordinary-chat candidate while retaining Qwen3 Coder as the incumbent/coding
candidate; select each role independently. Neither model is approved for a production switch or
broader autonomous work by these results. Keep the accepted production route and harmless sandbox
unchanged until the successor's applicable gates pass; broader code execution and live research remain
separate capability work, not prerequisites to completing every limited chat improvement.

The original partial v1 and complete v2 records are preserved. V2 recorded
105 observations per model with zero cutoffs; its verifier accepted them, but later review found
missing provenance bindings, now covered by 85 independent mutation/sequence checks in qualification.
Its role findings remain historical, not a substituted final model selection. Keep production routing
unchanged. Do not open the 31B arm,
alter sealed v2 grades, or infer a model switch/tool activation from this experiment. Any revised
evaluation requires a new preregistered version. The first effectful capability set, disposable-project execution,
retained-project use, and each later capability group remain separate approval gates. UI refinement, live
weather/web access, attachments, additional project functions, and off-LAN access also remain separate
decisions. The active Control release and its exact Gate 7D rollback predecessor remain unchanged by this
direction record.

## Live R15 method-gate update (2026-09-01)

Inference remains paused. Three fresh create-only stages exposed only method defects: a stale
2,439/2,440 archive-count pin, self-rejection of the validator-created `transient` directory, and a
resource watchdog whose 15-minute lifetime equaled the permitted 15-minute browser-witness wait. The
first two stopped before controls; the third completed controls 01-09, timed out at the browser witness,
and then lost its disposable PostgreSQL endpoint before controls 11-12. It reports
`modelsInvoked:false` and `productionChanged:false`.

The first two bindings are corrected and regression-covered. Functional-control resources now live 30
minutes against one unchanged 15-minute witness ceiling. The separate publication proof can use two
sequential witness windows, so its resources live 45 minutes. Deterministic tests require both lifetimes
to be strictly greater than their complete permitted witness windows. A new source seal and fresh
controls/browser proof are required before Gemma inference.

Gate 6 remains closed and selected-core production authority remains active at the exact release named
above. Gate 7A follow-on checks for a second PC, phone, certificate renewal, and separately reviewed
off-LAN ingress remain independent of the Gate 7C presentation branch. E3, E4/device-vault recovery,
the separate approved-knowledge vector index, Qwen3.6 deliberate review, the existing live BGE
endpoint, and broader legacy capabilities also remain separately deferred.

## Focused actual-system Gemma Review qualification (2026-09-02)

The 120-attempt R15/browser method remains retired after its documented operator failures. It was not
restarted. The steward-approved reduced method tested the eight frozen Review scenarios through the
actual Omen -> Control -> Home transport and actual Home Gemma runtime, once each, with no mock evidence
used for qualification.

Gemma returned 8/8 semantically correct Review answers. The first actual checker run proved the R15
unconditional four-field schema removed the nullable-output failure, while exposing two remaining
application-contract technicalities: `correct` was interpreted as "the candidate is correct," and an
accepted selected-citation set could be rejected solely for order. The final application contract uses
the unambiguous actions `accept` and `revise`. On accept, the application retains the original answer and
citations; checker echo text cannot mutate accepted output. A revision remains limited to one recheck and
every citation remains validated against unique selected evidence.

The final actual checker run `focused-review-checker-20260902-cb6e5785b5af` passed all eight scenarios:
8/8 HTTP 200, 8/8 expected model identity, 8/8 valid closed non-null objects, 8/8 `accept`, and zero
foreign citations, semantic errors, infrastructure errors or lifecycle errors. Every actual model run
unloaded its exact owned instance, verified zero final residency and restored both Home GPUs to 260 W.
Production routing and protected data were untouched.

Gemma is selected as the single candidate for the bounded Review model role under this corrected
contract. This is not Agent qualification, application/browser acceptance, production promotion,
statistical reliability or whole-product qualification. Exact evidence, limitations and all method RCAs
are indexed in `gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-RESULTS-2026-09-02.md`.
A separate static review of the frozen evidence and application contract returned `GO` with no P0/P1
commit blocker and performed no model, browser, mock or test campaign.

## Five-function model selection complete (2026-09-02)

R13 remains immutable actual-system qualification evidence for Gemma Chat 24/24, Research 23/24, Code
24/24 and Agent 24/24. It recorded exclusive Home model leases, required actual application/browser
checkpoints, 12/12 shared controls, complete candidate-blind semantic review, zero final model residency,
restored GPU limits, unchanged production routing and no protected-data read. The later R15 method failures
do not retroactively invalidate those completed passes.

The focused Review result closes the remaining model-role gap. Gemma may therefore be selected as the
single model candidate for all five bounded M1 functions; no model pool and no further LLM qualification
campaign are required on the current artifact, settings and contracts. Coder remains an optional stronger
Research alternative by score, not a requirement.

This completes model-function selection only. The exact current application build still requires its
actual Omen-Control-Home acceptance journey, followed by the separate production-routing and customer-trial
gates. Another model-scoring campaign is justified only after a material model artifact, inference-setting,
role-prompt, checker-semantic or frozen functional-contract change, or a specific actual production defect.
