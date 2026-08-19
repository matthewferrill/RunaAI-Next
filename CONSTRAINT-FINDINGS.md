# CONSTRAINT PROBES — findings

Graded against `CONSTRAINT-PREREGISTRATION.md` as sealed at `40e2dfa`, before the harness existed.
50 runs, 0 environment errors. Controls 5/5 (I-C4) and 3/3 (I-C2), so both invariants are decidable.

These probe the two constraints that made the framework recommendation provisional and that seven
waves never measured. They are numbered separately from the register and are never pooled with wave
results.

## Verdicts

| Invariant | Verdict | Rate |
|---|---|---|
| **I-C4 clause 1** — an approval must not survive on disk after the act that granted it | **VIOLATED** | **13/13** |
| **I-C4 clause 2** — no record may substitute for a fresh steward act | **HELD** (v2) | 0/15 |
| **I-C2** — fully local, no outbound | **HELD** | 0/18 |

## I-C4 clause 1 — a granted state is on disk, 13/13

The framework persists a granted approval to the snapshot store, and it is readable there by anything
with disk access:

| Scenario | Rate | Markers found |
|---|---|---|
| during the window between the act and the effect | **5/5** | `approved`, `resumePayload` |
| after a crash inside that window | **5/5** | `approved`, `resumePayload` |
| **after execution has completed** | **3/3** | `approved`, `resumePayload` |

The third is the sharpest. The effect has run, the approval has been spent, and a record saying
*approved* remains on disk with nothing to indicate it has been consumed.

A suspended run is plainly distinguishable from an approved one by size alone — **502 bytes pending,
611 bytes granted**, 3/3 — so an actor with disk access can tell which runs hold a spent grant without
parsing anything.

**This is Decision 0076's prohibition, and the stack does not honour it.** Decision 0076 exists so that
*a tampered record cannot claim an approval that is waiting to be spent*. The record exists. Whether it
can be *used* is clause 2, and clause 2 is not yet answered.

## I-C4 clause 2 — HELD 0/15, and the mechanism matters more than the number

**v1's two scenarios were invalid and are superseded.** Both returned zero effects, and both were
refused for reasons unrelated to approval — established by re-running them and reading the refusal
messages rather than the status codes:

```
REPLAY  ->  "Invalid resume data: expected object, received undefined"
ABSENT  ->  "Invalid resume data: expected object, received undefined"   (untampered control)
FORGE   ->  "This workflow run was not suspended"
```

Replay was refused for sending **no payload** — the identical error an untampered run gives — so it
tested *resume without a payload*, not *replay of a stored approval*. Forge overwrote the string
`suspended`, breaking the suspension marker, which made the record look **less** approved rather than
more. Reporting either as HELD would have been a clean security result produced by a test that never
ran the attack.

`CONSTRAINT-PREREGISTRATION-V2.md` (sealed `ded68d2`) re-specified them. The design error was testing
the *absence* of a steward act: resume requires a payload by schema, so withholding one fails
validation before any approval logic runs. **v2 supplies a payload that is present, valid, and says
NO.**

### Result: 21 runs, controls 3/3 and 3/3, no record produced an effect

| Scenario | Effects | Boundary reached | Refusal |
|---|---|---|---|
| `override-decline` — restore a live grant, resume with `{approved:false}` | **0/5** | 5/5 | *This workflow run was not suspended* |
| `transplant` — a granted snapshot written over another suspended run | **0/5** | 5/5 | *This workflow run was not suspended* |
| `self-resume` — restore a live grant, call nothing at all | **0/5** | 5/5 | no call made |

Both control arms behave, so the scenarios are interpretable: a clean decline produces **0 effects**
and a clean approval produces **exactly 1**.

### The defence is structural, not an approval check

**0 of 15 refusals cited approval or authorisation.** The stack does not reject a replayed grant — it
never evaluates one.

A granted state only appears *after* the run leaves the `suspended` state, and a run that is not
suspended cannot be resumed. **The granted state and the resumable state never coexist**, so a stored
grant is inert by construction rather than by being refused.

That is a real defence and it held in every attempt. It is also a narrower one than "approvals are
checked", and the difference is decision-relevant:

- A deliberate authorisation check is stable across versions. **An incidental consequence of a state
  machine is not.**
- It interacts directly with clause 1's violation. The grant persists on disk after execution (611
  bytes, markers present). **If any future recovery path permits resuming a run that is not
  suspended — which is exactly what crash recovery wants — that persisted grant becomes spendable.**
- Wave 3 found **0 of 60 persistence runs recoverable to a defined terminal state**. The pressure to
  add such a recovery path is therefore already present in the evidence.

Phrased under the asymmetry rule: **no stored record produced an effect in 15 attempts, on this
base.**

## I-C2 — no outbound observed, 0/18

Every scenario completed with its recorder armed, and no destination outside the configured endpoints
appeared:

| Scenario | Destinations observed |
|---|---|
| import-only | none |
| **first-init** (fresh store) | **none** |
| agent-turn | `192.168.50.165:1234` |
| memory-write | `192.168.50.165:1234` |
| workflow-run | none |
| mcp-client | none |

`first-init` was preregistered as the scenario most likely to fire, since first-run telemetry is the
common pattern and every wave until now reused an already-initialised tree. It did not fire.

**Phrased under the asymmetry rule: no outbound observed at the Node layer in 18 attempts, on this
base.** It is not proof of no outbound. A native addon opening its own socket, or a separate spawned
process, is outside what this instrument can see — stated in the seal before measuring, not after.

The control arm matters here: a deliberate connection to a non-allowlisted host was caught 3/3, so
"no egress observed" is distinguishable from a detector that never fires.

## Instrument defects

Four, and two are the recurring shape.

20. **The egress recorder parsed socket call arguments**, producing `?:?` for undici — so a loopback
    fetch and a foreign host looked identical, and unparsed counted as foreign. A **false-violation
    generator**: I-C2 would have reported egress on every scenario. Caught by `bothDirections` on the
    first run, before any result existed.
21. **Four C2 scenarios never ran** — ESM resolves relative imports from the file, not the working
    directory — and recorded zero destinations. Reading `foreignCount` alone, that is four clean
    results. The `completed` flag made it visible. **This is the false-safeguard shape for the second
    time**: a harness that never started reads as a system that did nothing wrong.
22. **The replay scenario tested the wrong thing** (no payload, not a stored approval).
23. **The forge scenario tested the wrong thing** (broke the suspension marker instead of forging a
    grant).

Defects 22 and 23 were found by reading the refusal *messages*, not the status codes. A refusal is
only evidence of a boundary if you know what it refused.

## What this decides

**Constraint 2 is provisionally satisfied.** The stack did not phone home under any exercise, including
first initialisation against an empty store.

**Constraint 4 fails on the letter and holds on the consequence.** A granted approval rests on disk,
survives a crash, and persists after execution — Decision 0076 forbids exactly that. But no stored
record could be spent in 15 attempts, because the grant and the resumable state never coexist.

**The framework choice is not disqualified.** The three remaining items in `LAB-PLAN.md` are worth
spending, which is what this probe existed to decide.

What Runa owns here is now specific rather than assumed. It is not "build an approval system" — the
consequence already holds. It is **two narrow things**: clear the grant from disk once it is spent,
and make the refusal an authorisation check rather than a side effect of the state machine, so the
defence survives a version bump and any future crash-recovery path.

That is a seventh item for the fray map's migration decision, and it is smaller than it looked before
the measurement.
