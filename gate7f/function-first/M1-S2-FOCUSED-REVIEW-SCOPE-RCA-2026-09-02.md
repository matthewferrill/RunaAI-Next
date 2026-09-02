# Focused Review scope correction RCA — 2026-09-02

## Finding

Actual run `focused-review-20260902-f17e80070418` successfully exercised Gemma's Review answer generation on Home for all eight frozen Review scenarios. It did not exercise the separate Review checker contract that caused the R14 nullable-field failure.

## Classification

- The eight captured answers are valid supplemental model evidence: 8/8 requests completed, all eight answers are semantically correct, and cleanup passed.
- The run is not the final simplified-checker qualification and must not be represented as such.
- This is a test-scope design error, not a Gemma failure. No failed score is assigned and no answer prompt is repeated.

## Root cause

The reduced runner interpreted "simplified Review contract" as the answerer's `answer` plus `citations` response. The accepted R15 correction actually simplified the checker response: it replaced nullable accepted/corrected branches with one unconditional object containing `verdict`, `reason`, `finalAnswer`, and `citations`.

## Corrective design

1. Reuse the eight immutable answers from the completed actual Home run; do not ask Gemma to regenerate them.
2. Make exactly eight checker calls, one per frozen Review scenario, on the actual Home runtime.
3. Send the unconditional strict checker schema used by the application. It contains no nullable fields and permits only `verdict`, `reason`, `finalAnswer`, and selected citation objects.
4. If the checker accepts an answer, independently compare the returned `finalAnswer` and ordered citations byte-for-byte with the supplied candidate values. If it corrects, retain the full correction for semantic review.
5. A transport, runtime, lifecycle, or cleanup failure stops the run ungraded and requires a new RCA before any retry. A valid but incorrect checker decision is a model result.
6. Unload the exact owned Gemma instance, verify zero residency, and restore the 260 W power policy before publishing the result.

## Qualification boundary

The final focused Review decision combines the completed eight answerer results with the eight corrected checker results. It does not claim browser/UI, production routing, statistical reliability, or whole-product qualification.
