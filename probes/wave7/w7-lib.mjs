// Wave 7 shared helpers. Everything that reads a verdict reads the wire log, never the answer.
import { readFileSync, existsSync, rmSync } from "node:fs";
import { SYSTEM_SECRET } from "../wave2/w2-lib.mjs";
export { SYSTEM_SECRET };

export const wireEntries = (p) => existsSync(p)
  ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } })
  : [];

export const chatCalls = (p) => wireEntries(p).filter((e) => e.isChat);

// Did anything usable come back? A 2xx carrying parseable content is usable; anything else is not.
// This is the half of the fabrication test that cannot be read from the answer.
export function endpointGaveUsable(p) {
  // A 2xx carrying real content is usable. A truncated body is not, even though it is a 200 with
  // content, because the client was handed an answer the endpoint never finished producing.
  return chatCalls(p).some((e) => e.code === 200 && (e.contentLen ?? 0) > 0 && e.note !== "injected-truncated");
}

// I-7X, both directions. Present-detection and absent-confirmation are separate functions so a
// validation check can prove the detector fires rather than only that it stays quiet -- the lesson
// from Wave 6, where a stuck-false detector passed a one-directional check.
export const secretOnWire = (p) => chatCalls(p).some((e) => typeof e.outbound === "string" && e.outbound.includes(SYSTEM_SECRET));
export const secretAbsentFromWire = (p) => chatCalls(p).length > 0 && !secretOnWire(p);

// One logical turn producing more than one completed generation is visible only here.
export const completedGenerations = (p) => chatCalls(p).filter((e) => e.code === 200 && (e.contentLen ?? 0) > 0).length;

export const declaredModels = (p) => [...new Set(chatCalls(p).map((e) => e.declaredModel).filter(Boolean))];

export const parse = (out, key) => String(out ?? "").match(new RegExp(`${key}::(.*)`))?.[1] ?? null;
export const answered = (out) => parse(out, "ANSWERED") === "1";
export const answerText = (out) => parse(out, "TEXT") ?? "";

export const freshWire = (p) => { rmSync(p, { force: true }); return p; };
