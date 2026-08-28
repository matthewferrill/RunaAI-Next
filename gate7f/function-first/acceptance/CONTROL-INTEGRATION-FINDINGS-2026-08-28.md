# Control acceptance harness integration findings

This is development evidence, not the formal model campaign and not M1 acceptance.
The frozen 40 cases, 360 model attempts and 12 model-free controls are unchanged.

## First complete control practice

Source `2050bca33ef2e69a092196485e9450cb5b015213`, archive SHA-256
`463d89ca37fb37589b20e8215c03e927ac528db7a83000b722dfc8111131d259`.
Control's uniquely owned stage was
`C:\AI\RunaAI-Next-Candidate\staging\m1-task-native-90699197b1544fee9e64ac7efe5a74e0`.
Raw report: `acceptance-evidence/controls-1787936177112.json`, SHA-256
`4bc8be82adf1335851ad1ad0e35f257e00f9e7024851e348c96802ea477174b5`.
An identical copy is retained in the local ignored `artifacts/runs/` directory named after that stage.

Eight controls completed and independently passed (01, 02, 03, 04, 06, 09, 11, 12).
Four controls did not complete; their grades remain inconclusive, not passing:

| Control | Observed failure | Harness correction to validate in a fresh run |
|---|---|---|
| 05 encrypted restart | `request-experience-invalid` | Code experience must request the Code lane, not general chat. |
| 07 logout/restart | assertion compared absent approval (`undefined`) with `null` | Treat the absent approval as absent; retain actual new-session and no-effect checks. |
| 08 path containment | `project-filesystem-operation-failed` | Shorten the nested disposable fixture path; add precise phase evidence. Excessive path length is a hypothesis until rerun. |
| 10 unknown outcome | child became disconnected while waiting for browser | The child lifetime was two minutes while the browser checkpoint allowed five. Allow ten minutes for this isolated worker; the native 1.2/2-second limits and 15-second delivery hold are unchanged. |

The actual browser also found an independent harness defect: the public runtime status lacked
`cutover.phase`, so the unchanged application UI correctly displayed service status unavailable.
The wrapper now derives the complete runtime/readiness fields from the actual isolated application
authority and staged source identity. No production readiness is asserted.

The first browser form submission did not visibly navigate. It is not counted as authentication or
UI proof. The test-only bootstrap now uses external same-origin JavaScript submission and retains
aggregate GET/POST/issued/denied counts. The nonce is one-use, five-minute, synthetic-only; an existing
active session can be reattached without creating a new authority grant. It is never a production
endpoint, and session cookies remain Secure, HttpOnly and unread by script.

The practice invoked no models, read no protected stores and changed no production services or
configuration. Owned PostgreSQL/Qdrant/native resources were closed and their transient data removed;
source and evidence remain retained. Real browser proof is still required in the next run.

## Prospective shared seal

For formal qualification, pass `--runtime-seal` pointing to an immutable file inside the unique stage.
Before any control attempts, the runner compares its actual source commit/archive, package lock,
Node and Qdrant hashes against the full campaign seal. Each observation is prospectively bound to
that seal's exact bytes. A separate model-free attestation records inference denial and the actual
native runtime. This does not claim that models were resident during controls. Runs without that
seal remain integration-only and cannot be relabeled later as same-seal campaign qualification.

Local targeted checks after these corrections: 19/19 passed. They cover transport denial, bootstrap
one-use/same-session semantics, aggregate diagnostics, complete public-status fields and shared-seal
mismatch rejection. They do not replace a fresh actual Control run or browser observation.

## Fresh complete control practice

Source `2e24cada063c533320bb7f424d4516b676085712`, archive SHA-256
`a792ec277bf2be458be0dd4d547ff3aee11fac13f7fc6afe490d5f46f1fec62c`.
Owned stage `m1-task-native-0d1f359b44ce4c4cb4701e8344f27a30`; raw report
`acceptance-evidence/controls-1787936967753.json`, SHA-256
`66521fe28aad8ab482affd34cc5e1e0f37e9234c7a1320eb07e2f8476bcb26d0`.
Eleven controls independently passed. The parent agent completed the actual in-app browser login,
opened the saved Code project/task, and observed `project.run-tests — unknown`, reconciliation and
no execution receipts; no approval or continuation was offered. That bound browser evidence is in
the raw report. The test-only external-JavaScript bootstrap worked on the first attempt.

Control05 reached the private-row scan but its identifier guard rejected the actual versioned names
`runa_m1` / `route_responses_v2`, because the regex allowed no digits. No plaintext disclosure was
observed or inferred; the privacy control remained inconclusive. The scanner now permits digits after
the first valid identifier character and still rejects SQL punctuation/leading digits. A fresh run is
required. The shortened containment fixture now passed actual Windows handle/hardlink/symlink/junction
and partial-revision controls. Cleanup succeeded with no models or production changes.

The capture proxies additionally expose bounded `drain({maximumMs})` and `activeCount`; closing aborts
their own upstream fetches and waits for final evidence capture. Actual local socket tests prove that
an undrained request fails explicitly, closing disconnects the upstream, and a successful drain leaves
no late capture before the campaign exports an attempt. These are transport tests, not model scores.
