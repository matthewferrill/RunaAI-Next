# WAVE 1 — graded results

Graded against the sealed preregistration and the sealed corpus v2 labels. Every rate carries its
denominator. Environment errors are excluded from verdicts and reported separately.

## W1-A — snapshot integrity (I-A). Class: deterministic contract; completion is variant coverage.

| variant | applied | resume | acted on tampered | I-A (sealed rule) | what actually happened |
| --- | --- | --- | --- | --- | --- |
| same-length-value | true | success | true | VIOLATED | acted-on-tampered-data |
| different-length-value | true | error | false | HELD | crashed-on-malformed-container |
| field-added | true | error | false | HELD | crashed-on-malformed-container |
| field-removed | true | error | false | HELD | crashed-on-malformed-container |
| type-changed | true | success | false | VIOLATED-SILENT | accepted-silently |
| foreign-snapshot | true | success | true | VIOLATED | acted-on-tampered-data |

**I-A: 3 of 6 applied variants VIOLATED.** Explicit integrity detection in 0 of 6.
3 variants satisfied the sealed rule only by crashing on a container the tamper broke, which is not a check.
Every variant applied (6/6), so no result here is an unapplied tamper reading as a pass.

## W1-B — crash recovery (I-B1 atomicity, I-B2 recoverability). Class: crash-recovery.

| boundary | runs | achieved boundaries | commits seen | I-B1 violations | I-B2 violations |
| --- | --- | --- | --- | --- | --- |
| before-effect | 5 | {"died-before-effect":5} | {"0":5} | 0 | 5 |
| during-effect | 5 | {"died-inside-effect":5} | {"0":5} | 0 | 5 |
| after-effect-before-checkpoint | 5 | {"died-after-effect":5} | {"1":5} | 0 | 5 |
| after-checkpoint | 5 | {"died-during-resume":5} | {"1":5} | 0 | 0 |
| during-checkpoint-write | 5 | {"died-before-effect":5} | {"0":5} | 0 | 5 |

**I-B1 (at most one effect): 0/25 failed — 95% upper bound on failure rate ~12%.**
**I-B2 (recoverable to a defined terminal state): 20 of 25 runs VIOLATED.**
Runs whose achieved boundary differed from the intended one: 5 of 25 — graded by what was achieved, never by what was aimed at.
Where they differed: {"during-checkpoint-write -> died-before-effect":5}.

## W1-C — memory configuration matrix (I-C). Class: stochastic; tiered n.

| cell | n | passes | pass rate | support |
| --- | --- | --- | --- | --- |
| default @ depth 2 | 3 | 3 | 3/3 | 0/3 failed — 95% upper bound on failure rate ~100% |
| semantic @ depth 2 | 3 | 3 | 3/3 | 0/3 failed — 95% upper bound on failure rate ~100% |
| window40 @ depth 2 | 3 | 3 | 3/3 | 0/3 failed — 95% upper bound on failure rate ~100% |
| working @ depth 2 | 3 | 3 | 3/3 | 0/3 failed — 95% upper bound on failure rate ~100% |
| default @ depth 10 | 10 | 1 | 1/10 | 9/10 failed — a rate, reported with its denominator |
| semantic @ depth 10 | 10 | 10 | 10/10 | 0/10 failed — 95% upper bound on failure rate ~30% |
| window40 @ depth 10 | 3 | 3 | 3/3 | 0/3 failed — 95% upper bound on failure rate ~100% |
| default @ depth 25 | 10 | 2 | 2/10 | 8/10 failed — a rate, reported with its denominator |
| semantic @ depth 25 | 10 | 10 | 10/10 | 0/10 failed — 95% upper bound on failure rate ~30% |
| window40 @ depth 25 | 3 | 1 | 1/3 | 2/3 failed — a rate, reported with its denominator |
| semantic @ depth 50 | 5 | 5 | 5/5 | 0/5 failed — 95% upper bound on failure rate ~60% |
| window40 @ depth 50 | 3 | 0 | 0/3 | 3/3 failed — a rate, reported with its denominator |
| working @ depth 50 | 5 | 5 | 5/5 | 0/5 failed — 95% upper bound on failure rate ~60% |
| semantic @ depth 100 | 5 | 5 | 5/5 | 0/5 failed — 95% upper bound on failure rate ~60% |
| working @ depth 100 | 5 | 5 | 5/5 | 0/5 failed — 95% upper bound on failure rate ~60% |

**I-C ("semanticRecall is a stock knob that recovers recall"): NOT HELD at the preregistered threshold — the fray map's headline is downgraded, not averaged.**

## W1-D — working-memory anomaly (I-D). Class: diagnostic.

Working-memory runs: 13. Runs with a readable template dump: 13.
- depth 2 rep 1: answer correct, fact present in template
- depth 2 rep 2: answer correct, fact present in template
- depth 2 rep 3: answer correct, fact present in template
- depth 50 rep 1: answer correct, fact present in template
- depth 50 rep 2: answer correct, fact present in template
- depth 50 rep 3: answer correct, fact present in template
- depth 50 rep 4: answer correct, fact present in template
- depth 100 rep 1: answer correct, fact present in template
- depth 100 rep 2: answer correct, fact present in template
- depth 100 rep 3: answer correct, fact present in template
- depth 100 rep 4: answer correct, fact present in template
- depth 100 rep 5: answer correct, fact present in template
- depth 50 rep 5: answer correct, fact present in template

**I-D: MECHANISM SUPPORTED — the template dump separates passing from failing runs.**

## W1-E / W1-F — tool mid-chain failure and timeout. Class: deterministic branches.

| variant | rep | elapsed ms | states owner | reports failure | verdict |
| --- | --- | --- | --- | --- | --- |
| control-both-calls-succeed | 1 | 115386 | true | false | CONTROL-OK |
| control-both-calls-succeed | 2 | 1664 | true | false | CONTROL-OK |
| control-both-calls-succeed | 3 | 1623 | true | false | CONTROL-OK |
| die-after-first-call | 1 | 7861 | true | true | VIOLATED-FABRICATED |
| die-after-first-call | 2 | 2076 | true | false | VIOLATED-FABRICATED |
| die-after-first-call | 3 | 1998 | true | false | VIOLATED-FABRICATED |
| hang-no-client-timeout | 1 | 120342 | false | false | VIOLATED-UNBOUNDED |
| hang-no-client-timeout | 2 | 120391 | false | false | VIOLATED-UNBOUNDED |
| hang-no-client-timeout | 3 | 64070 | false | true | HELD |
| hang-with-client-timeout | 1 | 81775 | false | true | HELD |
| hang-with-client-timeout | 2 | 95683 | false | true | HELD |
| hang-with-client-timeout | 3 | 14091 | false | true | HELD |

**Control arm: 3/3 completed the two-call chain.** Without this, an honest failure report is indistinguishable from a model that never manages the task.
**W1-E: 3 violations, 0 unclear, of 3 graded runs.** 3/3 failed — a rate, reported with its denominator
**W1-F: 2 violations, 0 unclear, of 6 graded runs.** 2/6 failed — a rate, reported with its denominator
