# Current slice: Milestone 1, function-first Runa

Roadmap revision: 2026-08-28.1
Milestone: M1
Slice ID: M1-S1
Status: in progress, acceptance frozen before implementation; not complete or production-qualified.

Read `PRODUCT-ROADMAP.md` first. This slice is the first milestone only; it does not replace, complete
or retire the rest of the roadmap. All 17 capability families remain tracked in `capabilities.json`.
The current Git branch continues the existing Gate 7F foundation descended from integration `f092d358`;
it preserves local documentation `0702210` and prior qualification `be094bd`. No integration merge,
production route switch or protected-data change is represented by this contract commit.

## Authorization and correction to the old sequence

On 2026-08-28 the steward directed the full roadmap to be hardened, documented, retrieved for every
next-slice decision, committed and pushed, then authorized whatever non-destructive work is needed for
this first milestone, with human involvement for actual testing rather than recurring approvals.

This supersedes the old requirement to select a model before building/testing real disposable project
functions. Build the shared functions, test them deterministically, run all three candidates through
the same functions, then select by role. Old sealed results and prior scope decisions remain historical
evidence; this dated amendment does not rewrite them.

## Immediate order and finite deliverables

1. Publish the roadmap, retrieval guard and this acceptance contract before product implementation.
   The contract commit is `333912a`. Publication initially stopped at the environment check; after the
   steward reaffirmed the existing permission, an ordinary fast-forward push succeeded on 2026-08-28.
   GitHub's `codex/gate7f-agent-foundation` tip was verified as
   `25494137b755828adaef66b72822a4b1258446d3`, including the roadmap and M1-S1 wiring. The publication
   blocker is resolved; it is not a new permission gate for the already authorized M1 work.
2. Add independently selectable model roles behind the existing provider interface. Preserve legacy
   single-model configuration and exact rollback. No model chooses its own authority or fallback.
3. Diagnose Qwen3.6's retained timeout failure and validate three-model runtime readiness; do not silently
   omit it, change the denominator or download a substitute. Root owns Home residency and verifies exact
   artifacts before running one large model at a time. This can run alongside independent local work.
4. Complete each function below through the real application architecture, starting with chat and
   context. Reuse working code. At each function: deterministic checks -> matched model task attempts ->
   actual application route/journey -> independent evidence review. Do not build another mock-only demo.
5. Wire the bounded customer UI and validate recovery/loading/role choices under the intended operating
   profile. Expose a usable test to the steward only after the automated acceptance passes.
6. Retain exact release/rollback evidence and publish the accepted scope. No winner is assumed; if a role
   fails, retain the working route, correct the specific defect and rerun affected fresh acceptance.

## Five functions and customer acceptance scenarios

Each function needs at least eight distinct, prospectively frozen scenarios, three attempts per model
where the model participates. Repetitions are reported separately from unique tasks. Model-free control
tests run once per implementation/version, not three times merely because three models exist. Development
fixtures and known failures are regressions, not unseen acceptance. Freeze the final scenario bundle,
role-specific time/context/output budgets and versioned runtime settings before scored model responses.
This document freezes the implementation acceptance baseline, not the later scored-run corpus/runtime
seal. That separately committed seal is required before model qualification begins.

| Function | Capability IDs | Required scenarios (minimum coverage, not eight restatements of one task) |
|---|---|---|
| Chat/continuity | C01 C02 C15 C16 | new login/new chat; reopen and continue; correct current-turn topic; preserve explicit constraints; meaningful rewrite/summary; sign-out/in recovery; separate projects/users; provider/incomplete-response recovery without saving a false completed turn |
| Approved-source research | C03 C04 | retrieve relevant sections through selected adapters; exact citations; conflicting versions; honest missing evidence; unauthorized-source denial; revoked/stale source exclusion; injected instructions/fake receipt rejection; source/dependency loss without fabricated support |
| Bounded real Code | C06 C07 | inspect project; create a function; change existing function; execute passing tests; observe/fix failing tests; reject unsafe/outside-root access; detect concurrent/stale changes; restore an exact owned change and re-run verification |
| Conversational actions | C12 C15 | plan then execute/observe; read-only denial; ask-every-time approval; bounded safe-autopilot; revoke before effect; cancel/stop; restart/duplicate reconciliation; truthful pending/failed/completed/rolled-back display |
| Deeper review | C02 C06 | cross-file bug; long-document contradiction; current vs obsolete policy; planted security issue; unsupported assertion; evidence-backed explanation; malicious quoted tool result; honest insufficient-context report |

