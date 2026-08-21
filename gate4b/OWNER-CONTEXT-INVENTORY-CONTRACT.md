# Owner-context aggregate inventory contract

Status: contract and synthetic aggregator only; no protected runner and no owner-context execution

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
destination, scope, lifecycle action, and approval action; earliest/latest timestamps; byte/count
ceilings; unreadable, integrity, chain, and unresolved-lineage counts; aggregate E3/E4/E5/vault
presence and counts; deterministic-second-pass status; and a fixed `disallowedFieldsEmitted: false`.

Output must not include protected content, paths, filenames, ids, source locators, lessons, statements,
tasks, evidence, rationale, outcomes, ciphertext, key material, passphrases, credentials, entry digests,
or record-level error detail.

## Gate

Implementing the Control adapter and running this inventory requires explicit Gate 4B-I approval.
The current branch intentionally cannot open a protected store.
