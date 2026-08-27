# Final qualification design freeze

This is a synthetic qualification, not production promotion. The authorization and role thresholds
remain those committed before development. Original v1/v2 source, seals and raw runs are preserved.
No acceptance answer or rubric was used to tune the provider adapter. Independent acceptance content
was frozen first; its three shared-file byte pins were corrected for verified CRLF/LF differences
without changing a case, expectation, grader or original sealed file.

## Development findings and selected common adapter

Both candidates completed the same 42 initial protocol probes. Both read the simple supplied state
with either one or two system messages, returned native tool calls, and consumed tool results.
Therefore, dropping a second system message is not established as the cause of the old state failures.
These are development probes, not held-out role scores.

The first full agent schema failed before generation with a grammar-initialization HTTP 400. Removing
the conditional root union did not resolve it. The subsequent paired test changed only large string
`maxLength` values in the decoder schema: the original remained rejected and the adjusted schema
produced nine responses on each model. Application parsing and limits remain unchanged. This matches
the class of grammar repetition failures reported upstream; it does not establish the exact upstream
commit in the installed vendor runtime:

- https://github.com/ggml-org/llama.cpp/issues/26596
- https://github.com/ggml-org/llama.cpp/issues/25923
- https://lmstudio.ai/docs/developer/openai-compat/structured-output

The shared adapter uses one consolidated trusted system message, the same ordinary instructions,
the same typed response schema and the documented `/v1/chat/completions` endpoint for both candidates.
No candidate-specific prompt patches, answer repair, retry or hidden selection are permitted.
Decoder constraints provide structure; the unchanged strict parser checks conditional fields and
application bounds. Native tool calls remain separate from prose. Trusted state/receipts remain
separate from untrusted tool contents. Reasoning is disabled where supported (Gemma); Qwen exposes
no reasoning switch. Temperature is zero, context 32768, text/native output caps 1024 and agent cap1536.

## Exact workload

Each model receives 256 requests:

1. 117 fresh held-out inference requests: 36 cases, three attempts, including three genuine follow-ups.
2. Eight development integration requests: read-only, exact manual approval, preapproved exact change,
   and out-of-scope denial. Actual proposals cross the deterministic grant boundary; actual synthetic
   receipts and inspected content return to the model. No real files or generated code execute.
3. 131 endurance requests across 120 slots over at least 60 minutes, paced every 30 seconds. Eleven
   slots have two concurrent requests; all others are single requests. The fixed workload includes
   conversation corrections, drafting, structured proposals, native requests and 600-row long context.

The soak is warm because it follows functional tests. Cold loading and first-request timing are
captured in the preceding acceptance phase. This is a paced one-hour endurance check, not saturation,
production SLO, or full multi-user capacity proof. v1 does not return the v0 token/s or TTFT fields;
report measured client latency and token counts, never invented model-internal timing.

One candidate is resident at a time, with exact artifact/runtime/template checks and owned-instance
cleanup. Five-second telemetry, a 30-second evidence-gap ceiling, 8 GiB free-memory floor, GPU<85C,
120-second request deadlines and a two-hour arm cap remain mandatory. Existing BGE/service state
is not changed. Shared endpoint traffic is not fully instrumented; no exclusive-traffic attestation
is claimed. The model fixture is synthetic and no production route is redirected.

All raw requests, outputs, errors, source/runtime bindings and telemetry are retained in new task-owned
directories. External run/package seals bind exact bytes. Independent mutation tests bind identity,
template, residency, observed file hashes, response normalization, budgets, timing, telemetry and
cleanup. Only declared two-lane groups may change internal arrival order; group barriers remain exact.

## Review and disposition

Independent review reproduced and closed: outside-task synthetic changes, stale pending authorization
after a denial, a concurrent-grant receipt-settlement race, incomplete provenance checks, and a timer
logging failure that could escape cleanup. These are qualification-layer corrections beside frozen
code, not claims that production Agent Mode is deployed or arbitrary generated code is safe.

The evaluator will judge model-anonymized responses against the already frozen semantic rubric.
Application containment cannot erase a model failure. Role thresholds are unchanged, and neither
model is selected for a role merely because it is the better of two unqualified candidates.
Any later model/prompt change requires a new sealed acceptance run, not rescoring this one.
