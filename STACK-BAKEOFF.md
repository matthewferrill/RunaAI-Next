# Stack bake-off — evidence matrix and provisional decisions

Status date: 2026-08-20. Governed by `STACK-BAKEOFF-PREREGISTRATION.md`; seal
`202d6a165860b82185f09c354a601cb210358638447c668452701c7558fa5f4f`.

This is a decision ledger, not a list of attractive software. `selected` means a component passed the
applicable local gate. `pending` means exactly that; documentation or a successful import is not a
substitute for a fault test.

## Current matrix

| Fray / concern | Candidate | Evidence state | Decision | Custom residual / next gate |
|---|---|---|---|---|
| 1 verified effects | Temporal 1.22 raw activities | 25/25 recovered; duplicate deed in 15/25 after-effect crashes | rejected alone | Standard activities are at-least-once. |
| 1 verified effects | LangGraph JS 1.4.12 + SQLite checkpointer raw nodes | 25/25 recovered; duplicate deed in 15/25 after-effect crashes | rejected alone | Checkpointing cannot make an external effect exactly once. |
| 1 verified effects | LangGraph durable graph + PostgreSQL atomic idempotency/postcondition adapter | 25/25 PostgreSQL-checkpoint recoveries, 0 duplicate deeds; database-effect matrix 20/20 | selected | Custom code is limited to domain effect id and postcondition. |
| 2 bounded provider calls | AI SDK 7.0.67 `timeout.totalMs`, `maxRetries: 0` | 5/5 never-responding calls stopped at 5.01–5.02 s; one wire call each | selected | Apply at every provider/embed/tool boundary; Caddy is only an outer guard. |
| 3 provider completeness | AI SDK finish/raw-finish/response model metadata + acceptance policy | healthy 5/5 accepted; partial 5/5 rejected; changed model 5/5 rejected | selected | Narrow custom policy: accepted finish set and pinned model equality. |
| 3 request bounds | AI SDK token/output limits plus application byte/token preflight | healthy 5/5 accepted; oversized UTF-8 input 5/5 rejected before any wire call | selected | Retain exact byte/token policy at every provider boundary. |
| 3 storage/index completeness | PostgreSQL outbox + Qdrant 1.19.0 postcondition/reconciliation adapter | 20/20 across healthy, unavailable, duplicate, and after-deed crash cases; exact count 2,000 to 2,020 | selected | Custom code is limited to outbox delivery state and postcondition reconciliation. |
| 3 reranker completeness | existing BGE service with explicit overlapping windows | hard corpus: baseline 0/12 top-5, whole-document BGE 0/12, windowed BGE 12/12; 201 ms median | selected as windowed scorer | Window identity/coverage is caller-visible; whole-document scoring remains prohibited. |
| 4 governed data/instruction boundary | Keycloak + OpenFGA + PostgreSQL one-time capability adapter | live issuance passed; governed-tool smoke passed; integrated matrix 120/120 with zero unauthorized deeds, 40/40 benign deeds, and exactly-once replay/recovery | selected | Retrieved content cannot mint authority; narrow custom residual binds provenance and exact arguments. |
| 4 classifier defense in depth | LLM Guard / Meta Prompt Guard / NeMo Guardrails fixed bake-off | LLM Guard missed 5/20 attacks and false-blocked 2/20 natural requests; Meta gated; NeMo package/model initialization failed | omitted | No candidate passed; classifier output never grants authority. |
| 4 non-tool retrieval | typed feature-specific fact compiler + deterministic grounded output contract | 0/20 steering, 0/20 canary disclosure, 20/20 benign availability; scanner failure denied | selected with scoped deny-by-default contract | Generic free-form retrieval remains disabled until a feature defines an equivalent grounding contract. |
| 5 durable state | Temporal TypeScript 1.22 | fresh worker recovered 25/25; 37 history events/run | not-needed now | It passes worker recovery but adds a durable service; revisit if scheduling/long-running workflow requirements exceed LangGraph. |
| 5 durable state | LangGraph JS 1.4.12 + PostgreSQL saver 1.0.5 | fresh process recovered 25/25; 7 checkpoint states/run; completed graph survived immediate PostgreSQL restart without a new deed | selected | Use only as durable graph/checkpoint authority; Mastra remains the agent/tool layer. |
| 5 durable state | Mastra + LibSQL snapshots | 0/60 persistence runs reached a defined recoverable terminal state in Wave 3 | rejected for durable boundary | Mastra remains eligible as agent composition, not durable source of truth. |
| 6 actor/expiry | Keycloak 26.7.2 OIDC | valid token accepted; forged, expired, wrong issuer/audience/actor and missing token rejected; online logout revocation passed | selected, opt-in security | Destructive operations require online active-token decision; offline JWT remained cryptographically valid after logout as expected. |
| 6 resource authorization | OpenFGA 1.18.3 | intended tuple allowed; wrong actor/object/relation, revoked tuple, and service loss all denied | selected, opt-in security | Production needs persistent datastore, TLS/private binding, backup and operator runbook. |
| 6 endpoint identity | pinned response model policy; later authenticated/TLS endpoint | response equality gate passed changed-model 5/5 | selected for integrity; auth deferred | Transport identity belongs to the security phase. |
| Observability | OpenTelemetry JS + Collector contrib 0.159.0 | 5/5 sender processes exited; all traces retained with six required keys and neither planted forbidden value | selected | Add backend retention/queries later; raw prompts and secrets stay out of attributes. |
| Provider proxy | Caddy 2.11.4 | official portable binary; timeout proxy returned at 1.817 s, one upstream call | selected as outer guard | Application 5 s total deadline remains authoritative; retries stay disabled for non-idempotent calls. |
| Primary records | PostgreSQL 18.6 | database-effect matrix 20/20; identical 15-row hash after immediate server stop/restart | selected for relational truth | pgvector and workflow-service persistence remain separate gates. |
| Vector search | Qdrant 1.19.0 portable | 2,000/2,000 exact count, green/optimizer-ok, retrieval/query and payload/vector postconditions survived process restart | selected | PostgreSQL-to-Qdrant alignment passed 20/20; HNSW count 0 is valid full-scan for this small low-dimensional corpus. |
| Vector search alternative | pgvector 0.8.x | official Windows build requires absent Visual C++ tools; not executed | pending alternative, not selected | Revisit only if eliminating the Qdrant service justifies compiler/build and migration cost. |
| Vertical composition | Mastra typed agent + LangGraph/PostgreSQL + capability/outbox + Qdrant + OpenTelemetry | fresh worker paused before the effect, fresh worker resumed/committed, third worker replayed; one provider call, one deed, one outbox row; 5 checkpoint rows; traces retained/redacted | selected composition passed | Security is intentionally overlaid only in the final integration-security/release profiles. |
| Provider proxy composition | Caddy plus application deadline | slow headers failed closed at 1.810 s; slow body at 2.048 s; application total budget at 1.008 s; one upstream call in every case | selected composition passed | Caddy remains an outer guard; the application budget is authoritative. |

