# M1-S2 R6J three-model functional results

Status: complete qualifying evaluation, no candidate selected, M1 remains in progress.

This is the final result for the frozen R6J comparison. It does not replace the
17-family product roadmap, qualify a production successor, authorize protected
data use, or close the required customer trial.

## Frozen evidence

- Source commit: `334551198b1095d33e826f197b99750b3f64c2a2`
- Source archive SHA-256: `7a9dd8a659cc2cc69ae972231b844582b3016baa1383b05975cf50478f13e36c`
- Runtime seal SHA-256: `932427f78a425a76e30c10056fbea8acd9ca9109ba29f53423be23299e597159`
- Case bundle SHA-256: `8713db8fb54bebe069f73edfef7cd179c13a3caba1d4d15bd8567f39aaa418ed`
- Combined criteria SHA-256: `d2a3dc205b965ae6d627e93f49c988eac6c6bec096e5b9357a768231f05b46c5`
- Shared controls SHA-256: `9865d558ca1acc8921b2bb403305c1a7867472fc8c056e94bf9c688a416f6924`
- Gemma R13 result SHA-256: `bfcde954b0550a0bd9d12f51bf9299cffc2f4d87758a6f2731e65e3c727b480a`
- Coder R13 result SHA-256: `7a50185a6610554302d1d72347f591b6a656622f391d503e52db6d310e38aafb`
- Qwen3.6 R12 result SHA-256: `733551f791f42717036785aa1a729fa8aede165620c685b40dceca80e74448b4`

The create-only independent review is retained outside the repository at
`independent-semantic-3345511-r6j-coder-r13-final`. Its report SHA-256 is
`00f485c958fbe3ca92a7e96b7b37b5d9cd7e76758fd37adb02f6c36049d59e43`
and its bounded 24-file manifest SHA-256 is
`832322f5a255fa625144ccfe41dc5d416f368c60aa37c84dc1e3f369e3317b50`.
The independent explicit-decision, grade and combined-summary hashes are,
respectively, `2ab241784786028f9989cbd38c23e8422a092ff487419da99b753821a6dd9a13`,
`12f49cf6d625ac2bdc1258c57434ab4160bba3d767194c98934cdec8b688fe2f`, and
`d43c1e6d31a2c33cec762a4280ef5a31ba12583ca4a1127f59d3d6424134b318`.

## Result

| Candidate | Chat | Research | Code | Agent | Review |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemma 4 26B A4B | 24/24 | 21/24 | 24/24 | 21/24 | 21/24 |
| Qwen3 Coder 30B A3B | 23/24 | 21/24 | 21/24 | 16/24 | 13/24 |
| Qwen3.6 27B MTP | 18/24 | 21/24 | 21/24 | 21/24 | 19/24 |

The fixed role threshold was 22/24 with zero blocked attempts. No candidate
qualifies as a whole, so none is selected or promoted. Gemma is the strongest
diagnostic candidate at 111/120 and is the only candidate meeting the threshold
for both Chat and Code. That is evidence for the corrective run, not a production
selection.

Independent coverage is complete: 360/360 attempts, 963/963 semantic checks,
1,791/1,791 facts, 441/441 provider outputs, 12/12 shared controls, 45/45 frozen
evaluator tests and 24/24 manifest files. Gemma and Qwen3.6 reused evidence only
after 240/240 raw and record pairs matched the previously validated bundle. Every
Coder R13 output was freshly reviewed.

## Findings that drive the next correction

- All candidates missed `research-02-combine-citations` by omitting the readable
  negative fact that no catering amount was approved. The correct arithmetic and
  citations did not make the unsupported third amount known.
- All candidates missed the read-only action scenario's explicit statement that
  the supplied file was not changed or tested. Coder also misdiagnosed its formula.
- Coder and Qwen3.6 emitted preview-only Code07 plans. Because preview is not an
  apply proposal, stale-approval denial could not be exercised. Coder repeated the
  same protocol omission in Agent04. These are plan/function failures; the
  application correctly performed no mutation.
- Deeper-review misses were candidate-specific but concentrated on exact support:
  citations, current-policy qualifiers, authentication versus path authorization,
  after-resolution containment, valid counterexamples and direct contradictions of
  supplied measurements.
- Coder Agent05 repetitions 1 and 2 were blocked by an unobserved external browser
  checkpoint. Their cancellation, durable receipt, native transport and zero
  post-cancellation-effect evidence passed. This is operator/browser contamination,
  not a model or product safety failure. Repetition 3 passed.
- No frozen critical model behavior or critical product failure was found.

## Disposition and next finite work

Preserve this campaign unchanged. Do not pool candidates, drop failed rows, replace
individual repetitions or lower the threshold. The next prospective source/rubric
must be freshly versioned and sealed. It must:

1. make required negative/unknown evidence and read-only non-action statements
   explicit in the model-neutral research, review and planner contracts;
2. detect a preview-only plan when a permitted requested edit requires an
   approval-gated apply, then fail or perform at most one bounded, recorded protocol
   correction request without inventing a model step or bypassing approval;
3. bind browser observation to the running harness so operator delivery timing is
   not graded as model behavior;
4. retain original and repaired outputs separately and rerun a complete, newly
   sealed campaign rather than replacing rows in R6J; and
5. require the same 12 controls, exact cleanup and production-unchanged proof before
   any model-role selection or customer trial.

Home ended with all owned candidate models unloaded, campaign tasks absent and both
GPU power limits restored to 260 W. Control and production routing were unchanged;
no protected data was used.
