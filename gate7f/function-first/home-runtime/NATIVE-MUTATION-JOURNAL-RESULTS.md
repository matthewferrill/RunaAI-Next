# Durable native mutation journal — local implementation results

2026-08-28. Criteria preceded code at `19faa9b`. This is operator infrastructure,
not a product capability, model qualification, or live Home transition.

The concrete journal now persists each settings/native-server intent before a
fixed adapter may dispatch. Settings returns must match the original operation;
a successful native CLI return remains pending until the matching native
postcondition is observed. Unknown outcomes remain unresolved across new adapter
instances and new Node processes. The implementation has no reset, skip, replay,
snapshot-only recovery, or arbitrary event API.

Each create-only revision is flushed, bound to exact transition/engine/source
hashes, and chained to its predecessor. Unexpected filenames, partial or modified
records, mismatched bindings, hardlinks, and directory junctions fail closed.
Private raw settings and child output are not accepted as record fields.

## Verification

- Focused suite: **12/12**, zero skips. Actual filesystem/Node process checks cover
  restart after intent-only crash, returned-but-unconfirmed native operation,
  unknown stopped settings child with a reconstructed real bridge, confirmation
  mismatch, concurrent publication, malformed/tampered records, and real NTFS
  hardlink/junction refusal. Native effects are synthetic, not Home calls.
- Full native-runtime suite: **156/156**, zero failures/skips, 42.169 seconds.
  Raw TAP retained at `artifacts/runs/native-journal-regression-20260828-elevated.tap`;
  SHA-256 `e714cbfecea5be756fff618cd9b1828cedc96530a33d84a5e3a7b03111e8b04c`.
- Initial sandboxed full run: **155/156**, one failure because Windows denied
  `New-ScheduledTaskSettingsSet`. The unchanged complete suite was rerun with
  access to that read-only CIM construction; no test or assertion was removed.
  Initial raw TAP remains at `artifacts/runs/native-journal-regression-20260828.tap`.

## Boundaries still to establish live

The host wrapper must bind this exact journal path to its exclusive lifecycle
transaction, verify owner-private ACLs on the directory and records, and supply
the independent caller-closure/quiescence checks. Hash chaining detects corrupt
retained history; it is not protection against an administrator deleting or
replacing the entire private store. An arbitrary new directory must never be
accepted as recovery authority. No production default skips ACL verification.

The implementation does not resolve an unknown native mutation. Such a state
stays closed and needs separately proved reconciliation. This local test pass
does not claim complete two-host rollback, native admission closure, power
restoration, an active deployment, or any model outcome. Independent review and
actual host assembly remain pending.
