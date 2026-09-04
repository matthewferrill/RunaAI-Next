# M1-S2B1 Native Gate 3 activation-test method stop and systemic RCA

Date: 2026-09-04  
Source under test: uncommitted activation/configuration change after `f567a30`  
Disposition: `STOP` before Native build or execution  
Model, browser, network or PostgreSQL operation: none  
Production or protected data changed: no

## Exact stopped result

The bounded command selected two Gate 6B cases. The new strict/default-off server-workspace configuration case
passed. The Native-before-resources ordering case failed at `gate6b/model-role-providers.test.mjs:118` while comparing
whole-file `indexOf` positions. It reported one pass and one failure. The worktree-local dependency junction was
removed after the command and `node_modules` is absent.

The application did not fail. The assertion searched for the first textual occurrence of
`await readSecretReference(`, found its earlier helper definition rather than the resource-acquisition call inside
`createProductionComposition`, and therefore produced a false ordering result. No Native process, secret read,
sandbox construction, pool construction, database connection or model request occurred.

## Full issue shape

This is not a one-line needle defect. Whole-file source-text ordering is not execution evidence: an import, helper
definition, comment, duplicate branch or formatting change can satisfy or defeat it without changing runtime
behavior. The same failure shape was audited across the repository before any retry.

Active Gate 3 assertions requiring correction are:

- `gate6b/model-role-providers.test.mjs:112-120`, the stopped assertion;
- `gate7f/function-first/server-workspace/native-candidate-wiring.test.mjs:75-112`, where whole-file `indexOf`,
  `lastIndexOf` and greedy regular expressions currently stand in for attachment, cleanup and admission ordering;
- `gate7f/function-first/server-workspace/control-worker-composition.test.mjs:767-773`, whose source-layout checks
  must remain static prohibitions rather than runtime acceptance.

The audit also quarantined the same method family for correction when its owning lane next opens: Gate 7A certificate,
credential, LAN and ordinary-access source tests; Gate 7C UI-shell and Gate 7D navigation source tests; Gate 7F Control
deployment, exact-regression, Omen-local diagnostic, owner-status, runtime-installation, readiness and native-settings
source-order tests. Passed actual-system evidence is not replayed or retroactively converted into a failure; these
static checks may not be reused as sole execution/acceptance evidence.

## Systemic correction

1. Runtime ordering is proved through an imported production entrypoint and observable effects, not positions in a
   source file. The replacement Gate 6B case builds an actual temporary release artifact and external release
   manifest, loads the strict v3 configuration, invokes the real `createProductionComposition`, and enables Native
   against an actual absolute path occupied by a regular file rather than a directory.
2. The real Native root-identity check must stop that call with the exact
   `native-candidate-config-root-identity-invalid` code before consulting the current Native manifest. This remains
   stable after that manifest is sealed. Missing secret files, missing sandbox runtime and no
   PostgreSQL service make an earlier resource acquisition produce a different failure. The case also proves that
   the transient sandbox directory was never created. This is a real fail-closed product path; no model, fake database,
   fake executor or mocked production resource supplies the outcome.
3. The active Native-wiring lane must replace its source-layout ordering assertions with imported factory behavior,
   an explicit event/ownership trace and cleanup/failure observations. Static source checks remain allowed only for
   clearly labeled forbidden-import/forbidden-fallback invariants.
4. Every unavoidable static structural check must scope inspection to the intended function or AST node, first prove
   that each target exists exactly once, and never compare an unchecked `-1` position or a whole-file greedy match.
   It cannot claim runtime or actual-system acceptance.
5. The quarantined inventory is corrected prospectively by owning lane rather than triggering broad-suite replay.
   Any newly encountered assertion of this family stops before execution and receives the same method treatment.

## Resume rule

The failed case may run once on corrected bytes only after independent review returns `GO P0=0/P1=0` for the method.
Run only that affected case; do not replay the already-passed configuration case, Gate 1, Gate 2, any browser journey
or any model campaign. A further failure stops again with its exact evidence and a new RCA.

## Corrected affected-only result

Independent review returned `GO P0=0/P1=0` after replacing the manifest-dependent failure with the stable regular-file
root-identity case. The one previously failed case then passed 1/1 on Omen with Node `v22.22.0`. The exact production
entrypoint stopped at `native-candidate-config-root-identity-invalid`; the transient root remained absent. The
authenticated dependency junction was removed and `node_modules` is absent. No already-passed case or earlier gate was
replayed, and no Native process, PostgreSQL connection, network request, browser or model was invoked.
