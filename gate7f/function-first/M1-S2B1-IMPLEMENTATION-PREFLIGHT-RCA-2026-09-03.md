# M1-S2B1 implementation preflight RCA

Date: 2026-09-03  
Scope: public-Git adapter core and PostgreSQL source/materialization-intent authority  
Disposition: deterministic/local integration only; no Control, browser, production, repository-network, or model result

## Stop chronology

The implementation was paused at each failure. No failed command was blindly replayed and no model was invoked.

1. **Disposable PostgreSQL launch did not start.** The shared helper returned
   `m1-synthetic-pg-pg_ctl-failed` before the authority store ran. Its original method discarded `pg_ctl` output and
   removed the stopped disposable directory, so the first failure had no usable cause evidence.
2. **The corrected launcher returned too early.** Direct `postgres.exe` startup avoided the first failure, but the
   helper treated an accepting TCP socket as database readiness. The first SQL operation received PostgreSQL
   `57P03` (`database system is starting up`), again before store behavior ran.
3. **The expanded test retained an old outbox expectation.** The new cross-project concurrency scenario correctly
   produced three source-create events and two committed intent events. The final assertion still expected only the
   original one source and one intent. This was a test-maintenance failure after the store checks had run, not a
   product-behavior failure.

## Root causes and corrections

| Failure | Root cause | Correction | Resume gate |
|---|---|---|---|
| `pg_ctl` launch exit 1 | PostgreSQL's Windows `pg_ctl start` attempted to create another restricted token inside the already restricted Codex process and failed with error 87. Its own stderr was discarded. | Route bounded launcher diagnostics to an owned file; launch the disposable `postgres.exe` directly with a held child handle and regular-file stdio; retain `pg_ctl stop -w` for graceful, verified shutdown. Preserve the owned directory whenever status is unknown or stop fails. | One direct-start/stop diagnostic passed before the integration resumed. |
| SQLSTATE `57P03` | A TCP listener is liveness, not query readiness. | Require `pg_isready` status 0 for the exact loopback host, selected port, synthetic user, and database within the existing 30-second bound. | One real `SELECT 1` readiness diagnostic passed before the integration resumed. |
| stale outbox assertion | The test scenario grew but its exact expected ledger did not. | Bind the expectation to the full intended event sequence: three source records, two committed intents, and no event from the rejected transaction. | Independent checker approved the test-only correction before one rerun. |

## Implementation defects caught before commit

The standing independent checker also stopped the first green draft before commit. It found participant concurrency
locked only per project, relational lifecycle fields not cross-bound to the encrypted authority payload, a deadline
derived from two clock reads, and teardown that could skip database stop if pool close failed. The corrected store:

- acquires the participant advisory lock before the project lock;
- validates source/workspace relational IDs, lifecycle, revision, timestamps, request/binding digests, and encrypted
  strict records together;
- derives the exact 120-second deadline from one captured instant; and
- guarantees database stop in test teardown.

Actual PostgreSQL race and corruption regressions cover these corrections.

## Current evidence and remaining boundary

The corrected focused set passes 16/16, including a real disposable PostgreSQL process/database integration and an
actual local Git object database/filesystem materialization. This is preflight evidence only. It does not prove the
production HTTPS broker, Control worker isolation, protected Windows publication/reconciliation, ordinary-browser
journey, or any model. Those remain gated and must stop for RCA if their actual-system execution fails.
