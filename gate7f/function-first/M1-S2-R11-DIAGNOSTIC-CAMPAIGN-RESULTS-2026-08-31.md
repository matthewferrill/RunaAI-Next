# M1-S2 R11 diagnostic campaign results

Status: one complete Qwen Coder arm retained as diagnostic evidence; not eligible for role selection.
R11 did not proceed to Qwen3.6 or Gemma because the first arm reproduced an operator-publication
defect in all three Agent05 attempts. No production route changed and no protected data was read.

## Sealed arm

- Source commit: `7fa7e954d623455ab8c5a1a8e7e3c4ac84341112`
- Source archive SHA-256: `b78aab3af3cb95236e28ea1109ddd2b4e13924870cc2e916b89cf001f3a2229a`
- Runtime seal SHA-256: `f0e0287eba7406f4da0590fb4113ec056dd4045200b7ffdbbf4b8e1dcb27ec0b`
- Case bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Candidate: `qwen3-coder-30b-a3b`
- Home lease: `20260829-campaign-coder-r24`
- Home lease seal: `ef77daff3cbef2407eb083011a40a873f3c1f75bc1ab17968c1ac7da93087b41`
- Result SHA-256: `2565fdc7cbff87ae172b2f984437e0ebc5b1a29736b22b4d3f4b2c8914c5298b`
- Recorded attempts: 120/120; 117 completed and three failed.

All three failures were `agent-05-cancel-drain` with
`m1-browser-checkpoint-unobserved`. The actual browser displayed the required cancelled state, exact
bounded-drain notice, completed inspect receipt and already-dispatched test awaiting reconciliation.
The one-use witness and its acknowledgement were separate owner publications. Remote-shell startup and
the second publication could not reliably complete inside the observation interval, which must remain
shorter than the 25-second native-result hold. The failures therefore invalidate this arm for model
qualification; they do not establish a Qwen Coder semantic or product failure.

## Retained evidence and cleanup

- Atomic completion publication SHA-256:
  `0c7272e1294b47bb325af5ecc19d1137089147664a9aca742e8db8556ded6956`
- Complete Home export SHA-256:
  `662cd5f85f195f6f1c4ca767eb2ac28da4cc4e907a9c1ad6519c2149e6bac2dd`
- Pre-cleanup final observation SHA-256:
  `24c6b74c3b885891a33dc63f4097b18421123d7cb779651df4d1d96a81bc4e64`
- Post-cleanup final observation SHA-256:
  `9aa26e4f204a53b3e83ec63a7e80a1e2952c96f563da47bc56047dbd0fbb0432`
- Home supervisor recorded zero residency, restored 260-watt GPU limits, no production-routing change,
  no protected data and successful owned cleanup.
- Post-cleanup inventory recorded zero loaded instances and zero owned campaign task registrations.
- The complete synthetic Control evidence directory and Home lifecycle evidence are retained under
  `artifacts/m1-readiness`; no model output is being semantically scored or pooled from this arm.

## Disposition

R12 corrects only the operator transport: actual browser-derived witness and its exactly matching
acknowledgement are cross-bound and published witness-first in one source-pinned remote process. The
24-second observation interval, 25-second native hold, case bundle, candidates, thresholds, application
behavior and independent evaluator remain unchanged. R12 must pass focused, full-suite, actual-Control
and lifecycle proof before any fresh candidate inference. The first authoritative candidate arm starts
from a new lease and fresh disposable stage; R11 rows cannot be composed into R12.
