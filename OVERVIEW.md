# RunaAI and the Reference Lab — design and current status

Prepared 2026-08-20. Two related projects: **RunaAI**, a working agentic AI estate, and **Runalab**, a
measurement laboratory built to decide what RunaAI should be made of. Every figure below is taken from
the repositories and running systems rather than recalled.

---

## PART 1 — THE ESTATE

### Machines

**RUNA-CONTROL** — the production and development host. Runs the RunaAI application from
`C:\AI\Projects\RunaAI`, plus two Linux agent clones under WSL used by coding agents. Production is
updated only by reviewed fast-forward from GitHub `main`, never developed in directly.

**RUNA-HOME** — a compute host at 192.168.50.165. Dell Precision T7910: dual Xeon E5-2699 v3 (36
cores, 72 threads), **128 GB RAM** (upgraded from 16 GB on 2026-08-19), and **2× NVIDIA Quadro RTX
6000** (Turing, 24 GB each, 48 GB total) joined by **NVLink at ~51.6 GB/s aggregate**. Serves LM Studio
on port 1234 and a re-ranking service on 8412. No development or repository work happens here.

### The hardware constraint that shapes everything

Turing is compute capability 7.5. It has **no BF16 and no FP8**, and **FlashAttention (all versions)
requires Ampere or newer**. Several 2026-era models and formats simply will not run — MXFP4 weights
refuse to load, Gemma 4 has no working attention backend on Turing. Conversely Turing was the *first*
architecture with INT4 tensor cores, so 2023-era INT4 quantisation formats map onto silicon these cards
have and newer formats do not use. **Newer is not better on this hardware.**

### RunaAI application

- **169 ES modules** under `src/runa`, **98 documents** under `docs`, **940 commits**
- **One npm dependency** (`@simplewebauthn/server`). Everything else is hand-built.
- Four verifier entry points: `agent:preflight`, `verify`, `verify:control`, `verify:owner`
- Live at commit `b4db040` on Node v24.19.0, running continuously since 2026-08-18

**Model roles.** Four roles are defined in code — `chat`, `code`, `review`, `deep-review`. A per-machine
config maps roles to models: a lightweight `qwen3-4b` as the base default, with `qwen3-coder-30b-a3b`
serving chat, code and deep-review. A hard rule permits **only one role to declare a context length**
until a residency scheduler exists, because two managed roles would mean two schedulers competing over
one inference service.

**Model residency.** Three measured facts about the inference service govern this: a loaded model
carries roughly a 42-minute idle TTL; a just-in-time reload returns at the *service's* default context
rather than the configured one (the coder was set to 65,536 and came back at 16,384); and loading a
model already resident at a different context fails outright rather than resizing.

**Governance.** Approval is a Windows Hello ceremony in the owner's own interactive session, bound by
DPAPI. Ninety-plus numbered Decisions record the design. The load-bearing one for this work is
**Decision 0076: approval is never a stored bit** — the lifecycle has no `approved` state on disk, so
that a tampered record cannot claim an approval waiting to be spent.

**Working agreement.** Agents operate under a written contract: GitHub `main` is the source of truth,
one agent holds the write lane at a time, machine-bound state (credentials, DPAPI material, keys) is
never opened or copied merely because it is reachable, and a change is not complete until code, tests,
verifier, push, deployment, restart and live runtime confirmation are each reported as separate gates.

---

## PART 2 — THE LABORATORY

### Why it exists

Runa version 2.0 began with a question that could not be answered honestly: *what does everyone else
already do?* Research found that agentic AI now has a real standard stack — an agent framework, a tool
protocol, a memory layer with semantic recall, a vector index, a workflow engine for durable state.
Several components previously designed for Runa turned out to be known primitives with names and
maintainers.

The decision that followed governs everything since:

> **Install the industry standard exactly as it ships. Nothing custom enters until it proves it belongs
> there.**

Not because the standard is good, but because nobody knew where it was *weak* — and until that is
known, every custom component is a guess.

### The stack under test

Nine direct dependencies pulling **344 packages**, frozen and hash-recorded: `@mastra/core` (agents and
workflows), `@mastra/memory`, `@mastra/libsql` (SQLite store and vector index), `@mastra/mcp` (Model
Context Protocol), `@mastra/rag`, `@mastra/evals`, the Vercel AI SDK, an OpenAI-compatible provider
shim, and Zod.

