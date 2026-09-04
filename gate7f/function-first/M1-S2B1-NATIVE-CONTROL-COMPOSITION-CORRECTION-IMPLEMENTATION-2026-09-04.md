# M1-S2B1 native Control composition correction — deterministic gate 1 implementation

Date: 2026-09-04  
Branch: `codex/m1-native-control-host`  
Starting commit: `a20fd32`  
Approved design SHA-256: `6EB02D980DFFF041D60D843C5A85A26E41ED09A46D1AA8FE9C83CFAD01062022`  
Roadmap digest retrieved before editing: `49fd172f29ce119d23ea4abfd6fe0eb09c4cf1611c904a49af2fd902a5e3df84`  
Milestone/slice: `M1` / `M1-S2`; the retrieved 17-capability set was not changed.

Status: reviewed local merge `6709a0f` integrates exact primary `b99f8bf`, including the Agent and Artifact results
recorded below. The first deterministic gate-1 command ran once at `39fd184` and stopped with 51/56 passing, five
failures, verified dependency-junction cleanup and a clean unchanged worktree. Static RCA found one product parser
defect and three harness assertions authored in the earlier unexecuted Native bundle. Their bounded source/test/method
correction is present but unexecuted and requires fresh independent review plus a source commit before the affected-
scope resume. Nothing in this record is PostgreSQL-server, Native-process, Control, network, browser, model,
production or end-user acceptance.

## Local preservation and post-merge state — historical pre-attempt checkpoint

After a fresh independent review returned `GO P0=0/P1=0`, the exact native lane was preserved in local commit
`b6725c2`. The semantic-union merge with exact accepted primary `5e78891` was then committed locally at `422cc6d`,
bringing in the `9714874` Artifact result-read source/HTTP integration and `25190d9` dependency/witness rules without
rewriting either history. Reviewed one-file Playwright package-preflight commit `1ddbea6` from primary was subsequently
carried by local merge `9a1bde5`. Documentation-only status commit `09d55df` preserved that checkpoint, after which
exact primary browser-harness design commit `5cf13f1` was carried by local merge `907dba5`. Three-record checkpoint
`b064842` then froze that completed baseline-reconciliation history.

The union imports and constructs `createPostgresArtifactResultSourcePorts` independently of native enablement,
returns `conversationResults` and `taskResults` on every composed M1 result, and passes both into the same
`M1FunctionSurface` that receives `serverWorkspaces`. It also retains every native static import, private/default-off
candidate construction, reverse cleanup boundary, attachment ownership and one-use close. A bounded source assertion
in `native-candidate-wiring.test.mjs` proves those Artifact ports remain unconditional and coexist at the native
attachment point. Current-state prose retains the primary Artifact/Agent/no-replay/browser/model limits and the native
STOP/preservation/reconciliation history. Historically, at the `9a1bde5` merge boundary the actual-browser harness
design was not included. Primary subsequently committed it at `5cf13f1`, after `1ddbea6`; `09d55df` preserved that
historical absence before local merge `907dba5` carried exact `5cf13f1` into native.

Reviewed local merge `6709a0f` combines exact native checkpoint `b064842` with exact primary `b99f8bf`. The latter
has parents Agent integration merge `5c6b2e1` and Artifact head `bf56905`, so the working tree includes Agent
PostgreSQL commit `58ca066` and the Artifact 58/58 retained-owner/`result-stale` correction while retaining the native
composition. All local Native and primary integration work remains unpushed. At that checkpoint, no Native
deterministic test, syntax check, import, junction, PostgreSQL, native process, Control operation, browser, model or
network action had run for the merged bytes. Fresh independent review later authorized the single stopped gate attempt
at `39fd184` retained below; neither the merge nor its pre-attempt review constituted execution acceptance.

## Retained STOP history

The independently reviewed preflight/RCA remains unchanged at
`M1-S2B1-NATIVE-CONTROL-COMPOSITION-PREFLIGHT-2026-09-04.md`. Its retained SHA-256 before this correction was
`CB1652A813ECE5137C221F412ABE0DCEE98E0368BDB01B68ED65B58E7767E035`.

The stopped source and test were used as correction inputs and then replaced at their production filenames. Their
pre-correction hashes are retained here so the failed stage is not silently rewritten:

- `control-worker-composition.mjs`:
  `3549CB5D9BDF3C839B9451B197ECBB889E05267C42F946783E7E6740312DC4BC`
- `control-worker-composition.test.mjs`:
  `1B0D9BCC31692C1ABD7FE42475055DA31A72011E493BF34B662CD7551EFDE79A`

The original exact-byte review stopped with P1 defects in four families: Control invented timing/attempt authority;
publication state was not durable; external effect response loss could replay fetch or move; and raw handles reached
JavaScript before atomic watchdog ownership. The subsequent design reviews retained three more P1s—ordinary scoped
admission/race convergence, authenticated watchdog attestation/restart cross-check, and exact default-off trusted
construction—and then one P1 for an insufficient retained reconciliation locator. The approved design closes those
requirements without authorizing native execution.

The first independent exact-byte review of this gate-1 implementation then returned `STOP P0=0/P1=6` before any
command ran. It found: a staging-versus-ready publication digest mismatch; a path that could record determinate
failure after an indeterminate publication claim/effect; count-only native ownership coverage; two missing literal
immutable-update trigger names; insufficient real/adversarial coverage; and no exact worktree-local dependency
junction procedure. The correction below is source/test/document authoring only and remains unexecuted.

