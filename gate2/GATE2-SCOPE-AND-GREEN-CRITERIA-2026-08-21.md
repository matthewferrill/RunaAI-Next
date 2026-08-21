# Gate 2 scope and green criteria — 2026-08-21

Status: proposed contract for steward review. This document freezes the proposed Gate 2 boundary; it
does not authorize implementation, protected-data access, production activation, or Gate 3.

## Layman summary

Gate 1 proved one small synthetic answer path on the new stack. Gate 2 should prove that the same
foundation can support every current way Runa answers—ordinary chat, guarded local chat, and
explicit file-based workspace analysis—without losing project separation, citations, honest failure
reporting, or Runa's safety rules.

It should also prove that chats, projects, and the one allowlisted setting can survive restart in the
new PostgreSQL record layer using synthetic records. It must not open or copy Matthew's real encrypted
chat archive, project state, settings, Windows Hello/DPAPI material, learning journal, or credentials.

“Read-only” means Runa cannot perform a governed or external effect in this gate. The test harness may
create, append, branch, archive, and delete synthetic records inside disposable Gate 2 databases so
continuity and rollback can be proved.

## Entry criteria

All are satisfied for planning; implementation still needs the approval at the end of this document.

1. Gate 1 evidence and remediation were accepted and merged into `runa2/integration` at merge commit
   `7107eadefd8c4a0ce6acf050119e80c44e16b5cb`.
2. Gate 1 has no unresolved authority, scope, citation, replay, deadline, reranker-window, or redaction
   defect in the accepted evidence.
3. Legacy RunaAI is verified locally at `71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2`, tracking
   `origin/main`, with only the pre-existing untracked `.claude/settings.local.json` preserved.
4. RunaLab is verified locally at `ec5e3466f6f937c8c610bdecf62a09c2491c7137`, tracking
   `origin/main`, with a clean working tree.
5. Exact Node `22.22.0` remains selected.
6. The Gate 1 low dependency advisory remains temporarily accepted only for disposable synthetic,
   bounded, loopback work. It still blocks production or widened provider/network scope.

## Approved implementation shape if this contract is accepted

### 1. Shared answer boundary

Extend the Gate 1 request/response contract so these deterministic application-selected lanes use
the same provider, deadline, retrieval, grounding, citation, completion, telemetry, and effects-empty
boundaries:

- `general` — ordinary local chat and bounded read-only research;
- `guarded` — local chat with deterministic policy refusals and bounded read-only observation tools;
- `workspace` — explicit named-file analysis with typed-untrusted evidence and file/line receipts.

No prompt, retrieved passage, model output, chat record, project record, or setting may select or
change the participant, project, lane, authority, model role, workspace roots, or available tools.

### 2. Synthetic continuity repositories

Add PostgreSQL repositories beside the legacy adapters for these contracts:

- chats: ordered turns, title, archive/unread state, project assignment, branch provenance, bounded
  search, and deletion;
- projects: managed/archived state, bounded pathways, source-reference metadata that grants no read
  access, memory-enabled status, and synthetic project-context projection;
- settings: the declared allowlist only, initially `defaultIntelligenceLevel` with Low/Medium/High
  and Medium as the safe fallback.

PostgreSQL is authoritative only for Gate 2 synthetic records. No dual-read may silently choose the
new result: the selected adapter and its source must be visible in the response/status record.

### 3. Lane-specific behavior that must remain recognizable

- General chat retains session follow-up/recall, deterministic unknown-command handling, honest
  current-information limits, bounded read-only lookups, and project context when supplied.
- Guarded/local chat applies policy suspension, protected-path, capability, and unsafe-effect
  decisions before model inference; offered tools remain bounded and read-only.
- Workspace comprehension reads only one through six explicit, in-scope files/ranges; reports
  digests, freshness, truncation, citation recognition, omissions, and no-extra-read behavior.
- All three lanes treat supplied content as data rather than authority, apply the same answer gates,
  expose actual model identity/role and completion state, and return zero effects.

### 4. Accurate status

Expose a synthetic Gate 2 status projection that names:

- selected answer lane and model role;
- provider/retrieval/reranker state and explicit degradation;
- selected chat/project/settings adapter (`legacy-observer` or `postgres-synthetic`);
- PostgreSQL/Qdrant/checkpoint reachability;
- whether protected stores were opened (must be false); and
- rollback availability.

Status must report unknown or unavailable rather than silently substituting a healthy-looking default.

## Data and authority boundaries

### Permitted

- synthetic participants, projects, settings, sources, chats, and project-memory summaries;
- disposable loopback PostgreSQL, Qdrant, Caddy, OpenTelemetry, provider stubs, and reranker stubs;
- bounded calls to the already-approved Qwen3 Coder role only after deterministic/stub evidence is
  green and a separate live-validation command is explicitly run;
- source/test hashes and read-only legacy source inspection; and
- temporary test directories that are removed by the harness.

### Prohibited

- opening, decrypting, copying, exporting, converting, or counting any real legacy chat, project,
  settings, learning, identity, action, credential, DPAPI, Windows Hello, or device-vault store;
