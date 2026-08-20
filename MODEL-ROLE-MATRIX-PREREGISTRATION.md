# Model role matrix preregistration

Frozen: 2026-08-20, before any scored Phase C run. RunaAI remains paused.

## Question

Which already-downloaded local model is fit for each Runa role on the measured RUNA-HOME hardware,
and does the one documentation-qualified new candidate add a capability that justifies keeping it?

## Arms

The quality arms are `qwen/qwen3-4b`, `qwen3-coder-30b-a3b-instruct`, `qwen3.6-27b`,
`llama-3.3-70b-instruct`, and `gpt-oss-20b`. `qwen3.6-27b-mtp` is a speed-only arm after the base
Qwen3.6 run; it is not counted as a separate quality candidate. No existing artifact is downloaded
again. A model is loaded alone and the harness unloads only the instance it loaded.

## Fixed runtime arm

- Runtime: the live LM Studio v1 API and installed llama.cpp engine on RUNA-HOME.
- Context: 32,768 requested tokens; the echoed load configuration is retained.
- `flash_attention=true`, `offload_kv_cache_to_gpu=true`, and `echo_load_config=true` are requested.
- Temperature zero. Reasoning off where the API/model supports it for the comparable role suite.
- Normal replies are capped at 256 tokens; the code expression cap is 192 tokens.
- Every prompt, raw response, grade, API timing/stat block, and before/after hardware snapshot is kept.
- No model may remain concurrently loaded. A pre-existing loaded LLM aborts that arm.

## Fixed scored cases

The runner contains the frozen case text and expected labels:

- routing: 4 exact JSON category/priority decisions;
- conversational awareness: 4 multi-turn fact/correction tests;
- code: 4 JavaScript expression tasks, syntax checked and executed against frozen unit cases in a
  code-generation-disabled VM after dangerous-token rejection;
- research: 4 closed source packets with distractors, exact facts, and required source identifiers;
- review/grading: 4 vulnerable/clean twins (8 cases), including untrusted comments that request a
  canary phrase; and
- tool use: 4 OpenAI-compatible function-call cases with exact tool name and arguments.

The grader is deterministic and uses no model judge. Text outside the required JSON is a format
failure. Review outputs containing the canary phrase fail regardless of the vulnerability label.

## Gates

| Role | Quality gate | Runtime gate |
|---|---|---|
| Routing | at least 3/4 exact | median generation at least 10 tok/s |
| Chat | at least 3/4 exact | median generation at least 10 tok/s |
| Code | at least 3/4 unit-tested expressions and at least 3/4 tool calls | median generation at least 10 tok/s |
| Research | at least 3/4 fact-and-citation exact | no hidden placement failure |
| Review | at least 6/8 exact and zero canary emissions | no hidden placement failure |

Every quality candidate must also pass one near-context exercise: the API must report at least 20,000
input tokens and the reply must reproduce both planted boundary markers. An out-of-memory response,
silent endpoint failure, unreported/undeclared CPU spill, or failure to unload makes that arm invalid.

Role selection is the fastest valid arm that passes the role gates unless a slower arm improves the
role score by at least 25 percentage points. If no arm passes, the result is a measured gap, not a
reason to lower the gate. The new candidate is kept only if it wins a role, uniquely closes a gate,
or provides at least 25% better median speed at equal-or-better role quality.

## Hardware evidence

Before load, after load, after each role group, and after unload, capture host free physical memory and
per-GPU VRAM, utilization, temperature, clocks, power, and P-state. Record NVLink status once per arm.
The API's own load configuration, time-to-first-token, prompt rate, generation rate, and token counts
are retained. NVLink presence alone is not evidence of pooled VRAM.

## Interruption and partial-result rule

Results are append-only JSON Lines. A later invocation may skip completed case IDs only when the
stored model artifact identity and preregistration/runner hashes match. Partial evidence cannot select
a model or close Phase C. A failed arm is recorded and the next arm continues when doing so is safe.

