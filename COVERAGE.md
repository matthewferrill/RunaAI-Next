# COVERAGE — the full surface of the base, and how much of it the map has seen

The steward's direction, 2026-08-18, restated after the session crash: the fray map must cover the
entire base, not a committed slice of it. The deliverable is the full map — every fray, where it
breaks, why it breaks, and what kind of break it is. A map is only a map if its edges are the base's
edges.

This document is the denominator. It enumerates the surface of the installed base, places every
existing probe on that surface, and commits the waves that close the rest. It is written before the
new probes exist, so the coverage claim is judged against a grid fixed in advance rather than one
drawn around whatever got probed. FRAY-MAP.md remains the record of what the first sweep found; this
supersedes any reading of it as "the base is mapped."

## Honest position after the v2 sweep

- 53 cases covering ~30 axis-cells, nearly all at **n=1**. The map's own working-memory anomaly
  (depth-50 lost, depth-100 kept) is the standing demonstration that n=1 cells cannot decide anything.
- Two axes committed in PROVING.md were never built into corpus v2 and are unprobed: tool
  **mid-chain failure** and tool **timeout behaviour**. Named here so the shrink is not silent.
- "Retrieval 13/13" is a verdict on the vector-store + hand-assembled-context path. The installed
  `@mastra/rag` document pipeline (chunking, document processing) has never been touched.
- Whole subsystems at zero: processors/guardrails, streaming/abort, concurrency, storage failure
  modes, most of the workflow feature set, the adversarial surface, `@mastra/evals` (harness gap,
  marked open), multi-agent networking.

By cell count the base is roughly **30% probed at n=1 and ~0% probed to the n≥3 standard**.

## Scope ruling

In scope: every subsystem the assembled base runs or that Runa would rely on after migration.
Out of scope, with the reason on the record: deployer/bundler/editor/browser (build-time tooling,
not runtime behaviour), tts/voice (no voice in this base), a2a and agent-to-agent surfaces beyond
`network/vNext` (no second estate), ee/license/auth-enterprise (not configured). A subsystem leaves
this list only by steward decision, recorded here.

## The grid

Status: PROBED (with n), PARTIAL (some axes at n=1), UNPROBED. Every future verdict must land in a
cell of this grid; a finding with no cell means the grid was wrong and gets amended first.

### 1. Agent loop (`@mastra/core/agent`)

| axis | status |
| --- | --- |
| single generation | PROBED implicitly throughout (no dedicated cell) |
| multi-step tool loop (short, ≤8 steps) | PARTIAL — tools:chained-read n=1 |
| long-horizon loop (20+ steps), maxSteps exhaustion behaviour | UNPROBED |
| mid-loop tool error: recovery vs derail | UNPROBED (missing-file honesty n=1 is the soft case only) |
| tool hallucination: invented tool names/args, rate | UNPROBED |
| parallel tool calls | UNPROBED |
| streaming output; abort/cancel mid-generation | UNPROBED |
| system-instruction adherence over long turns | PARTIAL — model:instruction-retention n=1 |

### 2. Memory (`@mastra/memory`)

| axis | status |
| --- | --- |
| recall depth × config matrix (2/10/25/50/100 × 4 configs) | PROBED n=1 per cell — needs n≥3 |
| contradiction / revision | PROBED n=1, default+semantic only |
| thread isolation; resource isolation | PROBED n=1 each |
| restart survival | PROBED n=1 |
| temporal ordering | PROBED n=1 |
| growth bound | PROBED n=1 at 40 turns; thousands of turns UNPROBED |
| semantic-recall interference: many near-identical facts colliding | UNPROBED |
| working-memory template semantics: what fits the template, what falls out | PARTIAL — one anomaly, unexplained |
| memory processors (`@mastra/memory/processors`) | UNPROBED |
| concurrent writers to one store | UNPROBED |
| injection persisted via memory (a poisoned "fact" recalled later as truth) | UNPROBED — adversarial, governance-critical |

### 3. Retrieval and RAG (`@mastra/core/vector`, `@mastra/libsql`, `@mastra/rag`)

| axis | status |
| --- | --- |
| verbatim / paraphrase / conceptual / multi-hop / hard-negative | PROBED n=1 each |
| corpus scaling 60/300/1000 | PROBED n=1 each; 10k+ UNPROBED |
| topK sensitivity (1/3/10) | PROBED n=1 each |
| index staleness | PROBED n=1 — finding: no freshness signal exists |
| reranked path | PROBED n=1 |
| `@mastra/rag` document pipeline: chunking strategies, chunk size/overlap, document types | UNPROBED — package never exercised |
| embedding limits: domain terms, code identifiers, near-duplicate discrimination | UNPROBED |
| index rebuild consistency; concurrent upsert/query | UNPROBED |
| injection via retrieved document (instructions inside a doc reaching the answer) | UNPROBED — adversarial, governance-critical |

### 4. Tools / MCP (`@mastra/mcp`)

