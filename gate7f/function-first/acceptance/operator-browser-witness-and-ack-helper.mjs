import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { buildBrowserAck, publishBrowserObservation, writeCreateOnly } from "./operator-browser-ack-helper.mjs";
import { publishBrowserWitness } from "./operator-browser-witness-helper.mjs";
import { browserWitnessFromAck, canonicalBrowserWitness } from "./browser-witness.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function decodeJson(value, code) {
  try { return JSON.parse(Buffer.from(value, "base64").toString("utf8")); }
  catch { throw fail(code); }
}

export async function publishBrowserWitnessAndAck({ ticket, request, url, actual, details,
  observedWitness, observedAt, fetchImplementation = fetch, now = Date.now() }) {
  if (ticket?.checkpointId !== request?.checkpointId || ticket?.baseUrl !== request?.baseUrl
      || ticket?.witnessUrl !== request?.observationEndpoint?.witnessUrl
      || ticket?.witnessToken !== request?.observationEndpoint?.witnessToken
      || ticket?.witnessExpiresAt !== request?.observationEndpoint?.witnessExpiresAt) {
    throw fail("browser-witness-ack-helper-binding-invalid");
  }
  const ack = buildBrowserAck({ mode: "graded", request, url, actual, details, observedAt });
  let canonical;
  try { canonical = canonicalBrowserWitness(observedWitness); }
  catch { throw fail("browser-witness-ack-helper-observation-invalid"); }
  if (!isDeepStrictEqual(canonical, browserWitnessFromAck(ack))) {
    throw fail("browser-witness-ack-helper-observation-mismatch");
  }
  const witnessSha256 = await publishBrowserWitness(ticket, canonical, fetchImplementation, now);
  const livePublished = await publishBrowserObservation(request, ack, fetchImplementation);
  if (!livePublished) throw fail("browser-witness-ack-helper-live-publication-required");
  return { ack, witnessSha256, livePublished };
}

async function main() {
  const [ticketBase64, requestPath, outputPath, url, actualBase64, detailsBase64,
    observedWitnessBase64, observedAt] = process.argv.slice(2);
  if (!ticketBase64 || !requestPath || !outputPath || !url || !actualBase64 || !detailsBase64
      || !observedWitnessBase64 || !observedAt) throw fail("browser-witness-ack-helper-arguments");
  const ticket = decodeJson(ticketBase64, "browser-witness-ack-helper-ticket-invalid");
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  const actual = decodeJson(actualBase64, "browser-witness-ack-helper-actual-invalid");
  const details = decodeJson(detailsBase64, "browser-witness-ack-helper-details-invalid");
  const observedWitness = decodeJson(observedWitnessBase64, "browser-witness-ack-helper-observation-invalid");
  const value = await publishBrowserWitnessAndAck({ ticket, request, url, actual, details,
    observedWitness, observedAt });
  const bytes = writeCreateOnly(outputPath, value.ack);
  process.stdout.write(JSON.stringify({ schemaVersion: "runaai-m1-browser-witness-ack-publication/v1",
    checkpointId: request.checkpointId, observedAt, witnessSha256: value.witnessSha256,
    bytes, livePublished: value.livePublished }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => {
  process.stderr.write(`${error?.code ?? "browser-witness-ack-helper-failed"}\n`);
  process.exitCode = 1;
});
