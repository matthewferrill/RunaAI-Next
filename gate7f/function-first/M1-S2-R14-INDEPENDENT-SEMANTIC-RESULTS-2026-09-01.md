# M1-S2 R14 independent semantic results

Status: complete and immutable. R14 recorded the full 360-attempt denominator, including the
equivalence-audited Qwen 68 + 1 + 51 execution history, passed all 12 model-free controls, completed
Home/Control cleanup, and received a candidate-blind semantic review. Chat, Research, Code and Agent
have qualifying routes. Review does not, so product qualification and the customer trial remain
unavailable. No production route changed and no protected data was read.

## Exact campaign binding

- Source commit: `cf2065daa7c4e47cc24a63582bea80e36065a4ca`
- Source archive SHA-256: `96a92ea655d9215156f3a1614a412b5ff60b8e8f0b9712ca6fdf47c15922e6c5`
- Fresh runtime seal SHA-256: `4855a990f7a36278eae546d8bfa18f04b507356300784109334a82fcd16bb42a`
- Case bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Shared controls: 12/12 passed; SHA-256
  `e1af06f321437a34a30233a26d94c97b8fe91e8dcbd69c31fbdb9ca0c1a651e2`
- Gemma result SHA-256: `9252e6e18bd29a1ba871921acfd10035774f3923af2951eb66188f1b3b98fe87`
- Coder result SHA-256: `ccd5a017c786b8b07507053eddab45dc09e4c25977b9bcfeb5f3f44e6e5e65e6`
- Qwen final execution-window result SHA-256:
  `f580c708d91fb1a73c4546d022a473ef732468452c00aa4451ea9f362768744f`
- Qwen canonical three-window composition result SHA-256:
  `7449e8705bbe45807e5fe0433efca7985cb97d92da1e05a788f0b138cc951489`
- Qwen composition audit SHA-256:
  `1761e746fbabbd87a46611c03b18b8b85ede6fcf44e6bd3be59cfdb8e55e5b7e`

All candidates have 120/120 unique planned attempt identities. Qwen's record truthfully discloses
three equivalent execution windows rather than claiming one uninterrupted arm. Required browser
checkpoints were observed through the actual application/browser path. Each arm ended with zero owned
model residency, restored GPU limits, retired owned tasks, unchanged production routing and no cleanup
error.

## Independent review and publication-tool RCA

The independent reviewer received 360 candidate-blind worksheet rows and did not know candidate
identity while deciding them. The accepted decision bundle covers 612 retained provider outputs, all
963 semantic checks and all 1,782 expected facts. It produced 360 determinate attempt grades, zero
inconclusive attempts, 56 failed semantic checks across 42 failed attempts, and no critical model or
product failure. The reviewer was neither the planner nor model-adapter author.

- Input manifest SHA-256:
  `1ae0fef79d6d64c0dfc3f4f3dd507b2e82338b1202a42e3d51509c070ce630d0`
- Candidate-blind worksheet SHA-256:
  `e31cac23fec2023a2ae319f2ba3aa0e0a20f3ac0f0f1297f399aad6a9b296afa`
- Review binding SHA-256:
  `9d85efbb77fe49fb8994b6d0fa44014da26095bd1e617e489ba3d98ebf7704c8`
- Accepted review decisions SHA-256:
  `ad8a3f81d9ccca0e3c6dbf383695d5d9895b11f7a7f5712a1b1ab8d8da09b600`
- Campaign grade SHA-256:
  `97384b19efc004272ec61847149dac8754f518f5e7e5ba10b1d6c5581fcb53f8`
- Role scorecards SHA-256:
  `128ae39d36737ce6498dec8ee1980f80b0689892816be7c7099d94eff30d4669`

