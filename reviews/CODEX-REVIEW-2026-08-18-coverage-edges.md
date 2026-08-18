# CODEX REVIEW — RUNALAB COVERAGE EDGES

Received 2026-08-18 via the steward. Recorded verbatim; the reconciliation lives in COVERAGE.md.

---

BOTTOM LINE

The edges currently listed in COVERAGE.md are mostly real.

However, COVERAGE.md is not yet the complete denominator or "the full surface of the installed base."
It is a strong initial risk-scenario inventory. Several first-class Mastra runtime surfaces and many
important cross-layer edges are missing.

Therefore:

- The named edges are generally legitimate.
- The claim that they are all the edges is not established.
- The "roughly 30% probed" figure is not defensible yet.
- A universal n>=3 completion standard is insufficient.
- The current document should not yet be used as the final migration denominator.

I verified the architectural surface against Mastra's current official documentation and source. I
could not independently verify Runalab's claimed executions because I did not have its repository,
package lock, raw outputs, runner, SEAL files, or result artifacts.

## 1. Assessment of the current sections

AGENT LOOP — listed edges real, section incomplete. Missing: stop-condition behavior; malformed model
events; tool-call format failure; tool succeeds but result serialization fails; cancellation
propagation through model and tool calls; retries causing duplicate tools or effects; dynamic
instructions/tools changing mid-run; resource and token budgets; model fallback during a loop;
process death between tool result and next model turn.

MEMORY — current recall tests useful but test recall quality more than memory lifecycle and
governance. Missing: message edit and deletion; thread/resource deletion; retention expiry; user
export; identity merge and split; stale vectors after correction; source deleted but summary remains;
cross-resource semantic leakage; observational-memory summarization errors; compression losing
negation or prohibitions; model changes affecting summaries; memory unavailable mid-turn; partial
writes across messages, vectors and metadata; correction propagation; concurrent correction and
recall.

RETRIEVAL AND RAG — currently combines several different layers: (1) parsing and chunking; (2)
embedding and indexing; (3) retrieval, filtering, fusion and reranking; (4) context assembly; (5)
answer generation. They need separate surfaces. Missing: metadata filters and namespaces;
access-control filtering before ranking; deletion and tombstones; embedding-dimension mismatch;
embedding-model upgrades; partial index rebuild; duplicate chunks; empty or malformed documents;
tables, code, links and Unicode; household or tenant leakage; citation-to-chunk alignment;
context-budget competition; reranker outage and fallback; vector ties and unstable ordering;
document parser failures; changed documents during indexing; index rollback. "Retrieval 13/13" on
vector retrieval plus hand-assembled context does not characterize the installed @mastra/rag
pipeline.

TOOLS AND MCP — must be separated. The actual path: Agent -> Mastra tool wrapper -> MCP client ->
transport -> MCP server -> external system/effect. The existing section mainly probes the lower
part. Missing native-tool edges: input-schema rejection; output-schema violation; executor throw
before an effect; executor throw after an effect; retry after a successful effect; cancellation;
timeout; tool-name collision; dynamically resolved tools changing; runtime identity/authority not
reaching the executor; malformed, binary or oversized results; error details exposed to the model;
model requests a valid but unauthorized tool; effect succeeds but result recording fails; tool
completion is recorded but the effect failed. Missing MCP edges: protocol negotiation and version
mismatch; transport reconnect; session loss; server restart; resources; prompts; subscriptions where
supported; capability discovery changing; server identity substitution; multiple servers exposing
colliding names; malformed MCP responses; server reports success for a failed effect.

WORKFLOWS — listed edges real and important. Add: step renamed or removed; step input/output schema
changed; workflow code changes without version change; dependency version changes; serialized value
no longer decodes; graph changes after a branch was selected; resume under a different model/tool
roster; migration of old snapshots; snapshot deletion and retention; orphaned suspended runs; two
simultaneous resume requests; resume by the wrong actor; approval expiration; system clock changes
during suspension; cancellation of suspended work; workflow deleted while suspended; effect succeeds
but checkpoint fails; checkpoint succeeds but effect does not begin; compensation fails; nested
cancellation and error propagation.

