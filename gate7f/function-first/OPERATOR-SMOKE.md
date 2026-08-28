# M1 actual-adapter readiness smoke (unscored)

This short check uses the **shipped** Mastra answer provider and project planner, plus
Nomic and windowed BGE adapters. It is not the 40-case functional qualification, does
not exercise project execution, and cannot stand in for a customer login test.

`operator-smoke.mjs` has three answer roles, two independently bound planner roles and
two auxiliary checks. None uses the acceptance cases. It sends no `/no_think` suffix.
The production adapter budgets are unchanged: 512 answer tokens, 1,536 planner tokens,
30-second completion deadline, 10-second auxiliary deadline, temperature zero. The
recorded HTTP request/response establishes the actual shape used by Mastra/AI SDK.

The CLI requires an exact SHA-256-pinned prospective seal. That seal names private
endpoints, exact model and loaded-instance identities, primary and embedding artifact
hashes, the separate reviewed hardware/runtime seal and every `SMOKE_SOURCE_FILES`
source digest. Hashes must match the **staged bytes**, not a different checkout's line
endings. The hardware operator independently verifies artifacts and runs the sealed
telemetry/watchdog/power/lifecycle envelope. This script does not load or unload models
or change power, services, firewall, authentication, production config or routing.

Before and after calls, the API must report exactly the sealed primary instance and
Nomic instance and no third resident model. The emitter records only synthetic request
payloads and bounded responses (no headers/credentials), in new exclusively created
`artifacts/runs/m1-smoke-*` evidence. Any failure retains the preceding evidence. It is
never rewritten as a passing qualification score. The caller/operator still owns
unload, restoration and cleanup verification.

Invocation after prospective sealing and verified residency:

```text
node gate7f/function-first/operator-smoke.mjs --seal <exact-local-seal> --seal-sha256 <exact-hash>
```

The five authoring tests use HTTP response doubles through the actual SDK and class
implementations. They validate seven correctly bound adapter calls, absence of the
text suffix, request-level reasoning control, all source pins, fail-closed residency,
and no lifecycle API. Malformed JSON is retained as bounded raw wire evidence before
the SDK rejects it. Oversized streams use one consumed branch, avoiding a cancellation
wait on an idle cloned branch. They do **not** prove a live model responded.

The malformed-response regression exposed the SDK's default raw error-object logging.
Those objects can include private prompt/response bodies. For owned standalone Agents,
the pinned Mastra1.59.0 logger primitive is set to `noopLogger`; an ignored constructor
`logger` option was tested and rejected as ineffective. Application typed errors and
existing allowlisted telemetry remain in place. The real-SDK regression asserts that
raw response objects do not reach the application console. No global console suppression
or change to the provider's error/timeout behavior is used in the implementation.

Additional auxiliary hardening requires finite vectors with unique complete input
indices and exactly one valid reranker score per requested window. A partial or
duplicated BGE response is explicitly degraded; it cannot claim full coverage. Response
byte caps now cancel the incoming stream before buffering an oversized body. Historical
window-after-32 coverage remains green; the 32-window batch size is unchanged.
