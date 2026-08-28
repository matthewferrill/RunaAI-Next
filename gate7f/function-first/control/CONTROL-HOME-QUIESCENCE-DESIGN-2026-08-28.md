# Prospective Control/Home transition quiescence

Status: read-only design; no admission, listener, firewall, model or production
changes performed. This is not a promotion decision. Selected model qualification
and the independently proved Home guard remain prerequisites.

## Existing authority and observed seams

Reuse `gate7a/control/Deploy-ControlOrdinaryAccessSuccessor.ps1` for the actual
application/Caddy successor. It already verifies the M1 plan, runtime and grades;
do not create a second general-purpose deployer. Its `Run-Caddy` helper currently
waits without a timeout; a new outer coordinator must bound its owned command
execution and reconcile an uncertain reload rather than blindly retry it.

`gate6b/http-server.mjs` has no admission/drain endpoint or exposed in-flight
counter. `gate7a/lan-release.mjs` identifies the Runa canonical host, private
`192.168.50.169:9761`, application `127.0.0.1:9760`, provider ingress
`127.0.0.1:9770` and Home `192.168.50.165:1234`. The 70s application / 65s provider
settings are **response-header** timeouts, not general proof of idle requests.
[Caddy transport documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#the-http-transport).

Read-only Control observation at 2026-08-28T20:18:08.1689093Z confirmed that
`GET http://127.0.0.1:2019/reverse_proxy/upstreams` exposes `num_requests` for
application `127.0.0.1:9760`, identity `127.0.0.1:9762` and Home
`192.168.50.165:1234`; each was zero. This is only a snapshot. The documented
counter represents active proxied requests, unlike established TCP connections.
[Caddy upstream API](https://caddyserver.com/docs/api#get-reverse_proxyupstreams).

## Proposed bounded sequence

1. Acquire one owner-controlled transition lease. Record exact predecessor and
   successor identities, original Caddy file bytes/digest, active config digest
   and ETag, task/process identities, and Home transition identity. Keep any raw
   config private; public evidence contains digests and sanitized routes only.
2. Construct a temporary admission overlay for **only** the canonical Runa host,
   its verified private 9761 listener and the loopback 9770 provider listener.
   Return an explicit 503 maintenance response to new requests. Preserve every
   unrelated host/route/listener and the original proxy handlers underneath the
   new terminal maintenance routes. Do not replace the whole shared Caddy server.
3. Preserving original proxy handlers is intended to retain the same upstream
   pool identities and active-request counters across reload. This is a design
   hypothesis requiring a real isolated slow-request test before activation;
   disappearance/reset of a counter must never count as drained.
4. Validate the overlay, perform one bounded reload with exact-byte/current-state
   compare-and-swap, and independently verify new selected-scope requests receive
   maintenance while an unrelated synthetic host remains unchanged. Caddy's
   configuration API supports ETag/If-Match concurrency protection; an operator
   lease must additionally serialize file and multi-step runtime changes.
   [Caddy concurrent configuration](https://caddyserver.com/docs/api#concurrent-config-changes).
5. Require actual zero selected upstream counters after admission closure, with
   repeated stable observations, within the existing 70s drain budget. A missing
   counter, positive counter or uncertain reload is not success. On timeout,
   restore the exact prior admission state under CAS; do not stop Home to force
   the observation green. Do not confuse graceful in-flight completion with a
   successful new request.
6. Coordinate Home's separate scoped native-ingress closure and proven drain.
   Caddy covers its own traffic only: direct LAN 1234 callers, desktop/CLI clients
   and the native loopback 41343 API can bypass it. Home's owner reports no proven
   legacy active-request counter. Connection/residency snapshots alone cannot
   establish that every native request drained. Native stop cancels outstanding
   work and cannot substitute for proof of prior quiescence. If that boundary
   remains unobservable, the transition remains unproved rather than assumed.
7. Only after both sides prove quiescence: perform the independently qualified
   Home guard transition, then use the existing exact successor deployer. Keep
   admission closed until the intended provider, source, auth and native-runtime
   health are verified. Reopen by applying the exact selected successor state.
8. Retain durable phase receipts. An uncertain command outcome is reconciled
   against actual file/runtime digests before further action. Rollback restores
   the recorded predecessor only if current bytes/state match the coordinator's
   expected overlay/successor; concurrent drift must not be overwritten.

## Required prospective tests

Use only a new owned fixture Caddy instance first: a slow in-flight request must
remain observable while new scoped requests are denied; unrelated-host requests
must still succeed. Verify retained counters through reload, missing-counter
failure, bounded timeout, rejected stale CAS, command-loss reconciliation and
exact rollback. Then separately verify direct Home callers and its native owner
boundary. None of these tests or transition steps is claimed completed here.

The latest application remains the separately qualified/frozen source, not this
documentation commit. No policy, model budget, acceptance case or old evidence
was changed by this design.
