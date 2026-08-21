# Gate 0 — contract and evidence freeze

Gate 0 prepares reviewable evidence for the first disposable RunaAI migration slice. It does not
implement Gate 1, open a protected store, copy production data, start a service, contact a model,
or change the legacy runtime.

## Frozen decision

The proposed Gate 1 slice is one synthetic, read-only chat/research path. A trusted caller supplies
an explicit synthetic participant, project, thread, and request envelope. The new path may write only
disposable RunaAI-Next thread/checkpoint records needed to prove restart and duplicate behavior. It
may not read or write any legacy RunaAI store.

The slice covers ordinary general chat plus bounded local research. The guarded/local and explicit
workspace-comprehension lanes are baselined in Gate 0 because any shared answer component must keep
their invariants, but their end-to-end port is Gate 2 work.

## Evidence set

- `MINIMUM-SLICE-CONTRACT.md` freezes the Gate 1 boundary and response contract.
- `PARITY-CORPUS.json` freezes representative inputs and machine-checkable expectations.
- `SAMPLE-OUTPUTS.json` records exact deterministic legacy inputs and outputs at the pinned commit.
- `SOURCE-PINS.json` pins the legacy source and focused tests by commit and SHA-256.
- `VERIFIER-PROFILE.json` defines the executable Gate 0 verification profile.
- `BASELINE-RESULTS.json` records the current live baseline and known failures.
- `DATA-INVENTORY.md` freezes non-mutating inventory command semantics without running protected
  inventory.
- `TRACE-REDACTION-POLICY.md` defines the Gate 1 telemetry allowlist and retention.
- `GREEN-THRESHOLDS.md` defines the conditions for accepting Gate 0 and later Gate 1 evidence.
- `GATE1-SCOPE-AMENDMENT-2026-08-20.md` records the steward-approved narrowing made after the first
  Gate 1 model evidence, without rewriting the original freeze or crediting deferred roles.
- `verify-gate0.mjs` validates this freeze and, when a legacy checkout is supplied, its pinned files
  and focused tests.

## Run the verifier

Contract and inherited RunaLab evidence only:

```powershell
npm.cmd run verify:gate0
```

Also verify the pinned legacy checkout without opening protected data:

```powershell
$env:RUNAAI_LEGACY_CHECKOUT='D:\AI\Projects\RunaAI'
npm.cmd run verify:gate0
Remove-Item Env:RUNAAI_LEGACY_CHECKOUT
```

The second form checks the exact legacy commit, verifies every pinned SHA-256, and runs the 12 focused
portable suites. It does not run the owner or operator profiles.

## Approval boundary

Gate 0 is ready for steward review when the verifier passes and the known limitations in
`BASELINE-RESULTS.json` remain explicit. Approval of Gate 0 authorizes only a separate Gate 1 branch.
It does not authorize Gate 1 implementation until the supported Node patch and dependency-advisory
entry criteria in `GREEN-THRESHOLDS.md` are satisfied.
