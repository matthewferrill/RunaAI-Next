# M1-S2 Agent-governance PostgreSQL concurrency fixture — 2026-09-04

## Status and planning boundary

Status: corrected fixture execution is complete. Both JavaScript syntax checks passed on the
initial pre-review bytes. The first child import-only loader check then stopped before module evaluation because this
isolated worktree has no `node_modules`. A fresh independent fixture/method review subsequently returned STOP at
P0=0/P1=3. Review of those corrected bytes stopped again at P0=0/P1=1 because the exact inspection-call total was
under-counted. After correction, fresh review returned P0=0/P1=0. The one import retry passed, the sole disposable
PostgreSQL run passed 1/1, the authenticated dependency junction was removed and the owned artifact root was empty.
The first external CIM process census then stopped with `Access denied`; a separately reviewed non-CIM exact-root
witness passed without rerunning the fixture and found zero owned synthetic PostgreSQL processes.

- Roadmap revision: `2026-08-28.1`.
- Roadmap digest: `7c31dc90109e13f02927cc54fcdd88b41abe093a4cc65a7deaed81f0e99b74f1`.
- Milestone/slice: `M1` / `M1-S2`.
- Capability IDs: `C12` autonomous task completion and `C15` complete working interface.
- Source baseline: pushed commit `971487421821ada884cc992e9a709e7eaeb10601` on isolated branch
  `codex/m1-agent-postgres`.

This lane uses the accepted `M1TaskService`, `M1TaskOrchestrator` and `PostgresTaskStore` without changing
production source. It adds only one bounded integration test, its fresh-process reload helper, and this evidence
record. It does not use a model, browser, Control, production database, private data, network beyond the disposable
PostgreSQL loopback, or a real executor. It cannot establish model, browser, Control, release, customer or human
acceptance.

## Frozen fixture cases

One top-level test starts one owned disposable PostgreSQL instance and constructs three separate pools with distinct
backend session IDs over one encrypted synthetic task schema. All objectives and source values contain fixed
non-private canaries, while exact schema/table inventory and length-framed whole-row digests prove the cleartext does
not enter PostgreSQL.

The finite cases are:

1. Two sessions obtain the same atomic Agent fence, both finish the read phase and block together at `prepare`, then
   race the second transaction. Exactly one proposal may commit; the loser must be `m1-agent-action-stale`. There is
   no intent, receipt, outbox, effect, run or active window.
2. Exact duplicate proposal replay returns the original record without a write; changed arguments under the same
   request ID fail with no write.
3. A freshly fenced action against an already-revoked grant fails with no database or adapter change.
4. An ask-every-time effect remains `pending-approval`; execution without exact approval creates no intent, receipt,
   outbox or adapter effect.
5. Two concurrent Agent starts use the same fence. One run and one active window exist at most while the authorized
   planner is held; the loser is stale. The held planner then stops before returning a plan, the window closes, and
   no proposal, workflow or effect exists.
6. An exactly approved ask-every-time run is resumed from two sessions. The per-run PostgreSQL operation lock admits
   one window/workflow at most; the loser is `m1-operation-in-progress`. The controlled workflow stops before the
   effect boundary, the window closes, and no intent, receipt, outbox or materialization exists.
7. One authorized synthetic test observation is interrupted after the adapter returns and before publication. The
   production service persists proposal/intent `unknown` and run `needs-reconciliation`, with no receipt or outbox.
   Immediately before restart, the fixture requires the final authoritative outbox count to remain zero and asserts
   the exact complete adapter call vector: one setup creation/verification, five prepares, nine inspection reads
   (one project-verification read, five prepare reads and three orchestrator planner-snapshot reads), exactly one
   authorized `executeTests`, and zero materialize or materialization-observation effects.
   A genuinely fresh child Node process reconstructs its own pool, encrypted store and service, reproduces exact
   settled and blocked authority digests, observes the unknown state unchanged, rejects successor work, invokes no
   adapter method, and leaves the complete authority snapshot byte-stable.

