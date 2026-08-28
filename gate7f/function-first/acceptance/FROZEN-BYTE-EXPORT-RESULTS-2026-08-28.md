# Historical sealed-byte export correction — results

Status: exact-byte correction and isolated Git-less regressions passed. This is
packaging evidence, not model qualification or production authorization.

## Retained failure and cause

The first R4 Control full run at `ec0a63d` produced 1,259 tests: 1,241 passed,
18 failed, zero skipped. All six actual native-project tests passed. Seventeen
publication tests failed because archive conversion changed historical sealed
module bytes; one Qdrant test assumed an Omen-only executable path. The untouched
R4 log SHA-256 is
`1f3b3374640dff499fa69c9dfae1bf403685fbd9b7c501fe6c58a38b658eb40c`.

Thirteen of fourteen original Git blobs already matched the original acceptance
seal, including all nine loaded JavaScript modules. Git's archive text conversion
changed the uncovered LF files to CRLF. The exception was `package-lock.json`:
the original seal bound its existing 224,034-byte CRLF checkout, while its Git
blob had been normalized to LF. Merely checking archive extraction against the
archive was insufficient to detect incompatibility with the older raw-byte seal.

## Minimal correction

Implementation `61d6856f313368986df9e06ae1b0dfb3d3809660` adds exact `-text`
rules for the two uncovered contracts, criteria document and lockfile. The
existing nested 14-byte `* text eol=lf` attribute file remains unchanged and
protects the other ten paths. The lock's already-verified CRLF bytes are now
retained in Git; parsed JSON and every dependency are unchanged. No historical
module, historical seal, case, score threshold or verifier was edited.

Plain `git diff --check` reports the intentionally retained CR as trailing
whitespace. The command-scoped `git -c core.whitespace=cr-at-eol diff --check`
passes. This changes whitespace diagnostics only, never file or hash comparison.

## Verification

- All 14 raw Git blobs and working files match the original seal lengths/hashes.
- Complete `git archive` exports with `core.autocrlf=true` and `false` each retain
  all 14 exact original pins; all nine loaded modules and the seal are unchanged.
- Git-less archive execution: six new raw-byte regressions plus all eighteen
  unchanged publication regressions passed: **24/24, zero failures/skips**.
- Deliberate contract/criteria CRLF conversion, lock LF conversion and an appended
  module byte still fail the untouched historical verifier.
- Independent peer audit confirmed all 14 Git/working/both-archive pins and
  semantic equality of the lockfile.

The archive hashes are
`ea15e18fe9ef448a09d6781c6d9e48f6868492754b615b99f701b43c324d0758`
(`true`) and
`f30e2d9b4e793c4b33061d24194ec042cd656350f3ee39cfc44667dbc342df4d`
(`false`). Unsealed files may differ by export configuration; the fourteen
historical pins do not. The Git-less TAP log hash is
`cc7a6517cdb82b8e5bc61899d3b8c03224c8b13d82ec184f0678e89d683d0b1c`.

The first proof operator incorrectly expected 23 tests after a successful
24-test command. Its TAP was retained; only the local expected reporting count
was corrected, then the complete proof repeated. No failed application test was
hidden or regraded. The successful raw proof SHA-256 is
`65715e041bebf573eb63118fa4f62c9b3f7f0965a9fd2b71ed5fc97f4abe39dc`;
the committed projection is
[`20260828-frozen-byte-export-proof.json`](evidence/20260828-frozen-byte-export-proof.json).

The separate Qdrant fixture-path correction and this fix are integrated in
application source `9556ed01f9dbabe8c93eea309e482aad60bf809f`. Fresh R4b stages
use that source and a new prospective seal; the failed R4 run remains untouched.
Full Control regression, model qualification and deployment are distinct gates.
This packaging proof made zero model calls and zero production changes.
