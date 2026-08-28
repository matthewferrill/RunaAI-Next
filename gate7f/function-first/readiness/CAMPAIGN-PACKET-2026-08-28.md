# Prospective campaign packet — not executed

Operator source baseline: `dd2caaa`. All packets were created before any campaign model load.
The common exact-byte hardware plan is
`evidence/20260828-campaign-hardware-plan-r1.json`, SHA256
`d4e0d0b96ff4d1c15fb05801dff5c9b0f166c1c308cbbbf4e1a5eeed404e6c80`.
This value binds the prospective campaign runtime seal's `hardwareTelemetryPlanSha256`.

Separate create-only candidate packages:

| Lease ID | Exact `seal.json` SHA256 |
|---|---|
| `20260828-campaign-gemma-r1` | `3ac3526b578dd6e6a12ce611c4c06b03793e00483e62fe0d19e2cf0c694ee616` |
| `20260828-campaign-coder-r1` | `5bfc173f3b3570ee20f267a7a5d75bcf2ebe9d9ccaf7036fe17c26ef6973e803` |
| `20260828-campaign-qwen36-r1` | `973115fea02eb3fe0f1d3fcb105c95b2ac0ff935036ff80097ab5f5f9a713250` |

Each package is retained under `evidence/<lease ID>/`, including exact source bytes and transport
packet. The shared orchestration sources are retained under `evidence/20260828-campaign-operator-r1/`.
Existing `evidence/** -text` attributes protect bytes from Windows checkout normalization. Use these
sealed bytes, not an implicitly normalized replacement from another checkout. They are synthetic
prospective configuration, not evidence that execution occurred or that any function passed.

The operator retains exclusive Home load/unload/power ownership. Root retains inference ownership.
No upload or dispatch is performed until the complete functional driver, controls, browser hooks,
and source/runtime seal are finalized. This packet neither changes production nor qualifies M1.

Validation: 30 existing readiness/lease tests and all three changed PowerShell parsers passed before
the source baseline commit. Five additional immutable-packet tests verify common-plan bytes,
retained orchestration bytes, and all three transfer/config/source/policy bindings without Home calls.
