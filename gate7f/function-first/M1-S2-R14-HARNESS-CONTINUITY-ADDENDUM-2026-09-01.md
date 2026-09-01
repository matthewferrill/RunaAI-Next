# M1-S2 R14 harness continuity addendum

Date: 2026-09-01
Parent: `M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`
Status: prospective continuity correction; campaign paused after one retained r49 continuation row

This addendum changes only test-system failure handling. It does not change model prompts, model-visible cases, request controls, scoring rules, provider settings, candidate artifacts, or the R14 qualification denominator.

## Frozen invariants

- The R14 model-facing case bundle and evaluator contract remain frozen.
- A model-attributed attempt remains immutable and consumes its planned identity.
- A non-model failure never becomes a candidate failure and never consumes an attempt.
- Every non-model failure pauses the campaign before another model call.
- Every post-attempt non-model pause retains a hash-bound full ungraded observation; a summary-only pause can never be retroactively treated as qualification evidence.
- A phase-matched durable `m1-planning-deadline` is a model result. A raw disconnect without that durable proof remains a non-model pause.
- A harness-valid completed prefix is retained. That phrase does not independently assert semantic passage. Continuation begins at the exact first unconsumed identity.
- A new source/runtime seal may be combined with a prior prefix only when the existing equivalence composer observes exactly its allowlisted non-model-facing seal differences and identical model-facing views.
- The composed result discloses all execution windows and never claims one uninterrupted arm.

## R14 Qwen bound continuation

- Historical r41 rows: 70.
- Immutable harness-valid completed prefix: 68.
- Historical non-model rows excluded from qualification: attempts 69 and 70.
- Exact continuation: attempts 69 through 120, 52 identities.
- Resume identity: `qwen36-27b-mtp--agent-05-cancel-drain--2`.
- Full denominator after an equivalence-audited composition: 120 unique planned identities, no duplicates and no omissions.

The create-only recovery and continuation artifacts are retained under:

- `artifacts/m1-readiness/20260901-campaign-r14-qwen36-r41-continuation-recovery-v2`
- `artifacts/m1-readiness/20260901-campaign-r14-qwen36-r41-continuation-plan-v2`

The corrected recovery binds 70 historical records. The continuation audit retains the first 68, classifies rows 69 and 70 as the exact non-model browser failures `m1-browser-checkpoint-unobserved` and `m1-browser-checkpoint-aborted`, and creates exactly 52 remaining identities. Its result, plan, and audit hashes are:

- recovered result: `b1cacccba81a2c558a531a671b5c4ffed24af4b22cd0314f43cf9186dbf60604`
- continuation plan: `c27b5de8d5eb391c296a72b41bc7291eb82b5abdcf6bc6e4b0bfdd866e7ebcc7`
- continuation audit: `7bc0ff07d9abe0b7dac62754e22624cf479ac6bcfc9b7d7da7fe517d445de6d9`

## Post-r49 continuation cursor

- The r48 preflight made zero scored calls and stopped before attempt start because its remaining lease time was below the sealed launch window.
- The r49 window completed `qwen36-27b-mtp--agent-05-cancel-drain--2`; its create-only attempt artifact SHA-256 is `1dea7abd44aa5ee6b6efa1da2171c76ae5b0f2179aeb40d492dff88f62bae364` and it contains one provider call plus one native call.
- The following Agent-06 execution exposed a harness classification defect: a downstream abort was stored as numeric DOM code `20`, so the runner paused as `m1-campaign-unknown-failure` instead of correlating the durable `m1-planning-deadline`.
- The old pause receipt did not retain the full ungraded observation. That Agent-06 execution therefore cannot be promoted after the fact and remains unconsumed by the qualification record contract.
- Current immutable harness-valid prefix: 69 planned identities across r41 and r49.
- Current exact continuation: attempts 70 through 120, 51 identities.
- The continuation-history manifest is constrained to exactly two ordered prior windows: r41 `original` ordinals 1-68 and r49 `continuation` ordinal 69. It cannot accept a different split, reverse the windows, retain r49 Agent-06, or add a fourth execution window.
- Each prior window binds its result, source plan, and runtime seal by SHA-256. The canonical 120-row base plan is separately bound; every retained row must match its full attempt identity tuple and every prior result must publish the exact remaining `notExecuted` suffix.
- The prepared v2 plan repeats the history-manifest hash, base-plan hash, and both result/plan/seal triples. Final composition requires exactly 51 completed rows (ordinals 70-120), rechecks both prior seals directly against the fresh seal, and emits exactly three disclosed execution windows with `singleUninterruptedArmClaimed:false`.
- Preparation and composition outputs are create-only and reject direct or junction/reparse escapes from `acceptance-evidence`.
- Independent implementation review is GO with no P0/P1 blocker. The authoritative r49 source directory was located on the Control host at `C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-41458a2cce3141c1a0bfdd2e1da26738\acceptance-evidence\supplemental-qwen36-27b-mtp-dbb124843ae3e844-b1cacccba81a`; it contains the source plan/seal, the exact Agent-05 start/record/observation triple, and an Agent-06 start/pause pair but no Agent-06 record. Those raw bytes must be recovered and hash-bound before attempt 70.
- Current resume identity: `qwen36-27b-mtp--agent-06-crash-reconcile--2`.
- A final equivalence-audited composition must disclose three execution windows and may claim neither a single arm nor a retest-free Agent-06 record.

## Mandatory no-model gate

No R14 model call may restart until all of the following are true:

1. `npm run test:m1:harness` passes completely on the intended source.
2. A fresh runtime seal and Control stage bind that exact source.
3. The actual browser proves DOM-derived bounded-drain truth without a model.
4. The exact watcher is armed before preparation ACK.
5. Live witness, publication ACK, audit receipt, native release, and exact status readback complete within their separate deadlines.
6. An independent reviewer reports no critical or high-severity harness finding.
7. A synthetic regression proves numeric DOM codes cannot be silently model-attributed, source-aware downstream cancellation requires phase-matched durable deadline evidence, and every non-model post-attempt pause retains a hash-bound full observation.

Any failure returns to the failed model-free gate. It does not restart a candidate arm and it does not load a model.