A fresh independent exact-byte review of that correction returned `STOP P0=0/P1=5`, also before any command ran. It
found: candidate `recordFailed|recordCancelled` could still make a publication-claimed staging row determinate;
publication inspection trusted a count/flag rather than a watchdog-signed exhaustive ownership batch and could omit
malformed-result resources from close; early/final terminal payloads did not bind every operation/workspace/request
identity; candidate cleanup did not span later checkpointer and downstream construction; and a retained
`recovery-resumable` operation was returned to the caller without entering the watchdog's serialized recovery. The
second correction below is likewise source/test/document authoring only and remains wholly unexecuted.

The next independent exact-byte review returned `STOP P0=0/P1=1`, again without executing any command. It confirmed
the other corrected and retained closures but found that `composeM1Functions` cleared its candidate-resource cleanup
ownership before the real later `m1.attach(application)` call constructed `M1FunctionSurface`. An attachment failure
could therefore strand the workspace store, watchdog and native host, while the source test checked only that cleanup
ownership survived through checkpointer setup. The third correction below keeps ownership live across the awaited real
attachment boundary, closes every candidate resource in reverse order on construction failure while retaining every
error, and transfers successful attachment to one-use normal shutdown ownership. It remains unexecuted and requires a
different fresh review.

The following independent production-factory review returned `STOP P0=0/P1=2`, still before any import, syntax check,
test, PostgreSQL, native, network, browser, model, junction, commit or push action. It found that
`createProductionComposition` owned neither the returned M1 composition nor the PostgreSQL pool across every
constructor and awaited initializer between successful `composeM1Functions` and attachment, and that the retained
checks proved only source text rather than executable production-factory ownership behavior. The fourth correction
below places that complete post-compose graph inside one production ownership seam. Construction failure attempts M1
close and then pool close while retaining the original cause and both cleanup errors in deterministic order; successful
construction transfers those same resources into one idempotent normal-close promise with M1 before pool. The new unit
checks execute the exact seam used by `createProductionComposition` for a pre-attach construction failure, an awaited
attachment rejection, and successful transfer/normal close. This correction remains unexecuted and requires another
different-agent exact-byte review.

## Deterministic gate-1 implementation

- `server-workspace/materialization-contracts.mjs` adds closed watchdog authority/attestation, scoped locator,
  operation lookup, effect claim, unused-lease closure, retained-operation, raw-handle batch, and ownership receipt
  contracts. Authority/task identity, frozen duration, canonical digest, batch aliases, and 64-bit handle encoding
  are fail closed.
- `server-workspace/postgres.mjs` adds transactional tables and immutable/state-transition triggers for operation
  authority, effect claims, durable publication authority, and digest outbox evidence. Candidate methods implement
  exact source-scoped admission, attested atomic begin, one scoped response-loss lookup, effect claims, staging,
  published-pending, ready/terminal/unknown CAS, and digest-checked transition replay. Effect-claim and publication-
  authority update triggers use the exact immutable names while retaining separate no-delete triggers. Candidate
  determinate terminal transitions now lock publication authority and admit staging only while it remains exactly
  `staging-authorized`; missing, claimed, observed, or unknown publication state requires the retained unknown path. A claimed or
  observed publication can move only to `unknown`, never determinate failure, after an indeterminate boundary;
  `unknown` lawfully retains either the still-absent claim or the exact committed claim after response loss. Exact
  lookup also validates retained `unknown|cleanup-pending` receipts, while an exact already-committed `ready` row and
  its two receipts remain authoritative success rather than being demoted. New
  authority and publication manifests
  are envelope-protected when the configured cipher exists. This source has not been run against PostgreSQL.
- `server-workspace/control-worker-composition.mjs` consumes watchdog-issued identity/time, proves retained locators
  through PostgreSQL before watchdog open, closes unused losing leases before winner observation, calls begin once,
  proves issue/arm failures are durably settled before returning,
  requires new effect claims, consumes only durable publication authority, rejects raw-handle-shaped values, verifies
  exact `9/7/5` inherited resources plus five bootstrap EOFs, and binds one ordered 53-resource inventory to the
  watchdog ledger: Job, all child process/thread handles, all 21 inherited handles, all 21 parent/control
  counterparts (including five Control bootstrap endpoints and publication ingress/staging handles), publication
  parent, and watchdog token/timer/event. Every early and final terminal payload is bound to the exact operation,
  workspace, request, and expected outcome. A retained `recovery-resumable` locator enters one exact watchdog-
  serialized recovery owner after the PostgreSQL/watchdog cross-check instead of returning resumable metadata. It
  enforces early-terminal/cancel EOF chronology and gates determinate
  terminal writes on exact-zero recovery with both timer and wait closed. Entering the publication-claim boundary or
  attempting the move makes all later ambiguous failures `unknown|cleanup-pending`; watchdog ownership is retained,
  no determinate receipt is written, and no lease release occurs. The sole exception is an exact post-loss PostgreSQL
  lookup already proving `ready` with its valid immutable workspace and operation receipts; that returns the retained
  success without replaying publication and releases the watchdog as ready.
- `server-workspace/publication-primitive.mjs` adds the candidate path using only opaque owned-resource identifiers and
  durable PostgreSQL authority. It retains one no-replace/write-through move, post-effect reopen/identity/manifest
  observation, authoritative final digest derived from the ready-lifecycle manifest, and exhaustive closing of every
  returned owned resource. Each publication-inspection return is operation-bound to one or more strict resource
  projection batches and watchdog-signed receipts before use; omission, alias, repeated batch, cross-operation splice,
  malformed inspection, and receipt mismatch fail closed while every safely identified returned resource is passed to
  operation-scoped close. The prior handle-based surface remains only for
  compatibility with the predecessor route and is not selected by the native candidate composition.
