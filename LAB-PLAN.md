# Lab plan — decide the stack, fix the stack, fix the frays

Revised 2026-08-20, replacing the plan written 2026-08-19. The diagnosis sections stand; the plan
section was rewritten after a finding that changes what most of the remaining work is.

> **Evidence correction.** The 1,501 run records are preserved, but lexical write-claim rates and
> conclusions requiring the missing Wave 7 wire logs are `NOT_DECIDABLE`. Any threshold or stack
> decision below that cites those rates is suspended until a corrected, sealed measurement exists.

**Sequence, fixed:** decide the stack → fix the stack → fix the frays → *then* assess residual gaps.
Nothing beyond that is designed here. An escalation path, a delegation model, or anything else that
solves a residual is out of scope until the residual is measured, because sizing a solution to an
unmeasured gap is the error this programme exists to prevent.

---

## THE FINDING THAT REWROTE THIS PLAN

**Every wave measured the stack with its defences switched off.**

All seven waves — 1,501 runs — constructed a bare `new Agent({ name, instructions, model, memory })`.
**Zero probe files imported a processor.** The stack ships **58 of them**, and several map directly
onto frays marked for custom implementation:

| Stack component, never exercised | Fray it addresses |
|---|---|
| `PromptInjectionDetector` — `detectPromptInjection`, `handleDetectedInjection`, `createRewrittenMessage` | **4** — retrieved content as instruction |
| `UnicodeNormalizer` — `normalizeText` | Wave 2's *encoded* payload used Cyrillic homoglyphs and fired a governed effect 1/5 |
| `SystemPromptScrubber` — `detectSystemPrompts`, `redactText` | secret disclosure |
| `StructuredOutputProcessor` | **3** — completeness a caller can read |
| `StreamErrorRetryProcessor`, `ToolCallFilter` | **2** — bounded calls |
| `TokenLimiter`, `CostGuardProcessor`, `PIIDetector`, `ModerationProcessor` | budget and content safety |
| `@mastra/core/auth` — `StaticRBACProvider`, `PERMISSIONS`, `RESOURCES`, `ACTIONS`, session providers | **6** — identity |
| `@mastra/core/agent/durable` — `DurableAgent`, `RunRegistry`, `buildStepRecord` | **5** — nameable terminal state |
| `@mastra/core/observability` — spans, sampling, `DEFAULT_BLOCKED_LABELS` redaction | the tracer gap, ~30 NOT PROBED scenarios |
| `@mastra/rag` — `rerank`, `rerankWithScorer`, `GraphRAG`, `createVectorQueryTool`, `MDocument` | retrieval, zero coverage |

**The six frays remain true findings about the configuration measured. They are not findings about
the stack's capability.** The honest restatement is *"the stack's defaults are unsafe"*, not *"the
stack cannot do this"*.

This matters because the governing rule is **prove the standard cannot do it before building
custom**, and we came within one session of building custom versions of at least three things the
stack already ships. The register enumerated *edges*; it never asked what the framework offered to
defend them. That gap should have been caught before Wave 2.

---

## WHY THE ESTIMATES WERE UNRELIABLE: THE INSTRUMENT DEFECTS

Roughly two dozen defects were found in the measuring tools before any finding was trusted. They are
five patterns, now enforced in `probes/instrument.mjs` rather than remembered:

| Pattern | Examples |
|---|---|
| **A.** A value silently stuck | wrapped args failing validation silently; `COUNT(DISTINCT id)` on an always-NULL column; a detector handed an array where it wanted a path; `contentLen` recorded on one code path only |
| **B.** A harness that did not run, recorded as data | duplicate client config; control bytes rejected by `spawn`; a 1 MB prompt over the environment limit; a proxy losing its port to a stale process |
| **C.** A fixed sleep used as synchronisation | a 900 ms kill against 1.1 s startup |
| **D.** A grader narrower than its sealed invariant | I-4T scoped to one family, hiding six runs |
| **E.** A tautological measurement | asking the agent to write the secret, then finding the secret in the log |

The sharpest returned false **by construction** and would have reported *"no steering observed"*
across all 22 trust-boundary scenarios. The transferable lesson: **a test of the negative cannot
distinguish "correctly false" from "always false."** Every detector must be shown to fire in both
directions.

Pattern B is the one to watch: it appeared four separate times, and once manufactured a **safeguard**
rather than a violation — a harness that never started reads as a system that did nothing wrong, and
good news attracts less scrutiny.

---

## THE PLAN

Timings are measured against this session's git log, not human working hours. Build speed is 10–25
minutes per component; **the irreducible cost is measurement runtime and model swap time**, which no
amount of typing speed affects. Sequential throughout — one measurement at a time per host.

