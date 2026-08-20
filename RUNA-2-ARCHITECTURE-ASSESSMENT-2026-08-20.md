# Runa 2.0 architecture assessment

Status: planning record for steward review, 2026-08-20. This assessment is read-only with respect to
RunaAI implementation. It selects migration dispositions and review gates; it does not authorize a
port, data conversion, service activation, model download, or production change.

## Executive conclusion

RunaAI should not be copied wholesale into Runa 2.0. The migration unit is a **verified behavior or
governed data contract**, not a source file. Runa's distinctive identity, consent and authority rules,
typed knowledge, evidence discipline, steward workflows, and user-visible safeguards should survive.
Early storage, orchestration, retrieval, provider, tracing, and authentication mechanisms should be
replaced where the RunaLab bakeoff selected an industry-standard component.

The selected foundation is:

- Mastra plus AI SDK/OpenAI-compatible boundaries for application agents and provider calls;
- LangGraph JS with PostgreSQL checkpointing for durable orchestration;
- PostgreSQL for authoritative records, idempotency, outbox state, and postconditions;
- Qdrant, Nomic embeddings, and the existing BGE reranker with explicit overlapping windows;
- Caddy for the outer transport and timeout boundary;
- OpenTelemetry for traces and operational evidence;
- deterministic application routing across the selected Qwen model roster; and
- security last, using Keycloak, OpenFGA, and one-time capabilities after functional parity.

The evidence for that selection is in `STACK-BAKEOFF.md`, `MODEL-ROLE-MATRIX-FINDINGS.md`,
`MODEL-CANDIDATE-RESEARCH-2026-08-20.md`, and `LAB-COMPLETION-REPORT-2026-08-20.md`. The RunaAI
evidence cited below was inspected at `D:\AI\Projects\RunaAI`, `main`, `10eaffc`. Its local untracked
`.claude/settings.local.json` remained untouched.

## What makes Runa distinct

These are product and governance invariants, not endorsements of their current implementation.