Every expected rejection takes a full before/after authority snapshot and requires exact equality. The one-winner
races additionally assert the exact permitted row deltas and complete task-local record/window state. Test teardown
aggregates the primary failure with pool, cipher and database cleanup failures, requires zero entries in the owned
artifact root after PostgreSQL stops, and never drops or resets another database.

## Retained read-only inspection defects

Before fixture construction, one PowerShell file-inventory command failed at parse time with `An empty pipe element
is not allowed` because `| Format-Table` followed an ungrouped `foreach`. No file was read by that command and no
edit, test, PostgreSQL operation or acceptance identity was consumed. The reviewed correction was:

```powershell
$rows = foreach ($f in $files) { ... }
$rows | Format-Table -AutoSize
```

A later read-only `rg` inventory used Unix-style wildcard path arguments on Windows and reported filename error 123.
The corrected inspection used `rg -g '*.mjs' ... gate7f/function-first`. Neither inspection defect changed source or
consumed a fixture/test/acceptance attempt.

One subsequent RCA inventory repeated the ungrouped-`foreach` formatting mistake, again failing at PowerShell parse
time before reading a file. A `ConvertFrom-Json` inspection also encountered PowerShell's duplicate/empty-property
limitation for npm lockfiles. The corrected read-only Node parser established the intended version facts. These are
retained operator inspection defects, not product/test attempts.

## Retained loader stop

The two commands below passed once:

```powershell
node --check gate7f/function-first/agent-governance-postgres.integration-child.mjs
node --check gate7f/function-first/agent-governance-postgres.integration.test.mjs
```

The first import-only loader command then stopped with `ERR_MODULE_NOT_FOUND` for `pg` before child module evaluation:

```powershell
node -e "import('./gate7f/function-first/agent-governance-postgres.integration-child.mjs').then(()=>process.stdout.write('child-import-ok\n'))"
```

The material error was:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg' imported from
D:\Projects\Runalab\runaai-next-agent-postgres\gate7f\function-first\agent-governance-postgres.integration-child.mjs
```

RCA is exact and environmental: `node_modules` is absent in `runaai-next-agent-postgres`. No test body, PostgreSQL
process, schema, fixture identity, source effect or cleanup path ran. The worktree and the primary `9714874` checkout
have identical `package-lock.json` SHA-256
`cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308`; both pin `pg@8.23.0` and `zod@4.4.3`, and the
primary checkout has `pg@8.23.0` installed. The bounded proposed correction is a worktree-local ignored
`node_modules` junction to that exact primary installed dependency tree. It must be reviewed before creation; no
install, package change or import retry is authorized by this record.

This is the same systemic new-worktree dependency-provisioning defect already observed by the independent Artifact
integration lane: a clean isolated worktree at the accepted commit does not inherit the primary checkout's installed
dependency tree. This Agent fixture encountered the defect concurrently during its own first loader check; it did
not replay the Artifact command, its stopped command, or any PostgreSQL/test operation.

## Retained independent review stop and correction

Fresh independent inspection of the initial fixture and dependency method returned STOP at P0=0/P1=3 without
authorizing a junction, import retry, syntax check, test or PostgreSQL execution:

1. `Test-Path` could miss a dangling dependency link, and the method did not authenticate the created junction's
   reparse type, sole target and resolved primary `node_modules` identity before the import retry.
2. A parent-side child-stdin error called the promise finisher immediately, so the parent could enter pool/database
   cleanup while the fresh child was still alive.
3. The final restart boundary did not independently reassert zero outbox rows and the exact complete adapter effect
   vector after the deliberately unknown test outcome.

The corrected dependency method uses `Get-Item -Force -ErrorAction Stop`, treating only an exact
`ItemNotFoundException` as absence, so a dangling link is occupied rather than silently reusable. It authenticates
the newly created item as one `Junction` reparse point with one target whose resolved identity exactly equals the
reviewed primary dependency directory before any import. Parent stream/stdin/output/deadline faults now request
termination, retain a five-second close-escalation deadline, wait for the child's `close` event, and aggregate primary,
stream and termination failures before outer PostgreSQL cleanup can begin. The final pre-child assertions require
zero outbox rows and the exact seven-method adapter call vector, including exactly one post-authorization test effect
and zero materialize/observe effects. These corrected bytes remain unexecuted.

Fresh review of those bytes then returned STOP at P0=0/P1=1: the complete-vector assertion counted six
`inspectRevision` calls, omitting the three orchestrator planner snapshots. The deterministic total is nine: one read
performed by project verification, five reads performed by the five `prepare` calls, and three reads performed for
the start-race, resume-setup and unknown-case planner snapshots. The correction changes only that expected count from
six to nine; every other adapter count and invariant is byte-unchanged. No syntax check, import, test, PostgreSQL,
junction or other execution followed the stop.

The exact frozen source and dependency hashes at the stop are:

```text
agent-governance-postgres.integration-child.mjs
  2dc5deac3ceb73f318659adef74c4691d4dfe65d40e5990318bf9ecf6de24686
