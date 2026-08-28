# Bounded body-timeout reply: local result

Criteria41da751 preceded implementation. The existing10s body timer now emits a
typed408 with Connection:close before exact-request destruction. The reader has
at most100ms to flush that reply; other aborts stay immediate and the deferred
timer is cleared on settlement. Accepted request/reply bytes, endpoints,
admission policy and65s/15s runtime limits are unchanged. No Caddy read/write
deadline was added.

Actual local proxy/runtime/TLS tests:29/29 passed, zero skipped. This includes a
real10s incomplete HTTP request, complete408 body/length and closed socket with
zero admission/upstream calls; reply-write failure; forced destruction; unchanged
successful bytes; real disposable mTLS; and existing profile/cleanup controls.
The existing fake-clock slow-body regression was updated to consume the reply
and advance the finite100ms flush period; the initial run waiting on its old
immediate-destroy assumption was interrupted, not represented as passed.

`evidence/20260828-body-timeout-r1/` retains complete TAP and exact source/binary
pins. TAP SHA256:
`ffa51754c00760d78a23681d7b8da6b8f5e7b3c4582c0d33ea2c15dbb0fe1051`.
The exact6843-byte proxy SHA256 is
`e965a57eed957e6797f8883e4d71f69c6a7c01911f39f44dd426db8043edaa2c`.
Its narrow -text rule preserves those actual tested bytes through Git/archive;
no normalized alternative hash is accepted. The module has mixed CRLF/LF from
the original checkout plus patch, deliberately preserved, not hidden.

The separate complete Caddy/mTLS wire r3 passed36/36 at22:51:55–22:54:42Z.
Slow chunked input returned408 at10022ms; a valid completion returned its exact
synthetic bytes after60022ms; primary timeout504 at65003ms, BGE503 at15016ms,
TLS timeout504 at10004ms. Denied frames admitted nothing; admitted failing
requests released their tickets. Its full proof SHA256 is
`7b61f5c9ea9e0aa587dddddb735099fb68f8e74dbce0ae5bee739da0279c54df`, retained
with the wire harness in `control/deployment/evidence/20260828-wire-r3/`.
Earlier r1/r2 counterevidence remains unchanged. All owned listeners/processes
and generated private certificate files were cleaned up; no Home/Control
endpoint, installed service, model or production key was used.

The mixed CL/TE checks prove only the explicitly reported Connection:close,
decoded-empty single-read case and appended forbidden-request exclusion. They
are not blanket parser/RFC conformance or general keep-alive/pipelining proof.
This is local transport evidence, not installed Home or deployment readiness.
