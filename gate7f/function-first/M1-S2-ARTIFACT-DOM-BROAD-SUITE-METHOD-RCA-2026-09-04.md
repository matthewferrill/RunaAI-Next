# M1-S2 Artifact DOM broad-suite method stop and RCA — 2026-09-04

Status: corrected verification complete. Independent implementation review stopped
four times: first at P0=0/P1=3, then at P0=0/P1=2, again at P0=0/P1=2, and most recently at P0=0/P1=1.
All four review rounds and their source/test/method corrections are retained below. Fresh review then returned
P0=0/P1=0, the one corrected run passed 53/53, and the authenticated dependency junction was removed. Five syntax
checks, 15/15 roadmap checks and the diff check passed afterward in the reviewed order. The earlier broad-suite stop is a retained test-
environment/method failure, not an Artifact result implementation, model, database or actual-system failure.

## Exact stop

After the Artifact DOM-focused source/syntax checks passed 12/12, the builder attempted one broader deterministic
regression command from the isolated worktree `D:\Projects\Runalab\runaai-next-artifact-dom`. The command included
the Artifact contract/source/projection/surface/HTTP/DOM/product tests plus
`artifact-result-postgres.test.mjs` and `artifact-result-postgres-http.invariant.test.mjs`.

The exact stopped command was:

```powershell
& node --test gate7f/function-first/artifact-result-contracts.test.mjs gate7f/function-first/artifact-result-sources.test.mjs gate7f/function-first/artifact-result-projection.test.mjs gate7f/function-first/artifact-result-postgres.test.mjs gate7f/function-first/artifact-result-surface.test.mjs gate7f/function-first/artifact-result-http.test.mjs gate7f/function-first/artifact-result-postgres-http.invariant.test.mjs gate7f/function-first/artifact-result-dom.test.mjs gate7f/function-first/product-foundation-ui.test.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & npm run verify:roadmap; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git -c safe.directory=D:/Projects/Runalab/runaai-next-artifact-dom diff --check
```

The run recorded 46 passes and two failures. Both failures occurred before a test assertion:

- `artifact-result-postgres.test.mjs` could not import `pg` through `gate6b/adapters/postgres-continuity.mjs`.
- `artifact-result-postgres-http.invariant.test.mjs` could not import `pg` through
  `artifact-result-postgres-http.integration-child.mjs`.

Both reported Node `ERR_MODULE_NOT_FOUND`. This isolated per-builder worktree deliberately has no installed
`node_modules` tree. No PostgreSQL process, filesystem result operation, browser, model, provider, Control,
production or customer operation started. The command's fail-fast boundary prevented roadmap and diff checks from
running. No successor verification command has run.

The TAP denominator was exactly 48: 46 passed and the two module-load units failed. Each failed file stopped during
ESM package resolution before Node could register or execute any test from that file. Therefore neither failed file
ran a PostgreSQL/database operation, browser operation, model/provider/network operation or product assertion. The
other 46 assertions did execute and passed; that partial result does not convert the stopped broad command into a
green gate or prove that their dependencies came from a reviewed worktree-local tree.

## Root cause

The broad command conflated two already separate evidence layers. The current lane changes browser product modules
and deterministic DOM/download tests. The PostgreSQL owner-port and invariant files belong to the prior source/HTTP
integration lane and require that lane's database runtime setup. Adding them here did not increase DOM coverage; it
only introduced an unrelated `pg` prerequisite into the UI command.

The builder should have inspected the import closure and worktree dependency state before composing the broad command.
This worktree was created as a clean Git worktree for the isolated UI builder. Git worktrees contain tracked source;
`node_modules` is untracked/ignored and was not copied or installed. The selected deterministic UI closure is not
dependency-free: `artifact-result-contracts.mjs` and `artifact-result-sources.mjs` import the repository-locked
`zod@4.4.3`. The earlier passing units could resolve an ambient ancestor `node_modules`, which is not an admissible
or reproducible dependency identity for an isolated lane. Installing a second tree after the stop would widen and
duplicate the environment. The corrected method instead uses one reviewed, lock-identical, worktree-local junction
to the existing primary dependency tree and forbids ambient parent fallback.

