# Gate 3 — one reversible governed action

Gate 3 ports Runa's **propose → preview → approve → execute → record** behavior for exactly one
synthetic action: changing the verified participant's `defaultIntelligenceLevel` setting within an
owned managed-project context. The only values are `Low`, `Medium`, and `High`.

The action is deliberately narrow. It cannot write files, run commands, change Git, call a model,
open protected data, use credentials, reach an external service, or execute through a Gate 2 answer
lane. Verified model output may stage an inert proposal; retrieved content may not stage one; neither
can approve. Approval must come from a verified participant and bind the exact proposal digest.

PostgreSQL is authoritative for proposal lifecycle, one-time capability consumption, the setting
effect, receipt, and outbox row. They commit in one transaction. LangGraph's PostgreSQL checkpointer
makes response interruption resumable, while PostgreSQL idempotency and the recorded postcondition
ensure replay cannot repeat the deed. The state digest includes the database setting revision, so a
change away and back still invalidates an old preview.

Rollback is not an administrative bypass. It is a second proposal, preview, approval, deed, receipt,
and outbox row bound to the first receipt.

## Commands

- `npm.cmd run test:gate3` — 26 contract, authority, lifecycle, failure, idempotency, telemetry, and rollback cases.
- `npm.cmd run verify:gate3:integration` — disposable loopback PostgreSQL plus fresh LangGraph workers.

The integration harness uses synthetic data, drops only the `gate3` schema after verifying the
governed rollback restored `Medium`, stops PostgreSQL, and writes
`gate3/evidence/STUB-INTEGRATION-RESULTS.json`.

This gate does not activate production authentication, OpenFGA, Keycloak, an HTTP/UI surface, outbox
delivery, protected-data migration, or any additional action kind.
