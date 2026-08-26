# Gate 7E Control host-preparation incident and decision

Date: 2026-08-25
Corrective branch: `codex/gate7e-control-environment-fix`
Source base: `f092d358a18f0ec0b6c2eaaeaf9a057b1d7f6d68`

## Outcome

Gate 7E production activation remains stopped. The authorized Control host-preparation attempt exposed an
upstream MXC drive-root ACL defect before a real JavaScript sandbox result was accepted. The active RunaAI-
Next release, customer traffic, identity, protected data, PostgreSQL, DNS, certificates, and application
services were not changed.

The repository implementation remains green at **439/439**, but that is source and fail-closed evidence.
It is not evidence that QuickJS executed inside the real Control sandbox.

## Exact observed sequence

1. The released MXC `0.8.0` `wxc-host-prep prepare-system-drive` command was invoked from an elevated SYSTEM
   scheduled task because its embedded manifest requires elevation. It did not complete within the bounded
   observation window.
2. Before it was stopped, the command added the documented non-inheriting `0x00120088` allow ACE for
   `ALL APPLICATION PACKAGES` (`S-1-15-2-1`) at `C:\`. It did not add the corresponding
   `ALL RESTRICTED APPLICATION PACKAGES` (`S-1-15-2-2`) ACE.
3. The released tuple-precise `unprepare-system-drive` command also failed to complete. A PowerShell
   `Set-Acl` inverse failed because Windows rejected the security descriptor owner, and a guarded native
   `icacls` inverse did not complete within its bounded task window. None of those inverse attempts changed
   the observed root ACL.
4. Every one-use scheduled task was unregistered, every observed `wxc-host-prep` or `icacls` process was
   stopped, and all one-use Control and local scripts were removed. No helper or persistent service was
   retained.

The retained Control host difference is therefore exactly one root ACE:

- identity: `S-1-15-2-1` / `ALL APPLICATION PACKAGES`;
- type: explicit `Allow`;
- access mask: `0x00120088` (`FILE_READ_ATTRIBUTES`, `FILE_READ_EA`, `READ_CONTROL`, `SYNCHRONIZE`);
- inheritance and propagation: none.

That entry grants no directory listing, file-data read, or write access and does not inherit to children.

## Root cause

Microsoft MXC issue 648 documents that the released host-preparation implementation finishes drive-root
DACL updates with `SetNamedSecurityInfoW`. Windows may apply the current inheritance model to descendants
when that API writes a directory DACL. On affected volumes the command can therefore normalize many child
security descriptors, appear to hang, and print only its first root-ACE result. Microsoft states that the
same risk exists in the released unprepare path.

Draft MXC pull request 649 replaces that drive-root write with target-only `SetFileSecurityW` behavior and
adds a regression test proving that descendant DACL bytes do not change. As of this assessment the pull
request is still a draft, not part of the pinned released dependency.

Control's observed behavior matches the upstream failure signature: the command appeared to hang after
the first root ACE. Because no complete pre-operation snapshot of every descendant security descriptor
exists, this gate cannot truthfully prove that no descendant ACL was normalized during the bounded run.
No application or service failure has been observed, but absence of an observed failure is not proof that
every descendant DACL is byte-identical to its prior value.

## Safety response

- Do not run the released `prepare-system-drive` or `unprepare-system-drive` command again on Control.
- Do not add the second root ACE or remove the first with a new manual operator without a reviewed decision.
- Do not build or activate a Gate 7E production successor while real sandbox execution remains unproved.
- Keep the current Gate 7D release authoritative; Code remains drafting-only in production.

## Decision options

### A. Wait for a released upstream target-only fix

Upgrade the pinned MXC dependency only after Microsoft merges the target-only fix, publishes it, and the
new version passes the complete local, disposable-host, and exact-Control regression sequence. This keeps
host ACL ownership with the vendor but blocks Gate 7E execution until that release exists.

### B. Build and review a repository-owned target-only ACL operator

Implement only the documented root tuples using `SetFileSecurityW`, first prove apply and exact inverse on
a disposable directory while comparing raw child DACL bytes, then perform one separately approved Control
reconciliation. The Control operation would remove the partial exact tuple, apply the complete pair without
propagation, verify root tuples and sampled descendant stability, and run the real sandbox preflight. This
is faster but makes RunaAI-Next temporarily responsible for security-critical Windows ACL code.

### C. Keep Gate 7E deferred

Leave production Code as truthful draft-only behavior and revisit execution after the Gemma burn-in or a
separately selected sandbox architecture. The partial root ACE would still require an independently
reviewed target-only cleanup decision; it must not be silently treated as the intended prepared state.

Recommendation: choose **A** unless harmless local execution is schedule-critical. If it is critical,
choose **B** only with an independent review of the ACL operator and a disposable-host rehearsal before
Control.

## Steward decision

On 2026-08-26 the steward selected option **B** and authorized design, implementation, testing, Control
reconciliation, Gate 7E deployment, and complete documentation. The frozen implementation and rollback
contract is `GATE7E-TARGET-ONLY-HOST-REPAIR-PLAN-2026-08-26.md`.

## Primary evidence

- [Microsoft MXC host preparation](https://github.com/microsoft/mxc/blob/main/docs/host-prep.md)
- [Microsoft MXC issue 648: recursive descendant ACL rewrite](https://github.com/microsoft/mxc/issues/648)
- [Draft Microsoft MXC pull request 649: target-only drive-root writes](https://github.com/microsoft/mxc/pull/649)
- [Microsoft MXC issue 483: Windows runtime and custom-environment failures](https://github.com/microsoft/mxc/issues/483)