- using real conversation text, real project memory, secrets, machine-local ciphertext, or provider
  credentials as fixtures;
- writing to the legacy RunaAI or RunaLab repositories;
- enabling a production route, persistent service, non-loopback listener, LAN/TLS/auth path, spend,
  model download, provider reconfiguration, or runtime model load request;
- learning candidate creation, lesson approval/use changes, project-memory migration, or governed
  action execution;
- Keycloak, OpenFGA, one-time capability, production backup/restore, or cutover work;
- treating Qwen3.6 or the existing live BGE endpoint as passed. Both remain deferred.

## Parity and validation

The exact cases are frozen in `PARITY-CORPUS.json`. Gate 2 is green only when all conditions below
are true.

### Hard thresholds

1. Every hard expectation in every corpus case passes. No safety, authority, scope, isolation,
   provenance, citation, completion-state, effects-empty, or protected-store result may be averaged.
2. General, guarded, and workspace lanes each execute end to end through the shared Gate 2 boundary;
   a static import/wiring check is not lane-execution evidence.
3. Every applicable shared answer gate is exercised in all three lanes. Adding a check to one or two
   lanes while leaving the third unwired is a blocking failure.
4. Cross-participant and cross-project evidence is denied before model delivery. Forbidden-evidence
   canaries must appear zero times on provider, reranker, telemetry, and response wires.
5. Workspace analysis reads exactly the named ranges, cites only supplied ranges, and performs no
   autonomous crawl or extra read.
6. Chat order, branch provenance, project assignment, archive/unread state, and restart continuity
   match the frozen synthetic fixtures. Anonymous/unverified chat remains ephemeral.
7. Project source references never grant workspace access. Project context is typed untrusted and
   cannot expand roots, tools, authority, or settings.
8. Unknown/tampered settings fall back to declared defaults; unknown keys and values are refused.
9. Duplicate request handling still produces one committed answer turn and one terminal workflow
   result. Restart does not replay a completed provider call.
10. Dependency loss, timeout, output limit, honest empty, and explicit fallback complete within the
    request deadline plus the existing 250 ms harness tolerance and remain distinguishable.
11. The selected model role and actual model identity are visible and deterministic for every lane;
    the model cannot self-route.
12. Every response carries `effects: []`. No governed tool or external effect is reachable.
13. Trace canary scanning finds no raw prompt, source content, path, participant/project identifier,
    secret marker, or protected value outside the allowlisted/pseudonymized telemetry contract.
14. Rollback selects the old adapter without changing or deleting legacy state. New synthetic stores
    remain disposable and diagnosable.

### Quality thresholds

- Repeat each model-influenced representative case three times.
- Hard expectations must pass 100% on every repetition.
- At least 90% of representative answer-quality judgments must pass and may not score below the
  frozen legacy comparison.
- Stub success is not live-model success. Live validation, if separately run, is reported distinctly.

### Regression thresholds

- Gate 1 focused, disposable integration, combined, seal, and pinned legacy profiles remain green.
- The safe Gate 2 legacy baseline in `BASELINE-RESULTS-2026-08-21.md` remains reproducible at the
  pinned legacy commit without changing either source repository.
- A new Gate 2 deterministic suite must map each corpus case to at least one executed assertion.

## Stop rules

Stop Gate 2 immediately on any:

- protected-store access or protected/real data in a fixture, log, trace, response, or index;
- participant/project/workspace-root boundary crossing;
- model-selected routing, authority, tool availability, project, or setting;
- answer gate missing from one of the three lanes;
- hidden fallback, hidden dependency loss, invented status, or swallowed citation failure;
- duplicate turn/provider call after commit, non-resumable checkpoint, or rollback failure;
- use of Mastra memory/snapshots as durable truth;
- new persistent service, non-loopback listener, provider reconfiguration, model download, or
  production path; or
- unexplained legacy test retirement or source-pin drift.

## Rollback

Gate 2 begins with no product route enabled. Rollback is therefore:

1. select the legacy observer/adapter in the disposable harness;
2. stop only Gate 2 child processes;
3. retain the failed disposable database long enough for diagnosis if needed;
4. discard only Gate 2 synthetic PostgreSQL/Qdrant/OTel state; and
5. leave legacy RunaAI, RunaLab, production, and every protected store unchanged.

The gate branch may be rejected or deleted because no production or protected state depends on it.

## Approval gates

### Gate 2A — implementation authorization

The steward reviews this scope, corpus, pins, verifier profile, and baseline. Approval authorizes only
the synthetic Gate 2 implementation and verification described here on
`runa2/gate-2-read-only-continuity`.

### Gate 2B — evidence acceptance

After implementation, the steward reviews representative outputs, all deterministic/integration
results, failures/deferments, source drift, cleanup, and rollback evidence. Evidence acceptance is
not merge approval.

### Gate 2C — protected merge

A separate explicit approval is required to merge Gate 2 into `runa2/integration`. Gate 3 remains a
separate decision even after that merge.
