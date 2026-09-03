import {
  admitGitOpenRequest,
  admitGitOpenResponse,
  admitPipeFrame,
  gitStreamFrameSchema,
  parseCanonicalWire,
} from "./materialization-contracts.mjs";

const MAX_HEADER = 16_384;
const MAX_PAYLOAD = 1_048_576;
const MAX_REQUEST = 2_097_152;
const MAX_RESPONSE = 100_663_296;
const fail = code => Object.assign(new Error(code), { code });

/** Four-byte big-endian header length, canonical header bytes, then its declared payload bytes. */
export class GitFrameDecoder {
  constructor() { this.failed = false; this.prefix = Buffer.alloc(4); this.prefixOffset = 0; this.resetFrame(); }
  resetFrame() { this.header = null; this.headerOffset = 0; this.payload = null; this.payloadOffset = 0; }
  destroy() {
    this.failed = true; this.prefix.fill(0); this.header?.fill(0); this.payload?.fill(0); this.resetFrame();
  }
  push(chunk, onRecord) {
    if (this.failed) throw fail("git-frame-decoder-failed");
    if (!Buffer.isBuffer(chunk) || typeof onRecord !== "function") {
      this.destroy(); throw fail("git-frame-input-type-invalid");
    }
    let offset = 0, count = 0;
    try {
      while (offset < chunk.length) {
        if (this.header === null) {
          const take = Math.min(4 - this.prefixOffset, chunk.length - offset);
          chunk.copy(this.prefix, this.prefixOffset, offset, offset + take); this.prefixOffset += take; offset += take;
          if (this.prefixOffset < 4) continue;
          const length = this.prefix.readUInt32BE(0);
          if (length < 2 || length > MAX_HEADER) throw fail("git-frame-header-limit");
          this.header = Buffer.alloc(length); this.headerOffset = 0; this.prefixOffset = 0;
        }
        if (this.headerOffset < this.header.length) {
          const take = Math.min(this.header.length - this.headerOffset, chunk.length - offset);
          chunk.copy(this.header, this.headerOffset, offset, offset + take); this.headerOffset += take; offset += take;
          if (this.headerOffset < this.header.length) continue;
          const frame = parseCanonicalWire(gitStreamFrameSchema, this.header, MAX_HEADER);
          if (frame.payloadBytes > MAX_PAYLOAD) throw fail("git-frame-payload-limit");
          this.payload = Buffer.alloc(frame.payloadBytes); this.payloadOffset = 0;
        }
        if (this.payloadOffset < this.payload.length) {
          const take = Math.min(this.payload.length - this.payloadOffset, chunk.length - offset);
          chunk.copy(this.payload, this.payloadOffset, offset, offset + take); this.payloadOffset += take; offset += take;
          if (this.payloadOffset < this.payload.length) continue;
        }
        const record = Object.freeze({ rawHeader: this.header, payload: this.payload });
        this.resetFrame(); onRecord(record); count += 1;
      }
      return count;
    } catch (error) { this.destroy(); throw error; }
  }
  finish() {
    if (this.failed) throw fail("git-frame-decoder-failed");
    if (this.prefixOffset !== 0 || this.header !== null) { this.destroy(); throw fail("git-frame-truncated"); }
  }
}

const phaseRules = Object.freeze([
  [0, "materializer-to-broker", "open-request"], [0, "materializer-to-broker", "end-request"],
  [0, "broker-to-materializer", "open-response"], [0, "broker-to-materializer", "end-response"],
  [1, "materializer-to-broker", "open-request"], [1, "materializer-to-broker", "end-request"],
  [1, "broker-to-materializer", "open-response"], [1, "broker-to-materializer", "end-response"],
  [1, "broker-to-materializer", "terminal"],
]);

/** Online validator: it retains no body or transcript and releases each admitted frame immediately. */
export class GitStreamSession {
  #key;

