# M1-S2B1 TLS broker preflight

Date: 2026-09-03  
State: local deterministic and local-TLS preflight green; Control acceptance open

This stage connects the bounded authenticated Git stream to a dedicated TLS broker child. One authority deadline is
carried through the materializer transport, framed client, broker child and TLS connector. The connector selects one
address from the complete binary DNS answer set, permits at most two exact Git smart-HTTP requests over TLS 1.2 or
newer and HTTP/1.1, verifies the repository host certificate, denies redirects and content encoding, and enforces
strict request, response, header, body, connection and frame limits. Any protocol or transport failure poisons the
whole attempt; the request is not replayed and IPC keys, pipes, sockets and response bodies are closed or zeroized.

Independent review stopped the first green draft on eight lifecycle and trust issues: deadline reset, uncovered IPC
stalls, permissive URL/trust admission, reusable failed attempts, resource leaks, decoder accumulation, coverage gaps
and overclaimed labels. A second review stopped three remaining cases involving invalid-deadline key ownership,
reused response bodies and ineffective coalesced-decoder coverage. A third review found that the existing
isomorphic-Git transport buffered an unbounded asynchronous POST body before entering the deadline-governed client.
That shared seam now streams online under the same deadline, requires an exact content length, cancels a stuck
iterator and closes the attempt without retry.

The final evidence review required executable success for finite array bodies, direct declared/known/streamed length
adversaries, and proof that an HTTP rejection arriving before `finish()` cannot become an unhandled rejection. Those
cases are now covered. One retained test-method stop also corrected an obsolete assumption that a deliberately
poisoned transport remained reusable. A timing-sensitive timeout test now attaches its expected child rejection
handler immediately and admits only the exact terminal codes possible when two layers reach the same absolute
deadline.

The focused TLS/broker suite passes 29/29. The exact combined Git stream, network policy, public adapter and TLS set
passes 54/54, and independent re-review reproduced the timing-sensitive case and combined set with P0=0/P1=0. The
tests use a local synthetic TLS server and generated one-day certificate. No public network, Control child process,
Windows Job Object, native handle inheritance, PostgreSQL transition, protected publication, ready workspace,
browser action, production change or model call occurred. Those claims remain for the specialized Control worker and
actual Control/browser journey.
