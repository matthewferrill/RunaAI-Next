# M1-S2B1 Native Gate 3 proof-launch RCA

Date: 2026-09-04  
Disposition: `STOP` after two distinct launch/preflight failures; no retry is authorized
Failed evidence retained: `artifacts/runs/native-gate3-production-resource-ownership-parent-01` and
`artifacts/runs/native-gate3-production-resource-ownership-parent-02`
Production, protected data, model, browser, network, Native process or PostgreSQL changed: no

## Observed failure

### Parent 01: executable identity

The independently reviewed bounded parent committed at `323e530` stopped in about six seconds with `The system
cannot find the file specified.` Both parent child-log files are zero bytes. The inner operator evidence root and
fixture artifact root do not exist, the worktree `node_modules` junction is absent, and the before/after process
witness found no proof-owned PostgreSQL process. The actual ownership test therefore did not start and receives no
pass or fail credit.

### Parent 02: cross-edition module environment and false process attribution

The corrected exact-executable parent committed at `c622e3e` launched Windows PowerShell, but its inner preflight
stopped at the first source hash because `Get-FileHash` was unavailable. `parent-02/stdout.log` is empty and the
retained stderr records that failure. The inner operator evidence root, worktree dependency junction, fixture artifact
root, Node test and disposable PostgreSQL startup were never reached.

The same stderr also listed seven `final-postgres-process-remains` PIDs. That secondary statement is a harness false
positive, not a resource leak. All seven are the unrelated Reallusion PostgreSQL installation under
`C:\Program Files\Common Files\Reallusion\PostgreSQL`, started around `2026-09-04T01:18Z`, more than ten hours before
the proof. The inner initialized its baseline to an empty array, failed before assigning the real process baseline,
then compared the final host inventory against the empty placeholder. No application or model result can be inferred
from either parent failure.

Retained evidence identity:

- `parent-01/stdout.log` and `parent-01/stderr.log`: zero bytes, SHA-256
  `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`;
- `parent-02/stdout.log`: zero bytes with that same empty-file SHA-256; and
- `parent-02/stderr.log`: 1,630 bytes, SHA-256
  `80A00506DEBFB8618550087A54285D3B34D68865CD0F1FA97B9B0DB720476352`.

## Root cause and issue shape

The parent constructed its child executable as `$PSHOME\powershell.exe`. The calling Codex PowerShell host is the
portable PowerShell 7 runtime at `C:\Users\matth\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell`.
That directory contains `pwsh.exe`, not `powershell.exe`. `$PSHOME` identifies the current engine's installation
directory; it does not promise the Windows PowerShell executable name. The wrapper combined a PowerShell 7 location
with the Windows PowerShell 5 executable name.

That first defect is a shell-host identity-family defect, not a one-off missing-file condition. The affected shape is any local or
remote operator that combines a discovered shell home/path with a hard-coded executable basename, relies on a shell
name being on an unrelated host's `PATH`, or changes between `pwsh.exe`, Windows `powershell.exe`, and WSL interop
without authenticating the complete executable identity. The exact `$PSHOME` plus wrong-basename construction occurs
only in the new Gate 3 bounded parent, but the broader identity family is not unique and is not declared fixed here.

The second parent exposed a related but wider environment-boundary defect. The current caller is PowerShell Core
7.6.5. `Start-Process` passed its mixed `PSModulePath` to Windows PowerShell 5.1. That search order placed the portable
PowerShell 7 `Microsoft.PowerShell.Utility` v7/Core-only manifest before the Windows PowerShell
`Microsoft.PowerShell.Utility` v3.1/Desktop manifest. Windows PowerShell therefore encountered an incompatible module
before the module that exports `Get-FileHash`. Pinning only the executable path cannot prevent this cross-edition
module shadowing. Every local PowerShell Core or Node launch of Windows PowerShell is an affected candidate unless it
constructs a child-only Desktop module environment or the child explicitly establishes and verifies one before module
autoload. Fixed absolute executable paths remain candidates; executable identity and module-environment identity are
separate controls.

The false PostgreSQL statement is a third, general harness shape: a cleanup witness cannot attribute a process,
filesystem entry, listener or other ambient resource as newly created unless a real pre-operation baseline was
successfully captured. An empty/default placeholder is not a baseline. This rule applies to analogous before/after
resource comparisons throughout proof tooling, not just PostgreSQL.

A read-only scan of active, non-evidence PowerShell and JavaScript sources found no second process/resource witness
with this exact empty-placeholder-then-difference shape; the affected implementation is the new ownership proof.
That local finding does not weaken the general invariant, and future proof methods must encode baseline validity rather
than depend on a default collection value.

The read-only non-evidence source audit found the following executable-identity correction inventory:

- 18 ambient local Control launch/scheduled-task comparisons across nine production PowerShell files under
  `gate6b/control`, `gate6c/control`, and `gate7e/control`;
- four active local JavaScript launch paths using bare `powershell.exe` (`control/quiescence/file-helper.mjs`,
  `acceptance/owned-control-resources.mjs`, `acceptance/owned-control-watchdog.mjs`, and
  `tasks/control-native-proof.mjs`);
- three active local JavaScript paths deriving a full executable from mutable `SystemRoot` environment state
  (`gate4/dpapi.mjs`, `project/filesystem.mjs`, and `acceptance/extended-controls.mjs`);
- remote Control/Home command builders in readiness, home-runtime, Qdrant, and acceptance paths that use a bare remote
  `powershell.exe`; these are host-profile operations, not local child launches, but still require a separately sealed
  remote executable identity; and
- tests that intentionally encode those current strings. They must change with the corresponding implementation and
  cannot be counted as independent production occurrences. Historical `evidence/` and campaign artifacts remain
  immutable and were excluded from remediation scope.

