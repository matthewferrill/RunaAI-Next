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

From an already-authorized `RUNA-CONTROL\Matthew` noninteractive owner shell,
the only supported invocation is:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\gate7f\function-first\acceptance\Invoke-ControlExactRegression.ps1 `
  -OwnedRoot C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-<32hex> `
  -ManifestPath C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-<32hex>\CONTROL-REGRESSION-INPUT.json `
  -ExpectedManifestSha256 <64hex>
```

The entry point passes no inherited provider credentials or product endpoints.
The fixed child command is the pinned Node executable with
`--test --test-concurrency=1 --test-reporter=tap`; there is no test-selection,
retry or skip surface.

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
