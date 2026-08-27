# Qualification evidence mutation-test checklist

Independent review design, 2026-08-27. This is a proposed negative-test contract for the new
qualification verifier, not a change to v1/v2 and not a claim that the old evidence was tampered with.
Implement against the root agent's verifier API once fixed. Use hand-authored synthetic fixtures;
do not inspect or tune against fresh acceptance answers.

## Trust roots

The verifier needs independently supplied expected pins, not only mutually agreeing fields inside
the capture: sealed evaluation/source/package digest; exact manifest file set and bytes; per-candidate
artifact/runtime/template identifiers; frozen request renderer/policy/schedule; and all allowed
model-specific serialization differences. A hash inside an untrusted log does not authenticate itself.

Report validation establishes consistency against these roots and the trusted operator capture. It
does not cryptographically attest that remote hardware executed inference; do not overstate it.

## Mutations that must fail closed

| Layer | Deliberate mutation | Required outcome |
|---|---|---|
| Source/package | Replace source commit, package hash, bundle hash or renderer digest; remove/add a manifest file; allow an empty manifest | Capture not qualified; no silently accepted subset |
| Filesystem boundary | `../`, absolute path, sibling-prefix path, duplicate canonical path or reparse escape in manifest | Reject before hashing/loading; no out-of-bound read |
| Artifact identity | Change artifact SHA/bytes/model ID/quantization/architecture; swap candidates; mix artifacts within arm | Reject, even if corresponding observation labels are altered consistently |
| Runtime | Change runtime version, binary hash, context, reasoning mode, speculation or endpoint from frozen policy | Reject or clearly classified diagnostic-only variant, never acceptance pass |
| Template/config | Mutate GGUF template, load echoed template or exact recorded resident config; change only config fingerprint | Recompute and reject mismatch; do not merely compare repeated fingerprints |
| Package versus wire | Change one request's role/content/order/max tokens/temperature/tools/schema/tool choice | Reject unless it is the explicitly frozen model-specific serialization |
| Denominator | Missing/duplicate/unknown case-attempt ID; unrecorded provider failure; extra selected best-of response | Reject complete/eligible status; retain scheduled denominator and reason |
| Ordering/concurrency | Response before matching request; duplicate response; unexpected model residency; post-cleanup request | Reject invalid sequence; allow only the declared concurrency schedule |
| Wire versus observation | Change text/tool call/finish reason/usage/timing in normalized observation only | Recompute from raw envelope; reject mismatch |
| Tool provenance | Invent tool ID/name/arguments, join wrong tool response, omit actual assistant call, replace raw call by repaired content | Reject; expose malformed output as the original failed attempt |
| Scope/effect | Substitute grant or decision, widen path/arguments, stale/revoked grant, mismatched actual synthetic receipt | Reject continuation's authoritative state; no fabricated effect |
| Result | Flip failed/partial capture to passed; mismatch candidate/attempt count/cleanup; remove failure event | Reject complete/eligible status |
| Cleanup | Omit owned unload proof; leave owned instance resident; unknown concurrent instance; claim cleanup with only a boolean | Reject qualified completion; preserve the unresolved ownership condition |
| Hardware | Missing/nonfinite/invalid samples, threshold violation, monitor failure, inconsistent before/after identities | Reject runtime boundary success; report missing evidence separately from model quality |
| Metrics | Negative/nonfinite token or timing values; modified TTFT/performance row; inconsistent event/request IDs | Reject performance summary or capture as specified before run; never invent unavailable metrics |

## Positive controls

- A complete valid fixture verifies, including legitimate same-model concurrency if allowed.
- Canonical JSON object key order changes alone are harmless when canonical comparison is intended;
  message array order is never harmless. Raw evidence byte hashes remain exact-byte hashes.
- Native assistant tool-only replies may omit content; validated tool calls remain distinct from prose.
- A malformed model answer is a retained quality failure, not an absent observation or forged success.
- A recorded provider rejection in diagnostics is a retained integration finding, not a model pass.
- A genuine cutoff remains in the denominator. No automatic repair/retry erases the original response.
- A replayed receipt returns the same historical effect, not a new synthetic mutation.
- A final result can truthfully show capture complete but model-role ineligible.

## Dynamic continuations

Acceptance that continues after an actual inert tool step cannot compare only against a static final
prompt. Reconstruct the continuation from its frozen initial request, actual prior model response,
deterministic policy decision and synthetic executor receipt. Every assistant call and tool result must
link by the recorded ID/function/arguments. If an adapter normalizes JSON-string arguments to objects,
that deterministic transformation must be frozen and tested; it must not rewrite their meaning.

The grader must keep three separate facts: model proposal correctness, application containment, and
receipt-grounded final explanation. A refused malicious proposal is not an acceptable model proposal
merely because the application prevented its effect.

## API design recommendation

Expose one side-effect-free verifier entry point with capture input and external expected pins. It
should return a validated normalized capture or throw a stable error code before grading. Keep raw
evidence immutable. Separate semantic grading from provenance, and infrastructure completeness from
model eligibility. Tests should make one mutation at a time and assert the specific rejected binding.

The root operator remains the sole host/model operator. No host access, model inference or changes to
the original sealed verifier were needed to design this checklist.
