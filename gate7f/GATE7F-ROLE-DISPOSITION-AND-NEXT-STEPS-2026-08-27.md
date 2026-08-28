# Gate 7F role disposition and next steps

Date: 2026-08-27. Documentation follow-up to the completed qualification at `be094bd`.
The steward requested that the four-area coverage and next steps be documented. This record clarifies
the result; it does not alter the frozen evaluation or authorize a model switch, merge or new effect.

> Superseded next-work sequence, 2026-08-28: retrieve `../PRODUCT-ROADMAP.md` and
> `../roadmap/CURRENT-SLICE.md` before selecting a slice. The current authorized work is function-first
> Milestone 1 with Gemma, Qwen3 Coder and Qwen3.6, not a new two-model-only benchmark. The full roadmap
> remains required after M1. Scores and the historical publication status below are unchanged records.

## Outcome in plain language

Gemma is a promising candidate, especially for ordinary chat and the small code-drafting subset.
Neither tested model met a complete frozen role's requirements. Do not interpret "stronger candidate"
as "Gemma should replace every specialist." Choose Chat, Code, tools and research separately.

The completed comparison was **Gemma 4 26B A4B IT QAT Q4_0 versus Qwen3 Coder 30B-A3B Q6_K**.
The separate Qwen3.6 27B MTP deliberate-chat/review model was not included. Its prior lab results are
historical evidence, not a fresh comparison with Gemma or proof of current production readiness.

## Coverage and disposition

| Area | Measured result for Gemma | Disposition and remaining evidence |
|---|---|---|
| Ordinary/fast chat | 24/27 acceptable case-attempts; bounded latency and one-hour endurance completed | Prioritize as the next candidate, not production-approved. Fix constraint/calculation handling and requalify with fresh conversational cases, then human style/continuity testing. |
| Coding | 12/12 acceptable attempts on four JavaScript drafting/explanation cases | Candidate for drafting, not proof of full software development. Keep Qwen3 Coder as the incumbent/candidate; choose independently using broader code-specific tests when that capability is in scope. |
| Tools/agent proposals | Agent role 54/63 acceptable; exact contracts 15/18; fake-receipt claim in all three repetitions of one case | Not qualified. Enforce grants and truthful receipts outside the model, then retest exact calls and untrusted-content handling. Real executor access remains separately governed. |
| Research over supplied sources | Tested within the combined read-only evidence/code role, which scored 48/54 and had a critical receipt-truthfulness failure | No standalone research pass score and no live-web qualification. Give this role its own prospective source-grounding tests before selection. |
| Deliberate chat/review | Qwen3.6 was not part of this run | Keep the existing deferral explicit. If this role is reopened, resolve its retained timeout/runtime issue and run a separately scoped matched comparison; do not infer a winner now. |

Three repetitions are not three independent subject areas. The exact frozen counts, failures,
measurement limitation and immutable evidence remain in
`GATE7F-QUALIFICATION-RESULTS-2026-08-27.md` and `qualification/results/`.
The existing 4B fallback, Nomic embeddings and windowed BGE assignment are not changed by this study.

## Ordered follow-up

1. **Define independently selectable roles without changing the live route.**
   Keep Qwen3 Coder serving the existing product while preparing a versioned role-to-model contract.
   Chat and Code may use different models; they need not. Preserve the current single-model configuration
   as the compatibility/rollback path. Pin the selected model in each request and response; deny or
   visibly report an unavailable role instead of silently substituting another model.
   Success: routing tests prove identity, session/project isolation, explicit fallback behavior and no
   role selection by model-generated text. This does not load multiple models or deploy new routing.

2. **Close the shared trust and correctness gaps in the candidate workflow.**
   Extend the already-tested foundation rather than rebuilding governance. Check current grants,
   expiry, revocation, exact arguments and scope at every applicable tool boundary. Derive execution
   status only from verified application receipts; file contents and model prose cannot certify a deed.
   Add bounded calculation/constraint checks where needed without treating hidden repairs as original
   model successes. Known failures become regression tests, not fresh qualification successes.
   Success: zero unauthorized effects, accurate pending/denied/completed status, usable legitimate
   requests, and preserved restart/retry behavior. A safe rejection does not erase a bad model proposal
   or false statement; report both model behavior and application containment.

