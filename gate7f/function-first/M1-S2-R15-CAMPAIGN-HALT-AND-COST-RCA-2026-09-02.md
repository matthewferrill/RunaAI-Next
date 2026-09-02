# M1-S2 R15 campaign halt, method-failure RCA and restart contract

Date: 2026-09-02

State: **campaign halted; documentation and preservation only**

Qualification effect: none

Production effect: none

## Executive record

R15 model testing is stopped. The Gemma simplified-contract arm has **zero scored attempts**. The latest
fresh model-free stage, `b230075b107b439480bfbecd64189e62`, completed 11 of 12 controls and stopped on
the browser control. Its retained record says `modelsInvoked:false`, `productionChanged:false` and
`protectedDataRead:false`. The browser reached the ordinary sign-in surface instead of the sealed synthetic
bootstrap. That is an operator-publication/method failure, not a Gemma result.

The proposed correction was not launched. Focused deterministic tests passed 5/5, but independent review
returned **NO-GO** because it relied on `Clear-Clipboard`. Direct checks on the actual operator host showed
that command is absent in both Windows PowerShell `5.1.26100.9168` and PowerShell `7.6.4`. The second final
review was interrupted after the first conclusive NO-GO to honor the steward's hard-stop rule and conserve
compute. No replacement was attempted and no new stage was created.

The campaign must remain stopped until the complete real operator workflow passes one standalone,
zero-model dress rehearsal on the exact hosts and shells that will perform the work. A component test,
mocked command, code review or partial browser proof is not a substitute for that gate.

## Impact and accounting

The steward reports that the repeated process consumed approximately two weeks of available credits and
multiple days of time. The repository cannot independently meter or allocate every account credit, so that
statement is recorded as steward-reported impact rather than a reconstructed billing total.

The auditable historical minimum remains:

- 30 countable fault-invalid campaign snapshots containing 1,579 recorded attempts;
- 1,369 attempts permanently discarded or made qualification-ineligible;
- 139 attempts later salvaged and 71 attempts retained in paused Qwen execution windows;
- at least 1,768 provider calls proven by exact retained evidence, plus 138 early retained outputs for
  which exact call totals were never published; and
- five additional R15 browser-publication preflight failures with zero model calls, plus later retained
  zero-model method-gate stages, which are deliberately not added to the 30-snapshot total because they use
  a different counting unit and some events overlap.

These counts come from the existing machine-readable non-model-failure ledger and RCA. They must not be
described as model failures. Some retained rows contain legitimate model-quality evidence, but none of the
30 snapshot dispositions was primarily caused by model quality.

## Root cause of the repeated failures

The primary process defect was architectural: live campaign stages were used as the first full integration
test of the harness, operator handoff and browser publication path. The repository had extensive unit and
model-free coverage, but the checks did not execute the exact end-to-end workflow on the actual PowerShell,
SSH, Edge, clipboard and timing environment. Each fresh run therefore exposed the next untested boundary.

Contributing causes were:

1. **Component success was treated as workflow readiness.** Mocks and narrow fixtures proved local logic,
   while actual command availability, shell coercion, browser connection behavior and operator timing were
   still unproven.
2. **The operator/browser layer was not a first-class tested product surface.** The handoff depended on
   manually transferred, short-lived state and behavior outside the sealed source tests.
3. **Failures were repaired serially.** Each narrow correction was resealed and taken back to a fresh stage
   before one complete zero-model dress rehearsal exercised every remaining boundary.
4. **Test and publication contracts drifted.** Archive counts, property ordering, line endings, timestamps,
   JSON types, directory expectations and process lifetimes were duplicated as handwritten assumptions.
5. **The hard-stop rule arrived too late.** Repeated method failures were retained correctly, but the process
   did not pause the whole campaign early enough for a method-wide RCA and host-real validation.
6. **Progress reporting followed planned steps rather than proven state.** This made displayed status and
   time estimates appear ahead of actual readiness and caused avoidable steward interruptions.

## Failure categories and durable disposition

