# M1-S2 R13 independent semantic results

Status: complete and immutable. R13 recorded all 360 planned model attempts, passed all 12 model-free
controls, completed Home/Control cleanup, and received a fresh candidate-blind semantic review. Chat,
Research, Code and Agent have qualifying routes. Review does not, so product qualification and the
customer trial remain unavailable. No production route changed and no protected data was read.

## Exact campaign binding

- Source commit: `d0b8f23db1bcc149764e19936559a8a9df468205`
- Source archive SHA-256: `7d2e055ec4c42a0e7107354c2ab10074e3f331b72bafc971029f2e6ceb9bd153`
- Runtime seal SHA-256: `abf15d75fd33df9f4f7b9966e450075d93b6cd18dd275c89afabece76f3bca87`
- Case bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Shared controls: 12/12 passed; SHA-256
  `566be9098046a65f48b206feb84005c5481e8d78fec50173b25f44bbf5183261`
- Gemma result SHA-256: `9ff72556d987e564ccf773f97743d30ed3dec957e1528ca9ded7094e7467e3fd`
- Coder result SHA-256: `72acf8b01c9c56a9fcaa62dfb9e0400e75d0122afd32532819141fd8f799bebb`
- Qwen3.6 result SHA-256: `16dcad14af943bf6a3d4580696c6da3bc7b5b244b59084a59ddd51b3d50f1940`

All candidates recorded 120/120 attempts under separate exclusive Home leases. Required browser
checkpoints were observed through the actual application/browser path. Each arm ended with zero owned
model residency, restored GPU limits, retired owned tasks, unchanged production routing and no cleanup
error.

## Independent review

The independent reviewer received 360 candidate-blind worksheet rows and did not know candidate
identity while deciding them. The frozen decision bundle covers 611 retained provider outputs and all
963 semantic checks. It produced 360 determinate attempt grades, zero inconclusive attempts and 60
failed semantic checks. The reviewer was neither the planner nor model-adapter author.

- Frozen review decisions SHA-256:
  `668027857d3fb066570e7552411fa8f2b75045fff2e009037e8c78826705550b`
- Role scorecards SHA-256:
  `4c6295af3987c5e1fc5ae9569d0da26c8a44e7baa64936e2e3a7ce0502cc6cdd`
- Final review manifest SHA-256:
  `938cb653460029c3f419e53bb0e78774c7891a24e7e78d77b6bf02bfc3e295f3`

The finalizer initially transported all reviewer source quotations into ordinary semantic checks, and
transported unselected sources into citation-support checks. The runtime grader correctly rejected
those out-of-contract quotation kinds as unbound. The bridge was corrected to retain surfaced-answer
quotations for ordinary semantic checks and only selected source quotations for citation support. The
reviewer's frozen verdicts, facts, rationales and candidate-blind order did not change.

## Whole-application role scorecards

Qualification requires at least 22/24 acceptable attempts, no more than two failures, no blocked or
indeterminate attempt, zero critical model/product failure and green shared controls.

| Candidate | Chat | Research | Code | Agent | Review |
|---|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | 24/24 qualified | 23/24 qualified | 24/24 qualified | 24/24 qualified | 7/24 |
| Qwen3 Coder 30B-A3B | 23/24 qualified | 24/24 qualified | 24/24 qualified | 21/24 | 15/24 |
| Qwen3.6 27B MTP | 18/24 | 24/24 qualified | 24/24 qualified | 21/24 | 21/24 |

No critical model or product failure was found. Deterministic role recommendations from this result are
Gemma for Chat, Coder for Research, Gemma for Code and Gemma for Agent. Review has no eligible route.

## Remaining Review defect and disposition

Qwen3.6 is the nearest Review route at 21/24. All three failures are the same bounded omission in
`review-04-path-issue`: the answer identifies traversal, explains escape from the authorized directory,
and recommends post-resolution containment, but does not explicitly state that authenticating the
caller does not itself authorize the requested path. Its own evidence checker accepts the incomplete
answer in all three repetitions.

This is not timing, browser, lifecycle, protected-data or execution failure. It is a repeatable generic
Review completeness defect. R13 remains failed for Review; the missing statement is not supplied by the
evaluator and no favorable row is substituted. The next campaign must prospectively correct generic
security-control coverage, reseal the complete source/runtime, rerun the unchanged denominator and use
a fresh candidate-blind review. The customer trial stays hidden until all five functions qualify.
