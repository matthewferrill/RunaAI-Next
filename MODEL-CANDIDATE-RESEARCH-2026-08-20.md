# Model candidate research — hardware-qualified refresh

Status date: 2026-08-20. RunaAI remains paused. Documentation makes a model eligible for a lab arm;
only retained runs on RUNA-HOME can select it.

## Live estate boundary

- RUNA-CONTROL is an OptiPlex 7060 with an i5-8500T, 16 GB RAM, integrated graphics, and a 256 GB
  SSD. It remains the application, governance, scheduling, and records host; no heavy model is placed
  there.
- RUNA-HOME is a Precision T7910 with two E5-2699 v3 CPUs (36 cores/72 threads), 128 GB matched ECC
  memory at 2133 MHz, a 512 GB SSD, and 2 TB HDD.
- HOME has two Quadro RTX 6000 cards with 23,040 MiB usable VRAM each, ECC enabled. NVIDIA telemetry
  sees two NVLink links per GPU at 25.781 GB/s each. This is two devices plus a fast peer link, not an
  automatic 48 GB allocator.
- The cards are Turing generation. Prefer GGUF/llama.cpp paths proven on CUDA/Turing; do not assume
  Hopper/Blackwell BF16, FP8, MXFP4, or FlashAttention benchmark behavior carries over.

## Existing model inventory — reuse first

LM Studio v1 reported these downloaded models. The registry size, quantization, architecture, and
context are the artifact identity used for initial screening; the model campaign records the final
load configuration and live telemetry separately.

| Model key | Architecture | Artifact | Registry size | Advertised context | Capability position |
|---|---|---:|---:|---:|---|
| `qwen/qwen3-4b` | Qwen3 dense | Q4_K_M | 2,497,458,879 B | 32,768 | Fast routing baseline; reasoning on/off and tool-use metadata present. |
| `qwen3-coder-30b-a3b-instruct` | Qwen3 MoE, 30.5B total/3.3B active | Q6_K | 25,104,724,288 B | 262,144 | Coding and tool-use incumbent; non-thinking only. |
| `qwen3.6-27b` | Qwen3.6 dense/hybrid attention | Q4_K_M | 16,817,244,384 B | 262,144 | General chat, research, and review candidate; reasoning on/off. |
| `qwen3.6-27b-mtp` | same base plus MTP draft artifact | Q4_K_M | 17,106,773,120 B | 262,144 | Runtime-speed arm only, not an independent quality model. |
| `llama-3.3-70b-instruct` | Llama dense 70B | Q4_K_M | 42,520,398,528 B | 131,072 | Slow deep-review/general comparison; custom Llama 3.3 license. |
| `text-embedding-nomic-embed-text-v1.5` | Nomic BERT | Q4_K_M | 84,106,624 B | 2,048 | Existing embedding service; not a generative candidate. |

The OS file scan found the 4B and bundled Nomic files directly while LM Studio v1 reported all six
downloaded registry artifacts and their byte sizes. The model manager is therefore the authoritative
download inventory for this campaign. No listed model is downloaded again.

## Refreshed external candidate screen

