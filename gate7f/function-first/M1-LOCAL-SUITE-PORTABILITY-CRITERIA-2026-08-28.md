# M1 local-suite portability correction criteria

Status: frozen before implementation. This is test-harness correction, not model qualification, deployment, or production authorization.

The complete local suite exposed two host-load/privilege dependencies that are not product acceptance conditions:

1. The watchdog tree test used one wall clock for both native helper startup and the four-second product deadline. Under full-file concurrency, startup could consume the ten-second observation window before the grandchild marker appeared. The correction must first observe the durable `started.json` record with a bounded startup allowance, then require the grandchild within the independently fixed product deadline plus a small settlement allowance. It may not extend the four-second watchdog deadline or accept a missing terminal result.
2. The PS5 parser/native-handle test also instantiated `New-ScheduledTaskSettingsSet`, which requires Task Scheduler CIM permission on some hosts. The default suite must prove parsing and native handle behavior without scheduler privilege, and must deterministically inspect the installer source for the disabled-before-registration contract. Actual scheduler construction and execution remain required in the separately retained owner-host integration proof.

The canonical source-byte wire proof remains exact. A stale checkout with CRLF materialization is not accepted; Git, fresh working tree/archive, and proof pins must agree on the LF byte hash.

Acceptance: focused tests pass, the exact wire hash remains unchanged, isolated native watchdog proof passes, and the complete local suite has zero failures and zero skips attributable to these corrections.
