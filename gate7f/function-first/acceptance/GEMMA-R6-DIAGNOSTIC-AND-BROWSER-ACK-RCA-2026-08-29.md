# Gemma R6 diagnostic and browser-ACK RCA

Date: 2026-08-29  
Scope: synthetic M1 function-first qualification only  
Production routing changed: no  
Protected/private data read: no

## Outcome

The sealed Gemma R6 run recorded all 120 planned attempts and stopped no candidate early, but it is
diagnostic evidence rather than a model-quality result. Four attempts ended before a gradeable
customer-function record was complete:

| Case | Repetition | Retained failure |
| --- | ---: | --- |
| `agent-05-cancel-drain` | 1 | `m1-browser-preparation-unproven` |
| `agent-05-cancel-drain` | 2 | `m1-browser-checkpoint-unobserved` |
| `agent-06-crash-reconcile` | 2 | transient Windows `EBUSY` while consuming the browser ACK |
| `agent-05-cancel-drain` | 3 | transient Windows `EBUSY` while consuming the browser ACK |

The first two records are operator-bridge timing failures. The latter two isolate a shared reader
defect: the owner-side publisher creates and fsyncs `browser-ack.json` under an exclusive Windows
handle, while the sealed reader retried only `ENOENT`. If the directory entry became visible before
the writer released its handle, `lstat` or `readFile` could return `EBUSY`/`EPERM`; the journey then
recorded that operating-system sharing window as if Runa's customer action had failed. This defect is
independent of the selected large model and makes a matched comparison unfair.

The diagnostic campaign's exact plan, result, four raw attempt hashes and the two bound
request/ACK pairs are recorded in
`evidence/campaign-20260829-gemma-r6-diagnostic/manifest.json`. The plan contains 120 unique Gemma
slots. The result contains 120 records (116 completed and four failed), zero `notExecuted` slots,
no stop code and an unchanged denominator. The hardware outcome is deliberately separate and does
not infer these application counts.

The two raw `EBUSY` records do not retain stack traces. Their attribution is therefore stated at the
level the evidence supports: source-flow plus bound artifacts. At `agent-05` phase `1:run.start`, the
campaign wrapper calls the `before-native-dispatch` browser checkpoint before the native action. At
`agent-06` phase `3:worker.restart`, the fault action calls the `unknown` browser checkpoint after
state capture. The retained request and complete ACK for each exact case/repetition are present, but
their consumed markers are absent. No broader stack-trace claim is made.

No failed attempt is relabelled. The run remains retained as diagnostic evidence, and independent
semantic grading is not used to turn it into a qualification result.

## Correction

`browser-checkpoint.mjs` now retries only `ENOENT`, `EBUSY` and `EPERM` until the already sealed
checkpoint deadline. It checks the deadline again after every read, verifies the post-read byte
count and validates the entire ACK into temporary structures before atomically committing evidence
and checks. All structural, size, schema, scope, nonce, evidence-reference and check-binding errors
still fail closed. The change does not extend the native execution hold, create an approval, change a
model route or accept incomplete JSON.

The focused suite covers `EBUSY` and `EPERM` recovery, immediate non-transient failure, persistent
transient expiry, a valid late read, one operator-visible absolute deadline, transient-then-malformed
JSON, missing required checks, malformed evidence/check/reference suffixes with zero ledger mutation,
oversized files and a Windows reparse-point ACK. It passes 17/17.

The complete three-model campaign must be resealed and rerun from the corrected source. Gemma R6 is
not compared with a later candidate run from different runner bytes.

## Hardware lifecycle

Home lease `20260828-campaign-gemma-r6` completed through the separately retained atomic completion
publisher. Home unloaded the exact Gemma and Nomic instances, restored the original GPU power state,
reported no worker/supervisor failure and unregistered the owned scheduled task. Its retained hardware
outcome intentionally makes no model-function quality claim.
