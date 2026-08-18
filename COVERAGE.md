# COVERAGE — the migration-relevant surface of the frozen base, and how much has been seen

The steward's direction, 2026-08-18, restated after the session crash: the fray map must cover the
entire base, not a committed slice of it. The deliverable is the full map — every fray, where it
breaks, why it breaks, and what kind of break it is.

**Status of this document, after the Codex review of 2026-08-18
(`reviews/CODEX-REVIEW-2026-08-18-coverage-edges.md`, reconciled the same day): this is the initial
human-reviewed risk-scenario inventory. The authoritative denominator is `EDGE-REGISTER.json`,
derived mechanically from the frozen installed surface and the runtime graph. No statement in this
file is a completeness claim.**

**Wave 0 status (started 2026-08-18, see `wave0/README.md`):** the public surface is machine-extracted
— `MACHINE-SURFACE.json`, 21,831 entries across 105 entry points from the installed declaration
files, 0 extraction failures. The runtime graph is drawn (`RUNTIME-GRAPH.json`, 21 nodes / 24 edges,
each node marked exercised, installed-bypassed, or installed-unexercised). The first mechanical cut
of the register is generated (`EDGE-REGISTER.json`, **345 candidate scenarios**: wave 2 → 104, wave 3
→ 51, wave 4 → 78, wave 5 → 36, wave 6 → 55, wave 7 → 21; by completion rule: deterministic-branches
176, crash-recovery 108, concurrency 36, security 25). `THREAT-MODEL.md` is drafted and awaits steward
ratification — Wave 2 seals nothing before that. Two things Wave 0 has **not** finished, named rather
than hidden: the register currently enumerates graph-edge scenarios only, so it under-counts until
machine-surface operations without a graph edge are expanded into it; and `BASE-MANIFEST.json` must be
generated on Control, because a manifest collected in a cloud clone records the wrong host and an
unreachable endpoint (one was generated here to test the collector and discarded for exactly that
reason). The first version of this
document claimed to be "the denominator" and "the full surface of the installed base," and carried a
"roughly 30% probed" figure; the review showed the percentage had no stable denominator (rows of one
behaviour counted the same as rows hiding Cartesian products) and the surface list was missing
first-class subsystems. Both claims are withdrawn, not softened.

## Reconciliation record

Verified against this repository and the installed packages before acting on the review:

- The quotes the review attributes to this document were accurate.
- The two committed-but-never-built tool axes (mid-chain failure, timeout) are real: they appear in
  PROVING.md's committed axis list and in no corpus.
- The missing first-class surfaces are present in the installed `@mastra/core@1.59.0` export map
  (`./server`, `./agent/durable`, `./observability`, `./telemetry`, `./network/vNext`, `./mastra`,
  `./processors`, storage domains) — the omission was this document's, not the review inventing
  surface.
- The universal n≥3 wave-completion rule is replaced by evidence-specific completion rules (below).
- The review's wave order is adopted; it corrects a real flaw here — repetition was scheduled last,
  while the migration-critical findings (048 snapshot tamper, 050 mid-effect crash) are n=1 and must
  be confirmed before anything is built on them.

One caveat carried into the register build: some edges the review proposes reference capabilities
whose presence in the pinned versions is unverified from here (model routing, several
memory-lifecycle operations). The review's own Phase 2 resolves this — an edge enters the register
only if the frozen installed surface actually carries the operation; a proposed edge with no
installed surface is recorded as not-applicable-at-this-version, never silently dropped.

## Honest position after the v2 sweep — reported without a percentage

- 53 unique cases, 0 repeated runs, covering the grid rows marked below; nearly every verdict is n=1.
- 2 committed axes never built (tool mid-chain failure, tool timeout) — named, not silently shrunk.
- Cells with raw evidence: the v2 outputs and logs in `probes/results/` cover the 49 runner cases
  and 4 workflow cases. Cells with held-out labels: the 53 sealed-corpus cases. Deterministic
  contracts vs stochastic measurements: not yet classified — the register assigns this per scenario.
- "Retrieval 13/13" is a verdict on the vector-store + hand-assembled-context path; the installed
  `@mastra/rag` document pipeline has never been exercised.
- Whole subsystems unprobed: processors/guardrails, streaming/abort, concurrency, storage failure
  modes, most of the workflow feature set, the adversarial surface, `@mastra/evals` (open harness
  gap), multi-agent networking — and, per the review, orchestration/configuration, server/transport,
  observability, durable-agent stream/cache/pub-sub, model routing (existence to be verified), and
  version/dependency evolution, which the first inventory missed entirely.

Coverage is reported as the review's two measures, and no other:

