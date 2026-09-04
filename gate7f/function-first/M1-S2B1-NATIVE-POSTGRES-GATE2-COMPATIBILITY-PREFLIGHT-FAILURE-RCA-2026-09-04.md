# Native PostgreSQL Gate 2 Compatibility preflight failure RCA — 2026-09-04

## Disposition

- Classification: operator/harness singleton-collection defect; not a product, PostgreSQL, test-result, or model failure.
- Candidate status: retained green at exact 3/3 on commit `8cdd4e459b7d66754ab5f1ec647de35c32ca4eb7` with complete cleanup evidence.
- Compatibility status: **STOPPED before setup**. Its Node test runner and disposable PostgreSQL service did not start.
- Observed error: `The property 'Count' cannot be found on this object.`
- Resume point: the same one-test Compatibility gate once, after correction, commit, independent review, and refreshed exact pins.

## What happened

The frozen wrapper selected `$expectedCompatibilityNames` through the output of a PowerShell `if` expression. PowerShell
enumerated the one-element array emitted by that branch, so assignment produced a scalar string. Under strict mode, the
next access to `$expectedNames.Count` failed. Candidate did not encounter the defect because its corresponding branch
emitted three names and therefore remained a collection.

The failure occurred before reviewed-HEAD checks, junction creation, artifact-root creation, Node, or PostgreSQL. Current
post-stop evidence shows a clean worktree, no `node_modules` entry, no live Candidate or Compatibility artifact root, and
zero Runa-owned PostgreSQL processes. No product, database, browser, Control, network-model, or model path ran.

## Root cause

The method assumed a single-element collection would preserve its collection shape when passed through a conditional
expression. PowerShell's output enumeration invalidated that assumption. This is a cardinality-dependent harness defect:
Candidate's three-item branch worked while Compatibility's one-item branch failed before execution.

## Same-shape audit

Every `.Count` access in the frozen wrapper was reviewed for possible scalar collapse:

- Git status, junction targets, process lists, selected TAP results, and directory listings are explicitly wrapped with
  `@(...)`.
- Regex match results are `MatchCollection` instances.
- Failure and observed-name accumulators are strongly typed generic lists.
- The process witness explicitly stores `owned = @($owned)`.
- Only `$expectedNames` was assigned from enumerated conditional output without a declared array type.

No second singleton-collapse shape was found in the wrapper.

## Correction design

1. Declare both configured name sets as `[string[]]`.
2. Declare the conditional selection target as `[string[]]`, forcing both the three-name and one-name branches to retain
   identical collection semantics.
3. Add a fail-closed runtime type assertion that the selected value is a `System.Array` before any `.Count` access.
4. Keep the exact name, exact count, hash, process, cleanup, and TAP checks unchanged; do not relax Compatibility.
5. After commit, independently instantiate and parse both Candidate and Compatibility modes and dry-evaluate the
   collection-selection preflight for cardinalities three and one without invoking the wrapper.
6. Resume only Compatibility once. Do not replay Candidate and do not assign product/model failure credit to this stop.

## Prevention

Mode-dependent PowerShell collections must be explicitly array-typed at the assignment boundary. Reviews must exercise
both multi-item and singleton control-plane shapes before authorizing a mode-specific run; parser success alone does not
prove runtime collection cardinality.
