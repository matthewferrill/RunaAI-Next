# M1 local-suite portability correction results

Date: 2026-08-28. Scope remains test-harness portability only; no model, production route, protected data, or deployment state changed.

The correction separated native helper startup observation from the unchanged four-second product watchdog deadline. The tree test now waits for the durable started record under a finite startup allowance, then requires the owned grandchild marker within six seconds. Terminal timeout, zero active descendants, unrelated-process survival, and replay denial remain mandatory.

The PS5 parser/native-handle test no longer requires Task Scheduler CIM permission. A deterministic source inspection proves that the two-iteration Supervisor/Worker installer loop sets `Enabled=$false` before either registration. Actual owner-host task creation and cleanup remain a separate deployment prerequisite and are not inferred here.

Verification:

- isolated native watchdog suite, concurrency 1: 11/11 passed, zero skips;
- PS5 runtime installation plus exact wire suite: 21/21 passed, zero skips;
- canonical TLS proxy SHA-256 remains `1c063e289ad2f1fc5be25c32fc7b39796d0a415943a868f0de5ae977ed0ef7f9`;
- controller, manifest, and lease-contract working bytes were rematerialized exactly from their canonical Git objects; no source semantics changed.

The default repository test script now caps file-level concurrency at four. The previous unbounded host default could start enough simultaneous PowerShell, Caddy, PostgreSQL, and native helper fixtures that an owned watchdog process did not reach its durable started record within 30 seconds. With concurrency four, the complete repository suite passed with zero failures; the product watchdog deadlines and assertions were unchanged. The final immutable Control qualification still runs serially as its existing criteria require.

The complete local suite is rerun separately after integration; this focused result does not substitute for that terminal result or for the full Control regression.
