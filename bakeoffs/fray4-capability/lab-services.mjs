import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const runRoot = join(root, "artifacts", "runs", "fray4-capability");
const pgBin = join(root, "artifacts", "tools", "postgresql", "bin", "pgsql", "bin");
const pgData = join(runRoot, "postgres-data");
const pgLog = join(runRoot, "postgres.log");
const openfgaExe = join(root, "artifacts", "tools", "openfga", "bin", "openfga.exe");
const keycloakHome = join(root, "artifacts", "tools", "keycloak", "bin", "keycloak-26.7.2");
const javaHome = join(root, "artifacts", "tools", "java21", "bin", "jdk-21.0.12+8-jre");
const javaExe = join(javaHome, "bin", "java.exe");

export const sha256 = value => createHash("sha256").update(String(value)).digest("hex");

async function waitFor(url, timeoutMs = 90000, child) {
  const started = Date.now();
  let last = "not attempted";
  while (Date.now() - started < timeoutMs) {
    if (child?.spawnFailure) throw child.spawnFailure;
    if (child?.exitCode !== null) {
      throw new Error(`service exited with code ${child.exitCode} before ${url} became ready: ${child.outputText().slice(-2000)}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return response;
      last = `HTTP ${response.status}`;
    } catch (error) { last = error.message; }
    await new Promise(resolveWait => setTimeout(resolveWait, 400));
  }
  throw new Error(`readiness timeout for ${url}: ${last}`);
}

async function request(url, { method = "GET", token, body, form, timeoutMs = 5000 } = {}) {
  const headers = {};
  let requestBody;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) { headers["content-type"] = "application/json"; requestBody = JSON.stringify(body); }
  if (form !== undefined) { headers["content-type"] = "application/x-www-form-urlencoded"; requestBody = new URLSearchParams(form); }
  const response = await fetch(url, { method, headers, body: requestBody, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status}: ${String(text).slice(0, 240)}`);
  return { response, body: parsed };
}

function spawnLogged(command, args, logName, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  child.stdout.on("data", chunk => chunks.push(chunk));
  child.stderr.on("data", chunk => chunks.push(chunk));
  child.outputText = () => Buffer.concat(chunks).toString("utf8");
  child.spawnFailure = null;
  child.logPromise = new Promise(resolveLog => {
    let finalized = false;
    const finalize = async code => {
      if (finalized) return;
      finalized = true;
      await writeFile(join(runRoot, logName), Buffer.concat(chunks));
      resolveLog(code);
    };
    child.once("close", finalize);
    child.once("error", error => {
      child.spawnFailure = error;
      chunks.push(Buffer.from(`\nspawn error: ${error.stack ?? error.message}\n`));
      void finalize(-1);
    });
  });
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([child.logPromise, new Promise(resolveWait => setTimeout(resolveWait, 8000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await Promise.race([child.logPromise, new Promise(resolveWait => setTimeout(resolveWait, 3000))]);
}

export async function startPostgres() {
  await mkdir(runRoot, { recursive: true });
  if (!existsSync(join(pgData, "PG_VERSION"))) {
    await mkdir(pgData, { recursive: true });
    const initialized = spawnSync(join(pgBin, "initdb.exe"), ["-D", pgData, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8"], {
      cwd: root, encoding: "utf8", windowsHide: true,
    });
    if (initialized.status !== 0) throw new Error(`initdb failed: ${initialized.stderr || initialized.stdout}`);
  }
  const started = spawnSync(join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog, "-o", "-p 9470 -h 127.0.0.1", "start", "-w"], {
    cwd: root, stdio: "ignore", windowsHide: true,
  });
  if (started.status !== 0) throw new Error(`pg_ctl start failed with status ${started.status}`);
  let stopped = false;
  return {
    connectionString: "postgresql://postgres@127.0.0.1:9470/postgres",
    async stop() {
      if (stopped) return;
      const result = spawnSync(join(pgBin, "pg_ctl.exe"), ["-D", pgData, "stop", "-m", "fast", "-w"], {
        cwd: root, stdio: "ignore", windowsHide: true,
      });
      if (result.status !== 0) throw new Error(`pg_ctl stop failed with status ${result.status}`);
      stopped = true;
    },
    async restart() {
      if (!stopped) return;
      const result = spawnSync(join(pgBin, "pg_ctl.exe"), ["-D", pgData, "-l", pgLog, "-o", "-p 9470 -h 127.0.0.1", "start", "-w"], {
        cwd: root, stdio: "ignore", windowsHide: true,
      });
      if (result.status !== 0) throw new Error(`pg_ctl restart failed with status ${result.status}`);
      stopped = false;
    },
  };
}

export async function startKeycloak() {
  await mkdir(runRoot, { recursive: true });
  const base = "http://127.0.0.1:9471";
  const admin = `fray4-admin-${randomBytes(4).toString("hex")}`;
  const adminPassword = randomBytes(24).toString("base64url");
  const child = spawnLogged(javaExe, [
    "-Dprogram.name=kc.bat", "-Xms64m", "-Xmx512m", "-Dfile.encoding=UTF-8",
    "-Djava.util.concurrent.ForkJoinPool.common.threadFactory=io.quarkus.bootstrap.forkjoin.QuarkusForkJoinWorkerThreadFactory",
    `-Dkc.home.dir=${keycloakHome.replaceAll("\\", "/")}`,
    `-Djboss.server.config.dir=${join(keycloakHome, "conf")}`,
    `-Dkeycloak.theme.dir=${join(keycloakHome, "themes")}`,
    "-Djava.util.logging.manager=org.jboss.logmanager.LogManager",
    "-Dquarkus-log-max-startup-records=10000", "-Dpicocli.disable.closures=true",
    "-cp", join(keycloakHome, "lib", "quarkus-run.jar"),
    "io.quarkus.bootstrap.runner.QuarkusEntryPoint", "start-dev", "--db=dev-mem",
    "--http-host=127.0.0.1", "--http-port=9471", "--hostname-strict=false", "--health-enabled=true",
  ], "keycloak.log", {
    cwd: keycloakHome,
    env: { JAVA_HOME: javaHome, KC_BOOTSTRAP_ADMIN_USERNAME: admin, KC_BOOTSTRAP_ADMIN_PASSWORD: adminPassword, KC_LOG_LEVEL: "warn" },
  });
  try {
    await waitFor(`${base}/realms/master`, 90000, child);
    const adminToken = (await request(`${base}/realms/master/protocol/openid-connect/token`, {
      method: "POST", form: { grant_type: "password", client_id: "admin-cli", username: admin, password: adminPassword },
    })).body.access_token;
    const realm = `fray4-${randomBytes(4).toString("hex")}`;
    await request(`${base}/admin/realms`, { method: "POST", token: adminToken, body: { realm, enabled: true, accessTokenLifespan: 300 } });
    const clientId = "fray4-capability";
    const createClient = await fetch(`${base}/admin/realms/${realm}/clients`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ clientId, enabled: true, protocol: "openid-connect", publicClient: false,
        serviceAccountsEnabled: true, directAccessGrantsEnabled: true, standardFlowEnabled: false,
        protocolMappers: [{ name: "fray4-audience", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper",
          config: { "included.client.audience": clientId, "access.token.claim": "true", "id.token.claim": "false", "introspection.token.claim": "true" } }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!createClient.ok) throw new Error(`create client -> ${createClient.status}: ${await createClient.text()}`);
    const internalClientId = createClient.headers.get("location").split("/").at(-1);
    const clientSecret = (await request(`${base}/admin/realms/${realm}/clients/${internalClientId}/client-secret`, { token: adminToken })).body.value;
    const username = `alice-${randomBytes(4).toString("hex")}`;
    const userPassword = randomBytes(24).toString("base64url");
    const createUser = await fetch(`${base}/admin/realms/${realm}/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ username, email: `${username}@runalab.invalid`, emailVerified: true,
        firstName: "RunaLab", lastName: "Operator", enabled: true, requiredActions: [],
        credentials: [{ type: "password", value: userPassword, temporary: false }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!createUser.ok) throw new Error(`create user -> ${createUser.status}: ${await createUser.text()}`);
    const userId = createUser.headers.get("location").split("/").at(-1);
    const issuer = `${base}/realms/${realm}`;
    const issueToken = async () => (await request(`${issuer}/protocol/openid-connect/token`, {
      method: "POST", form: { grant_type: "password", client_id: clientId, client_secret: clientSecret, username, password: userPassword },
    })).body.access_token;
    const introspect = async token => {
      try {
        const body = (await request(`${issuer}/protocol/openid-connect/token/introspect`, {
          method: "POST", form: { token, client_id: clientId, client_secret: clientSecret },
        })).body;
        const audiences = Array.isArray(body.aud) ? body.aud : [body.aud];
        return { decided: true, active: body.active === true && body.iss === issuer && audiences.includes(clientId),
          subject: body.sub ?? null, issuerHash: sha256(body.iss ?? ""), audienceHash: sha256(clientId) };
      } catch (error) {
        return { decided: false, active: false, subject: null, error: error.message };
      }
    };
    const token = await issueToken();
    const identity = await introspect(token);
    if (!identity.active) throw new Error("Keycloak control identity is not active");
    return { base, realm, issuer, clientId, userId, token, subject: identity.subject, issueToken, introspect,
      async logout() { await request(`${base}/admin/realms/${realm}/users/${userId}/logout`, { method: "POST", token: adminToken }); },
      stop: () => stopChild(child) };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

export async function startOpenFga(actorId) {
  await mkdir(runRoot, { recursive: true });
  const base = "http://127.0.0.1:9473";
  const child = spawnLogged(openfgaExe, ["run", "--datastore-engine", "memory", "--http-addr", "127.0.0.1:9473",
    "--grpc-addr", "127.0.0.1:9474", "--metrics-enabled=false", "--playground-enabled=false", "--log-level=warn"], "openfga.log");
  try {
    await waitFor(`${base}/healthz`, 90000, child);
    const store = (await request(`${base}/stores`, { method: "POST", body: { name: `fray4-${randomBytes(4).toString("hex")}` } })).body;
    const model = (await request(`${base}/stores/${store.id}/authorization-models`, { method: "POST", body: {
      schema_version: "1.1",
      type_definitions: [
        { type: "user" },
        { type: "account", relations: { transfer: { this: {} } },
          metadata: { relations: { transfer: { directly_related_user_types: [{ type: "user" }] } } } },
      ],
    } })).body;
    const modelId = model.authorization_model_id;
    const tuple = { user: actorId, relation: "transfer", object: "account:household" };
    const writeTuple = async () => request(`${base}/stores/${store.id}/write`, { method: "POST", body: {
      writes: { tuple_keys: [tuple] }, authorization_model_id: modelId,
    } });
    const deleteTuple = async () => request(`${base}/stores/${store.id}/write`, { method: "POST", body: {
      deletes: { tuple_keys: [tuple] }, authorization_model_id: modelId,
    } });
    await writeTuple();
    const check = async (candidateActorId, action, resourceId) => {
      try {
        const body = (await request(`${base}/stores/${store.id}/check`, { method: "POST", body: {
          tuple_key: { user: candidateActorId, relation: action, object: resourceId }, authorization_model_id: modelId,
        } })).body;
        return { decisionId: randomBytes(16).toString("hex"), decided: true, allowed: body.allowed === true,
          actorId: candidateActorId, action, resourceId, source: "openfga", detailSha256: sha256(JSON.stringify(body)), decidedAt: new Date().toISOString() };
      } catch (error) {
        return { decisionId: randomBytes(16).toString("hex"), decided: false, allowed: false,
          actorId: candidateActorId, action, resourceId, source: "openfga", detailSha256: sha256(error.message),
          decidedAt: new Date().toISOString(), error: error.message };
      }
    };
    return { base, storeId: store.id, modelId, tuple, check, writeTuple, deleteTuple, stop: () => stopChild(child) };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}
