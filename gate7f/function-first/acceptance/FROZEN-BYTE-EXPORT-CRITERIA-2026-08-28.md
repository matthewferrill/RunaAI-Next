# Frozen historical bytes in application exports: prospective correction

Date: 2026-08-28. Criteria before implementation. Application baseline:
`ec0a63d974e53ac7e19a2a6bae1c6caa40fc1a8a` (R4); branch parent also includes
documentation/seal commit `fd8c36eeeef56112e707b314c249e2390205f1d4`.

This is M1-S2 verification/packaging work under C12/C15, not an added product capability.
Roadmap revision `2026-08-28.1`, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
M1 and all seventeen capability families remain open. No inference or production change.

## Actual failure and narrow cause

The full frozen R4 Control suite ran 1,259 tests with actual disposable PostgreSQL and the
proper owned compact MXC runtime: 1,241 passed, 18 failed, zero skipped. All six actual
PG/filesystem/MXC tests passed. The raw log is retained unchanged with SHA-256
`1f3b3374640dff499fa69c9dfae1bf403685fbd9b7c501fe6c58a38b658eb40c`.

Seventeen historical publication tests rejected `publication-loaded-frozen-module-drift`.
The exact R4 Git blob for `gate7f/contracts.mjs` has 11,245 LF bytes and SHA
`8ad0e09b67652939d0aec3c7d55f3494528efa629ad20496463c94f10c8d213c`, matching its
original acceptance seal. Windows Git archive text conversion exported CRLF bytes with SHA
`6f2df637177857c344401c137fa38ede6586610281de6445084c631c553c9af3`, exactly the rejected
value. This is not a semantic module change, and the strict rejection is correct.

All fourteen entries in the historical `gate7f/qualification/acceptance/SEAL.json` were inspected.
Thirteen Git blobs already match their old raw hashes, including all nine modules. The exception
is `package-lock.json`: the old seal, actual installed dependency artifact, R4 archive and verified
working file require 224,034 CRLF bytes, SHA
`2b443060beac09e89779ab2e4b60a22e7bf89e26880f14d0d4cdc04db9d8328e`; its normalized Git
blob has 218,273 LF bytes, SHA
`dfad61b35b009d1483daa0923e91234e20b337c541660423a701978c9a4c7e23`.

The eighteenth failure is a separate Qdrant contract-test fixture using a hardcoded Omen binary
path that does not exist on Control. Root owns that explicit test-input correction; this patch
does not change it or the package verifier.

## Authorized change

1. Add exact-path `-text` attributes for the fourteen frozen entries. Preserve existing rules.
   No wildcard conversion across unrelated source or evidence.
2. Preserve the thirteen already-correct Git blobs. Restore only equivalent local checkout bytes
   from the verified originals where needed; no module, rubric, criteria or seal edit is committed.
3. For the one explicit lockfile exception, commit the already-existing, independently verified
   CRLF bytes. The exact historical pin stays fixed; parsed dependency JSON and dependency versions
   must remain identical. Do not regenerate the lockfile or update packages.
4. Keep every historical seal, loaded-module check, raw record, grade and failed R4 result unchanged.
   No alternate hashes, line-ending normalization in verification, resealing, exclusions or skips.

## Green criteria

- All fourteen committed raw objects, working files and newly exported archive entries must match
  their original sealed byte lengths and SHA-256 values, including the Markdown/attributes/lockfile.
- Regression fixtures export under both `core.autocrlf=true` and `false`, with identical sealed bytes.
  Negative byte mutations and CRLF rewrites still fail strict verification.
- All seventeen historical publication tests pass from the new archive without changing them.
- The package lock's parsed JSON is unchanged and its raw hash remains the actual deployed pin.
- No frozen module or historical seal changes appear in the committed diff. Only exact attributes,
  the documented lockfile byte preservation, regression code and new documentation/results are added.
- Run focused regressions, roadmap validation and `git diff --check`; retain actual original/archive
  comparisons. Root will combine the independent Qdrant test fix, freeze new source/seal and rerun the
  whole actual-Control suite and controls before model scoring. Do not overwrite R4 stages or evidence.
