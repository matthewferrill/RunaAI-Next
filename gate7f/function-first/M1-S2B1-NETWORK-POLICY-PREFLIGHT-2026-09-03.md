# M1-S2B1 network-policy preflight

Date: 2026-09-03  
State: deterministic preflight green; no network or Control acceptance

The first HTTPS-ingress prerequisite is a workspace-blind binary address classifier. It verifies the frozen policy
digest at module load, snapshots all enforcement values, consumes only strict IPv4/IPv6 byte arrays, normalizes
IPv4-mapped IPv6 through the IPv4 policy, rejects zero/over-limit/duplicate/malformed sets, and rejects the complete
set when any answer is private, reserved, or metadata-addressed. It deterministically selects one allowed address
and exposes only policy/answer/selection digests plus a defensive binary copy for the future connector.

The first independent review stopped the draft because one limit still read the shared mutable JSON import and CIDR
tests did not cover every prefix boundary. The corrected implementation uses only private snapshots after integrity
verification. An independent BigInt oracle checks the start/end of every frozen IPv4/IPv6 CIDR plus each globally
safe adjacent value, and a cache-mutation regression proves later JSON mutations cannot change enforcement.

Focused policy/contract checks pass 17/17 and independent re-review returned PASS. This code performs no DNS lookup,
socket, TLS, HTTP, repository fetch, workspace effect, browser action, or model call. The next gate is the dedicated
TLS connector/broker child, followed later by the specialized Control watchdog/Job/AppContainer host.
