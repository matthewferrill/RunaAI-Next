# Gate 6C non-protected preparation results

Status: preparation and Control shadow deployment green; owner ceremony execution and protected staging not started

## Outcome

The first Gate 6C preparation tranche is green without opening a protected store or changing either
legacy authority or candidate traffic. It implements the exact four-domain contract, owner-ceremony
state machine, recurring-backup contract and Control scripts, bounded freeze lease, allowlisted
setting/action inventory, memory-only migration plan, retained PostgreSQL staging, exact
reconciliation, idempotent retry, restart persistence, and target-only rollback.

The tranche deliberately does not claim Gate 6C completion. A complete browser OIDC authorization
code/PKCE and PostgreSQL-session entry point is implemented, disposable-tested, and deployed as a
new non-authoritative Control shadow release. It is stopped at `verify-recovery-authority`, before
creating a target user or credential. An admin row, pasted bearer token, or synthetic ceremony
receipt is not accepted as a substitute for the future owner-interactive run.

## Implemented boundaries

- Authority receipts bind the exact legacy generation, release commit/artifact, cutover id, target
  generation, and keyed participant reference.
- Owner-ceremony evidence must occur in order and prove recovery authority, a new primary
  WebAuthn/passkey, sign-in, fresh WebAuthn step-up, revocation, a second new recovery credential, and
  recovery. Retained events contain evidence digests only.
- Browser enrollment uses Keycloak's application-initiated
  `webauthn-register-passwordless` action. Sign-in, fresh step-up, and recovery require a fresh
  user-verified WebAuthn/passkey authentication. The authenticated user's own Keycloak account
  credential inventory must prove exactly one passwordless credential after primary enrollment and
  exactly two after recovery enrollment; credential identifiers are neither returned nor retained.
  Password-only authentication is refused.
- Authorization flow state and PKCE verifiers are short-lived and encrypted in PostgreSQL. The
  browser receives only an opaque Secure, HttpOnly, SameSite=Strict host cookie; access and refresh
  credentials stay server-side in authenticated envelopes. Refresh revocation must make every
  retained access credential inactive before the ceremony can advance.
- The authenticated Keycloak subject must resolve to the already-bound target product owner.
  The implementation has no first-login-wins path.
- Backup proof requires an active schedule, at least three encrypted database backups, zero plaintext
  backups, a current manifest, and a distinct-target restore.
- Scheduled Control backup streams `pg_dump` bytes into memory, encrypts with new target DPAPI
  LocalMachine protection, writes no plaintext dump, and stops rather than deleting a backup when 30
  generations exist.
- Scheduled restore decrypts in memory, streams into fixed disposable PostgreSQL targets, proves all
  three databases restore, and destroys the disposable targets.
- The selected setting/action inventory opens only `settings` and `actions`, validates five frozen
  source pins, runs twice, retains no setting value or action identifier, and fails closed on any
  possible selected-setting action record.
- The final-delta service maps project/chat and E6 through the accepted Gate 4 contracts, maps only
  `defaultIntelligenceLevel`, preserves selected receipts in authenticated envelopes, and refuses
  any missing/additional domain, source drift, inventory drift, changed replay, or nonempty target.
- PostgreSQL staging survives restart and response loss and can remove only the named target run
  before promotion. It never reverse-writes legacy.

## Legacy receipt finding

The current legacy setting UI writes `defaultIntelligenceLevel` directly through the settings store.
The frozen legacy action pathway supports only file write, verification command, Git commit, and Git
push; it has no settings-action kind. The likely selected receipt count is therefore zero. Gate 6C
still treats that as unverified until the owner-context aggregate preflight confirms no action record
or journal entry references the selected setting.

## Write-freeze finding

Legacy has no central selective-write maintenance switch. Some selected roots may be absent, so
denying writes only on existing project/chat subdirectories would not prevent the application from
creating a new selected root. Modifying legacy code just to add a temporary switch would create a new
production behavior immediately before migration.

