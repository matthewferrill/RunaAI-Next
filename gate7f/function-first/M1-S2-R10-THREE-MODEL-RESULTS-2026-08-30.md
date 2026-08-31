# M1-S2 R10 three-model corrective results

Status: complete synthetic corrective evaluation; no qualifying all-five-function route; M1 remains in progress.

R10 is immutable evidence for the corrected Review-completeness and Agent05 witness source. It does not
change production routing, read protected data, select a whole model, close the customer trial, complete
M1, or replace the remaining 17-family roadmap.

## Frozen identity and complete denominator

- Source commit: `ee1a15ae5d0c6ba18e9eaa24e623645be74a238b`
- Source archive SHA-256: `a1ff6e01a378d6b93a0329cc6d733a31469754caf2f6946dea25b66469bd40a0`
- Runtime seal SHA-256: `ae29fe27c9ff6b937e612623e1d8f1b21d36f65d7b8edbd682bef683daf39b5d`
- Case-bundle SHA-256: `87f08a861d1b109fa5d3fb64f9dc10aacba023eee80a3ab4762b07b2d987524d`
- Shared-controls SHA-256: `d87395c620d8758481828f84d14ef979013d09b2d2765bce5bd95815814c7b22`
- Qwen3.6 result SHA-256: `eb2b783cbd7d640108ed1947008ff1c46152da2e68fe7cb70164a0871be6b54d`
- Gemma result SHA-256: `5270e687cf86237abb41321bf135f6c10c019fc5942f49b0dca7c1fd5151709e`
- Coder result SHA-256: `09b1e21f5e551c831d929def33c9de6c423b4513ff94a35476d614027f324746`

All three candidates completed their fixed 120-attempt denominator: 360/360 model attempts plus 12/12
byte-identical shared controls. Candidate-blind independent review bound 360/360 raw and ledger records,
covered 520/520 provider outputs and explicitly adjudicated every semantic check and expected fact. Its
13-case mutation/coverage suite passed. No critical model behavior or critical product failure was found.

## Whole-attempt qualification result

The unchanged role threshold is at least 22 acceptable attempts out of 24 with no critical failure.
These are whole application-attempt results, so a readable model answer that the product does not deliver
is not a pass.

| Candidate | Chat | Research | Code | Agent | Review | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 4 26B A4B | 24/24 | 19/24 | 24/24 | 20/24, 1 inconclusive | 0/24 | 87 pass, 32 fail, 1 inconclusive |
| Qwen3 Coder 30B A3B | 23/24 | 21/24 | 24/24 | 21/24 | 0/24 | 89 pass, 31 fail |
| Qwen3.6 27B MTP | 18/24 | 21/24 | 21/24 | 20/24, 1 inconclusive | 19/24 | 99 pass, 20 fail, 1 inconclusive |

Gemma and Coder qualify only for Chat and Code in this source. No candidate qualifies for Research,
Agent, or Review. No all-five-function route or customer trial is ready from R10.

## What failed and where

Model-semantic findings remain separate from application/protocol findings:

- Every Research02 response omitted the required explicit fact that no catering amount was approved.
  Other Research misses left Gemma at 19, Coder at 21 and Qwen3.6 at 21.
- Agent02 retained the required `5/9` correction in three outputs, omitted it in three and contradicted
  it with `9/5` in three.
- Qwen3.6 Agent06 produced the same wrong set-filtering implementation instead of numeric subtraction in
  all repetitions. The later repair call then reached the planning deadline.
- Qwen3.6 Chat and Review also contain substantive constraint and scope omissions. Those are not harness
  errors.
- All 24 Gemma and all 24 Coder Review primary answers and checker outputs were retained and readable, but
  the strict adapter rejected the checker shape and delivered the generic incomplete-response fallback.
  In 47 attempts the checker accepted the answer while echoing its exact citation array, although the
  adapter required `citations:null`; the remaining Coder attempt requested a correction that still did
  not pass. These are whole-attempt product/protocol failures, not 48 absent primary responses.
- Qwen3.6 Code05 proposed the correct repair three times, but the application exhausted its active
  orchestration budget after apply and before the required rerun. The actual rerun was not invented.
- Gemma Agent05 repetition 3 and Qwen3.6 Agent05 repetition 1 lacked a qualifying completed browser
  checkpoint. They remain inconclusive operator/infrastructure rows rather than passes or model failures.

## Retention and cleanup

The completed-campaign v2 retention verifier binds each result to its source/runtime/lease seals, sealed
18-file Home export, atomic completion publication, before/after final observations, exact owned task and
stable listener inventory. It independently passed all three retained leases:

| Candidate | Home lease | Lease seal SHA-256 | Export SHA-256 |
| --- | --- | --- | --- |
| Qwen3.6 | `20260829-campaign-qwen36-r28` | `89177de251b9e0093029337caec6237e324bec7559e1039f90f7c4964fb36710` | `e81f6081e73abd967a99a48a0013ff41bcdd724b3da65bcc83626602fd46acb4` |
| Gemma | `20260829-campaign-gemma-r35` | `0235757da8647f0fc77fe15f95fd2b86bc4a226b554e5156a3ed29033d852df7` | `acbf8e9e9be87e96c79f44943cf2ef627b15d7346edf1fd04956ba956adfde29` |
| Coder | `20260829-campaign-coder-r23` | `24f14d33dfb96d0da5cdfa50efe83129e8f84eecf881e0dec9009956782f743d` | `326672588a90b5b0b4d57342c538f81aa28f75d7bb3c745e3f2bb2b3b193e207` |

Every arm ended with zero owned model residency, both GPUs restored to 260 W, the owned scheduled task
retired and production listeners unchanged. Production routing remained unchanged and protected data was
not read.

The independent semantic manifest is SHA-256
`3bd7a4122557cad9eac807021c107a428f1dd96c7c95e1322315a3b23430890e`; its report is SHA-256
`eab9746e51d5c37fb9fa59db58ea774a31f8c1d8698129132900ddc7e6e74de2`. The explicit decision bundle,
campaign grade and validator output are respectively
`bc35a1954287490a7260ff251c6bc471f6e7b605c8df70983e03c7229db74a8f`,
`76d736b579377b30fffd1c7ee10c9695a0f44f518bbdeda096026bd9d3a06a68` and
`a39aafa070f769b0056b6b53da30ad8753fe766b2b1d5a7f3ea008519b5cccda`.

## Decision and next finite correction

Preserve R9 and R10 unchanged. Do not lower the threshold, select from semantic-only rows, treat
containment as success or retroactively accept the Review fallback. The next correction must remain
model-neutral and prospective:

1. accept only a checker citation echo that is byte-for-byte the candidate citation set, while retaining
   the selected-source and correction recheck boundaries;
2. apply the same clause/negative-evidence completeness check to supplied-source Research;
3. make bounded repair a resumable application state with enough total active budget for a second model
   plan, without extending one HTTP request, repeating an uncertain effect or weakening grant checks;
4. retain the one-use Agent05 witness and improve operator preparation rather than reclassifying the two
   contaminated rows; and
5. freeze a fresh source/archive/runtime before any new inference and use the complete fixed denominator
   unless an independently accepted per-role evidence-composition contract exists.

M1 and its actual customer trial remain open. M2-M5 remain required.
