import { createServer, request as createRequest } from "node:http";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE } from "../gate7f/function-first/acceptance/browser-witness.mjs";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const WITNESS_PATH = "/__acceptance/browser-observation-witness";
const PAGE_PATH = "/__acceptance/browser-observation-witness-ui";
const SCRIPT_PATH = `${PAGE_PATH}.js`;
const CAPABILITY_PATH = `${PAGE_PATH}-capability`;
const MAXIMUM_HTML_BYTES = 2 * 1024 * 1024;
const witnessScript = `const form=document.querySelector('#m1-acceptance-witness');async function capability(){const checkpointId=form.elements.checkpointId?.value,token=form.elements.token?.value;if(checkpointId&&token)return{checkpointId,token};const response=await fetch('${CAPABILITY_PATH}',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('checkpoint-unavailable');const value=await response.json();if(typeof value.checkpointId!=='string'||typeof value.token!=='string'||value.token.length!==64)throw new Error('checkpoint-invalid');return value;}form.addEventListener('submit',async event=>{event.preventDefault();const output=form.querySelector('[role=status]'),button=form.querySelector('button');button.disabled=true;output.textContent='Verifying the visible application state…';try{const access=await capability(),panel=document.querySelector('#m1-task');if(!panel)throw new Error('application-state-unavailable');const visible=panel.innerText??'',data=panel.dataset,notice=${JSON.stringify(AGENT05_BOUNDED_DRAIN_NOTICE)};if(data.m1TaskStatus!=='cancelled'||!data.m1CancellationAt||!data.m1TaskId||!data.m1ProjectId||!data.m1Experience||!data.m1TaskObjective)throw new Error('application-binding-missing');if(!visible.includes(data.m1TaskObjective)||!visible.includes(notice)||!/Task:\\s*cancelled\\b/iu.test(visible))throw new Error('application-state-mismatch');const witnessedUrl=location.origin+'/';const witness={boundedDrain:${JSON.stringify(AGENT05_BOUNDED_DRAIN)},claimedImmediateKill:false,notice,taskStatus:'cancelled'};const domBinding={cancellationAt:data.m1CancellationAt,experience:data.m1Experience,projectId:data.m1ProjectId,taskId:data.m1TaskId,taskObjective:data.m1TaskObjective,witnessedUrl};const response=await fetch('${WITNESS_PATH}',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({checkpointId:access.checkpointId,token:access.token,witness,domBinding})});if(response.status!==204)throw new Error('denied');output.textContent='Visible application cancellation state recorded.';}catch(error){output.textContent='No qualifying application cancellation state was recorded: '+error.message;button.disabled=false;}});`;

const validPort = (value, allowZero = false) => Number.isInteger(value) && value >= (allowZero ? 0 : 1024) && value <= 65535;
const validCapability = (checkpointId, token) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(checkpointId ?? "")
  && /^[a-f0-9]{64}$/u.test(token ?? "");

function injectWitnessControls(html, checkpointId, token) {
  const fields = validCapability(checkpointId, token)
    ? `<input type="hidden" name="checkpointId" value="${checkpointId}"><input type="hidden" name="token" value="${token}">` : "";
  const controls = `<section aria-label="Acceptance browser witness"><h2>Acceptance observation</h2><p>This action records only the exact task state visibly rendered above.</p><form id="m1-acceptance-witness">${fields}<button type="submit">Verify and record this visible task state</button><p role="status">Waiting for the exact cancelled-task state.</p></form></section><script src="${SCRIPT_PATH}" defer></script>`;
  return /<\/body>/iu.test(html) ? html.replace(/<\/body>/iu, `${controls}</body>`) : `${html}${controls}`;
}

function exactCapability(value) {
  if (value === null) return null;
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["checkpointId", "token"])
      || !validCapability(value.checkpointId, value.token)) {
    throw new Error("m1-browser-witness-ui-proxy-capability-invalid");
  }
  return Object.freeze({ checkpointId: value.checkpointId, token: value.token });
}

export function capabilityFromFileValue(value) {
  if (value && Object.getPrototypeOf(value) === Object.prototype
      && value.schemaVersion === "runaai-m1-browser-checkpoint/v1"
      && value.caseId === "agent-05-cancel-drain" && value.stage === "in-flight"
      && value.observationEndpoint?.schemaVersion === "runaai-m1-browser-observation-endpoint/v2") {
    return exactCapability({ checkpointId: value.checkpointId, token: value.observationEndpoint.witnessToken });
  }
  return exactCapability(value);
}

