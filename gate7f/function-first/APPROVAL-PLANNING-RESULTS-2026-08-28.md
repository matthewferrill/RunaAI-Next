# M1 approval planning: implementation and component verification

Criteria were committed first in `2a9ef58`. This is a prospective protocol correction, not a model
qualification. The original Coder R3 evidence and its unsuccessful outcomes remain unchanged.

`planner.mjs` now explains that requested permitted effects belong in a plan even when the
application must pause for approval. A preview alone does not create an apply proposal. The
application still owns exact approval, execution, scope, expiry, revocation and durable receipts.
Preview-only and no-change requests must not acquire effects. No executor, authority, schema,
model routing, budget, token limit, deadline, repair allowance or case was changed.

## Executed checks

- `node --test gate7f/function-first/planner.test.mjs gate7f/function-first/planner-progress.test.mjs
  gate7f/function-first/role-orchestrator.test.mjs`: 40/40, zero skips. Actual Mastra wire requests
  use byte-identical system guidance for all three configured models, both roles and both phases.
  Provider responses are deterministic fixtures, not real model compliance evidence.
- Actual disposable PostgreSQL: `tasks/orchestrator.test.mjs` and `tasks/postgres.test.mjs`:
  46/46, zero skips, including six new Code/Agent preview-only, read-only and exact-approval sequence
  cases. Model and executor are explicitly deterministic fixtures. No native isolation claim is made.
  Tests prove no effect before approval, wrong-digest rejection, separate test approval, durable
  orchestrator replacement, no repeat planner call, and completed preview-only replay without effects.
  Existing malicious-planner/read-only, stale, revocation, cancellation, duplicate and fault tests
  ran in that same suite.
- `npm run verify:roadmap`: 15/15; roadmap digest remains
  `613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.

The first PG invocation could not start inside the process/network sandbox and was retried using
the authorized elevated execution path. The first actual suite found three new test-fixture errors:
the legacy provider configuration deliberately has no Agent model. The fixtures were corrected to
use the existing explicit role configuration; the full 46 tests were then rerun successfully. No
application fallback was added. Both actual temporary databases were stopped and their owned data
removed; no production database or model was used.

Raw local logs and working-copy hashes are retained under
`artifacts/runs/m1-approval-pg/` and `artifacts/runs/m1-approval-pg-r2/`.
The independent reviewer inspected the criteria, protocol and tests, and requested the direct
wire equality assertion that is now included. Genuine model adherence still requires a fresh sealed
three-model campaign after the separate conditional-evidence correction and all 12 formal controls.
