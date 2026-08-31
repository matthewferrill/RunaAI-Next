# R12 equivalence-composed review input

This directory records the steward-directed composition of Qwen's 107-row R12
window and its exact 13-row timing completion. The original results remain
immutable and independently hash-bound.

`equivalence-audit.json` proves that only the source commit/archive and telemetry
policy seal fields differ; the selected Qwen artifact, request controls, case
bundle, evaluator, role limits, model runtime, retrieval artifacts, and native
suites are identical. `qwen-composed-result.json` preserves both execution
windows and all 120 unique attempt records in original plan order. It does not
claim one uninterrupted arm and does not claim product qualification.

`review-input-manifest.json` binds the complete three-candidate review input:
Gemma 120, Qwen3 Coder 120, and composed Qwen3.6 120. Its candidate-blind
worksheet is retained at
`artifacts/independent-semantic-r12-equivalence/review-worksheet.json` with the
synthetic raw evidence and is SHA-256 bound by the manifest. Raw requests and
model outputs are not duplicated in Git.

Current status: 360/360 rows are bound and ready for independent semantic
review. Independent review, frozen role scorecards, route disposition, product
qualification, and the customer trial remain pending.