The prior source/HTTP milestone already retained fresh source review, its dependency-backed deterministic suite and
exactly one disposable PostgreSQL/HTTP run (1/1) in
`M1-S2-ARTIFACT-RESULT-SOURCE-HTTP-INTEGRATION-2026-09-04.md`. That evidence is immutable. It must not be replayed,
rerun or relabelled as current DOM evidence. Reusing its recorded boundary is not acceptance inheritance: this lane
still needs its own current-byte DOM tests, independent review and later ordinary-browser acceptance.

## Independent implementation review stops and corrections

The first independent review of the retained post-method-stop bytes returned STOP at P0=0/P1=3. No test, browser,
database, model, network or product operation followed that verdict. The three findings were:

1. Browser descriptor admission did not yet bind all owner/source identities, exact kind-format-source combinations,
   and the frozen global ordinal/order rules tightly enough.
2. A ready Research or Review report could become actionable without first proving its one correct same-source ready
   metadata companion through a separate read, length/digest check and strict positive metadata schema.
3. Product wiring evidence was regex-only for the current owner path; it did not drive the real
   `currentResultContext` and Files-navigation modules through saved-conversation, opened-Code-task precedence and
   personal/ephemeral/unsaved no-request paths.

The stopped correction now binds conversation `chatId`/`turn:<ordinal>` and task `taskId`/proposal-or-receipt identity,
the exact kind/format/media/source/provenance/route relationship, unique locators, the frozen conversation and task
sort keys, and index-equal global ordinals. Research and Review reports expose no Verify control unless exactly one
ready metadata descriptor has the same conversation source identity/revision/time/route/evidence; selection reads,
length/digest-verifies and strict-schema-admits that companion before requesting the report. Any missing, non-ready,
mismatched, read-failed, digest-failed or invalid-schema companion keeps the report non-actionable. Current owner
resolution is now a shared real product export used by `status.js`, fails closed for personal/ephemeral/unsaved
contexts, and the DOM fixture drives the shipped Files navigation plus opened Code-task precedence.

The added deterministic coverage includes conversation and task provenance/source/format/order rejection, Research
and Review happy paths, Research missing/non-ready/read-failed companion paths, Review mismatched/digest-failed
companion paths, direct current-owner resolution, real Files navigation and all three no-request contexts. These are
test sources only: none has been executed after the review stop. No earlier pass count is attributed to these bytes.

The fresh review of that correction stopped again at P0=0/P1=2. It found that list admission still allowed impossible
multiple projections from one source record, and that `ResearchMetadata.limitation` checked only JavaScript type
rather than the complete frozen `SafeText` grammar. No execution followed the verdict.

The second stopped correction now groups descriptors by authoritative source before presentation. One conversation
turn admits at most two descriptors from only one compatible answer/Research/Review family, and every same-turn pair
must agree on owner revision, source revision, route, evidence digest and source time. Each task proposal admits at
most one proposal-derived result. Adversarial fixtures cover answer/Research, Research/Review, revision/time/evidence
disagreement and multi-kind proposal output. `ResearchMetadata.limitation` now validates Unicode scalar pairing and
rejects NUL, disallowed C0, DEL/C1 and every frozen bidi-control range while preserving ordinary Unicode and HT/LF/CR.
Research and Review both now have digest-valid but schema-invalid companion cases that prove the report is not read.
These latest source/test bytes have not run a syntax check, test, roadmap check or any actual operation.

The third fresh review stopped again at P0=0/P1=2. First, the method still falsely described the selected closure as
dependency-free even though it imports `zod`; it neither bound the exact existing dependency tree nor excluded
ambient ancestor resolution. Second, the Review same-source revision-mismatch regression expected report-specific
"not actionable" copy even though list admission must reject the entire incoherent list. No command or operation ran
after that verdict.

