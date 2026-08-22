# Gate 6C owner and backup readiness results

Status: Gate 6C prerequisites complete; superseded operationally by the closed Gate 6D cutover

## Outcome

The new target owner ceremony is complete on Control. The owner has two distinct passwordless
passkeys, and the witnessed seven-step ceremony proves recovery authority, primary enrollment,
sign-in, fresh user-verified step-up, target session/capability revocation, recovery enrollment, and
recovery verification.

This document records the pre-cutover readiness result. At that observation, it was not a promotion:
legacy RunaAI remained authoritative, the candidate was in `shadow` mode, and no protected data or
traffic had changed. Gate 6D subsequently completed and closed; current authority is recorded in
`GATE6D-CUTOVER-RESULTS-2026-08-22.md`.

## Exact running shadow release

- Release: `runaai-next-gate6c-readiness-2026-08-22-669139e`
- Commit: `669139ec7e0c1a043f2854b92e2db964137537ee`
- Artifact digest: `d8a39de16b79c78de0e8d6211f9af2b2e007e1139836596b5cc8a9f0e58b7b77`
  across 29,423 files
- Configuration digest: `c0980e45c2443601038da2c76c1deb6fc9de6ca32eadae1a769719f3594d1424`
- Manifest digest: `46f3e1e40677807bb3fe95492e3dd40543c485ea7d2074749c2d88fee97f726a`
- Owner ceremony: phase `complete`, revision 7, no next step
- Readiness: `ownerCredentialEnrolled=true`, `authority=shadow`, all four dependencies ready

The readiness correction derives owner readiness from the exact bound ceremony instead of retaining
the Gate 6B hardcoded `false`. It does not alter the authority decision. Because release identity is
part of the ceremony binding, the completed ceremony was moved to the corrected immutable release by
an exact transactional rebind. The prior completed row was retained, the new pristine row was
required, the target owner principal was checked exactly, and a release-rebind audit row was added.

## Passkey boundary

The target Keycloak realm contains one exact `matthew-owner` user and two
`webauthn-passwordless` credentials. The client accepts only its passkey flow for the owner path,
alternative grants remain disabled, the exact audience is present, and the guarded mapper emits
`amr=["webauthn"]`. Credential identifiers, tokens, passwords, and private values were not retained
in repository evidence.

## Backup and restore

The `ProtectedBackup` task remains SYSTEM-owned with its daily and startup schedule. Its action was
advanced from the prior shadow release to the exact running release without unregistering the task;
the prior action was the automatic rollback target.

The scheduled backup passed under the current release and produced three DPAPI LocalMachine-encrypted
archives with zero plaintext backups. Generation `20260822T0843051927477Z` then passed the disposable
restore proof for all three candidate databases. Each database restored into a distinct fixed
temporary target, the targets were verified and destroyed, and no protected legacy store was opened.

## Read-only freeze preflight

The legacy freeze tool ran only in `Preflight` mode against clean legacy commit
`b4db04090d8f0df87234fab573b396e7824c5354`. It verified the state root and ACL inheritance, opened
no protected store, changed no ACL, created no freeze marker, and modified no source. A later
authorized attempt activated and then released the whole-state write deny as recorded below.

## Fail-closed events

- The first corrected-release rollout stopped before mutation because Windows PowerShell returned a
  nested credential array. Aggregate inspection proved one password credential and exactly two
  passwordless credentials; the inventory was normalized and retested before retry.
- The first backup invocation under the new release stopped before creating a generation because the
  scheduled task still pinned the prior release. The task action was advanced with exact before/after
  checks and rollback, after which backup and restore passed.
- The first promotion-candidate deployment reached the new release but its readiness endpoint failed
  closed because PostgreSQL correctly reported that the not-yet-initialized Gate 6C run table did not
  exist. The deployment wrapper restored the exact prior release, config, launcher, and backup action.
  Live confirmation showed the prior shadow release at planned revision zero, legacy authority,
  `protectedDataImported=false`, `productionTrafficChanged=false`, and no freeze marker. Readiness now
  classifies SQLSTATE `42P01` as “import not started” while every other database error still propagates.
- The first authorized freeze/import attempt stopped before the first cutover transition and rolled
  target state back with legacy authority retained. Freeze release restored the original ACL before
  Windows PowerShell refused to add two new audit properties to the retained marker. Recovery added
  only those missing properties, reran the exact release verifier, and confirmed `released`, zero deny
  rules, planned revision zero, legacy authority, no import, and no traffic change. The freeze tool now
  uses explicit audit-property insertion, archives a completed lease before a distinct retry, and the
  operator runs its backup/readiness prerequisites before any future freeze with step-specific errors.

None of these events changed legacy content, imported protected data, promoted the candidate, or
changed traffic. The one bounded freeze activation was fully released with the original ACL restored.

## Verification

- Full Node suite: **293/293 passed**.
- Gate 6B focused suite: **24/24 passed**.
- Gate 6C focused suite: **36/36 passed**.
- All new PowerShell files parse successfully.
- Candidate tasks: application, Caddy, Keycloak, OpenFGA, and PostgreSQL running; protected backup
  ready with last result zero.
- Legacy RunaAI: branch `main`, exact commit `b4db040`, tracked worktree clean.

## Authorized next operation

The steward explicitly authorized the protected Gate 6C/6D maintenance window on 2026-08-22. The
reviewed operator now separates exact promotion-candidate deployment, non-protected preparation,
freeze/capture/import/promotion, restart, one fresh passkey validation, full-hour observation, and
close. It fails closed to target rollback plus legacy-runtime verification and freeze release.

This authorization did not change the readiness evidence above. The later maintenance-window evidence
is retained separately in `GATE6D-CUTOVER-RESULTS-2026-08-22.md`; it records successful import,
promotion, live validation, observation, close, and freeze release without rewriting this historical
pre-cutover snapshot.

The extended disposable verifier now checks decrypted retained rows and active approved-knowledge
parity in addition to four-domain commit, restart persistence, idempotent replay, private-canary
absence, encrypted browser-session persistence, and target-only rollback. It passes. The current full
suite passes **293/293**, Gate 6B passes **24/24**, and Gate 6C passes **36/36**.