export function createWitnessUiProxy({ listenPort, upstreamPort, allowEphemeralListen = false,
  capability = null, capabilityFile = null }) {
  if (!validPort(listenPort, allowEphemeralListen) || !validPort(upstreamPort) || (listenPort !== 0 && listenPort === upstreamPort)) {
    throw new Error("m1-browser-witness-ui-proxy-binding-invalid");
  }
  if (capabilityFile !== null && (typeof capabilityFile !== "string" || !capabilityFile || capability !== null)) {
    throw new Error("m1-browser-witness-ui-proxy-capability-invalid");
  }
  const staticCapability = exactCapability(capability);
  const currentCapability = () => {
    if (staticCapability) return staticCapability;
    if (capabilityFile === null) return null;
    try { return capabilityFromFileValue(JSON.parse(readFileSync(capabilityFile, "utf8"))); }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  };
  return createServer((incoming, outgoing) => {
    if (!LOOPBACK.has(incoming.socket.remoteAddress)) {
      outgoing.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return outgoing.end("Loopback acceptance only.");
    }
    const url = new URL(incoming.url, "http://127.0.0.1");
    if (url.searchParams.has("checkpointId") || url.searchParams.has("token")) {
      outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return outgoing.end("Query capabilities are not supported.");
    }
    if (incoming.method === "GET" && url.pathname === SCRIPT_PATH) {
      outgoing.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      return outgoing.end(witnessScript);
    }
    let serverCapability;
    try { serverCapability = currentCapability(); }
    catch {
      outgoing.writeHead(503, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return outgoing.end("Acceptance checkpoint invalid.");
    }
    if (incoming.method === "GET" && url.pathname === CAPABILITY_PATH) {
      if (!serverCapability) {
        outgoing.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        return outgoing.end("{}");
      }
      const body = JSON.stringify(serverCapability);
      outgoing.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
        "content-length": Buffer.byteLength(body) });
      return outgoing.end(body);
    }
    if (incoming.method === "GET" && url.pathname === PAGE_PATH) {
      if (!serverCapability) {
        outgoing.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        return outgoing.end("Acceptance checkpoint unavailable.");
      }
      outgoing.writeHead(303, { location: "/", "cache-control": "no-store", "referrer-policy": "no-referrer" });
      return outgoing.end();
    }
    const activeCapability = serverCapability;
    const inject = incoming.method === "GET" && url.pathname === "/"
      && (activeCapability !== null || capabilityFile !== null);
    const headers = { ...incoming.headers, "accept-encoding": "identity" };
    const forwarded = createRequest({ hostname: "127.0.0.1", port: upstreamPort, method: incoming.method,
      path: inject ? "/" : incoming.url, headers }, response => {
      if (!inject) { outgoing.writeHead(response.statusCode ?? 502, response.headers); return response.pipe(outgoing); }
      const chunks = []; let bytes = 0, limited = false;
      response.on("data", chunk => { bytes += chunk.length; if (bytes > MAXIMUM_HTML_BYTES) limited = true; else chunks.push(chunk); });
      response.on("end", () => {
        const contentType = response.headers["content-type"] ?? "";
        if (limited || response.statusCode !== 200 || !/^text\/html\b/iu.test(contentType)) {
          outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
          return outgoing.end("Acceptance application page unavailable.");
        }
        const body = Buffer.from(injectWitnessControls(Buffer.concat(chunks).toString("utf8"),
          activeCapability?.checkpointId ?? null, activeCapability?.token ?? null), "utf8");
        const responseHeaders = { ...response.headers, "content-length": body.length, "cache-control": "no-store", "referrer-policy": "no-referrer" };
        delete responseHeaders["transfer-encoding"];
        delete responseHeaders["content-encoding"];
        outgoing.writeHead(200, responseHeaders); outgoing.end(body);
      });
    });
    forwarded.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      outgoing.end("Acceptance upstream unavailable.");
    });
    incoming.on("aborted", () => forwarded.destroy()); incoming.pipe(forwarded);
  });
}

function parseArguments(argv) {
  if (![4, 6].includes(argv.length) || argv[0] !== "--listen-port" || argv[2] !== "--upstream-port"
      || (argv.length === 6 && (argv[4] !== "--capability-file" || !argv[5]))) {
    throw new Error("m1-browser-witness-ui-proxy-argument-invalid");
  }
  const listenPort = Number(argv[1]), upstreamPort = Number(argv[3]);
  if (!validPort(listenPort) || !validPort(upstreamPort) || listenPort === upstreamPort) throw new Error("m1-browser-witness-ui-proxy-argument-invalid");
  return { listenPort, upstreamPort, capabilityFile: argv[5] ?? null };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = parseArguments(process.argv.slice(2));
  const server = createWitnessUiProxy(options);
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  server.listen(options.listenPort, "127.0.0.1", () => {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-browser-witness-ui-proxy/v2", ready: true,
      listenPort: options.listenPort, upstreamPort: options.upstreamPort, loopbackOnly: true,
      capabilityFileConfigured: options.capabilityFile !== null, productionChanged: false })}\n`);
  });
}
