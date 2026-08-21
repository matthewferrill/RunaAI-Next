# Gate 4D — selected setting compatibility

Gate 4D selected core is deliberately small. The legacy settings registry is descriptive taxonomy,
not a database of nineteen persisted product settings. The only allowlisted persisted value is
`defaultIntelligenceLevel`, with Low, Medium, High, and a safe Medium default. Gate 2 and Gate 3
already implement that contract on the selected PostgreSQL/governed-action boundary.

`settings-migration.mjs` is a synthetic compatibility rehearsal. It proves participant binding,
exact mapping, safe fallback, idempotency, changed-input refusal, transaction-style failure recovery,
and Gate-4D-only rollback. It does not open the legacy settings path or import a real value.

## Disposition

| Legacy surface | Decision |
|---|---|
| `defaultIntelligenceLevel` contract | Preserve unchanged through Gate 2/3 |
| Explicit saved value | Adapt/port later as one participant-bound row |
| Settings JSON store | Replace with selected PostgreSQL authority |
| Nineteen-category registry | Defer as possible UX taxonomy; migrate no records |
| Provider governance and truthful status | Preserve behavior |
| Direct LM Studio mechanics | Replace with the selected AI SDK/provider boundary |
| Hard-coded provider catalog and placeholder cards | Retire from selected core |
| Gemini settings, model selection, and credential | Defer; credential is never migrated |
| Tracked endpoint/model defaults | Retire as migration input |
| Machine-local runtime configuration | Recreate during Gate 5 operations |
| Residency/profile scheduler | Redesign later; legacy implementation is incomplete |
| System identity profile | Preserve outside Gate 4D answer/system-profile work |
| Appearance and project-profile catalogs | Defer with their future UI decisions |
| Household identity, DPAPI, Windows Hello, and device vault | Gate 5 security boundary |

The protected comparison/import is deferred until the target primary-steward participant identity
exists. A later bounded owner campaign may read only the allowlisted effective setting and retain only
parity/unchanged/cleanup booleans. It must not open Gemini credentials, provider settings, identity,
learning, or device-vault paths.

Run `npm run test:gate4d`.