MODEL AND PROVIDER SURFACE — too narrow. Add: provider throttling; automatic retry behavior;
fallback to another model; model ID/capabilities changing; tool-capable versus non-tool-capable
model; structured-output fallback; tokenizer disagreement; stop-sequence handling; partial streamed
tool calls; malformed provider responses; safety refusal; timeout after the model requests an
effect; context-window rejection; silent output truncation; model unloading and reloading;
concurrent request queueing; cancellation reaching LM Studio; inference endpoint restart; configured
versus actual context length; residency changing during a run; model producing an old tool schema
after a deployment.

STORAGE — much too small. Add: transaction boundaries; partial commits; WAL/checkpoint behavior;
lock contention; busy timeouts; schema migration; old and new processes using different schemas;
disk full before and during commit; filesystem permission loss; database file replacement; backup
consistency while live; restore into a newer version; corruption detection; corruption recovery;
clock skew; duplicate IDs; isolation between threads/resources/runs; deletion propagation; orphaned
rows; compaction/vacuum behavior; encrypted-state availability; key rotation; crash between
coordinated writes to separate stores.

EVALS — correctly identified as a harness gap. Add: scorer determinism; scorer sensitivity; false
positive and false negative rates; evaluator prompt injection; evaluator model outage; evaluator
model sharing errors with the answer model; score-version changes; score provenance; missing raw
evidence; score succeeds while result storage fails; LLM-free metrics tested against known
right/wrong pairs.

PROCESSORS AND GUARDRAILS — correctly identified as entirely unprobed. The important question is not
only whether they block a prompt. Determine exactly which material each processor can observe and
change: original user input; memory; retrieved context; tool declarations; tool arguments; tool
results; intermediate model turns; final answer; streamed partial output; structured output;
workflow state. Test processor order, failure, cancellation, timeout, conflicting processors,
mutation, bypass through streaming, and whether processors run again after resume.

MULTI-AGENT — real but appropriately lower priority until there is a concrete Runa use case. When
tested, include: identity and authority propagation; delegation depth; cyclic delegation;
contradictory agents; malicious agent output; context/provenance loss; cancellation; budget
exhaustion; shared-memory races; one agent invoking another as an MCP tool; network partition;
duplicate delivery; task ownership after coordinator failure.

## 2. Entire first-class surfaces missing from the grid

CENTRAL ORCHESTRATION AND CONFIGURATION — duplicate IDs; missing registration; initialization order;
partial startup; component lifecycle; wrong storage/model resolution; runtime-context propagation;
configuration changes during a run; shutdown while work is active; one failed provider affecting
unrelated components.

SERVER AND TRANSPORT — authentication; authorization; identity propagation; cross-user/run access;
malformed requests; oversized bodies; disconnect; reconnect; CORS/origin behavior; rate limiting;
request IDs; idempotency keys; backpressure; SSE/WebSocket behavior; health versus readiness; API
versioning; internal error serialization; shutdown and draining.

OBSERVABILITY — a separate runtime and governance surface, not merely part of "operations": secrets
or personal data in traces; approval capabilities in spans; exporter outage; exporter backpressure;
duplicate or missing spans after resume; broken trace/run/thread correlation; sampling hiding safety
events; unbounded trace growth; trace ordering after crashes; accidental cloud export in local-only
mode; trace retention and deletion; trace access control; malicious model/tool content poisoning
observability.

DURABLE AGENT, STREAM CACHE AND PUB/SUB — lost events; duplicate events; incorrect order; reconnect
from invalid offset; cache eviction before reconnect; pub/sub outage; two subscribers seeing
different histories; unauthorized subscription; stale subscriber receiving another run; completion
while event persistence fails; event ordering across restart; multiple application instances;
in-memory versus production cache differences.

