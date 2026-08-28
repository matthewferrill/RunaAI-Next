# Prospective M1 three-model readiness diagnostic

Authority: `../QWEN36-READINESS-PLAN-2026-08-28.md` and M1-S2 criteria. Root delegated sole Home
model-operation ownership to the readiness agent on 2026-08-28; root and other agents run no Home
inference concurrently. This is unscored readiness/regression, never M1 function quality qualification.
Old evaluation runners, seals and captures remain untouched.

The new create-only package freezes source, synthetic prompts, all three artifact/template pins, runtime
binary hashes, 32,768 context, 512 output tokens, three repetitions, 30-second requests and a separately
labelled 120-second late diagnostic. Qwen3.6 MTP is not replaced by its differently sized base artifact.
It requests instance-local MTP with draft2/min0/probability0.75 and verifies the echoed configuration.
No global model default, service, production route or Control file is changed. Initial r2 preserved260W;
its thermal stop led to the prospectively sealed r3 temporary160W envelope described below.

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
instance in `finally`. r2 preserved260W; r3 restores the original260W after all controlled160W arms. A30-second
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

## Retained thermal stop and prospective controlled-power r3

r2 stopped during its third text-suffix request. The failing sample is retained: GPU1 reached85C at
2026-08-28T15:34:13Z while GPU0 was79C. The exact Qwen instance was unloaded and cleanup verified. Two
completed text-suffix attempts each used512 reasoning tokens, no answer, finish=length, approximately
19.1s. This demonstrates that textual /no_think did not disable reasoning in this present configuration;
it does not prove the unrecorded historical Gate1 timeout cause. r2 is incomplete, not a passing arm.

The next package restarts all three candidates with the same reviewed160W envelope used successfully
by the earlier lab, unchanged85C cutoff, exact UUIDs, <=45C cooldown before each arm and original260W
restoration in `finally` after verified model cleanup. Only GPU power limits change temporarily; no
clock, firmware, fan curve, service, production route or unrelated process changes. If160W also reaches
85C, stop and retain evidence rather than raising the thermal boundary. Readiness performance under
160W must not be represented as default260W production performance.

The r3 package seal is `4a17bf88c5d77af50b2c46b9063d1ded7f42dd114f9bb78f7d0754cd048bbe10`, created before
any r3 model call. r2/raw failures remain immutable. The new power wrapper follows the already-reviewed
target-UUID before/apply/restore method, preserves original settings, and retains create-only power
evidence. Source checks6/6 and PowerShell parse check passed before restarting. Runner result logging
also records literal request token-cap enforcement and whether observed elapsed time met its budget.

`verify-export.mjs` independently recomputes retained byte/request hashes, captured observation/result
binding, raw response/answer binding and actual output caps. Its negative tests reject byte tampering,
invented answers and incorrect request hashes. This checks evidence integrity, not semantic answer
quality or product functionality. `Invoke-HomeReadiness.ps1 -Mode Status` is a read-only residency,
temperature, power and listener check; it creates no model instance or host file.

## r3 child interruption and SSH-independent r4

Qwen's complete r3 arm is retained. Gemma's r3 process stopped immediately after its successful warmup,
before a runner result or model cleanup. The power wrapper recorded failure and refused restoration
while the model remained. Exact child-exit/native-stream evidence was absent, so the underlying cause
is not established. An orphan Omen SSH process remained after the Home child/wrapper had gone.
`Recover-HomeReadiness.ps1` verified the r3 seal and captured load identity, unloaded only that Gemma
instance and restored both original260W limits; `recovery.json` records the recovery at15:57:42Z.
No partial model arm is represented as complete.

r4 keeps the same models, requests, context, token limits, deadlines,160W envelope and85C cutoff.
Only the interrupted Gemma and unstarted Coder arms run again. A one-off, no-trigger Home Task Scheduler
job owns the supervisor independently of SSH. The supervisor captures bounded local child stdout/stderr,
records5s watchdog evidence, binds child termination to PID/start time, and can unload only an instance
proven by the captured load response. It refuses ambiguous/unowned cleanup. Each child is bounded to31min
(runner itself30min); the one-off task limit is100min including finite cooldowns, with no automatic retry.
The task registration is removed after retained results and verified power restoration, not left recurring.

Before r4, the no-model S4U scheduler probe retained seven5s heartbeats across a closed dispatch SSH
connection, correctcodex-audit identity and TaskResult0. Its completed one-off registration was removed;
the proof remains in `evidence/20260828-scheduler-probe/probe.jsonl`. This proves lifecycle independence,
not model readiness. Relevant Windows contracts are [task principals](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)
and [bounded task settings](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
