# Gate 6B release composition and parallel candidate

Status: frozen before implementation

Gate 6B turns the accepted Gate 1 through Gate 6A libraries into one runnable RunaAI release without
changing legacy authority. It may install and run only as an isolated shadow candidate. Protected
data, owner credentials, production traffic, and selected writes remain blocked until Gate 6C.

## Accepted entry state

- Gate 6A is accepted on `runa2/integration` at `2b15ef1`.
- Legacy RunaAI remains the production, protected-data, behavior, and rollback authority.
- RunaLab remains the frozen stack-evidence source at `ec5e346`.
- The Gate 6 cutover coordinator refuses promotion without an exact release, final protected delta,
  zero-difference reconciliation, owner ceremony, and live verification.
- Control currently has no complete RunaAI-Next release or persistent selected-stack candidate.

## Exact release composition

The production entry point composes only the selected core:

1. The Gate 2 deterministic read-only answer boundary for general, guarded, research, and workspace
   lanes. Workspace reads remain limited to the file sections explicitly named in the request.
2. PostgreSQL-backed project/chat continuity using the accepted `runa_core` encrypted records as the
   only project/chat authority. Runtime request ledgers may support idempotency, but may not copy the
   domain into Gate 2 synthetic tables.
3. The complete accepted `runa_learning` E6 journal and a direct, derived-in-memory Gate 4C advisory
   projection. It is scoped before relevance, never authorizes an action, and creates no Qdrant or
   second persistent knowledge authority.
4. The one Gate 3 governed default-intelligence action, backed by the selected PostgreSQL setting and
   immutable proposal/receipt records rather than the Gate 3 synthetic tables.
5. Gate 5 authentication, product-owned principal policy, OpenFGA relationship enforcement,
   fresh-step-up checks, private transport, secret references, telemetry allowlists, and recovery
   behavior.
6. Gate 6 release identity, readiness, authority generation, phase, and rollback controls.

Unassigned legacy chats remain unassigned. The application may present the stable virtual scope
`runa:personal` for routing and display, but it may not fabricate a migrated project record or change
reconciliation counts.

## Application boundary

- A single Node 22.22.0 entry point serves a minimal steward-facing RunaAI route, liveness,
  dependency readiness, and aggregate runtime identity.
- Runtime status reports the exact commit, artifact/configuration/manifest digests, selected scope,
  authority generation, phase/revision, model, and service identities. It reports no secret or
  protected value.
- Selected data and action routes require target authority plus a verified Keycloak session, an
  active product principal, and an exact OpenFGA allow decision. Effect execution additionally
  requires online revocation status and fresh WebAuthn/passkey evidence.
- In shadow mode, health and aggregate status are available through the private entry point, while
  selected data and action routes fail closed even if called directly.
- PostgreSQL, Keycloak, or OpenFGA loss denies the routes they authorize. Provider loss produces an
  honest unavailable result and no durable turn. No dependency failure silently opens an alternate
  authority.

## Release and configuration identity

- A deterministic file manifest covers every shipped application and dependency file. Its canonical
  digest is the Gate 6 artifact digest and is verified before the application accepts requests.
- A release manifest binds that artifact to one exact commit, entry point, redacted configuration,
  model identity, and PostgreSQL, Keycloak, OpenFGA, and Caddy versions/configuration digests.
- Configuration contains only bounded public settings and `env:`, `file:`, `vault:`, or
  `secret-store:` references. Secret values, tokens, cookies, credentials, private keys, protected
  identifiers, and ciphertext are forbidden from the repository, artifact manifest, logs, status,
  and retained evidence.
- The exact Node runtime and npm dependency tree are shipped or verified as release inputs. Control
  does not resolve or download dependencies during candidate installation.

## Parallel Control candidate

- Install the immutable release beneath `C:\AI\RunaAI-Next-Candidate\releases\<release-id>` and keep
  mutable service data, secrets, backups, and logs in distinct ACL-restricted candidate roots.
- Do not copy over, fast-forward, stop, restart, reconfigure, or write inside
  `C:\AI\Projects\RunaAI`.
- PostgreSQL, Keycloak, OpenFGA, the application, and Caddy use candidate-only identities, data
  directories, ports, tasks/services, and rollback ownership. PostgreSQL, Keycloak, OpenFGA, and the
  application bind loopback. Caddy supplies the only private TLS entry point and no public bind.
- Start in shadow/read-only mode with an empty selected domain. No protected import occurs in Gate 6B.
- Back up authoritative candidate PostgreSQL and Keycloak state, restore into a different disposable
  target, verify logical manifests, and remove only that disposable restore.

## Green criteria

1. The exact packaged release starts from a clean reviewed commit and reports the same verified file,
   configuration, service, and model identities.
2. Synthetic composition tests execute all four read-only lanes, direct approved-knowledge delivery,
   the governed setting proposal/approval/receipt/rollback path, idempotent retries, and hard
   dependency failures through the production entry point.
3. The candidate survives application and authoritative-service restart; persistent authority and
   aggregate status remain exact.
4. A distinct-target backup/restore proof matches schema versions, counts, and keyed logical digests.
5. Every selected data/effect route denies while shadow authority is active and denies on PostgreSQL,
   Keycloak, or OpenFGA uncertainty.
6. Only Caddy exposes the candidate; every observed listener is loopback or the explicitly named
   private TLS binding, with no wildcard or public listener.
7. The running legacy commit, health, listeners, checkout, and protected stores remain unchanged and
   usable throughout candidate install, restart, and rollback rehearsal.
8. Repository, artifact, logs, status, traces, backups evidence, and retained reports contain no
   secret or protected value. Retained evidence is aggregate-only.

## Rollback

Gate 6B rollback stops and unregisters only candidate tasks/services, preserves the immutable release
and candidate database for bounded diagnosis when safe, or restores a distinct candidate backup. It
never writes into legacy storage, reverse-migrates data, deletes a legacy credential, or changes the
legacy route. If private binding, dependency denial, restart, backup/restore, identity, or artifact
verification is not exact, the candidate remains shadow and legacy remains authoritative.

## Gate boundary

Gate 6B may build, package, install, and run this isolated shadow candidate under the standing Gate 6
approval. Stop before opening protected stores, importing the final delta, enrolling or revoking an
owner credential, freezing selected legacy writes, changing production traffic, or promoting target
authority. Those are Gate 6C and Gate 6D acts.