- `server-workspace/native-candidate-config.mjs` keeps a private construction brand and module-owned manifest path,
  endpoint, verification key, and release root. Input is exactly enablement plus an administrator-pinned absolute
  workspace parent. The current manifest is deliberately unsealed; therefore enabled construction fails closed until
  the later independently reviewed native source/build/hash gate replaces it with a signed canonical manifest and
  proves native ACL/file identity.
- `composition.mjs` statically imports the candidate factories, leaves the predecessor service default-off, and
  performs all-or-nothing candidate construction only from a privately branded configuration. Its reverse-order
  cleanup scope remains armed through checkpointer setup and the real awaited `m1.attach(application)` /
  `M1FunctionSurface` construction. Attachment failure takes the owned resource set once, attempts every reverse-order
  close and aggregates every cleanup failure with the construction cause; successful attachment retains the same set
  for one-use normal shutdown without double close. `gate6b/composition.mjs` now places every constructor and awaited
  initializer after successful M1 composition, including real attachment, inside `createOwnedProductionComposition`.
  Any failure before ownership transfer attempts M1 close and then pool close, and aggregates the original error plus
  cleanup errors in that order. Successful construction transfers both into one idempotent close promise that attempts
  M1 before pool, aggregates both failures, and cannot double close even when the first close rejects. `service.mjs` keeps
  public materialization input exactly `{ sourceId }` and forwards only authenticated context and source ID.
- `control-watchdog-host.mjs`, `windows-native-host.mjs`, `WindowsNativeWorkspaceHost.cs`,
  `control-coordinator-child.mjs`, and `public-git-materializer-child.mjs` are deliberately fail-closed interface
  sources. They do not claim the real watchdog timer/wait, ownership transfer, Windows Job/AppContainer, bootstrap,
  control-frame, TLS, or materialization implementation required by the later native source/build/hash gate.

The branch was subsequently found to be a sibling of accepted application work rather than a descendant of accepted
`9714874` plus method-rules commit `25190d9`. At that stage this correction did not attempt reconciliation. Those exact
bytes were later preserved at `b6725c2`; the semantic reconciliation was committed at `422cc6d`, and the reviewed
one-file primary package preflight was carried through `9a1bde5`. Status commit `09d55df` recorded that historical
checkpoint before browser-harness design commit `5cf13f1` was carried through `907dba5` and recorded at `b064842`.
Historically, the subsequent no-commit merge with exact primary `b99f8bf` stopped for completion, hash freeze and fresh
combined-byte review before any exact lock-bound deterministic gate-1 execution. That merge is now completed locally at
`6709a0f`; the corrected current gate is the fresh exact-tree review described below.

## Authored deterministic-check scope — historical inventory

- `control-worker-composition.test.mjs`: exact topology/EOF and terminal chronology; every early/final terminal identity
  substitution negative; retained-locator DB-before-watchdog
  cross-check; zero-open spliced locator; losing-lease and unissued-lease settlement; one-begin response loss;
  ownership/raw-handle faults; 53-resource omission, alias, control-counterpart and pre-resume splice negatives;
  staging-digest mismatch before publication; claimed/attempted publication ambiguity retained as unknown; exact-zero
  timer/wait terminal gates; at-most-one fetch/move; lost-ready-response exact-success recovery; and real publication-
  module-to-PostgreSQL final-digest agreement; and existing/converged retained operations entering exactly one
  serialized recovery owner with substitution rejection.
- `native-authority-contracts.test.mjs`: strict authority/locator/retained/recovery-entry unions, deadline/digest
  binding, canonical raw handles, and alias rejection.
- `publication-owned-primitive.test.mjs`: opaque-resource publication, one move after response loss, read-only
  reconciliation, authoritative ready-manifest digest, watchdog-signed ownership receipts, omission/alias/splice
  negatives, malformed-inspection cleanup, indeterminate fail-closed behavior, and exhaustive resource closing.
- `native-candidate-wiring.test.mjs` and `composition.test.mjs`: default-off and private-brand behavior, strict service
  input, opaque child startup, fail-closed child interfaces, static top-level wiring denial checks, awaited real
  attachment, reverse cleanup order, construction-plus-cleanup error aggregation, successful normal-close ownership
  and double-close denial. The production ownership seam is executed for one post-compose/pre-attach failure, one
  actual awaited attachment rejection and one successful transfer whose failing normal close is invoked twice; source
  linkage additionally proves the production function wraps all intervening constructors and awaited initializers.
- `postgres-native-authority-source.test.mjs`: source-only checks for additive immutable schema, exact scoped admission,
  atomic begin/outbox, read-only response-loss lookup, and replay branches. It never opens PostgreSQL.
- `postgres-native-interface.test.mjs`: imports the real store class, proves the complete candidate method surface and
  fail-closed synchronous verifier contract, invokes every method with a rejected context before any pool connect, and
  executes the pure determinate-publication-state barrier against allowed and ambiguous states.
  It contains no PostgreSQL server or network operation.

## Fourth-correction pre-reconciliation frozen source/test hashes — not executed

These SHA-256 values pin the source and deterministic test bytes that received independent GO before local preservation
at `b6725c2`. They remain historical pre-reconciliation identities and do not record a syntax, import, test,
PostgreSQL, native, browser, model, network, release, or acceptance result for the merged working tree.

