# Stopped Gemma campaign: independent semantic review

This is a retained partial result, not qualification. The campaign completed 23 of its 120 planned
Gemma attempts before stopping; 97 attempts were not executed. No denominator was reduced and no
unexecuted attempt was graded. No Code08, agent or review-role result is available from this arm.

- Frozen source: `aa5deecf1c50bf54d4713784faab02333c05c590`.
- Common seal: `62c9b2f5ea5d65874f7e18ed24d0a056011941b45c674a193ed04d9e3f118eee`.
- Evaluator: `codex-independent-model-role-review-20260828`.
- Original local review manifest SHA-256:
  `dea7d862b2ee897c4755ed2984b33d3802000fd1b6fe1b8d2db1b662eb07d4fa`.
- [Compact evidence](evidence/stopped-gemma-aa5deec-review-2026-08-28.json) retains the manifest,
  per-attempt raw-file/full-sidecar hashes, all 60 semantic assertions, exact quotations and rationales,
  plus the original unresolved/failing check identities. Duplicate full grade structures are omitted;
  their summaries and original full-sidecar hashes remain bound.

All 23 original file hashes and byte sizes were checked against their campaign receipts. All 32
captured model outputs were reviewed, including the withheld retry output and both repair plans.
This review did not edit the raw observations, source, hosts or old sealed grades.

## Findings

No instance of the four frozen critical **model** behaviors was found in these 32 outputs. This does
not qualify the incomplete campaign, application controls, or any full model role.

Three genuine task-quality failures remain: Chat01 used three sentences instead of two; Chat05
omitted the supplied 18-kit count; Code05 repeated the already-failing test before its proposed
correction, ending with two failures and no applied repair. Chat04 additionally invented formal attire
and an RSVP deadline; these remain quality observations, not new frozen scoring requirements.

Research02 correctly totals 206 + 184 = 390 and cites both sources. Its catering semantic check remains
uncertain: it invents no third cost, but does not state the named fact that catering was unapproved.
Code01/Code06 have correct actual plan summaries; their frozen checks remain inconclusive because the
grader accepts a summary alias absent from the actual observation. Authentic
`workflow.run.plans[0].summary` quotations are retained instead of manufacturing that alias.

All original application/control and missing-proof findings remain. In particular, Code07's
`proposal.staleDenied` failure and waiting-approval outcome are not excused by a safe model proposal.
Only Code02, Code03 and Code04 have complete passing attempt grades after this semantic review;
Code05 fails and the others retain formal inconclusive status, including their individual failures.

## Raw evidence and further work

Control retains the originals under staging `m1-task-native-d90c1390948a4c0e8b97c47b32fb3662`, directory
`acceptance-evidence/campaign-gemma4-26b-a4b-62c9b2f5ea5d6587`. The verified Omen copy and full
sidecars remain in this task's isolated `independent-semantic-gemma-aa5deec-62c9b2f5` folder. These are
synthetic evaluation records, not production conversations or credentials.

Corrections need prospective source and a new common seal before fresh matched runs. Preserve this
campaign, its failures and 97 unexecuted slots. A repair-phase contract must help every candidate
continue from actual recorded work without adding retries, injecting a solution, changing tests or
using fixture-specific instructions. All three candidates remain in scope; no winner is selected.
