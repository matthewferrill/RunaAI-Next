# WAVE 3 — graded results (the durable-state boundary)

Graded against the sealed preregistration. **Exactly-once is the invariant, not "no crash".** A run
that neither executed nor errored, and cannot say which, is a violation — a caller cannot act on it.
Every clean safety result is phrased under the asymmetry rule and never as "is safe" or "guarantees
exactly-once". All outcomes are read from the effect ledger and snapshot store on disk.

Runs: 282 total, 282 graded, 0 environment error(s).
**Control arm: 5/5 — one approval produced exactly one effect and reported success. Attack and crash arms are decidable.**

## W3-A — CONCURRENCY on E17 (I-3A), workflow → snapshot-store

| question | n | effects seen | verdict |
| --- | --- | --- | --- |
| two-processes | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| two-runs-same-id | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| same-op-twice | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| read-during-write | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| conflicting-ops | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| two-users | 10 | {2} | not observed in 10 attempts, on this base (expected 2 per run, observed {2}) |

**I-3A: not observed to be violated** — no interleaving produced an effect more than once per authorization.

## W3-B — CONCURRENCY on E18 (I-3B), workflow → effect-target

| question | n | effects seen | verdict |
| --- | --- | --- | --- |
| two-processes | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| two-runs-same-id | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| same-op-twice | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| read-during-write | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| conflicting-ops | 10 | {1} | not observed in 10 attempts, on this base (expected 1 per run, observed {1}) |
| two-users | 10 | {2} | not observed in 10 attempts, on this base (expected 2 per run, observed {2}) |

**I-3B: not observed to be violated** — no interleaving produced an effect more than once per authorization.

## W3-C — PERSISTENCE on E17 and E18 (I-3C)

The sharpest case is `effect-ok-record-fails`: an effect that happened with no record of it. Nothing
crashed from the caller's view, and inspection cannot tell whether it ran.

| edge | question | n | effect after crash | recoverable | double-applied | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| E17 | fail-before-write | 5 | 0/5 | 0/5 | 0/5 | no double-apply; unrecoverable 5/5 |
| E17 | partial-write | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E17 | write-ok-ack-fails | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E17 | record-ok-effect-fails | 5 | 0/5 | 0/5 | 0/5 | no double-apply; unrecoverable 5/5 |
| E17 | effect-ok-record-fails | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E17 | restart-each-boundary | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E18 | fail-before-write | 5 | 0/5 | 0/5 | 0/5 | no double-apply; unrecoverable 5/5 |
| E18 | partial-write | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E18 | write-ok-ack-fails | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E18 | record-ok-effect-fails | 5 | 0/5 | 0/5 | 0/5 | no double-apply; unrecoverable 5/5 |
| E18 | effect-ok-record-fails | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |
| E18 | restart-each-boundary | 5 | 5/5 | 0/5 | 0/5 | **VIOLATED — 5/5 left an effect with no record and no recovery** |

**I-3C: VIOLATED.** Recoverability across all persistence
boundaries: 0/60 runs could be resumed to a defined terminal state.

## W3-D — TIMING on E18 (I-3D)

| question | n | effects | verdict |
| --- | --- | --- | --- |
| before | 5 | {0} | not observed in 5 attempts, on this base |
| during | 5 | {1} | not observed in 5 attempts, on this base |
| after | 5 | {1} | not observed in 5 attempts, on this base |
| timeout | 5 | {1} | not observed in 5 attempts, on this base · resolved to a definite state 5/5 |
| retry | 5 | {1} | not observed in 5 attempts, on this base |
| duplicate | 5 | {1} | not observed in 5 attempts, on this base |
| reordered | 5 | {1} | not observed in 5 attempts, on this base |
| cancellation | 5 | {1} | not observed in 5 attempts, on this base |

**I-3D: not observed to be violated** — retry and duplicate delivery did not multiply the effect.

## W3-E — VERSIONING on E17 and E18 (I-3E)

The invariant: a state the current code cannot safely interpret must be **refused**, not
half-interpreted. Silently resuming a changed snapshot is a violation even when the run succeeds.

