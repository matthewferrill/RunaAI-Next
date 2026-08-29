# Receipt-scope correction results

Date: 2026-08-28. The planner receipt filter now requires both the proposal's ordinary arguments and every application-recorded `restorePaths` entry to fit the current grant. Historical records remain stored, while a replacement planner receives only records usable within its fresh authority.

The first retained R1 run below executed the correct behavior but its source hashes describe the shared Windows checkout's CRLF materialization, not the Git objects. It remains diagnostic history and is not the closure proof. R2 reran after the direct no-intent assertion from an archive created with `core.autocrlf=false`; every source pin then matched both the exact Git object and extracted file. R2 is the acceptance result.

An actual disposable PostgreSQL and LangGraph regression created a wider-grant edit and restore, rebound an unfinished run to a new session with a narrower grant, and had the planner guess the omitted restore receipt. The receipt was absent from planner input; fresh whole-plan preflight rejected the guess as `m1-plan-restore-reference-invalid`; no new plan, proposal, intent, receipt, or adapter mutation occurred.

The complete task regression passed 70/70 with zero failures, skips, or cancellations. PostgreSQL stopped and its owned synthetic data was removed; no production database or protected content was accessed.

Retained evidence:

- `evidence/20260828-receipt-scope-r1/tests.tap`: SHA-256 `da0f7d9902ed4df90182e015cf0d88101872d18737b6bc9e4aa08b1b1339be31`;
- `evidence/20260828-receipt-scope-r1/result.json`: SHA-256 `021484f92801ebe304d185975ce39f140ec47fef189eee685dbcae850d1600a7`.

Exact closure evidence is recorded separately in `RECEIPT-SCOPE-CORRECTION-EXACT-RESULTS-2026-08-28.md`. This closes the bounded independent-review finding only. It does not change baseline model grades, qualify a model, activate a route, or complete M1.
