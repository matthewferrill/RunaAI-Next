# R6 campaign lifecycle v2 model-free results

Date: 2026-08-29
Base: `7ba6bf21131a522ceba991c9ddf2daadca776494`
Criteria commit: `db6ed1b4ff30b2c786ccc3333a8fc8eab68b932e`

The prospective v2 lifecycle, campaign-runner margins, three-authority runtime
seal builder, atomic completion precondition, and v1 compatibility tests passed:

```text
node --test gate7f/function-first/readiness/lease-v2.test.mjs gate7f/function-first/acceptance/run-model-campaign-v2.test.mjs gate7f/function-first/acceptance/r6-runtime-seal.test.mjs gate7f/function-first/acceptance/runner.test.mjs gate7f/function-first/acceptance/run-model-campaign.test.mjs gate7f/function-first/acceptance/r5-runtime-seal.test.mjs gate7f/function-first/readiness/lease.test.mjs gate7f/function-first/readiness/mirror-status.test.mjs gate7f/function-first/readiness/completion-publication.test.mjs
```

Result: 72 passed, 0 failed, 0 skipped.

The tests use fake clocks, synthetic objects, temporary local files and local
Windows PowerShell parsing/publication only. No Home or Control host, model,
network, service, production route, credential or protected store was used.

No actual R6 seal was created. The seal input requires exactly three external
criteria entries: lease-publication-margin, agent05-browser-checkpoint, and
determinate-function-qualification. Each entry binds its absolute source path,
raw SHA256 and normalized SHA256. Root must supply the final integrated peer
criteria bytes before creating a common seal; missing, reordered, changed, or
partial authority input fails closed.

This result qualifies only the prospective model-free lifecycle implementation.
Fresh source/archive evidence, hardware plan, 12 controls, three model campaigns,
independent semantic review and customer testing remain required.
