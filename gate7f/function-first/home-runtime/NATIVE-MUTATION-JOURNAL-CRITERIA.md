# Durable native-mutation barrier

Prospective operator implementation, 2026-08-28. This supplies the missing actual
file-backed `assertMutationSettled` dependency; it does not establish native
admission closure, own an active model, or authorize a deployment.

1. A new private, nonlinked directory is bound to one transition ID, original and
   candidate settings hashes, exact engine identity, and operator source digest.
   The host wrapper must verify its owner-private ACL and exclusive lifecycle
   lock. There is no production default that skips that callback.
2. Every concrete settings-file or native-server mutation intent is published and
   flushed before dispatch. A create-only next revision is the cross-process
   compare-and-swap boundary. Records have a sequential hash chain; partial files,
   gaps, modified history, unexpected names, hardlinks, and binding changes stop
   progress. Do not delete or truncate conflicting records.
3. Match every return/confirmation to its exact intent. Native CLI return alone
   is not server-operation confirmation. A settings receipt must match the
   original intent and current expected result. An unconfirmed response remains
   pending even if a later file/listener snapshot looks correct or a new adapter
   is constructed. There is no reset, skip, force, or snapshot-only recovery API.
4. Block every new mutation, including an opposite/compensating operation, while
   any prior mutation is pending. A completed operation ID or settings mode may
   not be reused. Diagnostic transition events must not create or clear authority.
5. Record only bounded metadata and hashes already emitted by the fixed host
   adapters. Never retain private raw settings, keys, tokens, or child output in
   this journal. Preserve the existing host-private actual-preimage mechanism.
6. Test fresh-process reopen after an intent-only crash, returned-but-unconfirmed
   native operation, unknown settings child, mismatched confirmation, duplicate
   dispatch, concurrent publication, partial writes, history tampering, and actual
   NTFS links. Prove that confirmed sequential operations work and that uncertainty
   cannot disappear through reconstruction. Use disposable local fixtures only.

The production assembly must connect this journal to the independently proved
maintenance boundary and native adapters. These local mechanics alone are not a
Home transition, complete two-host rollback, or model qualification. The frozen
three-model comparison and its recorded outcomes remain unchanged.
