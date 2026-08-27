# Independent reporting and controlled-power review

This review used source files, sealed package bytes, fabricated provider replies, and actual in-memory
synthetic executor receipts. It did not inspect model answers, acceptance expectations, or live hosts.
No original seal, inference adapter, acceptance corpus, grader, or frozen verifier was edited by review.

## Reporting findings and corrections

The first reporting implementation accepted contradictory traces: an inspection marked recorded with
its receipt removed; trace raw/parsed proposal fields disagreeing with the actual reply; a false
conformance flag; and inspected content delivered without a receipt. It also accepted incorrect soak
clock offsets, reported missing token counts as zero, admitted duplicate anonymous-packet identities,
and retained arbitrary provider metadata nested in tool-call objects.

The repaired implementation now binds raw replies to normalized observations, derives parsed proposals
and conformance again without repairing model output, checks fixed initial state and receipt/context/
proposal/content relationships, and uses the actual bound reply in continuation reconstruction.
Soak reporting binds slot/request/response/observation clocks and preserves unavailable token counts
with coverage. Anonymous packets require exact unique schedule IDs and allowlist the semantic tool
call fields. Answer prose is unchanged; self-identification remains possible and packets are explicitly
provisional until full-capture verification.

Independent reporting-only tests: **16/16 pass**. This includes three positive controls proving that
genuine malformed JSON, absent proposals, and outside-scope proposals remain recorded model failures,
not false passes or invented evidence corruption. The implementation's focused tests also passed 10/10
at commit `2b83fddc6d266b84155f1cf477a031eaeaa19861`; reviewed source hashes remained unchanged.

Reviewed reporting hashes in the authority agent's isolated reporting worktree:

- `summarize-capture.mjs`: `fe09ffe6a5b61726b89be8b078dfebfd5df540e37e6a03317cde98c20d5754da`
- `make-review-packets.mjs`: `c211d789a41f0488a7417b6c195398d8ba3062b4a39e793af42399d0e29e7b48`

No remaining blocking reporting defect was identified in that snapshot. Final source-created Home
transfer hashes still must be compared with retrieved bytes; newly computing local hashes alone is
not a transfer verification. The root operator owns that check and final capture disposition.

## Transfer and native-output corner review

The root's `verify-transfer.mjs` compares the exact expected file set, byte counts, and SHA-256 values
from the Home-created export manifest with local file bytes. It rejects absolute/traversing paths,
symbolic links, and resolved paths outside the selected evidence directory. Its fabricated focused
test passed **1/1**, including changed bytes, wrong size/hash, wrong host label, and extra manifest
entries. No blocking defect was found in that source. The manifest still must be acquired and retained
through the authorized Home export; checking its `host` field is not source authentication or hardware
attestation. Actual transferred-capture verification remains the root operator's responsibility.

A separate fabricated native-tool-only reply (`content: null`) aborts the frozen agent-JSON integration
with `integration-provider-response-invalid` after one invocation and before any integration trace.
Reporting's string-content check matches this frozen behavior; changing only reporting to synthesize
a completed failure trace would misstate the actual run. A partial report may describe the raw reply
as unexpected native output, while preserving the aborted run and missing integration/soak evidence.
The new independent regression retains this distinction. The anonymous native-tool packet path does
accept null-content calls, as the separate metadata-removal positive test demonstrates. No frozen
parser or grading rule was changed to accommodate this corner.

## Seal and package checks

Before the controlled-power correction, the original package/bundle/run-seal pins, five verification
file pins, acceptance seal, source commit, all 735 packaged files, and 734 corresponding local source
and dependency files matched. Original run-seal hash:
`eb1ab7390b2c438d769f1dbdda615cc2164eb21a6355b45d30d181f8044ef5df`.

The new controlled-power package at source commit `cc4f2f4a18096e9d9cdcb93d1a63d85e032107c8`
has manifest hash `d54cfb2ade6ba912328889566449b4647ac752ff8deffa221cc1f4d5040db91a`.
All 735 packaged files matched. Rendered inputs, adapter policy, soak policy, model/runtime/template
pins are identical to the earlier package. The original run seal and frozen verifier remain unchanged.

## Controlled-power source review

The correction retains the unsafe telemetry sample and records GPU UUID/power-limit values. Every
sample checks the new pinned hardware policy; the original temperature and free-memory cutoffs remain
unchanged. The capture requires the same two GPUs at 160 W and a cool start. Independent focused
runtime/runner/frozen-verifier tests passed **92/92**.

Review found and closed three operator gaps: malformed inventory being mistaken for empty residency,
later GPU reads not rechecking exact identities/counts, and stale result files being mistaken for a
successful new arm. The corrected operator validates these cases, binds result/exit status, and restores
recorded original limits only after verified empty residency. Restoration uncertainty is reported as
unverified, not successful. PowerShell parsing reported zero errors.

Reviewed operator hash, also present in the new run seal:
`46b4c0dbdae399050ac75a06d9884096a875a62ad8546bcd9cb2914e5d8f6c5f`.

No remaining blocker was found for the documented operator after retaining its new seal. This is source
review, not evidence that the live run, restoration, model qualification, or production promotion passed.
