# Qualified Home runtime operator core

This directory is separate from the frozen M1 application/campaign. Read
[the prospective criteria](HOME-RUNTIME-GUARD-PLAN.md) first.

Implemented locally: exact-profile contracts, a single-primary-plus-Nomic lifecycle/admission
controller, a pinned Home native adapter/read-only engine observer, transparent bounded HTTP proxy and
mutual-TLS proxy factories. The factories do not listen until their
caller binds it. The controller cannot invoke a command, file, network request or native model operation
without the supplied operator adapter. Tests supply explicit doubles and ephemeral local HTTP servers;
no actual model inference or Home/Control mutation occurs.

`QualifiedRuntimeController({profile,adapter})` exposes `start`, `admit`, `poll`, `stop`, `fault` and a
non-private `status`. A successful `admit` returns a generation-bound AbortSignal and idempotent `release`;
every caller must release in `finally`. The proxy already does so. Admission checks actual instance
fingerprints, engine identity, server settings, fresh observation and hardware headroom. Cancellation of
one client does not fault other clients. Start/drain races fail closed. An ambiguous load response never
triggers a blind retry or restores higher power while a delayed load could still appear.

The operator adapter must implement:

- `verifyPins(profile,{signal})`: hash all exact model, runtime and template bytes; verify protected code/
  profile/state paths and settings. Qualification evidence digests must be independently verified before
  selecting this profile; a supplied digest is not self-authenticating approval.
- `observe({signal})`: fresh timestamp in milliseconds, full loaded-instance inventory, hardware telemetry,
  engine process identity including creation time, and explicit JIT/logging booleans.
- `setPower(160|260,{signal})`, `load(exactRequest,{signal})`, `unload({instance_id})`: strict fixed native
  operations only. Loads must retain dispatch intent and resolve ambiguity through the independent native
  supervisor. A client must never supply executable, path, GPU identity or lifecycle arguments.
- `record(nonPrivateEvent)`: append durable bounded ownership/lifecycle evidence before returning.

`createRuntimeProxy` accepts only an explicit configured internal client address and fixed endpoints.
It does not forward lifecycle/native agent/MCP calls, TTL overrides, streaming or unselected models.
Raw HTTP request/reply body bytes and upstream failure status are retained; no response rewriting,
implicit decompression, prompt suffix or replay is introduced. Client access by IP is a boundary check,
not cryptographic authentication. A production package must prove its authenticated/private binding and
close bypass paths before this factory is exposed beyond a disposable test.

`createRuntimeTlsProxy` supplies the authenticated version: TLS1.3, verified private issuer and exact
Control certificate fingerprint, current certificate/issuer validity on each request, no resumed-session
admission, and the same IP allowlist. Private material never enters upstream headers or model traffic.
It does not provision certificates or install a listener; the future operational package owns protected
key handling and the separately validated Caddy route. See [private binding criteria](PRIVATE-BINDING-PLAN.md).
Fixed `/rerank` and `/health` routes go only to the separate loopback BGE backend. They share the
authenticated boundary and retain their raw bytes; the application10second deadline sits inside a
15second outer cap. Only complete batches of1–32 windows (at most2000characters each) are accepted.
The existing LAN8412 listener has not been altered. Its legacy/other consumers require a separate
read-only baseline and exact rollback before any later listener change.

The outer request ceiling is65seconds, preserving the application's qualified60second answer and
30second planner limits; graceful drain permits70seconds. An incomplete request body has its own10second
deadline and is explicitly destroyed on abort. Only the actual qualified wire fields are accepted:
temperature0, max_tokens1–1536, plain-text messages and the exact reasoning control. The application
retains its tighter512/1536 per-role budgets. Nomic accepts at most64 prefixed1600-byte derived windows.
Unknown overrides fail closed, never get removed or rewritten.

`createPinnedNativeAdapter` is side-effect-free at construction. When invoked by a future qualified
operator it requires the exact Home/Node identity, model/runtime/operator hashes, plain non-linked
paths, zero-bypass loopback LM Studio binding, and engine PID/start-time/owner proof. Metadata is checked
again on observations; owned model IDs are required for unload. The independent protected installation,
exclusive lifecycle lock and crash supervisor remain necessary before this adapter may be activated.

`PinnedAdmissionBroker` narrows the future LocalService-worker → SYSTEM-supervisor control channel
to authenticated `admit`, `release` and `status` messages. It binds an exact worker/session, ordered
sequence, fresh timestamp and MAC; no native command, model body or path is accepted. Grant expiry
revokes but does not falsely acknowledge a stopped request. Only independent exact-worker death proof
permits releasing an unacknowledged grant. The broker is a pure control-plane module: physical IPC,
Windows ACLs and the independent native supervisor are not implemented by this class. See
[supervision criteria](SUPERVISOR-PLAN.md).