| Distinctive property | Behavior to preserve | Primary evidence |
|---|---|---|
| Steward relationship and bounded authority | The steward directs and approves, but neither a human instruction nor a model output can make a false claim true or silently expand authority. | `docs/RUNAAI-ETHICAL-CONSTITUTION.md`; `docs/RUNAAI-AUTHORITY-AND-ETHICAL-GOVERNANCE.md`; decisions 0002 and 0003 |
| Constitutional identity | Runa has a ratified ethical constitution, conflict rules, amendment workflow, provenance obligations, and a named steward relationship. | `docs/RUNAAI-ETHICAL-CONSTITUTION.md`; `scripts/runa-autonomy-tests.mjs`; `scripts/runa-position-consistency-tests.mjs` |
| Model-neutral continuity | Identity and approved knowledge belong to Runa's records, not to one model's weights or memory. Model changes must not create a different authority. | `docs/RUNAAI-STREAMLINED-MODEL-NEUTRAL-LEARNING-E6-8.md`; `scripts/runa-learning-model-neutral-tests.mjs`; `src/runa/capability-session-projection.mjs` |
| Consent-first learning | Chat is not automatically training data. Durable lessons are explicit candidates, inactive until exact review, and correctable, expirable, revocable, and deletable. | `docs/RUNAAI-PRIVATE-CHAT-AND-PERSONAL-LEARNING.md`; `src/runa/learning-event-journal.mjs`; `scripts/runa-learning-event-journal-tests.mjs`; `scripts/runa-learning-center-tests.mjs` |
| Typed knowledge lanes | Identity, episodic history, semantic knowledge, procedures, preferences, relationships, outcomes, and evaluations remain distinct and scoped. | `docs/RUNAAI-MEMORY-AND-STATE.md`; `src/runa/learning-event-contract.mjs`; `scripts/runa-learning-event-contract-tests.mjs` |
| Approval is not inference | Repetition, model agreement, retrieval similarity, task completion, or worker output cannot self-promote a claim or capability. | `docs/RUNAAI-AUTHORITY-AND-ETHICAL-GOVERNANCE.md`; `src/runa/knowledge-scope.mjs`; `scripts/runa-knowledge-scope-tests.mjs`; `scripts/runa-conduct-capability-invariants-tests.mjs` |
| Governed actions | Material effects follow propose -> preview -> approve -> execute -> record, with exact scope, stale-state checks, bounded executors, and durable receipts. | `docs/RUNAAI-ACTION-PATHWAY.md`; `src/runa/action-pathway.mjs`; `src/runa/action-executors.mjs`; `scripts/runa-action-pathway-tests.mjs`; `scripts/runa-action-executor-tests.mjs` |
| Honest evidence behavior | Runa distinguishes unknown from empty, reports omitted evidence and denominators, preserves provenance, and does not let a check disappear inside a function. | `.claude/skills/runa-build/SKILL.md`; `src/runa/answer-ground.mjs`; `src/runa/claim-basis.mjs`; `src/runa/citation-enforcement.mjs`; corresponding `scripts/runa-*-tests.mjs` |
| Typed-untrusted research | Workspace and external observations retain locator, digest, freshness, rights, injection status, and citation state; reading does not silently authorize learning or action. | `docs/RUNAAI-WORKSPACE-COMPREHENSION-LWA1-1.md`; `src/runa/workspace-comprehension.mjs`; `src/runa/learning-external-structured-adapter.mjs`; `scripts/runa-workspace-comprehension-tests.mjs` |
| Household identity and privacy | A session is bound to a protected participant credential, while Windows Hello is described precisely and does not become a claim of biological identity. | `docs/RUNAAI-HOUSEHOLD-IDENTITY-H2.md`; `src/runa/household-identity-*.mjs`; `scripts/runa-household-identity-h2-tests.mjs` |
| Plain-language steward UX | Normal use exposes human concepts—teach, correct, approve, revoke, project, source, action—not cryptographic record mechanics. Risky work is staged visibly. | `docs/RUNAAI-ACTION-PATHWAY.md`; `docs/RUNAAI-STREAMLINED-MODEL-NEUTRAL-LEARNING-E6-8.md`; `src/runa/learning-center-page.mjs`; `src/runa/household-identity-page.mjs` |
| Project-scoped continuity | Durable chats, projects, sources, pathways, and project memory have explicit isolation; anonymous chat stays ephemeral. | decision 0075; `src/runa/chat-store.mjs`; `src/runa/project-store.mjs`; `src/runa/memory-store.mjs`; `scripts/runa-project-memory-boundary-tests.mjs` |
| Local-first estate topology | RUNA-CONTROL owns application, identity, and governance; RUNA-HOME provides private inference; Omen is the steward/development seat. Inference is not worker authority. | decision 0078; `docs/RUNAAI-FUTURE-WORK-HANDOFF.md`; `src/runa/runtime-identity.mjs`; `scripts/runa-runtime-status-tests.mjs` |
| Verification as a product boundary | The shared verifier, profiles, visible status, restart checks, and platform-specific owner checks are part of the behavior contract, not incidental CI. | `src/runa/verification.mjs`; `src/runa/verification-cache.mjs`; `scripts/runa-verification-profile-tests.mjs`; `scripts/runa-reachability-tests.mjs` |

## Replacement analysis

The approved stack replaces mechanisms, not the Runa contracts layered above them.

