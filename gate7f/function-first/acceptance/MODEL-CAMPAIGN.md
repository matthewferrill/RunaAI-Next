# Actual model campaign runner

`run-model-campaign.mjs` executes the frozen 40 application journeys three times
for **one** candidate: 120 attempted slots per batch, 360 across the unchanged
three-candidate roster. It does not load/unload models, change power limits,
alter production, read private stores or perform model-selection deployment.

The hardware operator owns the Home lease. The parent operator owns the actual
browser and the bounded read-only Home-to-Control status mirror. PostgreSQL,
Qdrant, application HTTP and native MXC resources are generated only inside the
existing exact `m1-task-native-<32 hex>` Control staging boundary and cleaned by
the existing owned-resource lifecycle. Synthetic browser sessions are explicitly
not a production Keycloak/Windows Hello acceptance claim.

## Required prospective inputs

Commit/freeze the runner and all product/harness dependencies before creating the
common runtime seal. Stage that exact Git archive and preserve `SOURCE-IDENTITY.json`.
The runner validates the archive hash **and every extracted tracked file**, Node,
package-lock and Qdrant hashes, fixed suites, role budgets and three-model roster.
It must execute from inside that exact staged source, not a different checkout.

Run all 12 mandatory model-free controls against the same prospective runtime
seal first. The runner regrades their raw observations; merely completed drivers,
authored pass labels, earlier integration controls or a different seal cannot qualify.
All control observations must retain the exact source commit and runtime seal.

Inputs are bounded regular files inside the owned stage, with no reparse escape.
The command requires these named arguments (supply actual verified paths/hashes;
none are positional placeholders or PowerShell angle-bracket tokens):

- `--mode scored --owned-root ... --source-commit ...`
- `--runtime-seal ... --runtime-seal-sha256 ...`
- `--controls ... --controls-sha256 ...`
- `--candidate-id gemma4-26b-a4b`, `qwen3-coder-30b-a3b` or `qwen36-27b-mtp`
- `--home-ready ... --home-ready-sha256 ...`
- `--hardware-plan ... --hardware-plan-sha256 ...`
- `--home-status acceptance-evidence/home-live.json --browser-checkpoints true`

The hardware-plan hash equals `seal.residency.telemetryPolicySha256`. READY's
`sealSha256` identifies the **hardware lease package**, not the functional runtime
seal; both are retained separately. READY binds the candidate/artifact, request
reasoning controls, Nomic artifact and actual loaded instance IDs. Before each
attempt and every five seconds, the live mirror must show the same unexpired
lease, live worker/supervisor, no completion, two exact resident instances and
unchanged load configuration. Both mirror and actual ready-phase telemetry must
be at most 30 seconds old; the process never refreshes timestamps itself.
The two GPU identities, 160 W caps, temperature below 85 C, 1 GiB free per GPU,
8 GiB free host memory and telemetry gaps at most 30 seconds are fail-closed.

## Actual journeys and honest results

Every attempt gets a new synthetic principal/project and the normal application
HTTP path. Real fault extensions exercise truncation, stale Qdrant references,
cancellation after native dispatch, child-process crash/reconciliation, and lost
HTTP acknowledgement. Native caps and product approval profiles are unchanged.
The current ledger is kept until pending work/capture has drained; snapshots,
canonical PostgreSQL state, LangGraph checkpoints and native receipts are retained.

Browser checkpoints occur only at the frozen pending, cancel-drain, unknown,
reopen, restored or final-result states. The nonce-bound browser bridge requires
actual independent DOM evidence. It never converts an HTTP result into UI proof.
The cancel-drain journey has an additional **ungraded** `before-native-dispatch`
rendezvous: the real browser consumes its same-session nonce and opens the exact
project/task before any model dispatch/native hold. This request has
`preparationOnly:true`, `checks:[]`, and `scope`. Its acknowledgement must contain
`preparedScope` equal to that scope and one `browser-preparation` record from the
actual browser with `data.scope`, `url`, `observedAt`, `projectName` and
`taskObjective`. The host must also have observed the same-session nonce consumption.
No frozen check or graded browser flag is credited by preparation.

The later `in-flight` request has `bootstrap:null`, `reusePreparedBrowser:true` and
the preparation checkpoint ID. Refresh/observe that already-open task directly;
do not start another login/navigation sequence. This acknowledgement remains
graded and has at most 20 seconds inside the 25-second post-receipt native-delivery
hold. It binds the authoritative cancelled task's `updatedAt`, exact prepared
principal/project/task/experience/session scope and a post-cancellation actual DOM
observation of the bounded-drain notice. A generic false value, pre-cancel view,
stale or different-session/task preparation fails closed. The native receipt is
always released when that bounded checkpoint ends. Other browser
cases observe stable pending/revoked/unknown/restored states with the ordinary
five-minute bridge bound and do not need a pre-dispatch rendezvous.

For the in-flight checkpoint, click **Refresh task status** in the already-open
browser before acknowledging. The DOM must show `Task: cancelled`, the exact
bounded-drain notice, `claimedImmediateKill:false`, and all four true drain facts:
no new steps, an already-dispatched step may finish, reconciliation may still be
pending, and its result will be retained. Only the tracked
`operator-browser-ack-helper.mjs`, invoked through the tracked owner wrapper, may
serialize this acknowledgement. Operator-supplied details cannot replace scope,
checkpoint, cancellation, check or result bindings. A hand-authored or generic
acknowledgement is invalid even when its Boolean happens to match the expected value.

`--mode inventory` performs no inference and reports driver coverage only.
Scored output includes deterministic grades plus unresolved checks. Independent
semantic review (including critical model-behavior inspection) and the customer
trial remain required; the runner always reports `productQualificationPassed:false`.
It does not label a model qualified merely because all HTTP drivers finished.

## Evidence, stop and recovery

The batch directory is `acceptance-evidence/campaign-<candidate>-<seal-prefix>`.
It is create-only. `plan.json` prospectively lists all 120 slots; input files are
retained by exact bytes. Each slot has a synced `.started.json`, an immutable raw
observation/grade file, and a small hash-bound `.record.json`. `result.json` lists
every retained attempt and every slot not executed. No subset, automatic resume,
completed-attempt overwrite or denominator reduction is supported.

A timeout, invalid live lease, containment failure or operator interruption stops
new dispatches and closes only owned test resources. The batch ends within its
sealed maximum (never above 60 minutes) or the earlier Home expiry. All failures,
interrupted markers and exports remain. Ordinary model-quality failures stay in
the denominator and do not disappear behind a rerun. A changed implementation or
new campaign requires a newly reviewed prospective seal; earlier evidence remains.
The hardware operator separately records completion/abort and verifies unload,
restored power and cleanup. A hardware completion signal is never a pass claim.

Local verification: `node --test gate7f/function-first/acceptance/run-model-campaign.test.mjs`.
These are runner-contract unit tests with synthetic observations, not live model,
Control database/native, browser, or functional qualification evidence.

## R6 lifecycle v2

V1/R5 plans and results above retain their original behavior. A v2 READY receipt
creates a side-by-side v2 batch plan. Launch requires at least 63 of the exact
70 READY minutes remaining. The runner refuses a new attempt when four minutes
remain, interrupts bounded in-flight work at the three-minute boundary, retains
all started evidence and unexecuted denominator slots, and preserves one minute
for result settlement plus two minutes for Home completion publication. The
maximum application batch remains 60 minutes and role/request budgets are
unchanged. R6 requires a fresh prospective runtime seal that binds the lease,
Agent05 browser, and determinate-function criteria; an R4b/R5 seal or v1 hardware
plan cannot be relabeled.
