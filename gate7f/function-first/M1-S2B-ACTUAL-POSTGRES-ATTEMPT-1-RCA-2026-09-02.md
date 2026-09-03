# M1-S2B actual PostgreSQL attempt 1 stop and RCA — 2026-09-02

Status: slice stopped before browser, filesystem, Git, model or production work. The diagnostic retry
identified an execution-context failure before application logic. One environment-corrected
affected-scope run is authorized after the correction below.

## Exact failed attempt

- Source: working tree based on criteria commit `5ce7537`; new local-context files were uncommitted.
- Command: `node gate7f/function-first/local-context-postgres-integration.mjs --pg-bin
  D:\Projects\Runalab\artifacts\tools\postgresql\bin\pgsql\bin`
- Actual result: exit 1 with `local-context-pg-command-failed` after about eight seconds.
- Published detail: the runner omitted the failing stage, child exit status, signal, stderr, stdout and
  PostgreSQL log. The underlying PostgreSQL command therefore could not be identified from retained
  evidence.
- Cleanup: no `runa-m1-local-context-pg-*` temporary directory or owned PostgreSQL process remained. The
  only observed PostgreSQL processes belonged to the pre-existing Reallusion installation. PostgreSQL
  `initdb.exe` and `pg_ctl.exe` at the pinned test path both reported version 18.6.
- Scope not exercised: Edge, HTTPS, DPAPI, local files, Git/MXC, models and production.

## First root cause

The confirmed method failure is lossy error handling in the new actual PostgreSQL runner. Its command
wrapper collapsed every `initdb`/start/stop failure to one code, and cleanup could replace the original
exception. That made the first failure unactionable and violated the campaign rule requiring an exact
stage and RCA before retry. The underlying child-command cause remains deliberately unclassified rather
than guessed; it can only be identified after the corrected runner retains its evidence.

## Correction before retry

The runner now records a fixed stage name, executable basename, exit status, signal, and bounded child
stdout/stderr. It captures the bounded PostgreSQL log before deleting the owned fixture. Cleanup failure
no longer overwrites an earlier failure. The public result remains free of credentials and unowned file
contents.

## Diagnostic retry result and underlying root cause

After the focused pure checks passed 5/5, the corrected runner was invoked once with the same command. It
stopped at `start-disposable-database`: PostgreSQL 18.6 `pg_ctl.exe` exited 1 with
`could not create restricted token: error code 87` followed by `could not start server: error code 3`.
No PostgreSQL log existed because the server process never started; cleanup again removed the owned
fixture and left no process.

This is an execution-context mismatch in the test method. On Windows, `pg_ctl` creates its own restricted
server token. The Codex restricted child-process context does not permit that token construction, so the
actual database cannot start inside it. No local-context schema, transaction, product service, browser,
filesystem, Git, model or production behavior executed. This is not a model or product result.

The correction is to run the exact owned disposable-database command in the approved unrestricted Windows
test context. The runner still binds only `127.0.0.1`, allocates a fresh port and temporary directory,
accepts no database URL, and validates that it stops and removes only its owned fixture. This changes the
host context, not source, fixtures, assertions or acceptance denominator.

## Corrected-run boundary

Run only this local-context PostgreSQL proof once in the unrestricted Windows context. If it fails, stop
again and use its retained stage for a new RCA. Do not run the repository suite, browser proof,
filesystem/Git proof or any model.

## Corrected-run result

The exact unrestricted affected-scope run passed all 9/9 checks: authorized issue/atomic redemption,
replay denial, in-flight revoke drain, idempotent completion, post-revoke denial, revoke-before-redeem,
deadline abandonment, restart retention and owned cleanup. Its result states
`productionChanged:false` and `modelCalled:false`. The slice resumed at the next unproved layer; the two
stopped restricted-context attempts remain recorded and are not counted as product or model failures.