The framework was selected from documentation before anything was run. **One constraint decided it** —
the estate is Node.js, and the more production-grade alternative (LangGraph) is Python-primary. Of five
binding constraints, one passed, three were partial or unverified, and one — *approval is never a stored
bit* — was explicitly recorded as unresolved.

### Method

**A sealed register.** Every edge in the system graph crossed with a fixed set of failure dimensions —
input, timing, persistence, concurrency, versioning, dependency, observability — producing **345
scenarios across 22 edges, 105 of which cross a trust boundary**. The denominator falls out of the
architecture rather than being chosen.

**Preregistration.** Each wave's scenarios, invariants and sample sizes are written, committed and
SHA-256 sealed *before* the harness exists. Every grader refuses to run if its preregistration changed
by a byte.

**Deed versus claim.** No component is graded by asking it how it did. Outcomes are read from ground
truth — a file on disk, a row in SQLite, an effect ledger, or the bytes on the wire. What a model *says*
it did is recorded separately as a claim to be checked.

**Control arms, mandatory.** A family whose control fails is NOT DECIDABLE, never a pass. A system that
declines everything and a boundary that holds are otherwise indistinguishable.

**The asymmetry rule.** One violation is conclusive. A clean series is written as *not observed in n
attempts, on this base* — never "safe".

**Frozen base.** Commit, lockfile hash, runtime version, model id, quantisation and context length are
recorded, and results are invalidated if any of them move.

---

## PART 3 — WHAT WAS FOUND

Seven waves, **1,501 runs**. Six frays recur across subsystems that share no code, which is what
distinguishes a property of the base from a quirk of one edge.

| # | Fray | Reach |
|---|---|---|
| 1 | **Unverified success reporting** | five subsystems |
| 2 | **Nothing ever gives up** (no client-side timeout) | three edges, four waves |
| 3 | **No completeness a caller can read** | three subsystems |
| 4 | **Retrieved content treated as instruction** | two channels, one persistent |
| 5 | **Interruption leaves no nameable state** | two waves |
| 6 | **No identity of any kind** | four waves, all NO-MECHANISM |

**Representative evidence.** In 23 of 325 tool-chain runs the agent asserted a completed file write with
no file on disk — the recurring phrase being *"I have confirmed it was written."* One documented memory
API call stores a fact, silently skips its embedding, and returns success: durably saved, permanently
unfindable. Zero of sixty workflow persistence runs could be resumed to a defined terminal state. And
**durable injection**: a payload written once into memory steered a later, unrelated agent into an
irreversible transfer, three times of three, against zero of three on the control.

**What held, and is adopted unchanged.** Concurrency lost nothing in 240 attempts across three waves.
Sandbox containment, tool-edge input validation and version refusal all held. The goal was to build
*less*, and those results are recorded as carefully as the failures.

### Constraint probes

The two constraints that made the framework choice provisional were finally measured:

- **No outbound traffic — HELD, 0 of 18.** Nothing phoned home under any exercise, including first
  initialisation against an empty store. Phrased under the asymmetry rule: no outbound observed at the
  Node layer, which is not proof of no outbound.
- **Approval never a stored bit — VIOLATED 13 of 13 on the letter.** A granted approval is written to
  the snapshot store, survives a crash, and remains readable after execution completes.
- **No record substitutes for a steward act — HELD, 0 of 15.** But **0 of 15 refusals cited approval**.
  The stack does not reject a replayed grant; it never evaluates one. A grant only exists while a run is
  in a non-resumable state, so it is inert by construction rather than by being checked — a defence that
  a version change could remove.

### Model comparison arms

Four models, 61 runs each, controls 6/6 and base unchanged on all four:

| Arm | Model | Fabrication | Provider truncation | Injection steering |
|---|---|---|---|---|
| A | qwen3-coder-30b-a3b (MoE) | 19/30 | **5/5** | 5/10 |
| B | qwen3.6-27b (dense) | 9/30 | **5/5** | **0/10** |
| C | qwen3-4b (dense) | 12/30 | **5/5** | 4/10 |
| D | llama-3.3-70b (dense) | 3/30 | **5/5** | 4/10 |

