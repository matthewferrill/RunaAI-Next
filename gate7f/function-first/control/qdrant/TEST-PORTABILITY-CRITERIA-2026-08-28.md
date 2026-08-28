# Pinned Qdrant packaging test portability

Prospective correction to M1 validation only. The ec0a63d Control full regression ran
1,259 tests; its Qdrant package test failed before validation because the test invoked
the builder without its existing optional binary argument. The builder then looked for
Omen's D-drive tool path, which does not exist on Control. This is not a wrong-Qdrant
hash, service activation, or native guard failure.

The test shall accept an explicit absolute `M1_QDRANT_BINARY` path and forward it to
the builder's existing third argument. The existing Omen path remains the default.
The builder and its fixed artifact/version/hash contract remain unchanged. Neither a
caller path nor an environment variable may bypass that validation.

Before accepting the correction:

- Run the existing real pinned package and fifteen native guard assertions on each
  host using its actual pinned binary, without starting a service.
- Verify an explicit incorrect binary fails before creating an output package.
- Preserve the earlier failed full invocation. Rerun the complete suite on the fresh
  exact Control archive, including actual PostgreSQL and compact MXC execution.

Only test portability is included. No new binary download, replacement, production
Qdrant configuration, listener, service, model or protected-data operation is included.
