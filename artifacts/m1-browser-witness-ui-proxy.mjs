import { createServer, request as createRequest } from "node:http";
import { pathToFileURL } from "node:url";
import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE } from "../gate7f/function-first/acceptance/browser-witness.mjs";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const WITNESS_PATH = "/__acceptance/browser-observation-witness";
const PAGE_PATH = "/__acceptance/browser-observation-witness-ui";
const SCRIPT_PATH = `${PAGE_PATH}.js`;
const WITNESS = Object.freeze({
  boundedDrain: AGENT05_BOUNDED_DRAIN,
  claimedImmediateKill: false,
  notice: AGENT05_BOUNDED_DRAIN_NOTICE,
  taskStatus: "cancelled"
});
const witnessScript = `const form=document.querySelector('form');form.addEventListener('submit',async event=>{event.preventDefault();const output=document.querySelector('[role=status]'),button=form.querySelector('button');button.disabled=true;output.textContent='Recording the bounded cancellation observation…';try{const response=await fetch('${WITNESS_PATH}',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({checkpointId:form.elements.checkpointId.value,token:form.elements.token.value,witness:${JSON.stringify(WITNESS)}})});if(response.status!==204)throw new Error('denied');output.textContent='Cancellation observation recorded.';}catch{output.textContent='Cancellation observation was not recorded. The one-use checkpoint may have expired.';button.disabled=false;}});`;

const validPort = (value, allowZero = false) => Number.isInteger(value) && value >= (allowZero ? 0 : 1024) && value <= 65535;

export function createWitnessUiProxy({ listenPort, upstreamPort, allowEphemeralListen = false }) {
  if (!validPort(listenPort, allowEphemeralListen) || !validPort(upstreamPort) || (listenPort !== 0 && listenPort === upstreamPort)) {
    throw new Error("m1-browser-witness-ui-proxy-binding-invalid");
  }
  return createServer((incoming, outgoing) => {
    if (!LOOPBACK.has(incoming.socket.remoteAddress)) {
      outgoing.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return outgoing.end("Loopback acceptance only.");
    }
    const url = new URL(incoming.url, "http://127.0.0.1");
    if (incoming.method === "GET" && url.pathname === SCRIPT_PATH) {
      outgoing.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      return outgoing.end(witnessScript);
    }
    if (incoming.method === "GET" && url.pathname === PAGE_PATH) {
      const checkpointId = url.searchParams.get("checkpointId"), token = url.searchParams.get("token");
      if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(checkpointId ?? "") || !/^[a-f0-9]{64}$/u.test(token ?? "")) {
        outgoing.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        return outgoing.end("Acceptance checkpoint unavailable.");
      }
      outgoing.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'" });
      return outgoing.end(`<!doctype html><title>Bounded cancellation observation</title><h1>Record the bounded cancellation observation</h1><p>This one-use acceptance page records that the cancelled task did not claim an immediate kill and will retain any already-dispatched result.</p><form><input type="hidden" name="checkpointId" value="${checkpointId}"><input type="hidden" name="token" value="${token}"><button type="submit">Record cancellation observation</button></form><p role="status">Ready to record.</p><script src="${SCRIPT_PATH}" defer></script>`);
    }
    const forwarded = createRequest({ hostname: "127.0.0.1", port: upstreamPort, method: incoming.method,
      path: incoming.url, headers: incoming.headers }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing);
    });
    forwarded.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      outgoing.end("Acceptance upstream unavailable.");
    });
    incoming.on("aborted", () => forwarded.destroy()); incoming.pipe(forwarded);
  });
}

function parseArguments(argv) {
  if (argv.length !== 4 || argv[0] !== "--listen-port" || argv[2] !== "--upstream-port") throw new Error("m1-browser-witness-ui-proxy-argument-invalid");
  const listenPort = Number(argv[1]), upstreamPort = Number(argv[3]);
  if (!validPort(listenPort) || !validPort(upstreamPort) || listenPort === upstreamPort) throw new Error("m1-browser-witness-ui-proxy-argument-invalid");
  return { listenPort, upstreamPort };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = parseArguments(process.argv.slice(2)), server = createWitnessUiProxy(options);
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  server.listen(options.listenPort, "127.0.0.1", () => {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "runaai-m1-browser-witness-ui-proxy/v1", ready: true,
      listenPort: options.listenPort, upstreamPort: options.upstreamPort, loopbackOnly: true, productionChanged: false })}\n`);
  });
}
