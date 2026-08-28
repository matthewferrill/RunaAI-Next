# Control M1 Qdrant lifecycle — actual isolated proof

The corrected isolated service passed startup, persistence across a real process stop/restart,
and scoped rollback. It is left **registered disabled**. This is service lifecycle evidence, not
production application activation, model qualification or human acceptance.

The [raw receipts, pinned packages and checked summary](evidence/20260828-control-lifecycle-r2/summary.json)
retain both the failed first attempt and the corrected second attempt. The 84,184,576-byte Qdrant
binary is not duplicated in Git; both packages bind its existing selected-stack SHA256.

## What happened

1. Read-only Control baseline verified `RUNA-CONTROL\Matthew` owner/admin context, checkout
   `C:\AI\Projects\RunaAI-Next` at `f092d358a18f0ec0b6c2eaaeaf9a057b1d7f6d68`, branch
   `runa2/integration`, no tracked changes, free 9774/9775, and the existing task/listener/config identities.
2. First package `665a0050a2eae72cc3d2f73e2a059e3c2687ea305e8fa3e93d5dd5aa1c8d8c61`
   installed disabled and reached readiness. Its wrapper then exited1 while replacing its log receipt.
   The subsequent synthetic write was denied before reaching Qdrant because child ownership was no
   longer live. No synthetic collection was created in this attempt.
3. An actual local Windows PowerShell5 repeated-write test reproduced `File.Replace(...,$null)`
   coercing the optional .NET string to an empty path. The corrected implementation uses explicit
   `System.Management.Automation.Language.NullString.Value`; the Home status mirror received the same
   pre-campaign correction. The Qdrant runner now attempts its terminal receipt independently after
   log cleanup failure. Eight tests passed, including fifteen executed PowerShell contract checks and
   an actual mirror replacement check. Source fix: `02e7ae33a4141700889cf040f53a527b23573740`.
4. The failed task and owned child were stopped/unregistered. After checking exact pins, no task,
   no child/runner, free ports, and absolute contained non-reparse paths, the entire failed installation
   was moved recoverably to `C:\AI\RunaAI-Next-Candidate\m1-qdrant-retained-r1`. Nothing was deleted.
5. Corrected package `02cae44f55de901c084b18060d153e1640934cf94fbc26f6345c8a5c531d2b02`
   was built from clean parent source `aa5deecf1c50bf54d4713784faab02333c05c590`, staged in
   `C:\AI\RunaAI-Next-Candidate\staging\m1-qdrant-proof-20260828-r2`, then installed disabled.
6. First corrected run `c91bfc92293148d3870a6109b5d2b6f7` reached ready at17:29:36Z. It stayed
   running through repeated mutable log writes and stored/read one four-dimensional synthetic point
   in `m1_service_lifecycle_probe`, payload only `{reference:"m1-synthetic-service-proof",revision:1}`.
7. Scoped rollback stopped/unregistered that task while retaining all bytes. Reinstallation verified
   the retained code/config/data and registered disabled without overwrite. Restart created a new
   child/run `6b62aa15e7914187970236baf330c1ed`, ready17:31:21Z. The exact synthetic point remained.
8. A second scoped rollback succeeded, then the same installation was re-registered **disabled**.
   Both runner terminal receipts report exit0 and no failure. Final observation17:33:09Z shows no
   9774/9775 listeners. All existing production listener PIDs, task states/principals, three config
   hashes and tracked checkout state equal the preflight baseline.

## Boundaries and remaining work

- Only the new isolated subtree/task, two rehearsal staging folders and retained failed sibling changed.
  No production route, Caddy, PostgreSQL, Keycloak, OpenFGA, protected store or legacy repository changed.
- LocalService is least privilege but shared with other services, not a dedicated per-service sandbox.
- Real stop/restart persistence was tested; a Windows reboot, power-loss recovery, graceful database
  shutdown and an OS network egress sandbox were not claimed or tested.
- Future successor deployment must verify the exact r2 package/retained installation, then explicitly
  start the disabled task as part of its rollback-protected application deployment. The application
  still owns actor/project filtering and reference-only payloads; loopback is not authorization.
- No model inference was part of this service proof. Home campaign lifecycle is separately sealed.

`retain-proof.mjs` refuses an existing evidence directory and checks the recorded before/after identities,
two successful process receipts, distinct restart identities and final disabled state before retaining
the immutable evidence package. `Invoke-ControlM1QdrantProof.ps1` is an operator-only rehearsal helper,
not a production automatic maintenance service.
