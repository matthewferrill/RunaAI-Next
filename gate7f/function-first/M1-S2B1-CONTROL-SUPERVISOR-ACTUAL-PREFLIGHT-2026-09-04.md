# M1-S2B1 actual Control supervisor preflight

Date: 2026-09-04  
Source: `878364308965c3af2c9362acf6b1bdcb00ead02b`  
Scope: one affected Control-local supervisor case; no model, browser, database, service or production route

## Retained stop

The first invocation used Control's ambient `node` command and stopped before PowerShell or the supervised child.
The observed version was `v24.19.0`; the reviewed runtime contract requires `v22.22.0`. This is an operator runtime-
selection failure, not a product, supervisor or model result. It is the exact already-documented failure shape in
`M1-S2B1-NATIVE-GATE3-PREFLIGHT-RCA-2026-09-04.md`: Control's ambient Node is not an accepted substitute for the
sealed release runtime. No unchanged-byte retry or broader suite was run.

## Corrected affected-only resume

The established release runtime was verified before execution:

- path: `C:\AI\RunaAI-Next-Candidate\releases\runaai-next-gate7a-lan-gate7e-2026-08-26-747aabc\runtime\node.exe`
- version: `v22.22.0`
- SHA-256: `bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb`

Only the affected v2 case resumed:

`v2 writes one 64-byte bound admission before resume and uses only the replacement environment`

Result: `1/1` passed. The durable terminal record reported `terminalRetained:true`, `outcome:"terminal"`, exit code
`0`, `timedOut:false`, `outputLimited:false` and `activeProcesses:0`. This proves the corrected supervisor package can
run on actual Control with Windows PowerShell 5.1, its native job helper, sealed Node 22.22.0, one-use authenticated
admission and the replacement child environment.

It does not prove MXC eligibility, PostgreSQL ownership, Native transport, browser acceptance or model behavior.
Those stages remain paused until their own prerequisite is green.
