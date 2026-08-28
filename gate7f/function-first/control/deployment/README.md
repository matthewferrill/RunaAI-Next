# M1 deployment assembly — non-activating operator preparation

Criteria were committed first in `b87d285`, with the child-intent correction
recorded before implementation in `6285d76`. This directory does not deploy,
contact Home/Control, open a listener, enroll TLS, read a private key, or invoke
the generated operational script. It does not complete Milestone 1. Roadmap
digest `613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`
and all 17 capability families remain in force.

## Interfaces and boundaries

- `assembly.mjs`: exact predecessor configuration projection; single primary
  for every role; Nomic and BGE through Control9770; actual Qdrant9774 endpoint;
  exact original, initially closed, new-TLS fully closed, candidate-closed, and
  final Caddy bytes. Every non-provider original byte is preserved. Final role
  qualification calls the existing complete combined verifier, not a new score.
- `companion.mjs`: derives a separate four-file operator package from the exact
  frozen deployer raw CRLF SHA `9834fb63f7c56428fa965f39ac2985ff6a3d132b06f4244e108ebb3cde6aa6f5`.
  Checked substitutions preserve its application, ordinary identity, owner
  rebind and readiness checks. All Caddy publication/restoration is deferred to
  the outer transaction; held file SHA/admin ETag are checked repeatedly.
- `Bounded-DeploymentChild.cs` and `Closed-Phase-Functions.ps1`: no shell or
  stdin, bounded waits/output for the exact trusted tar/Caddy/Node child, typed
  results, create-only sanitized intent/start/terminal records in the pre-created
  owner-private `secrets/m1-deployment-<transitionId>` directory. Intent ID,
  executable/argument hashes and deadline are durable before dispatch; actual PID
  and process start time are synchronously retained before stream/wait work.
  Unknown is the default until the exact terminal record is durable. An uncertain
  result, interrupted start observer or lost durable receipt blocks automatic
  rollback/retry, including in a new coordinator process. These are not a general
  descendant-process sandbox. The enclosing operational script has not been run.
- `descriptor.mjs`: binds exact supplied config/manifest/artifact/launcher/plan
  bytes, expected qualification and archive hashes, each separate operator file,
  TLS enrollment, Home installation and profile, and each Caddy phase. Launcher
  bytes must equal the existing generator, not merely contain expected strings.
  It returns a plan with `activationPermitted:false`, qualification unverified,
  Home installation unvalidated and activation false. Byte pins are not a build
  provenance or live readiness certificate. `closedCompanionArguments` returns
  argv data only and explicitly does not authorize execution.
- `transaction.mjs`: pure pre-native decision/journal reducer using the actual
  quiescence-v2 validator. Fresh outer and inner journal revisions are required;
  full mutation identity, direction, preimage, target and terminal result are
  retained. Unknown admission or restore cannot become quiescent from a snapshot.
  Exact terminal reconciliation may restore or close, never silently retry.
  Three actual zero counter records must be fresh within five seconds.

The caller must authenticate the descriptor, hold the one owner-private target
writer, read both journals fresh and persist each reducer result by revision CAS
before following an action. No browser/model-supplied object is an operator
observation. The existing coordinator still checks current journal/file/runtime
at effect time. A new session cannot take over an unresolved old request.

## Health-route evidence is deliberately limited

Actual pinned Caddy2.11.4 offline adaptation verifies literal route order:
the exact GET `/v1/models` or `/health` framing prefilter precedes provider503,
which precedes the ordinary proxy fallback. No other expression exception exists.
Ordinary API/health closures and auth/static/unrelated bytes remain intact.
TLS uses exact private certificate/key/CA paths, server name, no retry,
10-second dial/handshake, 65-second response ceiling and HTTP/1.1.

