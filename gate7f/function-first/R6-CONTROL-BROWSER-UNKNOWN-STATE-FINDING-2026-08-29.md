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

## Second actual-browser finding

The successor source commit `3e4a076c638e7447fddd1c1ddda3afc3bc72ea24`
was archived and sealed before inference. Its runtime seal SHA-256 was
`1ead56d11d554fbeec2db6d00fdc481228b9888d1a9a2662866c403065a5da18`.
All 12 model-free controls passed, including a genuine browser observation of the
unknown saved-task label. The retained controls file is
`r6b-controls-1788017980566.json`, 2,443,405 bytes, SHA-256
`abd14e93accb60c6c06f67665761d8b378e08b6463610acce87ae2ae492d252e`.

The first Gemma campaign then reached the actual-browser restored-workspace check.
The UI showed the saved task as completed, but selecting that visible task did not
open its receipts or produce a denial. The checkpoint timed out and failed closed;
no acknowledgement was written. Twenty-four attempts were retained and the next
attempt had only a started marker when the campaign was stopped. The paired Home
lease was explicitly completed as `abort`; its supervisor verified zero model
residency and restored both GPU power limits. The terminal abort result is 581
bytes, SHA-256
`fc64ab700ad71b68b37ba23cb40d4a9c514a992a5a32f11eed2c612a4bc83677`;
the atomic completion marker is SHA-256
`60c5b94965eac4d6cc78402176ef1188cb73b11923c02cc95ae9942f881f8ccc`.
Production was not changed.

The directly reproducible cause is a scope-transition race. The outer shell changes
the active experience or project, then awaits navigation refresh before refreshing
the function panel. During that await, the previous catalog can remain visible.
Its handlers captured the old scope ticket, so `openTask` returned before any
read-only status request and left the visible control inert. The prospective fix
obtains a fresh ticket when the user clicks. The resulting status read is bound to
the current project and experience; the server can either return the current-scope
record or deny it visibly. It cannot create a grant, resume a run, approve a
proposal or execute an effect.

An actual-DOM regression now reproduces that transition window. It changes the
outer scope while retaining the visible catalog, selects the old entry and requires
exactly one status read in the new scope, an explicit no-action error when the
server denies the old task there, and zero authority/effect operations. Because the
source changed again, the second seal and its partial campaign are evidence of the
finding only. A fresh archive, seal and complete successor run are required.

Prospective correction verification after adding the direct race regression:

- Intercepted actual-DOM browser suite: 10 passed, 0 failed.
- Function-panel unit suite: 8 passed, 0 failed.
- Gate 7F foundation suite: 28 passed, 0 failed.
- Gate 6B suite: 32 passed, 0 failed.
- Roadmap retrieval/validation: 15 passed, 0 failed; all 17 capability families
  remain visible and M1-S2 remains the current first milestone.

## Third actual-browser sequencing finding

The next exact source `35615fb97daa9dca96f37edc9974030348404659` was
sealed as
`62a5f98e04f1abb25dc46ea2c8b12f57d5fef9d1592b391c0638bed241885afb`.
Its fresh Control stage passed all 12 model-free controls; the retained evidence
file is `r6c-controls-1788020249853.json`, 2,443,526 bytes, SHA-256
`669ebdb44c84e71b1fd5c1b709c6cc48bfd52a55e9c6410d81b87634fb89b7f3`.
The actual browser saw the corrected `unknown` catalog label. It also established
that selecting the task immediately after changing to Code and choosing its
project could still leave the detail surface empty.

The click-time scope ticket was necessary but not sufficient. The outer Code
transition exposes newly fetched project buttons before its awaited function-panel
refresh. Selecting a project in that window starts a second panel refresh; the
older transition can then refresh again and erase the task opening. The corrective
boundary is therefore at navigation: project and record controls, plus message
submission, remain disabled until the experience transition and its panel refresh
are both settled. Project selection likewise awaits its panel refresh before
re-enabling navigation. This changes no server authority and starts no action.

Because this correction changes the source, the third seal and controls are retained
as superseded pre-model evidence. No Home lease was created and no model was loaded
under that seal. The next run again requires a fresh archive, seal and Control stage.

Prospective sequencing verification:

- Gate 7D navigation/session suite: 8 passed, 0 failed.
- Intercepted actual-DOM function-panel suite: 10 passed, 0 failed.
- Gate 6B suite: 32 passed, 0 failed.
- Gate 7F foundation suite: 28 passed, 0 failed.
- Roadmap retrieval/validation: 15 passed, 0 failed.
