# Prospective M1 three-model readiness diagnostic

Authority: `../QWEN36-READINESS-PLAN-2026-08-28.md` and M1-S2 criteria. Root delegated sole Home
model-operation ownership to the readiness agent on 2026-08-28; root and other agents run no Home
inference concurrently. This is unscored readiness/regression, never M1 function quality qualification.
Old evaluation runners, seals and captures remain untouched.

The new create-only package freezes source, synthetic prompts, all three artifact/template pins, runtime
binary hashes, 32,768 context, 512 output tokens, three repetitions, 30-second requests and a separately
labelled 120-second late diagnostic. Qwen3.6 MTP is not replaced by its differently sized base artifact.
It requests instance-local MTP with draft2/min0/probability0.75 and verifies the echoed configuration.
No global model default, service, production route, power setting, or Control file is changed.

Conditions for Qwen3.6 are historical-style v0 text suffix, matched v1 text suffix, v1 API reasoning-off,
and native API reasoning-off. Only the matched v1 pair supports a single-factor reasoning-control
comparison; native/v0 endpoint changes are separately labelled. Gemma and Coder use the same compatible
transport, with API off only when their registry advertises support. Each has a metrics observation and
a finite context ladder; Qwen also has one explicit reasoning-on observation. Output, reasoning-token,
reasoning-channel, usage, TTFT and runtime observations are retained exactly. Missing echoes remain null;
HTTP 200 alone never proves reasoning disabled. No generated instruction is executed.

Every arm verifies the package, files, host, Node, templates, registry and one-owned-instance residency;
records cold loading separately; samples exact GPU UUIDs/memory/temperature/power every five seconds;
aborts on85C, low memory, drift, evidence failure or a finite arm deadline; and unloads only its known
instance in `finally`. Current260W limits are preserved (this is not the earlier160W soak). A30-second
timeout is retained even if a120-second diagnostic later completes. Post-timeout GPU idleness is only
observed idleness, not a server cancellation acknowledgement or proof of exclusive endpoint traffic.

Read-only preflight on2026-08-28 verified RUNA-HOME/codex-audit, Node22.22.1, all three unloaded, both
23,040MiB Quadro RTX6000 UUIDs,260W,41C/36C and unchanged1234/8412 listeners. Coder SHA and installed
LM Studio index.js SHA match retained pins; six runtime files and all three GGUF template hashes were
freshly verified by the new inventory. Full model hashes are checked again by each bounded arm.

The first inline metadata command exceeded Windows' command-line limit. Package r1 transport then
exposed Windows PowerShell5 native-argument quote stripping before unpacking; it made no model call.
Those failures were preserved. r2 uses streamed create-only transfer and single-quoted unpack literals.
The Control WSL host is only an SSH relay: transfer bytes never create Control files.

r2 package seal was created before any load/inference:
`67c3041790b3b0a806625ad6e4e0b49d73f0f36293b4a31176cb88c03946a1e3`.
Home root: `C:\Users\codex-audit\AppData\Local\RunaM1Readiness\20260828-readiness-r2`.
Local source check: `node --test gate7f/function-first/readiness/readiness.test.mjs`.

Primary API references checked2026-08-28:

- https://lmstudio.ai/docs/developer/rest/chat (`reasoning`, no-store, output channels, token/TTFT metrics)
- https://lmstudio.ai/docs/developer/rest/load (instance identity and effective load echo)
- https://lmstudio.ai/docs/developer/openai-compat/chat-completions (compatible request contract)

The compatible documentation omits reasoning_effort; the exact installed index.js contains its
validation and mapReasoningEffortToReasoningSetting -> per-request config/enableThinking. The diagnostic
must still establish actual behavior. Readiness success cannot promote a model or certify product roles.
