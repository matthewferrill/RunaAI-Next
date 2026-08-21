# Owner-context aggregate inventory contract

Status: owner execution passed on 2026-08-21; protected value was not retained

## Preconditions for a later run

The runner must execute locally on Runa-Control under Matthew's owner identity. Before unsealing any
credential or opening any store it must verify the exact expected commit, a clean tracked worktree,
the selected source pins in `SOURCE-PINS.json`, and the named protected roots. Any mismatch stops
before DPAPI or store access.

## Named read-only roots

- E6 journal: `.runaai-local/state/learning/event-journal-v1`
- E6 credential: `.runaai-local/state/learning/learning-center-v1/journal-credential.json`
- E3 inbox: `.runaai-local/state/learning/inbox-v1`
- E4 review: `.runaai-local/state/learning/review-v1`
- E5 activation grants: `.runaai-local/state/learning/activation-v1`
- device vault: `.runaai-local/state/learning/device-vault-v1`

DPAPI material, device-vault material, passphrases, ciphertext, and protected files must never be
copied or included in output. Decryption is memory-only. The runner performs no repair, compaction,
export, conversion, initialization, lock-file creation, or target write.

## Allowlisted output

Output may include only source commit/pin status; store presence; counts by entry kind, event type,
destination, scope, resolved lifecycle state, and resolved approval state; byte/count
ceilings; unreadable, integrity, chain, and unresolved-lineage counts; aggregate E3/E4/E5/vault
presence and counts; deterministic-second-pass status; and a fixed `disallowedFieldsEmitted: false`.

The existing safe journal API does not expose approval action payloads without returning protected
records. Gate 4B-I therefore reports entry-kind totals and resolved approval states, explicitly marks
action counts unavailable, and does not invent them. A later protected rehearsal can validate exact
approval actions while building the encrypted target snapshot in memory.

Output must not include protected content, paths, filenames, ids, source locators, lessons, statements,
tasks, evidence, rationale, outcomes, ciphertext, key material, passphrases, credentials, entry digests,
or record-level error detail.

## Gate

Gate 4B-I was explicitly approved on 2026-08-21. The runner may execute once on Control under the
preconditions above. That approval does not authorize export, migration, a target database, rehearsal,
or cutover.
