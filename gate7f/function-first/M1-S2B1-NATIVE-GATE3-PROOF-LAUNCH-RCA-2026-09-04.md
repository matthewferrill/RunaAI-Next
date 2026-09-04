# M1-S2B1 Native Gate 3 proof-launch RCA

Date: 2026-09-04  
Disposition: `STOP` before inner operator, PostgreSQL or test execution  
Failed evidence retained: `artifacts/runs/native-gate3-production-resource-ownership-parent-01`  
Production, protected data, model, browser, network, Native process or PostgreSQL changed: no

## Observed failure

The independently reviewed bounded parent committed at `323e530` stopped in about six seconds with `The system
cannot find the file specified.` Both parent child-log files are zero bytes. The inner operator evidence root and
fixture artifact root do not exist, the worktree `node_modules` junction is absent, and the before/after process
witness found no proof-owned PostgreSQL process. The actual ownership test therefore did not start and receives no
pass or fail credit.

## Root cause and issue shape

The parent constructed its child executable as `$PSHOME\powershell.exe`. The calling Codex PowerShell host is the
portable PowerShell 7 runtime at `C:\Users\matth\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell`.
That directory contains `pwsh.exe`, not `powershell.exe`. `$PSHOME` identifies the current engine's installation
directory; it does not promise the Windows PowerShell executable name. The wrapper combined a PowerShell 7 location
with the Windows PowerShell 5 executable name.

This is a shell-host identity-family defect, not a one-off missing-file condition. The affected shape is any local or
remote operator that combines a discovered shell home/path with a hard-coded executable basename, relies on a shell
name being on an unrelated host's `PATH`, or changes between `pwsh.exe`, Windows `powershell.exe`, and WSL interop
without authenticating the complete executable identity. The exact `$PSHOME` plus wrong-basename construction occurs
only in the new Gate 3 bounded parent, but the broader identity family is not unique and is not declared fixed here.

The read-only non-evidence source audit found the following correction inventory:

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

## Systemic correction and resume rule

For a local Windows PowerShell child, the corrected parent derives the Windows system directory from the OS, appends
the complete `WindowsPowerShell\v1.0\powershell.exe` relative identity, rejects a directory or reparse point, and pins
both file version `10.0.26100.8972 (WinBuild.160101.0800)` and SHA-256
`7600FFE12DA441FE89D035B13801E8E91D064BC544A27B19A5CF49F6AB8B18F5` before launch. PowerShell 7 callers may supervise
that exact Windows executable; they may not synthesize another executable beneath `$PSHOME`.

The failed `parent-01` evidence remains immutable. The corrected method uses fresh `parent-02` evidence, retains the
same reviewed inner operator and test, and resumes at the unstarted child-launch step only. The corrected outer bytes
must pass parser and independent exact-byte review, then be committed cleanly so its self-binding HEAD gate can pass.
Only then may one corrected affected proof run. No model, browser, Native host, public Git, broader suite or production
path is eligible.

The inner verifies that the reviewed bounded parent is the file last changed at current `HEAD`; the parent separately
pins the full inner hash. This two-way binding permits a reviewed parent-only host correction without weakening the
inner identity or requiring an unrelated byte-only change to the inner on every parent revision.

The affected resource-ownership proof may resume before that broader lane finishes because its complete executable
dependency set is the corrected, exact hash-pinned parent/inner pair and it does not invoke any inventoried ambient
launcher. That is bounded evidence for this proof only, not closure of the broader family.
