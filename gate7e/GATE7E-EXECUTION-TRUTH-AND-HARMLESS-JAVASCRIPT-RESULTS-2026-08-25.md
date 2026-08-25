# Gate 7E-0 / 7E-1 results: execution truth and harmless JavaScript

Date: 2026-08-25  
Base: `runa2/integration` at `57018fcb293a09daaba484e855f2d401f380a468`  
Implementation branch: `codex/gate7e-execution-truth-sandbox`

## Outcome

The reviewed source slice is implemented and test-green. It is **not activated on Control**.

- Code answers now carry a system-created `not-executed` stamp. A model response check is named as a check, not execution.
- A Code answer containing exactly one bounded JavaScript block offers a separate **Run in sandbox** action.
- Only that explicit user action submits the exact displayed source to the execution service.
- A successful child result is labelled **Ran in sandbox** only after a typed, source-digest-bound receipt returns from the pinned runtime stack.
- Failures, timeouts, memory exhaustion, output overflow, missing typed evidence, and unavailable isolation are never labelled executed and never return partial output.
- The ordinary authenticated Run action uses the existing personal-chat authorization. It does not require a separate steward approval and cannot authorize a broader capability.

## Implemented boundary

The inner evaluator is QuickJS Emscripten `0.32.0`. Evaluated code receives only bounded `console.log`, `console.info`, `console.warn`, and `console.error` functions. It receives no Node process, module loader, filesystem, environment, network, worker, clipboard, GUI, credential, protected-store, or project-store capability.

The outer process uses Node `22.22.0` permissions and Microsoft MXC `0.8.0` ProcessContainer policy with deny-all network, denied UI, closed stdin, no writable path, and read-only grants limited to:

1. a compact immutable `sandbox-runtime` containing the runner and pinned QuickJS packages; and
2. the immutable Node runtime directory.

MXC is defense in depth, not the sole security boundary. Microsoft marks MXC as an early preview and says its current profiles should not be treated as security boundaries. Node likewise describes its permission model as a safety belt rather than protection against malicious code. Runa therefore relies first on the no-host-capability QuickJS context, then adds Node permissions and MXC containment. Application startup requires an exact real execution through all three layers; a support report alone is not enough.

## Fixed harmless envelope

- JavaScript only; 8,000 UTF-8 source bytes maximum.
- 2,000 ms outer deadline and 1,200 ms QuickJS interrupt deadline.
- 16,000 combined UTF-8 output bytes; over-limit output is discarded.
- 16 MiB QuickJS allocation ceiling and 512 KiB QuickJS stack ceiling.
- One guest process, no child process or worker permission, and no stdin.
- No filesystem writes and no network, including LAN and host loopback.
- No durable output or receipt storage and no database migration.
- In-process duplicate coordination binds one participant/request ID to one exact request. It is deliberately not a durable effect ledger; after application restart, repeating a harmless request may execute again.

## Verification evidence

The final complete repository suite passed:

```text
tests 436
pass 436
fail 0
cancelled 0
skipped 0
```

The new adversarial Gate 7E suite passed **13/13**. It directly demonstrated:

- real QuickJS arithmetic: `((2 + 3) / 2) * 10` produced exact stdout `25`;
- `process`, `require`, `fetch`, and `WebSocket` were absent from evaluated code;
- infinite execution stopped at the deadline;
- excessive output and memory allocation failed without partial output;
- the staged guest runtime contained only the runner and the three pinned QuickJS package roots;
- an ordinary verified password session could request only the fixed harmless envelope;
- the HTTP route remained POST-only, session-scoped, exact-origin, and explicitly workspace-marked;
- the UI extracted only one exact `js` or `javascript` fence, rendered output with text nodes, and used no browser persistence;
- the release builder and composition selected the compact sandbox runtime; and
- deployment validation remains inside the existing automatic predecessor rollback boundary.

`npm audit --omit=dev` reported one low-severity advisory propagated through seven installed package entries in the existing AI SDK dependency tree, with no available fix. Neither newly pinned sandbox dependency was named by the advisory.

## Host result and activation decision

The local Windows host reported ProcessContainer support, but the actual MXC launch reached its DACL fallback and failed with the known write-DAC/ACE host-preparation error. The executor returned `sandbox-start-failed`, status `unavailable`, and no output. This is the intended fail-closed result, but it is not activation evidence.

Consequently:

- source implementation is green;
- no production service, configuration, protected data, DNS, identity, database, or customer traffic was changed;
- a Control successor release will refuse to start unless the complete pinned sandbox returns the exact startup marker; and
- Gate 7E production activation remains blocked on separately authorized Control host preparation, a real Control preflight, and the existing rollback-protected successor deployment.

## Deferred by the accepted decision

Network access, dependency installation, repository access, persistent files, Git operations, terminal behavior, multi-file work, broader executors, and their approval rules remain undecided. Broader Code work remains on hold until after the separately reviewed Gemma bake-off and any accepted burn-in.

## Primary references

- [Node.js permission model](https://nodejs.org/download/release/v22.22.0/docs/api/permissions.html)
- [Microsoft MXC repository and preview warning](https://github.com/microsoft/mxc)
- [MXC policy schema](https://github.com/microsoft/mxc/blob/main/docs/schema.md)
- [MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [MXC operating-system support](https://github.com/microsoft/mxc/blob/main/docs/process-container/os-version-support.md)
- [QuickJS Emscripten](https://github.com/justjake/quickjs-emscripten)

## Rollback

Source rollback removes the Gate 7E route, runner, execution contract, answer stamp, UI Run affordance, compact runtime staging, and the two pinned dependencies. There is no data rollback because this slice adds no schema and persists no execution data. Any later Control activation must retain and automatically restore the exact predecessor release on failed startup, dependency health, or customer-flow validation.
