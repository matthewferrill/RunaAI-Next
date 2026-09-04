# M1-S2B1 Control MXC eligibility staging RCA — 2026-09-04

## Status

Actual-system eligibility is paused. The first invocation of the authenticated Control MXC eligibility gate stopped before it created an operation root. This is an operator-boundary failure, not an MXC or model result.

## Retained actual result

- Source commit: `606ddc9e06d005ffdff40042b01539c2621ad6e7`
- Control identity: `RUNA-CONTROL\Matthew`
- Sealed Node: `v22.22.0`, SHA-256 `bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb`
- Result schema: `runaai-native-gate3-mxc-eligibility-operator-error/v1`
- Error: `native-gate3-eligibility-control-preflight-failed`
- Model invoked: false
- Browser invoked: false
- Database attempted: false
- Production changed: false

The failure occurred before `mkdir(root)`, watchdog launch, MXC preflight, or any model admission. It must not be counted as an MXC or model failure.

The first affected-only resume at commit `b43671ce8fb158a74480d2cc48f9e318fdc9c64d` also stopped before product-directory creation with `native-gate3-eligibility-control-parent-preflight-failed`. Its result again records model/browser/database/production effects as false.

## Root cause

The proposed operation root used the shared `C:\AI\RunaAI-Next-Candidate\staging` directory. Its identity, canonical path, owner, and non-reparse topology were valid, but its ACL contains Authenticated Users rules with real Modify/Delete-child authority. A private child created below that parent could therefore be replaced through parent authority during an operation. The fail-closed rejection was correct.

The diagnostic also exposed a classifier defect: the original mutation mask combined the Windows `Write` and `Modify` composite values. Those composites contain the `Synchronize` bit, so three read-only application-package/Users rules were incorrectly counted as writable. Two Authenticated Users rules were genuine mutation authority; the unsafe result was real even though the count of five was inflated.

The affected-only resume exposed a second operator defect. The ACL predicates all passed, but the stripped PowerShell child auto-loaded `Get-Acl` and emitted 616 bytes of benign `Preparing modules for first use` progress as CLIXML on stderr. It exited zero and returned exactly `ok` on stdout. The strict wrapper correctly rejects unexplained stderr, but use of a module-loading cmdlet made benign host initialization indistinguishable from an error channel. This was an operator invocation/publication failure, not a staging, MXC, or model failure.

The next affected-only resume at commit `3772a76de84af38f3c95126e5a7503398caeb12d` stopped before product-directory creation with `native-gate3-eligibility-source-snapshot-dirty`. The original source gate collapsed commit format, tree format, tracked membership, and whole-worktree status into one error and retained no predicate-level result. Immediately afterward, the exported source-authority function and every constituent predicate passed against the same commit and tree. The exact transient predicate therefore cannot be recovered from the published error. That inability to classify is itself an operator-publication defect; it is not evidence against MXC or a model.

The affected resume at commit `7d2c57c36998e29c663c94b5f94f3d05c13a4f0d` first passed the exact read-only source/dependency envelope, then again stopped before product-directory creation with `native-gate3-eligibility-control-parent-preflight-failed`. An exact reproduction under the stripped child environment showed status 0, stdout exactly `ok`, and one 392-byte benign module-analysis progress record on stderr. Replacing `Get-Acl` was insufficient because other PowerShell cmdlets can trigger the same first-use progress. Re-running that exact read-only child script with `ProgressPreference=SilentlyContinue` produced status 0, stdout `ok`, and zero stderr bytes. The incomplete prior correction and its differently configured direct check did not cover the true child environment.

The affected resume at commit `3c2e9af188dd4a751159eb057a92cdbb99bff13b` proved that the centralized progress suppression worked, then stopped before watchdog preparation or MXC with `native-gate3-eligibility-acl-invalid`. The retained public result records `scratchRemoved: true`, no cleanup failures, and no model, browser, database, or production effect. Read-only ACL inspection found that the product hierarchy and operation root were correctly owner-private, but the newly created `journal` directory had owner `S-1-5-32-544` (Administrators), inherited rules, and an unprotected ACL. The operator had explicitly privatized only the operation root and assumed child directories would inherit the complete private boundary. Windows inherits access rules, but a new directory's owner is assigned from the creating token and ACL protection is not inherited as an explicit child property. The verifier correctly rejected that mismatch. This is a provisioning-design defect, not an MXC or model result.

