# Campaign metadata publication companion

Prospective operator-only correction, 2026-08-28. The scored application remains
`9556ed01f9dbabe8c93eea309e482aad60bf809f`, with R4b seal `416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.
No model settings, case, assertion, freshness limit, runtime deadline, or prior grade changes.

## Finding and boundary

An Omen Windows Node 22.22.0 reader using the campaign's separate `lstat` and
`readFile` operations observed ENOENT/EBUSY while PowerShell `File.Replace`
published synthetic metadata: 3,180 errors in 76,303 reads during a bounded
20-second reproduction. This demonstrates the publication defect. It does not
prove the unretained filename of the earlier Coder Chat03 ENOENT.

The mirror is an external operator, not a model or product action. Correct its
writer; do not add reader retries or silently accept stale/partial evidence.
Previously captured observations and failed/aborted batches remain immutable.

## Required evidence before the next batch

- Flush and close a same-directory, create-only temporary metadata file before
  publication. Never delete/unlink the currently readable target first.
- Same-volume rename with replacement; no cross-volume copy/delete, reboot
  scheduling, rollback rewrite, or reader-side forgiveness.
- A sharing/access-denied publication retry is bounded to 250 milliseconds;
  every retry requires the original target and exact staged bytes to remain.
  Record retry count. An unknown outcome, changed target, stale temp, timeout,
  or unexpected error fails closed. This is not general concurrent-writer CAS.
- Caller retains exact owned-root, lease, source, schema, and reparse checks.
  The helper accepts only `home-live.json` in the one caller-owned directory.
- Test actual Windows concurrent readers against the same production helper,
  including negative stale-temp/foreign-target tests and no reader retry.
  Require complete publication count, zero missing/partial/invalid reader
  observations, exact final bytes, and no test-owned processes remaining.
- Repeat on Control with the packaged Node runtime before using the companion.
  Retain raw evidence and hashes; the same companion serves all three models.
- Preparation/browser acknowledgement is retained and sent in one continuous
  operator call. It must satisfy the existing 30-second/10-second bounds; no
  timeout extensions or fabricated observations.

Microsoft's [MoveFileExW reference](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
defines replace-existing and write-through flags. It is not used as a universal
atomicity proof; the actual reader/writer stress and fault tests are required.
The backup-preserving native-settings transaction is a different contract and
is not mechanically changed by this metadata-only correction.
