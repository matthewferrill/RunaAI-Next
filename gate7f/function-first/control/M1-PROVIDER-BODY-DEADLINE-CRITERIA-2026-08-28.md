# Prospective provider input-deadline correction

M1-S2 / C12 C15 C16; roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This is operator transport work, not a change to application9556, its cases,
grades, role budgets or the separately owned Home proxy/controller.

## Retained counterevidence

The first actual loopback Caddy2.11.4 to mTLS guard run is retained unchanged in
`deployment/evidence/20260828-wire-r1/`, including the exact harness sources.
It finished with 27/33 checks and complete owned-process/port/private-file cleanup.
Its incomplete chunked GET caused the Home reader to deny at ten seconds, with
zero attempted admission or native requests. Nevertheless the Caddy client had
no HTTP result or server closure at sixteen seconds and its fixture timer
aborted it. That is not evidence of a bounded end-client response. Caddy's
retained log only completed its request on that client abort.

The 65-second primary and ten-second TLS timeout checks returned HTTP504 at
65003ms and10003ms, respectively; they failed overly specific 502/503 fixture
expectations. The former released its one admitted ticket, the latter admitted
none. Keep those original failures; a new run accepts the actual gateway timeout
status while still checking the unchanged deadlines and exact admission counts.

Three raw chunk fixtures also sent a TCP FIN immediately after their HTTP bytes.
That half-close is not a normal HTTP client waiting for a response and returned
empty200 responses without successful admission. Correct the fixture to retain
its write side while waiting for the server's Connection:close, and record the
wire bytes and half-close choice. The explicit incomplete upload continues to
remain open; never turn its client timeout into a passing server timeout.

## Change and acceptance boundary

1. Add a ten-second **read-only** request-body deadline to the generated provider
   route, both its final form and the closed candidate's health exception path.
   It must execute before proxying. Do not set a write deadline, alter other
   hosts/auth/static routes, increase any limit, retry, or change TLS validation.
   Preserve the exact predecessor and rollback byte bindings. The pinned Caddy
   implementation sets the request read deadline separately from its write
   deadline: [request-body implementation](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/requestbody/requestbody.go).
2. Repeat every original wire scenario in a new evidence directory. Slow chunked
   input must receive an actual server HTTP failure or server-side disconnect in
   at most fifteen seconds, not the sixteen-second client guard. Native and
   controller admission must remain zero. Fixed-length incomplete input must
   also settle without relying on client abort. Keep all failed observations.
3. Through the actual final generated route, send a valid bounded completion
   request whose real loopback backend returns after sixty seconds. Require its
   complete unchanged bytes, one actual primary request, one admission/release,
   and no ten-second write cutoff. Repeat the actual65s primary,15s BGE and10s TLS
   timeout controls. No model inference is involved.
4. An empty decoded chunked GET remains permitted by the already documented
   empty-body contract. Preserve and separately observe the original CL1 plus
   empty chunked frame: a Go intermediary may remove CL/TE and forward one empty
   GET. Require exactly that one empty request and no appended request admission,
   not a fabricated original-header rejection. Add nonempty CL+TE and appended
   forbidden-request controls with zero extra/native mutation. Negative/duplicate
   lengths, malformed chunks, nonempty decoded GET, wrong paths/methods, bad
   certificates and redirect controls must continue to fail closed.
5. Retain exact source/binary/config hashes, request frames, actual upstream and
   admission events, detailed assertion messages and cleanup. Both the first
   failing proof and new proof remain distinct. No Home/Control endpoint,
   production key, native runtime, installed service or model is touched.

This does not prove Home-wide quiescence, real hardware guard installation,
two-host deployment, a finite outer deployment watchdog or customer readiness.