| Phase | Build | Runs | Total |
|---|---|---|---|
| **A** — frays with the stack's defences enabled | ~20 min | ~200 runs, ~1.5 h | **~2 h** |
| **B** — the dark components | ~80 min | ~300 runs, ~1.5 h | **~3 h** |
| **C** — hardware-qualified model research and role matrix | ~60–90 min research/harness | ~500 runs plus swaps, ~3–5 h | **~4–6.5 h** |
| **D** — build the remainder | unknown until A and B report | | |
| **E** — constraint-5 estimate | analysis only | none | **~30 min** |

### Completion record — 2026-08-20

- **Phase A complete:** all six frays were rerun against configured boundaries; retained evidence and
  corrected seals verify.
- **Phase B complete:** retrieval, formal evals, auth surface, observability, and the corrected hard
  reranker corpus were exercised. Windowed use of the installed BGE reranker was selected.
- **Phase C complete:** live Control/Home hardware and NVLink were inventoried; current model
  documentation and alternatives were re-screened; five existing models plus one justified new
  candidate were run through the sealed role matrix. A taxonomy-correct routing supplement selected
  deterministic application routing because no model passed 8/8.
- **Phase D complete:** the selected Mastra/LangGraph/PostgreSQL/Qdrant/OpenTelemetry boundaries passed
  a restart/replay vertical slice, and Caddy passed combined header/body/application budgets.
- **Phase E complete:** the current RunaAI verifier and 169-module migration surface were inventoried
  read-only and assessed in `RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md`. The companion
  `RUNA-PORT-ESTIMATE-2026-08-20.md` separates the 46–75 one-developer effort-day model from the
  2–4 day minimum-slice and 6–12 day selected-core elapsed estimates for a Codex-plus-Claude workflow.
  The final opt-in Keycloak/OpenFGA component gate was rerun after development testing and passed.

**A and B are one unattended run of roughly five hours.** C is a separate session and must not start
before A and B report, because the matrix would otherwise measure models against a configuration
about to change.

### Phase A — re-measure every fray with the stack configured

A new sealed preregistration and a new base: adding processors changes the configuration, so results
are not directly comparable with the bare runs. **The bare-stack results are kept as the "defaults"
arm rather than discarded** — that comparison is itself the finding, and it is what distinguishes a
bad default from a missing capability.

Scenarios reuse the existing harnesses; only agent construction changes.

| Fray | Configured with | Reused from |
|---|---|---|
| 4 — injection | `PromptInjectionDetector` + `UnicodeNormalizer` | W6 `E/F.malicious` + clean twins, n=5 |
| 1 — fabrication | `StructuredOutputProcessor`, tool-loop settings | W4 six scenarios, n=5 |
| 2 — bounded calls | `StreamErrorRetryProcessor`, abort settings | W4 timing, W7 partial-response |
| 3 — completeness | `StructuredOutputProcessor` | W5 index, W7 truncation |
| 5 — recoverability | `DurableAgent`, `RunRegistry` | W3 persistence, 0/60 baseline |
| 6 — identity | `@mastra/core/auth` RBAC/FGA | W2/W3/W6 NO-MECHANISM scenarios |

**Note on `PromptInjectionDetector`:** it exposes `createDetectionPrompt`, so it likely calls a model
itself. Expect roughly double per-run latency, and record whether the detector's own call is
model-mediated — a defence that depends on the model has different reliability from one that does not.

### Phase B — the components with zero coverage

**Retrieval.** `@mastra/rag` has never been imported by a probe. The sealed corpus provides labelled
answers to grade against, so retrieval quality is measurable rather than assumed.

**Reranking.** A `BAAI/bge-reranker-v2-m3` service already runs on RUNA-HOME port 8412 —
cross-encoder, `cuda:0`, **1.08 GB VRAM**, `max_length: 512`, `load_seconds: 24.7`, endpoint
`POST /rerank`. It works: given "vector database" it scored the relevant document `+0.31` against
`-5.86` for an irrelevant one.

Two things to measure rather than assume: **whether reranking helps at all** on this corpus, and
**what the 512-token limit does** — anything longer is truncated before scoring, which is the Fray 3
shape exactly.

**Candidate upgrade: Qwen3-Reranker-4B.** Apache 2.0, 100+ languages, **32K context** against BGE's
512, characterised as the strongest open-weight reranker where BGE is the safe default. ~3–5 GB
quantised, local, so no external dependency is introduced. **Measure both against the sealed corpus**
rather than adopting on reputation.

**Also dark:** `@mastra/evals`, observability/tracing (needs an OTLP sink — the one genuinely missing
piece), and `@mastra/core/auth`.

