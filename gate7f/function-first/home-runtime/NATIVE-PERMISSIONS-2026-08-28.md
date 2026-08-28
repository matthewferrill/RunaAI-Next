# Installed LM Studio token permissions: scoped finding

The installed Home LM Studio0.4.21 source was inspected read-only at18:43:48Z. Its24,258,428-byte
`index.js` matches the previously pinned SHA256
`6cbb7ba8dfeefee1ce523a88e0f9d64687cdad59564ee5e7fbff6bb95d00f22f`.
No vendor code was executed, credential store read, token created, settings changed, or model called
by that static inspection. `evidence/20260828-installed-permissions.json` preserves the result
(SHA256`b516948b07f3199ae29cd7c1fcd0a0459c72077412b023a9ed55355aacf2cbad`).

The vendor documentation describes API token creation with selectable permissions and a server-wide
authentication toggle. It does not promise independently selectable inference versus model lifecycle
permissions. [Official authentication documentation](https://lmstudio.ai/docs/developer/core/authentication)

The installed grant schema has two configurable fields: `dynamicRemoteMcpServer` and `pluginUse`,
each `deny`/`allowAll`. Its permission switch explicitly denies several internal filesystem, engine,
hub and system-management operations. It does not define independently configurable model load,
unload or download grants. The three REST lifecycle handlers use the application's internal client;
the full handler spans contain no `checkPermission`, `getAuthContext`, `clientIdentifier` or `tokenMode`
reference. These are static observations, not negative live authentication tests. Do not invent a
supported inference-only token or claim it prevents a compromised local proxy from lifecycle calls.

The inspector parses only the literal string table and its numeric rotation, then substitutes known
decoder aliases as a reading aid. It neither imports/evaluates the vendor bundle nor patches it.
This is reproducible source evidence, not a complete semantic decompiler or vendor security guarantee.

A separate explicitly requested non-secret policy read at18:44:39Z resolved the installed
`permissions-store.json` two-stage `{json:...}` envelope. It found `tokenMode: disabled`,
`serverPermissions.dynamicRemoteMcpServer: deny` and `serverPermissions.pluginUse: deny`.
No token entries/credential values were output or retained. Both native MCP avenues were already OFF;
the operator must verify they remain OFF and preserve exact prior settings for rollback. The vendor
explains that these settings govern dynamic remote MCP and configured MCP servers.
[Official server settings](https://lmstudio.ai/docs/developer/core/server/settings)

At18:44:09Z the existing server still had0.0.0.0 binding, JIT loading, sensitive-data logging and verbose
logging enabled. Nothing was changed during the campaign. The planned successor closes ordinary remote
access to native1234 through loopback binding, authenticates the fixed application routes with mutual
TLS, and turns off JIT/sensitive logging. Local administrators and trusted host processes remain outside
the ordinary-user boundary. The LocalService worker's narrow IPC does not make native loopback access
a privilege boundary. No custom WFP driver, runtime upgrade, or unsupported token schema is proposed.
