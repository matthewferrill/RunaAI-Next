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

## Initial RCA finding

The release pins Windows PowerShell `5.1.26100.9168`. Initial read-only reflection on that exact executable showed
that its loaded `System.IO.File` exposes only `Void Move(System.String, System.String)`. The helper's DPAPI
protect action called `System.IO.File.Move(temporary, destination, true)`, a three-argument overwrite
overload available in newer .NET runtimes but absent from the .NET Framework surface used by Windows
PowerShell 5.1. DPAPI encryption and the temporary write could complete, but method binding failed before
the sealed state could be atomically published. This was a real latent host incompatibility, but the first
RCA incorrectly identified it as the immediate cause because the generic error did not reveal which
protect substep failed.

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

## Second stopped attempt and completed root cause

The independently reviewed first correction was committed as
`0b4e1d4253d08516ebda2b691cc56c8085180bdd` and the one affected Windows proof was run. It stopped again
at `confirm-and-protect-root` with the same public `native-operation-failed` result. The downstream
Git/MXC/network proof again did not run, and disposable cleanup completed.

Read-only diagnostics then compiled the exact embedded C# type successfully, proving the new P/Invoke was
not the immediate failure. An exact pinned-host DPAPI type probe failed before encryption because the
`-NoProfile` Windows PowerShell 5.1 process had not loaded the `System.Security` assembly. Explicitly
loading `System.Security` made a CurrentUser DPAPI protect call succeed. Therefore the complete causal chain
is:

1. Immediate failure: the helper referenced DPAPI before explicitly loading its assembly in the clean
   pinned PowerShell host, so type resolution failed and the generic outer catch hid the substep.
2. Latent successor failure: after DPAPI became reachable, the unsupported three-argument `File.Move`
   would have failed at publication; the first correction validly removed this second defect.
3. Coverage failure: syntax parsing and fake-native tests exercised neither pinned-host assembly loading
   nor host runtime method binding. The first review accepted the supplied overload diagnosis without
   independently proving the earlier DPAPI call could execute.

The amended correction explicitly loads `System.Security`, uses fully qualified DPAPI types, maps assembly,
protect and unprotect failures to distinct public codes, retains the reviewed `MoveFileExW` publication,
and extends the source regression to require these host contracts. The native release pin must be refreshed,
finite preflight and fresh independent review must pass, and a new source commit is required before any
further actual execution.

## First-correction review checkpoint — superseded by the second stop

The prospective correction uses the native atomic publish primitive, randomized temporary ciphertext and
bounded cleanup described above. Six JavaScript syntax checks pass; the focused native/Git suite passes
14/14, including the new host-contract regression; the PowerShell parser reports zero errors; and the
updated native release pin matches. These are preflight checks only. Fresh exact-byte independent review
returned GO with P0=0/P1=0, confirming the pinned-host compatibility, same-volume atomic/write-through
semantics, cleanup, typed error and pin consistency. A source commit remains mandatory before one affected
actual retry.

That source commit was `0b4e1d4`; its actual result is the second stopped attempt above. It no longer
authorizes execution.

## Amended correction checkpoint

The complete prospective correction now also loads `System.Security` explicitly, uses fully qualified
DPAPI types and exposes typed assembly/protect/unprotect errors. The focused native/Git suite passes 14/14;
six JavaScript syntax checks and the PowerShell parser pass; the clean pinned-host assembly/CurrentUser
DPAPI probe succeeds after explicit loading; and the amended native release pin is
`7a309dd1f71fae5b24a89249e01a661af05366f71905304b03dbdfd430d8bcbc`. These remain preflight and
diagnostic evidence, not actual acceptance. Fresh exact-byte independent review and a source commit remain
mandatory before one affected actual retry.

The first review of the amended correction returned NO-GO with P0=0/P1=1 before execution. It found that
`Ensure-RunaDpapi` had been inserted before the embedded C# here-string terminator, making it invalid C#
instead of a callable PowerShell function. This was a source-placement error; no actual proof ran. The
function now follows the terminator and enclosing PowerShell function. A new pinned-host regression extracts
and compiles the exact embedded C# bytes and separately asserts that the DPAPI helper follows the terminator.
After correcting two argument/regex mistakes in that new regression itself, the focused suite passes 15/15.
The PowerShell parser, exact embedded-C# compilation, six JavaScript syntax checks and updated native pin
`de773e8a1c588ac7fbd31a978797b7aff89ac084bbd2b4f229defcefa072c35d` are green. Fresh review and a source
commit remain mandatory; actual execution is still stopped.

Fresh exact-byte re-review returned GO with P0=0/P1=0. It verified the function is outside the here-string,
the exact embedded C# compiles under pinned Windows PowerShell 5.1, the explicit DPAPI assembly/type/error
contract and native atomic publication remain intact, and the updated pin matches. No actual acceptance
ran during review. A source commit remains mandatory before one affected Windows retry.
