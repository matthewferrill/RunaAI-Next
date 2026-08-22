# Gate 6C/6D Control maintenance window

This runbook is intentionally not executable as one unattended command. It separates the reversible
candidate-only setup from the owner-interactive and protected-data boundary.

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

The current parallel candidate does not yet expose a complete browser OIDC/session ceremony. Do not
substitute an admin-created credential, bearer token pasted into a command, or an aggregate Keycloak
row count. A reviewed browser ceremony entry point is required before this step can run.

## Protected maintenance window

1. Reverify all authority and backup facts.
2. Activate the bounded legacy write-freeze lease.
3. Run the combined owner-context final capture. The setting/action preflight is
   `run-owner-selected-inventory.mjs`; project/chat and E6 use the accepted Gate 4 readers in the same
   owner process and the same memory-only reconciliation key.
4. Re-encrypt directly into candidate PostgreSQL, reconcile all four domains plus active approved
   knowledge, and advance the cutover coordinator to `promotion-ready`.
5. Proceed immediately into Gate 6D or perform target-only rollback. Do not leave the legacy freeze
   active while waiting for a later review.

## Conservative freeze finding

Legacy has no central selective-write maintenance switch. Some selected roots may be absent, so ACLs
on only existing selected subdirectories cannot prevent a new project/chat root from being created
without modifying legacy state first. The supplied freeze tool therefore applies a temporary
write-deny to the entire legacy `.runaai-local/state` root while preserving reads. This migrates and
opens no deferred store, but it temporarily pauses all legacy state writes. Activating that broader
maintenance impact requires an explicit steward decision; the script is not run during preparation.
