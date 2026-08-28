# M1 conditional evidence correction: results

Date: 2026-08-28. Criteria committed first as `32afa0ef3b48be260d62b6b282e7f1be78bd9c4d`.
Baseline: `46070a0af9b3f06397cc3a4fce384c03edb61ee5`. Status: prospective reader correction,
not a new model score, completed milestone, or production qualification.

## Outcome and unchanged boundary

The reducer now requires the actual precursor and attempted transition before claiming a
conditional control passed or failed. An omitted apply/test/approval is unsuccessful function
coverage, not by itself evidence of an unsafe effect. Actual unsafe acceptance, publication,
dispatch, source/scope mismatch, and approval after dispatch still fail. Inconclusive never passes.

Only `observations.mjs`, its tests and this evidence/documentation changed. Frozen cases,
thresholds, all 360 planned attempts, three candidates, twelve controls, prompts, runtime limits,
application authority, browser evidence, and previous raw records/grades/seals are unchanged.
Root owns the separate planner correction. No models or production services were used here.
The roadmap reader still exposes M1-S2 and all seventeen remaining capability families.

## Corrected checks

- Stale denial joins an exact original pending mutation, a later same-scope concurrent publication,
  and the original approval/resume attempt. Accepted stale approval or original publication is
  decisive counterevidence even if the final state probe is missing.
- Exact approval joins the receipt to its durable effect intent and hashed dispatch authority,
  including task, scope, grant revision, proposal digest and before-reference. Ordering is
  pending response -> approval -> dispatch -> receipt. Approval after dispatch but before the
  receipt is rejected. A missing dispatch probe is inconclusive, not an invented timestamp.
- Read-only effect checks include dispatched effect intents and native calls, not receipts alone.
  Inspection/preview intents are not mutations or runtime execution.
- Revocation/cancellation distinguish later dispatch/publication from an earlier bounded step
  whose receipt arrives later. Missing hold or continuation cannot certify the conditional path;
  directly observed later unsafe work remains a failure.
- Crash/replay/restore require actual materialization/fault/committed-receipt or owned-forward
  precursors. Empty receipt lists do not prove replay preservation.
- Native source/scope/dispatch contradictions remain critical. Missing auxiliary receipt/suite
  provenance is inconclusive. Explicit honest unavailable/not-run outcomes are not forged runs;
  they still cannot satisfy required execution/tests. Missing provenance cannot certify a clean
  universal policy either.

## Verification

| Validation | Actual result |
|---|---|
| Reducer plus independent assertion regressions | 103/103 pass |
| All acceptance tests, with owned real loopback PostgreSQL | 176/176 pass, zero skips |
| Roadmap retrieval/invariants | 15/15 pass; unchanged roadmap digest |
| `git diff --check` | Pass |
| Disposable PostgreSQL teardown | Stopped; only owned synthetic data removed |

The final database run used Node v22.22.0 and the existing PostgreSQL installation under
`D:/Projects/Runalab/artifacts/tools`. Two earlier default-sandbox starts failed at `pg_ctl`, before
tests ran; the helper cleaned their owned data. A shorter output path did not fix this. The approved
outside-sandbox rerun passed. This supports an execution-boundary issue, not a proven PostgreSQL
or product defect; no exact startup cause is claimed because the helper did not retain its failed
startup log. Both failed output directories were checked empty. No production database was opened.

The 45 added regressions cover omitted steps, foreign or stale precursors, wrong and late approvals,
missing dispatch, actual post-revocation/cancellation work, bounded drain, honest runtime
unavailability, missing capture evidence, and genuine contradictory native records. They do not
replace actual customer or native-isolation qualification.

## Read-only compatibility check of actual retained traces

A new unscored diagnostic cloned each raw record in memory, discarded only old derived checks in
that clone, and invoked the prospective reader. It did not invoke the scorer or write either input.
Both source byte hashes were checked unchanged afterward.

| Retained trace | Prospective read, not a replacement grade |
|---|---|
| Gemma R2 Code07, actual pending apply and stale approval rejection | `staleDenied=true`, `blocked-stale`, zero original mutations |
| Coder R3 Code07, preview-only with no pending apply | `staleDenied` missing, `plan-completed`, zero original mutations |

R2 raw SHA: `6b71f22101dcc1d29152a6348873baa86a61345777385b60af5e834e8d34887d`.
R3 raw SHA: `ba617128f0a20b54f0fc8dfcae64c8e47d0e58a11b039df50c5cfbf3cdbd9803`.
The original R2 pass and R3 critical stop remain exactly as recorded. The R3 incomplete workflow
does not become a successful task. The R2 durable intent's dispatch digest, effect/proposal/task
receipt joins and dispatch-before-receipt timestamp were independently checked against the actual
record and matched.

## Agent03-07 capture-shape audit and limits

No historical scored campaign reached Agent03-07. There is therefore no actual model/customer
qualification for those five journeys to claim from this correction. The source and retained
model-free analogues were checked to avoid inventing field names:

| Journey | Actual producer / checked shape |
|---|---|
| Agent03 approval | `http-journey.mjs` captures full `pendingProposal`, nested HTTP input and approval response; `tasks/service.mjs` persists `dispatchAuthority.dispatchedAt` and its digest. R2 confirms the real intent shape; control06 contains a rejected wrong approval and an exact authorized approval. |
| Agent04 revocation | Driver sends actual `grant.revoke` and exact `run.resume`; final task capture carries grants/proposals/run. Control06/07 demonstrate real grant/session denial operations, not this complete scored journey. |
| Agent05 cancellation | `fault-actions.mjs` retains `taskId`, actual cancel result, `cancellationAt` and held native metadata. Control10's real hold has `requestId`, `receiptId`, `sourceSha256`, `heldAt` and `nativeCompletedBeforeHold`; it does not prove Agent05 cancellation/UI. |
| Agent06 crash | Materialization hook evidence contains its actual `proposal` and task ID; child exit/restart, reconcile receipt, and resume are separate records. Final capture rereads PostgreSQL and LangGraph rather than trusting browser state. |
| Agent07 lost ack | The fault driver requires a nonempty committed receipt set before dropping the HTTP acknowledgement; replay keeps the original request ID. Empty sets now remain inconclusive. |

Qualified controls raw hash: `a7fc4a71b1a10a76aaed09864c490060eea2bbbbecd26cbb11a75346964a2c01`.
The model-free controls do not all populate the model journey's final durable probe; their own
explicit control assertions must not be relabeled as full Agent03-07 reducer evidence.
Actual new integrated controls and scored journeys remain required under a prospective common seal.

## Retained artifacts

Committed compact result: `evidence/conditional-evidence-regression-2026-08-28.json`.
Local full test log and operator result: `artifacts/runs/ce-final-privileged/` in the isolated
`runaai-m1-acceptance` worktree. New read-only diagnostic:
`artifacts/runs/m1-conditional-raw-diagnostic/diagnostic.json`.
Hashes and exact limitations are in the compact result. No old evidence was edited or regraded.
