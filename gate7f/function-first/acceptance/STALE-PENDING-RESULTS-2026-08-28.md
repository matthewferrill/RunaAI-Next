# Stale pending-action correction — actual results

The prospective criteria are in `STALE-PENDING-CRITERIA-2026-08-28.md`.
The original stopped Gemma campaign remains unqualified and immutable.
Its Code 07 raw attempt SHA-256 is
`30c64dc465879ce7f0b617ec9015d34360e55a638f0e1128b9a04f21733b6089`.

## Correction

`M1TaskService` commits a precise stale/revoked/expired pending-action reason
before returning rejection. Conversational resume revalidates the old pending
proposal rather than returning an impossible waiting-for-approval state. The
old digest, plans and receipts remain. Nothing creates a new approval or plan.
Unknown/dispatched intents remain under their existing reconciliation pathway.
Wrong sessions, invalid request digests, offline identity and storage/integrity
errors cannot turn a valid pending proposal into a durable denial.

The UI explains stale and revoked stops from application state. It does not
infer success or nonexecution from a model's summary.

## Verification and retained failures

- Six focused transaction tests failed before the change and passed afterward.
  Seven function-panel tests also passed (13 focused checks total).
- First actual Control PostgreSQL run at `bbf8eec`: 43/44 passed, no skips. Its
  sole failure was an old test that moved the clock backward and expected an
  already-expired proposal to become live again for a subsequent revocation
  test. The correction intentionally makes the prior expiry durable. Updated
  coverage asserts it remains denied with no receipt, then creates a separate
  still-valid proposal to test revocation. The failed result is retained:
  `63edd55b72f4dd7619f50d818b92c2f9c251d4e66ec2187b5c2a262aba2ec5a7`.
- Fresh actual Control run at `9ca3241e9c8fa34a6fb11d82a5df45606ee16ee8`:
  **44/44 passed, zero skips**. This includes real PostgreSQL and LangGraph,
  fresh orchestrator/process recovery, concurrent edits, exact approval,
  encrypted persistence, cancellation, unknown outcomes and permanent expiry.
  Executor doubles in these database tests are not new sandbox evidence.
  Raw result SHA-256:
  `aa7f61a2b7cb265f5fbe4f08c55ff2f8beff5e09faa1558e94d2eda382aa3efb`.

The successful raw result is retained under
`artifacts/runs/m1-task-native-b05020097a4945e38b64f1e4fa8d748d/pending-pg-proof.json`
on Omen and the matching owned Control stage's
`acceptance-evidence/pending-pg-proof.json`. The prior failed run is similarly
retained under stage `m1-task-native-a7eafc622b104889b4e4c2c0f19480fe`.
Both runs stopped their own PostgreSQL/Qdrant processes and removed only their
generated database/runtime/data directories; source and evidence remain.
Neither invoked a model, changed production, nor read protected data.

This is a corrected product state transition, not a model qualification result.
The new common source seal, 12 controls, matched 360 model attempts, independent
semantic review, operational deployment proof and human trial are still required.