**A header prefilter is not complete request-body proof.** Caddy placeholders
read parsed headers; Go may remove transfer-encoding framing. Do not treat a
missing header as evidence that a chunked body was absent. The separately pinned
Home `proxy.mjs` reads the bounded actual body and invokes `validateRequest`
before `controller.admit`; that is the required GET-body rejection boundary.
Its current source has been inspected, not deployed here. Actual negative-wire
tests (body/chunked/slow/malformed framing, query, wrong method, unknown route,
invalid certificate, timeout) across Caddy plus mTLS guard remain required.
No native request may be credited from offline adaptation or a textual matcher.
See the [pinned Caddy replacer source](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/replacer.go)
and [reverse-proxy TLS documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Deliberate hard stop and remaining integration

After Control drains, `nextTransactionAction` returns
`native-wide-adapter-not-implemented`. It cannot accept a fabricated `ready:true`,
broker/listener file or boolean `/healthz` as permission to change Home or publish.
Missing live boundaries are native-wide **and local** caller closure, fresh Home
task/process/owner/native/mTLS identity observation, and the assembled two-host
activation/rollback executor. Home's separate settings bridge is being built by
its owner; no guessed receipt schema is wired here.

The only implemented rollback decision is before any Home/application change:
it delegates to the exact original quiescence-v2 restoration. Once those systems
are changed, a future executor must prove old application and native state are
restored before original Caddy admission can reopen. The reducer rejects claims
that Home/app have changed; it does not pretend to implement their restoration.
The generated app companion similarly never restores Caddy in its catch block.

The enclosing deployment operator must also: verify the clean exact build and
installed artifact; authenticate this companion's hashes; create/verify the
private evidence directory; verify actual enrollment and Home installation with
their own pinned validators; stage candidate-closed Caddy using exact byte/runtime
CAS and retained terminal effects; run the closed companion under a finite outer
deadline; require its exact terminal result and fresh closed readiness; and only
then publish final Caddy. That executable outer integration is not claimed here.

## Completion order, not a packaging stopping point

1. Finish the unchanged9556 three-model baseline and independent evaluations;
   retain failures and non-executed attempts. It remains diagnostic until all
   required qualification gates actually pass.
2. Integrate the separately prepared product corrections, freeze their new
   application SHA and prospective seal, and qualify that corrected source.
   Baseline grades cannot certify different application behavior. The constants
   in this operator remain9556/416102 until explicitly updated against that new
   qualification; no fallback or automatic source substitution is allowed.
3. Select only a genuinely qualified role/profile arrangement. Present guard
   code supports one primary plus Nomic; mixed primaries remain rejected until
   profile-switching and its governance are implemented and tested.
4. Complete and independently test native-wide caller closure, Home settings,
   installed supervisor/worker ownership, real mTLS guard observation, restart,
   zero-residency recovery and exact rollback.
5. Rehearse the fully assembled two-host closed transition and negative wire
   cases in isolated owned fixtures. Then use the approved owner deployment
   workflow with exact predecessor CAS/rollback and fresh qualification evidence.
6. Perform signed-in customer journeys with the steward. Only then close M1;
   continue the remaining product roadmap rather than equating chat or packaging
   with Codex/Claude-level capability parity.

## Verification in this bounded task

`node --test gate7f/function-first/control/deployment/*.test.mjs`: 54/54 passed,
zero skipped. This includes actual Caddy **adapt only**, actual isolated Windows
child success/timeout/output-cap checks, side effects followed by a start-observer
throw or lost terminal, foreign-child terminal rejection, and a genuinely new
PowerShell coordinator refusing replay from the retained records. Complete
generated PowerShell is AST-parsed without execution; transaction/manifest cases
are synthetic. Initial
development failures (replacement-marker expansion, oversized AST command and a
missing synthetic ordinary-client field, test-process execution-policy setup,
and an unnecessary repeated test-directory ACL write on restart) were corrected;
none was represented as successful production evidence. `npm run verify:roadmap`
passed15/15. No application, frozen case, historical grade or live host changed.

Raw local proof lives under `evidence/20260828-child-intent-r2/`; its `proof.json`
binds the actual Node binary and each tested module to the complete TAP log,
including sanitized child records and distinct coordinator PIDs. The earlier
`20260828-child-intent/` proof is preserved as an initial 54/54 run with an
in-process reset only; it is not relabeled as a real coordinator restart. Owned
temporary fixture files are removed by each test after proof collection. The
whole-companion finite outer watchdog is still an unimplemented activation
requirement; per-child bounds do not establish that enclosing deadline.
