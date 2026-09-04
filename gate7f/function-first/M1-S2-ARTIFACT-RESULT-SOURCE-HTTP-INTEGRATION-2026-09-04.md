# M1-S2 Artifact result source and HTTP integration — 2026-09-04

## Result

The bounded Artifact owner-source ports, authenticated M1 surface and HTTP transport are **GO** for their disposable PostgreSQL integration boundary.

The implementation performs exact owner-point reads for conversations and tasks, applies row and byte limits before decryption, verifies stored envelope/HMAC/digest and cross-record relationships, projects the reviewed Artifact result contracts, and exposes `result.list` and `result.read` to authenticated Chat and Code before the Code-only mutation guard. Public HTTP errors use the frozen status mapping and never include private exception text.

## Retained review stops

Green deterministic suites did not authorize execution. Independent source review first stopped at P1=2 because task child/application IDs were not fully cross-bound and conversation project/experience ownership was only shape-checked. The first correction was stopped at P1=2 because personal `projectId = null` and title-only Gate 4 migrated chats were regressed. Those source findings were corrected and re-reviewed GO at P0=0/P1=0.

The first real-integration fixture was stopped before execution at P1=2 because its restart was only in-process and its no-copy/no-write evidence was incomplete. A later review stopped the corrected fixture at P1=1 because a throwing request could bypass the database invariant comparison. The final fixture uses a genuinely fresh child process, exact schema/table inventory, all plaintext canaries, length-framed per-table row digests, and before/after authority comparison on both success and throw paths. Fresh review returned GO at P0=0/P1=0.

## Verification

- Artifact deterministic contract/source/projection/source-port/surface/HTTP suites passed before execution.
- Pure throw-path invariant regression: 1/1 passed.
- Exactly one disposable PostgreSQL plus authenticated loopback HTTP integration run: 1/1 passed.
- The fresh child reconstructed its cipher, pools, production stores, source ports, M1 surface and HTTP server over the same retained PostgreSQL records.
- Post-run cleanup: zero entries below `D:\Projects\Runalab\artifacts\artifact-result-postgres-http` and zero PostgreSQL processes executing from the Runa test-tool root.

No browser, model, provider, Control, non-loopback network, production or customer operation ran. This does not complete C05 or M1 customer acceptance; Artifact DOM presentation and the bounded actual customer journey remain separate gates.
