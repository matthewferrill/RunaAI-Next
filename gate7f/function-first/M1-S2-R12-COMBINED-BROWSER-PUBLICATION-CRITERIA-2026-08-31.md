# M1-S2 R12 combined browser publication criteria

Status: corrective criteria revised before replacement R12 sealing or any inference.

The first R12 seal was created before its required live-proof driver existed. It was never used for
candidate inference and is retired. This revision adds only that model-free driver and its proof contract;
it does not change a candidate, prompt, case, threshold, timing boundary, expected answer or product route.

R12 addresses only the R11 diagnostic failure recorded in
`M1-S2-R11-DIAGNOSTIC-CAMPAIGN-RESULTS-2026-08-31.md`. It does not change a product action, model prompt,
case answer, role threshold, case bundle, candidate roster, production route or protected-data boundary.

## Correction

After the actual browser observes Agent05's cancelled task, one source-pinned helper must:

1. validate that the expiring one-use witness ticket, checkpoint request, source identity, runtime seal,
   campaign directory, loopback URL and browser-derived observation are exactly cross-bound;
2. build the acknowledgement from the operator-supplied actual browser observation;
3. prove that the canonical witness derived from that acknowledgement exactly equals the separately
   supplied observed witness;
4. publish the witness first and require HTTP 204;
5. publish the bound acknowledgement second and require HTTP 204; and
6. create and fsync the acknowledgement file only after both live publications succeed.

The helper must fail before network use on ticket/request drift, malformed or non-canonical browser
state, mismatched witness and acknowledgement, source/seal drift, an existing acknowledgement, invalid
path or campaign binding. It must never publish the acknowledgement after a failed witness publication.

## Boundaries that remain fixed

- Agent05 observation window: 24 seconds.
- Native-result hold: 25 seconds.
- Acknowledgement publication grace: 60 seconds after a timely witness.
- Actual in-app browser observation remains mandatory. The helper serializes operator-supplied observed
  state; it cannot infer the expected state from a checkpoint or model output.
- Witness and acknowledgement endpoints remain one-use, loopback-only and owned by the disposable
  acceptance host.
- The fixed denominator remains 120 attempts per candidate and 360 attempts total.
- The role threshold remains 22/24 with no critical failure.
- No historical row, partial retry or favorable composition is permitted.

## Required proof before inference

- Unit tests prove witness-before-ack order, exact checkpoint/ticket binding, observation validation,
  fail-closed witness error behavior and Windows PowerShell 5 parsing.
- Existing separate witness and acknowledgement helper tests remain green.
- Browser-checkpoint timing, one-use, replay, expiry and publication-grace tests remain green.
- The complete repository suite, roadmap verifier and `git diff --check` pass.
- A fresh committed archive, source identity and versioned runtime seal bind the correction.
- The exact Control regression and all 12 model-free controls pass from the same source/runtime.
- A live disposable Control proof uses the actual browser and the combined helper inside the unchanged
  24-second observation interval, then proves acknowledgement consumption and stage cleanup.
- The proof is driven by `run-r12-browser-publication-control.mjs`; it runs Agent05 with no model calls,
  retains the preparation and in-flight checkpoint bytes, and fails closed unless the live witness precedes
  the acknowledgement, both arrive within the observation window, the acknowledgement is consumed, and
  the held native result is released within its fixed ceiling.

## Pre-seal source verification

The combined witness/acknowledgement, browser-checkpoint and new live-proof-driver focused tests passed
42/42. The complete repository suite then passed at its required Windows host-process boundary: 1,904
tests, 1,826 passed, zero failed and 78 intentional environment-specific skips. The roadmap verifier passed
15/15 within that suite and `git diff --check` reported no errors. These are source checks only; exact
Control regression, all 12 controls and the actual-browser proof remain mandatory against the replacement
committed R12 archive and seal before inference. Evidence from the retired pre-proof seal is not reused.

## Required proof after inference

Run each candidate from a fresh Home lease and fresh Control stage, one model resident at a time. Retain
all 120 attempts and complete lifecycle evidence. Independently grade only whole, valid arms. A candidate
arm with missing, late, synthetic or mismatched browser evidence remains ineligible and is rerun whole;
its rows are not pooled with another arm.

## Stop conditions

Stop on source/seal/case drift, witness-after-ack order, model-derived or request-derived browser state,
ticket replay, late witness, acknowledgement without a matching witness, protected-data access,
production-route change, uncertain cleanup or any changed denominator/threshold. None authorizes
weakening the 25-second bounded-drain proof.
