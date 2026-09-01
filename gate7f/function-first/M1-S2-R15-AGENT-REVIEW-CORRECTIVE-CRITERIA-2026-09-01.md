# M1-S2 R15 Agent and Review corrective qualification criteria

Status: prospective criteria frozen before implementation. No R15 model inference, controls, source
archive, runtime seal, production route change or customer trial has started.

R15 follows the immutable R14 result. R14 provides qualifying Chat, Research, Code and Agent routes,
but no Review route. It also exposes two repeatable Agent weaknesses that a future selected route must
not hide. R15 may correct only the generic, model-neutral answer/checker and planning interfaces below.
It does not rewrite or regrade R14, inject a case answer, branch on candidate identity, change a case,
drop a candidate, pool candidates, lower a threshold, widen authority or alter production.

## Selection record and planning pins

- Selection date and parent source commit: 2026-09-01 at
  `fee0f0fc6aa2cbcccdf8c98f334811c59e87f962`
- Parent result: `M1-S2-R14-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`
- Parent result SHA-256: `9cd06e0634f739a67ad1f22b5ef49d14cbc367831d240b35a92207a336143b9d`
- Roadmap revision: `2026-08-28.1`
- Roadmap SHA-256 before selecting R15:
  `e29b46789eb28949b702d89a8456ad5287e1fc9860509eb5a47a133e6a21cc58`
