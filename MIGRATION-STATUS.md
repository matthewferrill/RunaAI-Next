# RunaAI migration status

Status date: 2026-08-21. This is the living migration handoff for RunaAI-Next. Update it in the same
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
- GitHub branch protection is active on `main` and `runa2/integration`: pull requests and resolved
  conversations are required; stale reviews are dismissed; admins are included; force-pushes and
  deletion are blocked. Required status checks remain unset until a real CI check exists.
- `main` remains at the exact RunaLab completion baseline. `runa2/integration` contains the accepted
  bootstrap, Gate 0 contract freeze, and Gate 1 implementation.
- The completed laboratory evidence, seals, probes, stack bakeoff, model findings, architecture
  assessment, and conditional estimates are inherited.
- Gate 1 contains an isolated synthetic-only implementation of the smallest ordinary read-only
  chat/research path. Its approved code-review remediation and refreshed evidence were accepted by the
  steward on 2026-08-21 and merged into `runa2/integration` as `7107ead`. It is development evidence,
  not an authority for production behavior.
- No protected RunaAI data has been opened, copied, converted, or migrated.
- No model has been downloaded.
- No persistent service, non-loopback listener, provider credential, production path, or spending has
  been activated. Gate 1 verification used only bounded disposable loopback child processes.
- No migration gate is approved merely by this bootstrap.
- Bootstrap documentation and clean-clone validation were reviewed and merged into
  `runa2/integration` as `94ba860`.
- Gate 0 contract/evidence freeze was approved by the steward on 2026-08-20 for integration through
  PR #2. The steward separately approved Gate 1 implementation on 2026-08-20.
- Gate 1 prerequisites are complete: exact Node 22.22.0 is installed and green, Node 22.23.2 is
  rejected by the sealed latency gate, and the low npm advisory has an explicit synthetic-slice-only
  disposition.
- Gate 1 implementation was explicitly approved and built on `runa2/gate-1-read-only-slice`. The
  remediated deterministic suite passes 24/24 and the disposable real-stack integration passes 25/25
  with clean shutdown. The full repository suite passes 38/38, 10/10 seals and all 12 pinned legacy
  suites remain green, and Qwen3 Coder passes 12/12 refreshed live synthetic acceptance runs. On 2026-08-20 the steward approved
  a Gate 1 scope amendment deferring Qwen3.6 deliberate review and the existing live BGE endpoint;
  neither is silently replaced or credited. The steward subsequently accepted the regenerated Gate 1
  evidence. Protected review then found total-deadline, concurrent-idempotency, and post-window-32
  reranker gaps. The steward approved the narrow remediation on 2026-08-21; it completed with green
  refreshed evidence on 2026-08-21, which the steward accepted the same day. The steward separately
  approved the protected merge, completed as `7107ead` on 2026-08-21. The source branch remains
  available.
- Gate 2 planning and implementation are isolated on `runa2/gate-2-read-only-continuity` from
  `7107ead`. The steward approved Gate 2A on 2026-08-21. The bounded synthetic implementation now
  passes all 34 frozen corpus cases and 21/21 disposable selected-stack integration checks with clean
  shutdown and Gate-2-only rollback. Gate 2 regression review exposed an intermittent Gate 1 Qdrant
  timeout-label race; the steward approved a narrow remediation on 2026-08-21. The refreshed Gate 1
  deterministic suite passes 26/26, Gate 1 integration passes 25/25, and full Gate 0 verification
  passes 48/48 plus 10/10 seals. Timeout and genuine dependency loss are now deterministically
  distinguished. The steward accepted Gate 2B evidence and separately approved Gate 2C on
  2026-08-21. The protected merge completed as `4c4767f`, preserving the reviewed Gate 2 commits and
  source branch. Live-model validation was not run and remains separately decision-gated.

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
| Bootstrap | Establish repository lineage, remotes, branches, instructions, and status | Complete | Reviewed and merged as `94ba860` |
| 0 | Freeze contracts, parity corpus, data inventory, redaction policy, and green thresholds | Complete | Approved by steward 2026-08-20; PR #2 accepted for integration |
| 1 | Smallest disposable read-only chat/research slice | Complete; accepted and merged as `7107ead` | Complete |
| 2 | All three read-only answer lanes plus chat/project/settings continuity | Complete; evidence accepted and merged as `4c4767f` | Complete |
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

## Gate 0 evidence

`gate0/` freezes the proposed Gate 1 request/response contract, 18-case synthetic parity corpus,
seven exact deterministic sample outputs, legacy source/test hashes, 12-suite focused profile,
data-inventory command contract, trace allowlist, 24-hour synthetic retention, and hard green
thresholds. The Gate 0 verifier passes 14/14 inherited Node tests, 10/10 seal verifiers, and 12/12
focused legacy suites in the repository-owner context.

The full legacy portable verifier ran 128 applicable checks: 127 passed and one action-executor test
failed because the sandbox identity cannot read `C:\Users\matth\.config\git\ignore`; Git's warning
text entered an assertion that expected an empty change list. Owner DPAPI and configured-provider checks
were correctly skipped, and live approved-library provenance was explicitly not checked because no
application service was started. This is recorded as an environment limitation, not as guarded-lane
or Gate 1 parity evidence.

The Gate 1 prerequisite batch installed exact Node 22.22.0 and reran the full Gate 0 verifier green.
Node 22.23.2 was tested and rejected because its sealed stub average repeatedly measured 12.54–14.70
ms; installed Node 22.22.0 measured 0.66–0.78 ms. The repository now pins the accepted patch.

The npm result is two low dependency entries for one underlying uncontrolled-resource-consumption
advisory, `GHSA-866g-f22w-33x8` / `CVE-2026-8769`, through
`@mastra/core@1.59.0 -> @ai-sdk/provider-utils-v5@3.0.30`. GitHub lists no first patched version and
the newest published 3.x observed during disposition was 3.0.32, within the advertised affected range.
The risk is temporarily accepted only for Gate 1's disposable synthetic boundary with hard time,
byte, abort, and retry controls. It continues to block production and widened network/provider scope.
No dependency was changed during the prerequisite disposition. Full evidence is in
`gate0/GATE1-PREREQUISITES-2026-08-20.md`.

## Next decision

Gate 2 is accepted and merged into `runa2/integration`. Decide whether to prepare the Gate 3 scope,
corpus, rollback contract, and green criteria for one reversible governed idempotent action.

Gate 2 completion is not Gate 3 implementation or production approval. Qwen3.6 deliberate review,
the existing live BGE endpoint, protected data, persistent services, production routing, provider
reconfiguration, Gate 3 implementation, and production cutover remain unauthorized or deferred.