- `gate6b/composition.mjs`: `D6062ECB24F86D705273001CB32B7266BA7F7104B32342868E08B7A0FDDD7D2B`
- `composition.mjs`: `8EACDCFDDF9DCF1AD63A4B62F3B662194059B7E32DD7CDE5DAA789F8297ACC59`
- `composition.test.mjs`: `0F1F3E23984930ABE0CDFB84564D751F29E901E68DD7FA5AF264553971700673`
- `server-workspace/materialization-contracts.mjs`: `9E23EC88F199CD79085E05A83FC3BCB1708D2A27BF4DB7CCEDD6F752A0BA8CD9`
- `server-workspace/postgres.mjs`: `7F47E3AEB7139E8FC84CDAF16C8887D6FD78219180DE5697669C4FA6F6BD0D2C`
- `server-workspace/publication-primitive.mjs`: `DDB9B4922F3E4E1B23667EFFB0EE8A70E58F1E976834D8B2EA2FB7EECA6AE1C9`
- `server-workspace/WindowsNativeWorkspaceHost.cs`: `F53018461B90B8D4151515630905DA00E2F12A31C61E92A4AD5A215682F02CCC`
- `server-workspace/control-watchdog-host.mjs`: `6AEB41D6E0FA630879566612C66FD848989DFA1A352CCF18EA55EEC2A618BEE0`
- `server-workspace/control-worker-composition.mjs`: `AE149B6CD1005C62A6FE9CCEC0936E26D748B41A46A33E079C066A4EE142FE28`
- `server-workspace/control-worker-composition.test.mjs`: `4933E4C39B024144FB3FD2BA5616F30DC3848666872CD6D41159EB7626B9649E`
- `server-workspace/native-authority-contracts.test.mjs`: `AD2063D9CD38AC7D1C2B9979D5430E15F3B7EF67B4B24E7FC95ED683AB9AA44D`
- `server-workspace/native-candidate-wiring.test.mjs`: `DA399B06D6EC6F43A942D4395BACD808AECF07AEF73E9272BA0AC44C55864019`
- `server-workspace/postgres-native-authority-source.test.mjs`: `E46F5F4C63F64CCB5EE65C2F5E2822F3DB47FA90BDDC474B6EC55119291E98C3`
- `server-workspace/postgres-native-interface.test.mjs`: `A3AA81BB5B425F2324A508ED642EE73A6BD101CF078BF6D28F85518488F35E57`
- `server-workspace/publication-owned-primitive.test.mjs`: `C08ACD342E0D7CBBF5B248A9562CA9044B0C85DBE0DCD7F562CA067ED954D61D`

## Baseline-reconciled semantic-union hashes — not executed

These hashes preserve the exact semantic-union inputs that were reviewed and committed at `422cc6d`. They supersede
only the corresponding pre-reconciliation identities above and are not test, import or execution evidence.

- `composition.mjs`: `D40A422B3418D0E5EBA9DF32960E8425EF1FE42FC27A997EF729CD43AE38C687`
- `server-workspace/native-candidate-wiring.test.mjs`:
  `F3A417B62C39722699A293451E5A4916D8379442254F429C620C356A0A02ABC6`
- `MIGRATION-STATUS.md`: `32CED499AC86405316651EC64BBA8F294A4E9773FBAFA73363AAE11A1C79413A`
- `roadmap/CURRENT-SLICE.md`: `378CE13F999B5EE943360D7E652B08297737D0A72B33A30BD97C69DDEA893D85`
- unchanged reconciled `package-lock.json` witness:
  `CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`

## Post-merge combined-byte checkpoint — stopped, not executed

The reviewed native preservation commit is `b6725c25c17b47325c6d0192ab8ffb5c27ee8e2e`. Semantic-union merge commit
`422cc6d848426e2c15f8aec048be88b4fe9675ce` has parents `b6725c2` and exact accepted primary `5e78891`; package-
preflight merge commit `9a1bde5ae1a06213a7414209c51f353487e7c03a` has parents `422cc6d` and reviewed one-file
primary commit `1ddbea6`. Immediately before this documentation-only record update, the native branch at `9a1bde5`
was clean and seven commits ahead of `origin/codex/m1-native-control-host`. No push or remote contact occurred.

The exact current identities are:

- Artifact/native coexistence `composition.mjs`:
  `D40A422B3418D0E5EBA9DF32960E8425EF1FE42FC27A997EF729CD43AE38C687`
- coexistence assertion `server-workspace/native-candidate-wiring.test.mjs`:
  `F3A417B62C39722699A293451E5A4916D8379442254F429C620C356A0A02ABC6`
- carried `M1-S2-PLAYWRIGHT-CORE-PACKAGE-PREFLIGHT-2026-09-04.md`:
  `408E4D561D59808F0AA79F17A14F8E1CF82D37D07E08DEE8D3C955ABA07F474B`
- unchanged `package-lock.json` witness:
  `CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`
- this checkpoint's `MIGRATION-STATUS.md`:
  `CEFA8F30C02A675C2BF9ED7AF2A2DA05136EA60124F857D109DA7F0797F428DB`
- this checkpoint's `roadmap/CURRENT-SLICE.md`:
  `369162F5C8C9273B56E39776E5976648B6CCD67DE5F3DF9064DA4E2427B17FFB`

Primary subsequently advanced cleanly to `5cf13f1`, which commits the actual-browser harness design after
`1ddbea6`. That commit was absent from native `9a1bde5`, and documentation-only `09d55df` preserved this historical
checkpoint before exact `5cf13f1` was carried by `907dba5`. This checkpoint is not authorization, and the current
combined bytes require fresh independent review before deterministic gate 1. No deterministic test, syntax check,
import, junction, PostgreSQL, native process, Control operation, browser, model or network action ran for this
historical combined source/test/package state.

## Browser-design carry checkpoint — stopped, not executed

Documentation-only checkpoint commit `09d55dfe6446ac0bd8e52425ae2138eb8735ef97` has sole parent
`9a1bde5ae1a06213a7414209c51f353487e7c03a`. Browser-design carry merge
`907dba5282fd6a86b4c41fe2b6714ed050fd6e87` has parents `09d55df` and exact primary
`5cf13f1d50325bde52fd1df87820d8c036093102`. Native therefore includes primary through exact `5cf13f1` while
retaining the Artifact/native semantic union and reviewed Playwright package preflight. Immediately before this
record-only update the branch was clean, ten commits ahead of `origin/codex/m1-native-control-host`, and unpushed.

