import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const runDir = join(root, "artifacts", "runs", "stack-bakeoff-security");
const resultPath = join(root, "probes", "results", "stack-bakeoff-security.json");
const openfgaExe = join(root, "artifacts", "tools", "openfga", "bin", "openfga.exe");
const keycloakHome = join(root, "artifacts", "tools", "keycloak", "bin", "keycloak-26.7.2");
const javaHome = join(root, "artifacts", "tools", "java21", "bin", "jdk-21.0.12+8-jre");
const javaExe = join(javaHome, "bin", "java.exe");

execFileSync(process.execPath, ["probes/verify-seal-security-bakeoff.mjs"], {
  cwd: root,
  stdio: "inherit",
});

await mkdir(runDir, { recursive: true });

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function spawnLogged(command, args, name, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  child.stdout.on("data", chunk => chunks.push(chunk));
  child.stderr.on("data", chunk => chunks.push(chunk));
  child.logPromise = new Promise(resolveLog => {
    child.on("close", async code => {
      const body = Buffer.concat(chunks).toString("utf8");
      await writeFile(join(runDir, `${name}.log`), body, "utf8");
      resolveLog({ code, body });
    });
  });
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([child.logPromise, new Promise(resolveWait => setTimeout(resolveWait, 8000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await Promise.race([child.logPromise, new Promise(resolveWait => setTimeout(resolveWait, 3000))]);
}

async function waitFor(url, timeoutMs = 90000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return response;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`readiness timeout for ${url}: ${last}`);
}

async function jsonRequest(url, { method = "GET", token, body, form, timeoutMs = 5000 } = {}) {
  const headers = {};
  let requestBody;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  if (form !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    requestBody = new URLSearchParams(form);
  }
  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status}: ${String(text).slice(0, 300)}`);
  return { response, body: parsed };
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function verifyJwt(token, jwks, expected) {
  try {
    if (!token) throw new Error("missing");
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("malformed");
    const header = decodePart(encodedHeader);
    const payload = decodePart(encodedPayload);
    const jwk = jwks.keys.find(item => item.kid === header.kid && item.kty === "RSA");
    if (!jwk || header.alg !== "RS256") throw new Error("unsupported-key");
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureOk = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      Buffer.from(encodedSignature, "base64url"),
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
    );
    if (!signatureOk) throw new Error("signature");
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("expired");
    if (payload.iss !== expected.issuer) throw new Error("issuer");
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(expected.audience)) throw new Error("audience");
    if (payload.sub !== expected.subject) throw new Error("subject");
    return { accepted: true, reason: "accepted", payload };
  } catch (error) {
    return { accepted: false, reason: error.message };
  }
}

async function runKeycloak() {
  const base = "http://127.0.0.1:9450";
  const admin = `lab-admin-${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("base64url");
  const child = spawnLogged(
    javaExe,
    [
      "-Dprogram.name=kc.bat",
      "-Xms64m",
      "-Xmx512m",
      "-Dfile.encoding=UTF-8",
      "-Djava.util.concurrent.ForkJoinPool.common.threadFactory=io.quarkus.bootstrap.forkjoin.QuarkusForkJoinWorkerThreadFactory",
      `-Dkc.home.dir=${keycloakHome.replaceAll("\\", "/")}`,
      `-Djboss.server.config.dir=${join(keycloakHome, "conf")}`,
      `-Dkeycloak.theme.dir=${join(keycloakHome, "themes")}`,
      "-Djava.util.logging.manager=org.jboss.logmanager.LogManager",
      "-Dquarkus-log-max-startup-records=10000",
      "-Dpicocli.disable.closures=true",
      "-cp",
      join(keycloakHome, "lib", "quarkus-run.jar"),
      "io.quarkus.bootstrap.runner.QuarkusEntryPoint",
      "start-dev",
      "--db=dev-mem",
      "--http-host=127.0.0.1",
      "--http-port=9450",
      "--hostname-strict=false",
      "--health-enabled=true",
    ],
    "keycloak",
    {
      cwd: keycloakHome,
      env: {
        JAVA_HOME: javaHome,
        KC_BOOTSTRAP_ADMIN_USERNAME: admin,
        KC_BOOTSTRAP_ADMIN_PASSWORD: password,
        KC_LOG_LEVEL: "warn",
      },
    },
  );

  try {
    await waitFor(`${base}/realms/master`);
    const adminToken = (await jsonRequest(`${base}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      form: {
        grant_type: "password",
        client_id: "admin-cli",
        username: admin,
        password,
      },
    })).body.access_token;
    const realm = `runalab-${randomBytes(4).toString("hex")}`;
    await jsonRequest(`${base}/admin/realms`, {
      method: "POST",
      token: adminToken,
      body: { realm, enabled: true, accessTokenLifespan: 2 },
    });
    const clientId = "runalab-gate";
    const createClient = await fetch(`${base}/admin/realms/${realm}/clients`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        clientId,
        enabled: true,
        protocol: "openid-connect",
        publicClient: false,
        serviceAccountsEnabled: true,
        directAccessGrantsEnabled: true,
        standardFlowEnabled: false,
        protocolMappers: [{
          name: "runalab-audience",
          protocol: "openid-connect",
          protocolMapper: "oidc-audience-mapper",
          config: {
            "included.client.audience": clientId,
            "access.token.claim": "true",
            "id.token.claim": "false",
            "introspection.token.claim": "true",
          },
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!createClient.ok) throw new Error(`create client -> ${createClient.status}: ${await createClient.text()}`);
    const clientLocation = createClient.headers.get("location");
    const internalClientId = clientLocation.split("/").at(-1);
    const clientSecret = (await jsonRequest(`${base}/admin/realms/${realm}/clients/${internalClientId}/client-secret`, {
      token: adminToken,
    })).body.value;

    const username = `operator-${randomBytes(4).toString("hex")}`;
    const userPassword = randomBytes(24).toString("base64url");
    const createUser = await fetch(`${base}/admin/realms/${realm}/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@runalab.invalid`,
        emailVerified: true,
        firstName: "RunaLab",
        lastName: "Operator",
        enabled: true,
        requiredActions: [],
        credentials: [{ type: "password", value: userPassword, temporary: false }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!createUser.ok) throw new Error(`create user -> ${createUser.status}: ${await createUser.text()}`);
    const userId = createUser.headers.get("location").split("/").at(-1);
    const tokenEndpoint = `${base}/realms/${realm}/protocol/openid-connect/token`;
    const issue = async () => (await jsonRequest(tokenEndpoint, {
      method: "POST",
      form: {
        grant_type: "password",
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password: userPassword,
      },
    })).body.access_token;
    const token = await issue();
    const payload = decodePart(token.split(".")[1]);
    const issuer = `${base}/realms/${realm}`;
    const jwks = (await jsonRequest(`${issuer}/protocol/openid-connect/certs`)).body;
    const expected = { issuer, audience: clientId, subject: payload.sub };
    const valid = await verifyJwt(token, jwks, expected);
    const [header, encodedPayload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ ...payload, sub: "forged-actor" })).toString("base64url");
    const cases = [
      { name: "valid", expected: true, result: valid },
      { name: "forged-signature", expected: false, result: await verifyJwt(`${header}.${forgedPayload}.${signature}`, jwks, expected) },
      { name: "wrong-issuer", expected: false, result: await verifyJwt(token, jwks, { ...expected, issuer: `${issuer}-wrong` }) },
      { name: "wrong-audience", expected: false, result: await verifyJwt(token, jwks, { ...expected, audience: "wrong-client" }) },
      { name: "wrong-actor", expected: false, result: await verifyJwt(token, jwks, { ...expected, subject: "wrong-actor" }) },
      { name: "missing", expected: false, result: await verifyJwt(null, jwks, expected) },
    ];
    await new Promise(resolveWait => setTimeout(resolveWait, 3000));
    cases.push({ name: "expired", expected: false, result: await verifyJwt(token, jwks, expected) });

    const tokenForRevocation = await issue();
    const introspect = async value => (await jsonRequest(`${issuer}/protocol/openid-connect/token/introspect`, {
      method: "POST",
      form: { token: value, client_id: clientId, client_secret: clientSecret },
    })).body.active === true;
    const activeBeforeLogout = await introspect(tokenForRevocation);
    await jsonRequest(`${base}/admin/realms/${realm}/users/${userId}/logout`, {
      method: "POST",
      token: adminToken,
    });
    const activeAfterLogout = await introspect(tokenForRevocation);
    const localAfterLogout = await verifyJwt(tokenForRevocation, jwks, {
      ...expected,
      subject: decodePart(tokenForRevocation.split(".")[1]).sub,
    });

    const matrixPass = cases.every(item => item.result.accepted === item.expected);
    return {
      component: "Keycloak 26.7.2 OIDC",
      matrixPass,
      cases: cases.map(item => ({
        name: item.name,
        expectedAccepted: item.expected,
        accepted: item.result.accepted,
        reason: item.result.reason,
      })),
      revocation: {
        activeBeforeLogout,
        activeAfterLogout,
        offlineSignatureStillAcceptedAfterLogout: localAfterLogout.accepted,
        pass: activeBeforeLogout && !activeAfterLogout && localAfterLogout.accepted,
        contract: "online introspection required for immediately revocable destructive operations",
      },
      evidence: {
        issuerHash: hash(issuer),
        subjectHash: hash(payload.sub),
        keyIdHash: hash(decodePart(token.split(".")[0]).kid),
        credentialsOrTokensRetained: false,
      },
    };
  } finally {
    await stop(child);
  }
}

async function runOpenFga() {
  const base = "http://127.0.0.1:9460";
  const child = spawnLogged(openfgaExe, [
    "run",
    "--datastore-engine", "memory",
    "--http-addr", "127.0.0.1:9460",
    "--grpc-addr", "127.0.0.1:9461",
    "--metrics-enabled=false",
    "--playground-enabled=false",
    "--log-level=warn",
  ], "openfga");
  try {
    await waitFor(`${base}/healthz`);
    const store = (await jsonRequest(`${base}/stores`, {
      method: "POST",
      body: { name: `runalab-security-${randomBytes(4).toString("hex")}` },
    })).body;
    const model = (await jsonRequest(`${base}/stores/${store.id}/authorization-models`, {
      method: "POST",
      body: {
        schema_version: "1.1",
        type_definitions: [
          { type: "user" },
          {
            type: "document",
            relations: { owner: { this: {} }, editor: { this: {} }, viewer: { this: {} } },
            metadata: {
              relations: {
                owner: { directly_related_user_types: [{ type: "user" }] },
                editor: { directly_related_user_types: [{ type: "user" }] },
                viewer: { directly_related_user_types: [{ type: "user" }] },
              },
            },
          },
        ],
      },
    })).body;
    const tuple = { user: "user:alice", relation: "editor", object: "document:release-plan" };
    await jsonRequest(`${base}/stores/${store.id}/write`, {
      method: "POST",
      body: { writes: { tuple_keys: [tuple] }, authorization_model_id: model.authorization_model_id },
    });
    const check = async tuple_key => (await jsonRequest(`${base}/stores/${store.id}/check`, {
      method: "POST",
      body: { tuple_key, authorization_model_id: model.authorization_model_id },
    })).body.allowed === true;
    const cases = [
      { name: "intended-tuple", expected: true, allowed: await check(tuple) },
      { name: "wrong-actor", expected: false, allowed: await check({ ...tuple, user: "user:mallory" }) },
      { name: "wrong-object", expected: false, allowed: await check({ ...tuple, object: "document:other" }) },
      { name: "wrong-relation", expected: false, allowed: await check({ ...tuple, relation: "owner" }) },
    ];
    await jsonRequest(`${base}/stores/${store.id}/write`, {
      method: "POST",
      body: { deletes: { tuple_keys: [tuple] }, authorization_model_id: model.authorization_model_id },
    });
    cases.push({ name: "revoked-tuple", expected: false, allowed: await check(tuple) });
    await stop(child);
    let unavailableAllowed = true;
    let unavailableReason = "unexpected-success";
    try {
      unavailableAllowed = await check(tuple);
    } catch (error) {
      unavailableAllowed = false;
      unavailableReason = error.name === "TimeoutError" ? "timeout-deny" : "transport-deny";
    }
    cases.push({ name: "service-unavailable", expected: false, allowed: unavailableAllowed, reason: unavailableReason });
    return {
      component: "OpenFGA 1.18.3",
      matrixPass: cases.every(item => item.allowed === item.expected),
      cases,
      evidence: {
        storeIdHash: hash(store.id),
        authorizationModelIdHash: hash(model.authorization_model_id),
        datastore: "memory (lab only)",
        bind: "loopback",
      },
    };
  } finally {
    await stop(child);
  }
}

const startedAt = new Date().toISOString();
let keycloak;
let openfga;
let error = null;
try {
  keycloak = await runKeycloak();
  openfga = await runOpenFga();
} catch (caught) {
  error = { name: caught.name, message: caught.message, stack: caught.stack };
}
const result = {
  schemaVersion: 1,
  startedAt,
  endedAt: new Date().toISOString(),
  profile: "integration-security",
  defaultDevelopmentModified: false,
  keycloak,
  openfga,
  error,
  pass: !error && keycloak?.matrixPass && keycloak?.revocation?.pass && openfga?.matrixPass,
};
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ resultPath, pass: result.pass, error }, null, 2));
if (!result.pass) process.exitCode = 1;
