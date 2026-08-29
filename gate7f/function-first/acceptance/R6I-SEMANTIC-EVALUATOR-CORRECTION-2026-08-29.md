# R6i semantic evaluator correction — 2026-08-29

## Finding

The R6h candidate runs retained the required `answer.numericResult` checks, but
the explicit independent-review contract did not enumerate them. The mechanical
fallback could decide a single-number answer while sending a multi-number answer
to independent review. That made the set of required semantic decisions depend
on the model's wording instead of being fixed before inference.

A second gap affected `citations.claimSupport`: a readable answer with no
citation, or a citation outside the selected canonical bindings, returned
`inconclusive` before an explicit independent `fail` decision could be consumed.
The absence was determinate model evidence, not missing evaluator evidence.

The first independent candidate-blind review found 15 readable numeric decisions
outside the old explicit contract (Gemma 9, Qwen3 Coder 6) and one readable Gemma
research answer with no citation. The old R6h grade remains unchanged and is not
qualification evidence.

## Prospective correction

- `answer.numericResult` is now always an independent semantic kind. Every
  affected attempt must contain an explicit decision, including simple
  single-number answers.
- The frozen expected number is represented as an expected fact. The decision
  binds the check identity, exact answer bytes, expected result, fact verdict,
  reason code, evaluator and rubric.
- A readable no-citation or non-selected-citation answer can reach a determinate
  failure only when an explicit v1 decision says `fail` with
  `expected-fact-absent`. It cannot receive a pass without canonical selected
  bindings and the required exact source quotation.
- Zero-fact semantic assertions can express an explicit readable pass or fail;
  fact-bearing assertions still require an exact verdict for every frozen fact.
- The rubric advances from `2026-08-29.r6-determinate` to
  `2026-08-29.r6i-determinate`, so an old decision bundle fails closed rather
  than silently acquiring the new meaning.

Focused evaluator and campaign tests pass. Independent dependency review found
that the change cannot alter prompts, provider request bodies, application or
native dispatch, browser capture, cases or thresholds. It changes post-capture
grading and, intentionally, final deployment eligibility.

## Preserved diagnostic run

The clean Qwen3.6 replacement diagnostic completed all 120 planned attempts with
zero not-executed slots. Its Control result is 63,909 bytes, SHA-256
`f0235962a9b1d1d3b2745ff98f6315073a0767a32f3b26d0c5b858770c9383c5`.
Home accepted the exact completion marker, unloaded both owned model instances,
restored both GPU power limits to 260 W and removed the owned scheduled task.
The final observation contained no loaded instances and no owned task
registration. Production routing was not changed.

This diagnostic may support a separately named, dual-bound offline comparison
over immutable raw records. It cannot qualify the candidates under the current
R6 criteria because the corrected evaluator and rubric did not predate those
attempts.

## R6i qualification boundary

Formal qualification therefore starts again from this corrected source:

1. archive the exact committed source and create one fresh common runtime seal;
2. pass all 12 model-free controls under that seal;
3. run all 360 attempts (40 cases × 3 repetitions × 3 candidates) with no subset
   replacement and the same hardware, model and browser boundaries;
4. perform one candidate-blind explicit semantic review covering every retained
   provider output and every required decision;
5. make a role-selection recommendation only from the complete R6i grade.

Until that sequence is complete, no candidate is qualified and production stays
on its existing routing.
