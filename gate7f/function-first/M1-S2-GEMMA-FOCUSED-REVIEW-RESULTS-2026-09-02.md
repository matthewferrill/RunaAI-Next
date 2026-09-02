# Gemma focused Review result — 2026-09-02

Status: focused model/contract qualification passed; whole application and product remain unqualified.

## Decision

Gemma 4 26B A4B is accepted as the single candidate for the bounded M1 Review model role under the corrected unconditional checker contract. No second model or model pool is needed for this Review role based on the eight agreed scenarios.

This decision does not qualify the separate Agent role, browser/UI journey, production routing, statistical reliability, or the complete Runa product.

## Actual-system scope

- Operator: Omen (`DESKTOP-OMEN`)
- Control: actual Windows Control evidence plus the established Control WSL transit
- Inference: Home (`RUNA-HOME`) LM Studio 0.4.21 / llama.cpp Vulkan AVX2 2.28.2
- Model: `gemma-4-26b-a4b-it-qat`
- Artifact SHA-256: `3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d`
- Source commit tested: `33b0f3068cc35cb7969148b1578cd107ab440197`
- Final checker runner SHA-256: `a6ebe15fe0df712d61ea9d346aa7c529a953a2e2d9e988e8470bfc2e847e7d29`
- Frozen Review cases: `review-01` through `review-08`, once each
- Mock qualification evidence: none

The source commit is the pre-publication repository base recorded by the run. The runner SHA-256 binds the exact executable checker contract used for qualification; the matching application contract changes are published by the subsequent evidence commit and are not represented as a production deployment.

## Results

### Review answer generation

Run `focused-review-20260902-f17e80070418` completed 8/8 actual model requests with HTTP 200 and the expected model identity. Direct semantic inspection of the retained answers found all eight correct:

1. Reversed shipping arguments and a valid counterexample.
2. The 72-hour policy versus 96-hour implementation contradiction and lack of an exception.
3. The v4 per-dispatch policy superseding the v3 weekly runbook.
4. Path traversal, the authentication/authorization distinction, and resolved containment remediation.
5. The observed 8-second maximum contradiction, absent speed baseline, and one-machine population limit.
6. Completion recorded before executor success and the resulting failed/retryable state error.
7. The pasted receipt is not execution evidence and `isEven` identifies odd values.
8. Rounding correctness is unknown without the pricing implementation or contract.

### Final simplified checker

Run `focused-review-checker-20260902-cb6e5785b5af` used the actual strict unconditional schema with the unambiguous `accept`/`revise` action:

- 8/8 HTTP 200
- 8/8 valid closed four-field objects
- 8/8 `accept`
- 8/8 nonempty reasons and final answers
- 8/8 citations limited to selected evidence
- 0 nullable branch fields
- 0 unsupported execution claims
- 0 semantic checker errors
- 0 infrastructure or lifecycle errors

The application retains its original answer and citations on `accept`; model echo formatting cannot mutate accepted output. A `revise` decision still requires a complete selected-source replacement and at most one recheck.

## Lifecycle and safety result

Each actual run began from a fresh three-host receipt with zero loaded model instances. Every run unloaded its exact owned Gemma instance, verified zero final residency, restored both Quadro RTX 6000 power limits to 260 W, changed no production routing, and read no protected data.

## Method failures and disposition

No method failure was scored against Gemma.

- The first readiness command incorrectly assumed `powershell.exe` was on Control WSL's Linux `PATH`.
- The corrected ad hoc command then used PowerShell's reserved `$HOME` name case-insensitively.
- The first successful model run covered Review answer generation but not the checker that had the historical nullable-field failure.
- The first checker contract used ambiguous `correct`, which Gemma interpreted as "the answer is correct," and exact citation-order echo created a non-semantic failure surface.
- A rechecker publication omitted its input-run identifier due a receipt conditional; the final runner corrects the binding. The retained response remains diagnostic only.

The full root causes and corrections are retained in the three accompanying RCA records. None of those failed operations changes the eight-case final denominator.

## Evidence index

- Answer run: `focused-review-20260902-f17e80070418.json`, SHA-256 `002f2af561750178b915906068dc473e22358cf79fc3c84badb7c501092bb688`
- Initial checker diagnostic: `focused-review-checker-20260902-5aea5dacaf28.json`, SHA-256 `305bd50930ef48a5206dcffd05e64e7f59c0d31f560e464b83d12ce3c6b75586`
- Conditional rechecker diagnostic: `focused-review-rechecker-20260902-5fdd6df3689f.json`, SHA-256 `d96a49d112082f6868da50d1dbda98aa73016e0aa63e58b2b44b18338f1dfa8e`
- Final checker run: `focused-review-checker-20260902-cb6e5785b5af.json`, SHA-256 `e849a9aa1208c4435f6192e8de2e75fd6325f029d3c8dc974a6eeb3da33f8bdf`
- Final readiness: `focused-review-final-readiness-20260902.json`, SHA-256 `04251d7255f584c1e0efca7dbaa525ff9eed143824ef38ddc5eb9947894f3cdf`
- Independent static review: `M1-S2-GEMMA-FOCUSED-REVIEW-INDEPENDENT-REVIEW-2026-09-02.md`, disposition `GO`, no P0/P1 blocker

## Verification performed

- PowerShell parser checks for both Omen orchestrators
- reserved `$HOME`/`$home`/`$CODEX_HOME` variable guard
- `node --check` for the actual Home runner
- create-only Omen and Home evidence publication
- actual Omen -> Control -> Home readiness and model lifecycle
- actual eight-case answer and final checker calls
- post-run zero-residency and 260 W restoration checks

Mock suites and the prior 120-attempt browser campaign were deliberately not rerun.
