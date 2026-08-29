# Atomic replacement ACL correction results

The complete isolated Control run at source `200fb9728ddea1530b688b2a8da0999c3d317893`
passed 1,628 of 1,637 checks and retained nine failures. The untouched raw log SHA-256 is
`c11b418e2da46f178173748f8aa7084811618604f673636a37dcc0d0b7064419`; the retained result SHA-256 is
`38609a444c7766ab714f03ad13c8d6939b108a0fdfdd2da0fc9102efc55d10ba`. It used 1,981 verified source
files, the 30,036-file installed dependency artifact, disposable PostgreSQL/Qdrant/native resources,
and cleaned all six owned mutable directories. Models and production were unchanged.

Seven failures reproduced the premature staging-file ACL round-trip described in the criteria. Removing
that unnecessary operation left all final-target, actual-preimage, displaced-file and conflict checks in
place. The focused actual Windows suite then passed all 12 behavioral file-transaction checks plus the
new source-boundary check. The same run passed both corrected mirror tests after making their PowerShell 5
module/execution-policy environment explicit. Combined focused result: **14/14 pass, zero skipped**.

This is a prospective correction. A fresh full exact-source Control run is still required after all
operational changes are integrated. The failed 1,637-check run is not relabeled or counted as passing,
and these focused checks do not qualify a model or a live Home transition.
