# M1-S2B1 native Control composition preflight and loader RCA — 2026-09-04

Scope: deterministic source-port implementation only on isolated branch `codex/m1-native-control-host` from
`b9c2eb4d1f83`. No native process, Control operation, PostgreSQL operation, network, TLS, browser, model or production
operation is authorized or claimed by this record.

## Retained first-run stop

Both new JavaScript files passed `node --check`. The first focused deterministic command then stopped before any test
body: Node reported `ERR_MODULE_NOT_FOUND` for package `pg`, imported transitively because the composition imported
one terminal-receipt schema from `server-workspace/postgres.mjs`. Denominator: 0 tests executed, 0 passed, 1 loader
failure. No retry followed that failure.

Classification: implementation dependency-boundary failure, not PostgreSQL, native-host, browser, network or test-
fixture execution. A dependency-neutral Control source port must not load the PostgreSQL driver merely to construct a
receipt that the injected authoritative database transaction validates.

## Bounded correction and retry gate

The eager PostgreSQL import is removed. The composition constructs and freezes the complete terminal-success receipt,
passes that exact object unchanged to the injected `recordReady` transaction, and the deterministic fake database
asserts its complete key set and authority/workspace/source/revision/digest/process/publication/cleanup bindings. A
source scan also forbids PostgreSQL-driver, process, filesystem-mutation, network, TLS, browser and model imports.

One focused retry is permitted only after owned-file status, syntax checks, diff validation, the forbidden-import
scan and an import-only loader check all pass. Any failure stops without a second retry. Passing remains deterministic
preflight only; fresh independent exact-byte review and actual Windows Control acceptance remain required.

## Authorized retry result

The owned-file status contained only this record and the two new composition files. Both syntax checks, untracked-file
whitespace validation, the forbidden-import scan and the import-only loader check passed. The one authorized command,
`node --test --test-concurrency=1 gate7f/function-first/server-workspace/control-worker-composition.test.mjs`, then
passed 10/10 tests with 0 failures, 0 cancellations and 0 skips. It was not run a second time.

This result covers deterministic topology, ordering and fail-closed source-port behavior only. No native process,
Control, PostgreSQL, network, TLS, browser, model or production operation ran. The bytes remain uncommitted and require
fresh independent review before any actual native execution or acceptance claim.

## Retained fresh-review stop: P0=0/P1=4

Fresh independent review stopped the first corrected source bytes at P0=0/P1=4. The deterministic green result did
not close these defects:

1. The injected database surface invented `beginPublicGitOperation`, `recordStagingAuthority` and
   `recordRecoveredFailure` methods and invented database phase projections instead of matching the production
   `PostgresServerWorkspaceStore` contract.
2. The composition admitted only the ordinary proposal/finalize exchange. It did not handle an authenticated
   response sequence-1 terminal with response EOF before request EOF, or expose the explicit request-sequence-1
   pre-operation cancellation path.
3. A recovery could claim settlement without proving that the authority wait registration was closed.
4. Raw handles returned by the pre-resume observation were schema-checked without an ownership-first exhaustive scan,
   so an unexpected or malformed handle could reach teardown without first entering watchdog ownership.

This was an implementation-contract stop, not a native host, PostgreSQL, network, browser or model failure. No actual
operation was attempted after review.

## Bounded P1=4 correction and next retry gate

The source port now calls the exact production workspace-store methods and consumes their exact identity/revision/
lifecycle projections without importing `postgres.mjs` or `pg`. The database-returned task ID becomes the Control
operation ID through an explicit watchdog attempt-to-authority binding immediately after the intent transaction.
Publication snapshots are locally strict projections of that accepted database phase plus the already authenticated
native publication authority; they are not invented database mutations.

The Control exchange now admits and validates the signed sequence-1 early terminal, closes response EOF before the
remaining request EOF, and has an explicit signed sequence-1 cancel-before-operation path with its required request
EOF, terminal and response EOF. Determinate failure/cancellation is recorded only after exact settled recovery through
the production `recordFailed` or `recordCancelled` transition. Settled recovery requires both
`authorityTimerClosed:true` and `authorityWaitClosed:true`. Every accessible handle-shaped value returned by the
pre-resume observation is sent to watchdog ownership before schema/identity/topology rejection and teardown.

Adversarial deterministic tests cover the production method names, transition contracts, exact call shapes and
projections without loading the PostgreSQL driver, authoritative ID binding, rejection of a cross-bound phase result,
both sequence-1 terminal paths and EOF chronology, missing authority-wait closure, and unexpected or malformed
pre-resume raw handles.
Before the single focused deterministic run, both owned JavaScript files require one syntax pass, the source requires
one import-only loader check, and the three owned files require scoped diff/whitespace/import-boundary inspection. Any
failure stops without retry. A passing run remains deterministic preflight only and still requires a different fresh
review before any native or PostgreSQL operation.

## Authorized P1=4 correction result

The gate found exactly the three owned untracked files. Both JavaScript syntax checks passed, the scoped tracked-diff
and three-file whitespace checks passed, the source-port scan found no PostgreSQL-driver, process, filesystem-mutation,
network, TLS, browser or model import, and the import-only loader check passed. The one authorized focused command,
`node --test --test-concurrency=1 gate7f/function-first/server-workspace/control-worker-composition.test.mjs`, passed
16/16 tests with 0 failures, 0 cancellations and 0 skips. It was not run a second time.

No native process, Control, PostgreSQL, network, TLS, browser, model or production operation ran. This is deterministic
source-port evidence only. The three files remain uncommitted and require a different fresh independent review before
any actual native execution is authorized.