**Interface coverage — 152 / 7,026 callable operations, a ceiling of 2.16%** (`SURFACE-COVERAGE.json`,
generated). Of 21,831 inventoried surface entries, 7,026 are callable operations (functions, classes,
methods); the remaining 14,805 are types, interfaces and aliases, excluded because they cannot be
probed. Of 100 installed entry points the lab has ever imported **12**. It is a *ceiling* by
construction: the method counts an operation as referenced when the lab imports its module and writes
its name anywhere, so it over-counts, and real coverage is at most this. It establishes only the
review's level 3 — "Runalab calls it directly." Levels 4 and 5 (the real Runa migration path would
call it; a scenario exercised that path) require runtime tracing and are not claimed. The single
starkest line: `@mastra/core/storage` holds 1,172 operations and has never been imported.

**Risk-scenario coverage — 0 / 345 preregistered scenarios executed.** The register exists
(`EDGE-REGISTER.json`); no wave has run against it. The 53 v2 cases were probed before the register
existed and are not counted as scenario executions; Wave 1 re-derives the migration-critical ones as
preregistered scenarios with raw evidence linked to the frozen base.

## Scope ruling

In scope: every subsystem the assembled base runs or that Runa would rely on after migration —
including the surfaces the review restored: central orchestration and configuration (`Mastra`
object, DI, lifecycle), server and transport, observability/telemetry as its own governance surface,
durable agent with stream cache and pub/sub, model routing if the pinned version performs it, and
version/dependency evolution as a cross-cutting edge family. Out of scope, with the reason on the
record: deployer/bundler/editor/browser (build-time tooling), tts/voice (no voice in this base), a2a
beyond `network/vNext` (no second estate), ee/license enterprise surfaces (not configured). A
subsystem leaves this list only by steward decision, recorded here.

Coverage status must always distinguish, per the review's Phase 5: package installed / API exists /
Runalab calls it directly / the real Runa migration path would call it / the scenario exercised that
real path. An isolated unit call does not prove an assembled runtime edge.

## The risk-scenario inventory

The grids below stand as the human-readable inventory that seeded the register — real edges, not the
complete set. Rows are not comparable units: some are single behaviours, some are scenario families
that the register expands (depth × config, document type × chunking × size, load × concurrency ×
failure timing). The full per-section edge lists from the review are in the review file and enter
the register in Wave 0; they are not duplicated here.

### Probed so far (all n=1 unless marked)

| subsystem | probed rows |
| --- | --- |
| memory | recall depth × 4 configs × 5 depths (20 cells); contradiction; thread isolation; resource isolation; restart survival; temporal order; growth bound @40 turns |
| retrieval (vector path) | verbatim; paraphrase; conceptual; multi-hop; hard-negative; scaling 60/300/1000; topK 1/3/10; staleness (finding: no freshness signal); reranked |
| tools (MCP lower path) | chained read; missing-file honesty; write-then-read; truncation needle; unavailable server |
| workflows | resume-no-reexecute (PASS); snapshot tamper (FAIL — fray 4); single-use approval (PASS); crash-during-effect (MIXED — fray 5) |
| model | instruction retention; 40k-char saturation; structured validity (1 simple schema × 10); long output |
| evals | one metric attempted — OPEN harness gap, no verdict |

### Known-unprobed families (seed list; the register is the authority)

- **Agent loop:** long-horizon loops, maxSteps exhaustion, mid-loop error recovery, tool
  hallucination, parallel calls, streaming, abort/cancel, retries duplicating effects, process death
  between tool result and next turn.
- **Memory lifecycle and governance:** deletion, retention, correction propagation, stale vectors
  after correction, cross-resource semantic leakage, processors, concurrent writers, poisoned facts
  recalled as truth.
- **RAG as installed:** the actual `@mastra/rag` pipeline split into parsing/chunking, embedding/
  indexing, retrieval/filtering/rerank, context assembly, and answer generation — each its own
  surface, per the review.
- **Native tools vs MCP, separated:** schema rejection and violation, executor throw before/after
  effect, retry after effect, effect/record atomicity in both directions, timeout, cancellation,
  name collisions, authority not reaching the executor; MCP transport/protocol edges, resources and
  prompts, server identity substitution, success reported for a failed effect.
- **Workflows:** versioning and schema drift across suspension, duplicate resume, resume by the
  wrong actor, approval expiration, effect/checkpoint atomicity both directions, compensation
  failure, nested cancellation, evented and durable variants.
- **Model/provider:** throttling, retry and fallback behaviour, streamed partial tool calls,
  malformed responses, silent truncation, endpoint restart mid-run, configured vs actual context,
  concurrent request queueing.
- **Storage:** transaction boundaries, partial commits, WAL behaviour (already a repeated harness
  signal), lock contention, schema migration, disk full, corruption detection and recovery,
  cross-store coordinated-write crashes.
- **Orchestration/config, server/transport, observability, durable stream/cache/pub-sub, version
  evolution:** the review's §2 lists, entering the register in Wave 0.