| axis | status |
| --- | --- |
| chained read; missing-file honesty; write-then-read; truncation needle; unavailable server | PROBED n=1 each |
| mid-chain server death | UNPROBED — committed in PROVING.md, never built |
| tool timeout behaviour | UNPROBED — committed in PROVING.md, never built |
| allowed-directory enforcement / path traversal attempts | UNPROBED — adversarial |
| instructions inside tool output reaching the agent's behaviour | UNPROBED — adversarial, governance-critical |
| MCP resources and prompts surfaces (beyond tools) | UNPROBED |
| large results beyond the one truncation case; many servers at once | UNPROBED |

### 5. Workflows (`@mastra/core/workflows`, durable/evented)

| axis | status |
| --- | --- |
| resume without re-execution | PROBED n=1 (PASS) |
| snapshot tamper | PROBED n=1 (FAIL — fray 4) |
| single-use approval | PROBED n=1 (PASS) |
| crash during effect | PROBED n=1 (MIXED — fray 5) |
| parallel branches; nested workflows | UNPROBED |
| retries and step timeouts | UNPROBED |
| suspend across process restart and across days | UNPROBED (restart n=1 was within one process lifetime pattern) |
| workflow definition changed while a run is suspended (versioning) | UNPROBED |
| concurrent runs of one workflow; storage failure mid-run | UNPROBED |
| evented workflows; durable agent (`agent/durable`) | UNPROBED |

### 6. Model surface (LM Studio, OpenAI-compatible)

| axis | status |
| --- | --- |
| instruction retention; context saturation (40k chars); structured validity (1 simple schema × 10); long output | PROBED n=1 each |
| structured-output schema ladder: nesting, unions, arrays, constrained enums | UNPROBED |
| context to the real ceiling (model max, not 40k chars) | UNPROBED |
| tool-call format reliability at depth and under long context | UNPROBED |
| determinism / temperature spread on identical inputs | UNPROBED |
| embedding model quality axes (separate from retrieval behaviour) | UNPROBED |

### 7. Storage (`@mastra/libsql`)

| axis | status |
| --- | --- |
| row growth per turn | PROBED n=1 |
| concurrent writers; corruption recovery; disk full; process death mid-write | UNPROBED — the harness has already hit WAL-sidecar behaviour twice, which is a signal, not a nuisance |
| backup/restore of live stores | UNPROBED |

### 8. Evals (`@mastra/evals`)

| axis | status |
| --- | --- |
| any metric producing a score | OPEN — harness gap, not a framework finding; resolve before probing |
| scorer quality: does an LLM-free metric distinguish a right answer from a wrong one on our cases | UNPROBED |

### 9. Processors / guardrails (`@mastra/core/processors`)

Entirely UNPROBED: input processors, output processors, what they can and cannot intercept, and
whether a screening processor sees tool results and retrieved context or only user turns.

### 10. Multi-agent (`network/vNext`)

Entirely UNPROBED. In scope but last: no migration decision currently depends on it.

### 11. Cross-cutting: adversarial

The estate's own history says this is where governance lives, and none of it has been probed on the
standard stack: injection via retrieved documents, via tool outputs, via persisted memory; path
traversal through the filesystem server; a secret placed in one lane appearing in another (memory →
retrieval, tool result → memory). Every case here is also a requirement scenario in waiting: where
stock resists, nothing custom is justified; where it complies, that is a fray with a governance name.

### 12. Cross-cutting: operations

Latency distributions under load, concurrent sessions against one base, sustained long-horizon runs
(thousands of turns, days of wall clock), endpoint outage mid-anything (partially seen: the embed
build crash the checkpoint work fixed). UNPROBED.

## The waves

Ordered by what the migration decisions need first. Each wave gets its own sealed corpus (questions
and labels with supporting spans, digests in a SEAL file, labels held away from the implementer),
runs on Control against the live endpoint via the checkpointed runner, and reports per-cell n and raw
outputs. A wave is complete when every one of its cells is PROBED at n≥3 or reclassified with a
recorded reason.

- **Wave A — adversarial surface** (grid §11 + the adversarial rows of §2–4). Highest value: these
  cells decide where custom governance is justified, which is the whole question.
- **Wave B — untouched subsystems**: `@mastra/rag` pipeline, processors/guardrails, streaming/abort,
  agent-loop horizon and tool-hallucination, structured-output ladder, the two committed-but-unbuilt
  tool axes.
- **Wave C — scale, concurrency, ops**: storage failure modes, concurrent writers, 10k corpus,
  thousands of turns, load.
- **Wave D — workflow full map**: the eight unprobed workflow rows, evented and durable included.
- **Wave E — model surface to its real ceilings.**
- **Wave F — repetition**: n≥3 over every n=1 cell that produced a verdict, the memory matrix first.
  Any cell that flips under repetition is reported as unstable, not averaged away.

Corpus v2 is not retired: it becomes the standing regression suite. Every custom piece admitted later
re-runs it, and a regression anywhere on the old map blocks the admission.

## Classification discipline (unchanged, restated because the full map depends on it)

Every fray is classified KNOB (a documented configuration recovers it), LIMIT (moves with resources),
or WALL (structural), with the mechanism — why it breaks — and the location — where in the stack. A
pass is only a pass with its n. An error entry from the environment is never a finding. A cell nobody
could probe is reported NOT PROBED, never inferred from a neighbouring cell.
