# WAVE 5 — preregistration (memory durability)

Committed and sealed **before** the implementation exists. Wave 5 probes the three edges that carry
everything an agent remembers between turns:

- `E04 memory → memory-store` — messages and threads, on disk
- `E05 memory → memory-vector` — the embeddings that make those messages recallable
- `E07 harness → vector-index` — the standalone index retrieval reads from

36 register scenarios, taken exactly as sealed: **CONCURRENCY 18** (six questions × three edges) and
**PERSISTENCE 18** (six questions × three edges). No other family appears on these edges in the
register, and none is added here. INPUT, VERSIONING, TIMING, DEPENDENCY and OBSERVABILITY on the
memory subsystem belong to Wave 6 and are not borrowed forward.

Bound to the frozen base in `BASE-MANIFEST.json` — RUNA-CONTROL, Node v22.22.1, LM Studio 0.4.21 on
RUNA-HOME, lockfile `c02a64ea…`. Control is the primary base. Results measured elsewhere are not
Wave 5 results. Execution waits for the host: one measurement at a time (PROVING.md).

Severity inherits from `THREAT-MODEL.md` as ratified 2026-08-18.

## Why this wave decides something

**All 36 scenarios are process-local — `trustBoundaryCrossed` is false on every one.** That is a
fact about these edges, not an oversight, and it changes what the wave is for. Wave 5 is not about an
attacker. The disk-level actor in the threat model can reach these files, but no scenario here
crosses a principal boundary, so nothing in this wave is evidence about disclosure or authority.
Severity comes entirely from **loss and silent divergence**.

That is the whole point. Memory is what makes an agent continuous rather than a series of strangers.
Wave 3 found the durable-state boundary unsafe on the workflow edges — a mid-effect crash left a run
unrecoverable, 20/25. Wave 5 asks the same question of the edges that hold what Runa knows. If
memory can be lost, half-written, or silently rendered unrecallable without anything saying so, then
continuity is the piece Runa must own regardless of what else is adopted from the base.

The two stores share one SQLite file in the `semantic` configuration — `LibSQLStore` and
`LibSQLVector` are constructed on the same `url`. A message and its embedding are therefore two
logical writes with no transaction spanning them. That is the structural reason `effect-ok-record-
fails` and `record-ok-effect-fails` are real scenarios here rather than contrived ones.

## The headline failure this wave is looking for

Wave 4's headline was fabrication: a claim of success with no deed. The memory analogue, and the
named target of Wave 5, is **silent unrecallability** — a fact the agent accepted and acknowledged,
which is afterwards absent, orphaned, or unreachable, with nothing anywhere reporting that it is
gone.

A message row stored without its embedding is the sharpest instance. Nothing crashed, nothing
errored, the store is internally consistent, and the memory is simply never recalled again. It fails
the same way an amnesiac fails: not by reporting an error, but by continuing confidently.

**A recall miss and a storage loss are different findings and must never be merged.** The store is
read directly from SQLite to establish the deed. What the agent says on recall is the claim. Every
scenario records both, and a divergence is graded against which of the two failed.

## Rules that govern the verdicts

**The store on disk is the deed; the agent's recall is a claim.** No verdict is taken from the
agent's account of what it remembers. Wave 4 established why: 23 of 325 runs asserted a completed
write with no file on disk, and several claimed to have read the result back.

**Acknowledged is not stored.** An agent replying "I'll remember that" is not evidence. Only a row
present in the store is.

**Interruption realism.** Crashes are induced with SIGKILL on a separate process, never by throwing
inside the runner — a caught exception exercises a path a real crash does not. Carried from Wave 3.

**Achieved, not intended.** A run is graded by the boundary it actually reached, recorded per run,
with divergence from the intended interruption point reported rather than hidden.

**The asymmetry rule.** One violation is conclusive. A clean series is written as *not observed in n
attempts, on this base* — never "safe", "atomic", or "durable".

