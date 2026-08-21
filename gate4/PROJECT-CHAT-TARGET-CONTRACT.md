# Gate 4A project/chat target contract

Status: approved as part of Gate 4A-1 on 2026-08-21. This contract names the target authority and
mapping; it does not authorize protected-data export/import or production migration.

## Authority decision

- Legacy RunaAI remains production and data authority until Gate 6 cutover.
- During Gate 4A rehearsal, the legacy adapter is authoritative and the PostgreSQL adapter is an
  explicitly selected comparison target. No hidden fallback or merged result is allowed.
- After a separately approved Gate 6 cutover, PostgreSQL owns projects, chat metadata, chat turns, and
  project-memory records. LangGraph owns workflow checkpoints only. Qdrant contains no authoritative
  chat or project data.
- Migration bookkeeping is authoritative evidence, but never product content. It stores identifiers,
  digests, counts, status, and timestamps—not chat text, titles, project notes, memory summaries,
  credentials, keys, or decrypted envelopes.

## PostgreSQL namespaces

- `runa_core` — authoritative product records for the selected core.
- `runa_migration` — immutable migration runs, item digests, reconciliation, and content-free deletion
  tombstones.
- LangGraph checkpoint tables remain separately owned by the selected saver and are not duplicated in
  either namespace.

Gate 4A first creates these namespaces only in a disposable database. Production installation and
persistent service lifecycle remain unauthorized.

`participant_id` is an opaque Runa product principal, not a Keycloak subject, Windows username, or
biological-identity claim. The later authentication layer binds an authenticated subject to this
record; it does not redefine ownership of migrated data.

## Sensitive-field encryption

The current chat archive is encrypted at rest. Gate 4A must not weaken that property merely because
PostgreSQL is relational.

- Chat titles, user text, assistant text, project display names, project notes/pathways/source
  references, and project-memory summaries are stored as authenticated application-level envelopes.
- Each envelope binds schema version, record type, participant scope, record id, and field name as
  authenticated associated data. Swapping ciphertext between records or fields must fail closed.
- The database stores envelope version, key id, nonce, ciphertext, tag, and an HMAC-SHA-256 of the
  canonical plaintext for reconciliation. The HMAC key and data-encryption key remain outside the
  database so low-entropy titles or summaries cannot be tested against an unkeyed digest.
- Gate 4A synthetic work uses disposable generated keys. Any real export requires a separately
  approved owner-context ceremony that decrypts and re-encrypts in memory on RUNA-CONTROL. Legacy
  `store-key.dpapi` and other DPAPI ciphertext are never copied as migration material.
- Target key wrapping/re-enrollment and recovery must be approved before a real import. Gate 5 may
  replace the wrapper or key-custody implementation without changing the product record contract.
- No plaintext sensitive field, migration key, or decrypted envelope may enter Git, terminal output,
  telemetry, Qdrant, fixtures, or the migration ledger.

## Canonical logical records

### `runa_core.projects`

Relational fields: `project_id`, `participant_id`, `schema_version`, `project_type`, `status`,
`registered_at`, `updated_at`, `memory_enabled`, `private_payload_envelope`, `payload_hmac`.

Rules:

- status is `managed` or `archived`; migration cannot invent `active`;
- archived projects cannot have memory enabled;
- source references are metadata only and grant no read access;
- access flags or source pointers that imply approval are rejected;
- the legacy id is preserved exactly after safe-id validation; and
- deleting a project removes its project-memory content. Chat reassignment is reconciled explicitly.

### `runa_core.chats`

Relational fields: `chat_id`, `participant_id`, nullable `project_id`, nullable
`parent_chat_id`, nullable `branch_from_turn`, `archived`, `unread`, `created_at`, `updated_at`,
`title_envelope`, `title_hmac`.

Rules:

- unassigned chats remain valid;
- `parent_chat_id` is provenance, not a foreign-key dependency, because branches remain valid after a
  parent is deleted;
- project assignment is grouping only and never grants source access;
- anonymous/unverified conversations are not migrated because they were never durable authority; and
- archive, unread, ordering, and branch values are preserved without normalization that changes
  meaning.

### `runa_core.chat_turns`

Relational fields: `chat_id`, `turn_ordinal`, `occurred_at`, `route`, nullable
`origin_request_id`, `content_envelope`, `content_hmac`; primary key `(chat_id, turn_ordinal)`.

Rules:

- ordinal order is authoritative;
- migrated turns receive no invented model identity or approval state;
- user and assistant text remain one authenticated private payload preserving exact strings after JSON
  decoding; and
- duplicate import of the same source digest is idempotent, while reuse of a source key with changed
  content is a conflict that stops the run.

### `runa_core.project_memory`

Relational fields: `memory_id`, `participant_id`, `project_id`, `created_at`, `scope`, `source`,
`private_payload_envelope`, `payload_hmac`.

Rules:

- only the `project-memory` tier is in Gate 4A;
- every record requires an existing managed or archived project and exact participant scope;
- raw transcripts, diagnostic logs, secrets, API keys, and tokens remain prohibited;
- migration preserves steward-directed provenance and does not promote memory into approved knowledge;
  and
- a project with memory disabled may retain historical memory records, but those records are excluded
  from context until memory is deliberately enabled on a managed project.

### `runa_migration.runs` and `runa_migration.items`

Run records contain: run id, domain/version, source and target commit, source snapshot digest, mode
(`synthetic`, `inventory`, `protected-rehearsal`, or `cutover`), start/end, status, aggregate counts,
and verifier result.

Item records contain: run id, source-kind, a one-way digest of the source locator, source content
HMAC, target record id, target HMAC, disposition, and timestamp. The HMAC/reconciliation key remains
outside PostgreSQL. Item records contain no source path or private content. A content-free tombstone
records a source record that disappeared between approved snapshots so deleted content cannot be
restored accidentally.

## Legacy mapping

| Legacy record | Target | Required preservation |
|---|---|---|
| `runa-chat-store/v1` catalog entry | `runa_core.chats` | id, title, project, parent/branch provenance, turn count, archive/unread, timestamps |
| `runa-chat-store/v1` transcript turn | `runa_core.chat_turns` | exact order, time, route, user and assistant text |
| `runa-project-store/v1` project | `runa_core.projects` | identity, type, status, pathways, reference-only sources, policies, timestamps |
| `memory/projects/<id>/*.json` project-memory record | `runa_core.project_memory` | tier, scope, summary, source, project, metadata, created time |
| legacy chat/project store keys and DPAPI envelopes | no direct target | never copied; owner-context decrypt/re-encrypt only after approval |
| session-only/anonymous chat | no target | remains ephemeral and is not inferred from absence |
| search/index artifacts | no Gate 4A target | rebuilt later only if separately approved |

## Legacy-authority disposition

Gate 4A does not delete or rewrite legacy data. A protected rehearsal imports into an isolated target
schema and proves the legacy adapter can be selected again without mutation. At Gate 6, a final
read-freeze/delta plan must explicitly decide the maximum data-loss window and backup retention.
Pending approvals, learning candidates, approved lessons, settings, credentials, identity material,
action receipts, and E3/E4/E5 stores are outside this contract.
