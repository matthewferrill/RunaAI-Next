# M1-S2 R9 three-model functional results

Status: complete synthetic qualifying evaluation; no whole candidate selected; M1 remains in progress.

R9 is the complete, corrected-stack comparison for the first M1 milestone. It
does not replace the 17-family product roadmap, change production routing, use
protected data, qualify the later retained-project or tool roadmap, or close the
required customer trial.

## Frozen evidence

- Source commit: `c8932ccf2b2f0bc19f6a6e32d6f0ca30631ed4fd`
- Source archive SHA-256: `bd579a5c6fac621864044df61add9ffe3c49b349151f40654179baf110765ef8`
- Runtime seal SHA-256: `9450a5aca5812b812d0dfe645d657315b0602609d6f755ff9007d8102841cd75`
- Case bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Package-lock SHA-256: `2b443060beac09e89779ab2e4b60a22e7bf89e26880f14d0d4cdc04db9d8328e`
- Hardware/telemetry plan SHA-256: `6da49113872769997999cef3c26d5b24915796a9e23b24ff1d2f5ab29ed2470e`
- Qualification criteria SHA-256: `51f320263761aec844112ae1b13d8baa47d8555c21a4092c8579c6169304d3b2`
- Shared controls result SHA-256: `034e8f0009165ca32fac595ba13c3b1a7f9fb9605b975ce3a50e3b861ef55648`
- Qwen3.6 R27 result SHA-256: `a89241f45bd107cc326db0ece795d1cfd46a691dcbe0319100bbe4104ce9665c`
- Gemma R34 result SHA-256: `d09a7ad9ea2fa89a8498b5ae8d84802865a5db7a60ef0a7ae3a43e8eae4a8c78`
- Coder R22 result SHA-256: `8d26f66c797eb66045e14e2c1f5cca8dffac900f33282f0c6bb170c8489597cf`

The three raw results are retained under
`acceptance/evidence/campaign-20260830-r9/`. Each candidate completed the
fixed 120-attempt denominator. Independent review verified every raw record,
ledger record and provider output for each candidate with no binding or digest
error.

## Model-quality result

The fixed role threshold is at least 22 acceptable attempts out of 24, with no
critical model or product failure. Application containment does not turn a model
error into a model pass, and missing browser evidence remains inconclusive.

| Candidate | Chat | Research | Code | Agent | Review | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen3.6 27B MTP | 18/24 | 21/24 | 24/24 | 24/24 | 18/24 | 105/120 |
| Gemma 4 26B A4B | 24/24 | 22/24 | 24/24 | 21/24 | 17/24 | 108/120 |
| Qwen3 Coder 30B A3B | 24/24 | 23/24 | 24/24 | 21/24 | 14/24 | 106/120 |

No single candidate qualifies across all five roles. Role-specific evidence is
clearer:

- Chat: Gemma and Coder qualify; Qwen3.6 does not.
- Research: Gemma and Coder qualify; Qwen3.6 does not.
- Code: all three candidates qualify.
- Agent: Qwen3.6 qualifies; Gemma and Coder do not.
- Review: no candidate qualifies.

This supports deterministic role routing as the working design, but not a final
route selection. The Review role remains the model-quality blocker to an M1
customer trial that exercises all five functions.

## Whole-attempt and harness result

Independent whole-attempt grading retained product/harness evidence separately
from model quality:

| Candidate | Pass | Fail | Inconclusive |
| --- | ---: | ---: | ---: |
| Qwen3.6 27B MTP | 97 | 22 | 1 |
| Gemma 4 26B A4B | 106 | 12 | 2 |
| Qwen3 Coder 30B A3B | 102 | 14 | 4 |

The 12 model-free Control drivers passed 12/12 without invoking a large model.
They used synthetic data, changed no production route, read no protected data,
removed their owned PostgreSQL/Qdrant/runtime data and retained source/evidence.

The Coder Agent05 browser showed the required bounded-drain cancellation message
in all three repetitions, but the one-use live witness endpoint denied all three
publications. Coder Agent06 repetition 2 was not observed because its temporary
SSH forward was mistakenly started with `ClearAllForwardings=yes`; repetitions 1
and 3 passed after using an actual local forward. These are retained as
inconclusive harness/operator outcomes, not model failures or product passes.

## Material model findings

### Cross-candidate

- `research-02` remains difficult. Each candidate omitted the explicit negative
  fact that no catering amount was approved in at least one repetition.
- Review misses cluster around exact negative evidence, current-versus-obsolete
  authority, authentication versus path authorization, measurement scope and
  complete counterexamples. Correct prose that omits one requested supported fact
  does not pass the frozen case.

### Qwen3.6

- It is the only qualifying Agent candidate at 24/24 and also qualifies Code.
- It misses Chat constraints and deeper-review qualifiers often enough to fail
  those roles. Review-specific prompting/structure must improve before it can be
  selected for Review.

### Gemma

- It qualifies Chat, Research and Code, including the exact 22/24 Research floor.
- Agent02 repeated the inverse `9/5` formula error, and Review missed policy,
  authorization and evidence-scope qualifications.

### Coder

- It qualifies Chat, Research and Code and is the strongest Research candidate at
  23/24 in this campaign.
- Agent02 also repeated the inverse formula error. Review is its weakest role at
  14/24, including incomplete counterexamples and measurement-scope mistakes.

No critical model behavior or critical product failure was found.

## Host cleanup and production boundary

Each Home lease loaded only its pinned large model and the pinned Nomic embedding
model, one large model at a time. After each arm, the owned models were unloaded,
both GPUs returned to their original 260-W limits and the owned scheduled task was
removed. The final Coder observation found zero loaded instances and zero owned
campaign task registrations. Control and production routing were unchanged.

## Decision and next finite work

Preserve R9 unchanged. Do not pool attempts, lower the threshold, erase the
inconclusive witness rows or call one candidate the overall winner. The next
finite correction must:

1. fix and independently test the Agent05 witness publication defect without
   weakening the live, one-use, loopback-only observation contract;
2. add a model-neutral Review response contract that makes every requested claim,
   negative fact, qualifier, citation and complete counterexample machine-checkable
   before display, without embedding case answers in prompts;
3. retain deterministic routing outside the models and requalify the affected
   source under a fresh seal and complete fixed denominator;
4. select only roles that meet their own threshold; and
5. implement and prove deterministic two-profile admission/drain/swap because the
   current Home guard supports one primary model plus Nomic, while the present
   qualifying set requires Qwen3.6 for Agent and Gemma or Coder for Chat/Research;
   do not assume mixed residency or silent fallback; and
6. proceed to rollback-protected candidate deployment and the existing bounded
   customer trial only when all five M1 functions have a qualifying route.

M1 remains in progress. The broader M2-M5 roadmap remains required.
