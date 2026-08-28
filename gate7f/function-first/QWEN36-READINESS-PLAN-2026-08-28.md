# Qwen3.6 readiness: retained findings and bounded diagnostic plan

Date: 2026-08-28.
Status: read-only repository findings and diagnostic design; no new live model result.
Planning authority: `../../PRODUCT-ROADMAP.md` and `../../roadmap/CURRENT-SLICE.md`, revision
`2026-08-28.1`. M1 is the first milestone, not completion of the remaining product roadmap.

## Purpose and current boundary

Keep all three primary candidates visible: Gemma 4 26B A4B, Qwen3 Coder 30B-A3B, and Qwen3.6 27B MTP.
Resolve Qwen3.6's specific readiness uncertainty so it can use the same real M1 functions. This is not
a new stack selection, a fourth quality candidate, or a benchmark-only detour before building functions.
Root's current implementation is M1-S1 role-separated provider contracts; this document does not claim
that those contracts, the Qwen diagnostic runner, or the full customer milestone are complete.

The read-only inspection started at RunaAI-Next commit `333912a72ee4252ff87805db4095c69b2abd8921`
on `codex/gate7f-agent-foundation`; the documentation follow-up observed
`daf92c69cb66a9f8f79aac9518ab8e0725969d82` while root's separate M1 files were in progress. The preserved
RunaLab checkout was clean on `main` at `ec5e3466f6f937c8c610bdecf62a09c2491c7137`.
Only repository source/evidence was inspected. No live host, private conversation, protected store,
model artifact, credential or service was accessed. No Home run or production change is represented here.

## Retained Gate 1 failure: what is known

`../../gate1/evidence/MODEL-VALIDATION-DEFERRED-REVIEW-2026-08-20.json` retains three attempts of the
**same** `deliberate-read-only-review` task, not three distinct tasks:

| Repetition | Elapsed milliseconds | Completion | Audit |
|---|---:|---|---|
| 1 | 30,006 | timeout | provider-timeout |
| 2 | 30,004 | timeout | provider-timeout |
| 3 | 30,016 | timeout | provider-timeout |

The record identifies requested model `qwen3.6-27b-mtp`. Its fallback response's `model.role` is
`not-invoked` and `modelId` is `none`; historical `gate1/core.mjs` initializes those fields and only
replaces them after a successful provider response. They do not prove that no provider request occurred.
The report contains no raw completed Qwen response, first-token timing, reasoning-token count, actual
loaded configuration, residency history, artifact digest, or backend binary identity for those attempts.
It establishes a deadline failure through the application path, not a specific physical or model cause.

Historical source is necessary because the current adapter has changed:

- `eb08af3:gate1/run-model-validation.mjs` supplies the synthetic boundary source, requests
  "Review the supplied source and summarize the enforced boundary.", sets a 30,000-ms budget and a
  512-output-token cap, and passes `reasoningOffDirective: true` for deliberate review.
- `eb08af3:gate1/adapters/mastra-provider.mjs` appends `\n/no_think` to the JSON user envelope. It uses
  Mastra/AI SDK's OpenAI-compatible provider with zero retries, temperature zero and the token cap.
  It does not set an API-level reasoning-control parameter.
- `eb08af3:gate1/core.mjs` catches provider timeout and emits the safe fallback above.
- `9c9ae79` records the scope amendment and removes the deferred model from the ordinary-role runner;
  `gate1/GATE1-RESULTS-2026-08-20.md` preserves the failed result rather than crediting a replacement.

Read-only reconstruction commands are `git show eb08af3:gate1/run-model-validation.mjs`,
`git show eb08af3:gate1/adapters/mastra-provider.mjs`, and `git show eb08af3:gate1/core.mjs`.
Do not rerun the old runner: it writes historical evidence paths and is not the new acceptance boundary.

## Earlier successful lab configuration and its limits

The original role campaign used LM Studio 0.4.21 and an installed llama.cpp engine. Its detailed MTP
load record is `probes/results/model-role-partial.jsonl`, line 255; the equivalent structured copy is
`probes/results/model-hardware-telemetry.json` at the `qwen3.6-27b-mtp` arm-start record.
All `probes/` paths in this document are relative to the repository root.

| Identity/configuration field | Retained MTP value |
|---|---|
| Model key / publisher | `qwen3.6-27b-mtp` / `unsloth` |
| Architecture / quantization | `qwen35` / `Q4_K_M` |
| Registry artifact bytes | 17,106,773,120 |
| Loaded / advertised context | 32,768 / 262,144 tokens |
| Evaluation / physical batch | 2,048 / 512 |
| Parallel / context checkpoints | 4 / 32 |
| Flash attention / GPU KV offload | true / true |
| MTP / simple / other draft model | true / false / empty |
| Maximum / minimum draft tokens | 2 / 0 |
| Minimum draft continuation probability | 0.75 |
| Reported model load time | 21.512 seconds |

The SHA-256 computed from the retained echoed prompt-template string is
`55d4931433fe502b794226ee7f4d206a6bdd436ac9f80eb7d8ebb4c639f9ea0c`. This is an echoed-template digest,
not a newly verified GGUF metadata digest or full model-file digest.

