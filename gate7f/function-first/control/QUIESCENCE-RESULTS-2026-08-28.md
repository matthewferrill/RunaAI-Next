# Scoped Caddy admission/drain mechanics — results

Date: 2026-08-28. Criteria `eef41f49f952d045b3dc51fa88d3b939f1df8c46`;
implementation `25cec6c`. This is isolated operator preparation, not production
activation, model qualification, complete Home quiescence or product capability
C08. The frozen R4b application source `9556ed01f9dbabe8c93eea309e482aad60bf809f`
and all historical campaign evidence are unchanged.

## Result

- Deterministic coordinator/admin/owned-child tests: **28/28**, no failures or
  skips. This includes drift, missing/nonzero counters, lost acknowledgements,
  restart observation, deadline expiry, no late zero-counter success, bounded
  helper stop, unconfirmed-stop retention and exact rollback.
- Roadmap retrieval and tests: **15/15**, all 17 capability families retained,
  digest `613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
- Final actual Windows Caddy proof: **19/19**, 20:39:48.197Z–20:39:50.110Z.
  Caddy 2.11.4 binary SHA256
  `5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b`.
  All eight owned ports closed and the exact owned Caddy process stopped.

The real proof held an HTTP request after upstream dispatch. Its same selected
upstream counter was 1 before and after the admission-overlay reload and remained
1 during the initial drain observations. New public/private application API and
provider requests returned 503; unrelated, authentication and static routes
continued normally. The held request then completed with its original 200
response, followed by three zero-counter observations. A real stale ETag received
412 without replacing the overlay. Exact raw file and active JSON config were
restored, selected routes worked again, and a stale filesystem CAS left the
original bytes intact.

The counter and concurrency semantics follow Caddy's primary
[admin API documentation](https://caddyserver.com/docs/api). This proof tested
the installed binary mechanics; documentation alone was not treated as runtime
evidence.

## Retained attempts and correction record

Raw copied reports below are byte-identical to their original local reports and
are pinned as binary Git content. Full raw Caddy logs remain under the corresponding
`artifacts/runs/quiescence-real-caddy-rN/` directory in the implementing worktree.
The reports retain the exact unique synthetic fixture directories and operator
journals. No original report was edited.

| Attempt | Result | Raw report SHA256 | Full Caddy log SHA256 |
| --- | --- | --- | --- |
| [r1](quiescence/evidence/20260828-r1.json) | Failed, 0 checks | `0f0b9e9e2a51a8abff014a73c7429271e4b9f404e8bead192248cc9a5a49f505` | `ec823d421b7d4e56259331aab23a6de502620f27a4a8610645a16044885c5f6c` |
| [r2](quiescence/evidence/20260828-r2.json) | Passed, 18 checks | `346d2783f9ed199670389ce28d6bb348a2ab16b00064e86885ff33ae5d8997ca` | `98be7c7983fade1ce0587357857ac229c3be4b4fb828d5417658e433faba10ae` |
| [r3](quiescence/evidence/20260828-r3.json) | Passed, 19 checks | `861fb958867f85a284820914215718864258dd33bebf039dae4ddf343b49a163` | `a92e6e8be9fdd7768093135d837c3b2fcd9c514b2534c4e280d8d3260b9d5d19` |

R1 failed before preparation or config mutation: Node fetch sent
`Sec-Fetch-Mode: cors` without Origin, and Caddy rejected the admin read with 403.
The correction supplies the exact loopback admin Origin rather than disabling
origin enforcement. R1 also exposed a fixture mistake: specifying a loopback
site hostname did not bind the synthetic HTTP listeners to loopback. Those
temporary wildcard listeners were stopped and all owned ports verified closed.
R2/R3 explicitly use `default_bind 127.0.0.1` and inspect every actual configured
listener before the proof proceeds. No protected data or production backend was
used by any fixture. R3 adds real stale-ETag denial and runs the final bounded
file-helper implementation.

## Remaining deployment conditions

The result is **selected Caddy-proxied requests only**. Every receipt says
`homeQuiescenceProved: false`. Native LAN1234, trusted desktop/CLI/internal41343
callers, and the installed Home guard transition remain separately owned and
unproved by this test. There is no invocation of Home stop/start, no model
inference, firewall rule, TLS/key change, production Caddy reload or deployment.

The future owning composition must verify the actual private Caddy-file/journal
ACLs, bind exact current file/config/site/upstream identities, and retain the
operator state. It must reuse the existing exact successor deployer only after
the matched model results and separate Home transition proof are accepted.

The 70s limit is the maximum stable-zero sampling deadline, not a whole-deployment
duration guarantee. Per-operation HTTP/helper limits and bounded child-stop grace
apply separately; rollback requires its own bounded I/O. A helper crash can leave
an unknown partial file outcome, never a claimed atomic rename. I/O/counter/drift
failures require reconciliation and do not silently reopen admission.

## Commands

`node --test gate7f/function-first/control/quiescence/*.test.mjs`

`npm run verify:roadmap`

`node gate7f/function-first/control/quiescence/run-caddy-proof.mjs D:\Projects\Runalab\artifacts\tools\caddy\bin\caddy.exe artifacts/runs/quiescence-real-caddy-r3`

The proof requires a new output directory; do not rerun with an existing evidence
path or overwrite any earlier report.

## Follow-up race audit and final repeat

Self-review identified a public-API gap: a caller could ask for rollback while
an earlier admission reload remained uncertain. Commit `cb62b4e` requires
read-back reconciliation first, and rechecks the exact overlay file immediately
before sending the runtime change. Two additional regressions prove that an
unresolved reload cannot be rolled back directly and a foreign post-CAS file is
retained without any runtime reload. The suite is now **30/30**, no skips.

The real Caddy proof was repeated on this final implementation, with fresh
[r4 evidence](quiescence/evidence/20260828-r4.json): **19/19**,
2026-08-28T20:48:40.720Z–2026-08-28T20:48:42.650Z. Exact own-process stop and all eight
closed ports were observed. Raw report SHA256
`66bb2a0455ede9d0730b95fb3979df25ff8df2f2f0bc42151addc5b421e0ef3d`; full retained Caddy log SHA256
`09878351105ff3e59669b8583b231d5d10b1402c3a14f6f06fdcef5ae62ded88`, under
`artifacts/runs/quiescence-real-caddy-r4/`. Earlier r1/r2/r3 reports and claims
retain their original implementation and test counts. No production, Home,
model, frozen application or campaign/evaluator change occurred.
