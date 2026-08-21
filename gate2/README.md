# Gate 2 — selected core read-only continuity

Status: Gate 2A was approved by the steward and the bounded synthetic implementation completed on
2026-08-21. Deterministic and disposable real-stack evidence is green. Gate 2B evidence acceptance
is now required; merge remains separately protected by Gate 2C.

Gate 2 extends the accepted Gate 1 stack slice to RunaAI's three answer lanes—general chat,
guarded/local chat, and explicit workspace comprehension—and to synthetic chat, project, and
allowlisted-settings continuity. It remains read-only with respect to external effects and legacy
or protected data. Synthetic PostgreSQL records may be created to prove continuity, restart, and
rollback behavior.

Review these records for evidence acceptance:

- `GATE2-SCOPE-AND-GREEN-CRITERIA-2026-08-21.md`
- `PARITY-CORPUS.json`
- `SOURCE-PINS.json`
- `VERIFIER-PROFILE.json`
- `BASELINE-RESULTS-2026-08-21.md`
- `GATE2-RESULTS-2026-08-21.md`
- `evidence/STUB-INTEGRATION-RESULTS.json`

The implementation must stay on this gate branch until its evidence is reviewed. Gate 2
does not authorize protected-data access, production routing, persistent services, learning,
governed actions, security activation, model downloads, Qwen3.6 review, or live-BGE activation.

Commands:

```powershell
npm.cmd run test:gate2
npm.cmd run verify:gate2:integration
```

`npm.cmd run verify:gate2:models` is intentionally dormant unless the steward separately approves
live validation and the caller supplies `GATE2_MODEL_VALIDATION_APPROVED=yes` plus an already-running
private endpoint. The harness never downloads, starts, or reconfigures a model.
