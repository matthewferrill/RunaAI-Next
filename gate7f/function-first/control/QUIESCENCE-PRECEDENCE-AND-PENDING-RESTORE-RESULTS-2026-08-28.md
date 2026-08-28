# Quiescence correction results

Implementation: `ae42942`; prospective criteria: `f678d6d`. These are separate
operator-only commits. Frozen application `9556ed01`, runtime seal `416102ff`,
model task cases, budgets, historical attempts and grades remain unchanged.

## Outcome

- 53/53 focused tests passed, zero skipped: coordinator/state/HTTP-adapter
  contract tests, existing file-helper tests, and actual filesystem journal
  append/CAS/restart/partial-write tests. File-helper process fault tests use
  injected children; the isolated Caddy proof executes the actual helper.
- The final isolated pinned Caddy proof passed 34/34 checks at
  2026-08-28T21:21:33.134Z–21:21:36.395Z. An earlier development repeat passed
  32/32 before adding the explicit original `route` case and single-transition
  journal binding. Both raw reports are retained without alteration.
- The actual existing `/v1/chat/completions` GET and POST handlers returned 503
  during maintenance, with no new provider-backend calls. A preexisting explicit
  `route` was also blocked. The original slow request remained counted across
  reload and finished normally; auth/static/unrelated routes remained usable.
- A real owned loopback HTTP hop held a restore before forwarding it to the real
  Caddy admin API. The caller's 100ms observation ended while its separately
  bounded 3s HTTP request remained pending. Old-overlay snapshots plus real zero
  counters did not yield admission-closed or quiescent. Stale closed-state drain
  was rejected. After release, that exact operation's actual terminal HTTP
  success allowed only exact restoration, not quiescence. No admin retry occurred.
- Both real proof runs stopped their owned Caddy process and all nine owned
  loopback listeners. A subsequent process check found neither PID23660 nor
  PID21444. Synthetic files/journals and raw Caddy logs remain for audit.
  No production, Home, model, firewall, TLS or installed-service changes occurred.

## Changes and limitations

The corrected renderer places maintenance first in one literal outer `route`,
with original HTTP handlers in an inner normally sorted `handle`. Original
bytes remain present and exact rollback is separately checked. Unsupported
site/plugin directives, imports or non-HTTP settings interleaved after HTTP
handlers are rejected; this is a bounded generated-config adapter, not a general
Caddyfile transformer. The ordering follows Caddy's documented distinction
between [literal route order](https://caddyserver.com/docs/caddyfile/directives/route)
and normal directive sorting; the real request tests establish the actual result.

State v2 retains mutation ID, admission/restore direction, source/target digests,
expected ETag and terminal status. A known snapshot no longer resolves an unknown
HTTP mutation. Exact terminal receipt binding, stale-state checks and journal
revision CAS apply before further authority. A partial journal tail is retained
and blocks recovery. Each private journal directory is permanently bound to one
transition; the future outer operator must still enforce single-writer ownership
of the target across transitions. That outer deployment integration is not active.

A lost terminal result after process restart remains unknown even when the target
configuration is visible. There is deliberately no blind resend or automatic
assumption that the old request can no longer commit. Owner recovery/fencing is
separate work if such an incident occurs. HTTP 412 is a terminal rejection;
unknown transport/read outcomes are not. The receipt remains scoped to selected
Caddy-proxied requests, never direct Home LAN/local callers or Home-idle proof.

The independent old `271193b` reproduction and prior r1–r4 evidence remain intact.
Their simple-route passing checks did not cover the two counterexamples and are
not retroactively represented as passing them.

## Retained evidence

Directory: `quiescence/evidence/20260828-precedence-pending-restore/`.

| File | SHA256 |
|---|---|
| `r5-proof.json` | `59d54bc9811e547790e0c89053afcac3be8b66fb5f528a7a593c28472d1e850e` |
| `r6-proof.json` | `3c28b05c1c98c7139a94b3105921e37b0870cd4c420896979b0aca32a9f4e476` |
| `r6-caddy.log` | `90afde0c01161f1ddf1cef5482fecced4337574148dd5d7f1555d34fad918147` |
| `unit-test.log` | `10a0b821f277830d3f28344234031ea5a500a4bd410d8274971beb5eb8e064c3` |
| `unit-test.stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Actual loaded source bytes for final proof: coordinator
`2db6a8e0a50b63eca308fbb31678493094128e29ddfd95b24233624b368bb594`,
admin `f887e8581d3f9f8239b98dc61dbe84aae8a410ec59b09aa6ccc1bc1353d53577`,
journal `53ed6ff42ba86773b037063f0c44e083053559b066ea16607e0f310712f5840f`,
proof runner `49c152d7c34d6b56f42c0808fcd9d4a173d5bd686ba667ac81bea02b10b98181`.
Caddy 2.11.4 binary SHA256 remained
`5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b`.

Commands: `node --test gate7f/function-first/control/quiescence/*.test.mjs` and
`node gate7f/function-first/control/quiescence/run-caddy-proof.mjs PINNED_CADDY_PATH NEW_OUTPUT_DIRECTORY`.
The final 53-test raw capture used the three explicit test filenames, a hidden
Node child, separate stdout/stderr files, exit0 and confirmed child exit.
