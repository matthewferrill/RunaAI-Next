# Supplied source preservation — prospective correction

M1-S2, 2026-08-28. The running three-model comparison remains on frozen application
`9556ed01f9dbabe8c93eea309e482aad60bf809f` and seal `416102ff…`. Its observations,
model failures, incomplete responses and inconclusive checks are not regraded.

Independent review found six supplied code sections in five Review cases whose
stored content omitted the original trailing LF. `sources.mjs` applies Zod
`.trim()` to content before encryption and hashing. The frozen citation verifier
correctly requires the supplied source bytes; it cannot establish that binding
when the application silently transforms them. Label normalization is separate.

The corrective product contract is to retain the exact valid UTF-8 text supplied
by the user, including indentation, leading/trailing whitespace, LF/CRLF, BOM and
Unicode. Empty or whitespace-only text remains invalid. The existing 8,000-code-
unit limit applies to the original supplied string, not a trimmed replacement.
Ill-formed Unicode that cannot round-trip through UTF-8 is rejected before any
database/index effect. Labels keep their existing normalization and limits.

The encrypted canonical content, returned digest/length, selected source,
embedding input and derived reference must all describe that same text. An exact
retry remains idempotent; reusing a request ID with changed whitespace is a
conflict. No existing source is rewritten, rehashed, reindexed or migrated. No
production, protected or historical test store is modified by this correction.

Required proof: schema rejection before database/index access; real disposable
PostgreSQL attach/reopen/retry/index-repair preserves LF, CRLF, indentation and
Unicode exactly; digest/length agree with original bytes; whitespace-only,
raw-over-limit and ill-formed inputs fail; differing-whitespace retry conflicts;
existing isolation/encryption/tamper tests remain green. Vector/citation integration
must retain the same canonical binding. Do not normalize the oracle to hide loss.

Implement only in the development checkout while the matched diagnostic campaign
continues unchanged. Qualification of corrected code requires a new explicit
source/seal and corresponding integration evidence; old results are not promoted
by this document or by a local unit-test pass.