The exact carried source/package identities are:

- Artifact/native coexistence `composition.mjs`:
  `D40A422B3418D0E5EBA9DF32960E8425EF1FE42FC27A997EF729CD43AE38C687`
- coexistence assertion `server-workspace/native-candidate-wiring.test.mjs`:
  `F3A417B62C39722699A293451E5A4916D8379442254F429C620C356A0A02ABC6`
- carried `M1-S2-PLAYWRIGHT-CORE-PACKAGE-PREFLIGHT-2026-09-04.md`:
  `408E4D561D59808F0AA79F17A14F8E1CF82D37D07E08DEE8D3C955ABA07F474B`
- carried `M1-S2-ACTUAL-BROWSER-HARNESS-DESIGN-2026-09-04.md`:
  `7C1D59708C5CB010779394C118B599241F315D1EBEAB90BE77F10A1AAB59149C`
- unchanged `package-lock.json` witness:
  `CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`
- this carry checkpoint's `MIGRATION-STATUS.md`:
  `0D86CF1460F4A0AD81A1137EAAAA85EABDCEA5B849172C11FB47F02806B74AD8`
- this carry checkpoint's `roadmap/CURRENT-SLICE.md`:
  `011F49A2D165FA6D1CCADEF8522CC1DC0D0E23BAD8436BEB6FB200E942E72FE6`

No deterministic test, syntax check, import, junction, PostgreSQL, native process, Control operation, browser, model,
network, production or end-user acceptance action ran for the exact combined state at `907dba5`. Checkpoint `b064842`
preserved that history; the browser design's separate implementation, package, server-authentication, actual-browser
and acceptance gates remain open.

## Agent/Artifact primary carry checkpoint — historical pre-attempt state

Exact native checkpoint `b064842465aed46fcec05d4a1ed64ccd9357fc0b` has sole parent `907dba5`. Reviewed local merge
`6709a0f411f90c6c30706f3d995c07ecb2fcb1a4` has exact parents `b064842465aed46fcec05d4a1ed64ccd9357fc0b`
and primary `b99f8bfe6c5a4959a7f4693f2041e773c7c22d56`; that primary commit
has parents Agent integration merge `5c6b2e1a29c0dc3f6b20bb94e3bafc65d6834ee1` and Artifact head
`bf569055e4bbebf72c83263df0c815c1920069a0`. It includes Agent PostgreSQL commit `58ca066` and the separately verified
Artifact 58/58 retained-owner/`result-stale` correction. The committed union preserves all prior
Native checkpoints, Artifact-result/native-candidate coexistence, the Playwright package preflight, actual-browser
design, no-replay rule and tabled-model boundary.

The pre-commit conflict-resolution hashes were:

- `MIGRATION-STATUS.md`: `2B7515C5C506D6EC0AFA6DD146265A7D4DA6821DFFA3AFB630AA2B8DDF7F9A88`
- `roadmap/CURRENT-SLICE.md`: `B74F8F912249F59A7AC1AE1E7BEADDAE1254FC09AC1B89046B7F945F2513826A`

They identify the reviewed merge inputs and are superseded for current-record review by the correction hashes frozen
below; they are not presented as hashes of the post-merge living records.

At that checkpoint no Native deterministic test, syntax check, import, junction, PostgreSQL, native process, Control
operation, browser, model, network, release, production or customer acceptance action had run for the merged bytes,
and the local work remained unpushed. The later exact-tree review authorized the one gate attempt at `39fd184`; its
51/56 stop and affected-only correction supersede that historical pre-gate direction. Browser implementation, package,
server-authentication, built-candidate journey, actual-browser and acceptance gates remain open.

## Roadmap-reader stop and root cause — corrected before testing

The first required post-merge planning-context read stopped before tests with
`roadmap-invalid:document-revision:roadmap/CURRENT-SLICE.md`. Exact commit `5e78891` had changed only the prose header
from authoritative revision `2026-08-28.1` to `2026-09-04.1`; it did not change `PRODUCT-ROADMAP.md`,
`roadmap/capabilities.json`, or `roadmap/current-slice.json`. Both merge parents inherited that pre-existing mismatch,
and the merge-resolution review checked conflict shape, hashes and diffs but did not execute the required roadmap
validator. The failure was therefore a planning-publication defect, not a Native, Agent, Artifact, model, browser, or
database result. No test or external operation ran after the stop.

This correction restores `roadmap/CURRENT-SLICE.md` to the catalog revision `2026-08-28.1` and updates all three living
records from in-progress-merge language to exact local merge `6709a0f`. Prevention is structural: run
`npm run verify:roadmap` after independent review and before committing any changed plan or handoff; a roadmap-revision
change must update the catalog, slice JSON and both prose documents as one reviewed unit. The single authorized
`npm run verify:roadmap` retry then passed: planning context reported revision `2026-08-28.1`, digest
`fb87550a71d9783ade102ff1591a2e8094746fd6c7dda3c0a943a972fa648275`, all 17 capability families, and 15/15 roadmap
tests. No broader deterministic, import, PostgreSQL, native, browser, network or model operation ran. Deterministic
Native gate 1 remains blocked until a fresh exact-tree review is green.

