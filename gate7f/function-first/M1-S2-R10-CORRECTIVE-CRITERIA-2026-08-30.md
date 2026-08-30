# M1-S2 R10 corrective qualification criteria

Status: correction implemented and locally verified; inference has not started.

R10 is a fresh source qualification after the complete R9 comparison. It fixes
two application-level findings without changing the frozen cases, thresholds,
model roster, protected-data boundary, production route or broader roadmap.

## Parent evidence and planning pins

- Parent evidence commit: `14b9299`
- R9 result: `M1-S2-R9-THREE-MODEL-RESULTS-2026-08-30.md`
- Roadmap revision: `2026-08-28.1`
- Roadmap digest before this correction: `3a80fe6e10ece8a8bea015d5554e20b272f81efbbcdefa103764be4211f96777`
- Acceptance policy: `runaai-m1-product-case-policy/v1`, version `2026-08-30.1`
- Fixed denominator: 120 attempts per candidate, 360 total, plus 12 model-free controls
- Role threshold: at least 22 acceptable model attempts out of 24 and no critical failure

## Authorized correction

1. The Agent05 checkpoint announcement carries one minimal, expiring,
   loopback-only witness-publication ticket immediately. It does not carry the
   acknowledgement token, participant/session scope, nonce, cookie, project
   content or protected data. The 24-second witness deadline and separate
   60-second complete-acknowledgement grace remain unchanged.
2. Review uses a role-neutral response checker that derives coverage from the
   current request and supplied evidence. It checks every explicit request
   clause, material negative evidence, authority/baseline limitations and exact
   selected citations. It may produce one bounded correction, which must itself
   pass the same checker. No frozen-case answer is embedded in source or prompt.
3. Review receives a 1,024-token output ceiling within the existing byte and
   deadline controls so a complete supported answer is not truncated at the old
   default ceiling.

## Required proof before inference

- Focused witness tests prove strict ticket shape, early delivery, expiry,
  replay denial, digest binding, unchanged deadlines and non-secret aggregate
  denial reasons.
- Focused Review tests prove actual wire delivery, selected-citation validation,
  bounded correction, correction recheck, output limits and absence of
  case-specific prompt text.
- The complete repository suite and roadmap verifier pass.
- A new committed source archive, exact package lock, case bundle, hardware plan
  and runtime seal are built and hash-pinned before any model call.
- All 12 controls pass against that same sealed source/runtime configuration.

Local pre-seal verification completed on 2026-08-30:

- corrected focused suites: 83/83 passed;
- complete repository suite under normal Windows process authority: 1,787
  passed, 0 failed and 77 intentionally skipped out of 1,864 tests;
- roadmap verification: 15/15 passed at the pinned digest above; and
- `git diff --check`: passed (line-ending notices only).

These results qualify the correction for source sealing. They are not model
qualification and do not substitute for the fresh 360-attempt campaign or its
12 sealed controls.

## Required proof after inference

- Run all 360 planned attempts. Incomplete or harness-blocked rows remain in the
  denominator and are never renamed passes.
- Independently review retained raw output and deterministic grades separately.
- Select a role only when its own 22/24 threshold and critical-failure boundary
  pass. Do not pool models or roles.
- Preserve R9 as the pre-correction comparison; R10 does not erase its failures.
- Unload the owned Home model after every candidate arm, restore the original
  power state, remove owned scheduled work and verify zero campaign residency.

## Stop conditions

Stop and retain evidence on source/seal drift, non-loopback witness publication,
secret-bearing telemetry, critical model/product failure, protected-data access,
production-route change, cleanup failure or an inability to reconcile exact
attempt records. No such failure is approved for automatic weakening or waiver.

Passing R10 permits deterministic role-route construction and the bounded
five-function customer trial. It does not complete M1, select a production route,
or replace the M2-M5 roadmap.
