# WAVE 7 v3 — provider-boundary evidence repair preregistration

Sealed after v2 completed but before any v3 output. V2 produced 97 run records and zero environment
errors, but the post-run gate found that all five `C.before` records had `wireSha256=null`: the proxy
was intentionally killed before a request and had never emitted a startup record. V2 is therefore
`NOT_DECIDABLE` under its own all-logs rule. No v2 summary is used as v3 evidence.

## Fixed question and matrix

V3 repeats the complete v2 matrix, not only the failed cells: 5 healthy controls, 30 dependency runs,
21 input runs and 40 timing runs, plus one excluded warming call. There are 96 graded runs and 97 wire
logs. Model, endpoint, caps, prompts, repetitions, invariants and decision rules are identical to
`WAVE7-V2-PREREGISTRATION.md`.

Run id is `wave7-v3`; checkpoint and evidence roots are new:

- `probes/results/wave7-v3-partial.jsonl`
- `artifacts/runs/wave7-v3-wire/*.wire`
- `artifacts/runs/wave7-v3-base/base-manifest.json`

## Sole instrument change

On successful bind, the proxy synchronously appends a `proxy-ready` record containing its nonce, mode,
port and pid before servicing readiness. Therefore `kill-before` has a non-empty, attributable deed
record even when no model request reaches the proxy. The runner still requires the nonce and mode to
match before launching the child.

This startup record is instrument metadata, not a chat call. `chatCalls`, usability, outbound bytes,
generation counts and secret-on-wire grading continue to filter on `isChat=true` and cannot count the
startup record as provider behavior.

## Evidence gates

Before grading:

1. All 97 non-error records reference a unique existing wire log and recorded SHA-256.
2. Every hash is recomputed after execution and must match.
3. Every wire log begins with a `proxy-ready` record whose nonce/mode/port match the associated run.
4. `C.before` must contain the startup record and zero chat calls; anything else is instrument failure.
5. Controls pass 5/5 with a logged usable chat response.
6. All v2 rules for child markers, environment errors, denominators, asymmetry and isolation remain.
7. Any missing/hash-mismatched/misattributed wire record makes the affected family `NOT_DECIDABLE`;
   inability to localize association makes the whole wave `NOT_DECIDABLE`.

## Endpoint identity claim

`I-7X NO-MECHANISM` requires two independent halves: source inspection finds no endpoint identity
enforcement, and hash-bound `changed-version` wire evidence shows the declared model changed while the
turn continued. If either half is absent, I-7X is `NOT_DECIDABLE` rather than inferred.

## Completion

Complete only when all 97 records pass the evidence gates, the base is unchanged, the grader emits a
v3-specific report, the port range is released, no proxy remains, and a fresh package/extraction check
recomputes every evidence hash. Any new instrument defect produces a new sealed version; v3 is not
repaired in place after output begins.
