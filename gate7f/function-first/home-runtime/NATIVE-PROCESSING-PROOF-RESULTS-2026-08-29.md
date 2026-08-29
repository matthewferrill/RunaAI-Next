# Native positive-processing proof results

Date: 2026-08-29  
Criteria: [NATIVE-PROCESSING-PROOF-CRITERIA.md](NATIVE-PROCESSING-PROOF-CRITERIA.md)  
Disposition: **PASS on immutable attempt R4**

## Passing result

R4 used the exact Nomic artifact and frozen synthetic embedding request under seal
`0a94f7a61c6f3cefd1a38b6ee7b824bd36e3ca880fa026ac2cbb4ed66a448971`.
The Matthew-context sampler retained eight projected samples. It observed both `idle` and
`computingEmbedding`, and the maximum reported queue was 187. The projected sample stream SHA-256 is
`9f9d8060402bd273d8efc5c545a98cc4a2589d31ce5c5ffeaa8625bcc29120d7`.

All 96 frozen concurrent requests settled successfully: 96 succeeded, zero failed and zero were
unknown. They returned 192 vectors with 768 finite values each. Maximum elapsed time was 4,383 ms and
the bounded attempt aggregate SHA-256 is
`d5fcf403280fe30931b3c6eb1a37288350ecea28f7ccdf28c3fcb57a70f44e9e`.

Fourteen five-second hardware observations were retained. Maximum temperature was 43 C, maximum
telemetry gap was 5,014 ms, minimum free host memory was 125,974,990,848 bytes and maximum observed
per-GPU memory use was 1,881 MiB. The exact owned Nomic instance was unloaded afterward. The final raw
observation proves zero residency, no owned proof tasks, both GPUs at 260 W, and the existing listeners
on 1234 and 8412 unchanged. Its SHA-256 is
`8d02949886a6b0f725f8c999737eb57b64bc00b0a4cbda4692b6defb59773b37`.

The immutable export packet SHA-256 is
`b13b592700ac13f1591399fe929043a6165457063eeec843be2d02b627016623`.
The decoded packet, source pins, telemetry, samples, request receipt, lifecycle receipts and final
observation are retained under
`evidence/20260829-native-processing-proof-r4-passed/`.

## Earlier attempts retained without reinterpretation

- R1 seal `d827372f...` failed before inference because the sampler did not override the protected safe-
  write root. It was aborted without requests, unloaded, restored to 260 W and retained under
  `evidence/20260829-native-processing-proof-r1-failed/`. The R1 lease stamped
  `inferenceCalledByOperator:true` unconditionally despite the absence of `requests.json`; that receipt
  defect was corrected prospectively and is not rewritten in the retained evidence.
- R2 seal `3df08ec4...` failed before any output or model load because the generalized proof-ID check used
  the `code` leaf instead of its parent proof directory. The exact empty terminal task was retired only
  after rechecking zero residency and 260 W. Final observation receipt SHA-256:
  `eb76384e189e588b21954d3db92f3c9667c6038b6b7ed2d78f279032b678a1c4`.
- R3 seal `8888b62a...` completed all 96 requests but the sampler rejected an added, unexported SDK metadata
  field before retaining a sample. It was closed as incomplete, unloaded and restored. Raw evidence is
  retained under `evidence/20260829-native-processing-proof-r3-failed/`. The sampler was corrected to
  validate and export only the required identity/status/queue projection while tolerating bounded
  forward-compatible metadata it never retains.

Every correction was committed before its successor package was sealed. No failed attempt was reused,
overwritten or regraded.

## Claim limit

This proves the installed LM Studio CLI exposes real positive processing and queued state for one exact
owned Nomic workload. It does not prove admission closure, global drain, protected-user exclusion,
model quality, native settings mutation, or production readiness. In particular, existing legacy
1234/8412 traffic remains a separate preservation and managed-caller problem.
