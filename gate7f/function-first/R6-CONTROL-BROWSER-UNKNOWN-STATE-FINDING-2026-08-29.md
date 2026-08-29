# R6 Control browser unknown-state finding

Date: 2026-08-29

Attempt source commit: `317155fd5523eafd76d324d5c4d308d03423c91f`

Attempt runtime seal SHA-256: `b2b312449ad710253477e19246a255ca5cd4946f96c069e00ab35a9f17290b22`

## Result retained

The first fresh R6 model-free Control run completed 11 of 12 controls and failed
closed on `control-10-unknown-execution`. No model was invoked, no protected data
was read and production was not changed. The retained synthetic evidence file is
`controls-1788016691806.json`, 2,407,137 bytes, SHA-256
`2f66d5542ebc5e6ab64b8f427804dd6937add79950611ab8da1a74ea41038318`.

The application evidence was internally consistent: the proposal and effect intent
were both `unknown`, no receipt existed and `pendingReconciliation` contained the
proposal. The actual browser could see only the saved task label `active`; it could
not establish `ui.unknownVisible=true` before the bounded checkpoint expired.
The harness therefore recorded `m1-browser-checkpoint-unobserved`, made both expected
checks inconclusive and denied product qualification. No browser acknowledgement was
fabricated or backfilled.

## Root cause and prospective correction

The task catalog rendered only the durable task row's lifecycle status. That row can
correctly remain `active` while a subordinate proposal and effect intent are unknown.
The detail renderer also preferred run/task status before explicitly presenting the
unsettled-effect state. The durable state was safe, but the ordinary-user surface did
not make its most important recovery condition immediately visible.

The prospective correction makes an unresolved intent, or a proposal in `dispatching`
or `unknown`, override the presentation status as `unknown`. It supplies an explicit
notice that reconciliation is required and that refresh/continuation must not repeat
the action. Saved standalone tasks perform a read-only `task.status` lookup while the
catalog is built, so the unknown condition is visible in the list before the user
opens the task. Failure of that optional detail read keeps the existing non-success
task label and creates no authority or effect.

The isolated browser fixture was also made session-accurate: it offers an approvable
proposal ID only after the synthetic successor grant/run resume. This preserves the
existing rule that reopening a task is read-only and cannot inherit approval.

## Verification and consequence

- Function-panel unit and intercepted actual-DOM browser suite: 22 passed, 0 failed.
- Gate 7F foundation suite: 28 passed, 0 failed.
- Gate 6B suite: 32 passed, 0 failed.
- Roadmap retrieval/validation: 15 passed, 0 failed; all 17 remaining capabilities
  remain visible and M1-S2 is still only the current slice.

The failed R6 seal is not reusable because the source changed. Before any model
campaign, create a new exact source archive and runtime seal, prepare a fresh
disposable Control stage, rerun all 12 model-free controls and obtain a genuine
browser observation of the corrected unknown-state surface. Production remains
untouched until the complete successor is independently qualified.
