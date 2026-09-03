import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import tls from "node:tls";
import { once } from "node:events";
import { canonicalSha256, canonicalStringify, NETWORK_POLICY_DIGEST, NETWORK_POLICY_ID,
  admitGitOpenRequest } from "./materialization-contracts.mjs";
import { admitResolverAnswers } from "./network-policy.mjs";
import policy from "./m1-s2b1-network-policy.json" with { type: "json" };

const fail = code => Object.assign(new Error(code), { code });
if (policy.policyId !== NETWORK_POLICY_ID || canonicalSha256(policy) !== NETWORK_POLICY_DIGEST) throw fail("git-tls-policy-integrity-failed");
const limits = Object.freeze({ dns: policy.dnsTimeoutMs, connections: policy.maximumConnections,
  idle: policy.connectionIdleTimeoutMs, deadline: policy.absoluteDeadlineMs,
  requestHeader: policy.maximumRequestHeaderBytes, responseHeader: policy.maximumResponseHeaderBytes,
  requestBody: policy.maximumRequestBodyBytes, responseBody: policy.maximumResponseBodyBytes });
const TEST_COMPOSITION = Symbol("explicit-test-only-git-tls-composition");

export function parseExactPublicGitUrl(raw) {
  if (typeof raw !== "string" || raw.includes("%") || raw.includes("@") || raw.includes("?")) throw fail("git-tls-repository-url-invalid");
  const match = /^https:\/\/([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)((?:\/[A-Za-z0-9._~!$&'()+,;=:-]+)+\.git)$/u.exec(raw);
  if (!match || match[1].includes("..") || match[1].endsWith(".") || match[1].split(".").some(label =>
    label.length > 63 || label.startsWith("-") || label.endsWith("-") || label.startsWith("xn--"))) throw fail("git-tls-repository-url-invalid");
  const parsed = new URL(raw);
  if (parsed.href !== raw || parsed.hostname !== match[1] || parsed.pathname !== match[2] || parsed.port) throw fail("git-tls-repository-url-invalid");
  return parsed;
}

function ipv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some(part => !/^(?:0|[1-9][0-9]{0,2})$/u.test(part) || Number(part) > 255)) throw fail("git-tls-resolver-address-invalid");
  return Buffer.from(parts.map(Number));
}
function ipv6(value) {
  if (value.includes("%")) throw fail("git-tls-resolver-address-invalid");
  let text = value;
  if (text.includes(".")) {
    const split = text.lastIndexOf(":"); if (split < 0) throw fail("git-tls-resolver-address-invalid");
    const tail = ipv4(text.slice(split + 1));
    text = `${text.slice(0, split)}:${tail.readUInt16BE(0).toString(16)}:${tail.readUInt16BE(2).toString(16)}`;
  }
  const halves = text.split("::"); if (halves.length > 2) throw fail("git-tls-resolver-address-invalid");
  const words = half => half === "" ? [] : half.split(":").map(item => {
    if (!/^[a-f0-9]{1,4}$/iu.test(item)) throw fail("git-tls-resolver-address-invalid"); return Number.parseInt(item, 16);
  });
  const left = words(halves[0]), right = words(halves[1] ?? ""), missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) throw fail("git-tls-resolver-address-invalid");
  const result = Buffer.alloc(16);
  [...left, ...Array(missing).fill(0), ...right].forEach((word, index) => result.writeUInt16BE(word, index * 2));
  return result;
}
function answerToBinary(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== "address,family" || ![4, 6].includes(value.family)) throw fail("git-tls-resolver-answer-invalid");
  if (Buffer.isBuffer(value.address)) return { family: value.family, address: Buffer.from(value.address) };
  if (typeof value.address !== "string") throw fail("git-tls-resolver-answer-invalid");
  return { family: value.family, address: value.family === 4 ? ipv4(value.address) : ipv6(value.address) };
}
const addressText = (family, bytes) => family === 4 ? [...bytes].join(".")
  : Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16)).join(":");
const machineResolver = hostname => new Promise((resolve, reject) => dnsLookup(hostname, { all: true, verbatim: true },
  (error, answers) => error ? reject(error) : resolve(answers)));
