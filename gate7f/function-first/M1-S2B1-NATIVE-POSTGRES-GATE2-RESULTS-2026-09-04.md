# M1-S2B1 Native PostgreSQL Gate 2 results — 2026-09-04

## Result

Native PostgreSQL Gate 2 is **passed** on the actual owned disposable PostgreSQL boundary.

- Candidate: 3/3 exact top-level tests passed once at clean commit
  `8cdd4e459b7d66754ab5f1ec647de35c32ca4eb7`.
- Compatibility: 1/1 exact top-level test passed once at clean commit
  `5a6aaade1a01ad5bcbe7f3e21ab4ea0d372ec2a9`.
- Candidate cleanup receipt: PID `28548`, controlled stop requested, exit `0`, terminal exit confirmed, owned synthetic
  data removed, `productionChanged=false`.
- Compatibility cleanup receipt: PID `5836`, controlled stop requested, exit `0`, terminal exit confirmed, owned
  synthetic data removed, `productionChanged=false`.
- Both wrappers observed seven unrelated PostgreSQL processes before and after and touched none of them. Both removed
  their authenticated dependency junction and green artifact root and left the reviewed Git worktree clean.

The exact Candidate cases were:

1. `candidate PostgreSQL: migration, signed admission, convergence, scope, and atomic begin`
2. `candidate PostgreSQL: effect and publication CAS, ready atomicity, and durable tamper denial`
3. `candidate PostgreSQL: restart lookup preserves every candidate lifecycle branch`

The exact Compatibility case was:

`real PostgreSQL retains encrypted scoped source authority and idempotent intent`

## Final exact pins

- Helper: `E289CE4DD04F840EACBE468F1516DAB01EA74568B115D6C4565BD683B893D145`
- PostgreSQL source: `4A9470845CD65CCAC5C483E677A2C8112E3139E6312810DF4C826287D64AEADE`
- Candidate fixture: `0580A31EF05CE51FA09770604EBA62EF2B6FF17B806F45C58467A4CD61B86027`
- Compatibility fixture: `90CBB5EC74522A291679AC103E952C74212A983D74813E6706E53B810CB851A2`
- Outer-join lock invariant: `71D5C35D76E126937C8DC03203A79A8B37EDE65D90834957A80279405343E026`
- Final preflight: `BF2A8CF37FCCA614178F8BC962071913E49D48D0229CD924325F99A3B97227C9`
- Candidate substituted wrapper: `5CEF79684F99ABDAED777013A4FC634DB4A831D102AFAFCB18A179E618EBD464`
- Compatibility substituted wrapper: `86AC41D95637F1903064B54B5B392E35F1A46F1FC721715454E3E9248F18A74C`

## Stops, RCAs, and correction continuity

Every stop was retained and corrected before the affected stage resumed:

1. A transient broad-prefix sentinel scan rejected intentional guard text before wrapper compilation. No test or
   PostgreSQL process started. The exact-value substitution rule replaced it.
2. Four unbraced PowerShell interpolations prevented wrapper compilation. No test or PostgreSQL process started. The
   wrapper was corrected and a parser-zero-error gate was added.
3. The first actual Candidate run reached PostgreSQL and exposed SQLSTATE `0A000`: an unqualified `FOR UPDATE` tried to
   lock the nullable side of a `LEFT JOIN`. All three cases stopped at that one shared initialization statement. The
   product query now uses `FOR UPDATE OF workspace_row`; a systemic audit found the only other outer-join lock already
   correct, and the deterministic invariant now inventories every direct outer-join/row-lock query, requires exactly
   one lock clause, and pins the sole concrete target.
4. The first Compatibility invocation collapsed a one-name array through PowerShell conditional output and failed on
   `.Count` before setup. Both name sets and the selection boundary are now `[string[]]`; the complete wrapper `.Count`
   surface was audited and singleton/multi-item dry evaluation passed.

The failed Candidate transcript was preserved without deletion at
`artifacts/runs/m1-s2b1-postgres-lifecycle-failure-20260904-sqlstate-0a000`. Its stdout SHA-256 is
`093D7D5083C9F0E4FF7F4EE7B1D764250313D5A992DA63EA2BB16E0440818D79`; empty stderr is
`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

Detailed records:

- `M1-S2B1-NATIVE-POSTGRES-GATE2-PREFLIGHT-FAILURE-RCA-2026-09-04.md`
- `M1-S2B1-NATIVE-POSTGRES-GATE2-CANDIDATE-FAILURE-RCA-2026-09-04.md`
- `M1-S2B1-NATIVE-POSTGRES-GATE2-COMPATIBILITY-PREFLIGHT-FAILURE-RCA-2026-09-04.md`

## Boundary and next gate

This result proves the reviewed Native authority/store behavior on an actual disposable PostgreSQL service. It does not
prove the Native executable, Control topology, public Git, protected filesystem publication, browser, model, release,
production, or customer path. Candidate was not replayed after its pass, and Artifact, Agent, model, and earlier green
tests were not replayed.

The next independent gate is Gate 3, Native source/build/hash: compile only the reviewed native host/workers on Control,
run the bounded source/topology/native checks without public Git, seal all inputs/outputs into the release manifest, and
obtain the required independent five-part exact-byte GO before one actual Candidate Control run.
