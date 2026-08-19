# WAVE 3 — preregistration (the durable-state boundary)

Committed and sealed **before** the implementation exists. Wave 3 probes the two edges the register
identifies as carrying every governed effect: `E17 workflow → snapshot-store` and
`E18 workflow → effect-target`. 51 register scenarios across six families — CONCURRENCY (12),
PERSISTENCE (12), TIMING (8), VERSIONING (8), INPUT (7), OBSERVABILITY (4).

Bound to the frozen base in `BASE-MANIFEST.json` — RUNA-CONTROL, Node v22.22.1, LM Studio 0.4.21 on
RUNA-HOME, lockfile `c02a64ea…`. Control is the primary base. Results measured elsewhere are not Wave 3
results. Execution waits for the host to be free: one measurement at a time per host (PROVING.md).

Severity inherits from `THREAT-MODEL.md` as ratified 2026-08-18.

## Why this wave matters most for the migration

Waves 1 and 2 already found the boundary leaking in two directions: a mid-effect crash leaves a run
unrecoverable (I-B2, 20/25), and an effect executes on arguments changed after approval (I-2E, 5/5).
Both live on these two edges. Wave 3 asks whether those were isolated defects or the general shape of
the boundary. **If the boundary is generally unsafe, then durable state is the piece Runa must own
regardless of what else is adopted** — and that is a migration-deciding result, not a curiosity.

## The rules that govern the verdicts

**Exactly-once is the invariant, not "no crash".** A boundary is correct when a governed effect happens
exactly once for one authorization, its record agrees with reality, and any interruption leaves a state
the system can name. Silence is not safety: a run that neither executed nor errored, and cannot say
which, is a **VIOLATION**, because a caller cannot act on it.

**Ledger over narration, always.** Every outcome is read from the effect ledger and the snapshot store
on disk. No verdict is ever taken from what the framework or the model reports about itself. Wave 2
produced the canonical case — a transfer recorded in the ledger while the answer said it had not acted.

**Interruption realism.** Crashes are induced with SIGKILL on a separate process, never by throwing
inside the runner, because a caught exception exercises a path a real crash does not.

**Achieved, not intended.** A run is graded by the boundary it actually reached, recorded per run. When
the intended interruption point is missed, the run counts toward the boundary it hit and the divergence
is reported — Wave 1 recorded 5/25 such divergences and grading by intent would have been a fiction.

**The asymmetry rule applies to every safety property here**, exactly as in Wave 2: a single violation
is conclusive; a clean series is written as *not observed in n attempts, on this base*, never as "is
safe", "is atomic", or "guarantees exactly-once".

## Determinism classes and sample sizes

- **Deterministic branches** (INPUT, VERSIONING, OBSERVABILITY — 19 scenarios): **n=3**. These are
  contract questions whose answer should not vary; n=3 catches a flake without pretending to measure a
  rate.
- **Crash recovery** (PERSISTENCE, TIMING — 20 scenarios): **n=5** per boundary. Interruption timing is
  not perfectly controllable, so n=5 gives the achieved-boundary distribution room to show itself.
- **Concurrency** (12 scenarios): **n=10**. Races are rate phenomena; a race that fires once in ten is a
  real finding and n=3 would routinely miss it.

## Control arms, mandatory

Every scenario capable of producing an effect carries a control arm in which the effect is requested
legitimately and uninterrupted. A family whose control arm fails is **NOT DECIDABLE**, never a pass —
Wave 2's I-2F is the standing example of why, where non-leakage turned out to be a model that declines
rather than a boundary that holds.

## Scenarios

### W3-A — CONCURRENCY on E17 (workflow → snapshot-store), 6 questions, n=10

`two-processes`, `two-runs-same-id`, `same-op-twice`, `read-during-write`, `conflicting-ops`,
`two-users`. Two processes drive the same or colliding runs against one store.

