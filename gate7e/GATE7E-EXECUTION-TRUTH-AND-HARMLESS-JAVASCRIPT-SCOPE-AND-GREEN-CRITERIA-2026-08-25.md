# Gate 7E-0 / 7E-1: execution truth and harmless JavaScript

Date: 2026-08-25  
Base: `runa2/integration` at `57018fcb293a09daaba484e855f2d401f380a468`

## Accepted decision

Gate 7E is split deliberately.

- **7E-0** makes every Code result truthful about whether program execution occurred.
- **7E-1** permits an authenticated ordinary user to run one exact JavaScript snippet inside a fixed harmless envelope without a separate steward approval.
- Network access, dependency installation, repository access, persistent files, Git operations, broader tools, and broader code work remain undecided. They are not implied by this gate.
- Broader Code capability remains on hold until after the separately reviewed Gemma bake-off and any accepted burn-in.

The model may draft source or describe an expected result. It cannot authorize execution, fabricate an execution receipt, select a broader capability, or weaken the envelope. Execution begins only from a separate user-originated request containing the exact source to run.

## Selected runtime boundary

The outer host containment layer is Microsoft MXC `0.8.0`, pinned by package lock, using the local Windows ProcessContainer backend. The guest language runtime is QuickJS Emscripten `0.32.0`, also pinned. The immutable release builds a compact `sandbox-runtime` containing only the runner and the pinned QuickJS packages; the MXC read grant does not cover the application release tree or its full dependency tree.

This choice is intentionally local-first. It does not add a hosted sandbox, Docker, Hyper-V, a persistent service, or a new network path. Control was inspected read-only before selection: Windows 11 build 26200 exposes the ProcessContainer API, while Docker, Hyper-V, Containers, and Windows Sandbox are not enabled.

Node's permission model and `node:vm` are not accepted as the security boundary. Node documents its permission model as a safety belt rather than protection against malicious code. QuickJS-in-WebAssembly is the primary no-host-capability boundary: no filesystem, network, process, environment, module loader, worker, or other host object is exposed to evaluated code. MXC adds operating-system containment around that host process, while Node permissions add another fail-closed layer.

Microsoft describes MXC 0.8 as an early preview and explicitly says it must not yet be treated as a security boundary by itself. Runa therefore does not rely on MXC alone or describe its current policy as independently sufficient. A real startup execution must pass through the combined pinned QuickJS, Node-permission, and MXC stack before a release can start. A support probe alone is insufficient.

## 7E-0 contract

1. The Code response verifier is described as a response check, never as program execution.
2. The provider field is `responseCheck.performed`; the ambiguous `outputVerification.executed` field is removed.
3. Every Gate 2 answer carries a system-created `execution` object.
4. A normal model answer is stamped `status: "not-executed"`. Model text cannot change that stamp.
5. Only the execution service may stamp `status: "executed"`, and only after a sandbox process has returned a typed result.
6. An executed receipt binds the exact source digest, language, runtime, isolation backend and tier, bounded limits, exit status, output status, and timing.
7. A failed, timed-out, output-limited, or unavailable run is never stamped executed.
8. The customer surface visibly distinguishes **Draft — not run** from **Ran in sandbox**.

## 7E-1 harmless envelope

The first executable slice is exactly:

- authenticated personal Code experience only;
- JavaScript source only, maximum 8,000 UTF-8 bytes;
- explicit source supplied by the user's Run action;
- one disposable ProcessContainer and one QuickJS context per request;
- no model call is needed to execute the submitted source;
- 2,000 ms outer wall-clock deadline and a shorter QuickJS interrupt deadline;
- 16,000 UTF-8 bytes combined output;
- 16 MiB QuickJS allocation limit and 512 KiB QuickJS stack limit;
- one guest process, with Node child processes and workers denied;
- stdin closed immediately;
- empty explicitly supplied guest environment apart from the bounded source payload and fixed protocol fields;
- default-deny network, including internet, LAN, inbound, and host loopback;
- default-deny filesystem, with read-only grants only for the compact pinned runner/interpreter directory and the Node runtime directory needed to start the guest;
- no writable filesystem grant;
- no repository, project, attachment, credential, secret, clipboard, GUI, learning, setting, or protected-store access;
- disposable policy and identity cleanup after exit.

The ordinary-user Run action is execution intent, not a protected-action approval. It cannot be reused as approval for any future capability.

## Entry criteria

- `runa2/integration` is the exact clean base.
- Existing Gate 7D Code remains conversational and read-only before this change.
- The complete baseline suite passes.
- The sandbox dependency versions and integrity hashes are pinned.
- The selected host reports a supported MXC ProcessContainer tier and completes an actual harmless startup execution; unsupported, unreviewed-warning, or launch-failure states fail closed.

Baseline observed in the isolated worktree: **423/423 passed**.

## Green criteria

### Truth

- No response, audit code, UI label, or field uses `executed` to mean that a model response check ran.
- Drafted or predicted output is visibly and structurally `not-executed`.
- An execution receipt cannot be supplied through a model response or ordinary answer request.
- Within one running application process, replayed request IDs return the same receipt and cannot bind to changed source. No durable execution/output ledger is introduced by this slice; after a process restart, a repeated harmless request may run again.

### Isolation

- A normal arithmetic program returns exact stdout and a system-stamped executed receipt.
- Filesystem reads and writes outside the empty policy fail.
- Internet, LAN, inbound, and host-loopback connections fail.
- child processes and workers fail.
- environment and credentials are absent.
- stdin reaches EOF without input.
- infinite loops stop at the deadline.
- memory exhaustion is contained and reported as a failed run.
- output beyond the ceiling is discarded as a failed, output-limited run; partial output is not presented as a successful result.
- syntax/runtime errors are bounded and do not expose host paths, environment, secrets, or implementation diagnostics.
- the sandbox capability probe fails closed when the required backend or restrictions are unavailable.
- application startup fails before serving traffic unless the complete sandbox returns the exact typed preflight result.

### Integration

- only an authenticated Code session can call the execution route;
- Chat, workspace, protected stores, settings, identity, and Gate 3 governed actions are unchanged;
- a browser Run control appears only for an exact JavaScript code block;
- the Run request contains the exact displayed source and no hidden model-authored authority;
- continuity remains participant/project/chat scoped;
- all existing tests and the new adversarial Gate 7E suite pass.

## Explicit non-claims

This gate does not claim a terminal, package manager, repository workspace, dependency installation, persistent files, network access, multi-file programs, Git, deployment, background jobs, or broad agentic coding. It does not complete the broader Code roadmap or decide the post-Gemma capability set.

Execution receipts and output are returned to the current browser request but are not written to chat continuity in this slice. Reloading a chat therefore restores the original drafted answer, not a historical claim that its code ran. Durable execution history is a later, separately governed decision.

## Primary references

- [Node.js permission model](https://nodejs.org/download/release/v22.22.0/docs/api/permissions.html)
- [Microsoft MXC repository and preview warning](https://github.com/microsoft/mxc)
- [MXC policy schema](https://github.com/microsoft/mxc/blob/main/docs/schema.md)
- [MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [MXC operating-system support](https://github.com/microsoft/mxc/blob/main/docs/process-container/os-version-support.md)
- [QuickJS Emscripten](https://github.com/justjake/quickjs-emscripten)

## Rollback

Source rollback is the removal of the Gate 7E execution route, runner, response fields, UI Run affordance, and the two pinned dependencies. No database migration is required for this slice. A production activation, if separately approved later, must retain the current immutable predecessor release and restore it automatically on failed health, sandbox, or customer-flow validation.
