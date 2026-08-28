# Prospective isolated Windows mechanics proof

This is a synthetic prerequisite of `../SUPERVISOR-PLAN.md`, not an installed Home runtime, model
recovery test, qualification result or production activation. It uses Control's existing pinned
Node 24.19.0 only as a harmless process which creates one fsync'd synthetic ownership record and waits.
Actual Home remains pinned separately to Node 22.22.1 and the qualified LM Studio/model profiles.

Create a fresh `C:\AI\RunaAI-Next-Candidate\staging\m1-runtime-os-proof-<32hex>` subtree only. Reject any
existing target/task, verify the package and Node hashes before creation, and reject linked ancestors.
Do not change any parent ACL, listener, existing task, configuration, model, port or production data.
Two uniquely named, finite tasks run the native PowerShell watchdog as SYSTEM and the IPC-access probe
as LocalService. New code/replies are read-only to LocalService, requests are writable, and lifecycle
state is unreadable. All are explicit ACLs inside the new subtree, never recursively applied to a
shared parent. This checks these two principals, not isolation from other trusted administrators or
compromised processes using the same service identity.

Pass requires actual LocalService read/write/denial results, an exclusive native ownership lock,
forced termination of only the recorded synthetic Node PID/start-time/executable while its independent
native watchdog survives and verifies the retained journal, subsequent lock release, and exact removal
of both owned task registrations. Process handles are held while identity is verified and termination
occurs. Results and the complete subtree remain recoverable. No broad deletes or process-name kills.

JSON publication flushes a create-only temporary file and uses .NET's no-overwrite `File.Move`.
The real file IPC module has its own tests; this proof supplies OS principal/ACL and native-process
mechanics evidence, not an assertion that the complete runtime IPC/lifecycle system is deployed.
Actual Home credentials, listener transition, idle/restart/admission behavior, model crash recovery,
cold boot versus desktop login, application routing and rollback remain separate requirements.
