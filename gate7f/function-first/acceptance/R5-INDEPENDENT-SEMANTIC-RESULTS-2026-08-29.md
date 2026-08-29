# R5 complete independent semantic results

Evaluator `codex-independent-model-role-review-20260828` was independent of the
planner, model adapter and campaign runner. It reviewed frozen source
`7ba6bf21131a522ceba991c9ddf2daadca776494`, runtime seal
`8a8bd393f5604e35135edac6bf99dd43bfbc7fbd220328822353e9ac751a80cc`
and case bundle
`8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed`.

All three candidates retained 120/120 attempts. The reviewer read and hash-bound
all 441 provider outputs across 360 sidecars, explicitly reviewed all 1,440
critical-behavior dispositions, and independently regraded the twelve controls
12/12 pass. No critical model behavior was found. Driver completion was not
treated as model quality.

| Candidate | Pass | Fail | Inconclusive | Outputs |
|---|---:|---:|---:|---:|
| Gemma 4 26B A4B | 113 | 3 | 4 | 147 |
| Qwen3-Coder 30B A3B | 93 | 12 | 15 | 147 |
| Qwen 3.6 27B MTP | 90 | 15 | 15 | 147 |

| Candidate | Chat | Research | Code | Agent | Review |
|---|---:|---:|---:|---:|---:|
| Gemma | 24/0/0 | 23/0/1 | 24/0/0 | 20/2/2 | 22/1/1 |
| Coder | 23/1/0 | 24/0/0 | 20/1/3 | 12/1/11 | 14/9/1 |
| Qwen 3.6 | 15/6/3 | 19/3/2 | 21/0/3 | 18/3/3 | 17/3/4 |

Role cells are pass/fail/inconclusive out of 24. Gemma is the provisional
quality leader for Chat, Research, Code and Review; Coder is an alternate for
Chat and Research. No candidate qualifies Agent, and the ledger is not
deployable while any matched entry remains inconclusive.

The shared Agent05 browser gap accounts for Gemma repetitions 1-2 and all Coder
and Qwen repetitions. Retained native dispatch, cancellation and cleanup do not
substitute for actual DOM evidence. Qwen also had repeated determinate quality
defects, including request-constraint omissions, preview-only stale-concurrency
plans and factual omissions in Research/Review. No stale write was accepted.

The Qwen Home lease expiry is operational evidence, not a semantic failure or a
hardware pass. All 120 application attempts were retained; completion publication
missed the lease by seconds, after which exact unload, task removal and 260 W
power restoration were verified separately.

## Integrity receipts

- complete report SHA-256:
  `d04cd6d21ae14cc33ea3f24c2e6a901466dc20e56fd5029434d72a893c9c0670`
- complete verification SHA-256:
  `0a96dc8dd57804786a7af3fed74ee18dc4932454c4a768764b2b25238fdc1c10`
- complete manifest SHA-256:
  `7617d5d38884ebda46c4e6e5e68b7f044d0b42c4fc6e12e7cb7de9b3c3de5b91`
- complete artifact-hash ledger SHA-256:
  `7f19f974c43ce612100cc21337c65a1cf60ba62338f41744fae16d3ac090dca9`
- Qwen dual-grade ledger SHA-256:
  `882fb2dba086b9dc562537d20f261155c44e43546de1bea71809fac88fe4e251`

R5 remains immutable and nonqualifying. The R6 criteria correct the shared
evidence and lifecycle defects prospectively and require a new complete matched
campaign rather than selective reuse or regrading.
