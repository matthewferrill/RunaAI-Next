# Installed owner-status proof

All three attempts are retained byte-for-byte in the adjacent `20260828-owner-status-r{1,2,3}`
directories. Each `EXPORT.json` binds its original seal, code and available operator responses.
The raw R3 result is decoded from its original collection envelope without reserialization.

- R1 ended before a result or worker record, with task result1. Its exact failed task was retired;
  the original directory and package remain. This did not prove native authentication.
- R2's diagnostic trap recorded the correct Matthew identity and an UnauthorizedAccessException in
  the worker phase before CLI dispatch. The trap could write into the same result directory.
  Ancestor metadata access in codex-audit's profile was the leading explanation, not an exact
  denied-path measurement. No access to that personal profile was expanded.
- R3 used a new protected ProgramData leaf, with the same ancestor/link checks. The fixed command
  `ps --json` ran as `RUNA-HOME\Matthew` at23:45:56–58Z on2026-08-28. It returned the exact empty
  list, retained unchanged engine/descriptor bindings and zero models before/after. The CLI used its
  ordinary local authentication privately; the wrapper did not read, copy, hash or disclose credentials.

R3 result:797bytes, SHA256 `3a48acdcb681d49609b29d3e17a87c5e2077bfcf00757bf7ce5cb784a8d70a45`.
Its task was subsequently verified terminal, with no matching worker or CLI process, and unregistered.
Cleanup receipt SHA256 `c17a01a3d5493406d4288818cc8bfc21a29c7ca1cdf2d1a2607f4886a194e247`.
All files remain recoverable on Home. No model, listener, native setting, TLS or production route changed.

This proves the installed owner authentication and bounded status-helper path only. It is not a
positive busy/queue test, admission closure, request drain, native lifecycle proof, unattended startup,
or guard qualification. Live legacy RunaAI independently calls Home1234 for primary/embedding work
and8412 for reranking; Next's9770 Caddy closure does not cover those callers. That operational access
must be preserved and its managed work coordinated before a native listener transition.

Five focused helper tests passed before R3. The complete earlier operator suite at42327df passed
145/145 with zero skips; neither count represents the as-yet-unimplemented owner lifecycle assembly.
