# Qwen R7 campaign hardware outcome

This directory retains the Home-side outcome of the sealed Qwen 3.6 27B R7
campaign. It is a failed hardware-lease outcome, not a completion receipt and
not product-qualification evidence.

The Control campaign produced all 120 planned records (114 completed, 6 failed,
no unexecuted slots and no stop code) and finalized its immutable `result.json`
at `2026-08-29T13:51:58.918Z`. The exact retained result bytes have SHA-256
`697c6cb1a8c2a1e529860fe9d8cab41106b63ded26fbc6aca7fd0f6cf79e3b49`.
The sealed Home READY authority expired at `2026-08-29T13:52:04.679Z`, only
5.761 seconds later. No create-only completion marker was published before
expiry, so Home correctly returned `lease-expired` rather than accepting a late
success.

Cleanup nevertheless succeeded: the two owned model instances were unloaded,
the owned task registration was removed, both GPU power limits were restored to
260 W, and the independent final observation found zero loaded model instances.
The lifecycle result therefore remains failed while cleanup and power recovery
remain verified.

The root cause is a zero-publication-margin campaign policy: application work
could consume the entire 60-minute READY lease. The correction is prospective.
R5 evidence is not amended or relabeled; the successor policy must preserve the
60-minute application allowance while reserving explicit stop and publication
time under a new runtime seal.
