# R8 Agent05 two-phase witness correction

## Root cause

R7 used one 24-second deadline for three different events: actual DOM
observation, delivery of the full operator acknowledgement, and completion of
the checkpoint before releasing a 25-second native receipt hold. The full
acknowledgement helper also generated `observedAt` when its delayed Control
command ran, so that field described publication rather than observation.

The R7-v4 Gemma diagnostic displayed the correct state on all three Agent05
repetitions. Each failed only because the full acknowledgement crossed that
single endpoint deadline. Increasing the one deadline or trusting a backdated
client timestamp would hide the defect and weaken the evidence boundary.

## Correction

The acceptance server now creates two separate, one-use loopback endpoints:

- an on-time canonical witness endpoint with a 24-second deadline; and
- a complete acknowledgement endpoint with a 60-second publication grace.

The server timestamps and hashes the witness. The checkpoint returns a witness
ticket immediately, allowing the native receipt to be released. It continues to
await the complete acknowledgement outside that hold and mutates the graded
ledger only after the acknowledgement digest and every existing binding match.

The client-provided `observedAt` value is no longer authoritative for this live
path. The retained evidence records the server-stamped witness receipt and full
publication receipt separately.

## Safety properties

- No model, prompt, retrieved content or operator prose authorizes execution.
- No new execution capability or production endpoint is introduced.
- A witness cannot grade a check by itself.
- A complete acknowledgement cannot substitute for a missing witness.
- Both tokens are random, checkpoint-bound, loopback-only and one-use.
- Digest mismatch, replay, malformed bindings, timeout and abort fail closed.
- Publication latency cannot hold an already-produced native receipt beyond the
  unchanged 25-second ceiling.

R7-v4 remains unchanged. R8 starts only from a newly committed source archive
and runtime seal after the full local controls pass.

## Prospective seal authority

R8 uses `runaai-m1-functional-runtime-seal/v4`. The seal binds this R8
criteria file, the unchanged case-bundle digest and candidate roster, the exact
new source archive, the existing readiness evidence and a freshly created
`prospective-r8-hardware-only-not-functional-qualification` telemetry plan.
The publisher refuses prior observations, imported attempts, partial rosters,
inherited evidence, criteria substitution and input drift. R7 seal versions and
records remain accepted only as their original historical evidence; they cannot
qualify an R8 attempt.
