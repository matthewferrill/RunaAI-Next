# Control M1 derived-index service — prospective lifecycle criteria

M1-S2 support work under the existing non-destructive implementation authorization. This package
is not activated by preparing or testing its sources. Production application selection remains root's
separate qualified successor deployment. PostgreSQL remains authoritative; this index is rebuildable.

## Fixed boundary and acceptance before implementation

- Reuse Qdrant 1.19.0, exactly 84,184,576 bytes, SHA256
  `369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4`, already present in RunaLab.
- The only installation root is `C:\AI\RunaAI-Next-Candidate\m1-qdrant`. Immutable code/config and
  separately writable state are new children. No existing root, unrelated service or ACL is altered.
- One task, `\RunaAI-Next\M1-Qdrant`, uses the built-in LocalService SID with Limited run level;
  it has no owner credential or network identity. LocalService is shared with other Windows services,
  so this is least-privilege task separation, not a unique per-service account/security sandbox.
- Explicit protected ACLs on only the three newly created root/code/state directories: Administrators
  and SYSTEM retain control; within this new subtree LocalService reads code and modifies only state. Ancestors are inspected,
  never repaired recursively. Links, unexpected files, pins or task definitions fail closed.
- Only loopback HTTP 9774 and gRPC 9775; both must be free before new installation/start. Telemetry,
  cluster mode, CORS and remote snapshot-URL recovery are disabled. Child environment is constructed,
  never inherited wholesale. No model download, external connection configuration, or production route.
- Installation registers the new task **disabled**, without starting it. A separate activation command
  enables/start-verifies it. At-startup operation and five one-minute failure retries apply only after
  activation. Existing matching installation/task is a read-only idempotent result, not overwritten.
- Runtime startup validates package/config/binary identity, local SID, state containment and both
  loopback listeners. The runner records exact child PID/start time/executable. Unknown PID ownership
  is never inferred from a process name or port alone.
- Rollback disables the exact matching task first, requests bounded stop, then stops only a verified
  owned child/runner if needed and unregisters only that task. All index bytes and code remain for
  recovery. It never deletes a directory, rolls back PostgreSQL or touches legacy RunaAI.
- Tests must cover configuration/manifest drift, incorrect root/ports/task/SID/child identity,
  occupied ports, reparse/hardlink rejection, and preservation on rollback. Static/parser/unit tests
  are not live service proof. Actual Control activation/restart/recovery checks remain a separate
  root-coordinated step, not claimed by source tests.

The configuration follows the pinned [Qdrant 1.19.0 configuration contract](https://github.com/qdrant/qdrant/blob/v1.19.0/config/config.yaml).
Task identity follows Microsoft's [LocalService scheduled-task principal](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).
No operating-system egress sandbox is claimed: disabling known outbound features is configuration,
not a substitute for a separately tested firewall policy. Loopback is not authorization; application
actor/project filtering and reference-only derived payload rules remain mandatory.

## Operator entry points

`build-package.mjs ABSOLUTE-NEW-PACKAGE-DIRECTORY` reuses and hashes the existing RunaLab executable,
copies only the five lifecycle scripts/binary/canonical YAML, and emits the exact `package.json` SHA256.
It creates no service and downloads nothing. Binary bytes are not committed to Git.

On Control, `Install-ControlM1Qdrant.ps1 -PackageDirectory $packageDirectory
-ExpectedPackageSha256 $expectedPackageSha256` verifies that package and creates/registers only the
disabled dedicated installation. `Start-ControlM1Qdrant.ps1 -ExpectedPackageSha256 $expectedPackageSha256`
is a distinct activation operation; the deployment orchestrator must call it only at the coordinated
stage. `Rollback-ControlM1Qdrant.ps1` takes the same digest, stops/unregisters only that exact task,
and retains every file. Re-running installation after a verified rollback can re-register the same
retained bytes disabled; it does not copy over or rebuild them. A partial/mismatched installation
fails closed for inspection.

The runner checks binary/code/config before each start, uses an exclusive owned runtime lock, closes
stdin, monitors both exact loopback listeners, and retains bounded32KiB stdout/stderr tails per run
under the protected state directory. It never emits raw logs through the public operation receipt.
Stopping a Windows Qdrant child is a process stop, not a proven graceful database shutdown; the
rebuildable index and its WAL remain. Actual restart/recovery must be tested before service readiness
is claimed. No PostgreSQL data is rolled back.

## Local verification and remaining live proof

`node --test gate7f/function-first/control/qdrant/qdrant-control.test.mjs` runs six tests including
fourteen executed PowerShell contract checks. They hash the actual pinned binary, build a disposable
package, parse all lifecycle sources, compare JS/PowerShell canonical config bytes, test exact task/
child/listener contracts with explicit system-API doubles, and create actual NTFS hardlink/junction
fixtures to verify native rejection. No scheduled task or Qdrant service is started by these tests.

Initial test failures were local harness issues: PowerShell5 inherited a restricted execution policy,
then a PowerShell7 module path hid Get-FileHash, and one compact Where-Object argument was malformed.
The harness now uses process-scoped execution policy only, hashing uses .NET directly, and the filter
is an explicit script block. These are not presented as live Control failures or passing service proof.

Still required in the coordinated Control deployment: verify parent traversal without ACL repair;
install disabled and re-read task/SID/ACL/pins; start and verify exact listeners/readyz; create a synthetic
reference-only collection; stop/restart and verify it; rehearse rollback/re-registration; confirm all
unrelated listeners, registrations, configuration and protected stores unchanged. Keep the task disabled
or rolled back if any check fails. Human account testing and model/function qualification remain separate.
