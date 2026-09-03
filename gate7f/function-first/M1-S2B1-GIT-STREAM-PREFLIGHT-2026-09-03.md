# M1-S2B1 Git stream-session preflight

Date: 2026-09-03  
State: deterministic preflight green; no network or Control acceptance

This stage adds the bounded incremental frame decoder and authenticated two-direction Git stream-session state
machine required before a real TLS broker can exist. The decoder retains at most one 16 KiB header and one 1 MiB
payload, accepts arbitrary input chunking without transcript concatenation, and fails permanently on malformed or
truncated input. The session binds channel, request, nonce, sequence, request ordinal, canonical HTTP heads, body
lengths, phase order, per-direction frame counts, aggregate request/response sizes, terminal state, and both
directional EOFs. Its private HMAC key copy is zeroized after a valid terminal and on every protocol failure.

The first standing review stopped an initially green 14/14 draft on six issues: parsed head ordinals were not
explicitly compared with frame ordinals; protocol failures could leave mutated sessions reusable; the HMAC key was
not zeroized; directional EOF was not proven; the decoder used chunk-dependent concatenation; and adversarial
transition coverage was incomplete. The correction replaced transcript-style buffering with an incremental state
machine and added exact boundary, authentication, ordering, EOF, reuse, and zeroization checks.

The next review stopped the corrected 14/14 draft because argument destructuring occurred before the fail-closed
guard, so a null, undefined, or hostile record envelope could escape without destroying the session. It also noted
that the frame-ceiling test covered only the broker direction. Record extraction now occurs inside the guard with an
exact `pipe-record-invalid` result, and both directions prove admission of frame 128 and rejection of frame 129.

Focused checks pass 15/15 and the same standing checker independently reproduced 15/15 before returning PASS. These
are deterministic protocol checks only. No DNS, socket, TLS, HTTP, repository fetch, Control worker, publication,
browser action, production change, or model call occurred. The next separately reviewed stage is the real TLS
connector/broker child; workspace publication and UI remain out of scope until that boundary passes.
