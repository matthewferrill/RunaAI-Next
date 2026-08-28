# Fresh isolated wire qualification for the shared evidence schema

Prospective operator test addition, source `200fb97`, incorporating parent
`801a8c3` evidence contract and `793ebc4` request-coverage source. No prompt,
provider, model, runtime-budget or production change by this workstream. M1-S2
C12/C15/C16 operational subset; roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.

Preserve the three old wire runs and all36 existing cases. Their successful r3
contracts SHA was d977fcc; it cannot certify the new contract. Re-run those
same36 cases against exact current source, then add four cases through actual
pinned Caddy2.11.4, disposable mTLS, the real Home proxy/controller, and owned
loopback backends:

1. The exact application-owned `EVIDENCE_RESPONSE_FORMAT` request gets one
   admission and exactly one byte-matching upstream POST. The synthetic response
   is returned byte-exact and independently parsed against `isEvidenceOutput`.
2. Changed `strict:false` is denied before controller/native admission.
3. Changed `additionalProperties:true` is denied before admission.
4. An arbitrary replacement schema is denied before admission.

All denied cases must show zero controller attempts, zero actual primary/BGE
calls, and no active ticket. Do not infer rejection from a client timeout.
Retain request hashes, raw synthetic wire evidence and cleanup. No schema retry,
fallback or altered60-second accepted completion ceiling. The existing10-second
body rejection,65-second primary timeout,15-second BGE timeout,10-second TLS
timeout and exact original framing cases must still run.

Current raw contracts SHA:
`995339141c0928312827ed7169a98d8ab2f2de7d7fbbf52e6ae1b54377de39e0`;
evidence-output SHA:
`ef61fd605d598dfda83782c54c8a1d019bc8a3d21a08aa81aa709ebe691d9f9a`.
Other prior runtime pins are unchanged and checked before/after execution.
The harness does not invoke Mastra or test request-coverage semantics; parent
SDK proof covers that separate interface. Synthetic controller lifecycle and
backend responses prove transport only, not model quality or Home deployment.

One new create-only evidence directory records all40 cases, exact source/runtime
pins and actual process/port/private-certificate cleanup. Any failed case remains
failed. Old raw outputs, fixed model cases and grade thresholds are untouched.
