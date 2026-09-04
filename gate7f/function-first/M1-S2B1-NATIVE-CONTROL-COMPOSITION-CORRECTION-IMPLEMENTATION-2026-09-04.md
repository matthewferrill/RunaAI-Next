# M1-S2B1 native Control composition correction — deterministic gate 1 implementation

Date: 2026-09-04  
Branch: `codex/m1-native-control-host`  
Starting commit: `a20fd32`  
Approved design SHA-256: `6EB02D980DFFF041D60D843C5A85A26E41ED09A46D1AA8FE9C83CFAD01062022`  
Roadmap digest retrieved before editing: `49fd172f29ce119d23ea4abfd6fe0eb09c4cf1611c904a49af2fd902a5e3df84`  
Milestone/slice: `M1` / `M1-S2`; the retrieved 17-capability set was not changed.

Status: reviewed source and deterministic-test bytes are locally preserved, baseline-reconciled and carried through
exact primary `5cf13f1`, but remain unexecuted. Nothing in this record is native, PostgreSQL, network, browser, model,
production, or end-user acceptance. The next action is a different independent reviewer examining the resulting
combined frozen source, tests, package preflight, browser design, diff and hashes at `907dba5` before the exact lock-
bound deterministic gate 1 is authorized.

## Local preservation and post-merge state — unexecuted

After a fresh independent review returned `GO P0=0/P1=0`, the exact native lane was preserved in local commit
`b6725c2`. The semantic-union merge with exact accepted primary `5e78891` was then committed locally at `422cc6d`,
bringing in the `9714874` Artifact result-read source/HTTP integration and `25190d9` dependency/witness rules without
rewriting either history. Reviewed one-file Playwright package-preflight commit `1ddbea6` from primary was subsequently
carried by local merge `9a1bde5`. Documentation-only status commit `09d55df` preserved that checkpoint, after which
exact primary browser-harness design commit `5cf13f1` was carried by local merge `907dba5`.

The union imports and constructs `createPostgresArtifactResultSourcePorts` independently of native enablement,
returns `conversationResults` and `taskResults` on every composed M1 result, and passes both into the same
`M1FunctionSurface` that receives `serverWorkspaces`. It also retains every native static import, private/default-off
candidate construction, reverse cleanup boundary, attachment ownership and one-use close. A bounded source assertion
in `native-candidate-wiring.test.mjs` proves those Artifact ports remain unconditional and coexist at the native
attachment point. Current-state prose retains the primary Artifact/Agent/no-replay/browser/model limits and the native
STOP/preservation/reconciliation history. Historically, at the `9a1bde5` merge boundary the actual-browser harness
design was not included. Primary subsequently committed it at `5cf13f1`, after `1ddbea6`; `09d55df` preserved that
historical absence before local merge `907dba5` carried exact `5cf13f1` into native.

Immediately before this record-only update, the native branch at `907dba5` was clean and ten commits ahead of its
tracking ref; the local preservation, checkpoint and merge commits remain unpushed. No deterministic test, syntax
check, import, junction, PostgreSQL, native process, Control operation, browser, model or network action has run for
these combined bytes. The next action is a different-agent exact combined-byte review at `907dba5`. Only its
`GO P0=0/P1=0` may authorize the already frozen exact lock-bound deterministic gate 1. Neither the commits nor that
review constitute execution acceptance.

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
checkpoint before browser-harness design commit `5cf13f1` was carried through `907dba5`. The current combined bytes
remain stopped for fresh review before any exact lock-bound deterministic gate-1 execution.

## Authored deterministic checks — not executed

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
network, production or end-user acceptance action has run for the exact combined state at `907dba5`. Fresh independent
review of those combined bytes is required before deterministic gate 1; the browser design's separate implementation,
package, server-authentication, actual-browser and acceptance gates remain open.

## Exact dependency preflight and cleanup — frozen, not executed

The deterministic command may not use `D:\Projects\Runalab\node_modules` or any ambient ancestor. After a different
reviewer returns `GO P0=0/P1=0` for the exact combined source/test/package/browser-design bytes at `907dba5`, one
command may temporarily place the accepted dependency tree at this worktree's local Node resolution point. Both this
worktree and the accepted source must have
`package-lock.json` SHA-256
`cefcc1b9d086fb5eb8088a1be3a1d86fd5b4360bb22aba768c530bbbcf007308`; the source must be the ordinary directory
`D:\Projects\Runalab\runaai-next-m1-gemma-primary\node_modules`, with exact `zod@4.4.3` and `pg@8.23.0`; and the local
target `D:\Projects\Runalab\runaai-next-native-control-host\node_modules` must be absent, including no dangling link.

The future one-command wrapper must perform these exact operations in one `try/finally` scope:

1. treat only `ItemNotFoundException` as target absence; reject any occupied target;
2. hash both lockfiles and reject unless both equal the digest above;
3. reject the source if it is missing, not a directory, or a reparse point, and read the exact Zod/pg versions from
   that source;
4. create only a junction at the exact local target, immediately re-open it, require `ReparsePoint`, exact
   `LinkType=Junction`, exactly one target, and ordinal-ignore-case resolved equality with the accepted source;
5. clear `NODE_PATH`, resolve the local `node_modules\zod\package.json` and `node_modules\pg\package.json`, and require
   both to resolve through that authenticated local junction before the reviewed test command;
6. in `finally`, re-open and re-authenticate the junction and its sole target, call the junction object's nonrecursive
   `.Delete()` only, prove the local path absent using the same dangling-link-safe lookup, prove the accepted source
   remains an ordinary directory, and re-hash both lockfiles;
7. aggregate the primary and cleanup errors so a cleanup problem cannot mask a test problem or be mistaken for green.

No junction was created while authoring this record.

```powershell
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
  & node --test --test-concurrency=1 gate7f/function-first/composition.test.mjs gate7f/function-first/server-workspace/control-worker-composition.test.mjs gate7f/function-first/server-workspace/native-authority-contracts.test.mjs gate7f/function-first/server-workspace/publication-owned-primitive.test.mjs gate7f/function-first/server-workspace/native-candidate-wiring.test.mjs gate7f/function-first/server-workspace/postgres-native-authority-source.test.mjs gate7f/function-first/server-workspace/postgres-native-interface.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "native deterministic gate stopped with exit $LASTEXITCODE" }
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

## Deliberately deferred gates

The signed manifest and every real native/watchdog/coordinator/materializer/TLS method remain blocked on gate 3 of the
approved design. No mock or source-only result can satisfy that gate. After deterministic tests and disposable
PostgreSQL each receive independent exact-byte authorization and pass once, Control must compile reviewed source,
seal every loaded source/binary/runtime/policy hash, and obtain a new independent five-part source/hash GO before the
single actual Control run. A first failure at any gate stops; it is documented and corrected before one fresh affected
run. No unchanged-byte retry is permitted.
