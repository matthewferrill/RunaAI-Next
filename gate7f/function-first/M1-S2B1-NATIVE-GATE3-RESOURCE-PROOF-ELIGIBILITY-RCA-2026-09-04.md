# M1-S2B1 Native Gate 3 resource-proof eligibility RCA

Date: 2026-09-04
Disposition: `STOP` before any resource-proof retry
Observed source: `5f09551fb0d58a38fbd9a373da4aab98cb64c8e3`
Model, browser, Native host, production route or protected data used: no

## Exact result

The independently reviewed `parent-03` method corrected the two earlier shell-launch failures and reached the real
Node integration test. The test started one disposable PostgreSQL cluster, staged the real release sandbox runtime and
called `createProductionComposition`. Production correctly evaluated its sandbox prerequisite before reading secrets
or constructing its PostgreSQL pool. That prerequisite was not ready, so production failed closed with
`sandbox-preflight-failed`. The test had expected the later deliberately underprivileged PostgreSQL failure `42501`
and stopped 0/1 at that comparison.

The test's controlled cleanup stopped disposable PostgreSQL PID `16932`, removed its owned data and reported
`productionChanged:false`. The worktree dependency junction was removed and the source worktree remained clean. The
generated fixture was deliberately retained under the test's previous failure policy. Its read-only manifest is 154
files, 95,077,638 bytes and SHA-256
`09c33ad6ea141feee5e6d2ea4293022fab5169f7f26a30a3de524808f4f8c9a7`.
The exact canonical root is
`D:\Projects\Runalab\runaai-next-native-control-host\artifacts\runs\native-gate3-production-resource-ownership\fixture-gL8ivm`;
it was re-observed as a non-reparse directory with device `2961632313`, inode `562949954516422` and birth time
`1788538143233.5686` ms before cleanup planning.

This is not a model failure, PostgreSQL-engine failure or evidence that the pool-ownership correction failed. The
target pool had not yet been constructed. The exact lower-level MXC startup reason is `unknown`: production discarded
the already bounded preflight receipt and startup observation when it replaced them with the generic error. Guessing
from an older host incident would be false RCA.

## Root causes across the full issue shape

### 1. The method targeted a later acquisition stage without qualifying every earlier stage

`createProductionComposition` has an ordered acquisition graph: release verification, optional Native configuration,
sandbox transient/runtime preflight, secret reads, cipher construction, PostgreSQL pool creation, base-store
initialization and M1 composition. The fixture intended to inject faults at the PostgreSQL/base-store and M1/Qdrant
stages, but it started disposable PostgreSQL before proving that the earlier real sandbox stage was eligible in the
same host identity, runtime, paths and environment. A later-stage proof cannot be admitted merely because its target
fixture is ready.

The systemic rule is therefore graph-based eligibility, not another special case for MXC: before a method allocates a
disposable resource for stage N, every earlier real prerequisite in the same production path must have a current green
preflight under the same envelope. If a prerequisite cannot be isolated safely, the proof stays paused.

### 2. The frozen method and its documentation disagreed about the execution host

The production-resource RCA required disposable **Control** PostgreSQL, but the frozen test pinned Omen's
`C:\Program Files\nodejs\node.exe`, an Omen dependency tree and the local Runalab tool root, and the bounded wrapper
ran in the Omen checkout. Actual Control evidence had already shown that MXC startup depends on the exact prepared
host envelope, including stage-owned `LOCALAPPDATA`; a first-attempt Control preflight later passed under that corrected
envelope. An Omen-local run cannot stand in for the documented Control proof.

This is a topology-contract defect in the method, not a request to prepare or loosen Omen's system-drive ACL. The
resource proof must use the actual Control worker/runtime topology and its authenticated, stage-owned paths. Host,
identity, release runtime, transient root, `LOCALAPPDATA`, dependency and tool identities are one proof input and may
not be assembled from different machines.

### 3. Production collapsed a safe structured prerequisite result into a generic error

`MxcJavascriptExecutor.preflight()` already returns a parsed, bounded receipt and an optional bounded startup
observation containing classification and byte counts rather than raw output. `createProductionComposition` retained
only `ready` and threw a generic `sandbox-preflight-failed`. The outer method could identify the stage but could not
distinguish isolation support, path denial, module absence, startup failure, timeout, output bound or cleanup failure.

The correction belongs at the shared production startup boundary. A failed production prerequisite must retain a
small versioned diagnostic containing stage, status, bounded error code, exit code, isolation tier, the bounded startup
observation and `privateValuesIncluded:false`. It must not expose source, paths, environment values, stdout, stderr,
credentials or secret-reference contents. Operators and actual-system methods then validate and retain that shape.

### 4. Failure retention had no evidence-compaction and terminal-cleanup phase

Preserving the first failed fixture prevented evidence loss, but the policy kept a 95 MB synthetic tree indefinitely
and included generated secret files even after the relevant process and logs were closed. Retain-everything and
delete-on-success-only is not a complete evidence lifecycle.

Actual-system methods must separate evidence from scratch. On any terminal result they first seal bounded logs,
receipts, root identity and a non-content manifest. They then remove only the exact authenticated generated scratch
root. If manifesting or cleanup fails, the root remains and the failure is explicit. Immutable failure evidence is the
sealed compact record, not a broad live fixture. This rule applies to browser, database, model and native-worker
attempts that currently mix evidence and generated scratch.

### 5. The parent lost the child exit code

