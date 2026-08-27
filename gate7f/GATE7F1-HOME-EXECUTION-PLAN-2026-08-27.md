# Gate 7F-1 authorized Home execution plan

Date: 2026-08-27
Source baseline: `ccbdca49d9bc6da3ede5075501633e3d36c518a1`
Branch: `codex/gate7f-agent-foundation`

## Authority and scope

The steward explicitly authorized the pinned 14.4-GB Gemma 4 26B A4B download, exact hashes,
one-model-at-a-time Home-only comparison against the installed Qwen incumbent, retained synthetic
evidence and hardware telemetry, and unloading afterward. No production routing or Control change is
authorized. The 31B arm, runtime updates, model promotion, real agent tools, protected data, and Git
push/merge remain excluded.

The original five-file evaluation seal is preserved. Operator/transport tests and runtime evidence are
additional artifacts, not permission to adjust the corpus, prompts, grader, attempts, or thresholds.

## Verified read-only preflight

- The isolated checkout is clean at the source baseline; origin references were fetched.
- Home is `RUNA-HOME`, Windows 10 Pro, two Xeon E5-2699 v3 processors, 128-GB class RAM.
- Both GPUs are Quadro RTX 6000, 23,040 MiB each; driver 596.86.
- LM Studio is 0.4.21.0; Home Node is 22.22.1; CLI commit is `71bd99c`.
- No LM Studio LLM or embedding instance was loaded at first preflight.
- The existing reranker remains running and uses about 1,627 MiB on GPU 0. It is not an evaluation
  candidate and is not stopped, unloaded, or reconfigured. Report candidate memory relative to this
  baseline, not as though both GPUs started empty.
- The existing model directory is `C:\lm-studio-models`. C: has over 200 GB free.
- Existing listeners 1234 and 8412 are unchanged. Requests originate on Home to loopback; no listener,
  firewall rule, proxy, authentication setting, or production route is added or changed.
- Omen has no direct Home SSH profile. The established audit SSH hop through Control WSL is transport
  only: no Control file, source checkout, service, setting, or protected data is changed.

## Work and green criteria

1. Inventory and hash the exact incumbent GGUF and installed runtime files. Record identities before
   loading. Refuse a different size, file, or ambiguous artifact.
2. Download only the pinned Gemma file from its immutable Google repository revision into a dedicated
   Home model subdirectory. Preserve existing files, use a partial filename, verify full SHA-256 before
   finalizing, and retain the artifact's license/notice metadata. Do not use an HF credential.
3. Build a bounded capture operator. The model receives only the sealed synthetic messages, never the
   expected answers/grader, host paths, shell tools, runtime management tools, credentials, or live data.
4. Before each arm require zero LM Studio loaded instances. During the arm require exactly its owned
   instance and unchanged 32,768 context/load configuration; abort on another instance or workload drift.
5. Run each of 35 cases exactly three times with the frozen token caps and temperature zero. Keep
   transport/runtime validation separate from quality grades. Do not silently retry or replace a model
   response, reformat malformed JSON, strip reasoning, or change a prompt after seeing an answer.
6. Retain append-only synthetic requests/responses, fingerprints, request timing, token counts, GPU
   memory/temperature/utilization/power, host free memory, and exact load/unload responses. Report missing
   metrics as missing, not zero. Model content is never executed.
7. Stop on provider/parse/truncation failure, runtime or artifact drift, unexpected model residency,
   GPU temperature at or above 85 C, less than 8 GiB free host RAM, or runtime instability. A transport
   interruption is not a failed answer and cannot be silently removed from the fixed denominator.
8. Always unload only the instance created by this arm. Never issue unload-all or stop an unrelated
   process. Verify no owned instance remains and record post-unload memory recovery.
9. Grade complete retained observations with the sealed local grader. Partial/invalid arms are not
   decidable and cannot select a production role. Record failures and limitations as well as passes.

## Rollback and stop conditions

The rollback is exact-instance unload and ending the temporary capture process. The verified downloaded
artifact and synthetic evidence may remain for reproducibility; no broad deletion is performed.
An interrupted download remains a named partial file and is never registered as a verified model.
If an unexpected production request loads another model, stop the arm and preserve that unrelated
instance. Do not freeze the application, stop the reranker, edit model residency policies, or change
Control routing to make the test pass.

Any compatibility repair requiring a runtime update, changed model template, new endpoint exposure,
production service interruption, or alteration of the sealed test design is a new decision, not an
implicit part of this authorization.
