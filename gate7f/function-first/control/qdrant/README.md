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
  and SYSTEM retain control; LocalService reads code and modifies only state. Ancestors are inspected,
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