- Milestone and slice: M1, M1-S2
- Capability families exercised: C01, C02, C03, C04, C06, C07, C12, C15 and C16
- Acceptance policy: `runaai-m1-product-case-policy/v1`, version `2026-08-30.1`
- Frozen case-bundle SHA-256:
  `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Fixed candidates: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B and Qwen3.6 27B MTP
- Fixed denominator: 120 fresh attempts per candidate, 360 total, plus 12 model-free controls
- Role threshold: at least 22 acceptable attempts out of 24, no blocked or indeterminate row, no more
  than two failed rows and zero critical model or product failure
- Unchanged role limits: Agent planning and repair retain their existing total deadlines, one repair
  continuation and cumulative action/plan budgets; Review retains its 60-second deadline and
  1,024-token answer/checker ceiling

R14 rows remain immutable history and are not pooled into R15. The complete denominator is required
because shared prompt, schema and progress changes can affect rows beyond the originally failed cases.

## Measured R14 defects in scope

1. Gemma Review produced 17 checker responses with a nominal accepted verdict and a forbidden non-null
   correction. The provider call completed, but the conditional structured-output shape was unreliable.
2. Coder Review produced two counterexamples that contradicted the supplied function's parameter order
   and branch, and twice repeated a two-second maximum contradicted by supplied eight-second samples.
3. Qwen3.6 Review omitted the population limit on an every-user claim in all three repetitions.
4. Coder Agent stated the wrong coefficient in all three read-only formula explanations.
5. Qwen3.6 Agent changed scalar numeric subtraction into an array set-difference operation in all three
   repetitions; its selected tests failed and it did not produce a usable repair inside the frozen
   planning deadline.

These are model-facing failures, not harness excuses. R15 is a prospective opportunity for the same
three candidates to use a clearer generic application contract. Failure after the corrected contract
remains model failure and stays in the denominator.

## Permitted correction

### 1. Unconditional Review checker wire shape

Replace the conditionally nullable accepted/corrected checker shape with one unconditional object shape:
a verdict enum, non-empty reason, non-empty final answer and non-empty selected-citation array. A checker
that accepts an answer must return that answer and its citations exactly; the application verifies the
byte-for-byte answer echo and exact ordered citation echo. A checker that corrects an answer returns the
complete correction and selected citations, then the unchanged single recheck must accept and exactly
echo those bytes. Unknown keys, malformed citations, changed accepted bytes, unselected evidence and a
second correction fail closed.

The schema and parser must not infer acceptance from a correction field, silently discard contradictory
content or downgrade to prose. The final semantic reviewer still decides whether the delivered answer is
correct; structural acceptance is not semantic qualification.

### 2. Exhaustive evidence-limit and counterexample protocol

The Review answerer and checker must enumerate material universal, absolute and comparative claims such
as all/every, never/maximum and faster/twice, then test the population, range, baseline and comparison
needed to support each one. Finding one contradiction does not discharge another material claim.

For code counterexamples, they must trace the concrete example through the supplied call-site argument
order, function parameter order and branch condition before stating the return value. They may not invent
execution or substitute an intuitive result for the supplied definitions.

These instructions are case-agnostic. They may not contain a case ID, fixture/project name, frozen
number, expected phrase, vulnerability, model name or candidate-specific branch.

### 3. Type-preserving read-only Agent analysis

The Agent planner's read-only answer and grounding review must derive requested formulas and
transformations from the stated input/output types and current source. For numeric scalar parameters it
must preserve scalar arithmetic and operand order, verify coefficients or inverse relationships, and
explain the specific current operator/coefficient that must change. It may not merely repeat the current
formula or substitute collection/string operations.

This is a generic reasoning instruction, not an application answer key. The application continues to
enforce read-only authority and separately projects receipts; model prose cannot claim an inspection,
change or test that the application did not record.

### 4. Exact failed-check repair context

The existing trusted planner-progress projection must surface the bounded failed checks from the current
fixed-suite receipt: test ID, expected value, actual value or evaluation error, and the suite/workspace
bindings already retained by the application. It must contain no host path, evaluator instruction,
future receipt, hidden expected source code or authority.

During repair, the planner must preserve declared parameter types and operand order, explain its intended
semantic correction in the plan summary, change bytes before rerunning a known-failed suite, and rerun
only the exact same approved suite. The one existing protocol-correction call, one repair continuation,
same total deadline and cumulative budgets remain unchanged. No new retry loop is introduced.

## Required deterministic proof before inference

- Freeze the criteria in a dedicated commit before implementation.
- Review schema/parser tests accept only the unconditional shape, exact accepted answer/citation echo and
  one corrected-then-exactly-accepted sequence; they reject changed accepted bytes, second corrections,
  unknown keys, malformed/unselected citations, prose fallback and deadline/output-limit violations.
- Actual provider-wire tests prove the same exact schema reaches all three candidates without a candidate
  branch and that the legacy conditional fields are absent.
- Generic Review prompt tests prove exhaustive quantifier/baseline/sample checks and exact code-path
  tracing are present while frozen case answers and candidate names are absent.
- Agent wire tests prove read-only type/coefficient derivation and repair type preservation reach both
  initial and grounding/repair calls without case answers.
- Planner-progress tests prove failed-check details come only from a verified current receipt, remain
  bounded and reject malformed, stale, duplicated or cross-scope data.
- Existing authority, read-only, repair-budget, same-suite, browser-witness, lifecycle and publication
  regressions remain green.
- The complete repository suite, Gate 7F suite, native/runtime tests, roadmap verifier and
  `git diff --check` pass before any model call.
- Commit the corrected source, then create and hash-pin a fresh source archive, package lock, unchanged
  case bundle, criteria, hardware plan and R15 runtime seal.
- Run a fresh actual Control regression, all 12 model-free controls and a real-browser witness against
  that exact source/runtime with zero model calls, protected-data reads or production changes.

Any deterministic, seal, control, browser or publication failure pauses the campaign. Correct the method
prospectively, retain the failed evidence and resume only from the first provably unconsumed identity if
the frozen continuation rules establish exact equivalence. Never restart models against a known-broken
test or discard a valid completed prefix.

## Required fresh proof after inference

- Execute all 360 planned attempts from fresh candidate stages, one large Home model resident at a time.
- Retain every answer/checker/planner/correction output, actual receipt and browser/journey observation.
- Stop and classify infrastructure faults separately from model outputs before consuming another identity.
- Freeze candidate-blind semantic decisions for all checks before unblinding and publish every failure,
  blocked row and indeterminate row without evaluator-filled text.
- Apply the unchanged whole-application role threshold. Product qualification passes only if every one
  of the five functions has at least one eligible candidate route.
- Verify exact result/source/runtime/lease pins, complete Home export, Control drain, zero owned residency
  or processes, restored GPU limits, retired owned tasks, stable production listeners, no protected-data
  read and no production-route change for every arm.

## Environment, exclusions, rollback and human boundary

The runtime remains M1's bounded disposable JavaScript and explicitly selected synthetic evidence
envelope. No unrestricted terminal, package manager, Git publication by the product, deployment,
network, desktop control, connector, private conversation or protected store is added. PostgreSQL and
LangGraph retain their existing product authority roles.

Stop and retain evidence on source/runtime/case drift, candidate or case-specific code, denominator or
threshold change, unbound browser evidence, repeated uncertain effect, protected-data access, production
change, critical failure or cleanup failure. Rollback removes only R15-owned disposable runtime/effects
and preserves predecessor configuration, immutable evidence and later user work.

No human test is needed before deterministic and model qualification. If and only if fresh R15 evidence
provides qualifying routes for all five M1 functions, expose the already bounded M1 customer trial for
the steward's actual judgment. Passing that trial completes only M1; all 17 capability families and
M2-M5 remain on the roadmap.
