# M1-S1 model-role contract

Scope: shared configuration selection only, not a model call, model qualification, executor, or release.
Baseline: `333912a72ee4252ff87805db4095c69b2abd8921`.
Roadmap revision: `2026-08-28.1`; retrieved digest:
`4b259abc878486b1a3543b12a0ea96850ad033fa8d7b0d1c70651c00057f4f1b`.
Affected capability boundaries: C01, C02, C04, C06, C12; all other roadmap work remains.

`model-roles.mjs` accepts either an exact legacy `{baseUrl, modelId}` provider or an explicit
`runaai-model-roles/v1` provider with all five `models` keys: `chat`, `research`, `code`, `review`,
and `agent`. Each explicit value is an independently assigned model ID or `null` (unavailable).
There is no candidate-ID allowlist: model-neutrality includes future compatible models.

Legacy chat/research/code keep the original model ID. Legacy review/agent remain unavailable rather
than silently acquiring capabilities. Configured roles select a provider only; they do not authorize
execution, enable a missing workflow, or change identity, data, or grants. Application policy must
choose the requested role; a model's description never determines it.

`resolveModelRoles(provider)` returns detached, deeply frozen normalized data and a `selectionMode`.
`resolveModelRole(provider, role)` returns frozen `{baseURL, modelId, role}` or a generic error with
`code` equal to `model-role-invalid` or `model-role-unavailable`. Both functions take raw provider
configuration; normalized output is not accepted as a new configuration because its extra
`selectionMode` property is deliberately rejected.

The exported `legacyModelProviderSchema` and `explicitModelRolesSchema` are strict Zod objects.
They reject missing/extra keys, unknown schema versions, invalid IDs and unsafe/ambiguous URLs.
Provider URLs must be HTTP(S) without userinfo, query, fragment, backslashes or whitespace. No URL
or model ID is trimmed or normalized; legacy values are unchanged. Historical versioned release
parsing remains with its own schema so historical config digests can still be reproduced.

Verification: `node --test gate7f/function-first/model-roles.test.mjs` passed 12/12 tests on Node
22.22.0. Coverage includes the three candidate IDs independently assigned, disabled roles, future IDs,
legacy value preservation, strict schema failures, role inference denial, safe URLs, bounded IDs,
mutation isolation and errors that never echo a potential secret. This uses no model, network,
service, protected data or production configuration. Root integration separately verifies release
compatibility and composition. Returning to the previous provider config is the configuration rollback;
this module itself has no persistent effects.