| Category | What failed | Model attribution | Required durable correction |
|---|---|---|---|
| Harness/accounting | Attempt, continuation and grading logic sometimes treated infrastructure stops as candidate outcomes or restarted valid prefixes. | None | Preserve completed prefixes; classify before grading; pause without consuming an attempt; resume at the first unconsumed identity. |
| Archive/source publication | Stale source-entry counts, CRLF/LF hash differences and manually propagated pins rejected otherwise known source. | None | Build only from the supplied canonical archive; derive counts and pins from one manifest; reject checkout drift before launch. |
| Exact-set/transient paths | A validator-created transient directory caused the validator to reject its own stage. | None | Define and regression-test the complete post-preparation exact set, including validator-owned paths. |
| Timeout/resource lifetime | A 15-minute watchdog equaled a permitted 15-minute witness wait; later manual setup consumed sealed launch windows. | None | Resource lifetime must strictly exceed every permitted wait plus bounded cleanup; preparation must finish before the timed gate begins. |
| Shell/serialization | PowerShell 7 converted an ISO UTC string into `DateTime`; a handwritten sorted-key contract disagreed with actual `Sort-Object`; a fixture inverted `startupObservation:null`. | None | Test the real PowerShell 5 and 7 conversion/serialization behavior and derive schemas/order from producer output. |
| Process/relay lifecycle | Abandoned browser connections retained SSH children and exhausted relay slots; cleanup and fatal-state races followed. | None | Separately bound client slots and owned children; fatal on unconfirmed cleanup; prove listener and child settlement on the actual host. |
| Browser witness/publication | Blocked browser/origin choices, proxy timing/compression, UI reload state loss and duplicate publication caused repeated preflight stops. | None | Use the registered browser and same-origin neutral page; prestart transport; avoid reload; use one browser witness and one matching operator acknowledgement. |
| Operator handoff | A valid short-lived URL was displayed hours after expiry in one run; the latest V15 browser went to ordinary sign-in rather than sealed synthetic bootstrap. | None | Preparation, visible handoff, navigation, acknowledgement and cleanup must be one bound invocation with explicit live state and no stale display. |
| Browser-handoff correction | The rejected draft used nonexistent `Clear-Clipboard`; 5/5 selected tests did not exercise that host dependency. | None | Inventory and execute every external command on the target host; replace clipboard handling with an available, verified, bounded mechanism before any new gate. |
| Browser witness environment | Browser extension/configuration was initially suspected, but direct observation showed the environment was already enabled; timing and publication were the actual causes. | None | Diagnose from timestamps and retained receipts before attributing a host or model failure. |

The first independent review of the rejected handoff draft also found request-hash non-enforcement,
nested-path/reparse gaps, an expiry check that was too early, unsafe TTL coercion, malformed in-flight state
acceptance, unconfirmed nested SSH cleanup and advisory-only clipboard clearing. Those findings were corrected
in the preserved rejected draft. They do not make that draft releasable: the later actual-host command
failure is independently sufficient for NO-GO.

## Evidence that remains valid

- R14 is a closed campaign with 360 immutable model attempts, 12 controls and candidate-blind independent
  review. It is not restarted or erased by this halt.
- R14 scorecards remain Gemma `24/23/24/24/7`, Qwen3 Coder `23/22/24/21/20`, and Qwen3.6
  `18/22/24/21/21` across Chat, Research, Code, Agent and Review.
- R14 provides qualifying evidence for Chat, Research, Code and at least one Agent route. Review still has
  no 22/24 route. Product qualification remains false.
- R15 has no model evidence. Its method-only stages and preflights are retained for RCA, not scoring.

## Git audit chain

The unsafe draft is intentionally preserved without leaving it active at the branch tip:

1. `ae69d6e416a29e6ccb73bc2ca4fc360cadd4e822` — `Record rejected R15 browser handoff draft`.
   This stores the exact proposed implementation, focused tests and contemporaneous review state.
2. `7445d0044c549c0ca8710eb5fc8f47a2670f5270` — `Revert "Record rejected R15 browser handoff draft"`.
   This removes the rejected implementation from the active tree while preserving the first commit forever.

Historical untracked artifacts are intentionally retained and were not broadly staged, cleaned, reset or
rewritten. Only explicit documentation paths are included in the final halt publication.

## Mandatory restart contract

This section is a safety gate, not permission to resume.

1. Keep all model leases, provider calls and campaign identities disabled.
2. Replace the rejected clipboard operation with a mechanism proven available on both required shells, or
   remove clipboard dependence entirely. Test real set/read/clear behavior without retaining a capability.
3. Inventory every external executable and command used by the operator, including PowerShell, SSH, Edge
   launch/control and clipboard operations. Fail before stage creation if any dependency is absent.
4. Execute one complete zero-model dress rehearsal on the exact operator and Home hosts. It must include
   source verification, stage creation, preparation, synthetic bootstrap, visible browser navigation,
   witness, acknowledgement, expiry, cancellation, process-tree cleanup and retained receipts.
5. Use no mock for a host dependency in the release decision. Deterministic tests may remain, but host-real
   evidence is mandatory in addition to them.
6. Obtain an independent GO review of the actual dress-rehearsal evidence and active branch bytes.
7. If tracked helper bytes change, create and independently verify a fresh sealed package. Never reuse V15.
8. Permit exactly one fresh model-free gate after the dress rehearsal. If any control, browser, operator or
   cleanup step fails, stop again immediately; document and correct the method before any other run.
9. Only after that gate is green may the steward separately decide whether the zero-attempt Gemma arm is
   worth the remaining compute. No automatic model-test resumption is authorized by this document.

## Current stop state

- Campaign: halted.
- Active fresh stage: none authorized for continuation.
- Gemma simplified arm: 0/120 scored attempts.
- New model/provider calls after the V15 failure: zero.
- Production route changes: zero.
- Protected-data reads by the V15 stage: zero.
- Rejected browser-handoff code at branch tip: absent by explicit revert.
- Next permitted work: documentation, offline diagnosis and the zero-model restart contract above.

Related records:

- `M1-S2-CAMPAIGN-HARNESS-RCA-AND-CONTINUITY-CORRECTION-2026-09-01.md`
- `acceptance/evidence/20260901-non-model-failure-ledger.json`
- `../../MIGRATION-STATUS.md`
- `../../roadmap/CURRENT-SLICE.md`
