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

Run `node --test gate7f/function-first/home-runtime/*.test.mjs`.
Local verification2026-08-28:30/30 pass. The60second test uses a controlled clock, not a long inference;
the incomplete-body regression uses an actual disposable HTTP socket. Native file-link rejection uses
actual NTFS hardlinks/junctions; the observer was parsed by Windows PowerShell. None is live Home proof.
The real local TLS regression creates disposable certificates using the installed Git OpenSSL and
checks the valid identity, wrong identity/issuer/server name, missing and expired certificate, byte
preservation and no credential forwarding. No machine trust store or production credential is changed.

Not yet implemented or proved: independent crash watchdog/persistence, service
installation, startup without Matthew login, post-campaign JIT/sensitive-log transition, authenticated
deployment binding, long-idle native persistence, real fault/restart/rollback and production activation.
Do not claim this core is ready to deploy. The existing finite campaign operator remains the sole live
Home lifecycle authority until explicitly handed over after cleanup.
