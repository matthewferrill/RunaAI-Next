# Gate 1 trace redaction and retention policy

Gate 1 accepts synthetic conversations only. OpenTelemetry is diagnostic transport, not an audit,
conversation, identity, or workflow authority.

## Allowlisted attributes

- trace/span identifiers and parent relationship;
- route and lane from a fixed enum;
- component and operation names from fixed enums;
- model role, provider adapter name, and configured model identifier;
- completion reason, timeout/output-limit booleans, retry count;
- evidence/pass/citation/tool-call counts and bounded size/latency buckets;
- stable verdict/error codes from fixed enums;
- deployment commit and schema versions; and
- HMAC-pseudonymized request, participant, project, and thread identifiers using a key held outside
  code and telemetry storage.

## Always prohibited

Raw or truncated prompts, answers, history, evidence, citation text, file paths, source content,
retrieved instructions, chain of thought, SQL, authorization tuples, bearer tokens, cookies,
credentials, secrets, protected metadata, Windows identities, machine-local paths, and exception
objects before sanitization.

Plain hashes are not an acceptable replacement for identifiers or short secret values. Use keyed HMAC
when correlation is necessary; otherwise omit the attribute.

## Sanitization and failure

- Build spans through a single allowlist function. Arbitrary attribute dictionaries are forbidden.
- Map exceptions to stable error codes and bounded component names; discard messages and stacks by
  default.
- Treat exporter failure as visible degraded telemetry, not as answer failure and not as permission to
  buffer raw payloads.
- Business facts such as consent, authorization, idempotency, source revocation, and completed deeds
  belong in PostgreSQL audit records with their own retention and access policy.
- Tests seed canary secrets and private-looking paths and fail on any appearance in exported spans.

## Gate 1 retention

- synthetic traces only;
- local/disposable collector only, no external exporter;
- maximum retention 24 hours after a test run;
- deletion by discarding the disposable collector volume; and
- zero real conversation ingestion.

Production retention, access, legal obligations, and any remote collector are deferred to Gate 5 and
require a separate steward decision.
