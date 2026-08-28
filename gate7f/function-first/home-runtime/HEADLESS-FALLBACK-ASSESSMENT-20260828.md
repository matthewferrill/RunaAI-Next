# Headless fallback: supported direction, not an accepted replacement

2026-08-28. Read-only assessment within M1-S2's existing operator work, requested by the root operator.
Roadmap revision2026-08-28.1/digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`; operational prerequisites for
C01/C04/C06/C12/C15/C16, not a new capability or completion of the remaining roadmap. The active CoderR5
campaign is unchanged. No native process, model, setting, task, firewall or route is changed here.

## What is supported and what is actually established

The official [headless guide](https://lmstudio.ai/docs/developer/core/headless) distinguishes a
standalone `llmster` daemon from hiding the desktop application and launching it on user login.
The former can remove the GUI dependency; the latter does not prove unattended machine-boot service.
The [product overview](https://lmstudio.ai/docs/app/basics/lmstudio-vs-llmster-vs-lms) identifies llmster
as an independent daemon suitable for boot-time operation. The published startup example is Linux,
not an actual Windows service-account/GPU proof on Home.

The current public [daemon-up implementation](https://github.com/lmstudio-ai/lms/blob/main/src/subcommands/daemon/up.ts)
deliberately reuses an existing LM Studio instance. Its
[discovery helper](https://github.com/lmstudio-ai/lmstudio-js/blob/main/packages/lms-common-server/src/findOrStartLlmster.ts)
first searches live local API ports, then considers an installed daemon, then the desktop application.
A different `server start --port` is a listener setting, not a separate model engine or private profile.
These are present upstream sources, not automatically the byte-exact installed Home implementation.

The public [profile locator](https://github.com/lmstudio-ai/lmstudio-js/blob/main/packages/lms-common-server/src/findLMStudioHome.ts)
uses the process user's home and a `.lmstudio-home-pointer`; it does not expose a general documented
per-command profile flag. Discovery can scan other local API ports even if the profile's preferred
port is absent. Therefore a different task principal by itself does not prove isolation from the
already-running desktop engine. The already-observed installed `LMS_API_SERVER_INFO_PATH` branch
selects an existing exact API without default auto-start, but does not create an isolated daemon.
Do not override HOME/USERPROFILE, copy credentials, or rely on an unverified environment-variable guess.

Retained Home metadata proves the Matthew desktop process and its1234/41343 listeners, not a pinned
standalone llmster installation. `evidence/20260828-native-cli-binding.json` and
`evidence/20260828-native-transition-pins.json` remain the exact observation sources. The initial
installed-source inspection also shows the desktop's shutdown RPC refuses to shut down its embedded
daemon separately. A standalone binary's existence/version/hash, independent settings root and exact
launch/discovery contract are still unverified. No installer or daemon-up command has been run.

## Practical alternatives and their remaining gates

| Alternative | Benefit | Necessary proof before use |
|---|---|---|
| Keep the tested desktop engine and add the guard | Smallest runtime change; existing artifact/backend evidence applies | Native-wide admission/drain, settings enforcement/rollback, actual guard lifecycle; login dependency stays explicit |
| Start the exact desktop service under a dedicated Windows task/profile | May permit startup without interactive login | Exact supported profile isolation and service-account GPU behavior; cannot infer from a registered task |
| Use an already-installed exact standalone llmster in a dedicated profile | Natural GUI-free lifecycle and independently owned settings | Binary/runtime pins, explicit isolated endpoint discovery, identical backend/template/load behavior, actual boot/restart/recovery and request-path qualification |

An isolated empty daemon can eventually be prepared without stopping the old desktop, but shared GPUs
are not isolated by that process boundary. Old desktop JIT, direct LAN requests or local UI loading
could still introduce a second primary. The same one-primary/Nomic/resource contract applies across
**all** engines on the host. No new daemon can load while the old engine is serving or has unknown
residency. Splitting the GPUs would change the tested load/resource profile and is not a free fallback.
The old native surface would still require a proved admission boundary before production use; a second
process does not remove this obligation or make it safe to terminate old active requests.

The first option remains the implemented operator path. A genuine isolated headless fallback is worth
checking, but is conditional rather than a reason to change the frozen model campaign. If the exact
standalone binary is absent, a download/runtime replacement requires prospective pins and compatibility
qualification; do not silently fetch the installer's current release or claim it is the tested runtime.

## Next bounded read-only inspection, after the active lease closes

Before any launch, inspect only existing executable/install-descriptor metadata for the already-known
Matthew and codex-audit LM Studio roots. Reject links and unexpected paths. Hash a discovered binary
and record its file version; do not execute CLI discovery, bootstrap, daemon-up or any installer.
Read no authentication store, private key or inference log. Keep install arguments private unless
they match an explicit non-secret allowlist. Use the existing bounded static source decoder to identify
exact profile/daemon/discovery and prediction-accounting branches in the pinned installed source.
Retain new evidence alongside the existing observations. An absent expected file is recorded as absent,
not proof that no other installation exists anywhere on Home.

Only after those facts are available can the root select an actual fallback and freeze its finite
green criteria. Qualification must include no desktop fallback on an absent own endpoint, no automatic
download, exact source/model/backend/template pins, native JIT/MCP/logging policy, private mTLS,
one-primary admission, 160W/85C/5second telemetry, genuine unattended startup, crash recovery and exact
owned rollback. No active lease, private customer data or unrelated service may be used as a fixture.

The corrected Control quiescence v2 interface is necessary but still proves only selected Caddy-proxied
traffic. The outer operator must load the latest private journal, reconcile its exact configuration,
and obtain a fresh drain result; a cached quiescent receipt is not a transferable Home-idle assertion.
Native LAN and trusted local desktop/CLI callers remain a distinct admission/drain boundary.
