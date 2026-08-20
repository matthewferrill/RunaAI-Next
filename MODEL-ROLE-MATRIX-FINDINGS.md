# Model role matrix — findings

Status date: 2026-08-20. Evidence: `probes/results/model-role-summary.json`,
`probes/results/model-hardware-telemetry.json`, and `probes/results/routing-contract.json`.

## Decision

| Role | Selection | Why |
|---|---|---|
| Routing / decisioning | Deterministic application policy | No plausible model passed the sealed 8/8 explicit-taxonomy routing contract. A four-category policy is cheaper, faster, and auditable. |
| Fast chat, code, tools, research | Qwen3 Coder 30B-A3B Q6_K | Chat 3/4, code 3/4, tools 4/4, research 4/4, context pass; roughly 80–82 generation tok/s on Home. One specialist covers four roles without keeping extra models resident. |
| Deliberate chat and untrusted-content review | Qwen3.6 27B Q4_K_M with MTP | Chat 4/4, code 4/4, research 4/4, review 7/8, tools 4/4, context pass. MTP improved median generation by roughly 29% over the same base weights and fixed the base arm's tool score. |
| Low-memory fallback | Qwen3 4B Q4_K_M | Chat 3/4, code 4/4, tools 4/4, context pass at roughly 69–74 tok/s. It is not selected for research or review. |
| Embedding | Nomic Embed Text v1.5 | Existing selected embedding path; retained. |
| Reranking | BGE reranker v2-m3, windowed | Existing model; hard corpus improved from 0/12 to 12/12 only when explicit windows prevented silent truncation. |

Models are loaded by role and unloaded/recovered between incompatible residency arms. The lab does not
credit the physical NVLink bridges as pooled 48 GB memory: LM Studio exposed multi-GPU placement and
both GPUs were observed, but the backend did not expose evidence that peer-link traffic caused the
result. NVLink remains installed capacity, not a selection claim.

## Candidate dispositions

- **Qwen3.6 27B base:** valid quality arm but superseded by the same model's MTP runtime configuration,
  which was faster and stronger on tool use.
- **Llama 3.3 70B Q4:** not an interactive fit on these Turing cards. It generated around 3.5 tok/s
  and fell to 1.37 tok/s in the context arm.
- **gpt-oss-20b MXFP4:** the one justified new download completed once (12.1 GB). It was fast and
  called tools 4/4, but passed only chat 3/4, code 2/4, research 2/4, review 5/8, and did not meet the
  20K-token context gate. Two code requests also produced LM Studio engine protocol errors. Retain it
  as a future runtime/model-update arm; do not route current Runa work to it.
- **Granite, Gemma, Devstral, Phi, GLM and larger gpt-oss/Qwen alternatives:** screened from current
  official documentation and rejected before download for license, hardware/runtime, duplication, or
  size/latency reasons recorded in `MODEL-CANDIDATE-RESEARCH-2026-08-20.md`.

## Capability limits

The matrix tests conversational recall/corrections, bounded JavaScript transformations, exact tool
arguments, source-grounded synthesis, adversarial code review, and a long-context marker recovery.
It is enough to choose a lab roster, but it is not evidence that a model can autonomously port RunaAI.
The first read-only chat/research port slice is the required repository-scale acceptance case for the
coder and review roles. Failure there changes the role assignment; it does not justify hiding the
failure behind a larger model or an external API.

The first routing arm was explicitly invalid for exact-label comparison because no taxonomy was
given. The sealed supplement corrected that defect with an enforced JSON schema. None passed 8/8, so
the lab selected deterministic routing instead of pretending a near miss was sufficient.