| Current RunaAI mechanism | Selected replacement | Preserve before replacement |
|---|---|---|
| Direct provider clients and lane-specific request assembly (`lmstudio-provider.mjs`, Gemini provider modules) | AI SDK/OpenAI-compatible provider boundary behind Mastra | accepted response shape, completion reason, model identity, context ceilings, role routing, timeout policy, and local/private data policy |
| Hand-coded answer/workflow loops (`answer-loop.mjs`, `observation-loop.mjs`, replay helpers) | LangGraph durable graph with Mastra agent/tool nodes | three reachable answer lanes, interruption/resume semantics, exact-once governed effects, evidence projection, and returned audit fields |
| File/JSON-backed durable stores for chat, projects, settings, learning, actions, and memory | PostgreSQL repositories with schema migrations | record identifiers, scopes, provenance, lifecycle state, deletion/correction links, approval basis, order, and receipts |
| Custom proposal/replay durability | PostgreSQL idempotency and outbox tables plus LangGraph checkpoints | propose-preview-approve-execute-record semantics, stale-input protection, one deed/one receipt, and replay safety |
| In-process/local semantic indexes and bespoke fusion (`semantic-*.mjs`, `retrieval-*.mjs`) | Qdrant plus Nomic embeddings | scope filters, source digests, lifecycle reconciliation, honest misses, section identity, and deletion/revocation propagation |
| Ad hoc reranking boundaries | Existing BGE reranker with explicit overlapping windows | full-document coverage, truncation disclosure, deterministic ordering, and the hard-corpus green threshold |
| Custom trace and diagnostic plumbing where it duplicates platform telemetry | OpenTelemetry SDK and Collector | redaction rules, stable correlation IDs, visible omission/failure state, and application-level audit records that are authoritative data rather than telemetry |
| Per-route transport guards and timeouts | Caddy outer boundary plus application total deadlines | localhost/private exposure policy, zero retry for non-idempotent effects, model identity checks, and fail-closed timeouts |
| Application-owned identity/session plumbing as the eventual general auth layer | Keycloak OIDC and OpenFGA, added only after functional parity | participant identity, household roles, step-up requirements, explicit grants, revocation, local/private assumptions, and Windows-bound migration ceremony |
| Long-lived or inferred action authorization | One-time scoped capabilities backed by authoritative records | exact proposal binding, expiry, single use, verified approver, effect class, and auditable consumption |
| Bespoke model selection heuristics | Deterministic application routing using the RunaLab role matrix | user-selected intelligence intent, privacy/risk constraints, model identity, fallback visibility, and no model self-routing authority |
| Mastra snapshot/memory facilities as durable truth | No replacement role: do not use them as a second authority | PostgreSQL/LangGraph remain the only durable workflow authorities; Mastra may orchestrate application nodes only |
| Legacy E5 ceremony/page family superseded by E6.8 normal use | E6 typed knowledge and one exact approval workflow | any still-live records, audit links, correction/revocation semantics, and a reviewed retirement/export decision |
| Candidate-only Gemini settings/learning paths that are not part of selected release profiles | Retire or defer, based on a steward provider-policy decision | credentials must not be copied blindly; preserve only intentionally approved provider metadata or lessons |

## Disposition matrix

“Preserve unchanged” means preserve the contract or pure implementation only where it is independent of
the replaced infrastructure. It does not mean retain the old storage/runtime by default.

