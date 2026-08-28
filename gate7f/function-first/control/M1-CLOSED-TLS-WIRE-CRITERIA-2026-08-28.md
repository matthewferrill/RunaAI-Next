# Prospective isolated closed-route TLS wire proof

M1-S2 / C12 C15 C16; roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This completes the local negative-wire evidence requested by the deployment
assembly README, not model qualification or live Home activation. All17 roadmap
families, native-wide admission closure and the outer transaction remain open.

Use the current root's unchanged `home-runtime/{tls-proxy,proxy,contracts,
controller}.mjs` plus readiness manifest/lease contract, verified by exact raw
hashes before import and again after testing. Reuse its actual
QualifiedRuntimeController and request validation; its hardware/lifecycle adapter
is explicitly synthetic and performs no load, power or real native operation.
The transport must use actual loopback HTTP backends, not a fetch response mock.
Use retained synthetic load-response data only for the controller's profile
contract. No model output, private conversation or production credential enters.

Adapt the actual assembly candidate-closed Caddyfile with pinned Caddy2.11.4
SHA5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b.
Extract only its provider server; replace only listen/dial addresses and client
certificate/CA paths with ephemeral loopback/disposable equivalents. Preserve
literal route order, exact health matcher, TLS validation, HTTP1.1, no retries,
10s handshake and65s response limits. Disable admin/config persistence. Never
bind production ports or a non-loopback address. Each Caddy process has its own
temporary configuration/storage and is stopped by its exact owned process handle.

Required wire cases: valid empty GET /v1/models and /health; wrong method, query,
fragment/encoded suffix, unknown path and /healthz closed; nonempty fixed-length
GET, nonempty chunked GET, incomplete/slow chunk and malformed/conflicting framing;
content encoding; wrong same-issuer client, foreign issuer, missing client cert,
wrong server name/trust; upstream redirect and failed status; actual body and
backend timeouts without changing the configured limits. An empty decoded chunked
body may satisfy the existing empty-body contract; report its observed behavior
separately rather than silently imposing a different product rule.

For every denied frame record actual response/error, elapsed time, proxy events,
attempted/successful controller admissions, current active tickets, and real
primary/BGE request counts. Denied frames require zero admission and zero native
request delta. A valid request whose backend fails/redirects/times out can have
one admission, but must release it and never follow a redirect or retry. Preserve
all failed attempts. No HTTP success flag alone proves containment.

Generate private disposable certificates with the installed OpenSSL in a fresh
owned temporary directory, never real keys. Bound commands/output/sockets and
the total proof; retain public hashes/config/observations only. Stop own Caddy,
close own servers and sockets, remove only that validated temp directory, and
verify every reserved port is closed and private fixture files are gone. Retain
actual source/binary hashes and cleanup results. No Home/Control endpoint, task,
firewall, installed runtime, model or production file may be touched.
