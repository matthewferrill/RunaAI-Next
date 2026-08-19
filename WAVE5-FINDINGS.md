# WAVE 5 — findings (memory durability)

Graded against `WAVE5-PREREGISTRATION.md` as sealed at `cbec168`, before the harness existed. 285
runs, 0 environment errors. Control arms 5/5 on all three edges, so every family is decidable.
Frozen base per `BASE-MANIFEST.json`. Asymmetry rule throughout.

All 36 scenarios are process-local. **Nothing in this wave is evidence about disclosure, authority,
or the disk-level actor.** Severity here is loss and silent divergence only.

## Verdicts

| Invariant | Verdict | Rate | Property |
|---|---|---|---|
| I-5A | **HELD** | 0/60 | concurrent access does not corrupt the store or lose a message |
| I-5B | **HELD** | 0/60 | concurrent writes leave no message without its embedding |
| I-5C | **VIOLATED** | 1/60 | concurrent upsert and query do not corrupt the index |
| I-5D | **VIOLATED** | 5/30 | after a crash the store agrees with what the caller was told |
| I-5E | **VIOLATED** | 5/30 | a message and its embedding agree, or the divergence is visible |
| I-5F | **VIOLATED** | 25/30 | an interrupted index does not present itself as complete |

## The headline: silent unrecallability, 10 of 285 runs

The preregistration named this before the harness existed: *a fact the agent accepted and
acknowledged, which is afterwards absent, orphaned, or unreachable, with nothing anywhere reporting
it is gone.* It is present, and it needs no crash and no contention to produce.

```
W5-E.record-ok-effect-fails   ack: "ok"      messages: 1
                              vectors: null  indexExists: false   orphans: 1
```

The call returns success. The message is durably on disk. **The vector index is never created at
all.** No error, no warning, no partial state — the store is internally consistent and the memory is
permanently unreachable by semantic recall. That is exactly the amnesiac failure: not an error, but
confident continuation.

The mirror case is I-5D, 5/5, on the same edge from the other side:

```
W5-D.effect-ok-record-fails   ack: "fail"    messages: 1    agrees: false
```

The call reports failure. The message is stored anyway. A caller that trusts the return value
believes nothing was written, and something was.

Both come from `memory.saveMessages` on the frozen base, and the cause is that **the three write
paths into memory are not equivalent**:

| Path | Message stored | Embedding written | Reported to caller |
|---|---|---|---|
| `saveMessages`, v2 parts | yes | no | **throws** |
| `saveMessages`, string content | yes | **no index created** | **success** |
| agent turn | yes | yes | success |

The v2 throw is an AI SDK version mismatch inside the frozen base — `@mastra/memory` bundles a check
requiring specification `v1`, and the configured embedder reports `v4`. The agent path does not hit
that check and embeds normally, which is why Wave 1's `semantic` configuration produced correct
answers and this defect stayed invisible until an edge probe called the API directly.

## I-5F — an interrupted index cannot say it is incomplete (one finding, n=25)

**This is one mechanism, not five findings.** Family F's six question names map onto two induced
boundaries: `fail-before-write` (no index, 5 runs) and a mid-build SIGKILL shared by the other five
names (25 runs, every one landing at exactly 8 rows, the kill threshold). Reporting 25/30 as five
separate violations would inflate one result fivefold. It is a single finding at n=25.

The finding itself is verified rather than assumed. After a mid-build kill:

- `describeIndex` returns `{dimension, count, metric}` — a row count, with **no build-state marker**.
- A query against the 8-row partial index returns 8 scored results, shaped identically to a complete
  index's.

A caller cannot distinguish 8-of-8 from 8-of-60. Retrieval against a half-built index therefore
returns fewer results and presents them as the whole answer. Combined with Wave 4's finding that the
answer layer has no access to a tool result's ground truth, an agent reading a truncated index has
no mechanism anywhere to notice.

## I-5C — a failed writer leaves rows behind, 1/60

Under contention one writer died with no acknowledgement and left 2 rows in a shared index
(27 present where 25 were expected). Those rows are indistinguishable from a completed writer's.

The denominator matters: **only 2 of 60 concurrency runs had a writer fail at all**, and just one of
those left extra rows. This is a rare event, observed once, and it is reported as one observation
rather than a rate. Under the asymmetry rule one violation is conclusive that it *can* happen; it
says nothing about how often.

## What held

**I-5A, 0/60.** Two processes writing the same thread, colliding thread ids, the same operation
twice, and two users produced no lost message and no unreadable store, at n=10 per question.

**I-5B, 0/60.** No run left a stored message without its embedding *through the agent path*. Note
the scope carefully: I-5B held for concurrent agent writes, while I-5E's violation comes from the
direct API path. Concurrency is not what breaks the message/embedding pair on this base — the write
path is.

Both are *not observed in 60 attempts, on this base* — never "safe" or "durable".

Duplication is structurally prevented: the index's identity column `vector_id` is `TEXT UNIQUE NOT
NULL`, and no run in the wave produced a duplicate.

## Instrument defects caught before they became findings

Wave 5 contributes two, bringing the running total to fourteen across five waves.

13. **The crash kill fired on a fixed sleep shorter than process startup** — 900ms against ~1.1s, so
    it landed before the first write and measured "nothing written". Every crash-recovery run would
    have been graded `fail-before-write` regardless of where it truly landed. The kill now fires on
    observed progress.
14. **The duplication check counted `DISTINCT` on the wrong column.** LibSQLVector declares
    `id SERIAL PRIMARY KEY`, which SQLite does not implement, so that column is NULL on every row and
    `COUNT(DISTINCT id)` returned 0 always — making `rows > distinct` true everywhere. It would have
    manufactured a duplication violation across the entire E07 family.

One near-miss is worth recording because it was caught by checking rather than by luck: an early
`query` call threw, which looked like a base defect. It was an all-zeros query vector in my own test.
A valid vector returns results normally.

## What this means for the migration

**Concurrency is not the fray in memory. The write path is.**

That is the opposite of what Wave 3 found on the workflow edges, and it changes what Runa needs to
own here. Two processes hammering one store lost nothing in 120 attempts. But a single, uncontended,
uncrashed call to the documented memory API stores a fact and silently makes it unrecallable
forever, and its sibling call reports failure while storing the message anyway.

Three things follow, each earned against a measured fray rather than assumed:

1. **A memory write needs a verified round trip.** Acknowledged is not stored, and stored is not
   recallable. Nothing in the base checks that a written message can actually be found again.
2. **An index needs to know whether it is complete.** `describeIndex` reports a count and no build
   state, so a truncated index is indistinguishable from a finished one at every layer above it.
3. **One write path, not three.** The base's paths disagree about what they store and what they
   report, and the disagreement is invisible until something reads the store directly.

Read alongside Wave 4, a single shape now appears on both the tool chain and memory: **the system
reliably reports success it has not verified, and nothing above it can tell.** That is the same
missing mechanism twice, on two independent subsystems, and it is the strongest candidate so far for
the first piece Runa must own.
