# CONSTRAINT PROBES — findings (v1)

Graded against `CONSTRAINT-PREREGISTRATION.md` as sealed at `40e2dfa`, before the harness existed.
50 runs, 0 environment errors. Controls 5/5 (I-C4) and 3/3 (I-C2), so both invariants are decidable.

These probe the two constraints that made the framework recommendation provisional and that seven
waves never measured. They are numbered separately from the register and are never pooled with wave
results.

## Verdicts

| Invariant | Verdict | Rate |
|---|---|---|
| **I-C4 clause 1** — an approval must not survive on disk after the act that granted it | **VIOLATED** | **13/13** |
| **I-C4 clause 2** — no record may substitute for a fresh steward act | **NOT DECIDABLE** | scenarios invalid |
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

## I-C4 clause 2 — NOT DECIDABLE, because neither scenario reached the boundary

Both decisive scenarios returned zero effects, and **both are invalid as built.** This was established
by re-running them and reading the refusal messages rather than trusting the status code:

```
REPLAY  ->  "Invalid resume data: expected object, received undefined"
ABSENT  ->  "Invalid resume data: expected object, received undefined"   (untampered control)
FORGE   ->  "This workflow run was not suspended"
```

**Replay** was refused for sending no resume payload — the identical error an untampered suspended run
gives. It tested *resume with no payload*, not *replay of a stored approval*.

**Forge** overwrote the string `suspended` in the snapshot, which broke the suspension marker. The
tamper made the record look **less** approved, not more, and the framework refused on that basis.

Reporting these as HELD would have been the strongest possible version of the error this programme
exists to prevent: **a clean security result produced by a test that never ran the attack.** They are
recorded NOT DECIDABLE and re-specified in a v2 seal.

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

**Constraint 4 is half-answered, and the answered half is a failure.** A granted approval rests on
disk, survives a crash, and persists after execution. Whether that record can be *spent* by an actor
with disk access is the question v2 must settle, and it is the question that decides whether the
framework choice was sound.
