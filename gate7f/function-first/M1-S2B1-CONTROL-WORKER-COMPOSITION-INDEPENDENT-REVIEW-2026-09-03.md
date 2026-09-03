# M1-S2B1 Control worker composition independent review

Date: 2026-09-03  
Result: GO; P0=0, P1=0  
Reviewed source checkpoint: `f065cb4` plus the two uncommitted criteria files named below

The review covered `M1-S2B1-CONTROL-WORKER-COMPOSITION-CORRECTION-2026-09-03.md` and its exact update to
`M1-S2B1-SERVER-WORKSPACE-MATERIALIZATION-CRITERIA-2026-09-03.md`. It performed no implementation, model, browser,
network, database or Control operation.

Three stopped review rounds corrected: contradictory bootstrap counts and circular source authentication; incomplete
resource ownership and post-timeout recovery; impossible success/broker-loss ordering; accidentally removed protocol
limits; and missing authority/recovery timer ownership. The final contract has five Git and three snapshot
Control-owned bootstrap pipes, exact child handle totals of Git 9/7/5 and snapshot 6/5, role/direction validation,
mandatory per-mode key payloads and EOF, failure-wide zeroization, and a two-phase control exchange across the
publication barrier.

One authority deadline is owned before the initial PostgreSQL effect and stops forward work at expiry. Serialized,
bounded recovery may continue under retained ownership without resetting that authority or replaying an unknown
mutation. Every Job, process, thread, pipe endpoint/duplicate, root, profile, DACL, timer and wait-registration result
is owned before validation and either confirmed closed/removed or retained. A ready workspace plus workspace and
operation receipts becomes observable only after non-replacing publication, exact zero processes, reconciliation and
cleanup. The existing numeric Git/body/frame limits remain authoritative.

First implementation prerequisite: update and adversarially test the executable `controlPipeFrameSchema` and its
validator from the legacy one-frame sequence to the accepted role/direction two-phase state machine. No native worker
composition or actual-system acceptance is credited by this review.
