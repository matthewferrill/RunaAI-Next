# Gate 6B release composition and Control shadow results

Status: all non-host-restart checks are green; Gate 6B remains open pending an owner-approved Control
host restart.

Gate 6B produced the first complete runnable selected-core RunaAI-Next release and installed it on
Control as a separate, empty, non-authoritative candidate. Every completed application, service,
dependency-loss, listener, artifact, and restore check is green. It did not migrate protected data,
enroll the owner, freeze legacy writes, change production traffic, or promote the candidate. Legacy
RunaAI remains the production and rollback authority.

## What is running

The exact release is `runaai-next-selected-core-2026-08-21-77f3017` at commit `77f3017`. It reports
the reviewed artifact, configuration, manifest, service, model, and selected-scope identities. Its
29,380-file artifact verifies before the application accepts requests.

The candidate has five candidate-owned scheduled tasks: PostgreSQL 18.6, Keycloak 26.7.2, OpenFGA
1.18.3, the Node 22.22.0 application, and Caddy 2.11.4. PostgreSQL, Keycloak, OpenFGA, the application,
and the provider proxy bind only to loopback. Caddy is the only private-network listener, bound
exactly to `192.168.50.169:9761`; no candidate wildcard or public listener was observed.

The live status reports:

- authority generation `legacy-runaai:control-production`;
- cutover phase `planned`, revision `0`;
- candidate authority `shadow`;
- all four dependencies ready;
- no protected data imported;
- no owner credential enrolled; and
- no production traffic change.

## Verification

- Full repository suite: 252/252 passed.
- Focused Gate 6B suite: 19/19 passed.
- Disposable Gate 6B selected-stack integration: 11/11 checks passed and PostgreSQL stopped cleanly.
- Disposable Gate 6 cutover-state integration: 10/10 checks passed and PostgreSQL stopped cleanly.
- Final application restart: ready in 13.8 seconds with the same commit, release, artifact, planned
  state, and legacy authority.
- Final OpenFGA, Keycloak, and provider-proxy loss drills each produced dependency health `503`,
  kept the selected route denied with `423`, and recovered fully.
- Final PostgreSQL loss returned `503` with `cutover-authority-unavailable`, echoed no request
  content or database detail, and recovered to the same planned revision.
- The exact final release backed up all three candidate databases into owner-bound encrypted files,
  restored each into a distinct disposable target, matched logical schema/count/keyed digests,
  destroyed the restore targets, removed plaintext work, and recovered every service.

## Legacy and source preservation

Control legacy RunaAI remained clean on `main` at `b4db040`. Its runtime reported the same commit,
remained reachable, and retained only its existing loopback listeners on ports 3786 and 3787. No
legacy service, checkout, protected store, credential, or route was changed.

The source repositories also remain preserved. `D:\Projects\Runalab` is clean at `ec5e346`.
`D:\AI\Projects\RunaAI` has no tracked change at `71ce985`; its pre-existing untracked
`.claude/settings.local.json` remains untouched.

## Corrections made during the gate

Live rehearsal found and corrected five release-specific problems before acceptance:

1. Caddy's candidate listeners were pinned to their exact private or loopback interfaces.
2. Application startup retained logs and allowed the complete cold artifact integrity scan to finish.
3. A replacement release may rebind a cutover store only while it is still pristine at planned
   revision zero; any real cutover operation makes the binding immutable.
4. The backup proof now works under Windows PowerShell 5, compares restored databases in stable table
   order, and retains only owner-encrypted backups plus aggregate evidence.
5. PostgreSQL authority loss is reported honestly as service unavailable rather than as a request
   error.

Every failed candidate attempt remained shadow, was recovered without touching legacy, and left no
plaintext restore work or disposable restore database behind.

## Backup and restart disposition

The owner-triggered encrypted backup/restore procedure is proven for the exact release. A recurring
protected-data schedule is intentionally not active while the candidate is empty; it must be enabled
and verified before Gate 6C imports any protected record.

A full Control host reboot was not performed. The accepted umbrella Gate 6 criteria explicitly require
the parallel candidate to survive a host restart, although the later Gate 6B-specific checklist
accidentally omitted that line. A reboot would briefly interrupt legacy RunaAI, so this is the one
remaining Gate 6B blocker and requires an explicit owner-approved maintenance window. Gate 6C must not
start until both legacy and candidate restart cleanly and report their exact pre-restart identities.

## Gate decision

The installed shadow candidate is healthy and may remain running, but Gate 6B is not closed until the
host-restart proof passes. This result does not authorize Gate 6C, protected import, owner enrollment,
legacy-write freeze, production routing, or promotion. The exact aggregate evidence is retained in
`evidence/CONTROL-SHADOW-RESULTS.json`.

Gate 6C must begin with a reviewed owner/backup/import plan and stop before any protected operation
until its owner-context prerequisites and rollback path are exact. Gate 6D remains the separate
maintenance-window promotion and observation decision.
