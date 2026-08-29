# Request-ingress drain hardening criteria

Roadmap revision `2026-08-29.2`. This is prospective operator hardening for
the selected M1 private runtime proxy and the separate legacy compatibility
boundary. It does not alter the frozen model campaigns, grades, model choice,
production routes or live listeners.

## Finding

Both HTTP paths previously began their authoritative active-request count only
after the complete request body had arrived. An authenticated caller could
therefore open a valid request, send an incomplete body and remain outside the
count used by drain. The legacy body reader also had no independent body
deadline. A zero admitted-request observation was consequently insufficient to
prove that no already-accepted request could later reach native inference.

## Required behavior

1. After transport identity and bounded header checks, but before awaiting any
   request-body byte, the selected proxy must obtain its existing privileged
   admission ticket. That ticket is the ingress count. Body validation still
   precedes upstream dispatch, so malformed, incomplete and timed-out requests
   make zero native calls.
2. A selected lifecycle drain or fault must revoke that ticket, interrupt the
   pending body reader and retain the ticket until the reader and socket path
   settle. Release remains exact and acknowledged through the existing broker.
3. The legacy server must obtain a single-use ingress lease from the durable
   compatibility adapter before awaiting a body. The adapter's active count
   includes that lease. Close prevents new leases, waits for every existing
   lease, and cannot publish three zero samples while a body is incomplete.
4. Both paths enforce an immutable bounded body deadline, bounded body bytes,
   and bounded headers. A body deadline emits one typed HTTP 408 response with
   `Connection: close`, allows at most 100 ms for that response to flush, then
   destroys exactly that request socket. All paths release their ingress count
   in `finally`.
5. The legacy binding digest includes `bodyMs`; accepted values are 100 through
   10,000 ms. Production binding must choose an exact value. No caller may
   override it per request.
6. A request may be dispatched at most once through a legacy ingress lease and
   a lease may be released at most once. Dispatch after release, duplicate
   dispatch and forged identities fail without upstream access.

## Deterministic acceptance

Tests must prove, without Home or Control endpoint use:

- selected incomplete-body ingress is counted before body completion;
- selected lifecycle revocation interrupts the body and produces zero upstream
  calls before the ticket is released;
- selected body deadline returns a complete typed 408 and zero upstream calls;
- legacy close started during an incomplete body cannot complete until that
  ingress settles;
- legacy body deadline returns a complete typed 408, releases the lease and
  makes zero upstream calls;
- post-close, duplicate-use, body overflow, disconnect and slowloris cases
  leave zero active ingress and no listener/process leak;
- three-sample managed-caller validation rejects any sample older than the
  exact receipt freshness window, not only a fresh final sample.

Existing exact response/request projections and model qualification do not
inherit acceptance from these transport tests. Live enrollment, route changes
and runtime activation remain separate gates.
