# Stack bake-off toolchain manifest

Status date: 2026-08-20. These are portable lab artifacts under ignored `artifacts/tools/`; they are
not installed system-wide and are not production activation evidence.

| Component | Archive SHA-256 | Verification |
|---|---|---|
| Caddy 2.11.4 Windows amd64 | `1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf` | matched official release checksum |
| PostgreSQL 18.6 Windows x64 binaries | `fbe23da234ee31547bf8a36d29dfd81e82b849df2d2b78d2eecb43d360252f8c` | matched publisher checksum |
| Qdrant 1.19.0 Windows x86_64 | `980cb2e1ae771155cf211da8c0a8a9206b6482bd4effdc4db994d3adb707b087` | matched official release checksum |
| OpenTelemetry Collector contrib 0.159.0 Windows amd64 | `86434cf172aa91a5fc148978dad9bfaacd25a80bd2df93f19015814e7c5359bb` | matched official release checksum and retained checksum/signature metadata |
| OpenFGA 1.18.3 Windows amd64 | `66d3b57a6ed44379b85f91fc6121e02c7abeeeaf9e57da7ffdfd2d2a72566beb` | matched official release checksum |
| Keycloak 26.7.2 | `744ced2aee48932be2de935ff380085ebded737655c0986aa3512bbcec62f69b` | matched official release checksum |
| Eclipse Temurin JRE 21.0.12+8 Windows x64 | `b8aa18fef5edb69bee8618f99677d66d0873d22cb40d974c15ac9ffcdecf73ba` | matched Adoptium API checksum |

The local archive hashes were recomputed after the tests. PostgreSQL, Qdrant, Caddy, the Collector,
OpenFGA, Keycloak, and the test Java runtime were not registered as Windows services. All RunaLab
portable test processes were stopped at closeout.
