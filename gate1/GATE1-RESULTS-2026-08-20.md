# Gate 1 results — 2026-08-20

Status: **implementation evidence assembled; approval blocked by the deliberate-review model role.**
This is not a production-readiness or migration-completion claim.

## What is green

- Focused deterministic suite: **21/21 passed**. It maps all 18 frozen parity cases, repeats every
  model-influenced hard behavior three times, and adds explicit provider-output-limit and telemetry
  canary checks plus a stale-content-digest veto.
- Disposable selected-stack integration: **22/22 checks passed** using Mastra/AI SDK, Caddy,
  LangGraph/PostgreSQL checkpointing, authoritative PostgreSQL records, Qdrant derived vectors, a
  windowed BGE-compatible reranker adapter, and OpenTelemetry.
- Restart/duplicate: a fresh process returned the committed response without replay; one request
  produced exactly one request row and one turn. The retained run had 14 requests, 14 turns, and 42
  checkpoints.
- Derived state: PostgreSQL and Qdrant active source/section counts and digests aligned before and
  after a revoked stale vector was introduced and rebuilt.
- Failure states: honest empty, dependency unavailable, timeout, unknown citation, revoked source,
  unknown command, protected path, and cross-project denial were explicit.
- Retrieved instruction boundary: hostile authority/tool text was replaced with a non-content
  placeholder before embedding, withheld before reranking and answer generation, and recorded as
  `retrieved-instruction-denied`. The provider wire contained neither hostile text nor its canary.
- Telemetry: allowlisted spans were retained, synthetic identifiers were pseudonymized, and prohibited
  trace canaries were absent.
- Cleanup: Caddy, PostgreSQL, Qdrant, collector, provider, slow-provider, and reranker child processes
  all reported stopped after the passing run.
- Repository regression: the combined inherited plus Gate 1 Node suite passed **35/35** in repository-
  owner context. The full frozen Gate 0 verifier also passed: 10/10 seals, all 12 pinned legacy focused
  suites at legacy commit `71ce985`, exact Node 22.22.0, and the 18-case corpus checks.
- Dependency audit: npm still reports two low entries for the one accepted
  `GHSA-866g-f22w-33x8` dependency path. The installed aliased provider utility is 3.0.30; a registry
  check still found 3.0.32 as the newest published 3.x, while the advisory now marks versions through
  3.0.97 affected. No audit fix or dependency substitution was applied.

Reviewable machine evidence:

- `evidence/STUB-INTEGRATION-RESULTS.json`
- `evidence/MODEL-VALIDATION-RESULTS.json`

## Model result and blocker

The approved roster was exercised against the already-running private RUNA-HOME endpoint using only
synthetic Gate 1 data. No model was downloaded, explicitly loaded, reconfigured, or left behind as a
new service.

| Role | Model | Result at the frozen 30-second request ceiling |
|---|---|---|
| Ordinary chat/research | Qwen3 Coder 30B-A3B | **12/12 hard and 12/12 quality passed** across four cases repeated three times. |
| Deliberate review | Qwen3.6 27B MTP | **0/3 passed**; all three clean-source requests ended in the typed timeout state. |

The combined retained report is therefore 12/15 hard, 12/15 quality (80%), below the 100% hard and
90% quality gates. Earlier diagnostic runs exposed and corrected two harness issues: Mastra generation
settings had been placed at the wrong option level, and an artificial 256-token ceiling ended the
review output by length. With those fixed, Qwen3.6 still timed out 3/3 at the unchanged deadline.

The cause is a provider-path mismatch, not an untested-model question. The lab selected Qwen3.6 using
LM Studio's native `/api/v1/chat` reasoning-off control. Gate 1 uses the approved AI SDK/OpenAI-compatible
path; LM Studio's documented chat-completions payload does not expose that native reasoning control.
The prompt directive that worked for earlier Qwen3 tool tests did not make Qwen3.6 complete this Gate 1
case within 30 seconds.

This is a hard failure for the deliberate-review role and blocks Gate 1 approval **as currently
scoped**. It must not be hidden by averaging, increasing the deadline, or claiming the earlier model
matrix proves this adapter path.

Runtime documentation checked for this conclusion:

- `https://lmstudio.ai/docs/developer/openai-compat/chat-completions`
- `https://lmstudio.ai/docs/developer/rest/chat`

## Separate live dependency limitation

The windowed reranker adapter passed the disposable real-stack test. A bounded synthetic request to
the existing private BGE endpoint timed out before model validation, so the retained model report says
`not-validated` for that live service. This does not invalidate the disposable adapter proof or the
explicit reranker-degraded path, but it blocks a claim that the existing live reranker is currently
ready.

## Decision options

1. **Defer the deliberate-review role from Gate 1 (recommended).** Accept only the green ordinary
   read-only chat/research slice, keep hostile retrieved instructions behind the deterministic veto,
   and reopen Qwen3.6 provider integration behind a new reviewed contract. This requires an explicit
   Gate 0 scope amendment before Gate 1 can be called green.
2. Build and bake off a separate LM Studio native provider adapter so Mastra can preserve the selected
   review model's native reasoning control. This adds architecture and test work and is not authorized
   by the current approved provider stack.
3. Raise the request deadline above 30 seconds. This weakens the frozen interactive contract and is not
   recommended; the 60-second diagnostic was rejected by the existing schema before any provider call.

The existing Qwen Coder model is not a safe silent substitute for deliberate review: the sealed model
matrix passed only 3/8 review cases for that model. Qwen3.6 should be deferred or integrated correctly,
not replaced by an unqualified fallback.

## Rollback evidence

No legacy or protected store was opened and no production route was enabled. All passing integration
processes stopped. Rejecting the slice requires only discarding this branch and its ignored disposable
artifacts; the three source repositories and their authoritative data remain unchanged.
