# Fray 4 closure plan and implementation handoff

Status date: 2026-08-20. Execution complete. RunaAI remains paused. This document records the prior
RunaLab work, the nine-step closure plan, its results, and the next implementation to execute.

## Work completed before this plan

RunaLab reconciled the inherited evidence, withdrew lexical semantic grades that could not support
their claims, sealed a calibrated semantic-adjudication protocol, and reran Wave 7 v3 with 97/97
unique attributable hash-bound wire logs. Component bake-offs selected:

- AI SDK plus the OpenAI-compatible adapter for application deadlines and response metadata;
- Caddy as an outer transport guard;
- LangGraph JS with PostgreSQL checkpoints for durable graph state;
- PostgreSQL for relational truth, outbox, idempotency, and workflow persistence;
- Qdrant for vector search with PostgreSQL outbox reconciliation;
- OpenTelemetry SDK plus Collector for correlated telemetry;
- Keycloak OIDC for authentication and OpenFGA for resource authorization; and
- Mastra only for agent/tool composition, not durable or authorization authority.

The raw inherited evidence, corrected Wave 7 evidence, stack bake-off evidence, and synthetic service
state are preserved in private GitHub draft releases with server-reported SHA-256 verification.

## Blocker that this plan addressed

Fray 4 is retrieved data being followed as instruction. Mastra's `PromptInjectionDetector` caught
60/60 planted attacks with zero attacker deeds, but it also blocked 60/60 benign governed actions.
When its detector model disappeared it reported a completed check with no detection and allowed the
deed in 3/3 controls. It is rejected as the authorization boundary for governed tools.

The correction is architectural: suspicious-text classification and action authorization are
different questions. A classifier may provide defense in depth, but only an authenticated,
resource-authorized, one-time capability can permit an effect.

## Nine-step plan

1. Fix deed-based acceptance criteria in `FRAY4-CAPABILITY-PREREGISTRATION.md` and seal them before
   implementation.
2. Preserve typed provenance for authenticated user requests, retrieved documents, memory, tool
   results, system instructions, and model output.
3. Create an immutable normalized action request from authenticated user intent before retrieval;
   bind actor, action, resource, canonical arguments, argument hash, expiry, and idempotency key.
4. Issue a one-time capability only after Keycloak identity and OpenFGA authorization succeed, and
   persist it in PostgreSQL.
5. Put one fail-closed enforcement wrapper around every governed tool. It recomputes the argument
   hash, rechecks state/expiry/authorization, atomically consumes the capability, executes through the
   outbox/idempotency path, and verifies the deed.
6. Run the sealed mutation, replay, expiry, revocation, service-loss, duplicate-delivery, and
   after-deed-failure matrix. Model prose never counts as an effect.
7. Bake off dedicated standard classifiers against malicious, natural-language benign, and
   tool-explicit benign strata. Classifier loss must be observable; classifier output never grants
   authority.
8. Address non-tool steering separately through minimal retrieval, secret references rather than
   secret values, provenance-preserving rendering, output canary/DLP checks, and safe telemetry.
9. Record the final assignment, validate seals/results, preserve the package off-machine, and keep
   security opt-in during development.

## Execution result

All nine steps completed. The integrated capability matrix passed 120/120, the classifier bake-off
selected no candidate, and the scoped non-tool retrieval boundary passed 40/40. Detailed evidence and
the final assignment are in `FRAY4-FINDINGS.md`.

## Next implementation

The completed isolated `bakeoffs/fray4-capability` package provides the planned boundaries. The next
implementation is one RunaLab vertical slice that composes them with the selected stack:

- authenticated request and capability issuance;
- Mastra agent/tool composition through the governed adapter;
- LangGraph PostgreSQL checkpoint authority;
- PostgreSQL outbox/deed plus Qdrant projection; and
- OpenTelemetry correlation and redaction.

Keep security opt-in during development. The composed slice must pass restart, replay, provider
timeout, vector reconciliation, and trace-redaction gates before any RunaAI port is authorized.
