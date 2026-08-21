# Gate 1 — disposable read-only chat/research slice

Status: code-review remediation is implemented and green; refreshed evidence awaits steward
acceptance and protected review. The branch is not merged. Qwen3.6 deliberate review and the existing
live BGE endpoint remain explicitly deferred. See `GATE1-RESULTS-2026-08-20.md` and
`GATE1-CODE-REVIEW-REMEDIATION-2026-08-21.md`.

## Boundary

This is a synthetic-only proof of the smallest RunaAI answer path. It accepts a typed participant,
project, thread, lane, question, and budget; performs deterministic preflight checks; retrieves only
same-project synthetic records; validates active PostgreSQL truth; uses Qdrant as a rebuildable derived
index; optionally reranks explicit windows; invokes a bounded provider through Mastra; returns typed
citations and completion state; and commits one idempotent turn through a LangGraph PostgreSQL
checkpoint.

It has no governed tools or effects. It does not open a legacy store, copy a conversation, read a
protected value, change production, download a model, or start a persistent service. Retrieved text
that contains authority-changing or tool-invocation instructions is replaced with a non-content
placeholder before embedding and withheld before reranking or answer generation.

## Components

- `contracts.mjs` — strict request and response envelopes.
- `content-policy.mjs` — deterministic pre-model authority-instruction veto and safe index placeholder.
- `core.mjs` — preflight, scoped retrieval, research denominator, active-source veto, citations,
  honest misses, one total request deadline, output ceilings, and effects-empty enforcement.
- `workflow.mjs` — LangGraph checkpoint, restart, and duplicate-request behavior.
- `adapters/` — memory test doubles plus PostgreSQL request-keyed single-flight, Qdrant/embedding,
  complete batched windowed-reranking, and Mastra provider adapters.
- `telemetry.mjs` — allowlisted OpenTelemetry attributes and pseudonymized identifiers.
- `run-integration.mjs` — disposable real-stack composition and fresh-process restart test.
- `run-model-validation.mjs` — bounded synthetic calls to an already-running private provider. It does
  not issue a model load, download, or configuration request; an existing endpoint may perform its
  normal just-in-time load while serving the bounded inference call.

## Verification

Use exact Node `22.22.0`.

```powershell
npm.cmd run test:gate1
npm.cmd run verify:gate1:integration
$env:GATE1_MODEL_BASE_URL='http://<private-provider>/v1'
$env:GATE1_FAST_MODEL_ID='qwen3-coder-30b-a3b-instruct'
npm.cmd run verify:gate1:models
```

The model command invokes only the amended ordinary chat/research role. It does not invoke Qwen3.6 or
the live BGE endpoint. Their failed diagnostic and deferral remain documented separately.

The integration runner starts only disposable loopback PostgreSQL, Qdrant, Caddy, OpenTelemetry,
provider-stub, and reranker-stub processes and stops them in `finally`. Raw run artifacts are ignored;
reviewable summaries are in `gate1/evidence/`.

## Rollback

No route is enabled and no production or legacy state depends on this branch. Stop only a disposable
runner if interrupted, confirm its loopback child processes are gone, discard its temporary run
directory, and delete the Gate 1 branch if rejected. `main`, `runa2/integration`, RunaLab, legacy
RunaAI, and every protected store remain unchanged.
