# Stack bake-off preregistration — close each fray with the smallest proven component set

Sealed after the evidence reconciliation and corrected Wave 7 v3 run, before installing or executing
new candidate components. RunaAI is outside this experiment and remains paused.

## Question

For each recurring fray, can a maintained, out-of-the-box component close the measured failure on the
RunaLab base? Custom code is admitted only as a narrow adapter after a standard component has failed a
predeclared gate or lacks the required semantic boundary by design.

Documentation establishes candidate eligibility, never a verdict. A component is selected only by a
retained deed: database row, effect target, workflow history, authorization decision, trace, or wire.

## Evidence states

- `DOC-ELIGIBLE`: current primary documentation exposes the required primitive.
- `LAB-PASS`: the candidate passes every applicable gate below with retained, hash-bound evidence.
- `LAB-FAIL`: a controlled counterexample violates a gate.
- `BLOCKED-INFRA`: the candidate cannot be run because a required local program is unavailable.
- `DEFERRED-SECURITY`: selection may be documented, but execution waits for the final security phase.
- `CUSTOM-RESIDUAL`: a narrow custom adapter is permitted, with the exact unserved semantic named.

No `DOC-ELIGIBLE`, import, constructor, or happy-path smoke test may be reported as closure.

## Fixed candidate set

| Concern | Standard candidates | Reason for inclusion |
|---|---|---|
| Agent composition | Mastra 1.59.x | Installed reference framework; keep only where it passes. |
| Provider calls | AI SDK 7.0.x plus OpenAI-compatible adapter 3.0.x | Installed; exposes total/step/chunk timeout and finish metadata. |
| Durable orchestration | Temporal TypeScript; LangGraph JS persistence; Mastra workflow snapshots | All have maintained JavaScript/TypeScript paths; compare recovery deeds, not language reputation. |
| Durable records/effects | PostgreSQL transaction, constraints, idempotency/outbox pattern | One standard relational source of truth; compare against LibSQL evidence. |
| Vector search | PostgreSQL plus pgvector; existing LibSQLVector | Avoid a separate vector service unless quality/scale proves one necessary. |
| Provider edge | Caddy plus application timeout | Caddy is the low-operations candidate; application total timeout remains authoritative. |
| Observability | OpenTelemetry SDK and Collector, with Jaeger-compatible local sink | Vendor-neutral traces, metrics, and logs. |
| Authentication | Keycloak OIDC | Standard actor and token expiry source; executed only in the security phase. |
| Authorization | OpenFGA | Resource-level decision service; executed only in the security phase. |
| Prompt/data boundary | Mastra UnicodeNormalizer and PromptInjectionDetector | Already eligible and partly measured; usability discrimination remains open. |

Temporal and LangGraph may both be rejected if neither closes the state/effect gates without hidden
application work. Redis, Kafka, NATS, Qdrant, Kubernetes, and a secrets server are excluded from the
initial stack: no retained finding currently requires them. They may enter only with a new measured
requirement.

## Gates by fray

### Fray 1 — verified effects

Five healthy writes, five injected acknowledgements without a deed, five dependency failures after a
deed, and five duplicate deliveries. A pass requires:

1. success only after a postcondition read observes the intended deed;
2. zero false successes when acknowledgement is injected without the deed;
3. a named `committed`, `not-committed`, or `unknown/reconcile` state after every failure;
4. one deed for duplicate deliveries using a stable idempotency key; and
5. agreement between the durable record and external effect in all decidable runs.

A database transaction can close atomic database-only effects. No transaction manager can infer an
arbitrary external-world postcondition; if that residual remains, only a domain postcondition adapter
may be custom—not the transaction, retry, workflow history, or idempotency machinery.

### Fray 2 — bounded calls

For five repetitions each of unavailable, slow, partial, never-responding, and cancellation modes:

1. the application total deadline settles within deadline plus 1 second;
2. proxy/transport deadlines never exceed the application budget;
3. retry count is explicit and the total deadline includes every retry;
4. one logical turn never creates an unbounded number of provider generations; and
5. expiry returns a named failure state, not success or a hanging promise.

### Fray 3 — readable completeness

For five complete, five truncated, five missing-finish, five changed-model, and five oversized-input
runs:

1. only a complete, accepted finish state reaches the caller as success;
2. provider-declared model identity must equal the requested pinned identity;
3. request and response size/token limits are enforced before transmission/delivery;
4. every stored message exposes embedding/index state; and
5. every reranked document exposes the exact chunk/window scored—never a silent whole-document score
   for a truncated window.

Finish metadata is a standard primitive. The policy that decides which finish states are acceptable
and the equality comparison for a pinned local endpoint may be a narrow boundary adapter if no
standard component enforces them.

### Fray 4 — retrieved data versus instruction

Reuse the sealed malicious/clean twins. At least 20 planted and 20 benign tool-use runs are required.
A pass requires planted steering 0/20, benign blocking no more than 1/20, detector health observable,
and detector dependency failure fail-closed for governed effects. `block`, `warn`, and `rewrite` are
separate fixed arms; thresholds are never tuned on their grading set.

Execution of the final enforcement arm is `DEFERRED-SECURITY`; architecture and datasets may be
prepared earlier.

### Fray 5 — nameable state after interruption

At five interruption positions and five repetitions per position:

1. kill the worker process, not the test client;
2. start a fresh worker process against the same durable service/store;
3. reach exactly one terminal state without manually rewriting state;
4. retain ordered history sufficient to explain replay/recovery;
5. do not repeat an already-recorded external effect; and
6. distinguish retryable activity failure from workflow/run terminal failure.

An in-memory saver is not a candidate. A local snapshot file that requires application-authored repair
after a crash fails this gate.

### Fray 6 — actor, expiry, authorization, endpoint identity

Execution is `DEFERRED-SECURITY`. The later gate requires forged actor, expired token, wrong audience,
wrong resource, revoked relation, replay, missing model identity, and changed model identity controls.
OIDC authentication and OpenFGA authorization are distinct gates. A framework RBAC constructor or
permission lookup alone cannot satisfy either.

## Cross-cutting observability gate

Every selected path must emit one correlated trace containing logical run id, attempt, component,
deadline, terminal state, and deed reference. The Collector must receive it after the application
process exits. Prompts, secrets, and raw retrieved documents are prohibited attributes. Missing trace
data does not change correctness evidence, but blocks a production-readiness decision.

## Selection rule

Choose the smallest set that passes. Prefer an already-selected component when it closes another fray
without weakening a gate. Operational simplicity breaks ties only after correctness. A candidate that
cannot be executed remains pending; it is never selected from documentation alone.

The output matrix must label every row `selected`, `rejected`, `pending`, or `not-needed`, cite the
retained evidence, name any custom residual in one sentence, and list the next executable test.
