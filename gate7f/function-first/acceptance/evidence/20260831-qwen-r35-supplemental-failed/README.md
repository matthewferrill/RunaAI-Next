# Qwen r35 supplemental stopped evidence

Qwen remaining-13 arm r35 used source
`9ffa9d8a148b47abfb80f49491bfa63227ccc82c`, runtime seal
`0afb31fafe28032da3fb4cac4e6a0d13896d9205f03aaecf33a2de7da8dd97c6`,
12/12 fresh controls, Home lease `20260829-campaign-qwen36-r35`, and
Control stage `45f8f432f89a45f0a5ee7bc3237f0cb5`.

Agent04 completed with its actual-browser revoked-state observation. Agent05
preparation also completed, but the 24-second in-flight witness was not
published within its truth window while the operator was polling manually.
The arm was stopped after Agent06 started. This is retained harness/operator
failure evidence; it is not selectively resumed, pooled, regraded, or used for
qualification composition.

`evidence-manifest.json` hashes all 28 files retained in the drained Control
stage, including request files by hash only. Request bodies and raw attempts
are not committed. `home-retirement.json` records the seal-bound abort, zero
model residency, restored power, absent scheduled task, and unchanged
production routing.
