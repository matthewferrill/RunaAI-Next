# Gate 6 selected-core cutover

Gate 6 contains the fail-closed production readiness and cutover boundary. It does not make a test
harness into production merely by changing an adapter flag.

- `GATE6-SCOPE-AND-GREEN-CRITERIA-2026-08-21.md` freezes the exact selected scope, zero-loss window,
  protected/deferred decisions, production stages, and hard blockers.
- `release.mjs` creates and verifies exact release identities and aggregate runtime status.
- `readiness.mjs` evaluates exact candidate or promotion prerequisites.
- `cutover.mjs` implements the durable, idempotent state machine and rollback contract.
- `adapters/memory.mjs` and `adapters/postgres.mjs` provide deterministic and durable stores.
- `run-readiness.mjs` validates JSON inputs and emits aggregate pass/fail output only.
- `run-integration.mjs` runs the disposable PostgreSQL restart/close/rollback rehearsal.
- `GATE6A-RESULTS-2026-08-21.md` records validation and the read-only Control readiness result.

Commands:

```powershell
npm run test:gate6
npm run verify:gate6:integration
node gate6/run-readiness.mjs --manifest <release.json> --facts <facts.json> --release-boundary <boundary.json> --profile candidate
```

The readiness runner never discovers or prints secret values. Collection of production facts,
protected migration, owner credential work, and traffic promotion remain distinct controlled acts.
