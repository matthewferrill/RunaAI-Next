export const GATE6C_BINDING_VERSION = "runa2-gate6c-binding/v1";
export const GATE6C_CEREMONY_VERSION = "runa2-gate6c-owner-ceremony/v1";
export const GATE6C_BACKUP_VERSION = "runa2-gate6c-backup-proof/v1";
export const GATE6C_FREEZE_VERSION = "runa2-gate6c-freeze-lease/v1";
export const GATE6C_INVENTORY_VERSION = "runa2-gate6c-owner-aggregate-inventory/v1";
export const GATE6C_RECONCILIATION_VERSION = "runa2-gate6c-reconciliation/v1";
export const GATE6C_REQUIRED_DOMAINS = Object.freeze([
  "action-receipts", "learning-events", "project-chat", "setting",
]);
export const GATE6C_OWNER_STEPS = Object.freeze([
  "verify-recovery-authority",
  "enroll-primary-credential",
  "verify-sign-in",
  "verify-fresh-step-up",
  "verify-revocation",
  "enroll-recovery-credential",
  "verify-recovery",
]);
