# M1-S2B actual Omen Git attempt 1 stop and RCA — 2026-09-02

Status: Git/MXC layer and downstream implementation are paused for criteria amendment and independent
review. Browser, HTTPS, model and production work did not run.

## Exact actual failure

- Source: uncommitted Git-observer work based on `3c1dc57`.
- Actual host preflight: MXC 0.8.0 reported supported `processcontainer`, exact
  `appcontainer-dacl` tier and the two already documented DACL warnings.
- Command: `node gate7f/function-first/omen-local/actual-git-proof.mjs` with explicit pinned PowerShell,
  user-profile, `C:\Program Files\Git\mingw64\bin\git.exe` and Git installation-root arguments.
- Stage: first `contained-git-status` operation.
- Result: `omen-git-process-failed`, native exit `4294967295`. MXC reported
  `CreateProcessW failed: The system could not find the environment option that was entered.
  (0x800700CB)`.
- Containment/cleanup: Git never launched. The runner removed the owned `runa-m1-omen-git-*` repository
  and DPAPI state. No remote, model, browser, listener, certificate or production operation occurred.

## Root cause

The observer supplied the frozen exact Git environment as `config.process.env`. MXC 0.8.0's Windows
ProcessContainer on the actual Omen rejects a non-empty custom environment array before child startup.
This is the same measured MXC compatibility boundary previously found for the Control JavaScript
executor; the new design incorrectly assumed it would work for Git without an Omen startup proof.

## Rejected correction

A shell, PowerShell or custom launcher inside MXC could set environment variables before starting Git,
but it would add another executable/process, create a quoting surface and violate the closed
fixed-command operation contract. It is not selected.

## Selected design correction

Omit `process.env` entirely. The pinned Git 2.54.0 binary exposes native global command-line forms for the
three environment-only safety controls measured here:

- `GIT_OPTIONAL_LOCKS=0` -> `--no-optional-locks`
- `GIT_NO_REPLACE_OBJECTS=1` -> `--no-replace-objects`
- `GIT_NO_LAZY_FETCH=1` -> `--no-lazy-fetch`
- pager suppression -> `--no-pager`

The fixed command also overrides hooks, fsmonitor, credential helper/interaction, askpass, external diff,
text conversion, attributes, excludes, interactive diff filters and protocol use with literal `-c`
arguments and operation flags. Remote-capable verbs remain unreachable and MXC denies all network,
including host loopback; therefore no credential or terminal prompt path is reachable. Repository config
continues to be parsed and refused before launch for includes, helpers, filters, fsmonitor, external diff,
alternate stores, replacements and promisor behavior.

The frozen criteria must be amended and independently return P0=0/P1=0 before code changes or one exact
Git affected-scope retry. The retry must prove all five permitted Git views, unchanged repository bytes,
and actual deny-all containment. No broader suite or downstream gate may substitute.
