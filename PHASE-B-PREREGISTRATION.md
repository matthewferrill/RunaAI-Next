# PHASE B — preregistration (the components with zero coverage)

Committed and sealed **before** the harness exists. Phase B of `LAB-PLAN.md`.

## Why

Three stack components have **zero probe runs** across all seven waves:

- **`@mastra/rag`** — imported by **0** probe files. Retrieval was measured in the v2 sweep using raw
  `embedMany` and a bare vector store, never through the package the stack provides.
- **`@mastra/core/auth`** — the RBAC/FGA module. Every identity question in Waves 2, 3 and 6 was
  recorded **NO-MECHANISM**, which was true of the *configuration* and never checked against this.
- The **reranker** on RUNA-HOME port 8412 (`BAAI/bge-reranker-v2-m3`) is live, wired into production
  config, and has never been called by the lab.

Phase B asks what those components do, using the sealed corpus so retrieval quality is **graded
against labels written before any of this**, not asserted.

## The corpus

`probes/corpus2` is sealed and carries both the questions **and** the documents, so the corpus is
reproducible byte-for-byte. **13 retrieval cases** with answer-bearing labels (`mustContain`,
`fromDoc`):

| Axis | Cases | Corpus size |
|---|---|---|
| verbatim, paraphrase, conceptual, multi-hop, hard-negative | 5 | 60 |
| corpus-scaling | 3 | 60 / 300 / 1000 |
| topk (k = 1, 3, 10) | 3 | 300 |
| index-staleness | 1 | 60 |
| reranked | 1 | 300 |

Labels are **locked**. They are checked against, never widened (PROVING.md lock rule).

## Invariants

**I-PB1 — retrieval through `@mastra/rag` finds the planted answer.** Reported as a rate over the 13
cases with its denominator, per axis. No prediction is offered: this component has never run, so a
prediction would be invention.

**I-PB2 — reranking improves retrieval.** This is the decision the production config already assumes.
Measured as a **paired comparison**: every one of the 13 cases run with the reranker off and on,
same corpus, same query, same embedder.

**I-PB3 — the reranker's 512-token limit truncates silently.** `/health` reports `max_length: 512`.
A document longer than that is cut before scoring, so the reranker judges a fragment. Whether it
signals that is the question, and it is the Fray 3 shape exactly.

**I-PB4 — `@mastra/core/auth` supplies actor identity and expiry.** Waves 2, 3 and 6 recorded
NO-MECHANISM for wrong-actor and expiry. This asks whether the mechanism exists and was merely never
configured — the same error Phase A found for injection.

## Decision rules, fixed in advance

**For I-PB2, paired over 13 cases:**

- **IMPROVES** — reranking finds at least **3 more** cases than without.
- **NO EFFECT** — within ±2 cases.
- **DEGRADES** — finds at least 3 **fewer**.

Thirteen paired cases cannot resolve a small effect, and a difference of 1 or 2 will be reported as
**INCONCLUSIVE at this n**, not rounded toward the answer the production config already assumes.

**For I-PB1**, per-axis rates with denominators. A single axis failing is a finding about that axis,
not about retrieval.

**For I-PB4**, the same three outcomes Phase A used for a capability question: **PRESENT AND WORKS**,
**PRESENT BUT UNUSABLE AS CONFIGURED**, or **NO-MECHANISM**. Phase A showed the middle case is real —
the injection defence exists, works, and blocks legitimate tool use — so it is offered here as a
first-class outcome rather than discovered later.

## Rules carried forward

**Graded against sealed labels**, never against inspected output. An inspected corpus is no longer
held out.

**The deed is the retrieved text and the store on disk**, not the model's account of what it found.

**Both directions on every detector** before grading (PROVING.md rule 6). The retrieval scorer must be
shown to pass a correct answer and fail a wrong one.

**Controls mandatory.** Retrieval must find a verbatim planted answer in the smallest corpus, or the
whole phase is NOT DECIDABLE — a broken index would otherwise read as a component that does not work.

**The asymmetry rule** on clean results.

**The `:8412` service is outside the frozen base.** Its model, VRAM, `max_length` and 24.7 s cold start
are recorded per run. If it becomes load-bearing it must be pinned in `BASE-MANIFEST.json`.

## What Phase B does NOT do

It does not test a replacement reranker. **Qwen3-Reranker-4B** (32K context against BGE's 512) is the
obvious candidate and needs its own service on RUNA-HOME; that is a separate sealed comparison, not a
variable to change mid-phase.

It does not wire an observability tracer — that alters the frozen base and needs its own manifest.

It does not test `@mastra/evals`, which is a grading tool rather than a runtime component.

It makes no claim about any model other than the incumbent.

## Completion criteria

Complete when every case has run with per-run evidence under `artifacts/runs/`; I-PB1 to I-PB4 each
carry a verdict with n and denominator; the reranked comparison is reported paired with its decision
rule applied as written; controls are reported; and the instrument gate passed first.

Anything learned that suggests a scenario or rule is wrong goes into a new sealed version. This one
stands as committed.
