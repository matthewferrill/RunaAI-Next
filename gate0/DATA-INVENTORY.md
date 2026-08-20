# Data-inventory contract

Gate 0 freezes inventory semantics; it does not execute protected inventory. Every command below is
non-mutating by contract and must fail closed if it cannot prove that property.

## Command surface to implement before the applicable data gate

| Command contract | Context | Output | Earliest execution |
|---|---|---|---|
| `runa2 inventory repository --source legacy --commit <sha>` | Any clean clone | tracked paths, module/test counts, byte counts, SHA-256; no ignored files | Gate 0/1 |
| `runa2 inventory domain --domain <name> --metadata-only` | Owner context for protected domains | schema version, record count, min/max logical sequence, envelope digest, authority state; no content or ciphertext | Gate 4 plan review |
| `runa2 inventory scope --domain <name> --counts-only` | Owner context | counts and digests grouped by typed participant/project scope; identifiers HMAC-pseudonymized | Gate 4 rehearsal |
| `runa2 inventory derived --kind sections,vectors,reranker` | Authorized source-truth context | source count, derived count, source revision/digest, stale/orphan count | Gate 4 rehearsal |
| `runa2 inventory reconciliation --domain <name> --before <file> --after <file>` | Isolated migration harness | count/digest differences, missing/extra sequences, scope/lifecycle violations | Gate 4 validation |

The executable must emit JSON, include its schema version and source commit, perform no repair, and
refuse raw record output. Inventory files containing protected metadata stay outside Git and are
reviewed through an owner-approved evidence path.

## Domain authority and treatment

| Domain | Current authority | Sensitivity/coupling | Gate 1 treatment | Later requirement |
|---|---|---|---|---|
| H2 identity/session registry | legacy H2 plus device-bound ceremonies | DPAPI/Windows Hello and principal identity | do not open; synthetic principal only | fresh enrollment/export plan, owner ceremony, rollback |
| learning journals/inbox/grants/review | encrypted legacy stores | approval sequence, lifecycle, correction, revocation | do not open | metadata inventory per generation; preserve envelopes and order |
| approved curricula/lessons | legacy governed library | participant/project/capability scope and provenance | synthetic fixtures only | migrate complete effective envelopes; compare effective set |
| chats/projects/memory | legacy encrypted stores | ordering, branch ancestry, deletion and isolation | disposable new records only | per-scope counts/digests; dual-read rehearsal; deletion propagation |
| proposals/action receipts | legacy action stores | approval, stale-state hash, exact effect receipt | excluded; effects must be empty | preserve completed audit; pending approvals require reapproval |
| sources/sections | legacy source truth and derived local index | scope, revocation, content digests | synthetic source truth in PostgreSQL | migrate source truth only and reconcile lifecycle |
| embeddings/vectors/reranker artifacts | derived | stale/revoked leakage | rebuild from synthetic source truth | rebuild; never designate authoritative |
| settings/provider metadata | legacy allowlisted settings | some values are machine-specific | explicit synthetic config only | inventory allowlist; reconfigure per environment |
| credentials/secrets | OS/provider protected | non-portable and secret | prohibited | re-enter/reseal; never inventory values |
| diagnostics/traces | legacy logs | may contain prompts, paths and identifiers | do not migrate | apply allowlist/redaction; expire separately from audit |

## Protected-state rules

- Never copy ciphertext as migration evidence.
- Never infer approval, identity, scope, or current authority from file presence.
- Never run protected inventory from an agent, CI, network logon, or non-owner context.
- Inventory counts and digests do not authorize conversion.
- Each domain needs separate steward approval, backup/restore evidence, maximum rollback loss, and an
  old-adapter retention window before migration.