| Candidate | Documentation finding | Hardware/role decision |
|---|---|---|
| **Qwen3.6-27B** | Official Apache-2.0 model; 27B, hybrid Qwen3.5 architecture, tool use, multimodal lineage, 262K context. | Already downloaded. Keep for full general/chat/research/review matrix. Its LM Studio text artifact is tested as text-only. |
| **Qwen3-Coder-30B-A3B-Instruct** | Official Apache-2.0 model; 30.5B/3.3B active, 256K native context, tool format, repository-scale coding, non-thinking. | Already downloaded. Keep as the primary code/tool candidate. |
| **Llama 3.3 70B Instruct** | Official 70B dense multilingual instruction model, 128K context, GQA, Llama 3.3 community license. | Already downloaded. Keep as the large slow comparison; 42.5 GB weights make dual-GPU/NVLink/offload behavior decisive. |
| **gpt-oss-20b** | Official OpenAI Apache-2.0 open-weight model; 21B/3.6B active, 131K context, structured output, tool use, adjustable reasoning. LM Studio publishes a ~13 GB llama.cpp path. | Add as the one new candidate. It fits one card by size and tests whether a newer sparse reasoning model improves tool use/review without the 70B load cost. Native MXFP4 acceleration is newer than Turing, so only local telemetry/performance can accept it. |
| Granite 4.1 30B | Official IBM Apache-2.0 30B long-context assistant with tool calling, RAG, coding, and FIM. | Documentation-qualified but not downloaded: dense footprint and role overlap with the newer existing Qwen3.6 do not justify another large artifact before a measured Qwen gap exists. |
| Gemma 3 27B | Official Google 27B, 128K, multimodal, gated Gemma terms. | Not downloaded: no unique required role, gated terms, and no evidence it beats the existing 27B candidate on this estate. |
| Devstral Small 24B | Official Mistral Apache-2.0 code/agent model with GGUF availability. | Not downloaded: older code-specialist alternative is dominated for first testing by the already-installed official Qwen3 Coder arm. Reopen only if that arm fails code/review gates. |
| Phi-4 reasoning-plus 14B | Official Microsoft MIT model, dense 14B, 32K, reasoning tuned for math/science/code and roughly 50% more output tokens. | Not downloaded: narrow reasoning purpose and 32K ceiling do not add a missing initial role. Reopen if compact deep reasoning remains a measured gap. |
| GLM-4.5-Air 106B-A12B | Official Z.ai MIT hybrid reasoning/code/agent model, 106B total/12B active. | Not downloaded: quantized weights exceed the two-card VRAM budget and would depend heavily on RAM offload on dated CPUs. Reopen only if smaller review models fail. |
| gpt-oss-120b | Official OpenAI model intended for at least roughly 60 GB accelerator memory. | Not downloaded: cannot reside in the 45 GiB usable GPU estate and would confound quality with heavy CPU offload. |

## Runtime settings fixed for the first matrix

- LM Studio 0.4.21 and its llama.cpp engine remain the runtime under test.
- Each model is loaded alone at a common 32,768-token context with the load response echoed.
- Flash Attention and GPU KV offload are requested and their actual echoed values recorded.
- Reasoning is off for routing/chat/code where the model supports that switch; research/review records
  the model's supported reasoning setting rather than hiding extra reasoning latency.
- Temperature is zero for deterministic task arms. Model-specific creative sampling is outside this
  selection.
- One near-context exercise per model must report at least 20,000 input tokens and return both planted
  boundary facts.
- Per-GPU VRAM, utilization, clocks, temperature, power, host free memory, load time, first-token
  time, and generation rate are captured. Silent offload and slow-but-loads outcomes are failures for
  interactive roles.
- NVLink receives credit only if a spanning model uses both GPUs and its measured result improves a
  feasible context or performance outcome. Presence alone is not pooling proof.

## Retained campaign outcome

The single approved `openai/gpt-oss-20b` MXFP4 download completed at 12,109,657,348 downloaded bytes;
no existing model was downloaded again. Live execution disproved the documentation-only fear that
MXFP4 could not load on Turing, but it did not select the model: tool calls passed 4/4 and chat 3/4,
while code was 2/4, research 2/4, review 5/8, and the context arm did not reach the fixed 20K-token
input gate. The final role decisions are in `MODEL-ROLE-MATRIX-FINDINGS.md`.

## Primary sources

- Qwen3.6-27B: https://huggingface.co/Qwen/Qwen3.6-27B
- Qwen3-Coder-30B-A3B-Instruct: https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct
- Llama 3.3 70B Instruct: https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct
- gpt-oss model card: https://openai.com/index/gpt-oss-model-card/
- gpt-oss local model: https://lmstudio.ai/models/openai/gpt-oss-20b
- Granite 4.1 30B: https://huggingface.co/ibm-granite/granite-4.1-30b
- Gemma 3 27B: https://huggingface.co/google/gemma-3-27b-it
- Devstral Small: https://huggingface.co/mistralai/Devstral-Small-2505
- Phi-4 reasoning-plus: https://huggingface.co/microsoft/Phi-4-reasoning-plus
- GLM-4.5-Air: https://huggingface.co/zai-org/GLM-4.5-Air
- LM Studio model list/load/unload/chat API: https://lmstudio.ai/docs/developer/rest
- llama.cpp gpt-oss CUDA support: https://github.com/ggml-org/llama.cpp/discussions/15095
