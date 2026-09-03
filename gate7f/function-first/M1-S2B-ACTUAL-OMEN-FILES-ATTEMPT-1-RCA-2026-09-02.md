# M1-S2B actual Omen-files attempt 1 stop and RCA — 2026-09-02

Status: Omen filesystem/DPAPI layer stopped. Browser, HTTPS, Git/MXC, model and production work did not
run. One diagnostic-corrected affected-scope retry is allowed after the correction below.

## Exact stopped attempt

- Source: uncommitted Omen native bridge work based on `3c1dc57`.
- Command: `node gate7f/function-first/omen-local/actual-windows-proof.mjs --powershell
  C:\Users\matth\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe
  --user-profile C:\Users\matth`
- Result: exit 1 with `native-operation-failed` after about ten seconds.
- Cleanup: the runner's guarded `finally` removed the owned `runa-m1-omen-files-*` fixture. No persistent
  service, listener, certificate, application state, model call or production change was involved.

## Root cause

The confirmed method defect is another lossy actual-proof boundary. The runner did not stamp the current
substage, while the production-safe native bridge intentionally reduced an unexpected PowerShell/.NET
exception to `native-operation-failed`. The combination prevented attribution to DPAPI, root-handle
inspection, confirmation or safe read. Guessing which operation failed would repeat the prior campaign's
bad practice.

## Correction and retry boundary

The runner now stamps each substage. For this owned disposable proof only, it starts the native bridge in
diagnostic mode and retains at most 4,000 characters of PowerShell/.NET exception text. Production mode
continues to expose only allowlisted error codes. Syntax and the existing 9/9 pure local-context checks
must pass before one retry of this exact Omen-files proof. A retry failure stops the layer again for an
underlying product/environment RCA; no broader suite or downstream proof may run.

## Diagnostic retry result and product RCA

The corrected runner stopped at `read-ordinary-file`. Its bounded diagnostic was a PowerShell
`PropertyNotFoundException`: `The property 'Count' cannot be found on this object.` The safe-read path
validator assigned `String.Split()` through the PowerShell pipeline without an array wrapper. A path with
one segment (`ordinary.txt`) was unrolled to a scalar string, so `.Count` was unavailable under strict
mode. The failure occurred before the native file handle opened; no content escaped and the fixture was
removed.

The correction wraps both the split result and filtered invalid-segment result in `@(...)`, giving the
validator one stable collection shape for zero, one or many segments. The acceptance contract is
unchanged. After PowerShell parsing and the existing pure tests pass, run this one actual Omen-files proof
once. Any further failure stops for another RCA.

## Product-correction retry result and fixture RCA

The next scoped run stopped at `read-ordinary-file` with the intended product denial
`native-hardlink-denied`. The fixture had created `hardlink.txt` as a second directory entry for
`ordinary.txt`; that made the supposedly benign file's Windows link count two. The product correctly
denied both names. This was a contradictory test setup, not a product failure, and no content was returned.

The correction creates an independent `hardlink-source.txt`/`hardlink.txt` pair and leaves
`ordinary.txt` with one link. The denominator and denial rule do not change. The focused proof may run
once after the pure checks; any new failure stops and is classified before another attempt.

## Corrected actual result

The final scoped run passed 14/14 actual checks using CurrentUser DPAPI and real Windows handles. It proved
release-script pinning, missing-store behavior, root identity, ciphertext opacity, restart decryption,
bounded text read, and denial of hard links, junction escape, protected names/content, invalid UTF-8,
trailing-dot aliases, alternate data streams, whole drives and the user-home root. The owned fixture was
removed; the result states `productionChanged:false` and `modelCalled:false`. The layer resumed at the
next unproved Git/MXC boundary. Both stopped attempts remain retained as method/product-fixture evidence.
