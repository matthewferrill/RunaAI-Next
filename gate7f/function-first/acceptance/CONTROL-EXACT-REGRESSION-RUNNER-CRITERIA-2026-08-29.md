# Exact Control regression owner-runner criteria

Status: prospective and frozen before implementation or Control execution.

Roadmap revision `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This is reusable M1-S2 test infrastructure for the bounded C06, C07, C12 and
C15 subsets. It does not complete those families, qualify a model, deploy an
application or replace any of the 17-family roadmap.

## Purpose and entry boundary

The runner executes one complete, exact-source Node regression in an already
created `m1-task-native-<32hex>` Control stage. It is a successor to the manual
R4b full-regression procedure and reuses the target boundary established by
`Prepare-ControlFunctionalStage.ps1`. This increment builds and tests the
runner locally only. It must not contact Control, stage a source archive, start
a service, load a model, read protected data or change production.

The owner entry point is a small Windows PowerShell 5.1 script. It accepts only
an exact owned stage, a stage-local prospective manifest and that manifest's
SHA-256. It requires `RUNA-CONTROL\Matthew`, verifies the script and manifest
remain under the exact stage, verifies the pinned released Node executable and
invokes one fixed repository Node module. It has no arbitrary command, test
path, environment, service, SSH, model or production-route argument.

## Prospective manifest and byte authority

The strict create-before-run manifest binds:

- one run ID and final 40-hex source commit;
- exact `source.tar` SHA-256, actual extracted-file count, package-lock SHA-256
  and case-bundle SHA-256;
- the exact immutable dependency release root, artifact digest, Node version
  and Node executable SHA-256;
- the exact fixed Qdrant 1.19.0 byte size and SHA-256;
- the fixed Control PostgreSQL tool root, version and exact SHA-256 values for
  `initdb.exe`, `pg_ctl.exe` and `postgres.exe`;
- a finite whole-run deadline; and
- explicit declarations that the manifest predates execution, all tests are
  included, zero skips are allowed, no model or protected data is used and no
  production state is changed.

Unknown or extra fields fail. The runner rehashes the manifest, source archive,
package lock, Qdrant, Node and PostgreSQL binaries. It verifies the actual
extracted source against every regular archive entry and verifies the complete
installed dependency release with its retained `artifact-files.json`, not only
the manifest's claim. The stage's `node_modules` junction must resolve exactly
to that verified release. Pin drift stops before any disposable process starts.

## Owned execution and process boundary

The runner creates only new writable resources below the exact owned stage:
one loopback PostgreSQL database, one loopback Qdrant instance with a new data
directory, one copied Node, one compact QuickJS runtime, one transient executor
root and a new evidence directory. It uses the existing reviewed target-only
access preparation, MXC `processcontainer`/AppContainer executor and 1,200 ms
JavaScript / 2,000 ms process ceilings. It requires a successful native
preflight before tests. Exactly one second attempt is permitted only when the
first system-stamped receipt is `unavailable` / `sandbox-start-failed`, exits
`1`, has empty non-partial public output and records no effects, and its internal
startup observation independently records a started process, exit `1`, zero raw
stdout/stderr bytes and zero result markers. The observation retains counts and
classification only, never text. Both receipts are retained. Access denial,
timeout, executed failure, output or any second failure stops the run.

The sole test command is the pinned released Node with:

```text
--test --test-concurrency=1 --test-reporter=tap
```

No filename, pattern, shard, retry, watch or skip argument is accepted. The
child receives a fixed allowlisted environment containing only required Windows
process variables and the newly owned PostgreSQL, Qdrant and executor paths.
`LOCALAPPDATA` is fixed to the stage-owned transient directory rather than
inherited from the owner's profile; it exists only for MXC's Windows permission
bootstrap and is removed during exact cleanup.
Provider/model endpoints, credentials and inherited product configuration are
not forwarded. Stdout and stderr have finite byte ceilings, and the process is
terminated at the prospective whole-run deadline.

## Evidence, success and cleanup

Before execution, a new `acceptance-evidence/control-regression-<runId>`
directory is created without recursion. `tests.tap`, `tests.stderr.txt`,
`result.json` and `cleanup.json` are create-only, synchronized writes. An
interrupted or existing run is retained and never resumed, replaced or merged.
The result binds all input/runtime hashes, command, counts and evidence hashes.

Success requires an ordinary zero exit, a parseable final TAP summary, at least
one test, `pass == tests`, and exactly zero failures, cancellations, skips and
todos. Missing or conflicting summaries, truncated output, timeout, terminal
resource-preflight failure or cleanup uncertainty fail the run.

Cleanup stops only the owned PostgreSQL and Qdrant processes and removes only
the known owned database/runtime/transient directories. A separate final probe
must confirm their three loopback ports are closed and all named owned writable
directories are absent. Source and evidence remain. Cleanup failure cannot be
hidden by passing tests and does not trigger a blind retry. The existing
production Qdrant registration, release, stores, listeners, models, protected
data and routing are outside the runner and unchanged.

## Deterministic acceptance

Focused tests must prove strict schema/pins, full unfiltered serial command,
zero-skip parsing, byte/output caps, timeout, create-only evidence, fail-closed
dependency/resource errors, environment allowlisting, cleanup verification,
foreign/colliding paths and PowerShell 5.1 parsing. Tests use disposable local
fixtures and injected process/resource doubles only; they are not a live
Control result. A later real execution requires a newly frozen exact manifest
and its own retained owner-context receipt.