The subsequent gate-1 attempt and full failure disposition are retained in
`M1-S2B1-NATIVE-DETERMINISTIC-GATE1-FAILURE-RCA-2026-09-04.md`. It reported 51/56 passing and five failures, then
stopped with verified link-only dependency cleanup and a clean exact `39fd184` worktree. One extra closing parenthesis
in `postgres.mjs` blocked three files at parse; two source-text assertions rejected correct syntax/SQL aliasing; and
static review found a third latent ownership-declaration assertion before any retry. The correction changes one
product-source token and those three assertions only. The 51 green checks remain retained and must not be replayed.

Fresh exact-byte re-review of the correction and repaired method returned `GO P0=0/P1=0`. The single authorized
planning validation then passed before source commit: `npm run verify:roadmap` reported revision `2026-08-28.1`, digest
`ef2938d1d15f773fc3831decfbd2f5abfd2b378645d34bc6b8735e97f8eadf71`, all 17 capability families, and 15/15 roadmap
tests. This supersedes the historical `c68eb8f` planning digest only for the corrected current planning records. It is
not Native, PostgreSQL, Control, browser, network, model, release, production or customer-acceptance evidence, and the
roadmap command must not be rerun after source-test resume while those planning bytes remain unchanged.

## Corrected affected-scope dependency preflight and cleanup — retained method

The corrected resume may not use `D:\Projects\Runalab\node_modules` or any ambient ancestor. After the one source and
three harness corrections receive `GO P0=0/P1=0` and are source-committed, one command may temporarily place the
accepted dependency tree at this worktree's local Node resolution point. Both this worktree and the accepted source must have
`package-lock.json` SHA-256
`cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308`; the source must be the ordinary directory
`D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules`, with exact `zod@4.4.3` and `pg@8.23.0`; and the local
target `D:\Projects\Runalab\runaai-next-native-control-host\node_modules` must be absent, including no dangling link.

The corrected one-command wrapper must perform these exact operations:

1. parse all 19 listed Native/production-union JavaScript files before creating a junction and stop on the first error;
2. treat only `ItemNotFoundException` as target absence; reject any occupied target;
3. hash both lockfiles and reject unless both equal the digest above;
4. reject the source if it is missing, not a directory, or a reparse point, and read the exact Zod/pg versions from
   that source;
5. create only a junction at the exact local target, immediately re-open it, require `ReparsePoint`, exact
   `LinkType=Junction`, exactly one target, and ordinal-ignore-case resolved equality with the accepted source;
6. clear `NODE_PATH`, resolve the local `node_modules\zod\package.json` and `node_modules\pg\package.json`, and require
   both to resolve through that authenticated local junction before the three affected-scope test commands;
7. in `finally`, re-open and re-authenticate the junction and its sole target, call the junction object's nonrecursive
   `.Delete()` only, prove the local path absent using the same dangling-link-safe lookup, prove the accepted source
   remains an ordinary directory, and re-hash both lockfiles;
8. aggregate the primary and cleanup errors so a cleanup problem cannot mask a test problem or be mistaken for green.

The stopped attempt's junction was verified and removed; no junction was created while authoring this correction.

