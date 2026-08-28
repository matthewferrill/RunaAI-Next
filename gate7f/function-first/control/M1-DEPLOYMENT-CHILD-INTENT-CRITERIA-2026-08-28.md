# Prospective child-intent correction

Root's independent review found an activation blocker in the uncommitted closed
deployment companion: a C# exception after child start was labeled merely
start-unverified, while PowerShell did not set unknown. The old catch could then
restore the app without resolving that child's effects. Child UUID/receipt also
existed only after execution, leaving a coordinator-crash ownership gap.

This amendment remains M1-S2/C12 C15 C16, roadmap digest
`613920536543bcc87dbd1d8bc2e9dca9920f82552c302fc69f92a2fd4a262521`.
It changes operator preparation only, never frozen9556/cases/grades or live hosts.

Before starting each trusted deployment child, allocate its ID and retain a
create-only owner-private intent with exact executable SHA, arguments SHA,
operation and deadline. Immediately after start, synchronously capture and
retain PID plus actual process start time before stream setup or blocking waits.
Any exception with unproved outcome, interrupted observer or unretained terminal
record is unknown and blocks rollback/replay. Cleanup of an exact owned process
does not prove that its completed external effects were rolled back. A bounded
terminal observation may resolve only its own child/intent identity.

Test actual isolated child success, side effect followed by observer exception,
lost started/terminal record, timeout/output limit and restart discovery of an
unresolved intent. No production deployer execution, listener, protected store,
Home request or model operation is permitted by these tests. Keep the candidate
non-activatable until this review finding and missing Home adapters are resolved.