| Meaningful subsystem | Disposition | Rationale and migration note |
|---|---|---|
| Ethical constitution and amendment rules | Preserve unchanged | Ratified identity/governance authority. Port references and enforcement tests; do not reinterpret during infrastructure work. |
| Authority, conflict, scope, and qualified-review rules | Preserve unchanged | Product-defining governance. Express as policies and domain rules above OpenFGA. |
| Answer-ground, claim-basis, citation, and visible uncertainty contracts | Adapt or port | Preserve output behavior; adapt inputs/receipts to the new graph and retrieval stack. |
| General chat, local chat, workspace comprehension lanes | Adapt or port | All three must remain reachable and parity-tested; consolidate duplicated mechanics behind shared graph nodes. |
| Provider registry/status and completion normalization | Adapt or port | Move to the AI SDK boundary while preserving observable identities, ceilings, and failure reasons. |
| LM Studio private inference integration | Adapt or port | It remains the selected local endpoint; Caddy/provider acceptance and deterministic role routing replace direct assumptions. |
| Gemini manual/free provider family | Defer for a later decision | Not needed for the minimum local-first slice. Decide provider policy and credential treatment separately. |
| Router and model residency/profile logic | Redesign before inclusion | RunaLab selected roles, but live drain/load/restore/health behavior and concurrency policy still need a sealed design. |
| Context, observation, and knowledge budgets | Adapt or port | Preserve explicit ceilings and omission ledgers; integrate with provider-reported limits and graph state. |
| Retrieval fusion and projection | Replace with the approved stack | Qdrant/Nomic/BGE replace mechanics; preserve scope, provenance, grounding, and honest-miss behavior. |
| Semantic section index/store/service | Replace with the approved stack | Rebuild as derived Qdrant indexes; PostgreSQL owns source and lifecycle truth. |
| Learning Event Contract | Preserve unchanged | Canonical model-neutral vocabulary is a key Runa asset. Map it to PostgreSQL without semantic compression. |
| Encrypted learning journal | Adapt or port | Preserve append-only chronology, corrections, expiry, deletion, safe hold, and outcome links; redesign encryption/key custody for the target store. |
| Direct, project/outcome, external/structured, and multimodal learning adapters | Adapt or port | Preserve explicit-source and inactive-candidate semantics; change repository interfaces only. |
| Learning semantic index | Replace with the approved stack | Qdrant is a rebuildable derivative; approval/lifecycle authority stays in PostgreSQL. |
| Learning Center and plain-language review UX | Adapt or port | Preserve teach/correct/approve/revoke workflows; rewire to new records and capability checks. |
| E3/E4/E5 legacy learning inbox and grant surfaces | Redesign before inclusion | Inventory live data and obligations; consolidate only after E6 parity and steward review. Avoid parallel authorities. |
| Approved E6.8 knowledge selection/use | Adapt or port | Preserve exact approval binding, model neutrality, token/relevance budget, and lifecycle exclusion. |
| Conduct/foundation curricula | Preserve unchanged | Preserve approved lesson content, provenance, revisions, and status; migrate as governed data, not prompt text. |
| Household participant/role/capability domain model | Adapt or port | Preserve semantics; OpenFGA should enforce, not redefine, household authority. |
| H2 DPAPI/Windows Hello credential implementation | Redesign before inclusion | Ciphertext is Windows-user-bound. Require owner-context export/re-enrollment and a rollback ceremony. |
| Chat store, project store, project memory, settings store | Replace with the approved stack | PostgreSQL replaces storage. Preserve isolation, ordering, allowlists, ephemeral defaults, retention, and deletion. |
| Session-only memory | Preserve unchanged | Keep it non-durable by default and independent from approved knowledge. |
| Action proposal store and executors | Adapt or port | PostgreSQL/outbox/capabilities replace durability/auth mechanics; preserve executor allowlists and exact previews. |
| Workspace bounded read and comprehension | Adapt or port | Preserve root containment, secret denial, small explicit reads, digests, citations, and no silent learning. |
| Project source references and candidate registries | Adapt or port | Map schemas to PostgreSQL; do not turn metadata-only candidates into live connectors. |
| Research-mode planning/status designs | Defer for a later decision | The read-only research slice needs evidence retrieval, not every future connector or outreach workflow. |
| Custom telemetry/diagnostic infrastructure | Replace with the approved stack | OpenTelemetry replaces tracing mechanics; retain domain audit events and redaction policy. |
| Shared verifier and parity corpus | Adapt or port | It is the acceptance authority. Add a Runa 2.0 profile; retire checks only through explicit disposition decisions. |
| Current HTML/page shell and command UI | Redesign before inclusion | Preserve recognizable workflows and plain language, but do not freeze early page-generation architecture. |
| Local registries/status commands | Adapt or port | Retain useful operator visibility; consolidate against actual PostgreSQL/Qdrant/graph/provider health. |
| Non-executing worker planner/telemetry descriptions | Defer for a later decision | The approved minimum and core slices do not need distributed workers or E6.9. |
| E6.9 network knowledge distribution | Retire from current migration scope | It is unimplemented and not required by the selected topology; reconsider only under a new threat model and approval. |
| Temporal, Redis, Kafka/NATS, Kubernetes, pgvector, second reranker | Retire | The bakeoff found no failed gate justifying them. |
| Voice/media runtime plans and unimplemented connectors | Defer for a later decision | Preserve product intent documents; exclude from core migration and estimate independently. |

