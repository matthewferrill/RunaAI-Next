# M1-S2 Gemma-primary application slice — 2026-09-02

Status: implementation active; no production route has changed.

## Selection record

- Selection date and source commit: 2026-09-02 from `73627f4317d59af99d60dbd65cd98d06dfdf8c5b`.
- Roadmap revision and SHA-256: `2026-08-28.1` and
  `59fc55cca61b1ce7e2fa1e2d9e7ce5ca5663d34735aa81a0d353cde9c25be210`, retrieved before selection.
- Milestone and capability IDs: M1 / M1-S2; C01, C02, C03, C04, C06, C07, C12, C15 and C16.
- Current baseline: retained actual-system evidence qualifies Gemma for Chat 24/24, Research 23/24,
  Code 24/24 and Agent 24/24 under R13, and for bounded Review 8/8 under the focused corrected
  `accept`/`revise` contract. The exact current application, end-user UI, production route and customer
  trial are not yet accepted.
- Why this slice is next: model selection is no longer the dependency. The next dependency is a single
  exact application that makes all five qualified functions understandable and usable through the real
  Omen -> Control -> Home path.
- Approved product direction: `RUNAAI-PRODUCT-FOUNDATION-AND-UX-BASELINE-2026-09-02.md` is the design
  baseline for the shell, Settings, connections, work surfaces and actual-system status. It records the
  minimum product foundation that must be implemented before the ordinary customer trial.

## Included behavior

1. Configure `gemma-4-26b-a4b-it-qat` as the explicit primary model for Chat, Research, Code, Agent and
   Review. Nomic remains the embedding model; BGE remains the reranker.
2. Keep the Research response checker on the already-qualified R13 contract and isolate the simplified
   non-null `accept`/`revise` checker to Review so prior Research evidence is not silently invalidated.
3. Add a fail-closed, byte-bound deployment admission that composes the immutable R13 four-role result
   with the focused Review result. A prose winner label alone cannot authorize a release.
4. Present Chat, Code and Research as the three primary end-user workspaces. Wire Agent as a governed
   task state inside Code and Review as contextual work against exact sources, artifacts or diffs. All
   five qualified model functions remain reachable, but Agent and Review are not permanent top-level
   selectors.
5. Build and verify the exact candidate release, deploy it first as a reversible shadow release on
   Control, and exercise Gemma on Home through the real application path.
6. Run one bounded smoke/acceptance journey for Chat, Research, Code draft/sandbox, Review and Agent
   preview/approval behavior. Retain receipts and verify exact model unload and GPU restoration.
7. Only after shadow acceptance, use the separate production-routing gate. The customer trial remains a
   separate human acceptance boundary.

## Explicit exclusions

- No adversarial comparison, voting, automatic fallback or second/third generation model in this slice.
- No new model qualification campaign unless the model artifact, inference settings, role prompt,
  checker semantics or frozen functional contract materially changes.
- No mock or stub response can qualify a model, the three-host application path or customer behavior.
- No access to the user's files, repositories, network, protected records or administrative operations.
- No silent expansion beyond supplied text, selected retained sources, the JavaScript sandbox and the
  governed disposable Code project.
- No claim that M1 or this release completes the full product roadmap.

The current slice does not silently widen its existing file/network/execution authority. The approved
product-foundation baseline is implemented through separately frozen, bounded follow-on slices: shell and
conversation lifecycle; Settings and system status; authorized local folders and local Git read-only;
Research/Code/artifact work surfaces; and then governed local changes. Final customer acceptance waits for
that minimum foundation. Component-level shadow verification may proceed without claiming the product is
ready.

## Interfaces and runtime boundary

The model-independent interfaces remain the existing five role names and typed application contracts.
The real boundary is the user's Edge browser on Omen, the private application and durable stores on
Control, and exclusive leased inference on Home. Model traffic remains private and fail-closed. The
application owns authorization, source selection, citations, execution, receipts, cancellation and
reconciliation; Gemma supplies bounded generation or planning content only.

## Verification and stop rules

Deterministic checks prove schema, routing, authorization, preservation, UI state and deployment
admission only; they are not model qualification. The acceptance evidence must come from the actual
Omen -> Control -> Home product path. If that method fails, stop before grading Gemma or routing
production, retain the failure, write a full RCA and corrective design, verify the corrected method on
the actual systems, and resume at the failed gate. Do not replay an unchanged failed method.

Cancellation must prevent successor work while reconciling any already-dispatched action. Rollback is
the previous immutable Control release plus removal of only slice-owned disposable state; user work,
receipts and failed-stage evidence remain preserved.

## Customer test and remaining roadmap

The required customer test is a steward-operated ordinary session after exact shadow acceptance and
before product acceptance. Production routing, the customer trial, the deferred comparison models and
all capabilities remaining after M1 stay visible work. Source/result/commit/publication handoff will bind
the exact application archive, configuration, qualification manifest, smoke receipts and release digest.