**Injection is closable by model choice — for one model only.** Qwen3.6-27B steered zero of ten where
the incumbent steered five. The 4B and the 70B both sat at four of ten, so it is neither a scale nor an
era effect. Two arms would have suggested "newer models resist injection" and been wrong.

**Fabrication is INCONCLUSIVE** on all three comparisons and remains so. The spread is wide, but the
rule sealed before any new model ran required a floor of zero and none reached it.

**Provider truncation is 5/5 on every arm without exception** — a truncated response stitched into a
confident answer is model-independent. That one is architectural.

### Instruments

Roughly two dozen defects were found in the measuring tools themselves before any finding was trusted.
They fell into five patterns and are now enforced in code rather than remembered: a value silently
stuck, a harness that did not run being recorded as data, a fixed sleep used as synchronisation, a
grader narrower than its invariant, and a measurement whose target sat in its own input.

The sharpest was an injection detector that returned false in every run **by construction** — it would
have reported "no steering observed" across all 22 trust-boundary scenarios. The general lesson: **a
test of the negative cannot distinguish "correctly false" from "always false."** Every detector must
now be shown to fire in both directions.

---

## PART 4 — WHAT RUNA WILL OWN

Seven items, each naming the run that proves it. Everything else is adopted as it ships.

1. **A verified round trip on every write.** Acknowledged is not stored; stored is not retrievable.
2. **A bounded call, everywhere.** A client-side timeout with a definite state on expiry.
3. **Completeness a caller can read.** An index, a write and a response must each report whether they
   finished.
4. **Retrieved content as data, never instruction** — memory guarded harder than retrieval, because a
   single successful write compromises every future turn.
5. **A nameable terminal state after any interruption.**
6. **Identity: actor, expiry, and endpoint.**
7. **Clear a spent grant from disk, and make refusal an authorisation check** rather than a side effect
   of a state machine.

---

## PART 5 — CURRENT STATUS

**Production.** Live at `b4db040`, Node v24.19.0, continuous since 2026-08-18. Core development is
paused pending the migration decision the laboratory exists to inform.

**Laboratory.** All seven waves complete and graded. Constraint probes complete. All four model
comparison arms complete and graded. 70 commits.

**Hardware.** RUNA-HOME upgraded to 128 GB RAM. Base verified unchanged across the upgrade by
bit-identical embedding digests. Measured baseline throughput: **71.7 tokens/second**.

**Runtime experiments.** Speculative decoding with a draft model was a **67% regression** (71.7 → 23.7
tok/s) and was reverted — a 4B dense draft cannot accelerate a 3B-active MoE, because the draft costs
more per token than the target. Row-split across both GPUs is unreachable through the current serving
tool's command surface and remains untested.

**Known limits.** The register enumerates graph-edge scenarios only, so 345 is a floor rather than a
ceiling. Multi-agent delegation has not been run. Retrieval and evaluation components are installed and
never probed. Model-mediated results rest on the four arms above and no more.

**Open next steps.** Wire an observability tracer (which changes the base). Probe the retrieval layer
and re-ranker. Test a serving runtime with real request timeouts, which could close fray 2 without Runa
building anything. Recalibrate the model-arm decision rule in a new sealed version, since requiring a
floor of zero proved stricter than the data warranted.

---

## APPENDIX — ON LOOP ENGINEERING

A note on framing, since the evidence supports it directly.

Prompt engineering treats the model as the system: outputs improve by improving inputs. The fray map
says that is the wrong altitude. **Four of the six frays are missing code, not missing words** — no
timeout, no completeness signal, no recoverability, no identity. No prompt closes any of them.

The model arms sharpen it. Fabrication came in at 19, 9, 12 and 3 out of 30 across four models — a wide
spread, and **not one arm reached zero**. Provider truncation was **5/5 on every arm**. You cannot
prompt your way out of a layer that hands you a truncated answer and calls it done.

Where prompting-adjacent choices did matter it was model *selection* rather than wording: one model
steered 0/10 where three others steered 4–5/10.

So the unit of engineering is the loop — what the agent is handed, what it may act on, what gets
verified before it counts, and what happens when a step fails. **All seven items Runa will own are loop
properties. None is a prompt.**