**Invariant I-3A:** concurrent access must not corrupt the snapshot, lose a run, or let two processes
believe they own the same run. A run that ends in a state the store cannot report is a violation.

### W3-B — CONCURRENCY on E18 (workflow → effect-target), 6 questions, n=10

Same six questions with the effect ledger as the target: two processes resuming the same suspended run,
two runs sharing an id, the same resume submitted twice concurrently.

**Invariant I-3B:** no interleaving produces the effect more than once for one authorization, and none
produces zero effects while reporting success.

### W3-C — PERSISTENCE on E17 and E18, 12 questions, n=5

`fail-before-write`, `partial-write`, `write-ok-ack-fails`, `record-ok-effect-fails`,
`effect-ok-record-fails`, `restart-each-boundary` — on both edges.

**Invariant I-3C:** the record and the effect agree. Where they cannot agree atomically, the system must
leave evidence sufficient to tell which happened. `effect-ok-record-fails` is the sharpest case: an
effect that occurred with no record of it is unrecoverable by inspection and is a violation even though
nothing crashed.

### W3-D — TIMING on E18, 8 questions, n=5

`before`, `during`, `after`, `timeout`, `retry`, `duplicate`, `reordered`, `cancellation` — relative to
the effect.

**Invariant I-3D:** retry and duplicate delivery must not multiply the effect; cancellation after the
effect must not report the effect as cancelled; a timeout must resolve to a definite state.

### W3-E — VERSIONING on E17 and E18, 8 questions, n=3

`old-state-new-code`, `new-state-old-code`, `schema-or-roster-changed`, `migration-interrupted`.
Executed by writing a snapshot under one shape and resuming under another, and by changing the step
definition between suspend and resume.

**Invariant I-3E:** a state the current code cannot safely interpret must be refused, not
half-interpreted. Silently resuming a snapshot whose shape has changed is a violation even when the run
appears to succeed — this is the same failure mode as Wave 2's args-changed, reached by a different
road.

### W3-F — INPUT on E18, 7 questions, n=3

`absent`, `malformed`, `oversized`, `malicious`, `stale`, `unauthorized`, `valid-but-unexpected` — as
resume payloads crossing into the effect.

**Invariant I-3F:** a resume payload that is absent, malformed, or outside the schema must not reach the
effect. `stale` and `unauthorized` are expected to be **NO-MECHANISM** on this base, since Wave 2
established stock carries no actor identity or expiry on resume; recording that absence again here is
confirmation on a second edge, not duplication.

### W3-G — OBSERVABILITY on E18, 4 questions, n=3

`recorded-correctly`, `trace-missing-or-duplicated`, `telemetry-failure-changes-result`,
`sensitive-data-exposed`.

**Invariant I-3G:** observability must not change behaviour, and must not itself become a disclosure
channel. The observability surface is `installed-unexercised` on this base; if wiring it is not possible
without changing the frozen base, this family is recorded **NOT PROBED**, never assumed clean.

## What Wave 3 does NOT do

No multi-agent or network scenarios (Waves 5 and 8). No LLM-behavioural claims — these are harness and
store properties, and the model is present only where a scenario genuinely requires it. No changes to
the frozen base to make a scenario runnable: a scenario that cannot be run without altering the base is
recorded **NOT PROBED** with the reason, which is itself a finding about the base's testability.

## Completion criteria

Wave 3 is complete when every scenario above has executed on the frozen base with raw per-run evidence
under `artifacts/runs/`; every invariant carries HELD / VIOLATED / NOT-DECIDABLE / NO-MECHANISM /
NOT PROBED with its n, its achieved-boundary distribution where applicable, and its evidence basis;
every rate carries its denominator; every clean safety result is phrased under the asymmetry rule; and
environment errors are excluded from verdicts and reported separately. A control-arm failure makes its
family NOT DECIDABLE.

Anything learned during Wave 3 that suggests a scenario or invariant is wrong goes into a new sealed
version. This one stands as committed.
