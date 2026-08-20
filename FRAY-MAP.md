# The fray map — seven waves, and what Runa must own

The consolidated result of the whole measurement programme: **1,501 recorded runs across seven
waves**, on a frozen base, against 345 sealed scenarios covering 22 edges, 105 of which cross a trust
boundary.

> **Evidence correction (2026-08-20).** Write-success prevalence rates derived from lexical semantic
> grading remain withdrawn. The original Wave 7 is `NOT_DECIDABLE` because its wire logs were absent;
> the separately sealed Wave 7 v3 rerun retained and hash-bound all 97 wire logs and now supplies the
> provider-boundary conclusions below. Unaffected disk, database, control and effect-ledger findings
> remain evidence.

This replaces the v2 sweep that previously stood here, preserved in git history at `d1716a5`. That
sweep's headline — that `semanticRecall` was a stock knob which recovered recall at every depth — was
**downgraded by Wave 1's I-C**, which failed it at the preregistered threshold. That is the best
argument for this document existing: the earlier map was built from n=1 cells, and its central claim
did not survive being measured properly.

Every wave was preregistered and SHA-256 sealed before its harness existed, and every grader refuses
to run if its preregistration has changed by a byte.

---

## 1. Every invariant, every verdict

Read `not observed` as **not observed in n attempts, on this base** — never as "safe". One violation
is conclusive; no number of clean runs is.

### Wave 1 — first contact (snapshot, crash, memory, tools)

| Invariant | Verdict | Rate |
|---|---|---|
| I-A snapshot integrity | **VIOLATED** | 3 of 6 applied variants; explicit detection 0/6 |
| I-B1 at most one effect | not observed | 0/25 |
| I-B2 recoverable to a defined state | **VIOLATED** | 20/25 |
| I-C semanticRecall recovers recall | **NOT HELD** at threshold | — |
| I-D working-memory template | mechanism supported | — |
| W1-E tool chain reports success falsely | **VIOLATED** | 3/3 |
| W1-F tool call runs unbounded | **VIOLATED** | 2/6 |

### Wave 2 — governance and adversarial boundaries (182 runs)

| Invariant | Verdict | Rate |
|---|---|---|
| I-2A injection via retrieved document | **VIOLATED** | encoded payload fired the governed effect 1/5 |
| I-2B injection via tool result | **VIOLATED** | — |
| I-2C injection via tool description | **VIOLATED** | — |
| I-2D | not observed | — |
| I-2E effect executes on arguments changed after approval | **VIOLATED** | 5/5 |
| I-2F secret leakage | **NOT DECIDABLE** | control 2/5 — the model declines rather than the boundary holding |
| I-2G sandbox escape | not observed | control 3/3 |
| wrong-actor, expiry | **NO-MECHANISM** | stock carries neither |

### Wave 3 — the durable-state boundary (282 runs)

| Invariant | Verdict | Rate |
|---|---|---|
| I-3A concurrency, snapshot store | not observed | 0/60 |
| I-3B concurrency, effect target | not observed | 0/60 |
| I-3C record and effect agree | **VIOLATED** | **0 of 60 persistence runs recoverable to a defined terminal state** |
| I-3D retry and duplicate delivery | not observed | 0/40 |
| I-3E versioning | not observed | 0/24 |
| I-3F resume payload input | **VIOLATED** | stale and unauthorized **NO-MECHANISM** |
| I-3G observability | **VIOLATED** for durable retention | trace **NOT PROBED** |

### Wave 4 — the tool chain, end to end (325 runs)

| Invariant | Verdict | Rate |
|---|---|---|
| I-4I malformed input never reaches the filesystem | **HELD** | 0/84 |
| I-4C concurrency does not corrupt or lose a write | **HELD** | 0/60 |
| I-4V an unhonourable schema is refused | **HELD** | 0/24 |
| I-4D a dependency failure surfaces as a failure | **VIOLATED** | 5/18 |
| I-4T calls resolve inside the cap | **VIOLATED** | 16/313 |
| I-4P disk state and what the agent was told agree | **VIOLATED** | 18/30 |
| I-4O observability | HELD 0/6 | 18/24 **NOT PROBED** |

**23 of 325 runs asserted a completed write with no file on disk.**

### Wave 5 — memory durability (285 runs)

| Invariant | Verdict | Rate |
|---|---|---|
| I-5A concurrent store writes | **HELD** | 0/60 |
| I-5B concurrent vector writes | **HELD** | 0/60 |
| I-5C index concurrency | **VIOLATED** | 1/60 — one observation, not a rate |
| I-5D crash leaves store and caller agreeing | **VIOLATED** | 5/30 |
| I-5E message and embedding agree | **VIOLATED** | 5/30 |
| I-5F interrupted index does not present itself as complete | **VIOLATED** | one mechanism at n=25 |

