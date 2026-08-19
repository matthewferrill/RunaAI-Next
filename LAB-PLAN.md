# Lab plan — what remains, in what order, and why

Written 2026-08-19, after the seven-wave map closed at `7714cf7`. This is the working plan for the
reference lab only. It exists because two questions surfaced that the map itself does not answer:
**was the stack choice sound**, and **are we testing the stack or the model**.

---

## Why this stack was chosen, and what that leaves open

`docs/RUNAAI-FRAMEWORK-EVALUATION.md` is explicit about its own limits — *"Nothing here has been
run."* The stack was selected from documentation, and one constraint decided it:

> **LangGraph** — the most production-grade option… **Python-primary** with TypeScript support that
> lags. Constraint 1 is a serious problem.

Node.js was binding, LangGraph was out, Mastra was in. The other four constraints scored:

| Constraint | Verdict when chosen | Status after seven waves |
|---|---|---|
| 1. Node.js | **pass** | confirmed in use |
| 2. Fully local, no outbound | probable, **unverified** | **still unverified** |
| 3. Governed interrupts | partial | partially exercised (W1, W2, W3) |
| 4. Approval never a stored bit | **unresolved — "the crux"** | **never measured** |
| 5. Verifier survives migration | **unknown**, cost unestimated | not attempted |

**The two constraints that made the recommendation provisional are the two the lab never resolved.**
Wave 3 probed suspend/resume durability at 282 runs and found 0/60 recoverable, but no preregistered
scenario asked whether an `approved` state rests on disk between the steward's act and execution.

## Are we testing the stack, or the model?

Measured rather than assumed, by counting model-invoking call sites per harness:

| Wave | Model call sites | Reading |
|---|---|---|
| 3 | **0** | pure stack test — 282 runs, no model at all |
| 7 | 1 | thin |
| 1, 4 | 4, 4 | thin |
| 5 | 11 | mostly store-level |
| 6 | 29 | model-heavy |
| 2 | 43 | almost entirely model behaviour |

And the frays divide four/one/one: **Frays 2, 3, 5, 6** (timeout, completeness, recoverability,
identity) are stack properties; **Fray 4** (injection) is model; **Fray 1** (fabrication) is mixed.

So the lab does mostly test the stack — with a corollary worth stating plainly:

> **The findings that needed a model are the ones we cannot attribute. The findings we can attribute
> did not need the runs.**

No-timeout, no-recoverability, no-completeness-signal and no-identity are all *absences*, findable by
reading the source. The two headline results — fabrication and durable injection — rest on one model
and cannot be separated from it without a comparison arm.

**Component coverage gaps:** `@mastra/rag` and `@mastra/evals` are installed and were never probed.
The re-ranker on `:8412` is live and never touched by the lab.

---

## Why the estimates were unreliable: nineteen instrument defects

Instrument defects added an estimated 30–50% to every wave. They are not nineteen different mistakes.
They are **five patterns**:

| Pattern | Count | Examples |
|---|---|---|
| **A.** A value that is silently stuck | 7 | wrapped args failed validation silently; `COUNT(DISTINCT id)` on an always-NULL column; detector handed an array not a path; `contentLen` recorded on one path only |
| **B.** The harness did not run, and the non-run was recorded as data | 4 | duplicate client config; control bytes rejected by `spawn`; 1 MB prompt over the env limit; proxy lost its port to a stale process |
| **C.** A fixed sleep used as synchronisation | 2 | 900 ms kill against 1.1 s startup |
| **D.** Grading scope narrower than the sealed invariant | 1 | I-4T scoped to one family, hid six runs |
| **E.** A tautological measurement | 1 | asked the agent to write the secret, then found the secret in the log |

They recurred because **the lessons lived in prose** — in findings documents and in the head of
whoever wrote the next harness — and were re-derived from memory each wave. That is precisely the
unverified-carefulness claim this programme exists to criticise.

### The fix: `probes/instrument.mjs` (built, 27/27 self-tests passing)

| Catcher | Pattern | What it does |
|---|---|---|
| `gate.variance()` | **A** | After a smoke, every field constant across all runs must be justified in an allowlist. Generic — it catches defects nobody anticipated. |
| `gate.bothDirections()` | **A** | A detector must be shown to fire true *and* false. A test of the negative alone cannot tell *correctly false* from *always false*. |
| `payload()` + `stamp()` | **B** | Payloads go through files, never the environment. Every record carries `instrumentRan`, and a cap-kill is distinguished from a failure to launch. |
| `gate.faultLanded()` | **B** | The injected fault must be visible on the instrument before the outcome is graded. |
| `waitReady()` / `killOnProgress()` | **C** | Synchronise on observed readiness or observed progress. Never on a timer. |
| `scopeLint()` | **D** | If the sealed invariant names no family, the grader may not filter by family. |
| `gate.targetAbsent()` | **E** | The measurement's target must not appear in its own input. |