function responseHeaderBytes(response) {
  let total = Buffer.byteLength(`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n`);
  for (let index = 0; index < response.rawHeaders.length; index += 2) total += Buffer.byteLength(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}\r\n`);
  return total + 2;
}
function oneHeader(response, name) {
  const values = response.headersDistinct?.[name];
  if (values === undefined) return null;
  if (!Array.isArray(values) || values.length !== 1) throw fail("git-tls-response-header-invalid");
  return values[0];
}
function validateDeadline(deadlineAt, now) {
  const current = now();
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= current || deadlineAt - current > limits.deadline) throw fail("git-tls-deadline-invalid");
}

export class GitTlsConnector {
  #selected = null; #selection = null; #resolvePromise = null; #closed = false; #failure = null;
  #connections = 0; #requestBytes = 0; #responseBytes = 0; #sockets = new Set(); #agents = new Set(); #deadlineTimer;
  constructor({ repositoryHttpsUrl, deadlineAt }, composition = null) {
    this.repository = parseExactPublicGitUrl(repositoryHttpsUrl);
    const test = composition?.token === TEST_COMPOSITION;
    if (composition !== null && !test) throw fail("git-tls-composition-denied");
    this.resolver = test ? composition.resolver : machineResolver;
    this.tlsConnect = test ? composition.tlsConnect : options => tls.connect(options);
    this.now = test && composition.now ? composition.now : () => Date.now();
    this.setTimer = test && composition.setTimer ? composition.setTimer : setTimeout;
    this.clearTimer = test && composition.clearTimer ? composition.clearTimer : clearTimeout;
    this.ca = test ? composition.ca : undefined;
    if (typeof this.resolver !== "function" || typeof this.tlsConnect !== "function") throw fail("git-tls-composition-invalid");
    validateDeadline(deadlineAt, this.now); this.deadlineAt = deadlineAt;
    this.#deadlineTimer = this.setTimer(() => this.#poison(fail("git-tls-absolute-deadline")), Math.max(1, deadlineAt - this.now()));
    this.#deadlineTimer?.unref?.();
  }
  #remaining() {
    const value = this.deadlineAt - this.now();
    if (value <= 0) throw this.#poison(fail("git-tls-absolute-deadline")); return value;
  }
  async #race(promise, milliseconds, code) {
    const duration = Math.min(milliseconds, this.#remaining()); let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = this.setTimer(() => reject(fail(code)), Math.max(1, duration)); timer?.unref?.();
      })]);
    } catch (error) { throw this.#poison(error); }
    finally { if (timer !== undefined) this.clearTimer(timer); }
  }
  #poison(error) {
    const failure = error instanceof Error ? error : fail("git-tls-attempt-failed");
    if (!this.#failure) this.#failure = failure;
    this.#closed = true; if (this.#deadlineTimer !== undefined) this.clearTimer(this.#deadlineTimer);
    for (const agent of this.#agents) { try { agent.destroy(); } catch {} }
    for (const socket of this.#sockets) { try { socket?.destroy?.(); } catch {} }
    this.#agents.clear(); this.#sockets.clear(); this.#selected?.fill(0); return this.#failure;
  }
  #demandOpen() { if (this.#closed) throw this.#failure ?? fail("git-tls-connector-closed"); this.#remaining(); }
  async #resolve() {
    this.#demandOpen(); if (this.#selection) return;
    if (!this.#resolvePromise) this.#resolvePromise = this.#race(Promise.resolve().then(async () => {
      const raw = await this.resolver(this.repository.hostname); this.#demandOpen();
      if (!Array.isArray(raw)) throw fail("git-tls-resolver-answer-invalid");
      const admitted = admitResolverAnswers(raw.map(answerToBinary)); this.#demandOpen();
      this.#selected = admitted.copySelectedAddress();
      this.#selection = Object.freeze({ family: admitted.family, answerSetDigest: admitted.answerSetDigest,
        selectedAddressDigest: admitted.selectedAddressDigest, policyId: admitted.policyId, policyDigest: admitted.policyDigest, allowed: true });
    }), limits.dns, "git-tls-dns-timeout");
    await this.#resolvePromise;
  }
  async #socket() {
    await this.#resolve(); this.#demandOpen();
    if (this.#connections >= limits.connections) throw this.#poison(fail("git-tls-connection-limit"));
    const options = { host: addressText(this.#selection.family, this.#selected), family: this.#selection.family,
      port: 443, servername: this.repository.hostname, rejectUnauthorized: true, ALPNProtocols: ["http/1.1"], minVersion: "TLSv1.2" };
    if (this.ca !== undefined) options.ca = this.ca;
    let socket;
    try {
      socket = this.tlsConnect(Object.freeze(options)); this.#sockets.add(socket); this.#connections += 1;
      if (!socket || typeof socket.once !== "function" || typeof socket.setTimeout !== "function" || typeof socket.destroy !== "function") throw fail("git-tls-socket-invalid");
      socket.setTimeout(Math.min(limits.idle, this.#remaining()), () => socket.destroy(fail("git-tls-idle-timeout")));
      if (socket.connecting !== false || !socket.encrypted) await this.#race(Promise.race([
        once(socket, "secureConnect"), once(socket, "error").then(([error]) => { throw error; }),
      ]), this.#remaining(), "git-tls-absolute-deadline");
      if (socket.authorized !== true || ![false, "", "http/1.1"].includes(socket.alpnProtocol)) throw fail("git-tls-peer-invalid");
      return socket;
    } catch (error) { throw this.#poison(error); }
  }
  async openRequest(input) {
    try {
      this.#demandOpen(); const head = admitGitOpenRequest(Buffer.from(canonicalStringify(input)), this.repository.pathname);
      if (head.requestOrdinal !== this.#connections) throw fail("git-tls-request-order-invalid");
      this.#requestBytes += head.contentLength; if (this.#requestBytes > limits.requestBody) throw fail("git-tls-request-body-limit");
      const socket = await this.#socket();
      const headers = { Host: this.repository.hostname, Accept: head.accept, "Content-Length": String(head.contentLength), Connection: "close", "User-Agent": "RunaAI-M1-Git-Broker/1" };
      if (head.contentType !== null) headers["Content-Type"] = head.contentType;
      const headerBytes = Buffer.byteLength(`${head.method} ${head.pathAndQuery} HTTP/1.1\r\n` + Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join("") + "\r\n");
      if (headerBytes > limits.requestHeader) throw fail("git-tls-request-header-limit");
      const agent = new http.Agent({ keepAlive: false, maxSockets: 1 }); this.#agents.add(agent);
      let supplied = false;
      agent.createConnection = () => { if (supplied) throw fail("git-tls-second-connect-denied"); supplied = true; return socket; };
      let responseResolve, responseReject, written = 0, finished = false;
      const responsePromise = new Promise((resolve, reject) => { responseResolve = resolve; responseReject = reject; });
      // The peer may fail before the materializer finishes streaming its request body.
      // Mark that deferred rejection handled immediately; finish() still observes it.
      void responsePromise.catch(() => {});
      const request = http.request({ hostname: this.repository.hostname, port: 443, method: head.method, path: head.pathAndQuery,
        headers, agent, maxHeaderSize: limits.responseHeader, setHost: false }, responseResolve);
      request.once("error", responseReject); request.flushHeaders(); const owner = this;
      const release = () => { owner.#agents.delete(agent); owner.#sockets.delete(socket); try { agent.destroy(); } catch {} try { socket.destroy(); } catch {} };
      return Object.freeze({
        async writeBody(bytes) {
          try {
            owner.#demandOpen();
            if (finished || !Buffer.isBuffer(bytes) || bytes.length === 0 || written + bytes.length > head.contentLength) throw fail("git-tls-request-stream-invalid");
            written += bytes.length;
            if (!request.write(bytes)) await owner.#race(once(request, "drain"), owner.#remaining(), "git-tls-absolute-deadline");
          } catch (error) { throw owner.#poison(error); }
        },
        async finish() {
          try {
            owner.#demandOpen(); if (finished || written !== head.contentLength) throw fail("git-tls-request-stream-invalid");
            finished = true; request.end();
            const response = await owner.#race(responsePromise, owner.#remaining(), "git-tls-absolute-deadline");
            const expectedType = head.requestOrdinal === 0 ? "application/x-git-upload-pack-advertisement" : "application/x-git-upload-pack-result";
            if (response.statusCode !== 200) throw fail("git-tls-response-status-denied");
            const observedHeaderBytes = responseHeaderBytes(response); if (observedHeaderBytes > limits.responseHeader) throw fail("git-tls-response-header-limit");
            const type = oneHeader(response, "content-type"), lengthText = oneHeader(response, "content-length"), transfer = oneHeader(response, "transfer-encoding");
            if (type !== expectedType || (lengthText !== null && transfer !== null) || (transfer !== null && transfer.toLowerCase() !== "chunked")
                || oneHeader(response, "content-encoding") !== null || oneHeader(response, "location") !== null) throw fail("git-tls-response-header-invalid");
            let contentLength = null;
            if (lengthText !== null) {
              if (!/^(?:0|[1-9][0-9]*)$/u.test(lengthText)) throw fail("git-tls-response-header-invalid");
              contentLength = Number(lengthText); if (!Number.isSafeInteger(contentLength) || contentLength > limits.responseBody) throw fail("git-tls-response-body-limit");
            }
            const resultHead = Object.freeze({ schemaVersion: "runa-public-git-http-response/v1", requestOrdinal: head.requestOrdinal,
              status: 200, contentType: type, contentLength, headerBytes: observedHeaderBytes });
            let consumed = false;
            const body = Object.freeze({
              cancel() { if (!consumed) { consumed = true; release(); owner.#poison(fail("git-tls-response-abandoned")); } },
              async *[Symbol.asyncIterator]() {
                if (consumed) throw owner.#poison(fail("git-tls-response-reused"));
                consumed = true; let bytes = 0, complete = false;
                try {
                  const iterator = response[Symbol.asyncIterator]();
                  while (true) {
                    const item = await owner.#race(iterator.next(), owner.#remaining(), "git-tls-absolute-deadline"); if (item.done) break;
                    const value = Buffer.from(item.value); if (value.length === 0) continue;
                    bytes += value.length; owner.#responseBytes += value.length;
                    if (bytes > limits.responseBody || owner.#responseBytes > limits.responseBody) throw fail("git-tls-response-body-limit");
                    yield value;
                  }
                  if (contentLength !== null && bytes !== contentLength) throw fail("git-tls-response-length-mismatch"); complete = true;
                } catch (error) { throw owner.#poison(error); }
                finally { release(); if (!complete) owner.#poison(fail("git-tls-response-abandoned")); }
              },
            });
            return Object.freeze({ head: resultHead, body });
          } catch (error) { release(); throw owner.#poison(error); }
        },
      });
    } catch (error) { throw this.#poison(error); }
  }
  observation() {
    const base = { policyId: NETWORK_POLICY_ID, policyDigest: NETWORK_POLICY_DIGEST, allowed: this.#selection !== null,
      connections: this.#connections, failed: this.#failure !== null };
    return Object.freeze(this.#selection ? { ...base, family: this.#selection.family, answerSetDigest: this.#selection.answerSetDigest,
      selectedAddressDigest: this.#selection.selectedAddressDigest } : base);
  }
  close() {
    if (!this.#closed) {
      this.#closed = true; if (this.#deadlineTimer !== undefined) this.clearTimer(this.#deadlineTimer);
      for (const agent of this.#agents) { try { agent.destroy(); } catch {} }
      for (const socket of this.#sockets) { try { socket?.destroy?.(); } catch {} }
      this.#agents.clear(); this.#sockets.clear(); this.#selected?.fill(0);
    }
  }
  selectedAddressDestroyed() { return this.#selected === null || this.#selected.every(byte => byte === 0); }
  poisoned() { return this.#failure !== null; }
}

/** Explicitly non-production composition for local TLS and deterministic fault tests. */
export function createGitTlsConnectorForTest({ resolver, tlsConnect, ca, now, setTimer, clearTimer }) {
  if (typeof resolver !== "function" || typeof tlsConnect !== "function") throw fail("git-tls-test-composition-invalid");
  const composition = Object.freeze({ token: TEST_COMPOSITION, resolver, tlsConnect, ca, now, setTimer, clearTimer });
  return options => new GitTlsConnector(options, composition);
}
