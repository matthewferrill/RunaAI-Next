# Pre-inference acceptance seal raw-byte correction

The independent evaluator sealed the 36-case acceptance corpus in its detached worktree before any
acceptance inference. On integration into the original root worktree, raw verification correctly failed:
three shared dependency files were checked out as CRLF in the detached worktree but were already LF
in the original root worktree. Root's v1/v2 seals rely on their existing bytes and are not changed.

All 14 acceptance-sealed paths were compared read-only. Eleven matched byte-for-byte, including all
ten acceptance-owned source/rubric/test/configuration files and package-lock.json. The three differences
below are exactly CRLF-to-LF differences; UTF-8 text compared equal after CRLF normalization. No input,
expected answer, rubric, check implementation, test, runtime behavior, or original v1/v2 file was changed.

| Shared dependency | Detached bytes / original raw SHA256 | Root bytes / final raw SHA256 |
|---|---|---|
| gate7f/GATE7F-QUALIFICATION-AUTHORIZATION-AND-CRITERIA-2026-08-27.md | 8495 / 21a4f97193b297f0756e4e40e344e854b0c771ad0eba58a4c485157dc908534c | 8377 / 623c52fb907c3708ebbc50ec63e47235019d38a5dce8e754701d276055ebd034 |
| gate7f/contracts.mjs | 11519 / 6f2df637177857c344401c137fa38ede6586610281de6445084c631c553c9af3 | 11245 / 8ad0e09b67652939d0aec3c7d55f3494528efa629ad20496463c94f10c8d213c |
| gate7f/evaluation/contracts.mjs | 5784 / a9e25d34c8894c83dd10e514c8a50872bdee96603157053aa93068041fc4b6aa | 5665 / 6f55299051817b313188cba8350984025a98b9e2f491dc65791096ed6f2e7ab0 |

Only these three entries in acceptance/SEAL.json are repinned to the exact unchanged bytes already
present in root's runaai-next-gate7e worktree. Verification remains a strict raw-byte comparison; no
normalization was added to the verifier and no local source file was rewritten to satisfy the seal.
The prior pre-inference seal remains recoverable in commits 1e99457 and d0ad646. This correction occurred
before acceptance inference, without consulting diagnostic or acceptance model responses.

After this correction, running --verify in the detached evaluator worktree will intentionally report
false for those three CRLF shared files. The operational verification target is the original root worktree
containing the preserved LF shared dependencies. Root must verify all 14 raw hashes there after
cherry-picking this change and before acceptance inference. The acceptance source directory itself has
an LF .gitattributes pin to prevent repeat drift on its new files.
