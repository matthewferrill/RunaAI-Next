# Gate 4 synthetic closeout scope and green criteria

Status: frozen before implementation

This contract accelerates the remaining synthetic Gate 4 work without widening the protected-data,
network, service, production, or cutover boundary. It covers three independently reversible decisions:

1. Gate 4C-3A: deliver selected approved knowledge to every read-only answer lane;
2. Gate 4D: prove compatibility for the one selected legacy product setting and disposition provider
   metadata; and
3. Gate 4E: measure whether approved-knowledge indexing is justified, building no index unless the
   frozen threshold is met.

The standing steward charter permits this synthetic train to continue without ceremony between its
sections. A failure of a hard criterion stops only the affected section unless it invalidates shared
answer or data boundaries.

## Shared boundaries

- Use synthetic fixtures only. Do not open a protected store or retain a protected value.
- Do not download a model, activate networking, start a persistent service, change production, or
  alter the legacy RunaAI repository.
- PostgreSQL remains authoritative for migrated records. Approved knowledge remains derived from an
  authenticated accepted Gate 4B journal.
- Selected knowledge is untrusted advisory answer context. It is not evidence, a citation source,
  permission, policy, identity, learning, or action authority.
- Deterministic denials, explicit workspace-source limits, read-only effects, project scope, and
  provider-role routing remain authoritative.
- Every new component is optional and fail-closed. Removing or disabling it restores the previous
  accepted behavior without data conversion.
- Exact paths are staged. No force push, history rewrite, broad staging, or source-repository merge is
  permitted.

## Gate 4C-3A — synthetic answer-lane delivery

### Entry criteria

- Gate 4C-1 projection and Gate 4C-2 protected aggregate comparison are accepted on integration.
- The active protected library boundary is aggregate-only: 53 lessons with exact scope parity.
- Gate 1 and Gate 2 read-only behavior is green before modification.

### Work

- Add a hard-branded synthetic projection source and an optional approved-knowledge adapter.
- Derive explicit participant, project, and lane-owned capability scope before lane translation.
- Deliver no more than six lessons and 1,200 estimated tokens as a distinct provider advisory field.
- Never send keyed provenance references to the model or expose lesson text in response metadata or
  telemetry.
- Permit advisory-only answering when project evidence is honestly empty; leave citations reserved
  for project evidence.
- Return aggregate/keyed delivery receipts that say delivery is not proof of answer compliance.

### Hard green criteria

- General, guarded, research, and workspace lanes receive relevant context under their exact scope.
- Unverified personal, mismatched participant/project, undeclared capability, session, evaluation,
  training-candidate, inactive, stale, lifecycle-due, forbidden, or fabricated context never reaches
  the provider.
- Protected/effect/cross-project/workspace denials execute before advisory delivery and effects remain
  empty.
- A relevant lesson can improve a synthetic answer with zero project evidence. No relevant lesson is
  byte-compatible with the prior honest-empty path except for the new aggregate receipt.
- Workspace reads exactly the supplied source ranges and cites only recognized project evidence.
- Provider timeout/output limits make no partial success claim. Duplicate execution invokes the
  provider once; a new request rechecks the projection.
- Six-lesson/1,200-token limits, aggregate-only telemetry, and no raw lesson/identifier leakage pass.
- Disabling the adapter restores the accepted Gate 2 behavior without migration or cleanup.

## Gate 4D — selected settings and provider-metadata disposition

### Entry criteria

- Gate 2 PostgreSQL settings continuity and Gate 3 governed setting change remain green.
- `defaultIntelligenceLevel` is the only persisted legacy product setting in selected-core scope.

### Work

- Reuse the existing Gate 2/3 setting contract and PostgreSQL authority.
- Add a synthetic compatibility mapper for absent, Low, Medium, and High legacy values, bound to an
  explicit target participant.
- Record dispositions instead of recreating the legacy provider catalog, endpoints, model choices,
  credentials, provider cards, Gemini integration, or unfinished model-residency scheduler.
- Defer the one protected settings comparison/import until target identity binding exists and it can
  share a later bounded owner campaign.

### Hard green criteria

- Absent, malformed, unknown, or invalid input resolves safely to Medium; Low, Medium, and High map
  exactly.
- Only `defaultIntelligenceLevel` can be emitted, and participant binding is mandatory.
- Replay is idempotent; changed-input replay is refused; injected failure restores the prior value;
  rollback affects only the imported Gate 4D row.
- No credential, endpoint, provider/model value, raw path, identifier, or secret-like field appears in
  retained output.
- Existing Gate 2/3 setting, transaction, replay, and rollback cases remain green.

## Gate 4E — approved-knowledge index build-or-skip measurement

### Entry criteria

- Gate 4C direct scoped selection is green on the answer lanes.
- Measurement uses a deterministic synthetic library shaped like the protected aggregate only; it
  contains no protected lesson or identifier.

### Work

- Measure the direct selector on lexical positives, zero-token-overlap paraphrases, ambiguity, honest
  misses, cross-scope attacks, and lifecycle/forbidden attacks.
- Record current-scale latency and correctness and growth remeasurement triggers.
- Do not reuse the project-only Qdrant adapter for approved knowledge.
- Do not build Nomic/Qdrant/BGE integration unless the frozen build threshold is met.

### Hard safety criteria

- Zero cross-scope, inactive, held, superseded, forbidden, or honest-miss selections.
- Exact six-lesson/1,200-token enforcement and identical ordered results across three repetitions.
- No raw lesson, participant/project identifier, or unkeyed digest in retained measurement output.
- Changed authority/lifecycle boundaries deny a derivative; a dependency failure can fall back only to
  the already-scoped direct selector and must report degradation.

### Build thresholds

Nomic/Qdrant is justified only if a sealed vector arm improves paraphrase Recall@6 by at least 15
percentage points over the direct selector, regresses no lexical or safety case, preserves zero
honest-miss false positives, and keeps current-scale p95 retrieval at or below 250 ms. Windowed BGE is
justified only with a further five-point Recall@6 gain, no safety regression, and p95 at or below 750
ms. Improvement only at 530 or 5,300 lessons creates a future remeasurement trigger, not a current
build authorization.

The synthetic train has no model endpoint or vector service authorization. Therefore the executable
Gate 4E result in this train is the deterministic baseline plus a documented **skip** decision. A live
vector arm remains a later bounded measurement, not an inferred build requirement.

## Combined validation and closeout

- Run focused Gate 4C-3A, Gate 4D, and Gate 4E tests.
- Run Gate 1–4 deterministic regressions, disposable integrations that require no protected data, the
  Gate 0 verifier, seals, and pinned legacy suites.
- Run `git diff --check`, scan retained evidence for disallowed fields, and confirm both source
  repositories remain unchanged.
- Commit exact paths, push the short-lived branch, and open a draft pull request into
  `runa2/integration` only after local review is clean.

Gate 5 operations/security, E3 disposition, E4/device-vault handling, production identity binding,
protected setting import, retained data migration, and cutover remain outside this contract.
