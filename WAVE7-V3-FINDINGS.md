# WAVE 7 v3 — corrected provider-boundary findings

This report supersedes the withdrawn Wave 7 report for current conclusions. It is graded only against
`WAVE7-V3-PREREGISTRATION.md` and the sealed v3 harness. Wave 7 v1 remains `NOT_DECIDABLE` because its
wire logs were absent from the preserved source. Wave 7 v2 remains `NOT_DECIDABLE` because five
kill-before records had no wire hash. Neither is pooled with v3.

## Evidence disposition

- 97 execution records: one warming call, five controls, and 91 adversarial runs.
- 97 unique wire logs; every recorded SHA-256 recomputed and matched.
- 97 attributable `proxy-ready` records with matching run nonce, mode, port, and process.
- All five `C.before` logs contain proxy startup evidence and zero chat calls.
- Controls passed 5/5; 96 runs graded; zero environment exclusions.
- The complete port range was released after execution.

The deed for this wave is the hash-bound wire log. Answer text is supporting evidence only.

## Verdicts

| Invariant | Verdict | Rate | What failed |
|---|---:|---:|---|
| I-7D | **VIOLATED** | 4/30 dependency runs | Four truncated responses produced an answer without a usable completed provider response. |
| I-7I | **VIOLATED** | 3/21 input runs | All three oversized prompts crossed the provider boundary before rejection. |
| I-7T | **VIOLATED** | 10/91 adversarial runs | Five partial-response runs generated more than once; five timeout runs exceeded the cap. |
| I-7X | **NO-MECHANISM** | 5/5 changed-version runs | The response-declared model changed and execution continued; source inspection found no equality gate. |

These are per-run rates within the preregistered denominator. A run can violate more than one property,
so category totals must not be added as though they were disjoint.

## Dependency honesty: one narrow failure, measured correctly

The partial-response proxy returns a truncated body and strips `finish_reason`. Four of five trials
returned an answer even though the wire showed no usable completed response. Those four are I-7D
violations. The fifth did not answer; it made two provider generations and reached the 140-second
harness cap. It violates I-7T but is not counted as fabricated success.

Unavailable, slow, malformed-response, changed-version, and recovers-mid-operation produced no I-7D
violations. The dependency denominator is therefore 4/30, not 4/96 and not the withdrawn 5/30.

## Bounds and generation multiplicity

- `B.oversized`: 3/3 inputs were transmitted before the provider returned rejection.
- `A.partial-response`: 5/5 runs made multiple completed generations for one logical turn.
- `C.timeout`: 5/5 runs reached the preregistered cap.
- Unbounded observations total 6/96: the five timeout runs plus the one partial-response run that hit
  the harness cap. The unique I-7T violation count remains 10 because that partial-response run is
  already one of the five generation-multiplicity violations.

## Endpoint identity

The changed-version proxy rewrote the response `model` to `some-other-model-v9`; execution continued
5/5. The installed `@ai-sdk/openai-compatible` 3.0.31 response schema accepts a nullable `model`, and
provider-utils maps it to response metadata. The generation path surfaces metadata but does not compare
the response-declared model with the requested model. The Wave 7 child prints answer and finish reason
and contains no identity comparison. This satisfies the preregistered source-inspection half of I-7X.

Source artifacts inspected:

| Artifact | SHA-256 |
|---|---|
| `node_modules/@ai-sdk/openai-compatible/dist/index.js` | `cb11581d85ba0d8ef898254cc02dca60e410e6d6749d1b0460115ab49cef2e98` |
| `node_modules/@ai-sdk/provider-utils/dist/index.js` | `eb28d74679151f946635a23ae083ae62c2abe385b63b9fd9b1c5cffeff5389de` |
| `probes/wave7/w7-ask.mjs` | `98883336df146d06758e99dbde50590681d5321190d3e6a26d4626bdac999ae8` |

`NO-MECHANISM` means this assurance is absent; it does not imply that a present safeguard failed.

## Remaining scope limit

V3 establishes provider-boundary behavior for this pinned local stack and model endpoint. It does not
establish production identity, authorization, billing, or availability guarantees, and it does not
generalize to other provider adapters without rerunning their boundary tests.
