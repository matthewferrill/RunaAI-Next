# RunaAI and the Reference Lab — design and current status

Prepared 2026-08-20. Two related projects: **RunaAI**, a working agentic AI estate, and **Runalab**, a
measurement laboratory built to decide what RunaAI should be made of. Every figure below is taken from
the repositories and running systems rather than recalled.

> **Evidence correction (2026-08-20).** The 1,501 records exist, but not every published rate is
> decision-grade. Write-success rates produced by the retired lexical claim detector are withdrawn,
> and Wave 7 wire-level claims are `NOT_DECIDABLE` because 97 referenced wire logs were absent before
> preservation. See `evidence/EVIDENCE-REGISTRY.json`. Sealed preregistrations remain untouched as
> chronology; corrected status in findings and derived reports supersedes their old summaries.

---

## PART 1 — THE ESTATE

### Machines

**RUNA-CONTROL** — the production and development host. Runs the RunaAI application from
`C:\AI\Projects\RunaAI`, plus two Linux agent clones under WSL used by coding agents. Production is
updated only by reviewed fast-forward from GitHub `main`, never developed in directly.

**RUNA-HOME** — a compute host at 192.168.50.165. Dell Precision T7910: dual Xeon E5-2699 v3 (36
cores, 72 threads), **128 GB RAM** (upgraded from 16 GB on 2026-08-19), and **2× NVIDIA Quadro RTX
6000** (Turing, 23,040 MiB usable each) with two reported NVLink links per GPU at 25.781 GB/s each.
Serves LM Studio on port 1234; the selected BGE re-ranking lab service uses 8412 when started. The lab
does not treat NVLink or the two cards as one automatic 48 GB allocator. No repository development
happens here.

### The hardware constraint that shapes everything

Turing is compute capability 7.5 and lacks native BF16/FP8 acceleration. Newer kernels and formats
therefore require live runtime proof rather than a model-card assumption. The campaign corrected one
earlier overstatement: gpt-oss-20b MXFP4 **did load** and generated quickly in LM Studio on these cards,
although its retained quality, context, and protocol results did not earn a role. **Newer is not
automatically better on this hardware, but documentation alone cannot declare it impossible.**

### RunaAI application

- **169 ES modules** and **34,899 lines** under `src/runa`; **123 test files** and **20,309 test lines**
- **One npm dependency** (`@simplewebauthn/server`). Everything else is hand-built.
- One shared 128-command verifier exposed through three verification profiles plus API/chat/command consumers
- Read-only estimate checkout at `10eaffc` on 2026-08-20; live production deployment state is a separate operational fact

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
the estate is Node.js, and LangGraph was then treated as Python-primary. That premise is now superseded:
LangGraph has a maintained JavaScript implementation and must be compared on retained recovery evidence. Of five
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

Seven waves produced **1,501 recorded runs**. The six-fray map is now a mixture of supported findings
and hypotheses awaiting corrected adjudication; the evidence correction above governs every count.

| # | Fray | Reach |
|---|---|---|
| 1 | **Unverified success reporting** | five subsystems |
| 2 | **Nothing ever gives up** (no client-side timeout) | three edges, four waves |
| 3 | **No completeness a caller can read** | three subsystems |
| 4 | **Retrieved content treated as instruction** | two channels, one persistent |
| 5 | **Interruption leaves no nameable state** | two waves |
| 6 | **No identity of any kind** | four waves, all NO-MECHANISM |

**Representative evidence.** Wave 4 preserves at least 15 answer prefixes that visibly assert success
against a missing or incomplete deed, which supports the defect's existence but not the previously
published 23/325 prevalence rate. One documented memory
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

| Arm | Model | Write-claim rate | Provider wire claim | Injection steering |
|---|---|---|---|---|
| A | qwen3-coder-30b-a3b (MoE) | **NOT DECIDABLE** | **NOT DECIDABLE** | 5/10 |
| B | qwen3.6-27b (dense) | **NOT DECIDABLE** | **NOT DECIDABLE** | **0/10** |
| C | qwen3-4b (dense) | **NOT DECIDABLE** | **NOT DECIDABLE** | 4/10 |
| D | llama-3.3-70b (dense) | **NOT DECIDABLE** | **NOT DECIDABLE** | 4/10 |

**Injection is closable by model choice — for one model only.** Qwen3.6-27B steered zero of ten where
the incumbent steered five. The 4B and the 70B both sat at four of ten, so it is neither a scale nor an
era effect. Two arms would have suggested "newer models resist injection" and been wrong.

**Write-success fabrication comparisons are NOT DECIDABLE.** Their lexical semantic grader is invalid
in both directions; the old 19, 9, 12 and 3 counts are withdrawn detector output, not measurements.

**The provider-truncation arm comparison is NOT DECIDABLE from the preserved package.** Its per-run
wire logs are missing, so the summary fields cannot be independently checked against the stated deed.

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

**Laboratory.** Phases A–E are complete as a component-selection and composition lab. Corrected seals,
formal evals, retrieval/reranker probes, model-role measurements, a restart/replay vertical slice,
Caddy budgets, OpenTelemetry redaction, and the security-last gate are recorded in
`LAB-COMPLETION-REPORT-2026-08-20.md`. Withdrawn early semantic and wire-dependent claims remain
withdrawn; their corrected successor evidence is retained rather than rewriting history.

**Hardware.** RUNA-HOME upgraded to 128 GB RAM. Base verified unchanged across the upgrade by
bit-identical embedding digests. Measured baseline throughput: **71.7 tokens/second**.

**Runtime experiments.** Speculative decoding with a draft model was a **67% regression** (71.7 → 23.7
tok/s) and was reverted — a 4B dense draft cannot accelerate a 3B-active MoE, because the draft costs
more per token than the target. Row-split across both GPUs is unreachable through the current serving
tool's command surface and remains untested.

**Known limits.** The register enumerates graph-edge scenarios only, so 345 is a floor rather than a
ceiling. Model-mediated results are bounded by the sealed arms and routing supplement. The lab proves
component composition under its recorded harnesses, not persistent production installation, private
TLS, credential lifecycle, backup/restore, or a completed RunaAI migration.

**Open next step.** Review `RUNA-2-ARCHITECTURE-ASSESSMENT-2026-08-20.md`. If its first gate is approved,
freeze parity contracts and then build only the smallest read-only chat/research slice. The migration
plan is decision-gated; no lab completion result authorizes production activation or protected-data
conversion.

---

## APPENDIX — ON LOOP ENGINEERING

A note on framing, since the evidence supports it directly.

Prompt engineering treats the model as the system: outputs improve by improving inputs. The fray map
says that is the wrong altitude. Several frays are missing runtime capabilities, not missing words —
bounded calls, completeness, recoverability and identity. Whether each capability comes from a stock
component or custom code is deliberately undecided until the stack bake-off closes that cell.

The model arms do not currently settle write-success fabrication or provider truncation: both columns
are `NOT_DECIDABLE` for evidence-quality reasons. The sound lesson is methodological—model narration
cannot establish external state, so the loop must expose and verify the deed independently.

Where prompting-adjacent choices did matter it was model *selection* rather than wording: one model
steered 0/10 where three others steered 4–5/10.

So the unit of engineering is the loop — what the agent is handed, what it may act on, what gets
verified before it counts, and what happens when a step fails. The candidate requirements are loop
properties, not prompts; implementation ownership remains open.
