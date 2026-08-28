# Assembled operator — implemented, not activated or qualified

2026-08-28. This continues `SUPERVISOR-PLAN.md` inside the existing operator slice. It is independent
of the immutable application/campaign source. No model winner or role disposition is selected here.

`build-runtime-package.mjs` accepts the operator's independently qualified single profile, fresh native
binary pins and enrolled public certificate pins. It creates an immutable source-only package with a
complete fixed file map and installation digest. No private key is bundled, printed or committed.
The caller must verify the full functional campaign/control grades before supplying the profile; a
digest or successful package build does not self-qualify a candidate.

`Install-HomeRuntime.ps1` prepares only the new `C:\AI\RunaAI-Next-HomeRuntime` root, refuses an existing
root/task/port, verifies raw package bytes, copies fixed sources, and applies ACLs only under that new
root. The SYSTEM supervisor and LocalService network worker tasks are disabled **in their original
registration**. It does not start either task, open a firewall, load a model, enroll TLS secrets, change
LM Studio settings or change Control routing. Startup and Matthew-logon triggers are a recovery
mechanism, not proof that the existing desktop LM Studio can run without Matthew logging in.

Native supervision holds an exclusive file lock across startup, worker execution and recovery.
It creates a new protected IPC session, verifies the actual worker process SID/identity and durably
records both Node identities before publishing permission for the privileged Node to start. The
privileged Node monitors its native watchdog heartbeat even while hashing/loading; loss cancels startup
or closes active operation. The native watchdog observes both processes, bounded output, CPU memory,
GPU identity/temperature/headroom and startup deadlines. Exact PID/start-time/executable is checked
under a held handle before any process termination. No process-name or broad task-pattern kill exists.
The native GPU probe has its own5second deadline,8KiB per-stream cap and exact owned-child termination;
free-memory observation uses the native memory API, not a potentially blocking steady-state CIM query.
Task checks bind the sole action's full executable, exact arguments, empty working directory and
service-account principal. Worker command lines are parsed to exact argv, not matched by basename.

`runtime-main.mjs` has three fixed modes:

- `supervisor`: pinned controller plus authenticated metadata-only file broker. It continuously pumps
  release acknowledgments during graceful drain. No raw prompt crosses the privileged IPC channel.
- `worker`: exact approved LocalService process, full source/pin verification, broker readiness,
  generation-bound admission and TLS1.3 on the sole proposed Home endpoint `192.168.50.165:9776`.
  Only Control's exact certificate and address are accepted. Loading/unloading is never exposed here.
- `recover`: after independently proving both recorded old processes stopped, replay the protected
  fsync journal and recheck source/model pins, engine epoch, safe settings and fresh hardware. Unload
  only observed-fingerprint-owned instances. Restore260W only after fresh zero residency. Do not load,
  reopen admission or infer ownership from a familiar model name. Every recovery receipt is retained.

Incomplete journal writes, unresolved load responses, missing observed fingerprints, changed engine,
unsafe JIT/logging/MCP state and stale observations stay closed. Foreign residency is retained and
prevents higher-power restoration. An already absent owned instance is reconciled without repeating
its unload. A completed cleanup is rechecked against current native state, not treated as an indefinite
permission. Recovery entrypoints are privileged implementation details, not broker or HTTP operations.
The live controller applies the same fresh safe-settings condition immediately before higher-power
restoration. A returned load ID without an observed configuration fingerprint cannot authorize unload.
An exact-owned unload during a settings fault does not make that fault safe or qualify restoration.

`Stop-HomeRuntime.ps1` first disables supervisor restart and requests drain. It verifies retained native
cleanup and exact stopped workers before optionally unregistering the two owned tasks. It retains all
files and does **not** claim to restore the previous LM Studio settings or Control route; the complete
external rollback transaction still has to compose and prove those steps.

Native steady-state evidence keeps a bounded latest5second observation plus cumulative session
minimum/maximum/gap statistics. Finite qualification runs retain their separate raw5second telemetry;
this does not promise unlimited raw production telemetry retention. Lifecycle records remain private,
fsync'd, metadata-only and capped when read. Neither IPC identities nor source/profile pins are a
sandbox against other trusted administrators or compromised processes using the same service account.

The retained23 synthetic wire projections cover all seven actual adapter shapes for each primary,
plus actual campaign planner requests. Each passes the unchanged request contract and a real local
HTTP round-trip that preserves the supplied request/reply bytes. Request bytes are explicitly
reconstructed from captured JSON inputs; this does not pretend the historical capture retained raw
request bytes. The source hashes and representation are retained. No new model call or grade occurs.

Still needed before activation: fresh installed native pins,
private certificate enrollment and Caddy binding, retained original setting bytes plus a verified
JIT/logging/loopback transition and rollback, assembled real-principal Home execution, crash/restart/
dependency-loss/long-idle tests, selected functional grades and final application integration. The
existing finite lease operator remains sole live Home lifecycle authority. No runtime upgrade,
multi-primary residency, silent JIT fallback or mixed-role swap implementation is introduced.
