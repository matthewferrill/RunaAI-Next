// Egress recorder for I-C2. Preloaded with `node --import ./probes/constraints/egress.mjs`, so it is
// in place before any stack module is imported and therefore before a first-run telemetry call could
// fire during module initialisation.
//
// It records at every layer that knows a destination, rather than at one chokepoint. The first
// version wrapped only `net.Socket.prototype.connect` and parsed its arguments, which produced
// `?:?` for undici's sockets -- so a loopback fetch and a call to a foreign host looked identical,
// and an unparsed destination counted as foreign. That is a false-violation generator, and the
// instrument gate caught it on the first run before any result depended on it.
//
// Layers wrapped: `fetch` (which is how the stack talks to model endpoints), `http`/`https` request,
// and the socket prototype as a backstop, plus DNS. A destination seen at any layer is recorded once
// per layer, and the grader de-duplicates by target.
//
// Stated as a limit rather than discovered later: this cannot see a native addon that opens a socket
// without going through Node, nor traffic from a separate process. A clean result is "no outbound
// observed at the Node layer", never "no outbound".
import net from "node:net";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { appendFileSync } from "node:fs";

const LOG = process.env.EGRESS_LOG || "probes/results/egress.jsonl";
const record = (kind, target, detail = {}) => {
  try { appendFileSync(LOG, JSON.stringify({ kind, target, at: Date.now(), ...detail }) + "\n"); } catch {}
};

// --- fetch: how the stack reaches model and re-rank endpoints ---------------------------------------
const realFetch = globalThis.fetch;
if (typeof realFetch === "function") {
  globalThis.fetch = function patchedFetch(input, init) {
    try {
      const url = typeof input === "string" ? input : (input?.url ?? String(input));
      const u = new URL(url);
      record("fetch", `${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}`, { url: url.slice(0, 200) });
    } catch { record("fetch", "unparsed-url"); }
    return realFetch.call(this, input, init);
  };
}

// --- http / https modules ---------------------------------------------------------------------------
for (const [mod, name, defPort] of [[http, "http", 80], [https, "https", 443]]) {
  for (const fn of ["request", "get"]) {
    const real = mod[fn];
    if (typeof real !== "function") continue;
    mod[fn] = function patched(...args) {
      try {
        const a = args[0];
        if (typeof a === "string") { const u = new URL(a); record(name, `${u.hostname}:${u.port || defPort}`, { url: a.slice(0, 200) }); }
        else if (a instanceof URL) record(name, `${a.hostname}:${a.port || defPort}`, { url: String(a).slice(0, 200) });
        else if (a && typeof a === "object") record(name, `${a.hostname ?? a.host ?? "?"}:${a.port ?? defPort}`, { path: a.path });
      } catch { record(name, "unparsed"); }
      return real.apply(this, args);
    };
  }
}

// --- sockets: a backstop for anything not using the above -------------------------------------------
// The destination is taken from the socket once it knows it, not from the call arguments, because the
// argument shape varies by caller and an unparsed argument is worse than no record: it reads as an
// unknown foreign host.
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function patchedConnect(...args) {
  try {
    this.once("connect", () => {
      if (this.remoteAddress) record("socket", `${this.remoteAddress}:${this.remotePort}`);
    });
    this.once("lookup", (_err, address, _family, host) => {
      if (host) record("socket-lookup", String(host), { address });
    });
  } catch { /* never let instrumentation break the call */ }
  return realConnect.apply(this, args);
};

// --- DNS: a resolution that never connects is still a disclosure -------------------------------------
for (const [obj, name] of [[dns, "lookup"], [dns, "resolve"], [dns, "resolve4"], [dns, "resolve6"],
                           [dns.promises, "lookup"], [dns.promises, "resolve"]]) {
  const real = obj?.[name];
  if (typeof real !== "function") continue;
  obj[name] = function patchedResolve(hostname, ...rest) {
    record("dns", String(hostname), { fn: name });
    return real.call(this, hostname, ...rest);
  };
}

// Marker so a run that never initialised is distinguishable from a run with no egress. Without it,
// "no destinations recorded" and "the harness never started" look identical -- the false-safeguard
// shape that produced instrument defect 18.
record("armed", "egress-recorder", { pid: process.pid });
