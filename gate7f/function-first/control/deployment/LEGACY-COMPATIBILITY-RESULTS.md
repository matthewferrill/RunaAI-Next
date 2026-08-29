# Legacy compatibility adapter results

Date: 2026-08-29

Criteria: `LEGACY-COMPATIBILITY-CRITERIA.md`

Criteria commit: `2cff9245f133d621dc5f60a5240d795199b3bbe8`

## Outcome

The separate legacy compatibility boundary is implemented and qualifies for
future packaging. It does not change the selected M1 guard, its routes, its
model qualification or any live Control/Home service.

The implementation consists of:

- `legacy-contract.mjs`: exact request/response/model-alias contract;
- `legacy-server.mjs`: unstarted mTLS server with exact peer/source binding;
- `legacy-adapter.mjs`: finite dispatch, fresh runtime proof and drain logic;
- `legacy-journal.mjs`: create-only hash-linked close/restore authority;
- `managed-callers-adapter.mjs`: exact five-scope Next + legacy + native +
  reranker closure and inverse restoration.

Legacy chat temperature, message roles, assistant tool calls, tool call IDs,
function schemas and bounded output request are preserved. Embedding inputs are
forwarded byte-for-byte, without M1 prefixes or truncation, and successful
embedding output ordering is independently validated. Only the exact configured
legacy primary alias is translated and projected. Unsafe response headers are
not forwarded. Malformed successful upstream shapes fail rather than becoming a
false successful legacy reply.

## Verification

Focused protocol, authority, transaction and real-wire run:

```text
node --test legacy-compatibility.test.mjs legacy-wire.test.mjs managed-callers.test.mjs two-host.test.mjs
39 passed, 0 failed, 0 skipped
```

Complete neighboring deployment directory after this addition:

```text
node --test --test-reporter=dot gate7f/function-first/control/deployment/*.test.mjs
144 passed, 0 failed, 0 skipped
```

The actual-wire case used disposable TLS certificates and two loopback-only
listeners on OS-assigned ports. It proved:

- exact Control certificate and source address accepted;
- same-issuer foreign client rejected with zero native calls;
- missing client certificate rejected during TLS with zero native calls;
- native model-load route rejected with zero native calls;
- chat tools/model translation and embedding bytes/order preserved;
- durable close returned three increasing zero-active samples;
- post-close requests returned unavailable with zero native calls;
- exact linked forward receipt restored only the disposable route;
- all owned listeners, sockets, journals and private certificates were removed.

Runtime used for the wire test:

```text
Node v22.22.0
node.exe SHA256 bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb
OpenSSL SHA256 063e62dcc027fc5dbb1343de631f02a9291f8b1df0b4e37012e49a03d525aad4
```

## Boundaries and remaining live work

This is transport, protocol and admission qualification, not proof that a newly
selected primary model reproduces every legacy answer/tool choice. It receives
no selected-M1 qualification credit. Live use remains blocked until all of the
following are separately prepared and verified:

1. a production compatibility binding with current legacy source/config and
   actual primary/embedding fingerprints;
2. a separate Home legacy mTLS enrollment and installed disabled endpoint;
3. a candidate Control loopback Caddy route and exact legacy configuration
   change, both with byte-CAS rollback;
4. model/transport qualification for the legacy request set;
5. an actual managed-caller closure receipt covering Next9770, legacy primary
   and embedding, Home1234 and unchanged reranker8412;
6. a reviewed deployment descriptor and reconciled two-host transaction.

No model was loaded or called. No live route, listener, service, protected
store, certificate, native setting or production configuration was changed.
