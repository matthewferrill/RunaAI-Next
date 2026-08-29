# Exact receipt-scope correction results

Date: 2026-08-28. Source commit `1738aff9451724f65ae4159ef178ede2cb9d8deb` was exported with `core.autocrlf=false` into a new owned staging directory before execution. The source archive SHA-256 was `28c1590d71987772c1b9be63217940895be168053a1fc5ba0fd68697485d664a`.

All eight source hashes recorded by the regression exactly matched their Git-object bytes and their extracted archive bytes. The actual disposable PostgreSQL/LangGraph suite passed 70/70 with zero failures, skips, or cancellations. Its targeted regression directly compared intent counts before and after the narrowed-grant planner guessed the omitted restore receipt, in addition to checking unchanged plans, proposals, receipts, and adapter effects.

PostgreSQL stopped, owned synthetic data was removed, and the exact-source staging directory/archive were removed only after the following immutable evidence was retained:

- `evidence/20260828-receipt-scope-r2-exact/tests.tap`: SHA-256 `0077d596049aa8517525da3ff0b20045d3adef52b30b49939fbec24fa651ca45`;
- `evidence/20260828-receipt-scope-r2-exact/result.json`: SHA-256 `756eccf2aa877b69730e27cf31d77d8a738828a5d64c4a3bdc06f88314d08f9b`;
- `evidence/20260828-receipt-scope-r2-exact/SEAL.json`: SHA-256 `2a3da6a9fa3c902e27e0e482aaa919f4c73419b5bbfb4a467d83b6a1b4662afe`.

No production database, private content, model route, service, or protected state was accessed or changed. This result closes only the restore-receipt planner-input finding.
