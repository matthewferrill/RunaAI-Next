# RunaAI migration status

Status date: 2026-08-20. This is the living migration handoff for RunaAI-Next. Update it in the same
commit whenever a gate changes repository direction, authority, implementation status, safety
boundaries, verification state, or the next planned work.

## Repository identity and authority

| Repository or branch | Current role | Authority |
|---|---|---|
| Legacy `RunaAI` repository | Running implementation and behavior reference | Production, protected data, current behavior, and current operational status until cutover |
| `Runalab` repository | Completed stack-selection and evidence archive | Historical component evidence only; no new product implementation |
| RunaAI-Next `main` | Exact inherited RunaLab completion baseline | Stable integration target only after reviewed migration completion |
| RunaAI-Next `runa2/integration` | Accumulated accepted migration gates | Development integration; not production |
| Short-lived `runa2/*` gate branches | One approved, measured migration slice | Experimental until validated and approved |

The product name is RunaAI. `RunaAI-Next`, `runa2`, and similar labels are repository and branch
identifiers during migration, not product identities.

## Verified lineage

```text
RunaLab source commit: ec5e3466f6f937c8c610bdecf62a09c2491c7137
RunaAI legacy reference at bootstrap: 71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2
RunaAI-Next baseline tag: runalab-stack-baseline-2026-08-20
RunaAI-Next origin: https://github.com/matthewferrill/RunaAI-Next.git
```

`runalab` and `runaai-legacy` are configured as fetch-only remotes in the Omen bootstrap checkout.
Their histories are reference inputs. Never merge the unrelated legacy RunaAI history into this
repository and never push migration work into either source repository.

## Current status

- Repository lineage and source remotes are established.
- `main` and `runa2/integration` begin at the exact RunaLab completion commit.
- The completed laboratory evidence, seals, probes, stack bakeoff, model findings, architecture
  assessment, and conditional estimates are inherited.
- No RunaAI behavior has been ported into this repository.
- No protected RunaAI data has been opened, copied, converted, or migrated.
- No model has been downloaded.
- No persistent service, network listener, provider credential, production path, or spending has been
  activated.
- No migration gate is approved merely by this bootstrap.
- Bootstrap documentation and clean-clone validation are complete on `runa2/bootstrap` and ready for
  steward review before integration.

## Bootstrap findings

- The inherited Node suite passes **14/14** in the repository-owner context. The sandbox-only first run
  could not create `probes/results/_payloads` in the newly added checkout and reset its localhost stub;
  the exact owner-context rerun passed.
- All **10/10** current seal verifiers pass in this fresh Windows clone.
- Clean-clone validation found four seal verifiers hashing raw checkout bytes while the repository's
  existing `seal-file.mjs` helper canonicalized Git's LF/CRLF transport difference. The four verifiers
  now use that helper. No sealed preregistration, runner, result, seal hash, or adjudication changed.
- `npm ci --cache .npm-cache` installed the committed lockfile: 336 packages, one low-severity audit
  advisory, and an engine warning because installed `posthog-node@5.49.1` requests Node `^20.20.0` or
  `>=22.22.0` while Omen currently provides Node `22.21.0`. Do not run `npm audit fix` or change the
  runtime implicitly. Gate 0 must select a supported Node patch and explicitly disposition the advisory.

## Selected foundation

- Mastra plus AI SDK/OpenAI-compatible application/provider boundary;
- LangGraph JS with PostgreSQL checkpointing;
- PostgreSQL as authoritative records, idempotency, outbox, and postcondition store;
- Nomic embeddings, Qdrant derived vectors, and existing BGE with explicit overlapping windows;
- Caddy as outer transport and timeout boundary;
- OpenTelemetry with allowlisted/redacted attributes;
- deterministic application routing across the selected model roster; and
- Keycloak, OpenFGA, and one-time capabilities only after functional/data parity.

This list selects infrastructure. It does not replace Runa's identity, constitution, authority,
consent-first learning, typed knowledge, project/participant scope, provenance, honest uncertainty,
plain-language steward experience, or governed action pathway.

## Gate tracker

| Gate | Scope | Status | Approval required to start |
|---|---|---|---|
| Bootstrap | Establish repository lineage, remotes, branches, instructions, and status | In progress | Repository creation and bootstrap direction received |
| 0 | Freeze contracts, parity corpus, data inventory, redaction policy, and green thresholds | Not started | Explicit steward approval |
| 1 | Smallest disposable read-only chat/research slice | Not started | Gate 0 evidence accepted |
| 2 | All three read-only answer lanes plus chat/project/settings continuity | Not started | Gate 1 evidence accepted |
| 3 | One reversible governed idempotent action | Not started | Gate 2 parity accepted |
| 4 | Governed data migration, one domain at a time | Not started | Each domain and owner-context plan approved separately |
| 5 | Operations, private transport, authentication/authorization, recovery | Not started | Functional/data parity accepted |
| 6 | Selected-core production cutover and rollback window | Not started | Gates 0–5 accepted and maintenance window approved |
| 7 | Deferred extensions | Not started | New baseline and separate approval per extension group |

## Bootstrap validation

Before closing bootstrap:

1. Confirm `main`, `runa2/integration`, and the baseline tag resolve to `ec5e346` before documentation.
2. Confirm `runalab/main` resolves to `ec5e346` and `runaai-legacy/main` resolves to `71ce985`.
3. Confirm source remotes have disabled push URLs.
4. Run the inherited 14 Node tests and all 10 current seal verifiers. **Complete: 14/14 and 10/10.**
5. Run `git diff --check` for the bootstrap documentation. **Complete before staging.**
6. Stage explicit paths, commit on `runa2/bootstrap`, and push only to RunaAI-Next origin.
7. Review the bootstrap branch before merging it into `runa2/integration`.

## Next decision

After bootstrap is reviewed, decide whether to authorize Gate 0 only. Gate 0 is contract and evidence
freeze work; it is not permission to build Gate 1, touch protected data, start persistent services, or
change production.

The recommended first implementation decision remains Gate 1's smallest read-only chat/research slice,
but only after Gate 0 establishes its baseline, exact green thresholds, rollback, and representative
review set.
