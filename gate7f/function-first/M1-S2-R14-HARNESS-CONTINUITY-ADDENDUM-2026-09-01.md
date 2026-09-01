# M1-S2 R14 harness continuity addendum

Date: 2026-09-01
Parent: `M1-S2-R14-REVIEW-CORRECTIVE-CRITERIA-2026-09-01.md`
Status: prospective continuity correction; campaign paused

This addendum changes only test-system failure handling. It does not change model prompts, model-visible cases, request controls, scoring rules, provider settings, candidate artifacts, or the R14 qualification denominator.

## Frozen invariants

- The R14 model-facing case bundle and evaluator contract remain frozen.
- A model-attributed attempt remains immutable and consumes its planned identity.
- A non-model failure never becomes a candidate failure and never consumes an attempt.
- Every non-model failure pauses the campaign before another model call.
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

## Mandatory no-model gate

No R14 model call may restart until all of the following are true:

1. `npm run test:m1:harness` passes completely on the intended source.
2. A fresh runtime seal and Control stage bind that exact source.
3. The actual browser proves DOM-derived bounded-drain truth without a model.
4. The exact watcher is armed before preparation ACK.
5. Live witness, publication ACK, audit receipt, native release, and exact status readback complete within their separate deadlines.
6. An independent reviewer reports no critical or high-severity harness finding.

Any failure returns to the failed model-free gate. It does not restart a candidate arm and it does not load a model.