3. **Run fresh, independently reviewed qualification by role.**
   Freeze the changed workflow, inputs, separate coverage maps, scoring rules and runtime profiles
   before new answers. Correct the ambiguous source-label specification prospectively; preserve the
   original failed comparator record. Compare Gemma and Qwen3 Coder on identical applicable inputs,
   retain every attempt, and keep model identities withheld during answer adjudication.
   For the currently scoped roles, retain at least 90% acceptable and zero critical failures; exact
   scope/argument contracts require 100%, and explicit complete plans at least 90%, where applicable.
   Publish separate prospective research/code results rather than inventing scores from the old
   combined denominator. No post-result threshold relaxation or selection of only favorable cases.
   Ordinary chat need not wait for the entire autonomous coding product, but all controls relevant to
   the selected chat/read-only scope must pass.

4. **Prove the exact customer path and Home operating profile before a limited trial.**
   Exercise login, new/reopened conversations, Chat/Code switching, retained history, session renewal,
   provider loss, exact model identity and truthful execution status through the actual application.
   Keep consent, learning and participant/project boundaries unchanged across a model switch.
   If different models are selected, validate scheduling, draining, owned loading/unloading and
   recovery; do not assume both can remain resident or that NVLink pools their memory.
   Validate the intended power/context/concurrency profile: the successful 160-W one-hour run did not
   establish permanent settings, full-32K inputs or household saturation capacity.
   Success: all applicable automated lanes and rollback checks pass before the steward is asked to
   test ordinary use from Omen. Human input is needed for subjective experience/authenticator presence,
   not routine diagnostic commands.

5. **Promote only the qualified role and scope, then extend capabilities separately.**
   Under the applicable release authorization, use an exact, rollback-protected candidate release.
   Keep the predecessor and authoritative records intact; rollback must not discard new user data.
   Ordinary chat may select Gemma while Code retains Qwen3 Coder, or both may retain one model if that
   is what the evidence supports. No assignment is decided by this document.
   Broader repository editing/debugging, external tools and live web research each need their own
   implemented capability contracts and tests. Reopening Qwen3.6 review is a separate model-role
   decision, not a hidden prerequisite for the first chat improvement.

## Efficient execution and immediate next action

Prepare the role contract/shared corrections and the independent next evaluation in parallel in
separate worktrees. One operator owns Home residency; run competing model arms sequentially.
Do not repeat the completed burn-in unchanged, reopen the whole stack bakeoff, or modify protected
records to advance this work.

The immediate next implementation package should cover steps 1-2 and freeze step 3's acceptance
criteria. No human test is required for this documentation update. The first useful human check is the
bounded customer trial after automated qualification, not another manual setup/debugging sequence.

## Evidence and documentation validation

- `../MODEL-ROLE-MATRIX-FINDINGS.md`: original separate coder, deliberate-review and fallback roles.
- `../gate1/evidence/MODEL-VALIDATION-RESULTS.json`: explicit Qwen3.6 timeout-based deferral.
- `../gate6b/composition.mjs`: current Chat/Research/Code providers share one configured model ID.
- `qualification/acceptance/corpus.mjs` and `qualification/results/Candidate-A-final-aggregate.json`:
  tested cases, overlapping original roles and Gemma's unchanged scored outcomes.
- `GATE7F-QUALIFICATION-RESULTS-2026-08-27.md`: full comparison and retained source locations.

This follow-up changes Markdown only. Validation completed:

- `git diff --check`: passed.
- `node gate7f/evaluation/verify-seal.mjs`: original five-file seal passed.
- `node gate7f/evaluation/v2/seal.mjs`: original 21-file v2 seal passed.
- `node gate7f/qualification/acceptance/seal.mjs --verify`: 14-file acceptance seal passed.
- `node gate7f/qualification/initial-judgments/verify-initial-review.mjs`: both initial bundles and
  aggregates still match their retained bytes.
- The read-only completed-run reproducer exactly matches the stored publication result; full
  composition hash remains `d361293996dc7c69111f4f424f5930d1e8d1fc2d5e0b602c46d1b50a3dde917a`.
- Counts were checked against the final Gemma aggregate: 24/27 chat, 48/54 combined evidence/code,
  54/63 agent proposals, and 12 acceptable static-code attempts covering four distinct cases.
  All cited repository paths exist; no separate original research role/score was invented.

The recorded 755/755 regression result belongs to the completed implementation, not a new model
qualification or application run performed by this documentation update. No model, service, runtime
configuration, protected record or production route was changed for this follow-up.

Publication status: the environment rejected this follow-up's GitHub publication attempt pending
destination-specific disclosure approval. The clarification is being retained in a local commit;
no alternative push path is used. The previously published qualification at `be094bd` is unchanged.
