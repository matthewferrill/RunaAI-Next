# Gate 5 operations and security scope and green criteria

Status: frozen before implementation

Gate 5 proves that the selected core can be operated privately and recovered without replacing the
governance that makes Runa distinct. It is one accelerated synthetic train with independently
reversible sections. The standing steward charter permits progress without ceremony unless a hard
safety criterion fails or owner-bound protected data is required.

## Accepted entry state

- Gates 1 through 4 are accepted on `runa2/integration` at `2c38dd5`.
- Selected read-only lanes, one governed setting action, selected data contracts, approved-knowledge
  projection, compatibility disposition, and the direct-selector decision are green.
- The legacy RunaAI and RunaLab repositories remain frozen sources.
- Protected inventory records one unresolved E3 inbox record, two E4 authority records with no E4
  transactions or capsules, no E5 store, and an owner-bound device vault. None is opened by this
  synthetic train.
- The stack bakeoff selected Caddy, Keycloak OIDC, OpenFGA, one-time capabilities, and allowlisted
  OpenTelemetry. Selection is not production activation.

## Decisions frozen by this gate

1. Preserve Runa's household roles, action vocabulary, minor boundary, fresh-step-up requirements,
   unverified ephemeral-chat rule, and unimplemented succession boundary as product policy.
2. Replace the DPAPI session file and localhost/Windows-only authentication plumbing in the target.
   Keycloak authenticates; PostgreSQL owns product principal and governance records; OpenFGA enforces
   relationships. Neither Keycloak claims nor OpenFGA tuples may redefine product governance.
3. Re-enrol passkeys/WebAuthn credentials. Never copy DPAPI ciphertext, Windows Hello private keys,
   recovery secrets, sessions, tokens, client secrets, or the device vault.
4. Use online token introspection for immediately revocable protected or effect-bearing operations.
   Offline signature validation is insufficient for those operations.
5. Keep one-time, exact-actor/action/resource/arguments capabilities for effects. Approval and
   execution remain separate, expiry/revocation/single use fail closed, and retries are idempotent.
6. Require private TLS outside loopback, exact provider/model identity, zero proxy retries for
   non-idempotent effects, explicit deadlines, and secret references rather than secret values.
7. Back up authoritative PostgreSQL records and required encrypted application data. Qdrant and other
   derived indexes are rebuilt, not treated as recovery authority.
8. Keep the accepted legacy localhost identity path available as rollback during the transition. Gate
   5 does not cut over production.

## Shared boundaries

- Use synthetic identities, relationships, secrets, records, and recovery material only.
- Do not open protected stores, activate a production identity provider, expose networking, download
  software/models, start a persistent service, change provider configuration, or cut over traffic.
- Disposable loopback services may run only when already installed, must use randomized credentials,
  and must be stopped and deleted after the check.
- Do not emit tokens, cookies, authorization headers, secret values, private keys, raw participant or
  project identifiers, protected content, or recovery material to telemetry or retained evidence.
- Deny on ambiguous identity, token invalidity/revocation, stale step-up, authorization uncertainty,
  dependency loss, model-identity mismatch, missing secret reference, or changed recovery authority.
- Every section has an off switch and rollback that restores the previously accepted integration
  behavior without conversion or deletion of source data.

## Gate 5A - identity and authorization boundary

### Work

- Define strict OIDC session evidence and a product-owned principal record.
- Translate authenticated subjects to stable product principals without trusting chat claims, device
  ownership, localhost, writing style, display names, or token roles as product authority.
- Reproduce the accepted household role/action matrix, age protections, session expiry, and step-up
  rules, then require an exact OpenFGA allow decision in addition to product policy.
- Keep unverified access limited to ephemeral chat and keep succession activation unavailable.

### Hard green criteria

- Valid issuer, audience, signature, subject, expiry, actor binding, active-state, and product-principal
  binding are all required for verified context.
- Forged, expired, wrong issuer/audience/actor, inactive, missing, or structurally invalid evidence is
  denied without leaking its value.
- Keycloak token roles cannot grant a Runa role or capability. OpenFGA cannot override minor,
  step-up, succession, or product-role denial.
- OpenFGA wrong actor/object/relation, revocation, malformed response, timeout, or loss denies.
- All legacy household role/action cases remain behaviorally equivalent.