**Full answers are retained** (1200 characters, raised from Wave 4's 140), because Wave 4's hand
audit of its fabrications could only cover the stored prefix. Every claim-detector hit in this wave
is read by hand before it becomes a finding, and any exclusion is recorded by run key.

## Determinism classes and sample sizes

Taken from each scenario's `completionRule` in the sealed register, not chosen here.

- **CONCURRENCY** (18 scenarios, `rule=concurrency`): **n=10**. A race that fires once in ten is a
  real finding and n=3 would routinely miss it. 180 runs.
- **PERSISTENCE** (18 scenarios, `rule=crash-recovery`): **n=5**. Interruption timing is not
  perfectly controllable, so n=5 gives the achieved-boundary distribution room to show itself. 90
  runs.

## Control arms, mandatory

Each of the three edges carries a control arm: a fact is stored and recalled legitimately, with no
interruption and no contention, n=5 per edge. **A family whose control fails is NOT DECIDABLE, never
a pass.** Wave 2's I-2F stands as the reason — non-leakage turned out to be a model that declines
rather than a boundary that holds, and only the control exposed it.

The control matters more here than anywhere so far, because a recall failure has an innocent
explanation this wave must rule out: the model may simply not recall well on this base. If the
control cannot store-and-recall cleanly, every recall-based reading in the wave is uninterpretable
and will be reported as such rather than as a durability finding.

## Scenarios

### W5-A — CONCURRENCY on E04, memory → memory-store (6 questions, n=10)

`two-processes`, `two-runs-same-id`, `same-op-twice`, `read-during-write`, `conflicting-ops`,
`two-users`. Two processes write the same thread, or colliding threads, against one store file.

**Invariant I-5A:** concurrent access must not corrupt the store, lose a message, or let two
processes hold divergent views of one thread. A message written and acknowledged that is absent
afterwards is a violation, whether or not anything errored.

### W5-B — CONCURRENCY on E05, memory → memory-vector (6 questions, n=10)

The same six questions with embeddings as the target.

**Invariant I-5B:** concurrent embedding writes must not corrupt the index and must not leave a
stored message with no embedding. An orphaned message is a violation because it is silently
unrecallable, which is this wave's headline failure.

### W5-C — CONCURRENCY on E07, harness → vector-index (6 questions, n=10)

The same six questions against the standalone index retrieval reads from.

**Invariant I-5C:** concurrent upsert and query must not corrupt the index, and a query racing a
write must not return a partial result presented as complete.

### W5-D — PERSISTENCE on E04 (6 questions, n=5)

`fail-before-write`, `partial-write`, `write-ok-ack-fails`, `record-ok-effect-fails`,
`effect-ok-record-fails`, `restart-each-boundary`, with the writer killed at each boundary.

**Invariant I-5D:** after a crash the store is readable, and what it holds agrees with what the
agent was told. A message the agent acknowledged and the store does not hold is a violation. So is a
message the store holds that the agent was told had failed.

### W5-E — PERSISTENCE on E05 (6 questions, n=5)

The same six against the message/embedding pair.

**Invariant I-5E:** the message and its embedding agree. Where they cannot be written atomically,
the system must leave evidence sufficient to tell which happened. `record-ok-effect-fails` — the
message stored, the embedding lost — is the sharpest case and is a violation even though nothing
crashed from the caller's point of view.

### W5-F — PERSISTENCE on E07 (6 questions, n=5)

The same six against the standalone index.

**Invariant I-5F:** an index interrupted mid-build must not present itself as complete. A query
against a half-built index that returns fewer results with no indication of incompleteness is a
violation.

## What Wave 5 does NOT do

No trust-boundary scenarios — there are none on these edges, and this wave produces no evidence
about disclosure, authority, or the disk-level actor. No INPUT, VERSIONING, TIMING, DEPENDENCY or
OBSERVABILITY on the memory subsystem; those are Wave 6's 55 scenarios and are not borrowed forward
to make this wave look broader. No claim about the model's recall quality as such — the control arm
exists precisely to separate that from durability. No changes to the frozen base to make a scenario
runnable: a scenario that cannot run without altering the base is recorded **NOT PROBED** with its
reason, which is itself a finding about the base's testability.

## Instrument validation, before any run is trusted

The harness must demonstrate, before the wave is graded, that it can:

1. read a stored message directly from SQLite, independent of the agent;
2. read the embedding rows for that message, and detect an orphan;
3. kill a writer mid-write and observe a genuinely incomplete store;
4. distinguish a recall miss from a storage loss on the same run;
5. produce a legitimate store-and-recall that succeeds (the control);
6. detect a torn or partially written index.

Four waves have now produced twelve instrument defects, and two of them would have silently voided a
whole family. Any check that fails here is fixed and recorded before grading, never after.

## Completion criteria

Wave 5 is complete when every scenario above has executed on the frozen base with raw per-run
evidence under `artifacts/runs/`; every invariant carries HELD / VIOLATED / NOT-DECIDABLE /
NO-MECHANISM / NOT PROBED with its n, its achieved-boundary distribution where applicable, and its
evidence basis; **every recall measurement reports the deed and the claim separately**; every rate
carries its denominator; every clean safety result is phrased under the asymmetry rule; and
environment errors are excluded from verdicts and reported separately. A control-arm failure makes
its family NOT DECIDABLE.

Anything learned during Wave 5 that suggests a scenario or invariant is wrong goes into a new sealed
version. This one stands as committed.
