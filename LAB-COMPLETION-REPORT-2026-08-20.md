# RunaLab plan completion report

Completed 2026-08-20. This report closes phases A–E of `LAB-PLAN.md` as a component-selection and
composition lab. It does not claim a production deployment or modify RunaAI.

## Phase results

| Phase | What was proved | Result |
|---|---|---|
| A — frays | Re-ran all six failure families with configured standard boundaries and corrected evidence handling. | All six frays have selected closures; no classifier is treated as authority. |
| B — dark components | Exercised retrieval, auth surface, formal evals, tracing, reranker truncation, and a hard reranker corpus. | Formal evals 20/20; hard corpus selected existing BGE with explicit windows at 12/12 and 201 ms median. |
| C — hardware/models | Measured Control/Home, both RTX 6000 cards, ECC and NVLink; refreshed official candidate research; tested six runnable model/runtime arms. | Two-model primary roster plus 4B fallback; deterministic routing selected; no duplicate downloads. |
| D — composition | Ran Mastra agent/tool, LangGraph/PostgreSQL checkpointing, capability/outbox, Qdrant and OpenTelemetry through fresh-worker restart/replay; composed Caddy and app budgets. | One provider call, one deed, one outbox row across resume/replay; traces retained/redacted; all three timeout cases failed closed with one call. |
| E — port/security | Inventoried RunaAI read-only, estimated verifier-preserving migration, then reran security last. | 46–75 one-developer effort-day baseline; 2–4 day minimum slice and 6–12 day selected-core elapsed estimates for the Codex-plus-Claude workflow; final Keycloak/OpenFGA/revocation gate passed. |

## Selected stack

- **Application/agents:** Mastra plus AI SDK/OpenAI-compatible provider boundary.
- **Durable orchestration:** LangGraph JS with PostgreSQL saver; PostgreSQL also owns records,
  idempotency, outbox and postconditions.
- **Retrieval:** Nomic embeddings, Qdrant vectors, existing BGE reranker with explicit overlapping
  windows, typed grounded-output contracts.
- **Provider edge:** application total deadline and zero retry for non-idempotent calls, with Caddy as
  the outer transport guard.
- **Observability:** OpenTelemetry JS and Collector with blocked sensitive attributes.
- **Security, last/opt-in:** Keycloak OIDC, OpenFGA authorization, one-time capabilities, TLS/model
  identity for release profiles. Classifiers remain disabled because none passed activation gates.
- **Models:** Qwen3 Coder 30B-A3B for fast chat/code/tools/research; Qwen3.6 27B MTP for deliberate
  chat/review; Qwen3 4B as low-memory fallback; deterministic application routing.

Temporal, Redis, Kafka/NATS, Kubernetes, pgvector, a second reranker, and custom workflow/auth/tracing
frameworks are not justified by a failed gate and remain out.

## Evidence integrity and remaining boundary

- Local regression: 14/14 Node tests passed.
- All 10 current seal verifiers passed, including the original corpus after canonicalizing only Git's
  LF/CRLF checkout transport difference.
- The final security harness passed after all ordinary development testing and stopped its lab
  services when finished.
- RunaAI stayed on `main` at `10eaffc`; its untracked `.claude/settings.local.json` was preserved.

The development stack is selected and its lab composition is proved. The separate
`RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md` records what makes Runa distinct, what the selected stack
replaces, subsystem dispositions, protected-data risks, and the approval-gated migration sequence.
`RUNA-PORT-ESTIMATE-2026-08-20.md` now distinguishes one-developer effort days from two-agent elapsed
calendar time. What remains is reviewed implementation, not another stack search: begin only after
approval with the smallest read-only chat/research slice. Persistent production service installation,
private TLS, credential lifecycle, backup/restore, and operator runbooks are release-activation work
and must not be confused with the completed component decision.
