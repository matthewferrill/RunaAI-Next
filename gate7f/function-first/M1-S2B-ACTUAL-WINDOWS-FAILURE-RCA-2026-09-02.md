# M1-S2B actual Windows proof failure RCA — 2026-09-02

Status: actual acceptance stopped. This is an Omen helper/host compatibility failure, not a model failure.
The downstream Git/MXC/network proof did not run. No browser, model, production route or protected user
data was involved.

## Retained failed attempt

- Sealed source commit: `11fa6c1156e20858c986d4516200de04303a4951`.
- Command: `node gate7f/function-first/omen-local/actual-windows-proof.mjs` on the actual Omen Windows host.
- Result: exit 1 with schema `runaai-m1-omen-file-error/v1`, error code
  `native-operation-failed`, stage `confirm-and-protect-root`, and `privateValuesIncluded:false`.
- The runner's bounded `finally` cleanup completed; otherwise cleanup would have replaced the retained
  error. The disposable fixture was removed. No successor actual proof was started.

## Root cause

The release pins Windows PowerShell `5.1.26100.9168`. Read-only reflection on that exact executable showed
that its loaded `System.IO.File` exposes only `Void Move(System.String, System.String)`. The helper's DPAPI
protect action called `System.IO.File.Move(temporary, destination, true)`, a three-argument overwrite
overload available in newer .NET runtimes but absent from the .NET Framework surface used by Windows
PowerShell 5.1. DPAPI encryption and the temporary write could complete, but method binding failed before
the sealed state could be atomically published. The helper deliberately reduced the unrecognized exception
to `native-operation-failed`.

This escaped the pre-execution gate because the PowerShell parser validates syntax, not runtime overload
availability, and the deterministic root-store tests use a fake native boundary. Those checks were useful
but were incorrectly treated as sufficient coverage for this host-specific publish primitive.

## Corrective design

1. Keep the already pinned Windows PowerShell 5.1 host; do not switch runtimes to make the test pass.
2. Add a typed C# P/Invoke wrapper for Windows `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` and
   `MOVEFILE_WRITE_THROUGH`, and use it for same-volume atomic state publication.
3. Give each temporary ciphertext a random name and delete any remainder in `finally`.
4. Emit the typed `native-state-commit-failed` code if Windows refuses publication.
5. Add a deterministic source regression prohibiting the unsupported three-argument `File.Move` call;
   keep it classified as preflight, not actual acceptance.
6. Recompute the native-helper release pin, rerun only finite syntax/focused/pin/roadmap checks, obtain
   fresh exact-byte independent P0/P1 review, and source-commit the correction.
7. Run the affected actual Windows proof once. Any failure stops for a new RCA. Only a pass permits the
   separate actual Git/MXC/network proof.

No blind retry, model call or broader suite is authorized by this correction.

## Correction checkpoint

The prospective correction uses the native atomic publish primitive, randomized temporary ciphertext and
bounded cleanup described above. Six JavaScript syntax checks pass; the focused native/Git suite passes
14/14, including the new host-contract regression; the PowerShell parser reports zero errors; and the
updated native release pin matches. These are preflight checks only. Fresh exact-byte independent review
returned GO with P0=0/P1=0, confirming the pinned-host compatibility, same-volume atomic/write-through
semantics, cleanup, typed error and pin consistency. A source commit remains mandatory before one affected
actual retry.