The third stopped correction now binds both lockfiles to SHA-256
`cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308`, verifies `zod@4.4.3`, creates only a
worktree-local `node_modules` junction to the exact existing primary dependency tree, authenticates the created
reparse type and sole resolved target before any import/test, and requires verified link-only cleanup. The Review
regression now directly proves `result-client-list-invalid`, only one `result.list` request, zero read traffic and no
preview/download control. These correction bytes remain completely unexecuted.

The fourth fresh review returned STOP at P0=0/P1=1 because the dependency-bound command kept roadmap and diff checks
inside the junction lifetime and omitted explicit syntax checks for the current changed/new JavaScript bytes. No
junction, import, test, syntax, roadmap, diff or other operation followed that verdict. The correction below limits
the junction lifetime to exactly the seven-test suite, authenticates and removes it in `finally`, aggregates suite and
cleanup failures, and permits no later command unless both are green. It then runs explicit `node --check` commands
for all five changed/new JavaScript/MJS files, followed in order by roadmap verification and the diff check. Any syntax
failure stops before roadmap, diff or commit. These method bytes remain completely unexecuted.

## Corrected finite dependency-bound method

The one corrected verification sequence, after independent review, will run only these deterministic tests that
exercise the current DOM change and its direct server contracts:

1. `artifact-result-contracts.test.mjs`
2. `artifact-result-sources.test.mjs`
3. `artifact-result-projection.test.mjs`
4. `artifact-result-surface.test.mjs`
5. `artifact-result-http.test.mjs`
6. `artifact-result-dom.test.mjs`
7. `product-foundation-ui.test.mjs`

The closure requires repository-locked `zod@4.4.3`. It may not resolve that package from
`D:\Projects\Runalab\node_modules` or any other ambient ancestor. Both the Artifact worktree and the reviewed primary
checkout have package-lock SHA-256
`cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308`; the primary installed tree contains exact
`zod@4.4.3`. Subject to fresh P0=0/P1=0 review, create only the following ignored worktree-local junction. The
precheck treats only `ItemNotFoundException` as absence, so an existing or dangling path is occupied. The postcheck
must authenticate the new item as a `Junction` reparse point with one target resolving to the exact reviewed primary
directory before any import or test:

```powershell
$artifactDependencySource = 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules'
$artifactDependencyLink = 'D:\Projects\Runalab\runaai-next-artifact-dom\node_modules'
$artifactExpectedLockHash = 'cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308'
$artifactExpectedZodVersion = '4.4.3'

$artifactDependencySourceItem = Get-Item -LiteralPath $artifactDependencySource -Force -ErrorAction Stop
if (-not $artifactDependencySourceItem.PSIsContainer) {
  throw 'reviewed primary dependency source is absent'
}
$artifactExistingLink = try {
  Get-Item -LiteralPath $artifactDependencyLink -Force -ErrorAction Stop
} catch [System.Management.Automation.ItemNotFoundException] {
  $null
}
if ($null -ne $artifactExistingLink) {
  throw 'Artifact worktree dependency target already exists'
}
$artifactWorktreeLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-artifact-dom\package-lock.json').Hash.ToLowerInvariant()
$artifactPrimaryLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json').Hash.ToLowerInvariant()
$artifactPrimaryZodVersion = (Get-Content -LiteralPath (Join-Path $artifactDependencySource 'zod\package.json') -Raw -ErrorAction Stop | ConvertFrom-Json).version
if ($artifactWorktreeLockHash -ne $artifactExpectedLockHash -or $artifactPrimaryLockHash -ne $artifactExpectedLockHash) {
  throw 'reviewed package-lock identity drifted'
}
if ($artifactPrimaryZodVersion -ne $artifactExpectedZodVersion) {
  throw 'reviewed zod identity drifted'
}
$null = New-Item -ItemType Junction -Path $artifactDependencyLink -Target $artifactDependencySource
$artifactCreatedLink = Get-Item -LiteralPath $artifactDependencyLink -Force -ErrorAction Stop
$artifactCreatedTargets = @($artifactCreatedLink.Target)
$artifactResolvedSource = (Resolve-Path -LiteralPath $artifactDependencySourceItem.FullName -ErrorAction Stop).ProviderPath
$artifactResolvedCreatedTarget = if ($artifactCreatedTargets.Count -eq 1) {
  (Resolve-Path -LiteralPath ([string]$artifactCreatedTargets[0]) -ErrorAction Stop).ProviderPath
} else {
  $null
}
if (($artifactCreatedLink.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
    -or $artifactCreatedLink.LinkType -ne 'Junction'
    -or $artifactCreatedTargets.Count -ne 1
    -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals($artifactResolvedCreatedTarget, $artifactResolvedSource)) {
  throw 'created Artifact dependency junction identity is invalid; retain it for reviewed cleanup'
}
```

