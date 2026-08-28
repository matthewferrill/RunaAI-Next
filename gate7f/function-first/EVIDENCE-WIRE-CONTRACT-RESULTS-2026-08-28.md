# Explicit evidence-output wire: local integration results

Prospective criteria: `EVIDENCE-WIRE-CONTRACT-CRITERIA-2026-08-28.md`, committed
as `0633544` before this implementation. The frozen three-model campaign remains
unchanged; these are application integration results, not model qualification.

## Observations and correction

The actual installed Mastra/AI SDK HTTP probe confirms the old evidence request
carried no native `response_format`. The corrected request carries one static
application-owned strict JSON schema for answer and citations. This uses direct
generation, not a second formatter model. The SDK adds the draft-07 `$schema`
field; the shared contract explicitly includes that actual wire field, rather
than accepting arbitrary schema differences at the Home guard.

The before and after probes each made exactly one HTTP call on 429 and 500.
Therefore this work does **not** establish a previous hidden-retry defect.
Explicit `modelSettings.maxRetries: 0` reinforces the required boundary.

The application still independently checks output shape, nonempty answer,
provider identity, finish reason, byte limit and deadline. Existing higher-layer
citation/source/section/scope checks remain authoritative. Well-formed JSON is
not evidence of truth or permission. Plain-text chat and Code drafting remain
plain text, and the existing standalone Code verifier is unchanged.

Home accepts only the exact static schema/wrapper; weakening strictness or adding
other schema/tool/stream fields is denied before model admission. Its immutable
package now includes the shared root module. The Windows installer admits that
one exact additional filename, not arbitrary parent-directory modules.

## Executed checks

All below used actual Omen Node `v22.22.0`, installed SDK dependencies, disposable
HTTP listeners and synthetic responses. No actual large model or Home listener
was called, no dependency upgraded, and no production setting changed.

| Check | Observed result |
| --- | --- |
| Actual Mastra/provider/proxy tests, existing Gate1/role tests | 79/79 pass, zero skipped |
| Full Home-runtime local suite | 162/162 pass, zero skipped |
| Three candidate profiles, evidence/plain/evidence and concurrent isolation | Exact native format only on evidence requests; model/limits/reasoning preserved |
| Malformed, truncated, extra-field, invalid citation, empty, mismatched-model outputs | Failure retained, no repair/fallback success |
| Actual 429/500 and delayed cancellation | One HTTP request; bounded failure, no retry |
| Actual Windows PowerShell filename validation | Exact shared module allowed; alternate names/case/traversal/absolute paths refused |

The first expanded 79-test run was 78/79 because its new PowerShell test omitted
process-scoped `-ExecutionPolicy Bypass`. That raw failure remains retained. The
test invocation was corrected; no machine execution policy was changed. The
unchanged production installer still uses its established execution boundary.

The retention manifest and all six raw probes/TAP files are under
`acceptance/evidence/evidence-wire-20260828/`. Byte-pinned receipts and source
files have scoped `-text` attributes to preserve actual observed bytes.

- Final actual wire JSON SHA-256:
  `2b83f61cb6579f824871608c26a0a20a5cbc9abad24e8168e1c4e8ac19066a55`.
- Final 79-test TAP SHA-256:
  `efe53e2a1b44b9ffd3e0277e27fa22f9670c5ed442c0c672f2dd72ef75133e87`.
- Native 162-test TAP SHA-256:
  `e0e7910930239867d282d6ea0d1734a705b4db5d0b76333ca2fa4c09bc4cd530`.

Reproduction commands:

```powershell
node --test gate7f/function-first/evidence-output.test.mjs gate1/mastra-provider.test.mjs gate7f/function-first/provider-transport.test.mjs gate1/gate1.test.mjs gate6b/model-role-providers.test.mjs
node --test gate7f/function-first/home-runtime/*.test.mjs
```

## Remaining qualification, not a permission gate

Independent review, a new exact-source Caddy/TLS wire proof, and a fresh matched
three-model run must qualify this shared correction together with source-byte
preservation and whole-plan preflight. The old Caddy proof remains valid only
for its own pinned source. Runtime support and answer quality on real models
remain unproved by these synthetic HTTP fixtures. No winner or readiness claim
is made, and the baseline grades, limits and denominators are not rewritten.
