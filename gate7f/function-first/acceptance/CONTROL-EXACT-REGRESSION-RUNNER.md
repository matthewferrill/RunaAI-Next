# Exact Control regression owner runner

This runner turns the corrected R4b full-regression procedure into one reusable,
fail-closed owner command. It runs only in a fresh stage previously produced by
`Prepare-ControlFunctionalStage.ps1`; it does not create a stage, contact Home,
load a model, read a production store or change a production service.

The source archive and prospective input manifest are operator-created before
the run. The manifest is intentionally strict and create-only:

```json
{
  "schemaVersion": "runaai-m1-control-regression-input/v1",
  "runId": "<32 lowercase hex>",
  "source": {
    "commit": "<40 lowercase hex>",
    "archiveSha256": "<64 lowercase hex>",
    "packageLockSha256": "<64 lowercase hex>",
    "extractedFiles": 1,
    "caseBundleSha256": "<the compiled CASE_BUNDLE_SHA256>"
  },
  "dependencies": {
    "releaseRoot": "C:\\AI\\RunaAI-Next-Candidate\\releases\\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc",
    "artifactDigest": "248aaee4f7855c83fe94a2855e156d2321dee3721c06535afbca87a3f3e86167",
    "nodeVersion": "v22.22.0",
    "nodeSha256": "bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb"
  },
  "postgresql": {
    "toolRoot": "C:\\AI\\RunaAI-Next-Candidate\\tools\\postgresql\\pgsql\\bin",
    "version": "18.6",
    "binaries": {
      "initdb.exe": "<64 lowercase hex>",
      "pg_ctl.exe": "<64 lowercase hex>",
      "postgres.exe": "<64 lowercase hex>"
    }
  },
  "qdrant": {
    "version": "1.19.0",
    "bytes": 84184576,
    "sha256": "369c562eae3d89333a13abfdb522fa209e3f587c1217a1059d817e80814ea9d4"
  },
  "execution": {
    "maximumMs": 900000,
    "allTests": true,
    "serial": true,
    "zeroSkips": true,
    "modelsAllowed": false,
    "protectedDataAllowed": false,
    "productionChangesAllowed": false,
    "createdBeforeExecution": true
  }
}
```

`extractedFiles` must be the actual count returned by the archive verifier, not
an estimate. All placeholder values above are deliberately invalid. The exact
manifest is saved as `CONTROL-REGRESSION-INPUT.json` at the stage root and its
SHA-256 is computed after the file is closed. The stage must retain the exact
`source.tar`, `SOURCE-IDENTITY.json`, package lock, Qdrant binary and dependency
junction created by the preparation workflow.

The stage copy of the dispatcher is never executed directly. From the reviewed
Omen checkout, the operator first supplies all external pins, including the
SHA-256 of the dispatcher itself, to the built-in-only invocation builder:

```text
node gate7f/function-first/acceptance/build-control-exact-regression-invocation.mjs
  --owned-root <exact-stage> --manifest-sha256 <64hex>
  --dispatcher-sha256 <64hex> --bootstrap-sha256 <64hex>
  --identity-sha256 <64hex> --archive-sha256 <64hex>
  --source-commit <40hex>
```

The builder refuses unless its local dispatcher bytes match the external pin.
Its encoded preloader is sent to fixed
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`; on Control it reads
the stage dispatcher once, hashes those exact bytes before parsing the same
bytes as a script block, and then supplies the fixed arguments. Direct `-File`
invocation is unsupported and cannot produce authoritative evidence.

The verified dispatcher purges its own process environment to fixed Windows
values using only .NET APIs before it resolves any external command. It validates
the fixed owner, root, pinned Node executable and every input hash. It reads the
externally pinned bootstrap bytes once and carries them as base64 in the direct
Node argument vector. The first pinned Node is a built-in-only watchdog whose
source is inside the externally pinned dispatcher. It spawns the bootstrap,
retains both exact PIDs and enforces a 1,080,000-millisecond outer ceiling over
all pre-import hashing and the bounded regression. At that ceiling it invokes
fixed `taskkill.exe /PID <bootstrap> /T /F` with its own 10-second bound and
records whether tree stop was confirmed. It also creates, with `wx`, one JSONL
receipt and bounded 131,072-byte stdout/stderr records at the stage root. A
predispatch intent is fsynced before spawn and the exact child PID is fsynced
before any best-effort owner output. Capture, journal or stream failure attempts
the exact tree stop; even an unconfirmed stop destroys and unreferences inherited
pipes so the watchdog still has a finite nonzero terminal. These records retain pre-import errors even if the owner SSH
connection closes; a filename collision fails rather than overwriting evidence.
The dispatcher closes redirected stdin
without writing and exits immediately while the watchdog retains the owner
terminal. This removes both the PowerShell child-lifetime wait and an unbounded
anonymous-pipe write.

The bootstrap has only Node built-ins; before importing repository code it verifies the source identity,
manifest, every extracted source file, the complete installed dependency
artifact, the exact `node_modules` junction and the released Node executable.
The entry then validates the fixed Node path/version/hash, exact root/manifest
and fixed `C:\Windows\System32\whoami.exe` owner before dynamically importing the
bounded supervisor. No provider credential or product endpoint is inherited.
The fixed child command is the pinned Node executable with
`--test --test-concurrency=1 --test-reporter=tap`; there is no test-selection,
retry or skip surface.

If the bounded supervisor cannot confirm stop or pipe closure, its failure
record retains the exact core child PID, whether stop was attempted, any stop
proof and whether the finite post-stop ceiling expired. Such an outcome cannot
pass or be retried blindly; the retained identifiers are used for reconciliation.

Evidence is retained under
`acceptance-evidence/control-regression-<runId>/`. A valid pass requires all of
`input-proof.json`, `tests.tap`, `tests.stderr.txt`, `cleanup.json` and
`result.json`, a zero exit, a complete TAP summary with zero skipped/todo tests,
and a successful post-cleanup directory and port probe. Any partial directory
or name collision is an immutable failed/interrupted attempt; use a new stage
and a new prospective run ID rather than editing or resuming it.

This module is an operator runner, not a qualification result. A final source
commit/archive and a real owner-context execution remain separate future
evidence.
