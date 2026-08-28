# M1-S2 conversation, selected-source, and review routing

Date: 2026-08-28. This is deterministic application evidence, not model qualification
or a complete M1 acceptance claim.

## Changes

- Ordinary writing, learning questions, security explanations, and drafts about
  actions may use the answer model without requesting an actual effect. Explicit
  protected reads and direct unavailable actions still receive safe boundaries.
- A new self-contained question does not inherit a previous project's retrieval
  requirement merely because it begins with "what" or "how". Explicit project
  references and short referential follow-ups retain grounding behavior.
- The `review` lane uses only the explicitly configured review role. It accepts
  either retained Chat or Code experience, grants no execution authority, and
  reports unavailable without another-model substitution when disabled.
- Research and review may use one through six explicitly selected source sections.
  The existing legacy workspace route is preserved. An index exposing
  `searchSelected({projectId,query,references,maximumPassages,deadlineMs})` receives
  the exact selected source identities and hashes. Out-of-selection or changed
  hashes fail before provider use. Legacy indexes retain their explicit-reference
  fallback; no whole-project search is introduced by this fallback.
- Known explicit model claims of completed execution or invented runtime receipts
  are withheld as `unverified-action-claim`, not accepted or retained as completed
  answers. Execution stamps continue to come from the application and remain
  `not-executed` for every answer route. Code comments predicting output remain
  drafts and cannot become execution receipts.

## Validation

The focused routing, context, Gate 1, Gate 2, and navigation suite passed 70/70.
The full repository test command completed successfully. New tests cover harmless
drafts, actual boundary cases, stale-topic follow-ups, exact source revisions,
selected-index failures, missing/injected sources, review in both experiences,
disabled roles, anonymous source denial, and false execution claims.

```powershell
node --test gate7f/function-first/conversation-routing.test.mjs gate7f/function-first/conversation-context.test.mjs gate1/gate1.test.mjs gate2/gate2.test.mjs gate7d/navigation.test.mjs
node --test --test-reporter=dot
```

## Limits and integration

These language-pattern checks are conservative application handling for known
cases, not a proof that arbitrary model prose is truthful. The three-model
function acceptance must measure response quality and undeclared claims separately.
Data permissions and executable capabilities do not depend on these patterns.

Composition must explicitly supply `providers.review` and the selected source
index to make those capabilities available. Tests inject deterministic providers;
they do not claim that Nomic, Qdrant, BGE, or a live review model ran here. The root
integration work owns the real selected-source pipeline and customer controls.
Concurrent-turn conflict handling and retryable failure caching remain a separate
follow-up in this same milestone.
