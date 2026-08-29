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
displaced/preimage ACLs immediately afterward. Any real ACL difference remains a conflict and blocks
recovery. Existing custom-ACL, late-writer, rollback, hardlink and crash tests remain mandatory.

Two additional failures were stale mirror tests: the production metadata publisher already uses its
separately pinned, bounded write-through `MoveFileExW` helper instead of the old inline `File.Replace`
statement. Tests must exercise the current helper and retain its drift/reparse/size/sharing-timeout
checks; they must not require removed source text.

Correct only these shared implementation/test defects, then rerun the focused actual Windows checks and
the complete isolated Control suite. The failed raw log and result remain evidence, not a passing run.
This correction does not qualify a model, change a protected store, or authorize a Home transition.