MODEL ROUTING — if Mastra performs model routing or fallback, treat it separately from individual
model quality: wrong model selected; capability mismatch; fallback violating residency/privacy
policy; routing after provider outage; structured-output/tool requirements ignored; model identity
missing from records; routing policy changes mid-run; billing or external-provider boundary
violations.

VERSION AND DEPENDENCY EVOLUTION — package upgrade; package downgrade; lockfile drift; storage
schema compatibility; snapshot compatibility; serialized memory compatibility; changed default
settings; changed retry behavior; provider SDK update; MCP protocol update; migration rollback;
mixed-version processes.

## 3. Adversarial surface is real but incomplete

Also add: system-prompt exfiltration; internal-state exfiltration; tool-description injection; MCP
prompt/resource substitution; Unicode and encoding concealment; malicious filenames and metadata;
oversized-payload denial of service; parsing/decompression bombs; symlink traversal;
time-of-check/time-of-use filesystem changes; SSRF; approval confusion between similar actions;
expired approval replay; approval applied to modified arguments; runtime-context authority
escalation; run/thread identifier guessing; evaluator prompt injection; observability poisoning;
malicious workflow snapshots; secret crossing from one lane or household member to another;
retrieved content modifying memory; tool output modifying long-term memory; memory poisoning later
authorizing an effect.

Wave A needs a real threat model: assets; actors; trust zones; entry points; authority boundaries;
prohibited outcomes; expected mitigations. Without that, the adversarial section also lacks a stable
denominator.

## 4. The "30% probed" number is not supportable

The document does not define a stable total number of cells. Some rows contain one behavior
(restart survival); other rows hide large Cartesian products (depth x configuration; document type x
chunking x size x overlap; load x concurrency x failure timing; schema type x nesting x model x
context). Counting both as one cell makes the percentage arbitrary. Adding the missing
orchestration, server, observability, durable-stream and versioning surfaces also changes the
denominator substantially. Remove the 30% statement. Replace it with two measures: (1) interface
coverage — installed public operations exercised over total installed public operations
inventoried; (2) risk-scenario coverage — preregistered scenarios executed over total preregistered
scenarios. Also report: number of unique cases; number of repeated runs; number of cells with raw
evidence; number with held-out labels; number that are deterministic contracts; number that are
stochastic behavioral measurements.

## 5. n>=3 is not a universal completion standard

Three repetitions can reveal obvious instability but cannot establish reliability. Use
evidence-specific completion rules. Deterministic code: exercise every meaningful branch, invariant
and failure path; repetition adds little unless concurrency or timing is involved. Crash and
recovery: inject failure at every persistence/effect boundary; repeat enough to exercise scheduling
variation. Concurrency: controlled interleavings plus sustained stress. Model behavior: choose
sample size for a stated confidence/error target; do not claim a rate from three generations.
Retrieval: many unique, sealed held-out questions; repeating the same question is not adding
independent cases. Security: explicit attack families and invariants; do not average a severe
bypass away. A pass must state: what was varied; what remained fixed; unique cases; repetitions;
expected invariant; raw evidence; confidence or deterministic completeness basis.

## 6. How to capture all the edges

Do not brainstorm one giant permanent list. Generate the denominator systematically from the
installed base.

- PHASE 1 — FREEZE THE BASE: exact git commit; package-lock digest; Node version; operating system;
  installed package names and versions; LM Studio version; model and embedding identifiers; storage
  schema version; enabled Mastra components; configuration digest; Home and Control hardware/runtime
  profiles. No coverage claim applies outside that frozen base.
- PHASE 2 — INVENTORY PUBLIC SURFACES: for every installed package, extract exported classes,
  functions, public methods, configuration options, event types, storage domains, network routes,
  callbacks, lifecycle hooks, extension interfaces. Sources in priority order: installed TypeScript
  declaration files; package export maps; official API documentation for the pinned version; source
  code; existing Runalab calls and adapters. Create MACHINE-SURFACE.json with stable surface IDs.
- PHASE 3 — DRAW THE RUNTIME GRAPH: components, boundaries, durable writes; every node, edge and
  durable write becomes a coverage object.
