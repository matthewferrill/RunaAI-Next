import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE,
  browserWitnessSha256, canonicalBrowserWitness } from "./browser-witness.mjs";

const TOKEN = /^[a-f0-9]{64}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function buildBrowserWitnessPublication(request) {
  const endpoint = request?.observationEndpoint;
  if (request?.schemaVersion !== "runaai-m1-browser-checkpoint/v1"
      || request.caseId !== "agent-05-cancel-drain" || request.stage !== "in-flight"
      || request.preparationOnly !== false || request.reusePreparedBrowser !== true
      || endpoint?.schemaVersion !== "runaai-m1-browser-observation-endpoint/v2"
      || endpoint.witnessUrl !== `${request.baseUrl}/__acceptance/browser-observation-witness`
      || endpoint.ackUrl !== `${request.baseUrl}/__acceptance/browser-observation-ack`
      || !TOKEN.test(endpoint.witnessToken ?? "") || !TOKEN.test(endpoint.ackToken ?? "")
      || !Number.isFinite(Date.parse(endpoint.witnessExpiresAt))
      || !Number.isFinite(Date.parse(endpoint.publishExpiresAt))) {
    throw fail("browser-witness-helper-request-invalid");
  }
  const witness = canonicalBrowserWitness({
    boundedDrain: AGENT05_BOUNDED_DRAIN,
    claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE,
    taskStatus: "cancelled"
  });
  return Object.freeze({
    url: endpoint.witnessUrl,
    body: Object.freeze({ checkpointId: request.checkpointId, token: endpoint.witnessToken, witness }),
    witnessSha256: browserWitnessSha256(witness)
  });
}

export async function publishBrowserWitness(request, fetchImplementation = fetch) {
  const publication = buildBrowserWitnessPublication(request);
  let response;
  try {
    response = await fetchImplementation(publication.url, { method: "POST", redirect: "error",
      headers: { "content-type": "application/json" }, body: JSON.stringify(publication.body) });
  } catch { throw fail("browser-witness-helper-publication-failed"); }
  if (response.status !== 204) throw fail("browser-witness-helper-publication-failed");
  return publication.witnessSha256;
}
