# Prospective M1 application-path readiness with existing retrieval auxiliaries

Status: prospective contract for the next sealed unscored smoke; no auxiliary model was loaded by the
three-primary readiness diagnostics. Exact Nomic verification is retained in
`evidence/20260828-nomic-pin-r1.json`:84,106,624bytes, Q4_K_M,
SHA256`d4e388894e09cf3816e8b0896d81d265b55e7a9fff9ab03fe8bf4ef5e11295ac`, from the existing LMStudio
application-bundled model directory. The registry advertises2,048 context;768-dimensional output has
not yet been reverified by an embedding call. This pin verification made no model load/inference call.
This is not a new stack bake-off or an acceptance score, and does not consume any frozen40-case task.

The next operator should run the actual `MastraAnswerProvider` and `MastraM1Planner` implementation,
plus the application's existing retrieval path. A new wire-replay framework is not required. Use a
synthetic scope and new smoke text, no protected records, no production routing or Control deployment.
Prefer existing authorized direct Control-to-Home access; a temporary bounded Omen forward is a fallback.

## Exact resource/ownership boundary

- Begin with zero loaded LM Studio instances and the two recorded Quadro RTX6000 UUIDs at original260W.
  Downloaded registry entries do not count as residency. Abort if an unowned instance is present.
- Reuse the current pinned LM Studio/Vulkan2.28.2 runtime and unchanged8412 BGE service. No package,
  model download, persistent service, global default, clock, firmware or fan changes are part of this smoke.
- Temporarily use the matched160W limits, retaining original settings; start each primary at<=45C.
- Allow exactly one pinned primary plus the pinned `text-embedding-nomic-embed-text-v1.5` instance.
  Keep all returned load instance IDs and effective configuration. Never infer ownership solely from a
  model name, and never unload all models as cleanup.
- Primary context32,768, flash attention/KV GPU offload on; the MTP candidate retains draft2/min0/
  probability0.75 and the other primaries retain MTP off. Nomic's advertised2,048 context must be verified
  fresh and its embedding inputs must fit that bound, with no silent truncation.
- Sample exact UUIDs, residency, temperatures, used VRAM, host free memory and power at a nominal5s cadence.
  Retain actual sample times/maximum gaps locally independent of SSH; abort a gap over30s. Abort at85C, less than8GiB free host RAM,
  less than1GiB free VRAM on either GPU, drift, unknown residency, lost telemetry or an existing app deadline.
- No automatic retry after an uncertain model call. A client timeout does not establish server
  cancellation; drain/cleanup only with retained ownership evidence. Never silently raise a deadline.
- Unload the owned primary and then the owned Nomic instance, verify zero residency, restore original260W,
  verify restoration, retain receipts, and remove only the completed one-off task/forward registration.

## Small real-path smoke, not function qualification

1. Use the actual answer-provider entrypoint with no `/no_think` suffix. For Qwen3.6/Gemma send explicit
   `reasoning_effort:"none"` through the versioned application config; Coder omits this control. Validate
   exact response model ID, nonempty answer, raw usage/reasoning channels, actual deadline and bounded output.
2. Exercise Nomic document/query embeddings with existing `search_document:` and `search_query:` prefixes;
   verify768 finite dimensions and correct indexes. Run one synthetic approved-source retrieval through
   Qdrant and the existing BGE window2000/overlap300/batch32 policy. Confirm citations resolve only to
   allowed sources. This checks integration, not a fresh reranker ranking contest.
3. Invoke the actual `MastraM1Planner` on a fresh tiny disposable snapshot with its real max-output1536,
   temperature0, no suffix, caller scope and app deadline. Validate the structured proposal and scope;
   model text does not authorize or prove execution. If execution is included, only the established M1
   task/executor pathway and an independently verified receipt can claim it happened.
4. Repeat the same prospective smoke contract one primary at a time. Keep every failure and all raw
   request/response, effective settings, identity, latency and hardware evidence. Do not grade any role
   merely because the endpoint returned200, and do not turn a later retry into an erased first failure.

After this preflight, the actual five-function M1 matrix remains required for all three primary
candidates. The approved retrieval stack is exercised where used; its previous selection is not reopened.
Broader product capability families remain separate milestones in `PRODUCT-ROADMAP.md`.

## Finite hardware lease, separate inference ownership

`build-smoke-lease.mjs <gemma|coder|qwen36> <20260828-smoke-CANDIDATE-rN>` freezes create-only source,
artifact/runtime/template pins and policy before model calls. `Run-HomeSmokeLease.ps1` is a one-off
Home S4U task, not a persistent service. It independently supervises the exact Node PID/start time,
bounded output and GPU telemetry, with captured-load-ID recovery if the child fails.

The child permits lifecycle endpoints only, hashes files again, allows10min preparation (hashing,
cooldown/loading), then emits `ready.json` with a10min ready-to-completion lease and exact IDs.
The root agent owns inference via committed `operator-smoke.mjs`; this operator does not call a model,
embedding or reranker inference endpoint. A strict seal/lease-bound `complete.json` marker terminates
the lease after root reports completion. Expiry/abort triggers cleanup without retry. The independent
supervisor has24min total and the one-off task30min to leave cleanup room; actual ready time never
extends past10min. Stop on unexpected residency and never unload an unknown instance.

Preparation and worker may only change the two exact GPU power limits and their own model instances.
Restore original260W only after verified zero residency. Complete task registration is removed only
after retained restoration evidence. No source, certificate, Caddy, release, production route, protected
record or existing service is changed. Contract negatives pass5/5, both new scripts parse, and the
actual local native-handle child-exit17 probe passes before lease dispatch. These are control checks,
not model/function results.
