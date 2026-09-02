# Actual Review readiness failure RCA — 2026-09-02

## Scope and classification

- Gate: the single pre-inference Omen -> Control -> Home readiness check for the focused eight-case Gemma Review qualification.
- Outcome: stopped before Home inspection completed.
- Classification: operator/test-method failure; ungraded; not a Gemma attempt.
- Model effects: no model load request and no inference request occurred.

## Observed failure

The Omen orchestrator connected successfully to the `runa-control-wsl-codex` profile, then attempted to execute `powershell.exe` by name. The remote shell returned:

`bash: line 1: powershell.exe: command not found`

The readiness command exited immediately. No later readiness step was treated as passed.

A second corrected-route invocation also stopped locally before opening the Home hop. Its PowerShell source assigned a script body to `$home`. PowerShell variable names are case-insensitive, so this attempted to overwrite the read-only built-in `$HOME` variable and raised `Cannot overwrite variable HOME because it is read-only or constant.` No model or inference request occurred in this invocation either.

## Root cause

The command combined two different Control execution environments incorrectly. `runa-control-wsl-codex` opens a Linux shell. Windows PowerShell interop exists at the explicit path `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`, but `powershell.exe` is not on that Linux shell's `PATH`.

This was an orchestration assumption, not a host, runtime, application, or model defect.

The second failure was a local script-construction defect: the ad hoc readiness command was not parsed and checked locally before external execution, and it used a variable name prohibited by the operator environment.

## Corrective design

The corrected readiness gate separates the two Control roles:

1. Collect Windows Control identity, operating-system, PowerShell, Node, and hardware evidence through the Windows `runa-control-codex` profile.
2. Use `runa-control-wsl-codex` only as the authenticated SSH transit hop to `runa-home-codex`; do not invoke Windows programs by an unqualified name from WSL.
3. Supervise each SSH process from Omen with a 30-second absolute deadline and terminate only its owned local process tree on timeout.
4. Require Home to report zero loaded model instances, the live LM Studio registry, expected hardware, and the pinned Gemma artifact before inference is enabled.
5. If any corrected readiness assertion fails, stop again, preserve the output as a new actual-system failure, and do not load or score Gemma.
6. Use task-specific variable names such as `$homeProbeSource`; never assign `$HOME`, `$home`, or `$CODEX_HOME`. Parse the complete PowerShell source locally before executing any external hop.

## Resume point

Resume at the same readiness gate with the corrected split-profile method. The eight-case Review run remains at zero attempts.