The path is ignored by `.gitignore:1:node_modules/`. A successfully authenticated junction places the exact reviewed
dependency tree at the worktree-local Node resolution point; no ambient parent fallback is accepted. The junction may
remain present only for the exact seven-test suite. The following body runs immediately after the verified creation
above. Its `finally` block re-authenticates the link, deletes only that junction object, proves the path is absent with
the same dangling-link-safe lookup, and aggregates suite plus cleanup failures before any later command:

```powershell
$artifactFailures = [System.Collections.Generic.List[System.Exception]]::new()
try {
  & node --test gate7f/function-first/artifact-result-contracts.test.mjs gate7f/function-first/artifact-result-sources.test.mjs gate7f/function-first/artifact-result-projection.test.mjs gate7f/function-first/artifact-result-surface.test.mjs gate7f/function-first/artifact-result-http.test.mjs gate7f/function-first/artifact-result-dom.test.mjs gate7f/function-first/product-foundation-ui.test.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Artifact deterministic suite stopped with exit $LASTEXITCODE"
  }
} catch {
  $null = $artifactFailures.Add($_.Exception)
} finally {
  try {
    $artifactSourceItem = Get-Item -LiteralPath $artifactDependencySource -Force -ErrorAction Stop
    $artifactLinkItem = Get-Item -LiteralPath $artifactDependencyLink -Force -ErrorAction Stop
    $artifactLinkTargets = @($artifactLinkItem.Target)
    $artifactResolvedTarget = if ($artifactLinkTargets.Count -eq 1) {
      (Resolve-Path -LiteralPath ([string]$artifactLinkTargets[0]) -ErrorAction Stop).ProviderPath
    } else {
      $null
    }
    $artifactResolvedSource = (Resolve-Path -LiteralPath $artifactSourceItem.FullName -ErrorAction Stop).ProviderPath
    if (($artifactLinkItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
        -or $artifactLinkItem.LinkType -ne 'Junction'
        -or $artifactLinkTargets.Count -ne 1
        -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals($artifactResolvedTarget, $artifactResolvedSource)) {
      throw 'refusing to remove an unverified Artifact dependency path'
    }
    $artifactLinkItem.Delete()
    $artifactResidualLink = try {
      Get-Item -LiteralPath $artifactDependencyLink -Force -ErrorAction Stop
    } catch [System.Management.Automation.ItemNotFoundException] {
      $null
    }
    if ($null -ne $artifactResidualLink) {
      throw 'Artifact dependency junction cleanup did not remove the local path'
    }
  } catch {
    $null = $artifactFailures.Add($_.Exception)
  }
}
if ($artifactFailures.Count -eq 1) {
  throw $artifactFailures[0]
}
if ($artifactFailures.Count -gt 1) {
  throw [System.AggregateException]::new(
    'Artifact deterministic suite and dependency cleanup failed',
    $artifactFailures.ToArray())
}
```

Only after the seven-test suite is green and the verified cleanup above has left the worktree-local dependency path
absent may the following independent checks run in this exact order. These are the five changed/new JavaScript/MJS
files in the current worktree. Each failure is retained and stops before every later check and before commit:

