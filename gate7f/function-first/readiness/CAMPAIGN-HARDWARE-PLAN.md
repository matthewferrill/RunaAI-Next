# Prospective M1 functional-campaign hardware envelope

Prepared under the existing M1 authorization; no campaign model has been loaded by preparing this
contract. Completed r2/r3/r4 diagnostics and three10min smoke packages/records remain immutable.

The common `campaign-hardware-plan.json` freezes exact operator source bytes, six runtime hashes,
all three primary artifact/template/load profiles, existing Nomic artifact/context and resource policy.
Its exact byte SHA256 binds `runtimeSeal.hardwareTelemetryPlanSha256` for the whole360-row campaign.
Each candidate's separate create-only lease package binds this common plan plus its own lease ID.
The returned primary/Nomic instance IDs and per-lease seal are receipts, not a replacement for the
single common campaign runtime seal. A model key is not substituted for an observed load receipt.

Hardware remains one primary plus Nomic with existing BGE unchanged:160W on both exact QuadroRTX6000
UUIDs, start<=45C, stop at85C,8GiB host free and1GiB free on either GPU, nominal5s telemetry with actual
gaps retained and a30s gap fail-closed. No global model default, service, clock, fan, network binding,
production route, protected source or Control release changes are authorized by this hardware file.

The new version permits10min preparation and at most60min after readiness. The worker is stopped by
70min total; the independent one-off supervisor/task has a74min total ceiling including cleanup.
No renewal, automatic retry or indefinite heartbeat extension is allowed. Normal completion uses a
strict campaign-schema/lease/seal-bound marker from the root operator. Expiry/thermal/resource/drift
failure triggers owned cleanup. Uncertain load ownership is never converted into permission to unload
an unknown instance. If cleanup itself fails, retain the failure; do not claim restoration from expiry.

Root owns all functional-driver/browser/model/embedding/reranker calls. This operator permits only
model inventory/load/unload endpoints. Root must finish the complete driver,12 model-free controls,
browser hooks and exact campaign source/runtime seal before dispatch. Human testing remains a
separate product checkpoint; this hardware setup never declares M1 or a role qualified.

Build order (all create-only):

1. Commit reviewed operator sources and green tests.
2. Run `build-campaign-hardware.mjs` with a new output path; give its exact byte hash to the campaign
   runtime-seal owner. The file contains all three candidate IDs and operational aliases.
3. Run `build-smoke-lease.mjs CANDIDATE 20260828-campaign-CANDIDATE-rN COMMON-PLAN-PATH` for each arm.
   The builder rejects source, runtime or profile drift relative to the common plan.
4. Only when root's campaign is ready, upload and dispatch the sealed candidate lease, one at a time.
5. After root completion, export/verify raw receipts and source bytes, verify zero residency and
   original260W, and remove only the completed one-off task registration.

The completed short smokes prove this lifecycle at short duration, not sustained60min thermal fitness.
Failures during the longer campaign remain failures in the fixed denominator; do not raise cutoffs
or replace a failed result with a retry. The new campaign profile cannot be selected by changing only
an old smoke ID, schema or duration: profile validation requires the exact frozen policy.
