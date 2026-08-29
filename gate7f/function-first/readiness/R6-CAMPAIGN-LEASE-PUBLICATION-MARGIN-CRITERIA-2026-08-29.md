# R6 campaign lease and publication-margin criteria

Date: 2026-08-29  
Status: prospective criteria frozen before implementation  
Scope: model-free lifecycle correction only

## Retained failure and boundary

Qwen R7's immutable application result recorded all 120 planned attempts and finished at
`2026-08-29T13:51:58.918Z`. Its immutable Home READY receipt expired at
`2026-08-29T13:52:04.679Z`; no completion marker was published before expiry. The Home worker correctly
reported `lease-expired`, unloaded its exact primary and Nomic instances, restored 260 W, and the owned
task was removed. The application records remain useful evidence, but the hardware arm is failed and is
not retrospectively completed or qualified by this correction.

The v1/R5 schemas, builders, source files, seals, packets, results, and evidence directories are immutable
historical authorities. R6 uses distinct v2 lifecycle schemas and a new runtime seal. No old packet may be
relabeled or accepted as v2.

## Exact prospective budget

The v2 campaign policy is exact, not a range:

- preparation: 600,000 ms;
- READY lease: 4,200,000 ms (70 minutes);
- sealed application batch: at most 3,600,000 ms, unchanged;
- latest launch: at least 3,780,000 ms remain before READY expiry, reserving the full batch plus finalization;
- stop dispatching new attempts when 240,000 ms or less remain;
- hard-stop application work when 180,000 ms or less remain;
- worker ceiling: 4,920,000 ms (82 minutes), including 120,000 ms for owned unload/power cleanup;
- independent supervisor and one-off task ceiling: 5,160,000 ms (86 minutes), leaving 240,000 ms for
  independent recovery after the worker ceiling.

The arithmetic must be machine checked:

`preparation + READY + owned cleanup = worker ceiling` and
`worker ceiling + independent recovery = supervisor ceiling = task ceiling`.

The three-minute hard-stop margin is divided prospectively into at most 60,000 ms for bounded runner
settlement/result publication and at least 120,000 ms for the external, create-only completion/abort
marker. Normal completion publishes immediately after the synced immutable result; it never waits for a
margin boundary.

## Required lifecycle behavior

1. A campaign with less than 3,780,000 ms remaining fails before any attempt `.started.json` marker,
   provider call, native call, or owned Control resource is created.
2. At the four-minute boundary, the runner starts no new attempt. Started work may settle only until the
   three-minute hard boundary.
3. At the three-minute boundary, the runner aborts bounded application work, drains/records it honestly,
   writes the terminal result create-only, and preserves all unexecuted slots in the denominator.
4. The completion publisher accepts only a running, exact v2 lease before its READY expiry. It retains the
   existing exact lease/seal/task-owner checks, closed-file publication, no overwrite, and duplicate refusal.
5. A late, duplicate, partial, foreign-schema, foreign-seal, or foreign-lease completion never revives an
   expired/failed lease and is never retried blindly.
6. Expiry, thermal/resource drift, telemetry loss, unexpected residency, output overflow, worker loss, or
   incomplete cleanup remain failures. The v2 budget does not alter 160 W, 85 C, GPU/host-memory floors,
   one-primary-plus-Nomic residency, model/request controls, or the separate existing BGE service.
7. The worker and supervisor remain the exclusive model-load/unload and power owners. The functional
   runner cannot renew a lease, load/unload a model, change power, route production, or read protected data.
8. No subset retry or continuation is introduced. A stopped campaign requires a new prospective packet and
   runtime seal; prior attempts remain untouched.

## Seal and qualification boundary

R6 derives a new common canonical runtime seal from prospective source/archive, readiness, effective
reasoning, telemetry, cases, suites, roles, models, and budgets. The R5 runtime-seal builder remains
unchanged. The v2 hardware-plan hash changes, so the previous common seal and its 12 controls cannot be
reused as R6 qualification. All three candidates must use the same new policy and common seal.

The existing `maximumBatchMs = 3,600,000` contract remains intact. The longer Home lease covers bounded
readiness transport, the complete application allowance, terminal evidence, and publication; it does not
authorize more model inference.

## Required model-free tests

- exact v2 policy/schema acceptance and v1/mixed-policy rejection;
- budget arithmetic mutation tests for every margin and ceiling;
- launch at exactly 3,780,000 ms remaining passes, one millisecond less fails before dispatch;
- no new attempt at 240,000 ms remaining;
- an already-started attempt is interrupted at 180,000 ms remaining and retained honestly;
- synced terminal result precedes completion publication;
- before-expiry completion, duplicate refusal, at-expiry refusal, late refusal, and partial-marker refusal;
- worker/supervisor/task exact 82/86-minute source and packet bindings;
- R6 seal derivation recomputes fixed suites and rejects R5 policy, partial roster, changed roles/budgets,
  retrospective attempts, or reused historical source;
- all tests use fake clocks, disposable local files, and injected model-free functions. They make no Home,
  Control, model, network, production, credential, or protected-store call.

Passing these tests proves the prospective lifecycle implementation only. A future fresh 12-control run,
three full candidate campaigns, semantic review, and customer testing remain separate acceptance evidence.
