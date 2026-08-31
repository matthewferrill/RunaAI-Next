# M1-S2 R12 independent semantic results

Status: complete review; all-five-function qualification failed; customer trial not ready.

The independent reviewer graded all 360 candidate-blind R12 rows against the frozen semantic rubric,
recording 963 explicit semantic checks. Sixty-two checks failed. The row decisions were frozen at
SHA-256 `33bfaf4b1d40af53535e6e44715cf8702276478f6e92dee70ed1e4a66dd91906`
before the blind identities were resolved. Recomposition from the bound raw observations produced the
campaign grade at SHA-256
`a78a4a3159b6942718db8bd20dd6d350505909097deda9bce962fe9f9b1302a9` and the committed role scorecards
at SHA-256 `4fedad219eb92a0f4b7ce49894de8cb3a9547e398d2182c4c937fe79257f4acc`.

## Frozen scorecards

Every cell is `acceptable/24`; qualification requires at least 22 acceptable, zero blocked or
indeterminate rows, and zero critical model or product failures.

| Candidate | Chat | Research | Code | Agent | Review |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemma 4 26B A4B | 24 qualified | 22 qualified | 24 qualified | 18, not qualified (3 blocked) | 8, not qualified |
| Qwen3 Coder 30B-A3B | 24 qualified | 20, not qualified (1 blocked) | 24 qualified | 18, not qualified (3 blocked) | 17, not qualified |
| Qwen3.6 27B MTP | 18, not qualified | 21, not qualified | 24 qualified | 18, not qualified (3 blocked) | 19, not qualified |

All 12 model-free controls passed. No critical model failure or critical product failure was identified.
The final grades are determinate for 350 rows. Ten captured rows remain inconclusive: three Gemma Agent
rows, three Coder Agent rows, one Coder Research row, and three Qwen3.6 Agent rows. These are retained as
non-passing evidence rather than filled from expected state.

## Exact disposition

- Chat has qualifying Gemma and Coder candidates.
- Research has one qualifying candidate, Gemma at the exact 22/24 threshold.
- Code qualifies for all three candidates.
- Agent has no qualifying candidate. Gemma and Coder each have three `agent-02-read-only` failures plus
  three indeterminate Agent journey rows. Qwen3.6 has three `agent-06-crash-reconcile` failures plus three
  indeterminate Agent journey rows.
- Review has no qualifying candidate. Gemma is 8/24 after failures across seven review cases, Coder is
  17/24 with cross-file/current-policy/path and unsupported-claim failures, and Qwen3.6 is 19/24 with
  path-authorization and unsupported-claim failures.

Accordingly, the required all-five-function route does not exist. Product qualification and customer
trial readiness remain false. No candidate route was selected or promoted, and production routing was
unchanged. The next work must be a prospective correction and fresh acceptance for the exact Agent and
Review deficits; prior passing Chat, Research and Code evidence remains immutable.

The publication manifest and compact scorecards are in
`acceptance/evidence/20260831-r12-independent-semantic-review/`.
