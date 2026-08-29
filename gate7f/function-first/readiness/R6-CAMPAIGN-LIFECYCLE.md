# Prospective R6 campaign lifecycle v2

R6 corrects the retained Qwen R7 outcome in which all 120 application attempts
finished but the 60-minute READY lease expired before completion publication.
That run and every v1/R5 artifact remain immutable. This is a prospective,
model-free lifecycle correction, not a retrospective qualification or retry.

The application batch limit remains exactly 60 minutes. Lifecycle v2 provides a
70-minute READY window and accepts launch only while at least 63 minutes remain.
It stops new attempts when four minutes remain and hard-stops application work
when three minutes remain. The reserved three minutes are one minute for runner
settlement plus two minutes for atomic completion publication. These reserves do
not add attempts, widen any role budget, alter the 360-row denominator, or make a
late result successful.

Preparation is bounded to 10 minutes. Preparation + READY + owned cleanup is
82 minutes. The independent recovery margin is four minutes, making both the
supervisor and scheduled-task ceiling exactly 86 minutes. No renewal, same-run
retry, lease extension, or automatic replay is supported.

R6 uses side-by-side v2 schemas for the hardware plan, lease configuration,
READY, completion, worker result, supervisor result and candidate batch plan and
result. V1 readers and historical files are unchanged. The mirror remains a
read-only observation protocol and accepts the new date namespace without
relabeling v1 observations as v2 lifecycle receipts.

Before any inference, create a fresh R6 runtime seal with
`acceptance/r6-runtime-seal.mjs`. It treats the R4b seal only as an immutable
roster/role/runtime template, recomputes fixed suites from `cases.mjs`, binds the
exact raw and normalized bytes of all three prospective common criteria (lease
margin, Agent05 browser checkpoint, and determinate function qualification),
binds the new v2 hardware-plan evidence, and refuses observed attempts, imported rows,
selective replacement, tuning, partial rosters, inherited seals, or old v1
telemetry. Publication is canonical and create-only.

Operator files are `build-campaign-hardware-v2.mjs`,
`build-campaign-lease-v2.mjs`, `home-campaign-lease-v2.mjs`,
`Run-HomeCampaignLeaseV2.ps1`, `Invoke-HomeCampaignLeaseV2.ps1`,
`Write-HomeCampaignCompletionV2.ps1`, and `complete-campaign-v2.mjs`.
Preparing or testing them locally does not authorize a Home call, load a model,
change production routing, or claim qualification.

The v2 completion dispatcher additionally requires the absolute synced batch
result path and its expected SHA256. A `completed` marker is refused unless that
exact file is the complete 120-row v2 result; an `abort` marker still requires a
terminal v2 result/error. Validation happens before the single external call.

Focused verification is model-free:

```text
node --test gate7f/function-first/readiness/lease-v2.test.mjs gate7f/function-first/acceptance/run-model-campaign-v2.test.mjs gate7f/function-first/acceptance/r6-runtime-seal.test.mjs
```
