# Prospective body-timeout response ordering

M1-S2 / C12 C15 C16; roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This isolated operator correction does not change application9556, model/case
selection, grants, accepted request/reply bytes, endpoints or runtime budgets.

The retained Caddy/mTLS wire r1 showed the Home reader destroy its incomplete
request at10s with zero admission, yet the end client stalled until its16s
fixture guard. Destroying IncomingMessage also destroys its response socket;
the later error reply cannot reliably be delivered. The r2 attempted Caddy
request_body read_timeout10s approach failed: completed empty GETs were cut off
at10s with empty200 replies. Preserve both failed runs and remove that approach;
do not treat their cleanup success as transport success.

At the existing10s Home body deadline, send a typed408 response with
Connection:close **before** destroying the exact incomplete request. Permit
at most100ms for that response to flush, then forcibly destroy that request
whether or not the peer cooperates. All other cancellation/disconnect paths
remain immediate. The delayed destruction timer must be cleared when the
reader settles; an error preparing the reply must fall back to immediate
destruction. No admission is permitted on this path. No new general timeout
callback, retry, ingress permission or write deadline is exposed to a client.

Require an actual loopback HTTP slow-body test at the real10s limit, plus
finite flush-failure, cleanup and unchanged successful-request regressions.
Then repeat the complete actual pinned Caddy→mTLS wire matrix with its original
no-read-timeout routing, including valid60s completion,65s primary timeout,
15s BGE timeout,10s TLS timeout and zero-admission malformed/body denials.
The wire run must record a real HTTP failure/server close, not pass a client
abort. Keep all raw failed attempts, exact hashes and cleanup evidence.

Home/Control endpoints, production keys, installed tasks, models and settings
are excluded. A local proof is not Home installation or deployment readiness.