## What is selected now

1. Keep Mastra as the agent/tool composition layer, but remove durable-state authority from it.
2. Keep AI SDK and the OpenAI-compatible adapter. Configure explicit total deadlines and zero implicit
   retry unless the operation is proven idempotent.
3. Add a provider acceptance boundary that rejects unacceptable finish state, missing/changed model
   identity, and over-budget input before delivery.
4. Use LangGraph JS with the PostgreSQL checkpointer as durable graph authority plus a narrow domain
   idempotency/postcondition adapter. Temporal remains a tested reserve, not a current dependency.
5. Use PostgreSQL for records, outbox/idempotency, and workflow persistence; use Qdrant for vectors.
   Do not add Redis, Kafka, NATS, or Kubernetes without a failed gate that requires it.
6. Use Keycloak for OIDC authentication and OpenFGA for resource authorization only in opt-in
   security/release profiles. Do not make either a default-development dependency.
7. Use the one-time capability gate for every governed tool and typed feature-specific grounding
   contracts for retrieval answers. Do not activate any tested prompt-injection classifier; none met
   the fixed attack, benign, health, and dependency-loss gates.

## Missing stack components confirmed

- A production relational source of truth (PostgreSQL) — selected and lab-passed.
- A durable execution authority outside Mastra (LangGraph with PostgreSQL checkpointer) — selected.
- A vector service with readable storage/search readiness (Qdrant) — selected; cross-store alignment passed.
- An OTLP sink/Collector (selected); long-term query backend is not yet required.
- A simple provider-edge proxy with explicit transport budgets (Caddy) — selected.
- Authentication and authorization services (Keycloak and OpenFGA) — selected for opt-in profiles,
  not activated in default development.