## Dependency and data analysis

### Dependency shape

```text
Steward/participant identity and scope
  -> capability/session projection
  -> chat, research, learning review, and action approval

Provider + model role + context budget
  -> general chat / local chat / workspace comprehension
  -> answer grounding, citations, observations, and receipts

PostgreSQL authoritative records
  -> LangGraph checkpoints
  -> chat/projects/settings
  -> learning/approved knowledge
  -> proposals/idempotency/outbox/postconditions

PostgreSQL source/lifecycle truth
  -> Nomic embeddings -> Qdrant derived index -> windowed BGE
  -> typed grounded context -> answer lanes

Domain audit records + correlation IDs
  -> OpenTelemetry traces
  -> verifier/status surfaces
```

The highest-risk coupling is the join between participant/scope, approved knowledge, project context,
and all three answer lanes. A technically correct new retriever is still a regression if it surfaces a
revoked lesson, crosses a participant/project boundary, or is wired into only one lane.

### Data classes and required treatment

| Data class | Current concern | Required treatment |
|---|---|---|
| H2 identity registry, session secrets, device-vault material | DPAPI CurrentUser and Windows Hello binding; ciphertext is not portable | Owner-context inventory, export/re-enrollment design, fresh ceremony, old-store retention window, rollback proof |
| Encrypted learning journals and inbox/review/grant stores | Multiple generations may encode distinct lifecycle/audit obligations | Inventory live records and authority, define canonical target schema, reconcile counts/digests, never infer approval from presence |
| Approved curricula and lessons | Content plus scope, source, approval, correction, expiry, revocation | Migrate complete envelopes and linkage; validate effective set before and after |
| Chats and project memory | Participant/project isolation, ordering, branch ancestry, encryption and deletion | Dual-read or export/import rehearsal, per-scope counts and digests, deletion propagation, rollback to old adapter |
| Action proposals and receipts | Exact preview, sequence, approver, stale-state hash, effect receipt | Do not carry pending approvals across cutover unless explicitly re-approved; preserve completed audit records |
| Source references, sections, embeddings, reranker artifacts | Derived data may be stale or contain revoked sources | Migrate source truth only; rebuild indexes; reconcile lifecycle and scope before enabling retrieval |
| Settings and provider credentials | Allowlisted settings differ from secrets; some credentials are provider/OS bound | Separate metadata from secrets, re-enter/reseal secrets, never log or commit them |
| Diagnostics and traces | May contain sensitive prompts, paths, identifiers, or content | Apply OTel allowlist/redaction before collection; keep business audit records separate from expiring telemetry |
| Local Git/config residue | `.claude/settings.local.json`, `.runaai-local`, machine configs are not portable product data | Preserve in place, exclude from commits and migration packages, document reconfiguration steps only |

### Decisions required before implementation

1. Approve the exact minimum slice and its parity corpus; documentation alone is not approval.
2. Decide whether Runa 2.0 is initially side-by-side in RunaLab, a new repository, or a bounded RunaAI
   branch/worktree. Do not mix experimental infrastructure into the running Control checkout.
3. Name PostgreSQL schemas and authorities for participants, chats, projects, learning events, approved
   knowledge, proposals, outbox, and audit records.
4. Decide which E3/E4/E5 live records remain legally or operationally authoritative after E6 parity.
5. Approve the owner-context export/re-enrollment process for DPAPI/Windows Hello state.
6. Freeze model-role and profile-switch behavior, including drain/load/restore/health and fallback.
7. Define telemetry retention and redaction before any real conversation enters OpenTelemetry.
8. Decide the release authentication boundary and when Keycloak/OpenFGA replaces localhost H2 plumbing.
9. Decide which old verifier checks are parity requirements, which are adapted, and which can be retired
   only because their underlying mechanism is deliberately replaced.
