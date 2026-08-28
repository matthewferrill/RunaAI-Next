# M1 deployment assembly — prospective bounded criteria

Date 2026-08-28. M1-S2 / C12 C15 C16, roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
All 17 roadmap families remain separate. This task implements pure assembly,
configuration and transaction contracts/tests only. It does not deploy, enroll
TLS, open a listener, touch a protected store, load a model or run a host command.
Root owns review before any later live deployment.

## Exact baseline and observed integration gaps

The complete `gate7a/control/Deploy-ControlOrdinaryAccessSuccessor.ps1` was read
before design. It already verifies exact M1 qualification before stopping the
application, retains predecessor files, rebinds owner proof and checks ordinary
sign-in, JavaScript and M1 readiness. Reuse that path, not a replacement deployer.
However, it writes/reloads the final Caddyfile before health checks, has an
unbounded Caddy CLI wait, and restores Caddy inside its own catch block. It cannot
be called unchanged as a closed phase of a two-host transition.

Application source remains exactly
`9556ed01f9dbabe8c93eea309e482aad60bf809f`; source archive
`e10adce53387bcf31b639738e2d7ae26c2b5dd17e2914f1870ba0ef1949b31dc`;
qualification runtime seal
`416102ff7129e5adb00de51b2f0fc3e5ca542c18a82941a32fdc4075b6a1c89f`.
These pins do not assert that ongoing model qualification is already complete.
Operator/TLS companion files have their own hashes and do not enter the frozen
application artifact. Build the application from its clean exact checkout using
its own `gate6b/build-release.mjs` and verifier.

The Home owner confirmed current enrollment API and public result schema:
`runaai-control-tls-enrollment/v1`, Home192.168.50.165:9776,
server name `runa-home-m1.internal`, and Control files under
`C:\AI\RunaAI-Next-Candidate\m1-home-runtime-tls\<enrollmentId>`:
`client-key.pem`, `client.pem`, `ca.pem`, `enrollment.json`. Private keys stay on
their creating host. A successful enrollment is not guard activation evidence.
The present Home guard has one primary model plus Nomic; mixed role models are
not implemented. Native-wide/local caller drain and assembled guard activation
remain explicitly missing live adapters, not synthetic success receipts.

## Required pure outputs and checks

1. Construct a candidate configuration from the exact predecessor, changing only
   the existing M1 projection allowlist. Preserve identity, ordinary client,
   key/store references, authority, non-M1 services and all deadline ceilings.
   Provider stays `http://127.0.0.1:9770/v1`; Nomic uses the same base and BGE uses
   `http://127.0.0.1:9770`. Reject direct native/bypass endpoints. Invoke the
   existing exact qualification verifier rather than inventing a winning grade.
2. Replace only the exact supported old provider block in the predecessor
   Caddyfile. Preserve all other original bytes. New provider uses mTLS9776,
   exact client-key/certificate/CA paths and server name, existing 65s response
   ceiling/10s dial/no retry, a bounded TLS handshake, and no verification bypass.
   Read no key bytes. Reject duplicate/unknown old routes or path injection.
3. Build distinct final and candidate-closed Caddyfiles. The latter retains
   ordinary application API/health closures and blocks provider inference; only
   exact loopback GET `/v1/models` and GET `/health` can reach the guard for
   shipped startup/readiness. No query, body, method or route broadening. Preserve
   auth/static/unrelated routes. Offline pinned Caddy adaptation must establish
   actual literal ordering, not textual position.
4. Generate a separately pinned closed-phase companion from the exact frozen
   deployer bytes with narrow checked substitutions only. Its application,
   identity and readiness logic remains intact. It must not publish or restore
   Caddy; the outer transaction owns that. Check the held Caddy identity before
   and after. Bound Caddy child execution and retain a terminal result or report
   unknown; no automatic retry following an uncertain effect.
5. Bind application artifact/manifest/config/launcher, exact qualification files,
   TLS enrollment/operator/installation hashes, and every phase Caddyfile in one
   strict assembly descriptor. The current single-primary Home profile must
   match all selected roles and their tested controls. A model-free fixture is
   never promoted into a qualification artifact.
6. Implement a pure finite transaction decision contract: retain explicit
   per-effect ID/direction/preimage/target and exact terminal observation; enforce
   current journal revision, fresh Control quiescence and separately proven
   Home caller closure before native effects. Missing Home adapters remain
   blocked. No final admission until actual closed candidate readiness and exact
   current guard identity pass. Unknown effects block further work/rollback
   until that same effect is resolved. Exact old-route restoration follows
   restored old application/native state, not an unconditional catch.
7. Test positive assembly plus wrong source/seal/grade/profile, mixed models,
   changed ordinary identity/deadlines/non-M1 keys, TLS/path drift, early opening,
   stale/pending receipts and rollback order. Tests use synthetic in-memory
   inputs and offline Caddy adaptation only; no host operations or live fixtures.

Deliver the missing live integration list honestly. This work does not claim an
installed or activated Home runtime, completed model selection, or customer trial.
