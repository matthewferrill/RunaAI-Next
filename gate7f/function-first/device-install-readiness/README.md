# End-user device and install readiness

Status: deterministic implementation only; no installation or actual-system acceptance.

This lane describes and evaluates four deliberately different customer paths:

1. `browser-only` uses Control's server-managed workspace and installs nothing on the end-user device.
2. `one-time-local-snapshot` uses a browser picker and bounded upload while the page is open. It installs no worker and has no persistent access or silent writeback.
3. `persistent-local-bridge` is an optional, current-user, non-executing file transport. It is fail-closed because no signed release, exact version/hash/publisher pins, separate device enrollment, or qualified uninstall proof exists yet.
4. `fully-local-execution` is deferred and separately qualified. No local worker/isolation/runtime pins or machine-change and rollback contract exist, so it cannot become ready by adding a folder, elevating a process, or observing historical Home-runtime TLS state.

`manifest.mjs` is the fixed capability/install manifest. Production evaluation binds its exact digest; alternate manifests are available only through the explicitly named test-only composition factory. Null exact pins are explicit blockers, not wildcards. `evaluator.mjs` consumes already-collected, non-secret observations plus a Control-authority context that binds evaluation time and the expected enrolled certificate digest. Signed components must report the observed signer identity and match the exact publisher pin. It returns actionable reasons plus the applicable rollback plan and performs no probing, installation, enrollment, network, registry, service, scheduled-task, filesystem, or execution action.

The host boundary is fixed: Omen is the interactive browser seat, Control owns application authority and orchestrates server workspaces, and Home performs model inference only. A deterministic `deviceReady` result does not prove an installed system, actual browser/Control/Home acceptance, or execution authority.

Focused verification:

```powershell
node --test gate7f/function-first/device-install-readiness/device-install-readiness.test.mjs
```
