# Gate 4C-2 protected aggregate comparison results

Status: passed on Control; accepted by the steward and merged into `runa2/integration` as `4ed6a52`

## Plain-language result

The new Runa 2.0 projection and legacy RunaAI independently reached the same answer from the complete
90-entry E6 journal: 53 lessons are currently active. They also agreed exactly on where those lessons
belong: 1 personal, 5 project, 16 capability, and 31 global. Neither side treated session,
evaluation, or training-candidate material as active approved knowledge.

This means the new projection can reconstruct the existing active-learning boundary without copying
or trusting a mutable legacy snapshot. It does not yet prove that those lessons improve answers; that
belongs to the separately approved or rejected answer-lane stage.

## Protected evidence

The comparison ran on `RUNA-CONTROL` as the owner-bound Matthew account against:

- legacy RunaAI `b4db04090d8f0df87234fab573b396e7824c5354`; and
- RunaAI-Next `fa13513af8f4b2aa4f93ba5578bb140f410a3dd5`.

Authority checks verified both exact commits, branches, tracked-clean state, and all accepted legacy
source pins before DPAPI or journal access. Two independent passes produced identical aggregate
results. The before/after protected boundary was unchanged.

| Comparison | Legacy | Gate 4C projection |
|---|---:|---:|
| Active lessons | 53 | 53 |
| Personal | 1 | 1 |
| Project | 5 | 5 |
| Capability | 16 | 16 |
| Global | 31 | 31 |
| Session | 0 | 0 |
| Evaluation | 0 | 0 |
| Training candidate | 0 | 0 |

The retained machine-readable evidence is
`gate4c/evidence/PROTECTED-COMPARISON-RESULTS-2026-08-21.json`.

## Verification

- Gate 4C-2 synthetic comparison checks: 6/6 passed on Omen and 6/6 passed on Control.
- Full Node suite: 152/152 passed on Omen.
- Protected aggregate comparison: passed twice with exact count and scope parity.
- Both Control repositories remained tracked-clean at their authorized commits.
- The temporary local copy of pinned `zod` 4.4.3 used because Control had no installed dependencies
  was removed after the run; no internet package installation was performed.

## Non-effects

No lesson text, exclusions, rationale, record identifiers, hashes, paths, ciphertext, or keys were
retained or printed. No target database, migrated copy, model context, answer lane, embedding,
reranker, Qdrant collection, network service, production route, or learning action was created or
activated. E3, E4, E5, and the device vault were not migrated or changed.

## Decision gate

The accepted merge includes only the comparison harness and aggregate evidence. It does not approve
answer-lane wiring, model-context activation, retained projection storage, Qdrant, embeddings,
reranking, or migration of any additional RunaAI subsystem.