Every self-test fixture is a defect that actually happened, named by its wave, so the library is
proven against the real failures rather than invented ones. **The library is itself an instrument**,
which is why it gets the same both-directions treatment it enforces on everything else — a defect
here would appear in every wave at once.

Expected effect: 15 of the 19 past defects were of a kind these catch. Residual is **~10–15%, not
zero** — novel instruments have novel failure modes, and the tracer and RAG harnesses are both new
territory.

---

## The plan

| # | Item | Build | Runs | Total | Status |
|---|---|---|---|---|---|
| **0** | Instrument library + self-tests | ~50 min | — | **done** | **done** |
| **1** | Constraint 4 + constraint 2 probes | ~21 min | incl. | **done** | **done** |
| **2** | Deterministic stub provider | ~10 min | — | **done** | **done** |
| **3** | Model comparison arm — four arms, era-spread | ~20 min | ~2h + downloads | | |
| **6** | Runtime comparison — row-split, then vLLM | ~20 min | ~1h | | **next** |
| **4** | Tracer / observability | ~5h | ~30 min | ~1 day | |
| **5** | RAG + re-ranker | ~4h | ~1h | ~¾ day | |

**~4 days, sequential** — one measurement at a time per host, per PROVING.md.

### 1. Constraint probes — *first, because they can cancel the rest*

Does an `approved` state rest on disk between the steward's act and execution (constraint 4), and does
the core phone home (constraint 2)? These are the two questions that made the stack choice
provisional, and they have never been asked.

**If constraint 4 fails, the framework choice is wrong**, and measuring its retrieval layer is wasted
effort. This is the shortest path to knowing whether the remaining three days are worth spending.

Mostly non-model, so it runs at Wave 3 speed. Constraint 2 needs an egress-capturing proxy; the Wave 7
proxy already provides most of the pattern.

### 2. Deterministic stub provider — *built, 10/10 self-tests*

`probes/stub-provider.mjs`. An OpenAI-compatible endpoint with no model behind it: chat completions,
embeddings and a model list, all derived from a hash of the request, so the same input always gives
the same output on any machine with no endpoint at all. Rules let a scenario script a reply, a tool
call, or a truncated `finish_reason` without editing the stub.

Measured rather than claimed: **1.78ms per completion**, against ~55ms warm and 72–107s cold on the
real endpoint. And the decisive check — a real Mastra agent runs against it unchanged, so a framework
result measured here describes the framework rather than the stub.

**What may migrate to it.** Anything whose verdict is read from disk or the wire rather than from an
answer:

| Measurement | Why it can migrate |
|---|---|
| W3 durable state (already 0 model calls) | no change, but embeddings for W5-style setup become free |
| W5 concurrency and persistence | verdicts read from SQLite; the agent is only a way to cause a write |
| W4 tool-chain timing, versioning, concurrency | verdicts read from the filesystem and the call log |
| W6 versioning on the three stores | verdicts read from the store |
| Constraint probes | verdicts read from the snapshot store and the egress log |

**What must never migrate.** Fray 1 (fabrication) and Fray 4 (injection) are model-mediated by
definition. Running them against a scripted string would answer a question about the model with a
value the harness chose. The stub cannot recall a planted fact and cannot follow an injected
instruction, and that inability is the guardrail rather than a limitation — a scenario that needs
either will visibly fail against it instead of quietly passing.

### 3. Model comparison arm — *the only way to attribute Frays 1 and 4*

Not a general re-run. ~55 runs per arm, on the two model-mediated frays only:

- Wave 4's six fabrication scenarios at n=5 → 30 runs
- Wave 6's `E.malicious` and `F.malicious`, both arms, at n=5 → 20 runs
- Wave 7's `A.partial-response` at n=5 → 5 runs

**The candidate list was revised after researching what this hardware actually is.** The first list —
Qwen 3.6 27B, gpt-oss-20b, qwen3-4b — was wrong in two ways: every one fits on a single card and
leaves the second GPU idle, and gpt-oss **cannot load at all**, because MXFP4 requires compute ≥ 9.0
and Turing is 7.5.

**Newer is not better on this hardware, and the exclusions are at the hardware level:**

| What | Turing (SM 7.5) status |
|---|---|
| FlashAttention 1 / 2 / 3 | **requires Ampere or Hopper** — excluded, every version |
| MXFP4 (`gpt-oss`) | will not load, needs compute ≥ 9.0 |
| NVFP4 | runs, but tensor-core acceleration is Blackwell-only |
| Gemma 4 | **cannot run on Turing via any vLLM attention backend** |
| BF16 | unsupported — Turing is FP16 only |

What Turing *is* first-in-class at: **it was the first architecture with INT4 tensor cores**, so GPTQ
and AWQ — both INT4, both from the 2023 era — map onto silicon these cards have and newer formats do
not use. And llama.cpp carries its own attention kernels rather than depending on FlashAttention,
which is an accidental virtue of the current stack on this hardware.