## Gate 5B - fresh step-up and one-time capability boundary

### Work

- Require recent authentication evidence for each accepted step-up action.
- Bind issued capabilities to exact actor, action, resource, canonical arguments, approval, policy
  decision, issue time, expiry, and idempotency key.
- Recheck revocable identity and authorization at reservation/execution time.

### Hard green criteria

- Missing, stale, wrong-method, wrong-actor, or replayed step-up evidence denies.
- Capabilities are single-use, expiring, revocable, argument-bound, and actor/resource/action-bound.
- Concurrent use produces one reservation/deed/receipt. Response loss resumes idempotently.
- Dependency loss, decision mismatch, or changed arguments creates no effect.

## Gate 5C - private transport, provider identity, secrets, and telemetry

### Work

- Define release Caddy requirements for private TLS, deadlines, request/body limits, zero retries for
  effect paths, and explicit loopback-only development behavior.
- Pin exact provider/model identity at the application boundary.
- Define secret-reference configuration and a release preflight that reports only presence and keyed
  configuration identity.
- Extend the telemetry allowlist for aggregate security verdicts and recovery timings.

### Hard green criteria

- Non-loopback HTTP, public bind, missing client authentication where required, unsafe retry, missing
  deadline, unbounded body, or model mismatch fails preflight.
- No secret-like key or private value survives configuration rendering, errors, traces, receipts, or
  retained test output.
- Security telemetry contains only allowlisted scalar fields and keyed identifiers; token, claims,
  content, relationship tuples, secret values, and recovery material are rejected.

## Gate 5D - backup, restore, dependency loss, and owner recovery design

### Work

- Build a synthetic authoritative-record manifest with schema/version/count/keyed digest checks.
- Exercise encrypted backup, changed/tampered backup denial, disposable restore, exact read-back,
  dependency-loss behavior, derived-index rebuild disposition, and target-only cleanup.
- Specify the owner recovery and WebAuthn re-enrolment ceremony, including dual-control evidence where
  available, revocation of old credentials/sessions/capabilities, and a clean return to product policy.
- Record E3, E4, E5, and device-vault disposition without opening them.

### Hard green criteria

- Restore requires exact manifest authority, authenticated encryption, distinct target, explicit key
  custody, and no pre-existing target overwrite.
- Injected failure or tamper leaves the target empty; retry is exact and idempotent; rollback removes
  only restored target rows. Source state is unchanged.
- PostgreSQL loss denies authoritative reads/effects. Keycloak/OpenFGA loss denies protected/effect
  paths. Qdrant loss may degrade only to an already-authorized scoped direct selector.
- Owner recovery cannot preserve or import a session/token/private key. It re-enrols a new credential,
  revokes the old authority, and preserves product records and audit history.
- E3 remains deferred; the two E4 authority records are replaced by explicit re-enrolment rather than
  migrated; E5 is retired as absent; device-vault ciphertext is retired after separately witnessed
  successful re-enrolment and recovery verification. No protected deletion is authorized here.

## Combined validation and rollback

- Run the complete deterministic Node suite, Gate 0 verifier, all seals and pinned legacy suites.
- Run disposable Gate 1-4 regressions plus already-installed loopback Keycloak/OpenFGA checks if their
  prerequisites are present; absence is reported, never silently credited.
- Run `git diff --check`, retained-output scans, process/listener cleanup checks, and Git preservation
  checks for RunaAI and RunaLab.
- Rollback is Gate-5 adapter removal, new-credential/capability revocation in a later authorized
  environment, restoration of the prior release configuration, and authoritative PostgreSQL restore
  to a distinct target. Gate 5 never deletes a legacy credential or store.

## Approval and stop gates

- Synthetic implementation and disposable loopback validation may proceed under the standing charter.
- Stop for explicit approval before any owner-bound DPAPI/Windows Hello access, protected E3/E4/vault
  inventory or export, retained identity service, non-loopback listener, production secret, production
  credential enrollment/revocation, destructive recovery drill, release promotion, or cutover.
- Any identity/authz fail-open, private-data leak, non-idempotent duplicate effect, source mutation,
  unclean service shutdown, or rollback failure is a hard blocker.
