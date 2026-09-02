# Five-function model qualification decision — 2026-09-02

Status: model-function selection complete; application release and product acceptance remain open.

## Decision

No further LLM qualification campaign is required for Chat, Research, Code, Agent, or Review on the currently selected Gemma artifact and bounded M1 role contracts.

The immutable R13 actual-system campaign already qualified Gemma for Chat, Research, Code, and Agent. The later R15 operator, browser, timeout, publication, and harness failures did not invalidate those completed R13 model results. The focused actual-system Review qualification on 2026-09-02 closed the only remaining model-role gap.

| Function | Qualifying evidence | Decision |
|---|---|---|
| Chat | R13 Gemma 24/24 | Qualified; no retest |
| Research | R13 Gemma 23/24; Coder and Qwen3.6 also 24/24 | Gemma qualified; no retest |
| Code | R13 Gemma 24/24; all three candidates qualified | Gemma qualified; no retest |
| Agent | R13 Gemma 24/24 with required actual application/browser checkpoints | Qualified; no retest |
| Review | Focused Gemma: 8/8 semantic answers and 8/8 final `accept` checker decisions under the corrected unconditional contract | Qualified for the bounded Review role; no further campaign |

R13 bound all 360 candidate attempts to source, runtime, case bundle, exclusive Home leases, actual application/browser checkpoints, 12/12 shared controls, independent candidate-blind semantic review, exact cleanup, unchanged production routing, and no protected-data access. Gemma's R13 scores were 24/24 Chat, 23/24 Research, 24/24 Code, and 24/24 Agent. Those are completed evidence, not planned or mock-only results.

The Review correction changes the shared evidence-checker action vocabulary from ambiguous `correct` to `revise` and preserves application-owned output on `accept`. The existing R13 Research semantic qualification remains valid; the current focused actual-model evidence separately proves Gemma follows the simplified unconditional checker shape. This is sufficient for model selection and does not justify another full Research campaign.

## One-model conclusion

Gemma may be selected as the single model candidate for all five bounded M1 functions. Coder remains an optional stronger Research alternative by score, but model pooling is not required because Gemma independently met every role threshold after the focused Review correction.

## What is still open

The completed model-function decision is not a claim that the exact current application build is released or that the product is complete. Remaining work is application/release work:

- reconcile and seal the exact current application source;
- run the actual current application acceptance journey on Omen, Control, and Home without a mock qualification layer;
- configure and verify production routing only through its separate approval/deployment boundary;
- complete the bounded customer trial and broader roadmap.

Those steps must reuse the qualified Gemma selection. They must not start another model-scoring campaign unless the Gemma artifact, inference settings, role prompt, checker semantics, or frozen functional contract materially changes, or an actual production defect supplies new evidence that specifically challenges the qualification.

## Evidence authority

- `gate7f/function-first/M1-S2-R13-INDEPENDENT-SEMANTIC-RESULTS-2026-09-01.md`
- `gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-RESULTS-2026-09-02.md`
- `gate7f/function-first/M1-S2-GEMMA-FOCUSED-REVIEW-INDEPENDENT-REVIEW-2026-09-02.md`