**Four arms, spanning 2023 to 2026 and 4B to 70B, with two of them across both GPUs:**

| Model | Era | Size | GPUs | Role |
|---|---|---|---|---|
| Mixtral 8x7B Instruct (AWQ/GPTQ INT4) | Dec 2023 | 47B total / 13B active, ~24 GB | **both** | the dual-24GB workhorse of its era; MoE, INT4 on Turing's tensor cores |
| Llama 3.3 70B Instruct Q4 | Dec 2024 | ~40 GB | **both** | the scale arm; genuinely uses 48 GB |
| Qwen 3.6 27B Q4_K_M | Apr 2026 | ~17 GB | one | current-gen general, controlled against the incumbent coder MoE |
| qwen3-4b | installed | ~3 GB | one | free gradient point |

A tension worth naming rather than hiding: newer models carry better instruction-hierarchy training,
which is exactly what Fray 4 tests — and the sharpest candidate for that, `gpt-oss-20b`, will not load
on this hardware. The era spread is the honest substitute, not an equivalent.

**Each arm is a new base.** `BASE-MANIFEST.json`'s `boundsClaim` names `modelId`, so each needs its own
manifest and `base-drift` fingerprint, and results are reported per-arm and never pooled.

### 6. Runtime comparison — *because a fray might close without Runa building anything*

Fray 2 is *nothing ever gives up* — no client-side timeout, found on three independent edges. A
serving runtime with real request-level timeouts and queueing could close it outright. That is the
standing principle applied to a layer never questioned: prove the standard cannot do it before writing
custom code.

**6a. `--split-mode row`, in-base and cheapest.** Both GPUs are already loaded (~32.6 GB across the
pair) and **NVLink is installed and active** — 2 links per GPU at 25.78 GB/s, ~51.6 GB/s aggregate
against ~16 GB/s for PCIe 3.0 x16. But layer-split runs one card at a time, so decode sees one card's
672 GB/s. Row-split runs both. Since decode is memory-bandwidth-bound rather than compute-bound, that
is a potential ~2× throughput change from a configuration, not hardware.

The discriminating evidence is GPU utilisation sampled during generation: layer-split alternates
between the cards, row-split keeps both busy at once. Measured, not assumed.

**6b. Native-Windows vLLM.** An earlier note here said vLLM would need WSL2. That was wrong: a native
Windows build exists with explicit SM 7.5 support (CUDA 12.8, RTX 20-series listed, no WSL or Docker),
and vLLM's Turing support is being extended rather than dropped, with documented workarounds —
`TRITON_ATTN`, float16 KV cache, 32-token blocks, eager mode.

**This changes the base.** `lmStudioVersion` is a sealing field, so a runtime swap invalidates
cross-comparison with all seven waves and needs its own manifest. 6a does not: split mode changes
throughput and device placement, not weights, lockfile or model id.

### 4. Tracer / observability — *note that this changes the base*

The observability surface has been `installed-unexercised` across three waves, holding ~30 NOT PROBED
scenarios. Wiring a tracer **alters the frozen base**: it needs a new BASE-MANIFEST, and results are
not directly comparable with Waves 1–7. That is a base change, not an addition, and it is why this
sits fourth rather than first.

### 5. RAG + re-ranker — *installed and live, entirely unmeasured*

`@mastra/rag` has zero probe coverage. The re-ranker on `:8412` returns HTTP 200 and the lab has never
called it. Partial infrastructure exists: `corpus2` is sealed and `generate-corpus-v2.mjs` already
describes a reranker path.

---

## Standing caveats

**One model.** Everything measured so far rests on `qwen3-coder-30b-a3b-instruct`. Item 3 is the only
thing that changes this.

**345 is a floor.** The register enumerates graph-edge scenarios only. Resource exhaustion, clock
skew, and multi-agent delegation are outside it. Wave 8 exists for delegation and has not been run.

**The build estimates in the table above were wrong, and the correction is recorded rather than
quietly applied.** Items 0, 1 and 2 were estimated at half a day, three quarters of a day and a third
of a day. They took roughly fifty minutes, twenty-one minutes and ten minutes, measured from the git
log. The estimates were framed in human working hours, which is the wrong unit for this work. What is
actually irreducible is measurement runtime — model latency, n=5 repetitions, the 120s timeout arms —
and download time, neither of which building speed affects. Items 3 to 5 are re-estimated on that
basis: roughly twenty to thirty minutes of build each, with item 3 dominated by ~30GB of model
downloads and ~1.5h of latency-bound runs.

**Estimates carry residual instrument risk.** The library should take defect overhead from 30–50% to
roughly 10–15%. It does not take it to zero, and the two new-territory items (4 and 5) carry the most.