The family correction is now a Gate 3 prerequisite rather than hidden debt. Local launchers must use an OS-derived
full executable path and a release/host-compatible identity check; supported Windows builds cannot share Omen's exact
binary hash, so installer enrollment must bind the signed Microsoft executable identity and the release must pin the
enrolled host fact. Remote Windows profiles must use an absolute remote Windows path, while WSL profiles must use the
explicit `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` interop path or avoid PowerShell entirely.
Tests must assert the resolved identity, not the legacy basename. This remediation can proceed in an isolated lane,
but all active production callsites above must be closed before Gate 3 final review or human testing.

For module-environment correction, scheduled-task registrations, remote SSH/WSL command strings, pure comparison
tests and immutable evidence are not evidence of this exact local inheritance failure and remain separately
classified. Immediate candidates are local PowerShell/Node processes that directly create a Windows PowerShell child,
including bare-name, environment-derived and fixed-absolute launchers. Several deployment and Home paths already
supply a Desktop-only `PSModulePath`; their exact behavior must be verified rather than rewritten blindly. The
remaining active local candidates are assigned to a separate systemic builder/reviewer lane so the proof wrapper is
not presented as a repository-wide correction.

## Systemic correction and resume rule

For a local Windows PowerShell child, the corrected parent derives the Windows system directory from the OS, appends
the complete `WindowsPowerShell\v1.0\powershell.exe` relative identity, rejects a directory or reparse point, and pins
both file version `10.0.26100.8972 (WinBuild.160101.0800)` and SHA-256
`7600FFE12DA441FE89D035B13801E8E91D064BC544A27B19A5CF49F6AB8B18F5` before launch. PowerShell 7 callers may supervise
that exact Windows executable; they may not synthesize another executable beneath `$PSHOME`.

The failed `parent-01` and `parent-02` evidence remains immutable. The next method uses fresh `parent-03` evidence and
resumes at the still-unstarted preflight/test step only. The parent now pins the actual PowerShell Core caller, Windows
PowerShell executable, Desktop Utility manifest and its `Get-FileHash` implementation. Pre-launch hashes use .NET
cryptography rather than an ambient module command, and the supervised child uses .NET `ProcessStartInfo` plus a
child-only environment rather than ambient `Start-Process` resolution. Before any module-backed path construction,
the inner resets to the exact OS-derived Desktop module root. It then imports the exact hash-pinned manifest and
requires exactly one `Get-FileHash` Function with the Desktop module GUID, version, manifest path and implementation
script path. Those non-private facts are carried in the inner result and revalidated by the outer result contract.
`SilentlyContinue` is established before module import so module progress cannot pollute the evidence channel.

The inner also captures the PostgreSQL baseline before any later fallible preflight and records an explicit
baseline-captured state. Cleanup compares processes only when that state is true; it cannot relabel an ambient host
inventory from an empty placeholder. This same baseline-validity invariant is mandatory for analogous resource
witnesses.

Both parent and inner bytes must pass parser and independent exact-byte review, then be committed cleanly so the
self-binding HEAD gate can pass. Only then may one corrected affected proof run. No model, browser, Native host,
public Git, broader suite or production path is eligible.

The inner verifies that the reviewed bounded parent is the file last changed at current `HEAD`; the parent separately
pins the full inner hash. This two-way binding permits a reviewed parent-only host correction without weakening the
inner identity or requiring an unrelated byte-only change to the inner on every parent revision.

The affected resource-ownership proof may resume before that broader lane finishes because its complete executable
dependency set is the corrected, exact hash-pinned parent/inner pair and it does not invoke any inventoried ambient
launcher. That is bounded evidence for this proof only, not closure of the broader family.

## Parent-03 result and superseding stop

Independent exact-byte review returned `GO P0=0/P1=0`, and commit
`5f09551fb0d58a38fbd9a373da4aab98cb64c8e3` sealed the corrected parent/inner boundary. The one authorized
`parent-03` run reached the actual Node integration test. It then stopped because production composition returned
`sandbox-preflight-failed` before the test's intended PostgreSQL `42501` fault. The disposable PostgreSQL process
`16932` was stopped with a controlled terminal receipt and is absent. No model, browser, Native host, production route
or protected data was used.

This does not reopen either corrected shell failure and does not prove or disprove the production pool-ownership
change. It exposes a different, earlier eligibility defect in the resource-proof method. The retained evidence is:

- parent stdout: 0 bytes, SHA-256
  `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`;
- parent stderr: 562 bytes, SHA-256
  `C0DDD9AF9AF0828937AFC0CC4BC62B248026CD69CAFAAD756E0A4B198F987F97`;
- operator stdout: 1,437 bytes, SHA-256
  `D1E8C501751AC5334B8033BCC78D8E379C8E53A75DB34722751BC4A309474C06`;
- operator stderr: 0 bytes, the empty-file SHA-256 above; and
- retained synthetic fixture manifest: schema `runaai-directory-manifest/v1`, 154 files, 95,077,638 bytes,
  SHA-256 `09c33ad6ea141feee5e6d2ea4293022fab5169f7f26a30a3de524808f4f8c9a7`.

The parent error text also lost the Node exit code and rendered `node-test-failed:` with no value. That observation is
fail-closed but incomplete. Its exact cause is not yet proven. The active executable-boundary lane is auditing the
repository-wide `Start-Process`/exit-code/output-drain lifecycle; the Gate 3 wrappers remain explicitly uncorrected
for that newly observed class until the shared result is reconciled.

The earlier statement that the resource proof could now resume is superseded. The complete eligibility, topology,
diagnostic and retained-fixture RCA is
`M1-S2B1-NATIVE-GATE3-RESOURCE-PROOF-ELIGIBILITY-RCA-2026-09-04.md`. There is no unchanged-byte retry.
