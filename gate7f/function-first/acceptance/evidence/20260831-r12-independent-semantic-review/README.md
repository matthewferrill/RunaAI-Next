# R12 independent semantic review evidence

This directory publishes the immutable summary and hash bindings for the independent review of the
360-row R12 candidate-blind worksheet. The reviewer completed and hashed all row-level semantic
decisions before resolving the blinded rows back to candidate identities. The review used the frozen
R12 case bundle, rubric and 22/24 per-role threshold; it did not change a prompt, answer, candidate,
denominator, runtime seal or product route.

`role-scorecards.json` is the compact, committed scorecard. `review-manifest.json` binds it to the full
row-level decisions, recomputed campaign grade, frozen input manifest, worksheet and 12/12 model-free
controls. The full attempt evidence remains in the named retained artifact paths because the campaign
grade alone is about 3.9 MB.

The disposition is negative for an all-five-function route. Chat, Research and Code have at least one
qualifying candidate; Agent and Review do not. Ten attempts also retain functional/browser
indeterminacy from their captured observations. Semantic review does not manufacture missing dispatch,
drain, acknowledgement, or journey evidence. Product qualification and customer-trial readiness remain
false, and no production route was selected or promoted.