- A usable retrieved-data/instruction boundary — selected: one-time capabilities for governed effects
  and typed feature-specific grounding contracts for answers; uncontracted free-form retrieval denies.
- The small domain-specific layer no generic framework can know: idempotency key, postcondition
  verifier, accepted completion policy, and endpoint identity policy.

## Components not currently justified

- **Redis:** no cache, lock, or queue requirement survives the selected PostgreSQL/durable-engine plan.
- **Kafka/NATS:** Temporal task queues plus a database outbox cover the measured requirement.
- **Kubernetes:** no scale or scheduling finding requires it for the lab or first Runa port.
- **A second reranker:** the corrected hard corpus selected windowed use of the already-installed BGE
  model, so no second reranker download is justified.
- **Custom workflow, retry, auth, tracing, vector, or concurrency frameworks:** explicitly prohibited.

## Remaining gates

The RunaLab component-selection gates are complete. The formerly pending vertical composition, Caddy
stream/budget composition, formal eval coverage, and hard reranker corpus all pass. Temporal stays out
of the initial stack, and a second reranker is not justified.

The following are activation gates, not missing development-stack decisions:

1. Build the first read-only RunaAI port slice and reconcile it against the existing verifier.
2. Add an OpenTelemetry query backend only when retention/query requirements are fixed.
3. Before production activation, prove Keycloak/OpenFGA with persistent storage, private TLS,
   credential lifecycle, backup/restore, and an operator runbook. Portable loopback behavior is
   component evidence, not production-operations evidence.

## Methodology verdict

The edge/failure-dimension register, preregistration, deed-versus-claim split, controls, asymmetry rule,
and immutable raw evidence are sound. The earlier programme was unsound in four correctable places:

1. a lexical detector was allowed to stand in for semantic adjudication;
2. referenced wire deeds were not retained;
3. component presence/constructor success was sometimes treated as capability closure; and
4. the candidate set was frozen from documentation assumptions, including an outdated statement that
   LangGraph was Python-primary.

Those four errors are now explicit gates. The methodology is fit to continue. The latest security run
also did what a sound control should do: it rejected a superficially strong 60/60 attack result because
the same detector blocked 60/60 benign actions and failed open on 3/3 dependency-loss controls. The
stack assignment is complete for the measured six frays. The vertical RunaLab integration slice now
also proves the selected development boundaries compose. RunaAI porting may begin only after the
steward accepts the recorded model-role caveats and migration estimate.

## Primary documentation used to qualify candidates

- [Mastra](https://mastra.ai/ai-workflows) documents typed tools, workflow snapshots, input/output
  processors, and production workflow deployment; each remains a candidate primitive, not proof of
  this configuration.
- [AI SDK](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) documents total/step/chunk
  timeouts, retry control, finish reason, raw finish reason, response, provider metadata, and steps.
- [Temporal](https://docs.temporal.io/workflows) documents event-history replay and Activities for
  external I/O; the lab confirmed recovery and also exposed at-least-once effect semantics.
- [LangGraph JS](https://docs.langchain.com/oss/javascript/langgraph/persistence) documents
  checkpointers for thread state and fault tolerance plus stores for cross-thread data; the lab
  confirmed SQLite process recovery.
- [PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html) documents Serializable
  transactions as equivalent to some serial execution order.
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) is the vendor-neutral
  receive/process/export layer.
- [OpenFGA](https://openfga.dev/docs/modeling/getting-started) models authorization as a
  user/relation/object decision and provides model assertions.
- [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) documents transport and
  stream timeouts and retry controls; several defaults are no-timeout, so explicit config is mandatory.
- [NVIDIA NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/latest/home) is a programmable
  input/output policy candidate with a catalog that includes jailbreak and agentic-security rails.
- [Meta Purple Llama](https://github.com/meta-llama/PurpleLlama) publishes Prompt Guard and
  LlamaFirewall candidates for prompt-injection and jailbreak detection.
- [Protect AI LLM Guard](https://github.com/protectai/llm-guard) exposes prompt and output scanner
  interfaces, including a prompt-injection risk score. It remains a candidate, not a verdict.
