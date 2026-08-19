# CONSTRAINT PROBES — preregistration

Committed and sealed **before** the implementation exists. This probes the two constraints that made
the framework recommendation provisional and that seven waves never measured.

`docs/RUNAAI-FRAMEWORK-EVALUATION.md` scored five binding constraints when the stack was chosen, from
documentation alone — *"Nothing here has been run."* Two remain open:

| Constraint | Verdict when chosen |
|---|---|
| **2. Fully local, no outbound** | probable, **unverified** |
| **4. Approval is never a stored bit** | **unresolved, "and this is the crux"** |

**These are not register scenarios.** The 345-scenario register enumerates graph edges. These probe
the decision that selected the stack, which is prior to the edge map, and they are numbered
separately as `I-C2` and `I-C4` so they are never pooled with wave results.

Bound to the frozen base in `BASE-MANIFEST.json`, confirmed unchanged after the RUNA-HOME memory
upgrade by bit-identical embedding digests. One measurement at a time per host (PROVING.md rule).
Every harness uses `probes/instrument.mjs` and must pass its gate before a full run (PROVING.md
rule 6).

## Why this goes first

If constraint 4 fails, the framework choice is wrong on the ground it was called provisional, and
measuring its retrieval layer, its tracer or a second model is wasted effort. This is the shortest
path to knowing whether the remaining work is worth doing.

---

## I-C4 — approval is never a stored bit

Decision 0076 states the lifecycle has no `approved` state on disk: a pending proposal becomes
executed, declined, expired or failed in one steward act, **so that a tampered record cannot claim an
approval that is waiting to be spent.**

The prohibition is narrower than "nothing is persisted". A framework that suspends a workflow must
persist *awaiting approval*, and that is compatible. What may not exist is a persisted **granted**
state between the steward's act and execution.

**Invariant I-C4:** no on-disk record may, by itself, cause a governed effect to execute. An approval
must not survive on disk after the act that granted it, and no record written to the store may
substitute for a fresh steward act.

### Scenarios

| id | Question | n | Class |
|---|---|---|---|
| `C4-1 granted-state-persisted` | Between `resume(approved)` and the effect, does the store hold a granted state? | 5 | crash-recovery |
| `C4-2 survives-crash` | Killed inside that window, does a granted state remain on disk? | 5 | crash-recovery |
| `C4-3 replayable` | Restore the store as it stood after approval and resume again. Does the effect fire a second time with no new steward act? | 5 | crash-recovery |
| `C4-4 forgeable` | Write a granted state directly into the snapshot. Does resume honour it? | 3 | deterministic |
| `C4-5 cleared-after-use` | After execution, is a granted state still readable on disk? | 3 | deterministic |
| `C4-6 pending-vs-granted` | Can a reader of the store distinguish *awaiting approval* from *approved*? | 3 | deterministic |

**`C4-3` and `C4-4` are the decisive pair.** They are the two ways a stored bit becomes an
unauthorised effect: replay it, or forge it. `C4-1` on its own is not a violation — a granted state
that exists only in memory during execution is fine, and the measurement must distinguish *in the
store* from *in the process*.

**The deed is the store on disk**, read directly from SQLite, independent of the framework's own
reporting. The effect is read from the ledger. Neither is taken from what the workflow says it did —
Waves 4 to 7 established that reporting cannot be trusted as evidence.

**Control arm, mandatory (n=5):** an ordinary approve-and-execute that succeeds, producing exactly
one effect. If the control fails, every scenario here is NOT DECIDABLE, because a workflow that never
executes cannot demonstrate anything about approvals.

---

## I-C2 — fully local, no outbound

**Invariant I-C2:** exercising the stack produces no outbound connection to any destination other
than those explicitly configured.

**Allowlisted destinations**, and only these:

- `192.168.50.165:1234` — the configured model endpoint
- `192.168.50.165:8412` — the configured re-ranker
- `127.0.0.1` / `::1` — loopback, including harness proxies and MCP over stdio

**Any other destination, or any DNS resolution of any other hostname, is a violation.** A resolution
that never completes a connection still counts: it discloses that this installation exists, and to
whom.

### Scenarios

| id | Question | n |
|---|---|---|
| `C2-1 import-only` | Import the stack's modules and do nothing else | 3 |
| `C2-2 first-init` | First initialisation against an empty store | 3 |
| `C2-3 agent-turn` | One agent turn | 3 |
| `C2-4 memory-write` | A semantic memory write, including embedding | 3 |
| `C2-5 workflow-run` | Suspend and resume a workflow | 3 |
| `C2-6 mcp-client` | Connect an MCP client over stdio and call a tool | 3 |

`C2-2` is the one most likely to fire: first-run telemetry is the common pattern, and it fires once
against a fresh installation, which is precisely the condition seven waves never ran under — every
wave reused an already-initialised tree.

### How egress is observed, and what that cannot see

`strace` is not available on this host, so observation is at the Node layer: a preloaded module wraps
`net.Socket.prototype.connect` and the DNS resolvers, recording every destination before the
connection is attempted. `net.Socket.connect` is the chokepoint through which Node's own HTTP stack
and `fetch` both pass, so this sees ordinary network activity of any shape.

**Stated as a limit rather than discovered later:** it cannot see a native addon that opens a socket
without going through Node's `net` module, nor traffic from a separate process the stack might spawn.
A clean result is therefore *no outbound observed at the Node layer in n attempts, on this base* — it
is not proof of no outbound. Under the asymmetry rule that is the strongest form available here, and
a single observed destination is conclusive the other way.

**Control arm, mandatory (n=3):** a deliberate connection to a non-allowlisted destination must be
detected. Without it, "no egress observed" is indistinguishable from a detector that never fires —
the Wave 6 stuck-false lesson, applied before the fact rather than after.

---

## Rules that govern the verdicts

**Both detectors must fire in both directions** before any run is graded: the egress detector must
catch a real connection and pass a clean one, and the granted-state reader must find a planted
granted state and confirm its absence.

**The store is the deed.** Every I-C4 verdict is read from SQLite directly.

**The asymmetry rule.** One violation is conclusive. A clean series is *not observed in n attempts,
on this base*.

**Crash realism.** Interruptions use SIGKILL on a separate process, never a thrown exception.

**Achieved, not intended.** Runs are graded by the boundary actually reached, with divergence
reported.

## What these probes do NOT do

No claim about the production estate's DPAPI or Windows Hello ceremony — that is not in this lab and
never was. No claim about constraints 1, 3 or 5. No network-level packet capture. No change to the
frozen base: anything requiring one is recorded **NOT PROBED** with its reason.

## Completion criteria

Complete when every scenario has executed on the frozen base with raw per-run evidence under
`artifacts/runs/`; `I-C2` and `I-C4` each carry HELD / VIOLATED / NOT-DECIDABLE / NO-MECHANISM /
NOT PROBED with n and evidence basis; the granted-state and egress readings are reported separately
from what the framework claimed; every rate carries its denominator; clean results are phrased under
the asymmetry rule; and the instrument gate passed before the full run. A control-arm failure makes
its invariant NOT DECIDABLE.

Anything learned that suggests a scenario is wrong goes into a new sealed version. This one stands as
committed.
