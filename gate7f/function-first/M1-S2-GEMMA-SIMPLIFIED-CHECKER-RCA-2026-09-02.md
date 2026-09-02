# Gemma simplified checker actual-run RCA — 2026-09-02

## Actual evidence

Actual Home checker run `focused-review-checker-20260902-5aea5dacaf28` completed all eight frozen Review scenarios with the unconditional four-field schema. All eight responses were valid JSON, contained every required field, contained no nullable branch, and made semantically safe judgments. The exact model was unloaded, zero residency was verified, and both GPUs were restored to 260 W.

Seven responses used `accept`. One used `correct` while its reason explicitly said the candidate was correct and its `finalAnswer` and citations were unchanged. The required conditional recheck, `focused-review-rechecker-20260902-5fdd6df3689f`, returned the same semantically positive no-op `correct` response. In another accepted case, Gemma preserved the same selected citations but reversed their order.

## Classification

- Review answer semantics: pass in all eight cases.
- Unconditional non-null schema production: pass in all eight cases.
- Existing application protocol: one failure from the ambiguous `correct` action and one failure from citation-order echo.
- These are application-contract usability failures exposed by the real model. They are not wrong Review conclusions, unauthorized citations, or infrastructure failures.

## Root causes

1. The enum token `correct` is linguistically ambiguous: it can mean either "the candidate is correct" or "replace/correct the candidate." Gemma demonstrably chose the first meaning twice.
2. Exact ordered citation echo asks a model to reproduce an application-owned sequence even though citation order carries no authorization or evidentiary meaning. The application already validates uniqueness and membership in selected evidence.
3. Requiring an accepted checker to echo application-owned answer/citation bytes creates a formatting failure surface without adding authority. The application can preserve the original bytes itself.

## Corrective design

1. Rename checker actions to the unambiguous enum `accept` or `revise`.
2. Keep the unconditional closed object: `verdict`, `reason`, `finalAnswer`, and `citations`; no nullable branches or optional authority fields.
3. For `accept`, validate the checker shape and that every returned citation is selected, then retain the original candidate answer and original candidate citations. The checker cannot mutate accepted output, so byte/order echo is unnecessary.
4. For `revise`, require a complete nonempty replacement and unique selected citations. Preserve the single recheck limit. The recheck must return `accept`; the application retains the exact revised answer/citations that it supplied.
5. Continue to reject malformed JSON, unknown fields, missing/foreign/duplicate citations, output limits, timeouts, second revisions, and model identity mismatch.
6. Verify this contract deterministically before one final eight-case actual Gemma checker run. Any infrastructure failure stops ungraded; a valid unsafe or semantically wrong checker response is a model failure.

## Effect on prior evidence

The completed answerer and checker outputs remain immutable evidence. They are not retroactively rescored under this correction. A fresh eight-case checker run is required for the corrected contract; the eight answer prompts are not repeated.
