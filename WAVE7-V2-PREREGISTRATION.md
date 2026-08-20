# WAVE 7 v2 — provider-boundary evidence repair preregistration

Sealed before the v2 run starts. This is a clean rerun, not a regrade of Wave 7 v1. V1 remains
`NOT_DECIDABLE` because its 97 referenced wire logs were absent before evidence preservation.

## Question

At the E02 agent-to-model-provider boundary, does the stock client surface endpoint failure,
bound outbound input, resolve within the client cap, produce at most one completed generation per
logical turn, and verify the identity of the endpoint receiving context?

## Base and isolation

- Run id: `wave7-v2`.
- Checkpoint: `probes/results/wave7-v2-partial.jsonl`; v1 records are never reused.
- Wire evidence: `artifacts/runs/wave7-v2-wire/*.wire`; each run record carries the exact path and
  SHA-256 of its log.
- Model: `qwen3-coder-30b-a3b-instruct`, served by the existing OpenAI-compatible LM Studio endpoint.
- The base manifest is generated and sealed after dependencies and endpoint identity are verified but
  before the first warming call.
- Ports 8901–8997 must be unbound before execution. Proxy readiness requires a per-process nonce and
  matching fault mode, so a stale listener cannot satisfy readiness.
- One measurement runs on the host at a time. Any competing model benchmark or second RunaLab wave
  invalidates affected runs as environment errors.

## Scenarios and denominators

The v1 scenario matrix is repeated without widening:

| Family | Scenarios | n | Graded runs |
|---|---|---:|---:|
| CONTROL | healthy pass-through | 5 | 5 |
| A — dependency | unavailable, slow, malformed response, partial response, changed version, recovers mid-operation | 5 | 30 |
| B — input | absent, malformed, oversized, malicious, stale, unauthorized, valid-but-unexpected | 3 | 21 |
| C — timing | before, during, after, timeout, retry, duplicate, reordered, cancellation | 5 | 40 |

One warming record is retained but excluded, yielding 96 graded runs and 97 wire logs.

## Instrument gates

Before a verdict is emitted:

1. All 97 non-error records must reference a wire log.
2. Every referenced log must exist and match the SHA-256 stored in its run record.
3. Wire paths and hashes must be unique per run except where an explicit duplicate-evidence error is
   recorded; duplicates are never silently pooled.
4. The control must answer Paris, contain at least one logged chat call and show usable endpoint
   content in 5/5 runs.
5. The proxy readiness nonce and requested mode must match before the child is launched.
6. A child without an `ANSWERED::` marker is an environment error, never a clean result.
7. Proxy children are terminated after each run and ports are checked after completion.
8. Grading refuses summary fields when their wire evidence is absent or hash-mismatched.

## Invariants

- `I-7D`: an endpoint failure surfaces as a failure. Violation: the wire records no usable completed
  endpoint response while the child reports an answer.
- `I-7I`: input the endpoint cannot process is refused or bounded before transmission. Violation: an
  oversized request crosses the proxy and is rejected only after transmission, or fabrication occurs.
- `I-7T`: every logical turn resolves inside 120 seconds and produces at most one completed generation.
- `I-7X`: endpoint identity is checked before context is entrusted. `NO_MECHANISM` requires both source
  inspection showing no identity check and wire evidence showing a changed declared model did not stop
  the turn. Either half alone is `NOT_DECIDABLE` for the combined claim.

The v1 outcomes are known, so v2 is a reproduction/evidence-repair run, not a discovery study. A
different result supersedes v1 only after instrument and base checks pass; it is never coerced toward
the old report.

## Decision rules

- A failed control makes every family `NOT_DECIDABLE`.
- Any missing or mismatched required wire log makes the affected family `NOT_DECIDABLE`; if association
  cannot be localized, the whole wave is `NOT_DECIDABLE`.
- One verified violation establishes existence under the asymmetry rule. Clean series are reported as
  “not observed in n attempts on this base,” never safe.
- Rates use completed, instrument-valid runs only and always show attempted, environment-error and
  excluded counts.

## Completion criteria

Complete when the sealed v2 base manifest exists; 96 graded runs plus one warming record have immutable
run JSON and hash-bound wire logs; the grader passes its evidence gates; no proxy process or listener
remains; a package manifest for v2 evidence is generated and verified from a fresh extraction; and
the corrected findings explicitly distinguish reproduction from new evidence.
