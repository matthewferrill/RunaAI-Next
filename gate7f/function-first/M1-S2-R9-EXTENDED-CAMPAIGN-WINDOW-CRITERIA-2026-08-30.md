# M1-S2 R9 extended campaign-window criteria

Status: prospective qualification authority. This document is written before any R9 scored inference.

## Reason for the correction

The Qwen36 R8 run reached 110 of 120 required attempts and then failed closed on the sealed 60-minute batch ceiling. The attempt stopped at `2026-08-30T13:36:02.670Z`; its actual-browser checkpoint remained valid until `13:40:02.611Z`, and the Home lease remained valid until `13:41:48.655Z`. The ceiling, not the model, browser server, Home residency, or cleanup, prevented a complete denominator.

R9 changes time authority only. It does not change cases, prompts, expected answers, scoring, model envelopes, source boundaries, browser requirements, or the three-candidate roster.

## Prospective fixed policy

- READY lease: 85 minutes.
- Maximum scored batch: 75 minutes.
- Minimum launch remaining: 78 minutes.
- Dispatch stop margin: 4 minutes.
- Publication margin: 3 minutes, consisting of 1 minute runner finalization and 2 minutes completion publication.
- Owned cleanup: 2 minutes.
- Preparation: 10 minutes.
- Worker deadline: 97 minutes.
- Independent recovery allowance: 4 minutes.
- Supervisor and scheduled-task deadline: 101 minutes.

The extended profile is identical for Gemma, Qwen36, and Qwen3 Coder. No candidate-specific duration is allowed.

## Acceptance boundaries

1. The source archive, package lock, this criterion, readiness evidence, telemetry plan, model artifacts, templates, cases, controls, and operators are sealed before inference.
2. All 120 attempts per candidate and all 360 planned attempts remain in the denominator. There is no subset, resume, imported attempt, selective replacement, or retrospective expected-answer change.
3. One large model plus the pinned Nomic embedding model may be resident. Production routing remains unchanged.
4. Actual-browser checkpoints remain mandatory. Browser waiting remains inside the finite wall-clock batch; the timer is not paused.
5. A batch ceiling reports `m1-campaign-batch-hard-stop`; a publication-boundary ceiling reports `m1-campaign-publication-hard-stop`.
6. No attempt may start at or after the four-minute dispatch cutoff. An already-started attempt is retained honestly if a hard stop occurs.
7. Existing v2 60-minute evidence retains its original meaning. The extended profile is separately named and exactly validated.
8. Cleanup, zero residency, power restoration, task removal, protected-data exclusion, and production-unchanged proof remain mandatory.

R9 is functional evidence only. It cannot by itself approve production routing or replace the later real-user trial.