- **Adversarial:** the injection family (retrieved docs, tool outputs, persisted memory, tool
  descriptions, MCP prompt/resource substitution), exfiltration (system prompt, internal state),
  authority confusion/replay/modified-arguments, traversal and TOCTOU, SSRF, encoding concealment,
  evaluator and observability poisoning, cross-lane secret movement. **The adversarial wave requires
  a written threat model first — assets, actors, trust zones, entry points, authority boundaries,
  prohibited outcomes, expected mitigations — or it has no denominator either.**

## Completion rules — evidence-specific, preregistered per scenario

The universal n≥3 rule is withdrawn. A wave is complete when each of its scenarios satisfies its
preregistered evidence-specific completion rule and has raw evidence linked to the exact frozen
base:

- **Deterministic code paths:** every meaningful branch, invariant, and failure path exercised;
  repetition earns nothing unless timing or concurrency is involved.
- **Crash and recovery:** failure injected at every persistence/effect boundary, repeated enough to
  exercise scheduling variation.
- **Concurrency:** controlled interleavings plus sustained stress, not repetition alone.
- **Model behaviour:** sample size chosen for a stated confidence/error target before the run; no
  rate claimed from three generations.
- **Retrieval:** many unique sealed held-out questions; repeating one question is not adding cases.
- **Security:** explicit attack families with invariants; a severe bypass is never averaged away.

Every pass states what was varied, what stayed fixed, unique cases, repetitions, the expected
invariant, the raw evidence, and its confidence or completeness basis. An environment error is never
a finding. A cell nobody could probe is NOT PROBED, never inferred from a neighbour.

## The waves (per the review; regression is continuous, not a final wave)

- **Wave 0 — freeze and inventory.** Pin the base (BASE-MANIFEST.json: commit, lockfile digest, Node
  version, OS, package versions, LM Studio version, model and embedding identifiers, storage schema,
  enabled components, config digest, hardware profiles). Machine-extract the public surface
  (MACHINE-SURFACE.json) from installed declarations and export maps. Draw the runtime graph
  (RUNTIME-GRAPH.json). Write THREAT-MODEL.md. Generate EDGE-REGISTER.json. COVERAGE.md becomes a
  summary mechanically checked against the register.
- **Wave 1 — confirm current critical findings.** Repeat the migration-critical n=1 results (048,
  050, the memory matrix), validate their raw evidence, resolve the working-memory anomaly, build
  the two omitted tool tests.
- **Wave 2 — governance and adversarial boundaries** (threat model first).
- **Wave 3 — durable execution and approval** (crash boundaries, atomicity, versioning, durable
  stream/cache/pub-sub).
- **Wave 4 — tools, MCP, and processors** (native vs MCP separated; processor visibility and
  bypass).
- **Wave 5 — storage, concurrency, and operations. Run on BOTH hosts, deliberately.** The steward's
  ruling of 2026-08-18: Runa stays on Control and calls RUNA-HOME for inference, moving only if a
  bottleneck forces it. Control is therefore the faithful base — it is the production topology, LAN
  hop included — and every other wave runs there and only there. Wave 5 is the exception because its
  scenarios are the ones where the probe host stops being a dispatcher and becomes the subject: on
  Control's 6 cores, "the stack frays under concurrency" and "this box ran out of cores" produce
  identical-looking results and mean opposite things for the migration. Running the same load
  scenarios on HOME's 72 cores separates them, and the GAP between the two hosts is the evidence the
  steward's own condition needs — it measures whether the production shape has headroom, rather than
  leaving "forced to change" as a judgement call. Control's numbers are the production answer; HOME's
  are the ceiling; neither is reported without naming its base.
- **Wave 6 — RAG and memory lifecycle** (the actual installed pipeline, staged).
- **Wave 7 — model/provider ceilings** (statistically sized).
- **Wave 8 — multi-agent**, only after Runa has a concrete need and the single-agent foundation
  passes.

Corpus v2 is the standing regression suite from Wave 1 onward; every admission re-runs it, and a
regression anywhere on the old map blocks the admission.

## Governing rules

No stock-framework limitation justifies custom Runa code unless the exact frozen surface, failing
edge, raw evidence, and unmet Runa requirement are linked together. And the reverse: no framework
pass justifies migration unless it was measured on the real assembled path Runa would use. Every
custom component carries the reverse link — the exact stock failure that justified it — or it is
not admitted.

## Classification discipline (unchanged)

Every fray is classified KNOB (a documented configuration recovers it), LIMIT (moves with
resources), or WALL (structural), with the mechanism — why it breaks — and the location — where in
the stack. A pass is only a pass with its stated evidence basis. FRAY-MAP.md remains the record of
the first sweep, not a statement that the base is mapped.
