# Slice selection record

- Selection date and source commit:
- Roadmap revision and SHA-256 from `node roadmap/read-next-slice.mjs`:
- Milestone and capability IDs:
- Current baseline/evidence and what is not yet proved:
- Why this slice is next; dependency IDs, exact required behavior subsets and their accepted evidence
  (not whole-family completion):
- Included behaviors and explicit exclusions:
- Model-independent interfaces and relevant model candidates:
- Deterministic tests, fresh functional scenarios and independent outcome checks:
- Exact runtime/data/identity/network/resource boundary:
- Failure classification, stop conditions, cancellation and reconciliation:
- Rollback preserving user work:
- Required customer test (or why none is needed yet):
- Remaining capabilities after this slice (never equate a slice with the whole roadmap):
- Source/result/commit/publication handoff:

Retrieve the roadmap before making this decision. Never inherit a scope reduction from a prior slice's
exclusions. They constrain that slice, not the destination. Product permissions still apply, but the
steward's standing implementation authorization is not a reason to ask for the same permission again.
