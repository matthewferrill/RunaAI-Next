# Gate 2 planning baseline — 2026-08-21

Status: read-only/synthetic planning evidence. This is not Gate 2 implementation evidence.

## Verified repositories

| Checkout | Branch | HEAD/tracking | Working tree |
|---|---|---|---|
| `D:\Projects\RunaAI-Next-gate2` | `runa2/gate-2-read-only-continuity` | created from `origin/runa2/integration` at `7107ead` | planning files only after branch creation |
| `D:\AI\Projects\RunaAI` | `main` | `71ce985`; `origin/main` also `71ce985` | only pre-existing untracked `.claude/settings.local.json` |
| `D:\Projects\Runalab` | `main` | `ec5e346`; `origin/main` also `ec5e346` | clean |

The RunaAI and RunaLab source repositories were not edited. No fetch, service activation, model
download, protected-store read, production route, or provider reconfiguration was performed there.

## Required-reference review

The current RunaAI-Next repository instructions, migration status, architecture assessment, port
estimate, RunaLab completion report, stack bakeoff, model-role findings, Gate 0 contract/corpus/green
thresholds, and Gate 1 results were reviewed before proposing Gate 2.

The current legacy handoff and the following Gate 2 behavior references were inspected at the pinned
legacy commit:

- `docs/RUNAAI-WORKSPACE-COMPREHENSION-LWA1-1.md`
- `docs/RUNAAI-MEMORY-AND-STATE.md`
- `docs/RUNAAI-PRIVATE-CHAT-AND-PERSONAL-LEARNING.md`
- the three answer-lane, answer-loop, chat, project, settings, routing, context-budget, citation,
  injection, reachability, identity, and continuity source/test files pinned in `SOURCE-PINS.json`.

## Safe focused baseline

Runtime: exact Node `v22.22.0`.

Thirteen focused legacy commands ran using in-memory, stubbed, static, or temporary-directory data:

| Suite | Result |
|---|---|
| Answer loop | PASS |
| Workspace comprehension LWA1.1 | PASS |
| Chat store | PASS |
| Project store | PASS |
| Settings store | PASS |
| Session references | PASS |
| Citation verification | PASS |
| Citation enforcement | PASS |
| Injection screening | PASS |
| Router behavior | PASS |
| Role context budgets | PASS |
| Reachability | PASS |
| Model roster, health servability, and lane wiring | PASS |

After execution, legacy RunaAI remained at `71ce985`, tracking `origin/main`, with no new working-tree
entry beyond `.claude/settings.local.json`.

## Explicitly not executed

The broad chat-lane, command-runner, project-memory-boundary, and household-identity observers are
pinned but were not executed during planning where their default construction could consult the
legacy checkout/runtime or where owner/device behavior is outside Gate 2. Gate 2 must replace those
joins with explicit synthetic dependency injection before claiming executable parity.

No Gate 1 regression suite was rerun merely to prepare these planning records. Its accepted results
remain the entry evidence; all Gate 0 and Gate 1 regressions are mandatory again during Gate 2
implementation and final evidence.

## Baseline conclusions

1. The new stack foundation is merged and available for extension.
2. The legacy behavior contracts needed for Gate 2 are identifiable and hash-pinned.
3. Chat/project/settings continuity can be tested without touching real encrypted stores.
4. The largest implementation risk is a join defect where a shared answer gate reaches only one or
   two of the three lanes.
5. The largest data risk is accidentally allowing a default legacy adapter or default path to open a
   real local store. Gate 2 therefore requires explicit synthetic repositories at every constructor.
6. Qwen3.6 and live BGE remain deferred; neither is an entry requirement for this gate.