The prepared safe default is therefore a short, reversible write-deny on the entire legacy
`.runaai-local/state` root while preserving reads. It opens or migrates no deferred store, records the
original ACL under target DPAPI protection, verifies a keyed whole-tree digest before release, and
can release only after verified rollback or Gate 6 close. Its broader temporary impact must be named
in the maintenance-window approval; it has not been activated.

## Verification

- Gate 6C focused Node suite: **27/27 passed**.
- Full Node suite: **280/280 passed**.
- Gate 0 verifier: full Node profile green, **10/10 seals**, and the optional live legacy phase not
  run because this tranche does not open the legacy protected checkout.
- Gate 1 disposable integration: **25/25 checks passed**, all services stopped.
- Gate 2 disposable integration: **21/21 checks passed**, all services stopped.
- Gate 3 disposable integration: **16/16 checks passed**, PostgreSQL stopped.
- Gate 4 disposable integration: **16/16 checks passed**, PostgreSQL stopped.
- Gate 5 disposable integration: **11/11 checks passed**, PostgreSQL stopped and keys destroyed.
- Gate 6 disposable integration: **10/10 checks passed**, PostgreSQL stopped.
- Gate 6B disposable integration: **11/11 checks passed**, PostgreSQL stopped.
- Gate 6C disposable integration: **7/7 checks passed**, PostgreSQL stopped.
- All Gate 6C PowerShell files parse successfully.

The Gate 6C integration retained only aggregate synthetic evidence. It committed two projects, three
chats, four turns, six learning entries, one setting, and one synthetic receipt; proved restart and
exact replay; found no private canary; rolled the entire target run back; and removed the disposable
PostgreSQL root. It also proved that a browser session and its exact authority binding survive a
PostgreSQL restart while neither its access nor refresh credential appears in plaintext storage.

## Control shadow deployment

On 2026-08-22, the exact merged integration commit
`ff15c618ecbcb5095f362c6055f4a485af3148e7` was built and deployed as immutable release
`runaai-next-gate6c-shadow-2026-08-22-ff15c61`. The verified release facts are:

- artifact digest `fff3c379258efe4a2cabf2835c91897c4df528b4ab20b229e967d86a12354668` across
  29,407 shipped files;
- configuration digest `f8db543ca9cb1886d38db1dd7fba49e43d144bbe39a053c42e084734c210dc20`;
- release-manifest digest `75baa0822b51e47563b45b41f0fee558dbb759e02ced8d72305ee9c759cca756`;
- all five candidate tasks running, with the PostgreSQL, Keycloak, OpenFGA, and provider dependency
  probes ready;
- the browser page and status endpoint available, with the ceremony at `planned`, revision zero,
  next step `verify-recovery-authority`;
- selected target counts zero for projects, chats, turns, project memory, learning entries, settings,
  principals, and cutover operations; one expected empty ceremony binding row and no browser flow or
  session rows; and
- zero users in the target Keycloak realm.

The deployment retained exact pre-change configuration and launcher files. Only the candidate
application task was restarted; PostgreSQL, Keycloak, OpenFGA, Caddy, legacy RunaAI, and production
routing were not cycled or changed.

## Protected and authority state unchanged

- No owner credential was enrolled.
- No protected RunaAI store was opened by Gate 6C.
- No legacy ACL or write path was changed.
- No scheduled backup task was installed on Control by this tranche.
- No retained protected row was imported.
- No adapter authority or production traffic changed.
- Legacy RunaAI and the Gate 6B Control candidate remain as they were at entry.

## Remaining hard prerequisite

The next boundary is owner-interactive: witness recovery authority, configure the existing private
Keycloak realm for user-verification-required passwordless WebAuthn, pre-bind the exact target owner,
and perform the real enrollment/sign-in/step-up/revocation/recovery run. Those steps create new
target identity and credential state and require the owner's interactive Windows Hello/passkey
presence; they have not started. Only after that ceremony and the recurring backup schedule are
deployed and proven can the protected maintenance window begin.