```powershell
& node --check gate6b/public/artifact-results.mjs
if ($LASTEXITCODE -ne 0) { throw "Artifact syntax check stopped for artifact-results.mjs with exit $LASTEXITCODE" }
& node --check gate6b/public/product-views.mjs
if ($LASTEXITCODE -ne 0) { throw "Artifact syntax check stopped for product-views.mjs with exit $LASTEXITCODE" }
& node --check gate6b/public/status.js
if ($LASTEXITCODE -ne 0) { throw "Artifact syntax check stopped for status.js with exit $LASTEXITCODE" }
& node --check gate7f/function-first/artifact-result-dom.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Artifact syntax check stopped for artifact-result-dom.test.mjs with exit $LASTEXITCODE" }
& node --check gate7f/function-first/product-foundation-ui.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Artifact syntax check stopped for product-foundation-ui.test.mjs with exit $LASTEXITCODE" }
& npm run verify:roadmap
if ($LASTEXITCODE -ne 0) { throw "Artifact roadmap verification stopped with exit $LASTEXITCODE" }
& git -c safe.directory=D:/Projects/Runalab/runaai-next-artifact-dom diff --check
if ($LASTEXITCODE -ne 0) { throw "Artifact diff check stopped with exit $LASTEXITCODE" }
```

The method must not install dependencies, rerun the PostgreSQL/invariant files, start PostgreSQL, or claim fresh
database evidence. The immutable `M1-S2-ARTIFACT-RESULT-SOURCE-HTTP-INTEGRATION-2026-09-04.md` remains the exact
database/source/HTTP evidence.

Fresh independent review must verify all four retained STOP corrections, the dependency identity/cleanup procedure,
and that the corrected set reaches every changed interface without dropping a relevant current-DOM assertion, while
retaining the earlier database proof truthfully. Only a P0=0/P1=0 verdict may allow this exact lane to provision the
junction and resume once at the corrected command body. Any dependency, source, test, cleanup, roadmap or diff failure
stops again at its exact gate.

## Corrected resume result

Fresh review returned GO at P0=0/P1=0. The worktree and primary lockfiles, exact `zod@4.4.3`, all ten reviewed file
hashes and absent worktree-local `node_modules` precondition were reverified. The authenticated local junction was
created, checked as a sole-target `Junction`, used only for the seven selected test files and reauthenticated and
removed in `finally`. The corrected suite passed 53/53 and the local junction was absent afterward.

All five explicit current-byte `node --check` commands then passed, followed by `npm run verify:roadmap` at 15/15 and
`git diff --check`. No PostgreSQL test, browser, model, provider, Control, production or customer operation ran. The
prior Artifact source/HTTP PostgreSQL 1/1 evidence was not replayed. The remaining gate is source commit followed by
the ordinary authenticated browser acceptance defined in the DOM preflight.

## Current UI source and test byte pins

These SHA-256 values pin the current corrected UI/test bytes after all four retained review stops (P1=3, P1=2,
P1=2, P1=1). No test, syntax, roadmap, browser, database, model or network command followed them:

| File | SHA-256 |
|---|---|
| `gate6b/public/artifact-results.mjs` | `0a518d429c1ae0e33de42e88825b32fce81f9197023489a57ef0d5b5c657c1a9` |
| `gate6b/public/product-views.mjs` | `24aa34f10319baa9a487e4bd0bff8a2d6c550ad50bdd1b9192474a18b1b0e0a2` |
| `gate6b/public/status.js` | `d5ea9e383e07ddc8751aa943fc1574b59567d7ddaa21103505dd4a779185d1c9` |
| `gate6b/public/styles.css` | `c9883fdeaf4de9963499d730974bb6cf2971a0f5841d4648f8edab1763022f89` |
| `gate7f/function-first/artifact-result-dom.test.mjs` | `319d4fb98c2ac778b63d3daaa68afaabe56d92c840f1d4d7b70beb1d7db52117` |
| `gate7f/function-first/product-foundation-ui.test.mjs` | `ee322f1da03a605c71e93e40e282de8a984dd7e330c552a1d733f86a748908da` |