10. Define cutover ownership, maintenance window, backup/restore evidence, and the maximum acceptable
    rollback data loss.

## Decision-gated migration plan

Every stage is a separately reviewable change set. “Rollback” means the old adapters remain available
and no destructive conversion is performed until the corresponding gate is accepted.

### Gate 0 — freeze contracts and evidence

- **Entry:** this assessment is reviewed; repository location and implementation branch/worktree are
  approved; no production services are in scope.
- **Work:** freeze domain interfaces, current fixtures, data inventory commands, trace redaction policy,
  and a Runa 2.0 verifier profile. Record which tests are prior evidence versus co-developed parity tests.
- **Validation:** baseline all three answer lanes and relevant verifier checks; record sample inputs,
  outputs, counts, hashes, and known failures.
- **Rollback:** documentation/tests only; remove the isolated experimental branch/worktree.
- **Approval gate:** steward approves the frozen minimum-slice contract and green thresholds.

### Gate 1 — smallest read-only chat/research slice

- **Entry:** Gate 0 approved; local PostgreSQL, Qdrant, Caddy, and OTel lab dependencies are disposable;
  selected local model endpoint is healthy; no protected RunaAI store is opened.
- **Work:** one Mastra application path invokes the AI SDK boundary; LangGraph checkpoints a read-only
  thread; PostgreSQL records the thread and source truth; Qdrant/Nomic/BGE supply typed evidence; the
  response carries citations, model identity, completion reason, omissions, and trace correlation.
- **Validation:** ordinary answer, honest miss, timeout, dependency loss, restart/resume, duplicate
  request, revoked-source exclusion, and cross-project denial; compare to frozen fixtures.
- **Rollback:** disable the new route/adapter and discard only the disposable new stores.
- **Approval gate:** steward reviews representative chat/research transcripts and failure evidence.

### Gate 2 — selected core read-only continuity

- **Entry:** Gate 1 approved; no unresolved scope, citation, replay, or redaction defect.
- **Work:** connect general-chat, local-chat, and workspace-comprehension to shared provider/retrieval
  adapters; port chat/project/settings repositories read-only or dual-read; expose accurate status.
- **Validation:** all three lanes execute; participant/project isolation, branching/order, context budgets,
  citations, model routing, restart, and old-adapter fallback pass.
- **Rollback:** route all reads back to existing adapters; retain new DB for diagnosis only.
- **Approval gate:** steward approves read-only core parity before any governed write is added.

### Gate 3 — one governed idempotent action

- **Entry:** Gate 2 approved; capability schema and effect class are frozen; choose a reversible low-risk
  action.
- **Work:** port propose-preview-approve-execute-record through PostgreSQL idempotency/outbox and a
  one-time capability. LangGraph may resume, but cannot repeat the deed.
- **Validation:** approval binding, expiry, revocation, stale preview, crash-before/after-effect,
  duplicate delivery, one deed/one outbox row/one receipt, and visible failure all pass.
- **Rollback:** turn off the new executor and use the old action pathway; preserve receipts.
- **Approval gate:** steward approves action semantics and evidence before adding another effect class.

### Gate 4 — governed knowledge and project data

- **Entry:** Gate 3 approved; canonical target schemas and legacy-authority disposition are decided;
  protected stores have read-only owner-context inventory evidence.
- **Work:** migrate one domain at a time: project/chat, learning events, approved knowledge, then derived
  indexes. Keep inactive candidates inactive and rebuild Qdrant from authoritative records.
- **Validation:** counts/digests, lifecycle resolution, exact approvals, scope filters, corrections,
  revocations, deletions, outcome links, retrieval parity, restart, and old-adapter rollback.
