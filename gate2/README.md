# Gate 2 — selected core read-only continuity

Status: scope, baseline, and green criteria prepared for steward review on 2026-08-21. No Gate 2
implementation is authorized by these planning records.

Gate 2 extends the accepted Gate 1 stack slice to RunaAI's three answer lanes—general chat,
guarded/local chat, and explicit workspace comprehension—and to synthetic chat, project, and
allowlisted-settings continuity. It remains read-only with respect to external effects and legacy
or protected data. Synthetic PostgreSQL records may be created to prove continuity, restart, and
rollback behavior.

Review these records before implementation:

- `GATE2-SCOPE-AND-GREEN-CRITERIA-2026-08-21.md`
- `PARITY-CORPUS.json`
- `SOURCE-PINS.json`
- `VERIFIER-PROFILE.json`
- `BASELINE-RESULTS-2026-08-21.md`

The proposed implementation must stay on this gate branch until its evidence is reviewed. Gate 2
does not authorize protected-data access, production routing, persistent services, learning,
governed actions, security activation, model downloads, Qwen3.6 review, or live-BGE activation.
