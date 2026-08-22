# Gate 6C/6D Control maintenance window

This runbook separates the reversible candidate-only setup, the one fresh owner passkey validation,
and the protected-data boundary. The bounded Control wrappers make each phase executable and
fail-closed; they do not collapse the phases into an unattended cutover.

Current status (2026-08-22): all candidate-only and owner-interactive prerequisites are complete. The
exact Gate 6C release is running as a non-authoritative Control shadow, the seven-step owner ceremony
is complete with two distinct passkeys, the recurring encrypted backup and distinct-target restore
proof are current, and the write-freeze preflight passed read-only. No protected record has been
imported, no freeze is active, no traffic has changed, and the candidate has not been promoted.
The steward explicitly authorized the protected Gate 6C/6D maintenance window on 2026-08-22.

## Before the owner joins

1. Deploy the exact reviewed Gate 6C release beside legacy; do not replace the legacy checkout.
2. Register `ProtectedBackup` from `control/Register-ControlBackupSchedule.ps1`.
3. Run one scheduled-format encrypted backup and
   `control/Invoke-ControlScheduledRestoreProof.ps1`. Retain aggregate output only.
4. Verify the candidate release/artifact, all five services, private listener, empty selected target,
   shadow authority, and the legacy clean commit.
5. Run `Set-ControlLegacyWriteFreeze.ps1 -Mode Preflight`. This reads only Git and ACL metadata.

## Owner-interactive boundary

The owner must be present to enroll and witness new target credentials. The ceremony must prove a
new WebAuthn/passkey, sign-out/sign-in, fresh WebAuthn step-up, session/capability revocation, and a
second newly enrolled recovery credential. Legacy credential material is never opened or copied.

This boundary is complete. Its evidence remains a prerequisite only; owner completion does not grant
the candidate write authority, import authorization, or production traffic.

## Protected maintenance window

1. Deploy the exact reviewed active-mode promotion candidate with
   `control/Deploy-ControlPromotionCandidate.ps1`. Active mode alone grants no authority while the
   cutover coordinator remains `planned` with legacy authority.
2. Run `control/Invoke-ControlProtectedMaintenanceWindow.ps1 -Mode Prepare`. It reverifies release,
   source, services, listeners, time/capacity, selected tests, freeze preflight, encrypted backup, and
   distinct restore without opening a protected legacy store.
3. Run `-Mode ActivateAndPromote`. It activates the bounded whole-state legacy write deny, captures
   project/chat, E6, the selected setting, and selected-receipt classification twice in the same owner
   process with one memory-only reconciliation key, re-encrypts directly into candidate PostgreSQL,
   verifies retained rows and active approved knowledge, and promotes only after exact reconciliation.
4. Run `-Mode RestartAfterPromotion`, then complete one fresh user-verified passkey login at the
   returned Gate 6D validation URL.
5. Run `-Mode VerifyLive`. It proves three ephemeral read-only lanes, one governed setting change and
   its governed rollback, exact retained-data reconciliation, selected tests, dependency-loss closure,
   privacy boundaries, and target-session revocation.
6. Run `-Mode Observe`. It performs 120 health samples and at least 13 freeze checks over a full hour.
7. Run `-Mode Close` only after the retained observation proof and final reconciliation pass. It closes
   cutover and releases the legacy freeze. Any hard failure before close invokes target rollback,
   verifies the unchanged legacy runtime, and releases the freeze with `verified-rollback`.

## Conservative freeze finding

Legacy has no central selective-write maintenance switch. Some selected roots may be absent, so ACLs
on only existing selected subdirectories cannot prevent a new project/chat root from being created
without modifying legacy state first. The supplied freeze tool therefore applies a temporary
write-deny to the entire legacy `.runaai-local/state` root while preserving reads. This migrates and
opens no deferred store, but it temporarily pauses all legacy state writes. Activating that broader
maintenance impact required an explicit steward decision. That decision is recorded, but the script
is still not run during preparation and no freeze is active until the exact activation phase begins.