The actual TAP output clearly recorded a failed Node test, but the inner PowerShell wrapper rendered
`node-test-failed:` with a blank exit code after `Start-Process` and `WaitForExit`. The exact mechanism remains under
the repository-wide shell/process lifecycle audit, which covers executable identity, child-only environment,
asynchronous output draining, terminal wait and exit-code admission as one boundary. The proof wrapper must adopt that
reviewed boundary and explicitly reject a missing/non-integer exit code; a local `$null` check alone is not presented
as the shared fix.

## Analogous active paths and containment

- `gate6b/composition.mjs` itself has the correct acquisition order: sandbox preflight precedes secret reads and pool
  construction. Its missing bounded diagnostic is the product defect.
- `gate7f/function-first/acceptance/owned-control-resources.mjs` is the accepted **ordering-only** pattern: validate the
  sealed runtime and host access, run the real MXC preflight, and only then allocate ports/start PostgreSQL and Qdrant.
  It is not yet a complete lifecycle pattern. Its `close()` aborts later cleanup if pool end, Qdrant stop, PostgreSQL
  stop or an earlier directory removal throws, and its caller records only one cleanup error. That active path joins
  the shared aggregate-all-cleanup correction before it can be reused. It also places raw child stdout/stderr in an
  error diagnostic and raw Qdrant logs in its retained report; active consumers can persist both. The shared evidence
  correction must replace these with executable role, bounded code/status, exact exit or explicit unknown, signal,
  byte counts/digests and terminal/cleanup facts, with no raw or absolute/path-bearing diagnostic.
- Active consumers can repeat the same skip at the next layer. `acceptance/control-functional.mjs` and
  `acceptance/health-app-smoke.mjs` put testbed close and owned-resource close in one `try`, so a testbed failure skips
  resource shutdown. They join the shared correction before another execution. The same pattern exists in retained
  R8/R12 browser runners; those historical/tabled methods are quarantined from reuse rather than rerun for this fix.
- `gate7f/function-first/M1-S2-ACTUAL-BROWSER-HARNESS-DESIGN-2026-09-04.md` currently describes starting disposable
  PostgreSQL during seeding before the candidate production composition is started. Its executable design is blocked
  until it adopts the same-envelope prerequisite gate, scratch/evidence lifecycle and the shared child process
  result boundary for Edge, candidate, Caddy and seed helpers; no browser attempt is eligible.
- The current production-resource fixture is the only active non-evidence test found with cleanup conditional on a
  `proofPassed` flag. Other actual-system methods that intentionally retain failure roots still require review against
  the evidence/scratch separation rule before their next execution; historical evidence remains immutable.
- Local and remote PowerShell/Node launchers belong to the parallel executable-boundary inventory. This document does
  not claim that family corrected by changing only the failed wrapper.
- The already-green Gate 2 literal method retained in
  `M1-S2B1-NATIVE-POSTGRES-GATE2-PREFLIGHT-2026-09-04.md` has the same
  `Start-Process`/`WaitForExit`/exit-code/string-only failure shape. Gate 2 is not replayed; that method is quarantined
  and must adopt the shared process boundary before any future reuse.

The independent active-source issue-shape scan completed with P0=0 and the P1 findings recorded above: non-aggregating
owned-resource cleanup, caller cleanup short-circuiting, raw/path-bearing diagnostic retention, and incomplete browser
child-failure records. Implementation remains stopped until those shared corrections receive exact-byte review. Any
later-discovered active path with the same cause joins the shared correction and cannot be deferred merely because it
was not today's failing path.

## Systemic correction plan and resume criteria

1. Add the bounded production-startup failure diagnostic at the shared composition boundary and independently review
   its privacy and error-contract shape.
2. Replace the Omen-bound proof with an actual-Control method that authenticates one coherent host envelope and uses
   the sealed release Node/runtime, stage-owned transient root and stage-owned `LOCALAPPDATA`.
3. Before starting disposable PostgreSQL, execute the real sandbox preflight with the exact executor paths and same
   process environment that the production call will use. Retain its bounded green receipt. Production still performs
   its own fail-closed preflight; the method does not inject, mock, cache or bypass it.
4. Separate compact immutable evidence from generated scratch. Seal logs, receipts and the identity-bound manifest on
   success or failure, then attempt every exact owned-resource shutdown and scratch removal in deterministic order,
   aggregating all failures without skipping later cleanup. Preserve a root only when evidence sealing or its own
   authenticated cleanup fails. Apply the same aggregate-all correction to `acceptance/owned-control-resources.mjs`
   and every active caller, including `control-functional.mjs` and `health-app-smoke.mjs`, before reuse. Quarantine
   tabled historical runners with the same shape; do not replay them to validate this correction.
5. Replace raw child output/log retention in that helper and its active consumers with the bounded role/code/status,
   exit-or-unknown, signal, byte/digest, terminal and cleanup record. Existing tabled evidence stays immutable.
6. Reconcile the Gate 3 wrappers with the independently reviewed repository-wide process-launch boundary so exit code,
   stdout/stderr drain and process-tree termination are all determinate.
7. Revise the actual-browser design and every additional analogous active path found by independent review before any
   such method runs.
8. Commit exact bytes cleanly and obtain independent `GO P0=0/P1=0` for product, method, topology, privacy, cleanup and
   evidence behavior. Then run one preflight-only Control eligibility stage. Only a green result may start the one
   affected resource-ownership proof. A new failure stops again at its exact stage; Gate 1, Gate 2, browsers and models
   are not replayed.

Human testing is not required for this correction. No further Omen resource-proof run is authorized.
