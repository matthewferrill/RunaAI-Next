# M1-S1: independent model roles

Status: implementation in progress, 2026-08-28. Read `../../PRODUCT-ROADMAP.md` and
`../../roadmap/CURRENT-SLICE.md` before choosing subsequent work.

## Acceptance fixed before wiring

- Keep the v1 single-model release configuration and release-manifest digest unchanged for the same
  input. Its chat, research and code roles continue using that model; it does not enable review/agent.
- Add an explicit v2 release configuration with five required role selections: chat, research, code,
  review and agent. Each selection is an exact model ID or null (disabled). No implicit fallback or
  model-authored selection. At least one of the existing chat/research/code routes must be configured.
- Route the existing application answer service through those selections. A disabled role gives a
  typed unavailable result, invokes no model, and saves no falsely completed turn. Configuring review
  or agent only records a selection; it does not create a route, grant tools or authorize effects.
- Bind every role selection into the immutable release manifest and reject a manifest/config model
  mismatch before loading secrets, creating stores or serving requests. Runtime status reports the
  exact selections, not a misleading single model. A configuration entry is not runtime qualification.
- Preserve existing prompt, grounding, actor/project scope, Code verification and authority checks.
  Wrong-model responses remain rejected by the real provider adapter. No production configuration,
  host residency, service or protected data changes in this local implementation.
- Test strict schemas, v1 digest compatibility, independent routing, disabled/wrong models,
  configuration/manifest drift, scoped research/history and release packaging compatibility. Test
  doubles prove deterministic plumbing only; no three-model, PostgreSQL durability, real project
  execution, deployment or whole-M1 completion claim follows from them.

## Compatibility and rollback

The new parser accepts both versions; old immutable releases do not accept v2. A future deployment
must keep its exact predecessor configuration and manifest with the predecessor executable. Do not
pass a v2 configuration to the old executable or overwrite its files. No database migration is needed
for role selection. Reverting the candidate route is distinct from reverting protected/user data.

Intentional safety exception: the historical v1 parser still reproduces old values/digests, but a new
successor cannot instantiate a provider URL containing userinfo, any query string or fragment, or ambiguous
syntax, or a whitespace/control-bearing model ID. Those previously parser-accepted forms are rejected,
not silently rewritten. Ordinary exact v1 endpoint/model values remain compatible. This does not modify
an existing immutable release; predecessor rollback still uses that predecessor's own parser and files.

The first version uses one approved OpenAI-compatible endpoint with independent model IDs. Separate
endpoints, credentials, role-specific runtime budgets and richer provider dialects remain subsequent
adapter work. The three candidate roster remains intact; this contract does not select a winner.
The existing `/models` health probe measures endpoint liveness only, not whether each selected model is
loaded or can answer. The v2 runtime status is configuration identity, not per-role readiness. A future
v2 deployment still requires exact live requests for each enabled role plus the normal release checks.

## Evidence

Implementation and validation results are retained in `M1-S1-RESULTS-2026-08-28.md`.
The existing frozen Gate 7F evaluations are historical and are not edited or resealed for this wiring.