- PHASE 4 — GENERATE FAILURE EDGES MECHANICALLY: for every operation and edge, the standard
  question families — input, timing, dependency, persistence, concurrency, authority,
  observability, versioning.
- PHASE 5 — TRACE RUNTIME PATHS: instrument one representative run per Runa migration use case;
  distinguish installed / exists / called directly / on the real migration path / exercised on that
  path. An isolated unit call does not prove an assembled runtime edge.
- PHASE 6 — BUILD A RISK REGISTER: impact, likelihood, detectability, governance relevance,
  migration dependency, test method, required sample/completeness rule. Prioritize by risk.
- PHASE 7 — SEAL CORPORA AND TEST DEFINITIONS before implementation; no undocumented
  co-development.
- PHASE 8 — CAPTURE RAW EVIDENCE per run: surface and scenario IDs, frozen-base digest, runner
  commit, inputs, raw outputs, events, tool calls, storage changes, traces, fault injection point,
  result, reason, environment errors separately, artifact digests. A summary without raw evidence is
  not a completed cell.
- PHASE 9 — MAINTAIN TRACEABILITY: installed API -> runtime graph edge -> risk scenario -> test ->
  raw run -> finding -> migration requirement -> adopted/custom decision, and the reverse: custom
  Runa component -> exact stock failure that justified it. No custom component admitted without that
  reverse link.
- PHASE 10 — AUTOMATE DRIFT DETECTION on dependency or configuration change; invalidate affected
  results; require targeted reruns. Coverage belongs to a frozen version.

## 7. Required artifact set

BASE-MANIFEST.json; MACHINE-SURFACE.json; RUNTIME-GRAPH.json; THREAT-MODEL.md; EDGE-REGISTER.json;
COVERAGE.md (generated or mechanically checked against the register, not the authoritative database
itself); PROVING.md (methodology and completion rules); corpora/<wave>/ (sealed); artifacts/runs/
<run-id>/ (raw evidence); FINDINGS.md or FRAY-MAP.md (findings backed by exact run IDs);
MIGRATION-TRACEABILITY.json; COVERAGE-DRIFT.json.

## 8. Corrected wave order

Wave 0 — freeze and inventory. Wave 1 — confirm current critical findings (repeat migration-critical
n=1 results; validate raw evidence; resolve the working-memory anomaly; build the two omitted tool
tests). Wave 2 — governance and adversarial boundaries. Wave 3 — durable execution and approval.
Wave 4 — tools, MCP and processors. Wave 5 — storage, concurrency and operations. Wave 6 — RAG and
memory lifecycle. Wave 7 — model/provider ceilings. Wave 8 — multi-agent, only after Runa has a
concrete need. Regression is continuous across all waves; it is not postponed to a final wave.

## 9. Required language changes to COVERAGE.md

Change "This document is the denominator." to "This document is the initial human-reviewed
risk-scenario inventory. The authoritative denominator is EDGE-REGISTER.json, derived from the
frozen installed surface and runtime graph." Change "the full surface of the installed base" to
"the currently identified migration-relevant surface of the frozen base" until machine inventory and
traceability are complete. Remove "roughly 30% probed" until there is a stable denominator and
cell-expansion rule. Replace the universal n>=3 wave-completion rule with preregistered
evidence-specific completion rules linked to raw evidence on the exact frozen base.

## Final verdict

COVERAGE.md is a good and unusually candid correction to the earlier implication that the base was
mapped. Its named edges are generally real. Its completeness claim is not yet real. Freeze the
installed base, machine-extract its public surface, draw every runtime and trust-boundary edge,
mechanically generate standard failure scenarios for each edge, trace the real assembled paths, and
maintain a versioned edge register linked to raw evidence and migration decisions.

The governing rule: no stock-framework limitation justifies custom Runa code unless the exact frozen
surface, failing edge, raw evidence, and unmet Runa requirement are linked together. And the
reverse: no framework pass justifies migration unless it was measured on the real assembled path
Runa would use.
