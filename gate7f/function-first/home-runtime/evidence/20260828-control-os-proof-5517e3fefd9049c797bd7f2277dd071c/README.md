# Actual Control Windows mechanics — pass, limited scope

2026-08-28, completed18:58:39Z, independently collected19:00Z approximately. Code committed before
execution as `abcd8d5`; all exact invoked source bytes are retained in `package/`.

- Package SHA256 `528a9eb415348782874ac51e4254586f3899455746ac100d298ee14961872d31`.
- Raw export SHA256 `45d0fa062b415f96f481fbee00c02c65c53451c62a36272e95a50f81799c2fb6`.
- Actual host `RUNA-CONTROL`, authorized operator `RUNA-CONTROL\Matthew`.
- Synthetic child used existing Node24.19.0, SHA256
  `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`.
  This is not Home's pinned22.22.1 runtime qualification.

All seven outer checks passed. Actual LocalService (`S-1-5-19`) read code/replies and wrote requests;
private-state read and replies/code/root write attempts were denied. SYSTEM (`S-1-5-18`) held an
exclusive native file lock. The operator terminated only the recorded synthetic Node identity using
a held handle and exact PID/start-time/executable. The independent native watchdog survived, verified
the fsync'd ownership record, and released the lock. Both finite tasks exited0, both registrations were
removed, and the original child/watchdog were confirmed stopped. The subsequent export found no owned
task registrations and retained actual protected directory ACLs.

Only new directories were created:

- `C:\AI\RunaAI-Next-Candidate\staging\m1-runtime-os-proof-5517e3fefd9049c797bd7f2277dd071c`
- `C:\AI\RunaAI-Next-Candidate\staging\m1-runtime-os-package-5517e3fefd9049c797bd7f2277dd071c`

They remain recoverable; no files were deleted. No existing/parent ACL, model, listener, production
configuration, shared service or other agent's task was changed. No global task-count claim is made.
The export contains synthetic data and process/ACL metadata only, not credentials or customer content.

This proves Windows principal/ACL, exclusive-lock and independent-process mechanics. It does not prove
an assembled Home operator, actual model-crash reconciliation, authenticated deployment, long-idle or
boot availability, or production rollback. Those remain required before deployment.
