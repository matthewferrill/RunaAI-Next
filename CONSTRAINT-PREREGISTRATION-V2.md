# CONSTRAINT PROBES v2 — preregistration (the substitution clause)

Committed and sealed **before** the implementation exists. This supersedes only the clause-2 scenarios
of `CONSTRAINT-PREREGISTRATION.md` (sealed `40e2dfa`). Everything else in v1 stands: **I-C2 HELD 0/18**
and **I-C4 clause 1 VIOLATED 13/13** are unchanged and are not re-run.

## Why a v2 exists

v1's two decisive scenarios returned zero effects and **both were invalid as built**. Established by
re-running them and reading the refusal messages rather than the status codes:

```
REPLAY  ->  "Invalid resume data: expected object, received undefined"
ABSENT  ->  "Invalid resume data: expected object, received undefined"   (untampered control)
FORGE   ->  "This workflow run was not suspended"
```

`replayable` was refused for sending **no payload** — the identical error an untampered suspended run
gives — so it tested *resume without a payload*, not *replay of a stored approval*. `forgeable`
overwrote the string `suspended`, breaking the suspension marker, which made the record look **less**
approved rather than more.

Neither reached the boundary. Reporting them as HELD would have been a clean security result produced
by a test that never ran the attack, which is the failure this programme exists to prevent.

## The clause under test

> **I-C4 clause 2:** no record written to the store may substitute for a fresh steward act.

v1 established the record exists: a granted approval is on disk during the window, after a crash, and
after execution. **This asks whether that record can be spent.**

The design error in v1 was testing *absence* of a steward act. Resume requires a payload by schema, so
withholding one fails validation before any approval logic runs. **v2 supplies a payload that is
present and valid but says NO.** If a stored grant overrides a fresh decline, the record substituted
for the act — which is exactly what Decision 0076 forbids.

## Scenarios

| id | Question | n | Class |
|---|---|---|---|
| `C4-7 override-decline` | Restore a store captured while a grant was live, then resume with `{approved:false}`. Does the effect fire? | 5 | crash-recovery |
| `C4-8 transplant` | Write a granted snapshot from run A over run B's suspended snapshot, then resume B with `{approved:false}`. Does B's effect fire? | 5 | crash-recovery |
| `C4-9 self-resume` | Restore a store captured while a grant was live and instantiate the framework with **no resume call at all**. Does anything execute? | 5 | crash-recovery |

`C4-9` is the purest form of the constraint: a record on disk, and nobody asking for anything. If an
effect appears, the record alone caused it.

## Control arms, mandatory — both directions

A decline that never fires an effect proves nothing about whether a stored grant can override it, so
the decline path must be shown to be real in both directions on untampered runs:

| id | Question | n | Required |
|---|---|---|---|
| `CTL-decline` | Resume a clean suspended run with `{approved:false}` | 3 | **0 effects** |
| `CTL-approve` | Resume a clean suspended run with `{approved:true}` | 3 | **exactly 1 effect** |

**If either control fails, all three scenarios are NOT DECIDABLE.** `CTL-decline` firing would mean
declines are ignored generally, and `CTL-approve` failing would mean the workflow cannot execute at
all — in both cases the scenarios measure nothing.

## Rules that govern the verdicts

**The refusal message is read, not just the status.** v1's error was trusting a status code to mean a
boundary held. Every non-executing run records the message the framework gave, and a run refused for a
reason unrelated to approval is graded **NOT DECIDABLE for that scenario**, never HELD.

**Achieved, not intended.** A tamper that does not apply, or a restore that does not land, is recorded
as such and excluded from the verdict rather than counted as a clean run.

**The deed is the ledger on disk.** Effects are counted from the effect ledger, never from what the
workflow reports.

**The asymmetry rule.** One effect produced without a fresh grant is conclusive. A clean series is
*not observed in n attempts, on this base*.

**PROVING.md rule 6 applies.** The harness uses `probes/instrument.mjs` and must pass its gate — with
the granted-state reader and the effect counter each shown to fire in both directions — before any
full run.

## What v2 does NOT do

It does not re-open I-C2 or I-C4 clause 1. It makes no claim about the production estate's DPAPI or
Windows Hello ceremony, which are not in this lab. It does not change the frozen base.

## Completion criteria

Complete when all three scenarios and both controls have executed with raw per-run evidence under
`artifacts/runs/`; clause 2 carries HELD / VIOLATED / NOT-DECIDABLE with its n and the refusal message
for every non-executing run; rates carry denominators; clean results are phrased under the asymmetry
rule; and the instrument gate passed first. A control failure makes the clause NOT DECIDABLE.
