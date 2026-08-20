# Runa port estimate — stack migration only

Status date: 2026-08-20. The inventory and estimate were produced through read-only inspection of the
current RunaAI checkout. This document is now committed alongside the architecture assessment in both
repositories, but it still does not authorize migration implementation, protected-data conversion,
service activation, or production change.

## Measured starting point

- Checkout: `D:\AI\Projects\RunaAI`, branch `main`, HEAD `10eaffc`, tracking `origin/main`.
- Preserved local state: untracked `.claude/settings.local.json`.
- Application core: 169 `.mjs` modules and 34,899 lines under `src/runa`.
- Verification surface: 123 `*-tests.mjs` files, 20,309 test lines, and 128 command checks named by
  `src/runa/verification.mjs`.
- Verification entry surfaces: the three CLI profiles (`portable`, `control-operator`,
  `control-owner`), the local `/api/verify` route, guarded-chat verification caching, and the command
  runner. These are consumers of one shared verifier, not four independent suites.

A mutually exclusive filename-based inventory gives the migration shape below. It is a planning aid,
not a claim that every file in a category needs rewriting.

| Boundary | Modules | Expected treatment |
|---|---:|---|
| Provider/model | 16 | Adapt LM Studio/model routing to the accepted provider boundary and role policy. |
| Retrieval/grounding | 40 | Port storage/search calls to Qdrant plus windowed BGE; preserve the typed grounding contracts. |
| State/records | 20 | Replace file/local durable authority with PostgreSQL repositories where the selected stack owns truth. |
| Identity/actions | 16 | Preserve current behavior during development; map to Keycloak/OpenFGA/capabilities only in the final security stage. |
| Learning/governance | 40 | Port after the lower-level records and retrieval adapters stabilize; retain approval semantics. |
| UI/application | 5 | Rewire commands and status surfaces to the new adapters without redesigning the UI. |
| Domain/utility | 32 | Prefer unchanged reuse; move only after parity tests show the new boundaries do not alter behavior. |

## Staged implementation estimate

| Stage | Scope | Implementation days |
|---|---|---:|
| 0 | Freeze adapter contracts, parity fixtures, migration ledger, and a RunaLab-backed verifier profile | 3–5 |
| 1 | Provider acceptance, time budgets, role routing, Caddy boundary, and Home model lifecycle | 3–5 |
| 2 | PostgreSQL repositories, schema/migrations, idempotency/outbox, backup/restore harness | 6–9 |
| 3 | Qdrant indexing/reconciliation, Nomic embeddings, and windowed BGE reranking | 4–6 |
| 4 | LangGraph checkpoint orchestration with Mastra agent/tool nodes and recovery parity | 5–8 |
| 5 | Learning, project, chat, memory, and approved-knowledge data migration by domain slice | 7–12 |
| 6 | OpenTelemetry/Caddy operations, service lifecycle, diagnostics, and failure drills | 3–5 |
| 7 | UI/command/status wiring and user-visible parity | 3–5 |
| 8 | Security last: Keycloak/OpenFGA, capability issuance, TLS/private endpoints, secrets and recovery | 6–10 |
| 9 | Full 128-check reconciliation, data cutover rehearsal, rollback proof, and acceptance | 6–10 |

Expected effort is **46–75 implementation days** for one careful primary developer. This is an effort
accounting model, not the expected elapsed schedule for the planned Codex-plus-Claude workflow. The
range remains useful for understanding total engineering and verification exposure: the dominant cost
is preserving 128 verifier checks and migrating encrypted/Windows-bound records without weakening
behavior. Shared databases, protected-data ceremonies, data cutover, and final verification remain
serial even when implementation tasks run concurrently.

## Elapsed calendar estimate with Codex and Claude implementing

Assumptions: the two agents use separate worktrees or clones; work is divided at stable interfaces;
automated checks run continuously; the steward reviews material gates rather than routine code; review
answers arrive promptly; required local dependencies are available; and scope does not expand inside a
gate.

| Outcome | Included scope | Elapsed calendar time | Steward involvement |
|---|---|---:|---:|
| Minimum useful slice | Contracts plus one disposable, read-only chat/research vertical slice | **2–4 days** | 1–2 reviews, about 30–60 minutes total |
| Selected core migration | Three answer lanes, chat/projects/settings, governed knowledge, one governed action, operations and release security | **6–12 days** | 3–4 gates, about 2–3 hours total |
| Extended migration | Selected core plus chosen legacy learning surfaces, broader research/provider/status/UI parity, and additional governed actions | **12–24 days** | 5–7 gates, about 3–6 hours total |
| Full supported behavioral/data parity | All still-supported Runa behavior and protected data, owner ceremonies, cutover, and rollback proof | **22–45 days** | 7–10 gates plus owner-context/Windows Hello steps |

Literal parity with every historical module, page, provider experiment, and deferred feature is not
recommended. Protected-data surprises, flaky model behavior, unclear legacy authority, a failed parity
or security gate, production scheduling, or delayed reviews extend the elapsed ranges. See
`RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md` for the exact decision gates and scope boundaries.

## Port order and stop rules

1. Port vertical slices, not folders: provider, records, retrieval, orchestration, then one Runa
   feature at a time.
2. Keep old and new adapters side by side until the relevant original tests and new parity tests pass.
3. Do not migrate DPAPI/Windows Hello material by copying ciphertext. Export through the owning user
   context into a reviewed migration envelope, import once, and prove rollback.
4. Do not let Mastra snapshots become a second durable authority; LangGraph/PostgreSQL own workflow
   state and PostgreSQL owns deeds/outbox state.
5. A slice does not count as ported until restart, duplicate, dependency-loss, and verifier-parity
   cases pass.
6. Security remains absent from ordinary development. Add it only after the functional port is stable,
   then require the release profile for promotion.

## First implementation slice after approval

Build a **read-only chat/research slice** in RunaAI behind new adapters: accepted LM Studio response,
PostgreSQL thread/checkpoint record, Qdrant retrieval, windowed BGE reranking, typed grounded response,
and OpenTelemetry trace. It exercises every selected non-security service without risking a governed
external effect. Once restart and parity pass, add one idempotent governed action as the second slice.
