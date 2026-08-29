# Atomic replacement ACL preservation criteria

The complete isolated Control regression at source `200fb9728ddea1530b688b2a8da0999c3d317893`
retained nine failures. Seven actual Windows file-transaction checks stopped at
`settings-acl-unconfirmed`: the application-owned stage has the same additional
AppContainer access rules used by the native executor, and round-tripping that target SDDL through a
new `FileSecurity` object canonicalized the temporary file's rule order. No Home or production file was
opened or changed.

`ReplaceFile` preserves the replaced target's security descriptor. The replacement file therefore must
not be given a newly constructed copy of the target ACL before the atomic call. The operator must still
verify the current target ACL immediately before replacement and verify the final target and actual
displaced/preimage ACLs immediately afterward.

The later isolated Control run at source `5063f98e08c95c15ab846d9203e9ec81ef9d9e60`
retained settings failures even though the access-rule set did not change. A disposable diagnostic over
the same transaction primitive showed that the owner, group and exact DACL bytes/order remained equal,
while the control flags changed from `32772` to `33796`. The only added flag was
`SE_DACL_AUTO_INHERITED` (`0x0400`) on the post-replacement target. The pending file and actual preimage
retained the original flags. No production or protected file was opened or changed.

That evidence authorizes one narrow, directional equivalence only after this primitive has executed an
authorized replacement: the resulting target may retain its exact prior descriptor or add `0x0400`.
Removal of `0x0400` is not equivalent. Before replacement, during unstarted recovery, and when proving
that a backup is the owned preimage, the descriptor must match exactly. Owner SID, group SID, exact DACL
and SACL bytes/order/duplicates, and every other control flag remain authoritative in every phase.
Post-replacement displaced files must match the descriptor captured immediately before the operation;
the resulting target may only undergo the same directional `0x0400` addition. Any other ACL difference
remains a conflict and blocks recovery. Existing custom-ACL, late-writer, rollback, hardlink and crash
tests remain mandatory, with explicit negative tests for SACL changes and `0x0400` removal.

Two additional failures were stale mirror tests: the production metadata publisher already uses its
separately pinned, bounded write-through `MoveFileExW` helper instead of the old inline `File.Replace`
statement. Tests must exercise the current helper and retain its drift/reparse/size/sharing-timeout
checks; they must not require removed source text.

Correct only these shared implementation/test defects, then rerun the focused actual Windows checks and
the complete isolated Control suite. The failed raw log and result remain evidence, not a passing run.
This correction does not qualify a model, change a protected store, or authorize a Home transition.