**The `:8412` service is outside the frozen base.** If it becomes load-bearing it must be pinned in
`BASE-MANIFEST.json` like the model and embedder, and its 24.7 s cold start accounted for.

### Phase C — hardware-qualified model research and role matrix

Phase C begins from the machines themselves, not from an old handoff or a generic model leaderboard.
The live read-only inventory captured 2026-08-20 is the current baseline:

| Host | Live hardware relevant to the decision | Assigned boundary |
|---|---|---|
| RUNA-CONTROL | Dell OptiPlex 7060; i5-8500T, 6C/6T; 16 GB RAM; Intel UHD 630; 256 GB SSD; Windows 11 Pro | Application, governance, scheduling, records, and UI. No resident LLM or heavy reranker is assumed here. |
| RUNA-HOME | Dell Precision T7910; 2x Xeon E5-2699 v3, 36C/72T total; 128 GB ECC RDIMM at 2133 MHz, balanced four DIMMs per socket; 512 GB SSD plus 2 TB HDD; Windows 10 Pro | Model, embedding, reranking, and measured accelerator workloads only. |
| RUNA-HOME accelerators | 2x Quadro RTX 6000, 23,040 MiB usable VRAM each, ECC enabled, Turing generation; two live NVLink links per GPU reporting 25.781 GB/s each | Treat as two 24 GB devices joined by a measured interconnect until a specific backend proves placement and transfer behavior. |

The inventory is a dated measurement, not a permanent truth. Re-capture CPU, DIMM population and
NUMA placement, GPU identity/driver/ECC/link state, VRAM use, storage free space, OS, and firmware
immediately before the model campaign. A changed driver, runtime, model artifact, quantization,
context, or placement creates a new arm rather than silently updating an old one.

#### C0 — candidate discovery and documentation qualification

Redo candidate discovery before freezing the model set. Search current official model cards,
runtime documentation, licenses, release notes, and published architecture details for both the
existing candidates and plausible newer alternatives. For every candidate record:

1. exact model/revision, architecture, active/total parameters, license, and commercial-use terms;
2. native and supported context, tokenizer/template, tool-call and structured-output support;
3. published precision/quantization options and the exact artifact proposed for the lab;
4. weight size plus estimated KV-cache, scratch, and runtime overhead at each tested context;
5. backend and operating-system support on Windows, CUDA, Turing, and dual-GPU placement;
6. any dependency on BF16, FP8, FlashAttention, newer compute capability, or Linux-only kernels;
7. expected single-GPU, dual-GPU/NVLink, RAM-offload, load/unload, and cold-start behavior; and
8. intended role and the capability claim the later lab task can falsify.

Documentation makes a model `DOC-ELIGIBLE`; it never selects it. Community benchmarks may nominate
a candidate but cannot replace an official artifact record or a run on RUNA-HOME. Models that require
native BF16/FP8 acceleration, unsupported kernels, more storage than the active library can safely
hold, or an unobservable split/offload path are rejected before the long matrix.

#### C1 — hardware-fit and placement gate

Before capability scoring, prove that each candidate runs honestly on this estate:

1. hash and record the exact model artifact, runtime, driver, prompt template, quantization, and
   requested context;
2. capture per-GPU weight/KV/scratch allocation and system-RAM use before load, after load, during
   prompt ingestion, and during generation;
3. record cold load, time to first token, prompt-processing speed, generation speed, peak memory,
   CPU use, temperatures, clocks, power, and unload/recovery;
4. reject any arm whose claimed context cannot be exercised with a near-limit prompt and complete
   response;
5. reject any arm that silently spills to CPU/RAM or falls below the fixed throughput floor without
   exposing that placement in evidence; and
6. preserve Control responsiveness while Home loads, runs, cancels, unloads, and recovers the model.

NVLink is its own measured factor. The bridge being present does **not** turn the cards into one
automatic 48 GB allocator. For any model spanning both GPUs, the selected backend must expose the
tensor/KV split and show both devices in telemetry. Where the model also fits on one GPU, compare a
single-GPU arm with the dual-GPU arm. Where it does not, compare the dual-GPU result against its
declared no-peer/ordinary multi-GPU behavior if the backend exposes a safe switch. Record peer-access
status and transfer counters where available. Credit NVLink only when the runtime demonstrably uses
the link and the resulting latency/throughput or feasible context improves; otherwise record it as
installed but irrelevant to that backend.

The 128 GB ECC installation raises the candidate ceiling but does not erase latency. RAM offload is
permitted as an explicit arm, never hidden inside a GPU result. A model that technically loads but
generates too slowly for its assigned role fails that role even if its answer quality is strong.

