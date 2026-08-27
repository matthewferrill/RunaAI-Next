# Gate 7F-1 authorized Home operator

This is the separately authorized capture/transport layer, not a change to the five-file evaluation
seal. It contains no real agent executor and never evaluates model-generated code.

- `Download-PinnedGemma.ps1`: exact public revision, size and SHA-256; named partial file until
  verification; no overwrite of mismatched targets; no credentials or multimodal projection.
- `HOME-RUNTIME-2026-08-27.json`: read-only live inventory and exact incumbent/runtime hashes.
- `capture-contract.mjs`: residency, request, response, telemetry and exact-instance cleanup checks.
- `gguf-metadata.mjs`: bounded read of public model metadata and template, never tensor execution.
- `build-home-bundle.mjs`: verifies the original seal and copies only rendered requests, runtime
  identity, and native-Node capture sources. Expected answers and the grader are not transmitted.
- `home-runner.mjs`: Home host guard, file hashes, one model at a time, append-only observations,
  hardware telemetry, strict provider identity, bounded requests, and exact owned-instance unload.

The capture path is LM Studio's OpenAI-compatible `/api/v0/chat/completions` endpoint. It preserves
the sealed role/message array while also returning runtime, context, token rate and first-token metrics.
It does not flatten conversation history into a new prompt or use the native MCP-capable chat route.

The installed LM Studio 0.4.21+2 API entry-point source, SHA-256
`6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f`, explicitly validates
`reasoning_effort` and maps it through `mapReasoningEffortToReasoningSetting` into per-request
prediction configuration and `enableThinking`. For an arm advertising an `off` option, the capture
requests `reasoning_effort: "none"`. Unsupported values must fail the transport probe. No global
setting or template is edited. Reasoning-bearing or incomplete results are not stripped or repaired.

Each arm starts with the same separately retained, non-scoring transport probe. A probe failure leaves
the 105-case denominator untouched and cannot count as a model-quality result. Corpus responses are
captured exactly once each; no hidden retries, answer selection or post-output prompt changes occur.
Malformed model JSON is a grader input; malformed provider JSON or truncation stops the arm.

Validation before live capture: 12/12 Home operator/metadata tests; full repository 492/492 across
474 subtests; original seal unchanged and passing. The initial host-refusal check also rejected local
execution before any network call. One task-owned slow read-only source-inspection process was stopped
after a bounded literal search supplied the result; no model or service was stopped.

Primary API references checked 2026-08-27:

- https://lmstudio.ai/docs/developer/rest/endpoints
- https://lmstudio.ai/docs/developer/rest/load
- https://lmstudio.ai/docs/developer/rest/list
- https://lmstudio.ai/docs/developer/rest/unload