agent-governance-postgres.integration.test.mjs
  5fb913ba978b69b7f72fe875127242610c21076daba2ac597ad7bb0310aa8216
runaai-next-agent-postgres/package-lock.json
  cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308
runaai-next-m1-gemma-primary/package-lock.json
  cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308
```

Subject to fresh review, the single proposed provisioning action is the following worktree-local junction. The
preconditions deliberately reject an existing target, a missing source, or package-lock drift:

```powershell
$agentPgDependencySource = 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules'
$agentPgDependencyLink = 'D:\Projects\Runalab\runaai-next-agent-postgres\node_modules'
$agentPgExpectedLockHash = 'cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308'

$agentPgDependencySourceItem = Get-Item -LiteralPath $agentPgDependencySource -Force -ErrorAction Stop
if (-not $agentPgDependencySourceItem.PSIsContainer) {
  throw 'reviewed primary dependency source is absent'
}
$agentPgExistingLink = try {
  Get-Item -LiteralPath $agentPgDependencyLink -Force -ErrorAction Stop
} catch [System.Management.Automation.ItemNotFoundException] {
  $null
}
if ($null -ne $agentPgExistingLink) {
  throw 'Agent worktree dependency target already exists'
}
$agentPgWorktreeLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-agent-postgres\package-lock.json').Hash.ToLowerInvariant()
$agentPgPrimaryLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json').Hash.ToLowerInvariant()
if ($agentPgWorktreeLockHash -ne $agentPgExpectedLockHash -or $agentPgPrimaryLockHash -ne $agentPgExpectedLockHash) {
  throw 'reviewed package-lock identity drifted'
}
$null = New-Item -ItemType Junction -Path $agentPgDependencyLink -Target $agentPgDependencySource
$agentPgCreatedLink = Get-Item -LiteralPath $agentPgDependencyLink -Force -ErrorAction Stop
$agentPgCreatedTargets = @($agentPgCreatedLink.Target)
$agentPgResolvedSource = (Resolve-Path -LiteralPath $agentPgDependencySourceItem.FullName -ErrorAction Stop).ProviderPath
$agentPgResolvedCreatedTarget = if ($agentPgCreatedTargets.Count -eq 1) {
  (Resolve-Path -LiteralPath ([string]$agentPgCreatedTargets[0]) -ErrorAction Stop).ProviderPath
} else {
  $null
}
if (($agentPgCreatedLink.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
    -or $agentPgCreatedLink.LinkType -ne 'Junction'
    -or $agentPgCreatedTargets.Count -ne 1
    -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals($agentPgResolvedCreatedTarget, $agentPgResolvedSource)) {
  throw 'created Agent dependency junction identity is invalid; retain it for reviewed cleanup'
}
```

The proposed path is covered by the repository rule `.gitignore:1:node_modules/`, confirmed with
`git check-ignore -v --no-index node_modules/test-sentinel`; the junction therefore creates no repository diff. After
the admitted check/run, cleanup must resolve the link,
prove it is a reparse point whose sole target is the exact reviewed primary directory, and delete only the link (not
recursively and never the target):

```powershell
$agentPgDependencySource = 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules'
$agentPgDependencyLink = 'D:\Projects\Runalab\runaai-next-agent-postgres\node_modules'
$agentPgSourceItem = Get-Item -LiteralPath $agentPgDependencySource -Force -ErrorAction Stop
$agentPgLinkItem = Get-Item -LiteralPath $agentPgDependencyLink -Force -ErrorAction Stop
$agentPgLinkTargets = @($agentPgLinkItem.Target)
$agentPgResolvedTarget = if ($agentPgLinkTargets.Count -eq 1) {
  (Resolve-Path -LiteralPath ([string]$agentPgLinkTargets[0]) -ErrorAction Stop).ProviderPath
} else {
  $null
}
$agentPgResolvedSource = (Resolve-Path -LiteralPath $agentPgSourceItem.FullName -ErrorAction Stop).ProviderPath
if (($agentPgLinkItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
    -or $agentPgLinkItem.LinkType -ne 'Junction'
    -or $agentPgLinkTargets.Count -ne 1
    -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals($agentPgResolvedTarget, $agentPgResolvedSource)) {
  throw 'refusing to remove an unverified dependency path'
}
$agentPgLinkItem.Delete()
```

The primary dependency directory remains untouched and the isolated worktree returns to its original no-`node_modules`
state.

## Execution result and final witness correction

Fresh independent review returned GO at P0=0/P1=0 for the frozen fixture and dependency procedure. The exact base,
three fixture hashes, matching lockfiles, installed `pg@8.23.0` and `zod@4.4.3`, ordinary dependency source and absent
worktree-local target were reverified. The authenticated junction was created and checked before the one import-only
retry, which returned `child-import-ok`. The three hashes and worktree status remained exact.

The sole authorized PostgreSQL command then passed 1/1 in 10.083 seconds. Its terminal assertions included exact
authority/concurrency/effect state, successful pool/cipher cleanup, `database.stop()` returning
`{stopped:true,ownedSyntheticDataRemoved:true,productionChanged:false}`, and an empty owned artifact root. The junction
was reauthenticated and deleted nonrecursively; the local path was absent, the primary dependency source remained an
ordinary directory, and the primary lock hash remained exact.

The final external command `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'"` stopped with `Access denied`.
This was an operator-evidence permission failure after the green fixture and cleanup, not a PostgreSQL, product or
fixture failure. No import, test or database command was retried. Fresh independent review authorized one replacement
read-only witness using `Get-Process`, fail-closed path readability, normalized `OrdinalIgnoreCase` exact-root matching
and no process mutation. That witness observed seven readable unrelated Reallusion PostgreSQL processes and zero
processes below `D:\Projects\Runalab\artifacts\tools\postgresql\bin\pgsql\bin\`. The Agent fixture therefore has
complete disposable PostgreSQL concurrency and cleanup evidence. It does not establish browser, Control, model,
release, production or customer acceptance.

## Review and execution gate

Before execution, a different fresh reviewer must inspect the exact three files and proposed loader correction, then
return GO at P0=0/P1=0 for:

- genuine separate-session concurrency and deterministic barriers;
- same-transaction fence consumption and exact run/window ownership;
- no unauthorized proposal/intent/receipt/outbox/effect/run/window;
- faithful revoke, ask-every-time, duplicate and resume boundaries;
- fresh-process restart behavior and preservation of `unknown`;
- exact encrypted schema/table/canary snapshots;
- exact zero final outbox plus the complete seven-method adapter vector before the restart child;
- stdin/stream/deadline failure entering bounded termination, awaiting `close`, and preserving termination plus outer
  cleanup failures;
- `Get-Item -Force` dangling-link rejection, post-create junction identity verification, and verified link-only
  nonrecursive cleanup;
- bounded child I/O and complete cleanup aggregation.

The reviewed sequence ran once and is complete. The executed PostgreSQL command was:

```powershell
node --test --test-concurrency=1 gate7f/function-first/agent-governance-postgres.integration.test.mjs
```

The one CIM evidence failure was retained, corrected, reviewed and resumed only at that read-only witness step. The
passed import and PostgreSQL command were not rerun. This PostgreSQL result does not authorize an actual browser or
customer journey.
