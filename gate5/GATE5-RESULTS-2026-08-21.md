# Gate 5 operations and security results

Status: implementation and local review complete; branch ready for steward review

## Plain-language result

Gate 5 keeps Runa's rules and replaces the machine-bound plumbing around them:

- Runa's six household roles, twenty recognized actions, minor protections, fresh-confirmation rules,
  unverified ephemeral-chat boundary, and intentionally unavailable succession action remain product
  policy. A Keycloak token role cannot promote someone inside Runa, and OpenFGA cannot override a
  Runa policy denial.
- Keycloak proves who authenticated; PostgreSQL binds that external subject to a stable Runa
  principal; OpenFGA confirms the exact relationship. Protected and effect-bearing operations require
  live token introspection so logout/revocation takes effect immediately.
- One-time capabilities bind the exact actor, action, resource, arguments, approval, expiry, and
  retry key. Revocation, changed input, expiry, concurrent reuse, and dependency uncertainty deny.
- Release preflight requires private TLS outside loopback, bounded bodies/deadlines, exact provider
  model identity, zero proxy retries on effect paths, secret references instead of values, and
  allowlisted keyed telemetry.
- Authoritative backup is authenticated and encrypted. Restore is exact, retry-safe, atomic on
  failure, isolated to a distinct target, and reversible. PostgreSQL remains authority; Qdrant is a
  rebuildable derivative.

## Identity, authorization, and capability evidence

- Focused Gate 5 suite: 40/40 passed across 26 top-level groups.
- Valid OIDC evidence required issuer, audience, signature, subject, actor, expiry, active product
  principal, and exact principal binding. Forged signature, wrong issuer/audience/actor, expiry,
  missing subject, verifier loss, principal disablement, revocation, and introspection loss denied.
- Every role/action combination was exercised. Product policy ran before OpenFGA, so a relationship
  allow could not override guest, minor, role, step-up, or succession denial.
- Step-up required a recent WebAuthn/passkey/FIDO2/Windows Hello method. Password-only and stale
  authentication denied.
- Capability issue/use/replay tests covered exact binding, changed-request refusal, revocation,
  expiry, actor/action/resource/argument mismatch, concurrent use, and response-loss retry. One
  idempotency key produced one logical effect.

The real disposable security bakeoff also passed:

- Keycloak 26.7.2 accepted the valid case and rejected forged signature, wrong issuer, wrong audience,
  wrong actor, missing token, and expired token cases.
- Logout made online introspection inactive while the offline signature still verified, confirming
  why high-risk operations must introspect.
- OpenFGA 1.18.3 allowed only the intended tuple and denied wrong actor, object, relation, revoked
  tuple, and service loss.
- Both services bound to loopback, used memory-only lab state/random credentials, stopped cleanly,
  and retained no credential or token. Already-installed binaries were copied to the isolated
  worktree for this run, then the disposable copy was removed. No download occurred and the RunaLab
  installation was not executed in place.

## Transport, secrets, telemetry, and dependency behavior

- Private release configuration passed only with HTTPS/private binding, approved TLS mode, required
  client verification where configured, zero effect retries, bounded request size, total/upstream
  deadlines, exact model identity, and valid secret references.
- Public/wildcard bind, release HTTP, unsafe retry, invalid deadline, oversized body, model mismatch,
  literal/invalid secret configuration, and non-loopback development binding failed preflight.
- Rendered Caddy configuration contained no secret reference or value.
- Telemetry rejected every non-allowlisted or non-scalar field and retained only aggregate verdicts
  and keyed references.
- PostgreSQL, Keycloak, and OpenFGA loss denies authoritative/protected work. Qdrant loss can degrade
  only to the already-scoped direct selector for approved-knowledge reads.

## PostgreSQL backup and recovery evidence

- The disposable Gate 5 integration passed 11/11 checks.
- A synthetic OIDC subject resolved through a PostgreSQL-owned principal before product policy and
  relationship authorization allowed a fresh step-up action.
- Three synthetic authoritative records spanning principals, settings, and learning events were
  placed in an authenticated AES-256-GCM backup, opened only under exact source authority/commit, and
  restored into disposable loopback PostgreSQL.
- An injected two-record failure rolled back the run and every row. A clean retry restored all three
  records exactly; exact replay returned the same result; a changed manifest under the same run id
  was refused; rollback deleted only the restored run and retained the principal authority row.
- The first integration attempt exposed a test-comparison defect: PostgreSQL `jsonb` preserves the
  logical object but may reorder its keys. The comparison was corrected from byte-order-sensitive
  `JSON.stringify` output to a canonical keyed logical digest. No record, product behavior, or
  recovery control changed.
- The Gate 5 schema was removed, PostgreSQL stopped, its runtime directory was deleted, and both
  synthetic backup keys were zeroed.

## Combined regression and preservation

- Full deterministic Node suite: 207/207 passed.
- Gate 0: 10/10 seals and all 12/12 pinned legacy suites passed under Node 22.22.0.
- Disposable selected-stack regressions passed and stopped every component:
  - Gate 1: 25/25 checks;
  - Gate 2: 21/21 checks;
  - Gate 3: 16/16 checks; and
  - Gate 4A: 16/16 checks.
- Generated Gate 1-4 timing/trace evidence and the sealed security result were restored to their
  accepted content hashes after validation.
- No protected store, owner DPAPI context, Windows Hello private key, E3/E4 content, device vault,
  model endpoint, production secret, non-loopback listener, retained service, or production route was
  opened or changed.
- Legacy RunaAI remained at `71ce985e4272895bbd4c3cf38ed8fbcb6090c2a2` with only its pre-existing
  untracked `.claude/settings.local.json`. RunaLab remained clean at
  `ec5e3466f6f937c8c610bdecf62a09c2491c7137`.

## Windows-bound data and owner recovery disposition

- The unresolved E3 record remains deferred and untouched.
- The two E4 authority records are not migrated. The owner enrols a new target WebAuthn credential;
  the old target credential, sessions, and pending capabilities are revoked only after the new sign-in
  and step-up path are witnessed.
- E5 is retired as absent.
- DPAPI session files, tokens, cookies, private keys, recovery secrets, E4 ciphertext, and device-vault
  ciphertext are never copied. The legacy device vault is eligible for later retirement only after a
  separately authorized and witnessed recovery ceremony; Gate 5 authorizes no protected deletion.

## Review boundary

Review and merge may accept only the Gate 5 application contracts, synthetic behavior, disposable
PostgreSQL adapter/drill, Windows re-enrolment disposition, and retained aggregate evidence. It does
not authorize protected access, owner credential enrollment/revocation, identity-service deployment,
non-loopback networking, production secrets, release promotion, Gate 6 cutover, or deletion of any
legacy credential or store.