  constructor({ channelId, requestId, nonce, repositoryPath, key }) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw fail("pipe-key-invalid");
    this.expected = { channelId, requestId, nonce, repositoryPath };
    this.#key = Buffer.from(key);
    this.nextSequence = { "materializer-to-broker": 1, "broker-to-materializer": 1 };
    this.frameCounts = { "materializer-to-broker": 0, "broker-to-materializer": 0 };
    this.phase = 0; this.requestBytes = 0; this.responseBytes = 0;
    this.requestHead = null; this.responseHead = null;
    this.currentRequestBytes = 0; this.currentResponseBytes = 0; this.complete = false; this.failed = false;
    this.eof = { "materializer-to-broker": false, "broker-to-materializer": false };
  }

  destroy() { this.#key.fill(0); this.failed = true; }
  keyDestroyed() { return this.#key.every(byte => byte === 0); }

  accept(record) {
    if (this.failed) throw fail("pipe-session-failed");
    try {
      if (this.complete) throw fail("pipe-frame-after-terminal");
      if (record === null || typeof record !== "object" || Array.isArray(record)) throw fail("pipe-record-invalid");
      let rawHeader, payload;
      try { rawHeader = record.rawHeader; payload = record.payload; }
      catch { throw fail("pipe-record-invalid"); }
      if (!Buffer.isBuffer(rawHeader) || !Buffer.isBuffer(payload)) throw fail("pipe-record-invalid");
      const frame = admitPipeFrame(gitStreamFrameSchema, rawHeader, payload, this.#key);
      const direction = frame.direction;
      if (this.eof[direction]) throw fail("pipe-frame-after-eof");
      if (frame.channelId !== this.expected.channelId || frame.requestId !== this.expected.requestId
        || frame.nonce !== this.expected.nonce || frame.sequence !== this.nextSequence[direction]++) {
        throw fail("pipe-channel-binding-invalid");
      }
      if (++this.frameCounts[direction] > 128) throw fail("pipe-frame-count-limit");
      if (["end-request", "end-response", "terminal"].includes(frame.frameType) && payload.length !== 0) {
        throw fail("pipe-empty-frame-has-payload");
      }
      const rule = phaseRules[this.phase];
      const isRequestBody = frame.frameType === "request-body" && this.phase === 5 && frame.requestOrdinal === 1
      && direction === "materializer-to-broker";
      const isResponseBody = frame.frameType === "response-body" && [3, 7].includes(this.phase)
      && frame.requestOrdinal === rule[0] && direction === "broker-to-materializer";
      if (isRequestBody || isResponseBody) {
        if (payload.length === 0) throw fail("pipe-body-frame-empty");
        if (isRequestBody) {
          this.currentRequestBytes += payload.length; this.requestBytes += payload.length;
          if (this.requestBytes > MAX_REQUEST) throw fail("pipe-request-body-limit");
        } else {
          this.currentResponseBytes += payload.length; this.responseBytes += payload.length;
          if (this.responseBytes > MAX_RESPONSE) throw fail("pipe-response-body-limit");
        }
        return Object.freeze({ frame, payload });
      }
      if (!rule || frame.requestOrdinal !== rule[0] || direction !== rule[1] || frame.frameType !== rule[2]) {
        throw fail("pipe-terminal-pattern-invalid");
      }
      if (frame.frameType === "open-request") {
        this.requestHead = admitGitOpenRequest(payload, this.expected.repositoryPath);
        if (this.requestHead.requestOrdinal !== frame.requestOrdinal) throw fail("pipe-request-head-mismatch");
        this.currentRequestBytes = 0;
      } else if (frame.frameType === "end-request") {
        if (this.requestHead.contentLength !== this.currentRequestBytes) throw fail("pipe-head-body-length-mismatch");
      } else if (frame.frameType === "open-response") {
        this.responseHead = admitGitOpenResponse(payload);
        if (this.responseHead.requestOrdinal !== frame.requestOrdinal) throw fail("pipe-response-head-mismatch");
        this.currentResponseBytes = 0;
      } else if (frame.frameType === "end-response") {
        if (this.responseHead.contentLength !== null && this.responseHead.contentLength !== this.currentResponseBytes) {
          throw fail("pipe-head-body-length-mismatch");
        }
      } else if (frame.frameType === "terminal") { this.complete = true; this.#key.fill(0); }
      this.phase += 1;
      return Object.freeze({ frame, payload });
    } catch (error) { this.destroy(); throw error; }
  }

  endDirection(direction) {
    if (this.failed) throw fail("pipe-session-failed");
    try {
      if (!Object.hasOwn(this.eof, direction) || this.eof[direction]
          || (direction === "materializer-to-broker" ? this.phase < 6 : !this.complete)) {
        throw fail("pipe-direction-eof-invalid");
      }
      this.eof[direction] = true;
    } catch (error) { this.destroy(); throw error; }
  }

  finish() {
    if (this.failed) throw fail("pipe-session-failed");
    if (!this.complete || this.phase !== phaseRules.length || !this.eof["materializer-to-broker"]
        || !this.eof["broker-to-materializer"]) { this.destroy(); throw fail("pipe-terminal-pattern-invalid"); }
    return Object.freeze({ requestBytes: this.requestBytes, responseBytes: this.responseBytes, terminal: true,
      requestFrames: this.frameCounts["materializer-to-broker"],
      responseFrames: this.frameCounts["broker-to-materializer"] });
  }
}
