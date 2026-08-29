# Receipt-scope correction results

Date: 2026-08-28. The planner receipt filter now requires both the proposal's ordinary arguments and every application-recorded `restorePaths` entry to fit the current grant. Historical records remain stored, while a replacement planner receives only records usable within its fresh authority.

An actual disposable PostgreSQL and LangGraph regression created a wider-grant edit and restore, rebound an unfinished run to a new session with a narrower grant, and had the planner guess the omitted restore receipt. The receipt was absent from planner input; fresh whole-plan preflight rejected the guess as `m1-plan-restore-reference-invalid`; no new plan, proposal, intent, receipt, or adapter mutation occurred.

The complete task regression passed 70/70 with zero failures, skips, or cancellations. PostgreSQL stopped and its owned synthetic data was removed; no production database or protected content was accessed.

Retained evidence:

- `evidence/20260828-receipt-scope-r1/tests.tap`: SHA-256 `f58675645ebcc4598a098a1d92cff53171fb99d5ead387b3d7b107f3aeda04a3`;
- `evidence/20260828-receipt-scope-r1/result.json`: SHA-256 `6976b17acd08052c82b28c0e1940bce72029f3305731142688c32a1f6eb2cd87`.

This closes the bounded independent-review finding only. It does not change baseline model grades, qualify a model, activate a route, or complete M1.