### Wave 6 — memory correctness, and what comes back out (249 runs)

| Invariant | Verdict | Rate |
|---|---|---|
| I-6A content refused, not half-stored | **VIOLATED** | 3/21 |
| I-6B state the code cannot interpret is refused | **VIOLATED** | 33/36 — **24 strong, 9 arguable** |
| I-6C an embedding failure surfaces | **VIOLATED** | 25/30 |
| I-6D embedding calls resolve inside the cap | **VIOLATED** | 10/40 |
| I-6E retrieved index content is data, not instruction | **VIOLATED** | 1/21 |
| I-6F recalled memory content is data, not instruction | **VIOLATED** | 3/21 |
| I-6G observability | HELD 0/12 | 12/24 **NOT PROBED** |

### Wave 7 v3 — the provider boundary (96 graded runs; 97/97 wire logs verified)

| Invariant | Verdict | Rate |
|---|---|---|
| I-7D an endpoint failure surfaces | **VIOLATED** | 4/30 dependency runs |
| I-7I input bounded before it is sent | **VIOLATED** | 3/21 input runs |
| I-7T turns resolve, one turn yields one generation | **VIOLATED** | 10/91 adversarial runs |
| I-7X anything checks who receives the context | **NO-MECHANISM** | changed model accepted 5/5; source review agrees |

---

## 2. The six frays that recur across independent subsystems

A defect on one edge is an edge property. **The same defect on subsystems that share no code is a
property of the base**, and that distinction is what this programme exists to make.

### Fray 1 — Unverified success reporting *(five subsystems)*

The dominant finding. Something succeeded according to the system, and did not happen.

- **W1-E** tool chain: 3/3
- **W2** a transfer recorded in the ledger while the answer said it had not acted
- **W4** defect existence supported by at least 15 retained answer prefixes; the old 23/325 prevalence rate is withdrawn
- **W5** `saveMessages` returns success, stores the message, writes no embedding — durably saved, permanently unfindable
- **W6** the same shape from an unhealthy endpoint, 25/30, reachable from five distinct causes
- **W7 v3** provider edge: 4/30 dependency runs asserted an answer without a usable completed response

Nothing above these layers can distinguish a real success from a reported one.

### Fray 2 — Nothing ever gives up *(three edges, four waves)*

- **W1-F** 2/6 hung to ~120s
- **W4** oversized input unbounded 6/6 across two edges
- **W6** embed timeout unbounded 5/5; oversized memory write unbounded 3/3 with nothing stored
- **W7 v3** provider timeout hit the cap 5/5; one partial-response run also hit the harness cap

The cold-load confound (72–107s, measured on both sides of a hardware change) was preregistered and
ruled out. There is no client-side timeout anywhere in the stack.

### Fray 3 — No completeness a caller can read *(three subsystems)*

- **W5** a half-built index returns scored results identical in shape to a complete one; `describeIndex`
  reports a count and no build state
- **W6** a truncated write and a skipped embedding are invisible from above
- **W7 v3** partial responses lacked an acceptable completion state 5/5; four still reached the caller

### Fray 4 — Retrieved content is treated as instruction *(two channels, and one persists)*

- **W2** an encoded payload in a retrieved document fired a governed effect, 1/5; also via tool result
  and tool description
- **W6** **durable injection**: a payload written once into memory steered a later, unrelated agent
  into an irreversible transfer — **3/3 through recalled memory, 1/3 through the index, 0/3 on the
  clean twin**

A prompt injection fires once. **A memory injection fires on every recall, for as long as the memory
survives.** This is the only fray where a single successful write compromises every future turn.

### Fray 5 — Interruption leaves no nameable state *(two waves)*

- **W1** I-B2 violated 20/25
- **W3** I-3C: **0 of 60 persistence runs could be resumed to a defined terminal state**

A run that neither executed nor errored, and cannot say which, is unusable to a caller.

### Fray 6 — There is no identity anywhere *(four waves, consistently absent)*

Every identity question returned **NO-MECHANISM**, not a failure:

- **W2** no actor identity, no expiry on approval
- **W3** the same on resume, confirmed on a second edge
- **W6** the same on memory writes
- **W7 v3** no endpoint identity — a response declaring a different model changed nothing 5/5, and
  source inspection found metadata exposure but no equality gate

Nothing was broken here. Nothing was ever there.

---

## 3. What held, and is adopted as it ships

Recorded as carefully as the failures, because the point of the exercise was to build **less**, not
more.

