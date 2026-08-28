# Qualified Home runtime operator core

This directory is separate from the frozen M1 application/campaign. Read
[the prospective criteria](HOME-RUNTIME-GUARD-PLAN.md) first.

Implemented locally: exact-profile contracts, a single-primary-plus-Nomic lifecycle/admission
controller, and a transparent bounded HTTP proxy factory. The factory does not listen until its
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

Run `node --test gate7f/function-first/home-runtime/runtime.test.mjs`.

Not yet implemented or proved: native adapter, independent crash watchdog/persistence, service
installation, startup without Matthew login, post-campaign JIT/sensitive-log transition, authenticated
deployment binding, long-idle native persistence, real fault/restart/rollback and production activation.
Do not claim this core is ready to deploy. The existing finite campaign operator remains the sole live
Home lifecycle authority until explicitly handed over after cleanup.
