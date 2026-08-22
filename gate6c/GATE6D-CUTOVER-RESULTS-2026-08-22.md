# Gate 6D selected-core cutover results

Status: complete and closed; RunaAI-Next is authoritative for the selected core

## Outcome

The exact Gate 6D release was promoted on Control after a temporary whole-legacy-state write freeze,
four-domain import, and zero-difference reconciliation. One fresh owner passkey session then passed
the governed live validation. The candidate remained healthy for the complete 60-minute observation
window, final reconciliation passed, cutover closed, and the legacy write freeze was released.

This is selected-core production, not full legacy parity. The promoted boundary contains the three
read-only answer lanes, project/chat continuity, the complete E6 learning journal and scoped approved-
knowledge projection, the selected setting, one governed setting action and rollback, and the Gate 5
identity/authorization boundary. E3 remains deferred; E4 and device-vault ciphertext were not copied;
E5 is absent; the separate approved-knowledge vector index, wider legacy surfaces, and other Gate 7
extensions remain outside production authority.

## Exact production release

- Release: `runaai-next-gate6d-promotion-2026-08-22-a886754`
- Commit: `a8867543f914cabd997f161950016723355138d2`
- Artifact digest: `2e1f909941f3021530c83c3d288953f0d3144b8603eb006f8502b32022905235`
  across 29,434 files
- Configuration digest: `d1a638635fd460e4b45c7597b2f7f3216c7a9e8bf73bf003c54918a1a5ce162b`
- Manifest digest: `93f2c9b3ddecec5f552308f973abd10005b9abd47e822baed7dc1427c8fc7b3b`
- Authority generation: `runaai-next:control-candidate`
- Readiness authority: `active`
- Cutover phase: `closed`

## Protected-domain reconciliation

The owner-context import opened only the four approved domains. It retained no protected value in
repository evidence and did not open any deferred store.

| Domain | Exact retained count |
|---|---:|
| Project/chat records | 102 |
| E6 learning journal entries | 90 |
| Selected setting | 1 |
| Selected action receipts | 0 |
| Active approved-knowledge lessons derived from E6 | 53 |

Source and target logical reconciliation was exact before promotion and again before close. The source
checkout remained unmodified. Backup generation `20260822T1843281729591Z` was the protected recovery
boundary for the completed window.

## Live validation and observation

- Fresh owner passkey session: verified.
- Representative read-only lanes: 3/3 passed.
- Governed setting receipts: 2, covering the change and governed rollback.
- Original selected setting restored: yes.
- Target-session revocation: passed.
- Observation: 120/120 health samples across 60 minutes.
- Freeze verification during observation: 14 successful checks.
- Final reconciliation: exact.
- Legacy rollback runtime: healthy.
- Legacy branch/commit: clean `main` at
  `b4db04090d8f0df87234fab573b396e7824c5354`.
- Freeze: `released`, `selectedWritesFrozen=false`, reason `gate6-closed`.

## Private TLS result

The exact Caddy private root is trusted only in `RUNA-CONTROL\Matthew`'s `CurrentUser\Root` store.
Windows-native certificate validation reaches `https://192.168.50.169:9761/` with HTTP 200 and no
certificate-validation bypass. The trusted root has thumbprint
`7FA7C30BFD47DD04D74262F784605C1E6733AB53` and SHA-256
`b62e7098f5ea65486f1d251e3e8780ac6966f4e4b9df46889a6be9da5e6ab189`.

Windows `curl.exe` is not the canonical verifier for this private CA because its revocation check
returns `CRYPT_E_NO_REVOCATION_CHECK` when the private root has no revocation endpoint. The production
preflight now uses the Windows certificate chain used by the browser and explicitly forbids
`-k`, `--insecure`, `SkipCertificateCheck`, or a custom validation callback.

## Fail-closed corrections exercised during the window

- A missing legacy setting source was mapped to the documented `Medium` default; no value was
  invented from private content.
- The owner ceremony was transactionally rebound to the exact cutover/release identities while the
  prior completed evidence remained retained.
- The first live authorization validation rejected an invalid OpenFGA object representation and
  absent tuples. Automatic rollback restored legacy authority and removed imported target state.
  The project object was then percent-encoded as `project:runa%3Apersonal`, and the exact four owner
  relationships were installed before the successful retry.
- TLS preflight was hardened after it was found to assert private-TLS readiness without strict trust
  validation. The user-scoped root installation and Windows-native HTTPS validation now make that
  boundary executable and fail closed.

## Verification

- Full Node suite: **298/298 passed**.
- Gate 6B and Gate 6C focused suites: **65/65 passed**.
- All affected PowerShell files parse successfully.
- Final live readback: cutover `closed`, target authority `active`, protected data imported, production
  traffic changed, legacy tracked worktree clean, one exact user-scoped trusted root, and HTTPS 200
  with no validation bypass.
- Retained machine-readable evidence:
  `gate6c/evidence/CONTROL-GATE6D-CUTOVER-RESULTS.json`.

## Current operating boundary

RunaAI-Next is now the production authority for the selected core at
`https://192.168.50.169:9761/`. That browser root is the governed aggregate status surface; the owner
passkey page is the bounded Gate 6D validation surface. The selected-core application routes are live,
but Gate 6 does not include a finished conversational/steward UI or claim that ordinary browser chat
testing is available yet.

Legacy RunaAI remains intact and healthy as the verified rollback and behavior-reference system; it is
no longer the write authority for the selected promoted domains. No Gate 7 extension is implied by
this close.