Minimum model quality remains >=90% acceptable task attempts and zero critical failures for each
reported role. Exact contract checks and mandatory product scenarios require 100%. Report a task's final
success and any repaired model mistake separately. A model that cannot run is `blocked`, not passed,
and remains on the roster with diagnostic evidence. No role can be selected without its own evidence.

## Concrete M1 execution/data boundary

- Use isolated, disposable projects with generated non-private fixtures. Real filesystem effects must
  be contained in application-created roots, reject symlink/reparse/path escapes and have exact pre/post
  hashes. No legacy repository or real household project is a test fixture.
- First code envelope: JavaScript text/project files and explicitly selected tests, actual execution
  through the reviewed local isolation boundary, finite wall-clock/memory/output/process budgets, no
  stdin/secrets/network. Preserve the existing Gate 7E primitive; no unrestricted terminal, package manager,
  Git publication, deployment, desktop automation or connector is silently enabled by M1.
- PostgreSQL owns durable task/grant/receipt/effect state; LangGraph owns resumable workflow state.
  Do not promote the synthetic in-memory snapshot adapter or introduce JSON files as another authority.
- Keep trusted application state separate from source/tool text. Recheck actor/project/task/grant,
  expiry, revocation, exact arguments and current state immediately before the effect. Receipt text in
  a file is never execution evidence. An uncertain after-effect crash requires reconciliation, not rerun.
- Research in M1 means explicitly supplied/project-authorized sources. The actual Nomic/Qdrant/windowed
  BGE path must be tested when search is required; direct explicit-source reads are not relabeled vector
  search. Live web is C04/M2, visibly remaining work rather than an unmentioned permanent limitation.
- Chat does not silently gain project executors. Owner/admin/learning/recovery controls are unchanged.
- Synthetic candidate data only; do not open private conversations or protected stores for evaluation.
  No production model-routing change until exact candidate/customer checks and rollback pass.

## Completion evidence and rollback

For each delivered function retain source commit, deterministic test results, exact scenario/model/runtime
pins, every model attempt, independent output/effect checks, application-route/browser evidence and
remaining limitations. The selected function must work without the evaluator injecting its expected
answer or bypassing the application's scope/approval path.

M1 closes only after all five functions have accepted evidence, three-model dispositions are explicit,
the user completes the bounded customer trial, and the deployed scope/recovery is reconciled. A partial
module commit is progress, not M1 completion. Keep the current release/config as predecessor; roll back
only the candidate route/owned effects, preserving later user data. A failed trial returns the affected
function to work without erasing passed historical evidence or unrelated roadmap items.

## Next implementation slice

M1-S1: role-separated provider contract and compatibility wiring, with current-state/receipt acceptance
requirements captured for the later project tools. This is first because all three model comparisons and
real functions need a common boundary. No three-model result, new project executor or product release is
claimed by M1-S1. Human testing is not needed until the candidate customer journey is ready.

Local implementation update, 2026-08-28: M1-S1 source wiring and deterministic verification now pass;
see `../gate7f/function-first/M1-S1-RESULTS-2026-08-28.md`. This does not close the five-function milestone.
The next-slice decision must retrieve this roadmap and record its own finite acceptance before extending
chat/context and real project functions. The Qwen3.6 readiness plan is
`../gate7f/function-first/QWEN36-READINESS-PLAN-2026-08-28.md`; it can run alongside shared function work.
Neither the old two-arm runner nor its seals may be widened in place.
