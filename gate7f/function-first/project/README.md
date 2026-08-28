# M1-S2 disposable JavaScript project adapter

This is the first real-file project envelope, not general repository or terminal access. It preserves
the existing Gate 7E Microsoft MXC / QuickJS executor unchanged. No Cloudflare runtime, Node `vm`, shell,
package manager, network, external repository, or user-selected root is introduced.

## Authority and immutable artifacts

`DisposableJavascriptProjectAdapter` accepts an application-configured `baseDirectory`, the existing
`MxcJavascriptExecutor`, and trusted named `suites`. The authenticated application supplies a binding
`{participantId, projectId, environmentId}`. Model proposals never choose that binding or directory.

Directories derive from the exact binding hash. Each revision consists of real UTF-8 `.js` files and an
exact JSON-safe reference containing binding, environment, revision, manifest and workspace hashes.
There is **no filesystem current pointer, receipt ledger, grant or task store**. PostgreSQL owns those.

An edit materializes a new, exclusively created immutable revision. PostgreSQL publishes its reference
using a current-revision CAS and durable receipt transaction. Neither preview nor materialization alone
publishes the change. The original revision stays intact. Restore verifies an earlier reference resolved
by the authoritative service from its own receipt, then publishes that reference as a new PG event.
The adapter does not decide whether a caller owns a particular undo receipt.

Deterministic effect IDs plus exact prepared-intent hashes support read-only crash observation.
`observeMaterialized` never creates or fixes anything. A complete matching effect returns `present`, a
missing revision returns `absent`, and tampered/partial/conflicting artifacts fail closed. Never blindly
rerun an unknown execution. Retain unreferenced revisions for a separately controlled cleanup/reaper;
this adapter performs no deletion or overwrite. A same-effect retry verifies bytes instead of writing.

## File and execution boundaries

- Windows only; other platforms fail closed until equivalent containment is supplied.
- One to four flat lowercase `.js` files; aggregate source <=4,000 UTF-8 bytes. No directories, device
  names, ADS, traversal, drive/UNC paths, symlink/reparse points, or hardlinks.
- The fixed one-shot PowerShell/C# helper locks every existing ancestor through native handles with no
  delete sharing, rejects reparse attributes on the handle itself, and opens existing files with neither
  write nor delete sharing. New files use native exclusive creation; handles remain held while writing,
  flushing, reading and validating the complete snapshot. Final file type/link/length checks are repeated.
  This closes check/open/ancestor-substitution windows; `lstat`/`realpath` alone would not do so.
- Use a short dedicated application-owned base with existing parents. The application account/ACL is
  still trusted: this is not a defense against an administrator injecting into the application itself.
  Native locks prevent concurrent rename/write during the operation; subsequent tampering is detected
  by exact reference hashes. The helper is short-lived, capped, hidden, has no model execution, and emits
  only bounded artifact snapshots or safe error codes.
- Sources share an explicit `exports` object in sorted filename order: e.g.
  `exports.add = (a, b) => a + b;`. No ESM/`require`, Node/npm APIs, stdin, asynchronous job draining or
  external tests. These are bounded synchronous JavaScript functions, not a complete JS toolchain.
- Trusted suites have `{suiteId,cases:[{testId,exportName,args,expected}]}`. Only a named suite can be
  selected. Expected values stay in the host; the sandbox receives source and invocation arguments.
  The bundle is rejected if its **actual** encoded source exceeds Gate 7E's 8,000-byte ceiling.
- A fresh nonce binds the result stream. Source is compiled in a separate strict global function scope,
  not the trusted harness closure. Captured intrinsics survive prototype/console/JSON mutation. Return
  values must be bounded JSON data (no getters, promises, undefined, nonfinite numbers, functions or
  cyclic structures). Host comparison, not model assertions, determines each test result.
- The host validates the original Gate 7E receipt, actor/project/thread/request IDs, exact bundle hash,
  source size, unique nonce output and trusted expected data. No `console.log('passed')`, code comment,
  model-generated test, or answer label can establish execution or success.

Gate 7E retains its existing process/time/memory/output limits. `authorize` and `signal` are checked
after snapshot/bundle preparation and immediately before dispatch. The unchanged executor has no
external cancellation handle: an already-started run drains within its 1.2s QuickJS / 2s process ceilings.
Its actual receipt must still be retained after cancellation; the task service blocks later steps and
publication. Do not display cancellation-requested as proof the process never ran or stopped instantly.

## Public API

```js
const adapter = new DisposableJavascriptProjectAdapter({ baseDirectory, executor, suites });
const reference = await adapter.createEnvironment({ ...binding, files: [{path: "main.js", content}] });
const snapshot = await adapter.inspectRevision({ binding, reference });
const prepared = await adapter.prepare({ binding, reference, capabilityId, args });
const materialized = await adapter.materialize({ binding, effectId, prepared, authorize, signal });
const observed = await adapter.observeMaterialized({ binding, effectId, prepared });
const verified = await adapter.verifyMaterialized({ binding, reference });
const tests = await adapter.executeTests({ binding, effectId, reference, suiteId, authorize, signal });
```

Exact capability arguments:

| Capability | Arguments |
| --- | --- |
| `project.inspect` | `{path}` |
| `project.preview-change` | `{path,content,expectedSha256}` (`null` only for a new file) |
| `project.apply-change` | same exact args; materializable only after the service's grant/intent checks |
| `project.run-tests` | `{suiteId}` |
| `project.restore` | internal `{targetReference}` resolved from the service's own forward receipt |

`prepare` returns exact arguments, binding digest, before reference/hash, full-workspace precondition,
preview and (for changes) target files. These private synthetic intent bytes belong in the durable task
store, not an aggregate-only receipt. Prepared data is re-derived and checked at materialization.
`materialize` returns `{status:'materialized',reference,beforeSha256,afterSha256,output,rollbackReference}`.
`observeMaterialized` returns `{status:'present',result}` or `{status:'absent'}`. Integrity errors throw.
`executeTests` returns `{status,passed,suiteId,suiteSha256,workspaceSha256,checks,executionReceipt}`.

## Verification and limits of this evidence

`node --test gate7f/function-first/project/adapter.test.mjs` checks actual Windows files, immutable
staging/restore, exact hashes, scope/stale/forged-intent denial, restarted observation, concurrent
materialization, native handle locks, hardlink/junction rejection, and real QuickJS function outputs.
QuickJS unit transport receipts are explicitly synthetic; they do **not** qualify MXC isolation or the
customer workflow. Root integration must additionally pass actual MXC, PostgreSQL crash/CAS/grant,
LangGraph restart, authenticated UI and three-model tests before any customer-ready claim.

Local Omen validation on 2026-08-28: 13/13 passed, including the real native handle denial probe.
Only synthetic temporary fixture directories were created and removed. No service, Home/Control
activity, model load, production routing, protected record or Gate 7E source change was made.