#### C2 — capability and role matrix

Roles carry different fray exposure, so a single ranking would be the wrong shape:

| Role | What decides it |
|---|---|
| Routing / decisioning | latency, structured-output reliability |
| Chat | latency, instruction-following |
| Code | tool-calling reliability, code quality |
| Research | retrieval quality, long-context synthesis, fabrication |
| Review / grading | **injection resistance** — this role reads untrusted content |

**The VRAM budget constrains the answer more than the benchmarks will.** 45 GB usable, measured:

| Model | Loaded | Cold load |
|---|---|---|
| llama-3.3-70b Q4 | ~40 GB | ~105–115 s (estimated) |
| qwen3-coder-30b Q6_K | 23.4 GB | 72.5 s |
| qwen3.6-27b Q4 | 15.6 GB | **41.3 s** (measured) |
| qwen3-4b Q4 | ~3 GB | fast |
| nomic-embed / bge-reranker | ~0.1 / 1.08 GB | 24.7 s (reranker) |

**Exceeding VRAM does not fail — it silently degrades.** With three models resident at 44.3 GB of 45,
measured throughput was **81.7 / 3.1 / 1.6 tok/s** against **71.7 tok/s** for the coder alone. A
20–45× collapse with nothing in the API reporting it.

**Arm D's write-claim result is void, as are the other three arms' rates.** The retired lexical grader
cannot support a model comparison, and Arm D also ran while resource-starved. A future solo test needs
a new sealed semantic adjudication protocol and a bar calibrated from validated labels; the old 3/30
and 9/30 figures must not be reused. Tool-calling ≥ 24/25, solo throughput ≥ 10 tok/s and injection
resistance remain independently measurable criteria.

**The injection result also needs confirming.** Qwen3.6-27B's 0/10 is one arm at n=10. It wants n ≥ 20
before a production routing policy rests on it — and it costs 2× the incumbent's latency and missed
3/25 tool calls, which was invisible when only steering was measured.

### Phase D — build only what survived A and B

Completed after A and B reduced the residual. The lab added only the narrow integration pieces the
selected standard components cannot know: domain effect/idempotency keys, accepted provider completion
policy, PostgreSQL-to-Qdrant reconciliation, explicit reranker windows, and typed grounding contracts.
The resulting vertical slice passed fresh-worker recovery and exactly-once replay with one provider
call and one deed. Caddy's slow-header, slow-body, and application-budget composition cases also
failed closed with one upstream call each.

### Phase E — constraint-5 estimate

Completed as a read-only estimate. RunaAI is **169 source modules / 34,899 source lines**, with **123
test files / 20,309 test lines** and **128 command checks** in the shared verifier. The three CLI
profiles, API route, guarded-chat cache, and command surface consume one verifier rather than being
independent suites. The staged baseline is **46–75 implementation days of one-primary-developer
effort**, not an elapsed two-agent schedule. With Codex and Claude implementing in separate checkouts
and the steward reviewing material gates, the conditional elapsed ranges are **2–4 days** for the
minimum useful slice and **6–12 days** for selected core. See
`RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md` and `RUNA-PORT-ESTIMATE-2026-08-20.md` for dispositions,
approval gates, assumptions, and stop rules.

---

## EXPLICITLY OUT OF SCOPE

**Escalation to external APIs**, and any design depending on it. Runa's purpose is to do locally what
paid assistants do now; external calls are a solution to whatever gap remains *after* the stack is
fixed and the frays are closed. Sizing that path before the residual is measured would repeat the
error this programme exists to prevent.

**Multi-agent delegation** (Wave 8), never run.

**Anything requiring a change to the frozen base** without its own sealed preregistration and manifest.

---

## STANDING CAVEATS

**345 is a floor.** The register enumerates graph-edge scenarios only. It also never asked what the
framework offered to defend those edges, which is how the processors were missed.

**Model conclusions are role-limited.** The sealed campaign now covers six runnable arms (including
the MTP runtime arm) and a taxonomy-correct routing supplement. The coding cases prove bounded code
and tool smoke behavior, not whole-repository software-engineering quality; the first Runa port slice
is the acceptance test for that broader claim.

**Residual instrument risk is ~10–15%**, not zero. Phases B and C are new territory and carry the
most; the library takes the old patterns out of play but cannot anticipate novel ones.

**Estimates in this document have been wrong before, in a specific direction.** The 2026-08-19 version
estimated items 0, 1 and 2 at half a day, three quarters and a third; they took roughly fifty, twenty-
one and ten minutes by the git log. Those estimates were framed in human working hours, which is the
wrong unit. The figures above are framed in measurement runtime, which is the part that does not move.