The separate base arm is `qwen3.6-27b`, **16,817,244,384 bytes**, with MTP disabled. The initial campaign
treated MTP as a decoding configuration of the same model family, not a separate quality competitor.
Substituting that different base artifact and changing MTP simultaneously is not a single-factor test.

`probes/run-model-role-matrix.mjs` used native `/api/v1/chat` with `reasoning: "off"` for the supported
normal/review requests, temperature zero, no streaming/storage, and normally 256 output tokens (192 for
code). Requests were allowed up to 900 seconds; the context exercise had a 1,800-second allowance.
They were not bound to Gate 1's 30-second application ceiling. The tool cases used
`/v1/chat/completions`, a 192-token cap, and a textual `/no_think` suffix.

The MTP role summary records chat 4/4, code 4/4, research 4/4, review 7/8, tools 4/4 and one context
pass. These small lab results do not establish modern M1 function acceptance or full product quality.
See `MODEL-ROLE-MATRIX-FINDINGS.md` and `probes/results/model-role-summary.json`.

### The textual reasoning directive was not sufficient in the old tool path

Retained MTP tool rows 280-283 in `probes/results/model-role-partial.jsonl` include `/no_think` yet
report **92, 101, 84 and 57 reasoning tokens**, respectively. The base arm's rows 216 and 218 report
`finish_reason: "length"` with **192 of 192 completion tokens used for reasoning**. Native review
responses with API-level `reasoning: "off"` report zero reasoning-output tokens.

This proves that the text suffix did not reliably disable reasoning in those tool requests. It makes
reasoning-control/transport behavior a justified first diagnostic factor. It does **not** prove that
reasoning caused Gate 1's distinct three timeouts: their raw runtime observations were not retained.

### Generation speed is not end-to-end review latency

| Original context exercise | Reported input tokens | First-token seconds | Wall seconds |
|---|---:|---:|---:|
| Qwen3.6 base | 22,348 | 45.814 | 49.325 |
| Qwen3.6 MTP | 22,348 | 70.276 | 73.160 |

These are rows 219 and 284 in `probes/results/model-role-partial.jsonl`. They passed the lab's marker
retrieval/context criterion, not a 30- or 60-second customer deadline. MTP's better generation rate did
not demonstrate better prefill or whole-request latency. Review context and latency need separate,
prospectively declared limits; do not silently raise a production deadline to make a model pass.

## Missing pins and actual-versus-suspected causes

The inspected original campaign retains registry identity and echoed load settings, but not an exact
Qwen3.6 artifact filesystem path/full SHA-256, source revision, or backend binary/version/digest.
`MODEL-CANDIDATE-RESEARCH-2026-08-20.md` explicitly distinguishes the registry inventory from the OS file
scan. No current Home residency, artifact integrity or runtime capability was verified in this task.

`../evaluation/home/HOME-RUNTIME-2026-08-27.json` pins LM Studio 0.4.21, Node 22.22.1, driver 596.86 and
`llama.cpp-win-x86_64-vulkan-avx2` 2.28.2 files for the later Gemma/Qwen-Coder campaign. It does not prove
that the original Qwen3.6 run used those binaries or that the current backend supports the same MTP arm.
A present-day reproduction can identify a current cause but cannot recreate an unrecorded old backend
exactly. State that limitation rather than inventing an old CUDA/Vulkan version.

| Finding or hypothesis | Status |
|---|---|
| Gate 1 exceeded its 30-second budget on all three attempts | Observed |
| `/no_think` allowed reasoning tokens in the earlier compatible tool path | Observed, different requests |
| MTP's old long-context prefill exceeded 60 seconds | Observed, different request |
| Gate 1 timed out specifically because reasoning remained enabled | Plausible; unverified |
| Cold loading, queued work, stale residency or aborted work occupied the endpoint | Plausible; unverified |
| Backend/MTP compatibility, template behavior or provider serialization caused the failure | Plausible; unverified |
| The model is intrinsically unsuitable for deliberate review | Not established |

## Do not widen the frozen two-model runner

`../qualification/runtime.mjs:117` accepts only `incumbent` and `gemma26`.
`../evaluation/v2/capture-contract.mjs:19` requires `speculative_draft_mtp === false`, and the existing
package builder and `RUN-SEAL-POWER-V2.json` contain only those two candidates. Current validation also
expects reasoning to be absent and uses the later runtime pins. These are intentional constraints of
that experiment, not evidence that Qwen3.6 is unsupported by every available backend.

Create a distinct M1 readiness package, runner, manifest and verifier beside those files. Reuse reviewed
pure helpers only where their contracts genuinely apply. Do not edit, reseal, replace or overwrite the
old runner, responses, initial judgments or result paths. The new manifest must explicitly describe the
third candidate, exact artifact/template/runtime pins, MTP setting and supported reasoning controls.

## Minimal diagnostic sequence, owned by root

