# Gate 4A owner-context inventory contract

Status: exact read-only scope approved by the steward on 2026-08-21. Tooling and synthetic canary
tests are green. The one authorized execution completed green under Matthew's owner context on
RUNA-CONTROL on 2026-08-21; aggregate evidence is retained in
`evidence/OWNER-CONTEXT-INVENTORY-2026-08-21.json`.

## Purpose

Gate 4A cannot design a trustworthy migration from assumptions about real records. The inventory must
prove the shape and integrity of only the legacy project/chat domain while keeping all private content
on RUNA-CONTROL and out of output.

## Execution boundary

- Run from Matthew's interactive Windows owner context on RUNA-CONTROL against the clean production
  checkout and its existing ignored `.runaai-local` state.
- Confirm the running/checkout commit and clean tracked state first. Stop on divergence or unexpected
  tracked changes.
- Before opening any protected root, verify the adjacent source-pin manifest is bound to the expected
  production commit and that all ten selected legacy files match their reviewed SHA-256 pins after
  deterministic `utf8-lf` transport canonicalization. Stop on any missing, extra, malformed, or
  changed selected source. The current reviewed production authority is
  `b4db04090d8f0df87234fab573b396e7824c5354`.
- Use a reviewed, pinned inventory script from RunaAI-Next. The script opens only:
  `.runaai-local/state/chats/`, `.runaai-local/state/projects/`, and
  `.runaai-local/state/memory/projects/`.
- The existing DPAPI protector may be used only in memory to validate/decrypt the chat key and chat
  envelopes for counts and digests. No key, ciphertext, plaintext, title, project name, path, chat id,
  project id, source reference, verification command, memory summary, or metadata value is printed.
- The run writes no product state, migration package, database row, index, trace, log containing private
  data, or changed access time where avoidable. It creates no persistent service or network listener.
- Inventory output is a small aggregate JSON evidence record safe for review. It is copied back only
  after a canary scan confirms that no protected value is present.

## Allowed aggregate output

- source commit, source-pin manifest hash/count, inventory-script commit/hash, schema versions, and
  timestamp;
- store availability and key-unseal success as booleans;
- counts of projects by status, memory-enabled projects, source-reference records, pathway entries,
  chats by assigned/unassigned/archive/unread/branch state, turns by route, project-memory records, and
  unreadable/invalid records;
- aggregate byte totals and maximum record sizes;
- SHA-256 digests of sorted canonical project records, chat metadata, transcript records, and project
  memory, plus one domain manifest digest;
- relationship findings as counts only: missing project assignments, unknown parent references,
  invalid branch points, turn-count mismatches, duplicate ids, and project-memory/project mismatches;
- a boolean stating that no disallowed field was emitted.

Digests may be computed from plaintext in memory, but only the digest leaves the process. Digests are
for before/after equality, not authorization or approval inference.

## Explicitly prohibited output or access

- any raw or truncated chat text, title, summary, note, command, path, identifier, credential, key,
  nonce, authentication tag, ciphertext, or envelope;
- household identity, sessions, device vaults, learning journals/inboxes/reviews/grants, approved
  knowledge, settings, provider secrets, action state, workspace roots, diagnostics, or backups;
- per-record output that permits correlation to a person, chat, project, file, or timestamp;
- export, conversion, import, deletion, repair, re-encryption, catalog rebuild, or database creation;
- broad recursive scans of `.runaai-local`; and
- telemetry or shell transcript containing protected data.

## Relationship interpretation

An unknown parent reference is not automatically corruption because legacy branches are intentionally
self-contained after parent deletion. A chat naming a missing project, a turn-count mismatch, an
invalid branch point, unreadable encrypted content, or memory assigned to a missing project is a stop
condition requiring a documented disposition before export.

## Stop rules

Stop immediately if the checkout is not the expected production authority, DPAPI unseal fails, a
schema version is unknown, an unapproved directory would be needed, a protected value would be shown,
any write is required to continue, the script cannot distinguish unreadable from empty, or the domain
manifest cannot be reproduced identically in a second read-only run.

## Approval meaning

Approval of this inventory authorizes one owner-context read-only run and the synthetic Gate 4A
implementation/rehearsal. It does **not** authorize exporting or copying real records, creating a real
target encryption key, importing real data, changing production, deleting legacy data, or cutover.