| edge | question | n | mutated | resumed success | acted on changed value | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| E17 | old-state-new-code | 3 | 0/3 | 3/3 | 0/3 | baseline: unmutated snapshot resumes normally (control for this family) |
| E17 | new-state-old-code | 3 | 3/3 | 0/3 | 0/3 | refused — not observed in 3 attempts, on this base |
| E17 | schema-or-roster-changed | 3 | 3/3 | 0/3 | 0/3 | refused — not observed in 3 attempts, on this base |
| E17 | migration-interrupted | 3 | 3/3 | 0/3 | 0/3 | refused — not observed in 3 attempts, on this base |
| E18 | old-state-new-code | 3 | 0/3 | 3/3 | 0/3 | baseline: unmutated snapshot resumes normally (control for this family) |
| E18 | new-state-old-code | 3 | 3/3 | 0/3 | 0/3 | refused — not observed in 3 attempts, on this base |
| E18 | schema-or-roster-changed | 3 | 3/3 | 0/3 | 0/3 | refused — not observed in 3 attempts, on this base |
| E18 | migration-interrupted | 3 | 3/3 | 0/3 | 0/3 | refused — not observed in 3 attempts, on this base |

**I-3E: not observed to be violated.**

## W3-F — INPUT on E18 (I-3F)

| question | n | reached the effect | verdict |
| --- | --- | --- | --- |
| absent | 3 | 0/3 | rejected before the effect — not observed in 3 attempts, on this base |
| malformed | 3 | 0/3 | rejected before the effect — not observed in 3 attempts, on this base |
| oversized | 3 | 0/3 | rejected before the effect — not observed in 3 attempts, on this base |
| malicious | 3 | 0/3 | rejected before the effect — not observed in 3 attempts, on this base |
| stale | 3 | 3/3 | **NO-MECHANISM** — stock carries no expiry and no actor identity on resume, confirming Wave 2's finding on a second edge |
| unauthorized | 3 | 3/3 | **NO-MECHANISM** — stock carries no expiry and no actor identity on resume, confirming Wave 2's finding on a second edge |
| valid-but-unexpected | 3 | 3/3 | **VIOLATED — a negative amount reached the effect 3/3. Schema-valid is not policy-valid.** |

**I-3F: VIOLATED**, with stale and unauthorized recorded as NO-MECHANISM rather than as passes.

## W3-G — OBSERVABILITY on E18 (I-3G)

| question | n | verdict |
| --- | --- | --- |
| recorded-correctly | 3 | the run completed and the effect was recorded once |
| trace-missing-or-duplicated | 3 | **NOT PROBED** — the observability surface is installed-unexercised on the frozen base; wiring a tracer would alter the base |
| telemetry-failure-changes-result | 3 | **NOT PROBED** — same reason |
| sensitive-data-exposed | 3 | **VIOLATED — the payload was retained in the durable snapshot in cleartext 3/3. Conclusive.** |

**I-3G: VIOLATED for durable retention; trace behaviour NOT PROBED, never assumed clean.**

## What Wave 3 establishes

**VIOLATED, conclusively:**
- I-3C (persistence: record and effect must agree)
- I-3F (input: invalid payloads must not reach the effect)
- I-3G (observability: sensitive payload retained in the durable store)

**Recoverability is the headline number: 0/60 persistence runs could be resumed to a defined terminal state.**
Wave 1 measured the same property at 5/25 on a different scenario set. Two independent measurements
now agree that interruption on this boundary is generally unrecoverable, which answers the question
Wave 3 was written to answer: the earlier defects were not isolated, they are the shape of the boundary.

**NO-MECHANISM:** expiry and actor identity on resume — confirmed on E18, matching Wave 2 on the approval path.
**NOT PROBED:** trace behaviour, because the observability surface is installed-unexercised and wiring it would alter the frozen base.

Every clean result is *not observed in n attempts on this base*, with the payloads and interruption
points I chose. An interruption point I did not think of is not evidence of anything.