1. **Read-only Home preflight and identity capture.** Verify host/operator, baseline listeners and
   production route, no unowned loaded model, available memory/GPU health, and original power settings.
   Locate the candidate through the existing model manager, verify metadata and full artifact hash,
   record its actual path, and hash the selected runtime files. Compare available installed-artifact
   provenance; a newly observed local hash is not proof of the original campaign's exact artifact.
   No substitute download, global configuration change or production routing change is implicit.

2. **Freeze a new diagnostic package before running it.** Use only generated non-private fixtures,
   loopback model endpoints, an exact allowlisted candidate and a create-only evidence directory.
   Pin wall-clock/token/response-byte/context limits, five-second hardware sampling, exact ownership,
   and a finite arm deadline. Preserve the reviewed 85-C stop boundary and failure sample retention;
   if the known 160-W envelope is used, bind exact GPU identities and restore verified prior settings.
   Record every attempt and classify this as readiness/regression, not scored function acceptance.

3. **Load once and distinguish cold versus warm time.** Require an echoed complete load configuration,
   its immutable fingerprint and exactly one owned resident instance. Verify the MTP setting, draft
   token count, context, template, offload and backend instead of assuming the model key controls them.
   Measure load duration separately. An ambiguous load response requires reconciliation, not an
   indiscriminate unload or a second load. Do not alter unrelated model defaults.

4. **Verify API reasoning control before interpreting it.** Inspect the installed runtime/API contract
   for the exact endpoint's supported field and value. `reasoning: "off"` on the native endpoint and
   `reasoning_effort: "none"` on the compatible endpoint are candidate controls, not interchangeable
   guarantees. Capture the actual serialized wire request. Require a normalized effective-setting echo
   where available; retain reported reasoning-token counts/output-channel flags and an on/off control
   probe to check observed behavior. HTTP 200 or an echoed request alone does not prove enforcement.
   If the runtime lacks trustworthy echo/observability, mark support/effect as unverified and diagnose
   that gap instead of calling reasoning disabled. Do not expose hidden reasoning in customer output.

5. **Use one-factor warm-request comparisons.** After support is established, repeat the original
   clean-source regression three times per condition on `/v1/chat/completions`: A uses the historic
   `/no_think` suffix and no API reasoning field; B is identical plus the supported API-level off flag.
   Keep artifact, backend, MTP, context, prompt, temperature, 512-token cap and 30-second ceiling fixed.
   Run A/B sequentially with no hidden retries; retain first-token/completion timing, token counts,
   stop reason, response shape and identity. Separate any load/queue/cancellation evidence from model
   generation. The new run's current runtime must not be mislabeled the exact historic environment.

6. **Branch only on a reproduced need.** If the request still times out, change only its diagnostic
   deadline to a predeclared finite ceiling, initially 120 seconds, to distinguish late completion
   from a hung or rejected request. Do not treat that as passing the former deadline. If needed, compare
   direct compatible transport with current Mastra serialization using the same wire semantics; then
   compare native API behavior as a separately labeled endpoint-adapter experiment. Change MTP on/off
   only on the same exact artifact/backend after verifying that isolated-instance configuration is
   supported. A different artifact, multiple changed flags or a global default change is not a
   single-factor experiment. Do not expand to unrelated models or a new soak without a concrete need.

7. **Establish the functional operating envelope.** Use a small predeclared context ladder relevant
   to M1 (short, approximately 4K, 12K, then the prior 22K scale if earlier levels remain within the
   safety budget). Measure actual token counts, prefill, completion, cancellation and post-abort
   idleness; estimate no latency from tokens-per-second alone. Declare the supported review context,
   output and customer latency before qualification. Deliberate reasoning-on, if proposed for that
   role, is a separate explicit configuration and budget, not an unnoticed addition to matched runs.

8. **Verify cleanup and conclude the diagnosis.** Unload only the exact owned instance, confirm no
   owned request remains, restore temporary settings, and compare baseline health/routing. Preserve
   every failed and interrupted attempt. If a control or identity cannot be verified, keep Qwen3.6
   explicitly blocked with the evidence; do not silently omit it or credit a substitute.

Abort on unexpected residency, integrity/runtime drift, unbounded output, unsafe hardware, unavailable
evidence storage or loss of ownership. Cleanup must still run on failure; no broad service termination,
protected-data access, persistent service, or production model switch is part of the readiness runner.

## Exit: real product functions, not another benchmark finish line

Readiness is complete only when the exact third candidate has a reproducible bounded request path,
observable effective settings, supported context/latency limits and verified cleanup, or a specific
reproduced blocker remains. A successful smoke response does not qualify any product role.

Continue the M1 order in `../../roadmap/CURRENT-SLICE.md`: shared model-neutral contracts; real
chat/continuity; approved-source retrieval; bounded project Code work; conversational actions; and
deeper review. Prove each function deterministically, run all three candidates through the same
implementation with fresh prospectively frozen cases, exercise the application/customer route, and
independently check actual outputs/effects. Keep control tests separate from model attempts and preserve
the >=90% role quality, zero critical failure and 100% mandatory-control requirements.

Function work can proceed in parallel with this bounded readiness diagnosis. The supporting stack is
not being reselected. No model can authorize tools, certify execution, widen a user's grant, or inherit
a production route from a readiness pass. M1 remains only the first milestone of the full roadmap.