```powershell
$nativeInitialStatus = @(& git -c safe.directory=D:/Projects/Runalab/runaai-next-native-control-host status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "native initial repository status check stopped with exit $LASTEXITCODE" }
if ($nativeInitialStatus.Count -ne 0) { throw 'native affected-only resume requires a clean committed worktree' }
$nativeExpectedHead = (& git -c safe.directory=D:/Projects/Runalab/runaai-next-native-control-host rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $nativeExpectedHead -notmatch '^[0-9a-f]{40}$') {
  throw 'native affected-only resume could not authenticate its starting HEAD'
}
$nativeSyntaxFiles = @(
  'gate6b/composition.mjs',
  'gate7f/function-first/composition.mjs',
  'gate7f/function-first/composition.test.mjs',
  'gate7f/function-first/server-workspace/control-coordinator-child.mjs',
  'gate7f/function-first/server-workspace/control-watchdog-host.mjs',
  'gate7f/function-first/server-workspace/control-worker-composition.mjs',
  'gate7f/function-first/server-workspace/control-worker-composition.test.mjs',
  'gate7f/function-first/server-workspace/materialization-contracts.mjs',
  'gate7f/function-first/server-workspace/native-authority-contracts.test.mjs',
  'gate7f/function-first/server-workspace/native-candidate-config.mjs',
  'gate7f/function-first/server-workspace/native-candidate-wiring.test.mjs',
  'gate7f/function-first/server-workspace/postgres-native-authority-source.test.mjs',
  'gate7f/function-first/server-workspace/postgres-native-interface.test.mjs',
  'gate7f/function-first/server-workspace/postgres.mjs',
  'gate7f/function-first/server-workspace/public-git-materializer-child.mjs',
  'gate7f/function-first/server-workspace/publication-owned-primitive.test.mjs',
  'gate7f/function-first/server-workspace/publication-primitive.mjs',
  'gate7f/function-first/server-workspace/service.mjs',
  'gate7f/function-first/server-workspace/windows-native-host.mjs'
)
foreach ($nativeSyntaxFile in $nativeSyntaxFiles) {
  & node --check $nativeSyntaxFile
  if ($LASTEXITCODE -ne 0) { throw "native syntax check stopped at $nativeSyntaxFile with exit $LASTEXITCODE" }
}
$nativeDependencySource = 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules'
$nativeDependencyLink = 'D:\Projects\Runalab\runaai-next-native-control-host\node_modules'
$nativeExpectedLockHash = 'cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308'
$nativeFailures = [System.Collections.Generic.List[System.Exception]]::new()
$nativeJunctionCreated = $false
$nativePriorNodePath = $env:NODE_PATH
try {
  $nativeSourceItem = Get-Item -LiteralPath $nativeDependencySource -Force -ErrorAction Stop
  if (-not $nativeSourceItem.PSIsContainer
      -or ($nativeSourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'reviewed primary dependency source is not an ordinary directory'
  }
  $nativeExistingLink = try {
    Get-Item -LiteralPath $nativeDependencyLink -Force -ErrorAction Stop
  } catch [System.Management.Automation.ItemNotFoundException] {
    $null
  }
  if ($null -ne $nativeExistingLink) { throw 'native worktree dependency target already exists' }
  $nativeWorktreeLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-native-control-host\package-lock.json').Hash.ToLowerInvariant()
  $nativePrimaryLockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json').Hash.ToLowerInvariant()
  if ($nativeWorktreeLockHash -ne $nativeExpectedLockHash -or $nativePrimaryLockHash -ne $nativeExpectedLockHash) {
    throw 'reviewed package-lock identity drifted'
  }
  $nativeZodVersion = (Get-Content -LiteralPath (Join-Path $nativeDependencySource 'zod\package.json') -Raw -ErrorAction Stop | ConvertFrom-Json).version
  $nativePgVersion = (Get-Content -LiteralPath (Join-Path $nativeDependencySource 'pg\package.json') -Raw -ErrorAction Stop | ConvertFrom-Json).version
  if ($nativeZodVersion -ne '4.4.3' -or $nativePgVersion -ne '8.23.0') {
    throw 'reviewed dependency identity drifted'
  }
  $null = New-Item -ItemType Junction -Path $nativeDependencyLink -Target $nativeDependencySource
  $nativeJunctionCreated = $true
  $nativeCreatedLink = Get-Item -LiteralPath $nativeDependencyLink -Force -ErrorAction Stop
  $nativeCreatedTargets = @($nativeCreatedLink.Target)
  $nativeResolvedSource = (Resolve-Path -LiteralPath $nativeSourceItem.FullName -ErrorAction Stop).ProviderPath
  $nativeResolvedTarget = if ($nativeCreatedTargets.Count -eq 1) {
    (Resolve-Path -LiteralPath ([string]$nativeCreatedTargets[0]) -ErrorAction Stop).ProviderPath
  } else { $null }
  if (($nativeCreatedLink.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
      -or $nativeCreatedLink.LinkType -ne 'Junction' -or $nativeCreatedTargets.Count -ne 1
      -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals($nativeResolvedTarget, $nativeResolvedSource)) {
    throw 'created native dependency junction identity is invalid'
  }
  foreach ($nativePackage in @('zod','pg')) {
    $nativeLocalPackageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $nativeDependencyLink "$nativePackage\package.json") -ErrorAction Stop).Hash
    $nativeSourcePackageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $nativeDependencySource "$nativePackage\package.json") -ErrorAction Stop).Hash
    if ($nativeLocalPackageHash -ne $nativeSourcePackageHash) {
      throw "local dependency $nativePackage did not resolve through the reviewed junction"
    }
  }
  $env:NODE_PATH = $null
  & node --test --test-concurrency=1 gate7f/function-first/composition.test.mjs gate7f/function-first/server-workspace/native-candidate-wiring.test.mjs gate7f/function-first/server-workspace/postgres-native-interface.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "native parser-affected resume stopped with exit $LASTEXITCODE" }
  & node --test --test-concurrency=1 --test-name-pattern '^candidate composition source has no dynamic native selection or broad process filesystem network calls$' gate7f/function-first/server-workspace/control-worker-composition.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "native control source-shape resume stopped with exit $LASTEXITCODE" }
  & node --test --test-concurrency=1 --test-name-pattern '^candidate PostgreSQL source is additive and stores immutable encrypted authority and publication evidence$' gate7f/function-first/server-workspace/postgres-native-authority-source.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "native PostgreSQL source-shape resume stopped with exit $LASTEXITCODE" }
} catch {
  $null = $nativeFailures.Add($_.Exception)
} finally {
  $env:NODE_PATH = $nativePriorNodePath
  if ($nativeJunctionCreated) {
    try {
      $nativeCleanupSource = Get-Item -LiteralPath $nativeDependencySource -Force -ErrorAction Stop
      $nativeCleanupLink = Get-Item -LiteralPath $nativeDependencyLink -Force -ErrorAction Stop
      $nativeCleanupTargets = @($nativeCleanupLink.Target)
      $nativeCleanupResolvedSource = (Resolve-Path -LiteralPath $nativeCleanupSource.FullName -ErrorAction Stop).ProviderPath
      $nativeCleanupResolvedTarget = if ($nativeCleanupTargets.Count -eq 1) {
        (Resolve-Path -LiteralPath ([string]$nativeCleanupTargets[0]) -ErrorAction Stop).ProviderPath
      } else { $null }
      if (($nativeCleanupLink.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
          -or $nativeCleanupLink.LinkType -ne 'Junction' -or $nativeCleanupTargets.Count -ne 1
          -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals($nativeCleanupResolvedTarget, $nativeCleanupResolvedSource)) {
        throw 'refusing to remove an unverified native dependency path'
      }
      $nativeCleanupLink.Delete()
      $nativeResidualLink = try {
        Get-Item -LiteralPath $nativeDependencyLink -Force -ErrorAction Stop
      } catch [System.Management.Automation.ItemNotFoundException] { $null }
      if ($null -ne $nativeResidualLink) { throw 'native dependency junction cleanup did not remove the local path' }
      $nativeSourceAfter = Get-Item -LiteralPath $nativeDependencySource -Force -ErrorAction Stop
      if (-not $nativeSourceAfter.PSIsContainer
          -or ($nativeSourceAfter.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'reviewed primary dependency source changed during cleanup'
      }
      $nativeWorktreeLockAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-native-control-host\package-lock.json').Hash.ToLowerInvariant()
      $nativePrimaryLockAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Projects\Runalab\runaai-next-m1-gemma-primary\package-lock.json').Hash.ToLowerInvariant()
      if ($nativeWorktreeLockAfter -ne $nativeExpectedLockHash -or $nativePrimaryLockAfter -ne $nativeExpectedLockHash) {
        throw 'package-lock identity changed during cleanup'
      }
    } catch { $null = $nativeFailures.Add($_.Exception) }
  }
}
if ($nativeFailures.Count -eq 1) { throw $nativeFailures[0] }
if ($nativeFailures.Count -gt 1) {
  throw [System.AggregateException]::new('native deterministic gate and dependency cleanup failed',
    $nativeFailures.ToArray())
}
```