`BrokerFileServer`/`BrokerFileClient` provide bounded, signed request/reply transport using the
supervisor-created session directory. Each designated writer flushes a pending file before atomic
publication; acknowledgments remove only exact ephemeral transfer names, never native grants or
ownership evidence. A lost/tampered/oversized reply faults the client and is not replayed. Physical
cross-process flow is tested with a disposable child process. Exclusive process ownership and Windows
directory ACLs remain installer prerequisites; same-user tests do not prove cross-principal isolation.

`BrokerWorkerController` supplies the proxy-facing unprivileged facade. It validates fresh supervisor
status, exact profile/generation and every admission/acknowledgment. Revocation, supervisor loss,
expired grant, or local stop aborts pending requests without declaring them finished. The proxy awaits
asynchronous release in `finally`; a lost release reply is retained as unknown, never replayed.
The worker has no native load/unload/power interface. This is separation of code and authority, not
sandboxing of a compromised local worker: native loopback HTTP remains host-local trusted-process
access. The installed token permissions do not provide a proved inference-only lifecycle boundary.
See [native permission findings](NATIVE-PERMISSIONS-2026-08-28.md).

Native preflight and fresh observations now require both existing MCP avenues explicitly denied.
The parser handles the installed two-stage permission-store envelope and emits only non-secret policy
metadata, never token entries. Drift or missing permissions closes admission; no model can enable MCP.

Run `node --test gate7f/function-first/home-runtime/*.test.mjs`.
Local verification2026-08-28:43/43 pass. The60second test uses a controlled clock, not a long inference;
the incomplete-body regression uses an actual disposable HTTP socket. Native file-link rejection uses
actual NTFS hardlinks/junctions; the observer was parsed by Windows PowerShell. None is live Home proof.
The real local TLS regression creates disposable certificates using the installed Git OpenSSL and
checks the valid identity, wrong identity/issuer/server name, missing and expired certificate, byte
preservation and no credential forwarding. No machine trust store or production credential is changed.

The separate [Windows mechanics proof](windows-proof/README.md) also executed on Control in an isolated
new subtree. [Retained results](evidence/20260828-control-os-proof-5517e3fefd9049c797bd7f2277dd071c/README.md)
prove actual SYSTEM/LocalService ACL boundaries, an exclusive native lock, an independent PowerShell
watchdog surviving an exact synthetic Node child termination, and scoped task/process cleanup. All7
outer and7 LocalService checks passed; both tasks exited0 and were unregistered. Its Node24.19.0 fixture
is not Home22.22.1 qualification. The combined local command with `windows-proof/*.test.mjs` passed46/46,
including Windows PowerShell5.1 parsing. Actual model lifecycle recovery remains unproved.

The [assembled operator](ASSEMBLED-OPERATOR.md) now includes fixed privileged/unprivileged/recovery
entrypoints, native supervision, private journal replay, a source-only package builder, disabled
installation preparation and scoped stop/unregister. This is code, not actual assembled Home proof.
Recovery has9 focused tests including unsafe/stale observations and no higher-power restoration after
settings drift. Graceful drain now preserves unrevoked in-flight worker tickets while denying new ones.
Independent review found and corrected live-cleanup safe-settings drift, an unbounded native GPU probe,
and task/argv matching that did not bind the complete executable descriptor. Live cleanup now refuses
unobserved fingerprints and unsafe higher-power restoration. Native probe timeout/cap and exact task/
argv checks have actual local PowerShell regressions. The23 retained actual synthetic adapter/campaign
wire projections pass the strict contract and byte-preserving local HTTP proxy; they are not new model
outputs or functional grades. Their request-byte reconstruction is disclosed in each fixture.
Assembled-source verification2026-08-28: the combined runtime and Windows-proof command passed67/67
with0 skips; `npm run verify:roadmap` passed15/15. These supersede the older local test counts above,
not the explicit limits of the retained Control mechanics and still-pending actual Home qualification.
The [native transition plan](NATIVE-TRANSITION-PLAN.md) now binds private original-byte retention,
compared replacement, coordinated Control quiescence and actual in-memory enforcement proof. Its
pure settings module passes5 additional tests for exact rollback and unrelated-setting drift; it has
no host effect. Fresh [Home native pins](evidence/20260828-native-transition-pins.json) remain separate
from the Control packaged Node pin. These facts do not activate the prepared operator.

Not yet proved: assembled native watchdog/install/recovery on Home, startup without Matthew login,
post-campaign JIT/sensitive-log transition, authenticated deployment binding, long-idle native
persistence, real fault/restart/rollback and production activation.
Do not claim this core is ready to deploy. The existing finite campaign operator remains the sole live
Home lifecycle authority until explicitly handed over after cleanup.

The separate [native positive-processing proof](NATIVE-PROCESSING-PROOF-RESULTS-2026-08-29.md) passed
on immutable attempt R4: the owner-context CLI observed `computingEmbedding` and a maximum queue of187,
all96 frozen synthetic Nomic requests settled successfully, and final cleanup proved zero residency,
no owned tasks and both GPUs restored to260W. This supplies positive busy/queue evidence only; it does
not change the deployment limitations above or establish native-wide caller closure.