Two review-publication packages were rejected without changing or rerunning a model result. The first
allowed complete-candidate label swaps and Qwen cross-window row movement. The second had normalized
review excerpts that were not literal substrings of their bound values and used misleading positive
wording for absent prohibited behavior. After those corrections, the hardened finalizer exposed one
more publication-contract defect: it inferred that every zero-fact semantic check must pass. Citation
support and valid-counterexample checks are direct evidence-backed judgments and intentionally have no
per-fact rows, so this made 25 legitimate failures impossible to encode. The finalizer now applies
fact/verdict consistency only when a check defines expected facts, matching the canonical validator.
The existing focused regression `zero-fact semantic assertions still accept explicit determinate
failure` passes. The rejected v2 decisions remain preserved; only the create-only v3 bundle above is an
accepted adjudication input. None of these publication defects consumed inference or changed a score.

## Whole-application role scorecards

Qualification requires at least 22/24 acceptable attempts, no more than two failures, no blocked or
indeterminate attempt, zero critical model/product failure and green shared controls.

| Candidate | Chat | Research | Code | Agent | Review |
|---|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | 24/24 qualified | 23/24 qualified | 24/24 qualified | 24/24 qualified | 7/24 |
| Qwen3 Coder 30B-A3B | 23/24 qualified | 22/24 qualified | 24/24 qualified | 21/24 | 20/24 |
| Qwen3.6 27B MTP | 18/24 | 22/24 qualified | 24/24 qualified | 21/24 | 21/24 |

Qualifying routes exist for Chat, Research, Code and Agent. The frozen scorecard intentionally does
not select among tied or multiple eligible candidates. Review has no eligible route.

## Genuine model defects and disposition

The following are model-output failures under the now-green method. They are not timing, browser,
operator-publication, lifecycle or harness failures:

- **Gemma Review, 7/24:** 17 attempts delivered the application's evidence fallback because the
  evidence-checker repeatedly violated its conditional JSON contract, for example returning a
  non-null `correctedAnswer` while also returning `accepted:true`. The provider call completed, but the
  model's structured result could not be accepted. This is a repeatable structured-output compliance
  defect.
- **Coder Review, 20/24:** two `review-01` repetitions stated that `shipping(3, 5)` returns `3` even
  though the supplied implementation returns its second argument, `5`. Two `review-05` repetitions
  repeated the claimed two-second maximum despite supplied eight-second observations. These are
  evidence-reasoning contradictions.
- **Qwen3.6 Review, 21/24:** all three `review-05` repetitions omitted that the “every user” claim
  exceeds a one-machine sample. This is the nearest Review route but remains one acceptable attempt
  below threshold.
- **Coder Agent, 21/24:** all three `agent-02` read-only summaries contradicted the required conversion
  correction, which is to multiply by `5/9` rather than `9/5`.
- **Qwen3.6 Agent, 21/24:** all three `agent-06` runs interpreted numeric subtraction as array set
  difference, changed the function to use `filter/includes`, failed the frozen numeric suite, and did
  not produce a usable repair plan before the frozen planning deadline. The effect, receipt and test
  path behaved correctly; the proposed code and repair response did not.

Other measured model-output defects did not disqualify their role because the candidate still met the
22/24 threshold: Coder had one Chat bullet-count miss; Qwen3.6 had three Chat sentence-count misses and
three omissions of the requested word “Fennel”; Coder and Qwen3.6 each omitted the explicit “no approved
catering amount” fact in two of three `research-02` repetitions. Gemma's one Research failure is another
instance of its evidence-checker schema noncompliance and resulting fallback. These rows remain failures;
role qualification does not erase them.

The application correctly prevents these failures from becoming production routing. A subsequent
campaign must prospectively improve the generic Review reasoning/structured-output contract and the
two Agent defects, reseal the complete source/runtime, rerun the unchanged denominator, and obtain a
fresh candidate-blind review. R14 itself is final and must not be regraded or selectively replayed.

Final closure verification passed: harness 160/160, Gate 7F 28/28, roadmap 15/15, and the complete
195-file tracked repository suite 1,980/1,980 with 1,902 passed, 78 intentionally skipped, and 0 failed.
