# Fix register

Updated 2026-09-04. Lookup index, not a new test harness or an exhaustive historical failure count.
Search this file and the linked RCA before changing an affected API. Preserve original failed evidence.

## Use before implementing

1. Match the cause and affected call path, not just the displayed error. Recheck actual host, identity,
   executable, version, dependency bytes, environment and current working directory where relevant.
2. Read the applicable entry and its source/evidence. Check official installed-version documentation,
   vendor release notes and known issues. A newer documented API is not evidence it exists on our runtime.
3. Prefer a supported vendor correction/configuration, then existing applicable proved implementation.
   An upgrade still needs compatibility/scope review; do not replace pinned dependencies automatically.
4. If neither fits, document the established options examined and the evidence against their applicability
   before the smallest custom correction. An unavailable documentation page is not research completed.
5. Log proposed -> reviewed -> actual-verified status separately. Record source commit, exact test/run,
   host/version, affected callers, rollback, limits and upstream replacement condition. Update the existing
   cause entry on recurrence; do not silently mark the process cause closed because one case passes.

## Verified actual-path corrections

These entries are scoped historical successes, not blanket approval for every caller or runtime.
Shared evidence: [Control eligibility RCA and result][eligibility]. That record includes the exact
successful result hash and operation at source `e309435`, published through `f1ee25b`.

| ID / searchable cause | Proven correction and evidence | Applicability / limits |
|---|---|---|
| FIX-001: ambient Node / wrong runtime | Invoke the sealed release Node explicitly. [Actual Control supervisor result][supervisor] passed 1/1 at `8783643` with Node 22.22.0 and Windows PowerShell 5.1. | Control release path and hash are in the result. Recheck before reuse; no blanket claim that every shell launcher is corrected. Roll back an invocation/configuration only, not the installed system runtime. |
| FIX-002: CLIXML / Preparing modules for first use / progress on stderr | Set `ProgressPreference=SilentlyContinue` inside the actual encoded PowerShell child, covering all helper cmdlets. `3c2e9af`, then full actual Control eligibility PASS at `e309435`. | PowerShell Desktop 5.1. Suppress progress only; retain failure/status/output checks. Do not discard stderr or weaken error admission. Restore prior helper bytes only with the affected stage disabled. |
| FIX-003: parent replacement authority / child owner / inherited ACL | Validate the parent and use the existing owner-private directory creation/verification helper for every operation and watchdog child directory. `d0f8977` + `22dd1b2`, then actual eligibility PASS. | Current Control owner-profile staging, not a C-drive root ACL change. Audit active creation callers. Preserve uncertain scratch; rollback must not broaden permissions or delete unidentified objects. |
| FIX-004: SSH ambient cwd / missing home-directory node_modules | Derive repository root from the module location and set the child cwd explicitly. `ab1b4e7`; 3/3 focused actual Control checks passed from a non-repository SSH cwd. | Node 22.22.0 file modules; see `tools/patch-mxc-sdk-diagnostic.test.mjs`. Not permission to accept ambient dependencies. Reverting the test loses portability, not a product data migration. |
| FIX-005: false dependency drift / different hash algorithms | Pin producer imports the runtime's canonical dependency manifest implementation. `e309435`; 5/5 focused checks on local and Control plus actual eligibility PASS. | `tools/print-gate7f-dependency-manifest.mjs`, `tools/gate7f-dependency-manifest.test.mjs`, and the bootstrap share one algorithm. Recompute from exact reviewed dependencies; never copy an old digest to different bytes. Roll back source, dependencies and pin together. |
| FIX-006: MXC diagnostic import / eager whoami / 97-byte stderr | Exact local patch defers diagnostic pipe lookup until enabled and uses direct fixed-argument `execFileSync`. `b0fd058`; focused checks and actual eligibility PASS. | **Custom, version-bound patch; not vendor-approved.** Only `@microsoft/mxc-sdk@0.8.0` and the vulnerable/patched hashes admitted by `tools/patch-mxc-sdk-diagnostic.mjs`. Prior upstream-alternative exhaustion is not established by retained evidence. Check vendor releases/issues before carrying this patch forward; unknown bytes stop. Rollback requires disabling the affected route and restoring the matching dependency/source/pin set. |

## Official API references checked for this register

- [PowerShell 5.1 Write-Progress](https://learn.microsoft.com/en-in/powershell/module/microsoft.powershell.utility/write-progress?view=powershell-5.1): progress preference behavior, not proof of our full child environment.
- [Node 22.22.0 ES modules](https://nodejs.org/download/release/v22.22.0/docs/api/esm.html#importmetadirname): module-relative directory lookup.
- [Node 22.22.0 child processes](https://nodejs.org/download/release/v22.22.0/docs/api/child_process.html#child_processexecfilesyncfile-args-options): direct executable invocation and cwd options, not endorsement of our SDK patch.
- [Microsoft ACE inheritance](https://learn.microsoft.com/en-us/windows/win32/secauthz/automatic-propagation-of-inheritable-aces): Windows inheritance behavior, not Runa's project-specific private-directory policy.

## Still open; do not reuse as a working fix

The broad shell-boundary and runtime signing-key/service drafts are paused and unverified.
Control eligibility does not prove complete process-tree cleanup, every consumer preflight, aggregate cleanup,
service enrollment, runtime key custody, or exact PostgreSQL/Qdrant/watchdog identity evidence.
See the [completion plan](roadmap/COMPLETION-PLAN-2026-09-04.md) for the affected stages.
This register indexes retained actual corrections only; it does not reopen retired mock campaigns for RCA.

[eligibility]: gate7f/function-first/M1-S2B1-CONTROL-MXC-ELIGIBILITY-STAGING-RCA-2026-09-04.md
[supervisor]: gate7f/function-first/M1-S2B1-CONTROL-SUPERVISOR-ACTUAL-PREFLIGHT-2026-09-04.md
