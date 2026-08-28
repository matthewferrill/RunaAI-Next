# M1 transition quiescence — prospective implementation criteria

Date: 2026-08-28. Baseline design: `5b46a925edbfea19ecaa93392fbac452cbbd89de`.
Roadmap revision 2026-08-28.1, digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
This is M1-S2 operational readiness for C12/C15/C16, not product deployment
capability C08, a new model criterion, or a replacement for the other 17 families.

Parent authorized an isolated implementation and actual slow-request proof on
2026-08-28. Production activation, Home changes and model calls are excluded.
Use the existing exact successor deployer after independent qualification; this
module only provides bounded admission/drain/rollback coordination.

## Exact included boundary

- Trusted constructor inputs identify the one config target, expected original
  raw bytes, Caddy admin endpoint, site addresses and selected upstreams. No
  browser/model-supplied configuration, arbitrary command or credential is accepted.
- Insert maintenance handlers only into the explicitly selected site blocks,
  retaining every original byte and proxy handler otherwise. Deny Runa application
  API/health paths and all loopback provider requests; retain authentication/static
  routes and unrelated hosts. No global Caddy stop or unrelated server reload policy.
- Bound every command/HTTP operation and response size. Compare exact original
  file bytes and active config/ETag before admission and before rollback. Persist
  exact transition phases; timeout/lost acknowledgement requires read-back
  reconciliation, never blind resend or overwrite of concurrent drift.
- Close admission first. Require each original selected upstream counter to remain
  present and become zero for repeated observations within a maximum 70s drain
  budget. Missing/reset counters, failure, reload uncertainty or timeout cannot
  yield a quiescent receipt. Preserve actual in-flight completion.
- Caddy quiescence is explicitly scoped to proxied requests. It never authorizes
  Home stop or proves direct native LAN/desktop/internal-API work idle. Keep that
  separate Home-owner proof mandatory for any future combined transition.
- Exact rollback preserves user stores, unrelated files, original config bytes
  and original proxy behavior. An unrecognized current config is reported as drift,
  not overwritten. An owned overlay can be restored after process restart only
  using its retained exact original/overlay identities.

## Required green evidence before any activation consideration

1. Deterministic positive/negative tests: scope matching, original-byte retention,
   duplicate/unknown sites, stale file/config/ETag, missing/nonzero counters,
   bounded timeout, command-lost response, restart reconciliation and exact rollback.
2. A real isolated pinned Caddy 2.11.4 instance with distinct loopback ports and
   synthetic backends. Hold a request after real upstream dispatch, apply the
   admission overlay, prove that same upstream's active counter stays nonzero,
   reject new selected requests, and allow an unrelated-host request.
3. Complete the held request and observe stable zero counters, then restore and
   prove exact original bytes plus successful new selected requests. Retain real
   config digests, request results, counters and cleanup evidence.
4. No production Caddy/config/task/listener/ACL change, no Home operation and no
   model inference. The fixture owns all processes/listeners/files it creates and
   removes or stops only those exact targets.

No human test is needed for these operator fixtures. Actual model selection,
Home-caller quiescence proof, exact deployment and the later customer trial remain
separate gates. Historical campaigns/seals/grades remain untouched.