The affected resume at commit `d0f8977e294113ebf19b6827c4a745e7c2b843ff` passed source admission, the parent gate, explicit ACL provisioning for `root`, `journal`, `scratch`, `localappdata`, `temp`, and `transient`, and request sealing. It then stopped before watchdog process creation with primary failure `native-gate3-eligibility-acl-invalid`. Because a request had already been prepared but no terminal process record existed, conservative cleanup retained scratch and the top-level projection correctly reported `native-gate3-eligibility-and-cleanup-failed`; the retained public result separately records the primary ACL failure and `native-gate3-eligibility-scratch-retained`. Read-only inspection identified the two remaining directories created inside the shared watchdog launcher, `journal\host-localappdata` and `journal\host-temp`. Both had the same Administrators owner, inherited rules, and unprotected ACL. All six operator-created directories were correctly protected and owner-private. This extends the same provisioning defect into the shared v2 watchdog layer; it is still before MXC or any model, browser, database, or production effect.

## Systemic correction

1. Use the current Control identity's existing `C:\Users\Matthew\AppData\Local` boundary as the trusted parent. Read-only inspection proved it has no reparse ancestors, an allowed owner, and zero untrusted applicable or inheritable mutation rules.
2. Authenticate the exact reviewed source commit and six active-method source hashes before creating any product directory.
3. Provision only the product-owned `RunaAI\Gate7F\staging` hierarchy below that trusted parent. Apply and verify the existing owner-plus-SYSTEM private ACL at each new level. Do not modify ACLs on `C:\`, `C:\AI`, the user profile, or `AppData\Local`.
4. Detect mutation authority using only primitive write/create/delete/ACL-ownership bits. Do not use Windows composite masks that overlap read-only `Synchronize`.
5. Continue to reject every reparse ancestor and every existing product directory that is not already the exact owner-private boundary.
6. Use the .NET `System.IO.Directory` ACL APIs for get/set operations in all three boundary helpers. They avoid the module auto-load progress channel while retaining strict rejection of any nonempty stderr; do not weaken the stderr gate.
7. Replace the broad, non-evidentiary whole-worktree status predicate with exact admission of every executable source input: the reviewed external commit and six active-method hashes (including the operator's imported watchdog module), hard-coded executor/contracts/lock hashes, tracked membership for all nine source inputs, the exact dependency-tree digest, and the already-sealed runtime/runner hashes. Emit a distinct error for commit format, tree format, and membership instead of collapsing them.
8. Include `zod` in the source dependency-tree digest because the admitted contracts module imports it. The fixed release's QuickJS runtime remains governed by its existing sealed release-artifact proof; this eligibility gate does not reconstruct or replace that release proof.
9. Set `ProgressPreference=SilentlyContinue` centrally inside the exact encoded script passed to every PowerShell helper. Keep the status, signal, spawn-error, exact-stdout, and zero-stderr checks unchanged. This removes only PowerShell's nondiagnostic progress stream and closes the whole helper class instead of chasing individual cmdlets.
10. Apply and verify the owner-private ACL to every directory created for an operation (`root`, `journal`, `scratch`, `localappdata`, `temp`, and `transient`) instead of assuming owner and ACL-protection semantics propagate from the parent. The shared creation helper performs create, ACL replacement, and verification as one fail-closed sequence.
11. Make the verifier require a protected ACL and reject inherited rules in addition to requiring exactly the current owner and SYSTEM with Full Control. This ensures every accepted directory has an explicit, self-contained private boundary.
12. Require every v2 watchdog caller to provide a trusted `createOwnerPrivate` authority method. Use it for `host-localappdata` and `host-temp`, then independently re-run the existing directory-boundary verification before process creation. The existing closed-companion adapter emits v1 requests and remains unchanged; the new authority is required only when a caller actually emits v2.
13. Preserve conservative scratch retention whenever request preparation succeeded but no authenticated terminal record proves process absence. The aggregate top-level failure does not replace the durable public result, which records primary and cleanup codes separately. Do not delete the retained `d0f8977` scratch tree as part of a retry.

This is the reusable correction for every native operator: validate the parent that can replace the child, use primitive rights for ACL classification, authenticate code before mutation, and make the product-owned working hierarchy private before placing evidence or capabilities in it.

## Resume gate

No retry is permitted until the code correction passes syntax/diff checks and independent static review with P0=0/P1=0. After publication, only the stopped affected Control eligibility invocation may be resumed. Any new actual failure stops the campaign again for retained evidence and RCA.
