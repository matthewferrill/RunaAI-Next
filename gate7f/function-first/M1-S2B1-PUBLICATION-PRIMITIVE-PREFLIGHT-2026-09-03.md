# M1-S2B1 publication primitive preflight

Date: 2026-09-03  
State: deterministic preflight green; actual Windows and Control acceptance open

This stage adds the deterministic contract for publishing one fully materialized, digest-bound server workspace.
The primitive opens a pre-authorized NTFS parent without following links, inspects the exact staging and final
siblings, verifies every manifest entry and identity, flushes the file and directory evidence, and permits one
write-through, non-replacing sibling move. It never deletes an entry or mutates PostgreSQL. Instead, it returns an
exact reconciliation proposal for the authoritative database transition.

The first green draft was stopped by independent review at P1=3. Malformed sibling observations could be treated as
absent, non-flush inspection handles were not all owned, and an indeterminate move could be described as confirmed.
The first correction was also stopped at P1=3 because accessible handles were still validated before ownership,
duplicate inspection handles could terminate the ownership scan before later handles were captured, close failures
were swallowed, and one stable failed-move result lost the fact that a mutation had been attempted. The builder's
intermediate PASS report was therefore rejected; the tests had not covered those adversarial paths.

The final correction owns every accessible returned parent or sibling handle before validation, scans all inspection
results even after malformed or duplicate entries, attempts every close, and requires the host to retain every handle
whose close fails. Failure to retain any such handle fails the operation closed. A failed move that leaves the exact
staging tree in place now reports `filesystemMutationAttempted: true` and
`filesystemMutationConfirmed: false`. Replacement and deletion remain unauthorized.

Focused materialization/publication compatibility passes 29/29. A fresh independent review returned PASS with
P0=0/P1=0. This is local deterministic contract evidence only. It does not prove the Windows native host,
`MoveFileExW`/`FlushFileBuffers` behavior, crash recovery, the Control worker/Job boundary, PostgreSQL CAS execution,
cleanup execution, a ready workspace, browser use, production change, or model behavior. Those claims require the
specialized Control host and one actual Control/browser journey.
