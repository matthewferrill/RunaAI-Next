# Gate 2 results — 2026-08-21

Status: bounded Gate 2A implementation and verification are complete. Gate 2B evidence acceptance is
pending. This is not merge approval, production readiness, protected-data migration, or Gate 3
authorization.

## Layman summary

Gate 2 now proves, with synthetic information only, that the approved stack can support ordinary
chat, research, guarded lookup, and explicitly scoped workspace reading while keeping Runa's key
boundaries visible. Verified chats can survive restart in a new isolated PostgreSQL schema;
unverified chats stay ephemeral. Synthetic projects, branches, search, unread/archive state, and the
single allowlisted intelligence setting persist without granting new file or project access.

Nothing was connected to production. No real RunaAI conversation, project, setting, memory, learning,
credential, DPAPI, Windows Hello, or device-vault record was opened or copied. No model was loaded or
downloaded. Every started service listened only on loopback and was stopped after each run.

## Implemented boundary

- Versioned Gate 2 request and response contracts for `general`, `research`, `guarded`, and
  `workspace` lanes.
- Deterministic application routing to `chat`, `research`, and `code` roles; model output cannot choose
  its lane, role, participant, project, sources, or authority.
- Reuse of the accepted Gate 1 retrieval, record validation, citation, deadline, provider, and
  effects-empty answer slice.
- Shared post-answer gates and explicit status/continuity receipts on every Gate 2 answer path.
- Explicit workspace resolution limited to one through six named source sections, with cross-project
  denial before model delivery and `extraReads: 0` in the receipt.
- Synthetic chat, project, project-memory-summary, and allowlisted-setting repositories in a separate
  `gate2` PostgreSQL schema, plus in-memory equivalents for deterministic tests.
- Ordered turns, branch provenance, title/archive/unread state, bounded search, deletion, restart
  continuity, project context marked as typed untrusted data, and safe setting fallback/refusal.
- LangGraph PostgreSQL checkpoints, pseudonymized allowlisted OpenTelemetry, and a Gate-2-only schema
  rollback that retains Gate 1 records.

## Verification evidence

### Gate 2 deterministic corpus

`npm.cmd run test:gate2` passed all eight test groups. The suite's coverage assertion confirms all 34
frozen `PARITY-CORPUS.json` case IDs executed; no case was skipped.

Covered behavior includes grounding and honest misses, session recall, current-source honesty,
protected/effect refusal, lane-role mapping, explicit workspace reads, unknown citations,
participant/project isolation, common answer gates, ordered/branched chat continuity, project and
setting contracts, duplicate/restart behavior, dependency visibility, telemetry redaction, rollback,
and zero effects.

### Disposable selected-stack integration

`npm.cmd run verify:gate2:integration` passed 21/21 hard checks using retained RunaLab tools and
synthetic data:

- Mastra plus the AI SDK's OpenAI-compatible boundary;
- Caddy on loopback;
- LangGraph with PostgreSQL checkpoints;
- PostgreSQL Gate 1 records and isolated Gate 2 continuity records;
- Qdrant derived vectors and the windowed reranker;
- OpenTelemetry with pseudonymized allowlisted attributes; and
- a deterministic provider stub for the three application-selected roles.

The run observed 10 bounded chat-completion calls for 10 distinct model-backed requests. PostgreSQL
held 9 Gate 1 committed requests/turns, 10 Gate 2 external requests, 11 Gate 2 turns including one
copied branch turn, 10 chats including the branch, 2 synthetic projects, and 39 checkpoints. Sequential
duplicate replay returned the same answer, citations, and correlation ID while correctly reporting
that the replay did not append a second turn. A separate simultaneous duplicate race also produced one
provider call, one committed answer, and one durable Gate 2 turn.

Rollback dropped only the disposable `gate2` schema and verified that the `gate1.answer_requests`
table and all 9 Gate 1 rows remained. Caddy, reranker, provider stub, collector, Qdrant, and PostgreSQL
all reported stopped. The machine-readable report is `evidence/STUB-INTEGRATION-RESULTS.json`.

### Regression results

- Gate 1 deterministic suite: 26/26 passed, including deterministic separation of Qdrant HTTP timeout
  from genuine connection refusal.
- Full Gate 0 verification: 48/48 Node tests passed, 10/10 seals passed, and all instrumentation checks
  passed. Its optional live legacy phase was not rerun because this gate did not set
  `RUNAAI_LEGACY_CHECKOUT`; Gate 2's pinned safe baseline remains recorded separately.
- Gate 1 disposable integration: the first regression run passed 24/25 checks but labeled the
  synthetic slow-retrieval result `dependency-unavailable` after 161 ms instead of the expected
  `timeout`. RCA found a race between the total request timer and Node's HTTP `TimeoutError` code `23`.
  The steward approved a narrow Qdrant-only normalization fix. The refreshed deterministic suite and
  25/25 integration checks now prove that HTTP timeout reports timeout while connection refusal remains
  dependency-unavailable. Full evidence is in
  `../gate1/GATE1-QDRANT-TIMEOUT-REMEDIATION-2026-08-21.md`.

## Deliberate deferments

Live-model validation was not run. `run-model-validation.mjs` is present for a later explicit decision
and refuses to start unless `GATE2_MODEL_VALIDATION_APPROVED=yes` and an already-running private
endpoint are supplied. It cannot download, load, or reconfigure a model. Qwen3.6 deliberate review and
the existing live BGE endpoint remain deferred exactly as approved at Gate 1.

Protected stores, real-data migration, learning, governed actions, Keycloak/OpenFGA, private-LAN
activation, persistent services, production routing, backup/restore, and cutover also remain outside
Gate 2.

## Gate 2B decision

The steward should decide whether this evidence is sufficient to accept Gate 2 behavior. Acceptance
means only that the bounded synthetic evidence is accepted. A separate Gate 2C approval is required
before merging this branch into `runa2/integration`, and Gate 3 requires a new scope decision.
