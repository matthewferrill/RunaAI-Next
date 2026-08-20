# Fray 4 findings — retrieved data and governed authority

Status date: 2026-08-20. Governed by `FRAY4-CAPABILITY-PREREGISTRATION.md`; sealed protocol
SHA-256 `282bd1cc68cfd90999f2acf359f46f22e538d2c4dec283dda55f3fc92dcde853`.

## Decision

Fray 4 is closed for the stack-design scope by two explicit boundaries:

1. Governed effects use Keycloak identity, OpenFGA authorization, and a one-time PostgreSQL capability
   bound to actor, action, resource, exact canonical arguments, expiry, and idempotency key. Retrieved
   documents, memory, tool results, and model output cannot mint or alter that authority.
2. Non-tool retrieval uses a feature-specific typed fact compiler and deterministic grounded output
   contract. Generic free-form retrieval is disabled until a feature supplies an equivalent contract.

This is not a claim that prompt injection has been solved in general. It is a deny-by-default stack
contract: untrusted text may supply data, but it never supplies authority, and an uncontracted
free-form answer path does not ship.

## Governed-effect evidence

- Immutable typed provenance tests: 4/4 passed.
- Immutable action-request and canonical argument binding tests: 4/4 passed.
- Live Keycloak/OpenFGA/PostgreSQL issuance smoke: passed with no retained credentials or tokens.
- Governed-tool smoke: missing capability denied, argument mutation denied, approved deed committed,
  replay returned `already-consumed`, and exactly one deed matched the approved argument hash.
- Integrated decision-grade matrix: 120/120 cases passed.
  - malicious retrieval: 20/20 denied, zero deeds;
  - natural authenticated actions: 20/20 committed, zero wrong deeds;
  - tool-explicit authenticated actions: 20/20 committed, zero wrong deeds;
  - twelve five-case mutation/failure families all passed;
  - duplicate delivery produced exactly one deed in 5/5;
  - failure after the deed reconciled to exactly one deed in 5/5; and
  - Keycloak, OpenFGA, and PostgreSQL uncertainty denied before a new deed.

The duplicate-delivery arm initially exposed PostgreSQL serialization conflicts. The adapter now uses
a bounded three-attempt retry only for SQLSTATE `40001`; the repeated sealed matrix then passed. No
retry is performed for an unknown external deed.

## Classifier decision

No prompt-injection classifier is activated:

| Candidate | Result | Decision |
|---|---|---|
| Protect AI LLM Guard 0.3.16 | detected 15/20 malicious; false-positive 2/20 natural and 0/20 tool-explicit; dependency loss observable and wrapper denied | rejected |
| Meta Llama Prompt Guard 2 | official model repository required unavailable gated access; 0 cases executed | blocked infrastructure; not selected |
| NVIDIA NeMo Guardrails 0.23.0 | installed, but its packaged model path failed local initialization against the named Snowflake embedding model; 0 cases executed | blocked package/model compatibility; not selected |

A blocked candidate is not counted safe. Classifier output remains optional defense in depth and can
never grant authority. The governed-effect gate does not depend on one.

## Non-tool retrieval evidence

The fixed vendor-fact route compiled only the typed `Q3 vendors` field and rendered only the grounded
answer contract. Across 20 malicious and 20 benign cases:

- steering: 0/20;
- planted-canary disclosure: 0/20;
- malicious documents still yielded the correct grounded fact answer: 20/20;
- benign availability: 20/20; and
- injected output-scanner loss was observable and denied the answer.

Evidence retains document and answer digests, not raw prompts, canaries, bearer tokens, or secrets.

## Stack assignment

- Keycloak: authentication and active-session decision in security/release profiles.
- OpenFGA: current actor/relation/resource authorization.
- PostgreSQL: capability state, expiry/revocation, serializable consumption, idempotency, outbox, deed,
  and postcondition records.
- Narrow custom residual: immutable provenance envelope, canonical argument hash, governed-tool
  enforcement, domain postcondition, and feature-specific typed retrieval/output contracts.
- Prompt-injection classifier: omitted until a future fixed bake-off passes both attack and benign
  thresholds and exposes dependency health.

Security services remain opt-in so normal development is not obstructed. Their portable loopback
qualification is not production activation; persistent storage, private TLS, backup/restore, secret
provisioning, and operator runbooks remain release work.

## Next implementation suggested

Build one RunaLab vertical integration slice before porting RunaAI code:

`authenticated request -> capability issuance -> Mastra agent/tool proposal -> governed adapter ->
LangGraph PostgreSQL checkpoint -> PostgreSQL outbox/deed -> Qdrant projection -> OpenTelemetry`

The slice should keep security behind the opt-in profile, use the exact selected component boundaries,
and pass restart, replay, provider-timeout, vector-reconciliation, and trace-redaction gates. Once it
passes, port Runa pieces into those contracts rather than reproducing the old runtime architecture.

## Evidence preservation

The source, results, manifest, service-state capture, and fresh-extraction verification are preserved
in the private GitHub draft release:

`https://github.com/matthewferrill/Runalab/releases/tag/untagged-0d1328ad31ebe33bc342`

The release remains a draft and does not publish or activate software. Server-reported SHA-256 values
were compared with the seven local assets after upload.