## Post-junction current-byte cleanliness — retained method

Only after the wrapper above returns without an exception and has proved the worktree-local junction absent, run the
following from exact worktree root `D:\Projects\Runalab\runaai-next-native-control-host`. Stop on the first nonzero
result. The 19-file syntax list runs before any junction or test in the corrected wrapper. The `c68eb8f` roadmap result
belongs to the pre-RCA planning records and remains historical evidence. Before the correction commit, the reviewed
planning records were verified once as recorded above. Because the retained outcome publication now changes planning
records, validate them once after review and before the evidence commit; do not rerun source tests. Neither syntax nor
repository cleanliness can substitute for the 23 affected resumed checks, and none receives PostgreSQL, native,
Control, browser, network, model, release or customer-acceptance credit.

```powershell
& git -c safe.directory=D:/Projects/Runalab/runaai-next-native-control-host diff --check
if ($LASTEXITCODE -ne 0) { throw "native repository diff check stopped with exit $LASTEXITCODE" }
$nativeCurrentHead = (& git -c safe.directory=D:/Projects/Runalab/runaai-next-native-control-host rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not [System.StringComparer]::Ordinal.Equals($nativeCurrentHead, $nativeExpectedHead)) {
  throw 'native affected-only resume changed or lost its authenticated starting HEAD'
}
$nativeRepositoryStatus = @(& git -c safe.directory=D:/Projects/Runalab/runaai-next-native-control-host status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "native repository status check stopped with exit $LASTEXITCODE" }
if ($nativeRepositoryStatus.Count -ne 0) { throw 'native deterministic gate changed the committed worktree' }
```

## Affected-only resume result — passed

The reviewed correction was source-committed at `48dd9f916e97913deb862ba365b29c1bbff8fb02`. Its one authorized affected-
only resume passed: all 19 syntax files parsed before the junction, the three formerly parser-blocked files passed
21/21, and the two corrected source-shape checks passed 1/1 each, for 23/23 affected checks. The earlier 51 green checks
were retained and not replayed. Authenticated link-only cleanup removed the junction, both lockfiles retained SHA-256
`CEFCC1B9D086FB5EB8088A1BE3A1D86FD5B4360BB22ABA768C530BBBCF007308`, HEAD remained exact, `git diff --check` passed,
and repository status including untracked paths was empty. No PostgreSQL server, Native process, Control operation,
browser, network or model action ran.

After independent review of the four outcome records, the single post-result planning validation passed before their
evidence commit: `npm run verify:roadmap` reported revision `2026-08-28.1`, digest
`df48115eb1b519bb721008788187ef2aa90d56a584d20f6439f7f03e8a99868c`, all 17 capability families, and 15/15 roadmap
tests. The planning bytes remained unchanged after that command, so neither a second roadmap run nor any Native-test
replay is authorized for this evidence commit.

## Disposable PostgreSQL Gate 2 result — passed

The separately reviewed actual PostgreSQL Candidate passed 3/3 once at exact clean commit `8cdd4e4`; the separately
authorized Compatibility case passed 1/1 once at exact clean commit `5a6aaad`. Both runs emitted exact owned-process
terminal receipts, removed only owned synthetic data and their dependency junctions, preserved the seven unrelated
PostgreSQL processes, and left no live run root. The stopped SQLSTATE `0A000` attempt and three pre-execution harness
stops each have a complete RCA and affected-only correction; no stop was graded against a model. Exact evidence is in
`M1-S2B1-NATIVE-POSTGRES-GATE2-RESULTS-2026-09-04.md`.

## Deliberately deferred gates

The deterministic and disposable PostgreSQL gates are complete. The signed manifest and every real
native/watchdog/coordinator/materializer/TLS method remain blocked on gate 3 of the approved design. No mock or
source-only result can satisfy that gate. Control must compile reviewed source, seal every loaded
source/binary/runtime/policy hash, and obtain a new independent five-part source/hash GO before the single actual
Control run. A first failure at any gate stops; it is documented and corrected before one fresh affected run. No
unchanged-byte retry is permitted.

## Native Gate 3 preflight stop

The independent five-part source/build review and actual Omen/Control toolchain preflight stopped Gate 3 before any
compilation or Native execution. The real watchdog, Windows host and worker bootstraps were still fail-closed
interfaces; the cross-language handle-ownership protocol, reproducible compiler authority, Native-first release
verification, exact manifest membership/sealing and production activation path were not constructible from commit
`6fb28fd`. Omen and Control also had no .NET SDK or current compiler on PATH; Control's ambient Node was `v24.19.0`,
not the sealed application Node `v22.22.0`.

The full systemic analysis and corrected `G3-A` through `G3-F` state machine are in
`M1-S2B1-NATIVE-GATE3-PREFLIGHT-RCA-2026-09-04.md`. No Gate 1, Gate 2, model, browser or production work is replayed.
Gate 3 resumes with contract and implementation construction in isolated lanes, then exact five-part review, then one
Control build/local-Native proof. The actual public-Git Candidate remains a later separate gate.