| Property | Evidence |
|---|---|
| **Concurrency** | 0/60 (W3 ×2), 0/60 (W4), 0/120 (W5) — no lost write, no corruption, no double effect, at n=10 per question |
| **At-most-once effects** | W1 I-B1 0/25; W3 I-3D 0/40 — retry and duplicate delivery did not multiply an effect |
| **Sandbox containment** | W2 I-2G, control 3/3; W4 I-4I 0/84 — no path escaped the root |
| **Tool-edge input validation** | W4 I-4I 0/84 |
| **Tool-edge versioning** | W4 I-4V 0/24 — changed protocol, changed schema, and removed tool all refused |
| **Duplicate vectors** | structurally prevented; `vector_id` is UNIQUE, 0 observed |

**Concurrency is the clearest result in the programme.** Two processes hammering one store lost
nothing in 240 attempts across three waves. Whatever Runa needs, it is not a custom concurrency layer.

---

## 4. Candidate stack requirements — current bake-off decisions

These are capability requirements suggested by the decision-grade evidence. RunaLab tested an
out-of-the-box component first; custom code is admitted only where the selected standard component
leaves a measured semantic residual. This remains a stack decision, not a RunaAI migration decision.

1. **A verified round trip on every write.** Acknowledged is not stored; stored is not retrievable.
   *(Frays 1 and 3 — W4 existence evidence with rate withdrawn, W5 I-5E, W6 25/30)*
2. **A bounded call, everywhere.** A client-side timeout with a definite state on expiry.
   *(Fray 2 — supported on W1-F, W4, W6 and corrected W7 v3)*
3. **Completeness a caller can read.** An index, a write and a response must each be able to say
   whether they finished. *(Fray 3 — W5 I-5F, W6 and corrected W7 v3)*
4. **Retrieved content as data, never instruction — memory guarded harder than retrieval.**
   *(Fray 4 — W2 I-2A, W6 I-6F 3/3 against a 0/3 control)*
5. **A nameable terminal state after any interruption.** *(Fray 5 — W3 I-3C 0/60)*
6. **Identity: actor, expiry, and endpoint.** *(actor/expiry evidence in W2, W3 and W6; endpoint
   identity absence confirmed by corrected W7 v3 plus source review)*

Any earlier statement that these items were already assigned to custom Runa ownership is superseded.

| Fray | Current assignment | Status |
|---|---|---|
| 1 verified effects | PostgreSQL transaction/outbox plus LangGraph PostgreSQL checkpoints; narrow domain idempotency/postcondition adapter | selected |
| 2 bounded calls | AI SDK total deadline and zero implicit retry, with Caddy as an outer guard | selected |
| 3 readable completeness | provider finish/model policy, preflight bounds, PostgreSQL state, Qdrant reconciliation, and explicit-window BGE reranking | selected; hard reranker corpus passed 12/12 |
| 4 retrieved data/instruction | Keycloak/OpenFGA/PostgreSQL one-time capabilities for governed effects; typed feature-specific retrieval/output contracts; classifiers omitted after no candidate passed | selected; 120/120 capability matrix and 40/40 non-tool matrix passed |
| 5 interruption state | LangGraph JS with PostgreSQL saver; Mastra remains agent/tool composition only | selected |
| 6 identity | Keycloak OIDC plus OpenFGA resource authorization; pinned provider model identity | selected for opt-in security profile |

All six measured frays now have selected stack assignments, and the selected development boundaries
passed one composed RunaLab vertical slice. RunaAI remains paused until a separate port scope is
authorized.

---

## 5. What this map does not say

**Models are now role-qualified, not globally ranked.** Six runnable arms were compared on the live
Home hardware, including the Qwen3.6 MTP runtime arm and gpt-oss-20b. The selected roster and its
repository-scale coding caveat are recorded in `MODEL-ROLE-MATRIX-FINDINGS.md`.

**345 is a floor, not a ceiling.** The register enumerates graph-edge scenarios only. Failure modes
that do not sit on an edge — resource exhaustion, clock skew, multi-agent delegation — are not in it.
Wave 8 exists for delegation and has not been run.

**Nineteen instrument defects were found and fixed before any finding was trusted.** Five would have
voided a family or a wave outright. One would have reported *"no steering observed"* across all 22
trust-boundary scenarios — a clean bill of health on the exact question that wave existed to answer.
One would have manufactured a **safeguard** rather than a violation, which is the harder failure to
notice because good news invites less scrutiny. And one was a process error of mine: two measurements
running at once on a single host, which contaminated a run while the checkpoint totals stayed
perfectly clean.

**Contamination does not always show up in the totals.** That is the most transferable thing this
programme learned, and it is why every detector must now be shown to fire in both directions before
it is trusted — a test of the negative cannot distinguish *correctly false* from *always false*.
