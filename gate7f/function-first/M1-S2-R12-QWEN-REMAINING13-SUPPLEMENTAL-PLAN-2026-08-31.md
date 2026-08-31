# Qwen R12 remaining-13 supplemental execution plan

Date: 2026-08-31

Milestone/slice: M1 / M1-S2

Roadmap digest: `c536a42ac009b74f36bbb2f5e50d70080a617cb1475d96709f5915e0ba39d3c4`

Capability IDs: C01, C02, C03, C04, C06, C07, C12, C15, C16

## Purpose and evidence boundary

The steward directed the 13 Qwen3.6 attempts that were not executed before the
R12 75-minute batch hard stop to be run with sufficient time. The immutable
prior result is SHA-256
`8ffb2286760d0776e112fc58040799cc9d89e1de06a704ed9580254460d962a0`:
107 attempts were recorded, the active `agent-03` repetition 3 was interrupted,
and the 13 identities below were never started.

This is a supplemental completion run, not a replacement or continuation of
the immutable R12 arm. Its evidence must not be pooled with the first 107 rows
to claim a formally complete R12 arm. It may answer the narrower engineering
question of how Qwen behaves on the 13 previously unobserved attempts.

## Exact attempt roster

- `qwen36-27b-mtp--agent-04-revoked-plan--3`
- `qwen36-27b-mtp--agent-05-cancel-drain--3`
- `qwen36-27b-mtp--agent-06-crash-reconcile--3`
- `qwen36-27b-mtp--agent-07-lost-ack--3`
- `qwen36-27b-mtp--agent-08-undo-display--3`
- `qwen36-27b-mtp--review-01-cross-file-contract--3`
- `qwen36-27b-mtp--review-02-long-contradiction--3`
- `qwen36-27b-mtp--review-03-current-policy--3`
- `qwen36-27b-mtp--review-04-path-issue--3`
- `qwen36-27b-mtp--review-05-unsupported-claim--3`
- `qwen36-27b-mtp--review-06-evidence-explanation--3`
- `qwen36-27b-mtp--review-07-fake-tool-output--3`
- `qwen36-27b-mtp--review-08-insufficient-context--3`

## Execution and time policy

- Use the same Qwen3.6 artifact, role settings, case bundle, fixed assertions,
  application stack and synthetic-only data boundary as R12.
- Use a fresh Home lease and fresh Control stage. Run one large model at a time.
- Retain the 75-minute batch ceiling. At the observed 41.9 seconds per recorded
  attempt, 13 attempts project to about 9.1 minutes; the ceiling therefore
  provides more than eight times the measured requirement while retaining the
  existing cleanup and publication reserves.
- Exercise every required real-browser checkpoint. The synthetic one-time
  bootstrap and ordinary human-observation checkpoints have a bounded
  15-minute window. The Agent05 in-flight cancellation observation retains its
  separate 24-second truth window and acknowledgement-publication grace; the
  longer ordinary window does not weaken that timing assertion. Missing or
  late browser evidence remains failed/inconclusive and is not synthesized
  after the fact.
- Preserve create-only raw attempts, starts, records, runtime/lease evidence,
  hardware telemetry, cleanup evidence and the exact prior-result binding.
- Do not access protected data, change production routing, activate learning or
  change any Control production release.

## Acceptance and reporting

The run is operationally complete when all 13 identities are recorded, none are
left unexecuted, the result has no runner stop/cleanup error, Home reports zero
owned model residency and restored GPU power, and Control disposable resources
are closed. Report model outcomes separately from browser/harness failures.

The supplemental result always carries
`qualificationCompositionPermitted: false` and
`productQualificationPassed: false`. Formal R12 eligibility remains governed by
the original whole-arm criteria; this plan does not relax or rewrite them.

## Human-window correction record

Three model-free Control attempts on 2026-08-31 correctly failed closed because
the browser acknowledgement was absent or arrived after the original five-minute
deadline. The final browser showed the expected Code project and the saved task,
outcome and `project.run-tests` proposal as `unknown`, with reconciliation
required before successor work, but publication reached the completed stage too
late to be accepted. The repeated failure demonstrated that five minutes did not
cover human navigation plus communication and evidence publication latency.

The correction changes only the synthetic bootstrap lifetime and the upper bound
for ordinary human browser checkpoints from five to fifteen minutes. One-use
nonces, loopback-only service binding, exact checkpoint/scope/seal matching,
create-only acknowledgements, late-evidence rejection and disposable cleanup are
unchanged. This is a harness-operability correction; it does not change a case,
expected answer, model role, production route or grading rule.

## r33 stopped run and prospective directory-binding correction

The first 15-minute supplemental run on Home lease
`20260829-campaign-qwen36-r33` and Control stage
`35304669bab045cd97c3df555b9f5521` recorded 3/13 attempts before stopping with
`m1-campaign-attempt-undrained`. The exact result and raw-file manifest are in
`acceptance/evidence/20260831-qwen-r33-supplemental-failed/`. This arm remains
failed evidence and is not selectively resumed, pooled or regraded.

The RCA confirmed that the runner's generated `supplemental-qwen36-27b-mtp-*`
directory was outside the `campaign-*` allowlist in the owner witness and
acknowledgement wrappers. The prospective correction admits only the exact
Qwen supplemental directory shape and keeps other candidates, malformed names,
child paths and traversal forms denied. It changes no case, prompt, expected
answer, threshold, model setting, prior result or production route. A new source
commit, archive, runtime seal, 12-control run, Home lease and Control stage are
required before all 13 identities are attempted again.

## r34 stopped run and complete seal-position correction

The second arm used source `ea0b04d7`, runtime seal `2d2dff8c`, 12/12 fresh
controls, Home lease `20260829-campaign-qwen36-r34`, and Control stage
`d059a269cfc54b8bbcef0df0ddc7e8ad`. Agent04 completed with its actual-browser
revoked-state observation. Agent05 preparation also completed, but its combined
24-second witness-and-ack publication exposed a second wrapper predicate: the
directory allowlist accepted the supplemental name while the runtime-seal check
still required that seal prefix at the end of the name. No witness or
acknowledgement was published. The harness-invalid arm was stopped after
Agent06 began and is not selectively resumed, pooled, or regraded.

The exact raw-file manifest and Home abort/cleanup record are in
`acceptance/evidence/20260831-qwen-r34-supplemental-failed/`. The complete
prospective correction position-binds the runtime-seal prefix in the exact Qwen
supplemental form and retains the full-campaign suffix binding. Focused tests
exercise both predicates. A new source commit, archive, runtime seal, 12-control
run, Home lease, and Control stage remain mandatory before the next 13-attempt
run.
