# Runtime findings — throughput on the frozen base

Item 6a of `LAB-PLAN.md`. Measured on RUNA-HOME: 2× Quadro RTX 6000 (Turing, SM 7.5), NVLink present
at ~51.6 GB/s aggregate, 128 GB system RAM. Model `qwen3-coder-30b-a3b-instruct`, Q6_K, 65536 context,
parallel 4.

## Baseline

**71.7 tok/s** mean over three 400-token generations — 71.3, 71.5, 72.2. Remarkably consistent.
Memory split 17589 / 14980 MiB across the two cards; utilisation 36% / 37%.

## Speculative decoding: a 67% regression

`--speculative-draft-simple --speculative-draft-model qwen/qwen3-4b`

| | tok/s | runs |
|---|---|---|
| baseline | **71.7** | 71.3, 71.5, 72.2 |
| speculative decoding | **23.7** | 18.8, 25.2, 27.1 |
| delta | **−66.9%** | |

**Reverted.**

### Why, and it is not a tuning problem

Speculative decoding pays off only when the draft model is *much cheaper* than the target. Here the
premise is inverted:

- the target, `qwen3-coder-30b-a3b`, is a **MoE with ~3B active parameters** per token
- the draft, `qwen3-4b`, is **4B dense** — every parameter active

**The draft is more expensive per token than the target it is drafting for.** Every accepted token
costs a full 4B dense forward pass to save a 3B-sparse one, and every rejected token wastes it
entirely. No acceptance rate can make that arithmetic work.

This is a general result about sparse targets rather than a fact about these two models: **a
low-active-parameter MoE is close to the worst case for speculative decoding**, because the thing
being accelerated is already cheaper than any dense draft small enough to be worth loading.

MTP was tried first and refused outright: *"MTP speculative decoding requires a GGUF model with a
bundled supported MTP head."* This build has none.

## Base integrity across the experiment

The reload was pinned with `-c 65536 --parallel 4 --ttl 3600` because a reload otherwise returns at
the service default — RunaAI's `model-residency.mjs` records this exact model coming back at 16,384
after being set to 65,536. Verified afterwards:

- context **65536**, quantization **Q6_K** — unchanged
- all three `base-drift` embedding digests **bit-identical**
- all generation samples **textually identical**

The base did not move.

## Incidental observation, not a finding

Memory rebalanced from 17589 / 14980 MiB (2.6 GB asymmetric) to 22595 / 22232 MiB (363 MiB, near
even) when the draft model was resident. That is consistent with the draft loading and the split being
recomputed, but it is confounded by the extra model and is **not** evidence about split mode.

## Item 6a is closed; row-split was never reachable

`lms load` exposes `--gpu` offload ratio, context length, `--parallel`, `--ttl` and speculative
decoding. **There is no `--split-mode` or `--tensor-split` option**, so llama.cpp's row-split cannot
be reached through LM Studio's command surface at all. The hypothesis that row-split might roughly
double decode throughput by using both cards' bandwidth remains **untested and untestable in-base**.

Testing it requires running `llama-server` directly, which changes the runtime and therefore the base
— that is item 6b, alongside native-Windows vLLM.

## What this leaves for Fray 2

Fray 2 — *nothing ever gives up*, no client-side timeout on three independent edges — is unaffected.
Neither lever tried here introduces a request timeout. The Fray 2 question still rests on 6b.
