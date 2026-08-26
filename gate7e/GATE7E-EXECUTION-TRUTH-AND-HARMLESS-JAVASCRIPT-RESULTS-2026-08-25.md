# Gate 7E-0 / 7E-1 results: execution truth and harmless JavaScript

Date: 2026-08-25  
Base: `runa2/integration` at `57018fcb293a09daaba484e855f2d401f380a468`  
Implementation branch: `codex/gate7e-execution-truth-sandbox`

## Outcome

The reviewed source slice and the Control startup correction are implemented and test-green. They are
**not activated on Control**.

- Code answers now carry a system-created `not-executed` stamp. A model response check is named as a check, not execution.
- A Code answer containing exactly one bounded JavaScript block offers a separate **Run in sandbox** action.
- Only that explicit user action submits the exact displayed source to the execution service.
- A successful child result is labelled **Ran in sandbox** only after a typed, source-digest-bound receipt returns from the pinned runtime stack.
- Failures, timeouts, memory exhaustion, output overflow, missing typed evidence, and unavailable isolation are never labelled executed and never return partial output.
- The ordinary authenticated Run action uses the existing personal-chat authorization. It does not require a separate steward approval and cannot authorize a broader capability.

## Implemented boundary

The inner evaluator is QuickJS Emscripten `0.32.0`. Evaluated code receives only bounded `console.log`, `console.info`, `console.warn`, and `console.error` functions. It receives no Node process, module loader, filesystem, environment, network, worker, clipboard, GUI, credential, protected-store, or project-store capability.

The outer process uses Node `22.22.0` permissions and Microsoft MXC `0.8.0` ProcessContainer policy with deny-all network, denied UI, closed stdin, no guest environment, no writable path, and read-only grants limited to:

1. a compact immutable `sandbox-runtime` containing the runner and pinned QuickJS packages; and
2. the immutable Node runtime directory; and
3. one unique transient exact-source file created exclusively by the trusted parent and removed before
   any receipt returns.

The original merged implementation used MXC's custom environment array to carry source and digest.
Control proved that any non-empty custom array fails before child startup with Win32 `0x800700CB`.
The correction removes the custom environment completely. Only the generated file path and digest are
command-line protocol fields; source content is not present in the command line, environment, receipt,
or diagnostic output. Missing, changed, oversized, or digest-mismatched source fails closed, and cleanup
failure suppresses output and execution status.

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

The final complete repository suite passed locally and from an isolated temporary Control worktree at
exact corrective commit `b1163715739e1a4f989b4c3426bd8f11105622a0`:

```text
tests 439
pass 439
fail 0
cancelled 0
skipped 0
```

The adversarial Gate 7E suite passed **16/16**. It directly demonstrated:

- real QuickJS arithmetic: `((2 + 3) / 2) * 10` produced exact stdout `25`;
- `process`, `require`, `fetch`, and `WebSocket` were absent from evaluated code;
- infinite execution stopped at the deadline;
- excessive output and memory allocation failed without partial output;
- the staged guest runtime contained only the runner and the three pinned QuickJS package roots;
- the transient source was exclusively created, exactly digest-bound, absent from the command line,
  and removed on success and failure;
- an ordinary verified password session could request only the fixed harmless envelope;
- the HTTP route remained POST-only, session-scoped, exact-origin, and explicitly workspace-marked;
- the UI extracted only one exact `js` or `javascript` fence, rendered output with text nodes, and used no browser persistence;
- the release builder and composition selected the compact sandbox runtime; and
- deployment validation remains inside the existing automatic predecessor rollback boundary.

`npm audit --omit=dev` reported one low-severity advisory propagated through seven installed package entries in the existing AI SDK dependency tree, with no available fix. Neither newly pinned sandbox dependency was named by the advisory.

## Control RCA and activation decision

Control's exact environment matrix proved two independent facts. Any non-empty MXC custom environment
failed with `0x800700CB`; removing that channel eliminated that defect from the implementation. With no
custom environment, the AppContainer reached Node, which exited during DLL initialization with
`0xC0000142`. MXC's read-only probe simultaneously reported `prepare-system-drive-required`. Microsoft
documents that Tier 3 AppContainer programs including `node.exe` may fail at startup without the minimal
system-drive-root metadata ACEs.

The corrected complete suite passes **439/439** on Control while recognizing that exact official
host-preparation blocker as an acceptable fail-closed pre-activation state. The real sandbox execution
still has not passed and is not activation evidence.

Consequently:

- source implementation and the Control transport correction are green;
- no production service, configuration, protected data, DNS, identity, database, or customer traffic was changed;
- a Control successor release will refuse to start unless the complete pinned sandbox returns the exact startup marker; and
- Gate 7E production activation remains blocked on a reviewed target-only host-preparation resolution, a
  real Control preflight, and the existing rollback-protected successor deployment.

The separately authorized released preparation was attempted and stopped after it failed to complete and
left one of its two non-inheriting metadata-only root ACEs. Microsoft issue 648 documents that the released
prepare and unprepare paths can normalize descendant ACLs and appear to hang; its target-only correction is
still draft pull request 649. The exact incident, retained root state, cleanup, uncertainty, and decision
options are recorded in `GATE7E-CONTROL-HOST-PREP-INCIDENT-2026-08-25.md`.

## Deferred by the accepted decision

Network access, dependency installation, repository access, persistent files, Git operations, terminal behavior, multi-file work, broader executors, and their approval rules remain undecided. Broader Code work remains on hold until after the separately reviewed Gemma bake-off and any accepted burn-in.

## Primary references

- [Node.js permission model](https://nodejs.org/download/release/v22.22.0/docs/api/permissions.html)
- [Microsoft MXC repository and preview warning](https://github.com/microsoft/mxc)
- [MXC policy schema](https://github.com/microsoft/mxc/blob/main/docs/schema.md)
- [MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [MXC drive-root propagation issue 648](https://github.com/microsoft/mxc/issues/648)
- [Draft MXC target-only fix 649](https://github.com/microsoft/mxc/pull/649)
- [MXC operating-system support](https://github.com/microsoft/mxc/blob/main/docs/process-container/os-version-support.md)
- [QuickJS Emscripten](https://github.com/justjake/quickjs-emscripten)

## Rollback

Source rollback removes the Gate 7E route, runner, execution contract, answer stamp, UI Run affordance,
transient source transport, compact runtime staging, and the two pinned dependencies. There is no data
rollback because this slice adds no schema and persists no execution data. The released host-preparation
inverse is not an acceptable rollback while issue 648 remains unresolved. Any accepted resolution must use
a reviewed target-only inverse and prove descendant DACL stability before Control. Any later Control
activation must retain and automatically restore the exact predecessor release on failed startup,
dependency health, or customer-flow validation.
