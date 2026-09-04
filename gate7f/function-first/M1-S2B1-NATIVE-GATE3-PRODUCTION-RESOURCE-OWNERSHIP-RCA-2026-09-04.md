# M1-S2B1 Native Gate 3 production-resource ownership RCA

Date: 2026-09-04  
Disposition: `STOP` before successful-Native activation or Gate 3 build proof  
Discovery: independent full construction-path source review  
Production, protected data, model, browser or network changed: no

> Method amendment: the `parent-03` execution proved that the frozen fixture below was Omen-bound even though this
> record required Control, and that it allocated disposable PostgreSQL before the earlier real sandbox prerequisite
> was eligible. Its generic startup error also discarded the bounded cause. The application ownership correction
> remains under proof; the execution method and resume rule below are superseded by
> `M1-S2B1-NATIVE-GATE3-RESOURCE-PROOF-ELIGIBILITY-RCA-2026-09-04.md`. No Omen retry is permitted.

## Root cause and full issue family

`createProductionComposition` constructed the real PostgreSQL pool and initialized several stores before it called
`composeM1Functions`, but transferred the pool into `createOwnedProductionComposition` only after M1 construction
succeeded. A migration/store failure, Qdrant initialization failure, M1 construction failure or invalid returned M1
owner in that gap could reject startup without ending the pool. Correcting only one Native error would leave every
other pre-transfer constructor in the same leak family.

This is an application-factory ownership defect exposed by Gate 3 activation review, not a model, PostgreSQL engine or
Native-process failure. The earlier invalid-root ordering check cannot reach the pool and therefore neither caused nor
proved this defect.

## Systemic correction

- Pool ownership begins immediately after `new pg.Pool`, before any store initialization.
- The complete store-initialization and M1-construction interval is enclosed in one failure boundary.
- Before transfer, a failure closes a successfully returned M1 owner first and ends the pool second; cleanup failures
  are aggregated with the original construction error in deterministic order.
- M1 must expose its closer before transfer. After the explicit transfer flag is set,
  `createOwnedProductionComposition` is the sole owner, so outer cleanup cannot double-close either resource.
- The existing post-transfer construction, attachment and one-use normal-close boundary remains unchanged.

The correction applies to migration initialization, continuity/workspace/action stores, accepted learning setup, M1
Qdrant/source/task/checkpointer/native composition and every later constructor before final surface ownership. There is
no Native-only exception or fallback.

## Actual proof design and resume rule

No mock or source-position assertion will claim closure. The affected actual-system fixture uses a disposable Control
PostgreSQL cluster, a valid v2 release/configuration, real secret references and the staged real sandbox runtime. Its
first case uses an actual login without database `CREATE` authority so the first migration/store initialization fails.
Its second case supplies an unused loopback Qdrant endpoint so real `composeM1Functions` fails after all base PostgreSQL
store initializations. Each case must prove its exact startup error and zero remaining application PostgreSQL sessions.
The terminal boundary must then prove disposable cluster stop and owned-root cleanup. It invokes no model and changes
no production route.

The source correction requires independent `GO P0=0/P1=0` before that one affected fixture runs. Any fixture,
environment or cleanup failure stops with retained evidence and a new RCA. The already-passed invalid-root check,
Gate 1, Gate 2, browsers and models are not replayed.

The frozen fixture is `production-resource-ownership.integration.test.mjs`. It accepts no environment-selected tool
paths. It verifies the canonical running executable is the already-reviewed Omen Node 22.22.0 binary and SHA-256,
the source lock and package-manifest hashes, the exact ordinary dependency source plus local junction, and all four
PostgreSQL 18.6 executable hashes and version. It stages the real QuickJS sandbox runtime, builds and verifies an
actual v2 release/configuration with file-backed synthetic secrets, and starts the existing owned loopback PostgreSQL
lifecycle. The early denial must have PostgreSQL code `42501`, create no `runa_core` schema, and leave zero candidate
sessions. The later case reserves and safely releases an exclusive ephemeral loopback port, verifies it is refused
immediately before construction, then gives it to the production Qdrant adapter. The expected construction result is
Node's exact `fetch failed` with an `ECONNREFUSED` cause bound to `connect`, `127.0.0.1`, and that selected port after
all seven base schemas exist. The separately named actual PostgreSQL witness must again observe zero
`runaai-next-candidate` sessions before the cluster is stopped.

These two actual cases prove the shared ownership boundary at the first initializer and at the post-base-store M1
boundary. They do not claim that every logically possible constructor failure was separately induced. The invalid-M1
owner and cleanup-aggregation branches are defensive source invariants reviewed across the same single catch/transfer
boundary; they cannot independently promote Gate 3 without these actual endpoint proofs.

The fixture refuses direct execution unless the frozen inner operator supplies its non-secret method-gate value. The
inner operator in turn refuses execution unless the separately frozen bounded parent supplies its own method gate.
Only `Invoke-NativeGate3ResourceOwnershipProofBounded.ps1` is an authorized entrypoint; direct Node or inner-script
execution cannot produce promotion evidence. The parent binds the full inner-script hash, starts a no-profile hidden
PowerShell child, applies a 600-second whole-inner bound, and proves bounded tree termination. The inner rejects Node
startup injection variables before either Node process, binds itself to the current reviewed HEAD, verifies the full
29,562-file dependency-source manifest before and after, and withholds its green result until every cleanup and final
source/process witness passes.

The fixture has one 180-second bound. Its terminal boundary drops only its fixed disposable login, ends the witness, asserts the existing controlled
PostgreSQL stop receipt, and removes only the identity-checked immediate generated fixture directory on success. A
failed proof preserves that directory for RCA. Operator output, source/tool/package hashes, junction ownership and
before/after process witnesses remain the responsibility of the bounded Gate 3 operator; a green Node assertion alone
is not promotion evidence.