- **Rollback:** switch the domain adapter back; discard/rebuild derivatives; retain immutable migration
  ledger and pre-cutover backup.
- **Approval gate:** steward approves each domain separately; no blanket approval for all data.

### Gate 5 — operations and release security

- **Entry:** functional/data parity accepted; backup/restore and dependency-loss drills pass; redacted
  telemetry is reviewed.
- **Work:** production lifecycle/runbooks, Caddy private TLS, Keycloak, OpenFGA, one-time capabilities,
  secret custody, model identity, and owner recovery. Re-enroll Windows-bound credentials rather than
  copying ciphertext.
- **Validation:** deny-by-default policy matrix, step-up, revoke, expiry, single use, TLS/model identity,
  backup/restore, owner recovery, and no sensitive OTel attributes.
- **Rollback:** retain localhost/old identity path during the reviewed transition window; revoke new
  credentials/capabilities and restore the pre-cutover database.
- **Approval gate:** steward performs or witnesses owner-only ceremonies and approves release promotion.

### Gate 6 — selected core cutover

- **Entry:** Gates 0–5 accepted for the selected scope; maintenance and rollback windows approved;
  production backup is verified.
- **Work:** final delta migration, read freeze where required, cut over selected adapters, restart, and
  confirm running commit and service identities.
- **Validation:** selected verifier profile, live status, representative transcripts, effect receipts,
  data reconciliation, and post-restart health.
- **Rollback:** revert adapter configuration and restore pre-cutover data within the agreed loss window.
- **Approval gate:** steward closes the selected-core migration; deferred subsystems remain deferred.

### Gate 7 — extended or full parity, by separate decisions

- **Entry:** stable selected-core operation and a new approved subsystem list.
- **Work:** add deferred providers, advanced research, additional learning adapters, UI redesign,
  household expansion, worker distribution, voice/media, or legacy compatibility only when justified.
- **Validation:** a separate baseline and green gate for each subsystem; no inheritance of approval from
  core cutover.
- **Rollback:** feature flag/adapter rollback per subsystem.
- **Approval gate:** one explicit steward decision per extension group.

## Conditional estimates

The original `46–75 implementation days` remains useful as a one-primary-developer effort model, not
as the expected calendar duration when Codex and Claude perform the implementation and the steward
reviews only material gates. Under the two-agent operating model, with separate worktrees/clones and
continuous automated verification, use these elapsed ranges:

| Outcome | Included scope | Elapsed calendar time | Expected steward review |
|---|---|---:|---:|
| Minimum useful slice | Gates 0–1: one read-only chat/research vertical slice, disposable data, no protected migration or governed effect | **2–4 days** | 1–2 reviews, about 30–60 minutes total |
| Selected core migration | Gates 0–6 for chat/research, all three answer lanes, projects/chat/settings, one governed action, governed knowledge, operations and security | **6–12 days** | 3–4 review gates, about 2–3 hours total |
| Extended migration | Selected core plus chosen legacy learning surfaces, broader research/provider/status/UI parity and additional governed actions | **12–24 days** | 5–7 review gates, about 3–6 hours total |
| Full supported behavioral/data parity | All still-supported Runa behaviors and protected data, release security, owner ceremonies, cutover and rollback proof | **22–45 days** | 7–10 gates plus owner-context/Windows Hello steps |

These ranges assume both agents can work concurrently without sharing a checkout, dependencies are
already available, automated checks remain stable, review answers arrive promptly, and scope does not
expand during a gate. They are not promises: protected-data discoveries, owner-only ceremonies,
production scheduling, unclear legacy authority, flaky model behavior, or a failed parity/security gate
extend calendar time. Literal parity with every historical module, page, and deferred experiment is not
recommended and is intentionally outside “full supported parity.”

## Recommended decision

Approve only Gates 0 and 1 first. They are the smallest path that proves the selected stack can carry
Runa's distinctive evidence, identity, and governance behavior without touching protected data or
authorizing an external effect. Review that evidence before deciding how much of “selected core” should
follow.
