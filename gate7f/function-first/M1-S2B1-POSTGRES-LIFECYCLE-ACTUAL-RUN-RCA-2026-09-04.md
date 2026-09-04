# M1-S2B1 PostgreSQL lifecycle actual-run RCA — 2026-09-04

## Stop

The first independently authorized disposable PostgreSQL lifecycle run stopped after one attempt. It ran four tests: three passed and one failed. The compatibility run was not started.

No product transition failed. PostgreSQL rejected installation of the test's rollback fault-injection constraint with code `23514` before the intended `recordSourceDisconnected` action was called.

## Root cause

The fixture had already retained a legitimate `source-disconnected` outbox event earlier in the same schema. The later test attempted to add a validated table-wide constraint forbidding that event type. PostgreSQL correctly scanned existing rows while adding the constraint and rejected the historical legitimate row. The fixture therefore failed during setup and never exercised the rollback path it was intended to test.

Classification: **test harness / fixture defect**, not an application or model failure.

## Correction

The fault-injection check is added `NOT VALID`. PostgreSQL does not rescan accepted historical rows when the constraint is installed, but it enforces the check for the new outbox insert made by the intended rollback action. This preserves the exact fault being injected without invalidating unrelated history.

The correction must receive fresh read-only review before one resumed lifecycle run. The compatibility run remains gated until the lifecycle run passes. Neither command may be blindly retried.

## Resolution

Fresh read-only review returned GO at P0=0/P1=0 and authorized exactly one resumed lifecycle run. That run passed 4/4, including the formerly unreachable atomic rollback assertion. The separately gated compatibility run then passed 1/1.

Post-run inspection found zero entries below the owned disposable lifecycle root and zero PostgreSQL processes executing from the Runa test-tool root. Seven unrelated Reallusion PostgreSQL processes remained outside the Runa path and were not touched.

The corrected PostgreSQL lifecycle increment is accepted for this disposable integration boundary. This does not prove Control deployment, production data, browser behavior, provider/model behavior or customer acceptance.

## Cleanup evidence

The stopped attempt left zero owned disposable PostgreSQL directories and zero PostgreSQL processes whose executable was under the retained Runa test-tool root. No browser, model, Control, production or customer action occurred.
