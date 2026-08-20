# Evaluation-component coverage preregistration

Sealed before the formal run. The earlier `evals-053` result is not evidence because its harness
called an API that does not exist in installed `@mastra/evals` 1.7.0 and recorded `null`.

## Question

Does the installed standard evaluation package expose a deterministic, local scorer that can
distinguish equivalent from unrelated answers through its documented scorer/run boundary?

## Fixed arms

Run five repetitions of each exact pair with `createContentSimilarityScorer`:

| Arm | Input | Output | Pass rule |
|---|---|---|---|
| identical | `Paris is the capital of France.` | same text | score exactly 1 |
| normalized | `Paris is the capital of France.` | case and whitespace variation | score at least 0.95 |
| related | `Paris is the capital of France.` | `France's capital is Paris.` | score strictly between unrelated and identical |
| unrelated | `Paris is the capital of France.` | `Saturn has many rings.` | score no more than 0.20 |

Every repetition of an arm must return the same score. The result must record package version,
scorer id, each numeric score, and the final gate. No model, network, or custom similarity function
may participate.

## Decision rule

- `selected for deterministic evaluation plumbing` only if all 20 runs and both ordering/determinism
  controls pass.
- Otherwise `rejected`; a thrown scorer, non-numeric score, nondeterminism, stuck score, or failed
  ordering is a failure.

This gate proves only the standard local evaluation surface. It does not validate an LLM-as-judge,
semantic truth grading, or the retired lexical write-claim grader.
