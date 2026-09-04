# M1-S2B1 two-phase Control-frame preflight — 2026-09-04

Result: GO at P0=0/P1=0 after one retained implementation review stop. This is deterministic protocol evidence only.

## Scope

- `server-workspace/materialization-contracts.mjs`
- `server-workspace/materialization-contracts.test.mjs`
- Parent criteria commit: `d524c63c3cf3c395822fe3aacd89a66be89edbf5`
- Roadmap revision: `2026-08-28.1`

The change replaces the historical one-frame Control shape with a strict role/direction schema and an incremental,
poison-on-error admission state machine. It admits only Control-to-coordinator, coordinator-to-materializer and
coordinator-to-broker relationships. An ordinary exchange is request sequence 1, response proposal sequence 1,
request sequence 2 `finalize` or `cancel-request`, request EOF, response terminal sequence 2 and response EOF.
The only one-phase variants are a sequence-1 pre-operation cancel followed by both EOFs and a sequence-1 terminal
failure before proposal followed by both EOFs. Invalid ordering, role confusion, sequence, binding, payload, HMAC or
EOF permanently poisons that admission instance.

## Retained review and correction

The first exact-byte review stopped at P0=0/P1=2 even though 14/14 focused checks passed. Separate request and
response arrays could not prove cross-direction chronology, and tests covered only one relationship with incomplete
boundary evidence. No native implementation followed that stop.

The correction introduced online event admission so the proposal barrier gates successor actions rather than being
checked after both streams finish. Table-driven tests cover all three exact pairs and wrong-direction rejection,
proposal-before-operation, finalize-before-proposal, third/post-EOF frames, missing EOF, valid-HMAC channel/request/
nonce mismatches, 31- and 33-byte keys, empty payload, exactly 1,048,576 bytes and rejection at 1,048,577 bytes.

## Verification

- Focused deterministic suite: 15/15 passed, including 4/4 Control-frame cases.
- Scoped `git diff --check`: passed.
- Fresh independent review: GO, P0=0/P1=0.
- Reviewed source digests:
  - `materialization-contracts.mjs`: `0c99dd3c4608eafb1905d62ac221f9035d66d47701fbbc5ff1064dd7bb7b8071`
  - `materialization-contracts.test.mjs`: `bd9d275ca4ec2b208569e02a4154e793723d2fb419504ce5ecda5427aa7c4ff3`

## Boundaries

This record does not prove bootstrap origin, key zeroization, native Windows pipe/handle inheritance, operation-
specific payload schemas, worker/process composition, PostgreSQL composition, browser behavior, production routing
or model behavior. Those remain separately gated. No model, browser, public network or production operation ran.
