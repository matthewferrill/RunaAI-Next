# Gate 1 prerequisite evidence — 2026-08-20

This batch satisfies the two prerequisites recorded after Gate 0. It does not start Gate 1, add a
service, touch protected data, contact a model, activate a listener, or change production RunaAI.

## Accepted Node runtime

Accepted for this repository: **Node 22.22.0**, exact patch.

- Official Windows x64 MSI SHA-256:
  `b10f88c6ded24ca487839b3eccb8870a08d7f9fc2b9bb3b463fc72a3a40bcdb1`.
- MSI installation completed with Windows Installer status 0.
- npm version installed with it: 10.9.4.
- The five pre-existing user-global CLI packages remained present after the controlled replacement.
- `npm ci --cache .npm-cache` installed the committed graph without an engine warning.
- The full Gate 0 verifier passed: 14/14 inherited Node tests, 10/10 seal verifiers, and 12/12
  focused legacy suites. The sealed stub completion check averaged 0.78 ms over 50 calls.

Node 22.23.2 was checksum-verified and tested first, then rejected. Functional checks passed, but the
sealed stub completion check repeatedly averaged 12.54–14.70 ms and failed its single-digit threshold.
A checksum-verified portable Node 22.22.0 run restored the result to 0.68 ms before the installed
runtime was changed. The controlled MSI rollback to 22.22.0 then produced 0.66 ms in the isolated
test and 0.78 ms in the full verifier. The repository therefore pins 22.22.0 rather than allowing an
untested Node 22 patch range.

## npm advisory disposition

Current audit result: two low-severity entries, zero moderate/high/critical. Both entries describe one
underlying advisory propagated through the dependency graph:

```text
GHSA-866g-f22w-33x8 / CVE-2026-8769
@ai-sdk/provider-utils uncontrolled resource consumption
Installed vulnerable alias: @ai-sdk/provider-utils-v5@3.0.30
Path: @mastra/core@1.59.0 -> @ai-sdk/provider-utils-v5
Advertised vulnerable range: <=3.0.97
GitHub first patched version: none
Newest published 3.x observed during disposition: 3.0.32
CVSS v3.1: 4.3 low; CVSS v4.0: 2.1
```

`npm audit fix --dry-run` suggested moving `@mastra/core` from 1.59.0 to 1.60.0, but the published
1.60.0 dependency map still pins the same `@ai-sdk/provider-utils-v5@3.0.30`; that change does not
remove the vulnerable component. No dependency was changed and `npm audit fix` was not run.

### Decision

Temporarily accept this low availability risk for Gate 1's disposable synthetic slice only, subject
to all of these controls:

- deterministic stub or explicitly trusted existing private provider endpoint only;
- no public listener, external provider, real conversation, or untrusted remote provider response;
- hard request deadline, abort signal, response-byte ceiling, evidence-byte ceiling, and bounded retry;
- dependency-loss and oversized-response cases must fail visibly without retry amplification;
- no production or Gate 5 promotion while the advisory remains unresolved; and
- re-audit on every lockfile change and before any network/security/release gate. Adopt a patched 3.x
  release when one exists and passes the sealed suite.

This is not a blanket vulnerability waiver. Any expansion beyond the synthetic Gate 1 boundary
invalidates the acceptance and requires a new decision.

## Rollback

The verified Node 22.23.2 installer remains temporary evidence only and is not accepted for this
repository. If Node 22.22.0 later regresses, reinstall the prior managed runtime only after reproducing
its sealed evidence; do not loosen or rewrite the seal to accommodate a runtime.
