# Actual isolated Caddy to mTLS wire result

Prospective criteria:08fd2c2; input-deadline investigation c954ac7/422b277;
rejected Caddy approach and revised proxy plan76a7497; separate proxy criterion
41da751. All are operator work; the application9556/campaign416102 remain
untouched and diagnostic, not promoted.

The r3 full matrix passed36/36 using pinned Caddy2.11.4, Node22.22.0, actual
Home proxy/controller source, disposable mTLS certificates and real loopback
HTTP backends. Only the controller's hardware/native lifecycle adapter was
synthetic; no model or Home/Control endpoint was used. The existing Caddy
configuration/route builder is unchanged. The only runtime correction sends
typed408/Connection:close before the exact incomplete request is destroyed,
at the existing10s limit with at most100ms flush grace.

| Actual wire check | Result | Elapsed |
|---|---|---:|
| Incomplete chunked input |408, zero admission/upstream|10022ms|
| Valid completion|200, exact response bytes, one admission/release|60022ms|
| Primary stall|504, one admission/release|65003ms|
| BGE stall|503, one admission/release|15016ms|
| TLS handshake stall|504, zero admission/upstream|10004ms|

Other checks cover exact empty GET health/model paths, query/method/unknown path
denial, nonempty and malformed bodies, content encoding, bad client identity/CA,
server name/trust, no redirects/retries and actual backend failure status.
The two mixed CL/TE normalization checks explicitly use Connection:close and
require one decoded-empty GET, no forwarded framing ambiguity, one response,
server closure and no appended forbidden-request admission. They do **not**
retroactively pass the original mixed-frame denial expectation, prove automatic
closure without that request header, or establish general keep-alive/pipelining
security. That boundary is retained visibly rather than broadening the claim.

R1 (27/33) is retained: three raw clients prematurely TCP-half-closed; the slow
body produced a proxy timeout but no end-client result before its16s guard;
two correct gateway504 timeouts failed overly specific fixture expectations.
R2 is retained: a Caddy request_body read deadline cut completed/no-body requests
off at10s with empty200; a final-route fixture assumption stopped the run before
the60s case. That configuration was removed, not deployed. Both failures have
complete original observations and cleanup. R3 corrects the raw client, status
classification, final-route shape and actual proxy reply ordering prospectively.

R3 proof: `evidence/20260828-wire-r3/proof.json`, SHA256
`7b61f5c9ea9e0aa587dddddb735099fb68f8e74dbce0ae5bee739da0279c54df`.
Every attempt includes full raw frames, response/error, elapsed time, source and
binary pins, exact admission/release/upstream counts and retained Caddy logs.
The harness sources are captured before execution. Evidence and harness files
have narrow -text rules so Git preserves the observed raw bytes.

Cleanup passed: every owned Caddy process stopped, all six reserved loopback
ports closed, active controller tickets0, synthetic instances0, private fixture
files removed. No production service/configuration/key changed. The focused
fixture unit suite passed11/11, and the separate proxy/runtime/TLS suite29/29.
Re-run the real matrix with the documented CLI and exact pinned source tree;
drift fails before import, not through normalization or fallback.

## R4 exact evidence-output schema extension

The fresh canonical-source R4 run extends the same actual Caddy, mTLS, proxy,
controller and loopback-backend matrix to **40/40 pass**. The four prospective
cases send the exact static evidence response format through Caddy. The exact
strict schema was admitted once and returned the expected byte-exact response;
strict=false, additionalProperties=true and an arbitrary command schema were
each rejected before controller admission or upstream contact. This is
transport/guard evidence, not real-model structured-output qualification.

R4 proof: `evidence/20260828-wire-r4-schema/proof.json`, SHA256
`d1effdf2aaba7055017aa9105c61e9badb45cf96e14c0e99e64a87797b1ae767`.
It ran from canonical source commit
`3cb9b1a9e3aaeca7cd20e69d86b1f06c09a75d09` with Node22.22.0 SHA
`bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb`,
Caddy SHA `5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b`
and OpenSSL SHA
`063e62dcc027fc5dbb1343de631f02a9291f8b1df0b4e37012e49a03d525aad4`.
Cleanup again stopped all owned Caddy processes, closed all six ports, left no
active controller request or synthetic instance and removed the private TLS
fixture. R1-R3 remain unchanged and independently attributable.

Next: the finite outer deployment watchdog and concrete closed-companion adapter
have separate canonical-source proof below. Native-wide/local caller closure,
actual Home installation/observer, real-model schema qualification and customer
trial still remain. All17 roadmap families stay open as recorded; this proof
does not close M1.
