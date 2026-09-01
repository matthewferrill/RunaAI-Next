# M1-S2 R14 Review corrective qualification criteria

Status: criteria were frozen before R14 inference and remain unchanged. R14 execution is now paused at
Qwen Agent-06 repetition 2 after a non-model r51 worker-watchdog fault. The attempt is hash-bound,
ungraded, unconsumed, and will resume only after the corrected source is resealed, the model-free browser
preflight passes, and an independent post-fix review reports no P0/P1 blocker. Current repair verification:
focused worker/browser/runner 83/83, model-free harness 155/155, and the hardened 194-file tracked
repository run 1,973 tests with 1,895 passed, 78 intentional environment-dependent skips, and zero
failures; Gate 7F 28/28 and roadmap 15/15 also pass.

R14 follows the immutable R13 result. R13 qualifies Chat, Research, Code and Agent but leaves Review
without a route. Qwen3.6 is closest at 21/24 and fails the same security-control completeness point in
all three repetitions of one case. R14 may correct that behavior only through generic, model-neutral
Review instructions and verification. It does not change cases, expected facts, candidates, thresholds,
runtime budgets, authority, production routing or independent grading.

## Frozen campaign contract

- Parent source: `d0b8f23db1bcc149764e19936559a8a9df468205`
- Parent result: `M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`
- Acceptance policy: `runaai-m1-product-case-policy/v1`, version `2026-08-30.1`
- Case-bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Candidates: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B and Qwen3.6 27B MTP
- Denominator: 120 fresh attempts per candidate, 360 total, plus 12 model-free controls
- Per-role threshold: at least 22/24 acceptable, no more than two failures, no blocked or indeterminate
  row, zero critical model/product failure and green shared controls
- Review budget: 60-second role deadline and 1,024-token Review/checker ceiling, unchanged

R13 rows remain history and are not pooled into R14. The complete denominator is required because
prompt and checker changes can affect more than the originally failed row. No candidate may be dropped,
no selective retry may be substituted, and no evaluator may fill a missing model statement.

## Permitted correction

The Review answerer must explicitly assess every control stated in supplied security evidence—including
identity or authentication controls—against the specific resource or path authorization boundary. It
must not omit a stated control merely because it correctly identifies another defect and remediation.

The evidence checker must reject a security answer that silently skips a stated control. A corrected
answer must state whether each control does or does not enforce the relevant resource/path boundary,
while remaining grounded only in the current request and selected evidence.

These instructions are generic. They may not contain a case identifier, fixture/project name, expected
vulnerability, expected numeric result, frozen expected phrase, candidate name or candidate-specific
branch. Existing structured-output, citation, selected-source and two-pass limits remain unchanged.

## Required proof before inference

- Actual provider-wire tests prove the generic Review requirements reach both the primary answerer and
  checker for every candidate while known case-answer strings remain absent.
- Existing strict structured-output, citation echo/subset, timeout, output ceiling, no-redirect and
  malformed-response tests remain green.
- The complete repository suite, native/runtime tests, roadmap verifier and `git diff --check` pass.
- Create and hash-pin a committed source archive, package lock, unchanged case bundle, criteria,
  hardware plan and runtime seal before any R14 model call.
- Run the exact Control regression and all 12 model-free controls against the same source/runtime with
  zero model calls, protected-data reads or production changes.

## Required proof after inference

- Execute all 360 attempts from fresh candidate stages with one large Home model resident at a time.
- Retain each primary/checker/planner/correction output, actual journey/browser evidence and trusted
  application/host receipt; do not infer completion from a runner label.
- Freeze a new candidate-blind independent semantic decision for every semantic check before unblinding.
- Apply the unchanged whole-application role threshold. Product qualification passes only if every one
  of the five functions has at least one eligible candidate route.
- Verify each Home/Control arm closes with zero owned residency/processes, restored GPU limits, retired
  owned tasks, stable production listeners, no protected-data read and no production-route change.

## Stop and rollback conditions

Stop and retain evidence on source/runtime/case drift, case-specific prompt content, denominator or
threshold change, unbound browser evidence, repeated uncertain effect, protected-data access, production
change, critical failure or cleanup failure. Rollback removes only R14-owned disposable runtime/effects
and preserves predecessor configuration, immutable evidence and later user work.

If and only if the fresh result provides qualifying routes for Chat, Research, Code, Agent and Review,
the operator may prepare the bounded M1 customer trial. Passing that trial completes only M1; M2-M5 and
the remaining capability families continue under their own roadmap evidence.
