import { AGENT05_BOUNDED_DRAIN, AGENT05_BOUNDED_DRAIN_NOTICE,
  browserWitnessSha256, canonicalBrowserWitness } from "./browser-witness.mjs";

const TOKEN = /^[a-f0-9]{64}$/u;
const CHECKPOINT = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const TICKET_KEYS = Object.freeze(["baseUrl", "caseId", "checkpointId", "schemaVersion", "stage",
  "witnessExpiresAt", "witnessToken", "witnessUrl"]);
const consumedTickets = new Set();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateTicket(ticket, now) {
  let baseUrl, witnessUrl;
  try { baseUrl = new URL(ticket?.baseUrl); witnessUrl = new URL(ticket?.witnessUrl); } catch {
    throw fail("browser-witness-helper-request-invalid");
  }
  const expiresAt = Date.parse(ticket?.witnessExpiresAt);
  if (!ticket || Object.getPrototypeOf(ticket) !== Object.prototype
      || JSON.stringify(Object.keys(ticket).sort()) !== JSON.stringify(TICKET_KEYS)
      || ticket.schemaVersion !== "runaai-m1-browser-witness-publication/v1"
      || !CHECKPOINT.test(ticket.checkpointId ?? "")
      || ticket.caseId !== "agent-05-cancel-drain" || ticket.stage !== "in-flight"
      || !TOKEN.test(ticket.witnessToken ?? "") || !Number.isFinite(expiresAt) || expiresAt <= now
      || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password
      || witnessUrl.origin !== baseUrl.origin || witnessUrl.pathname !== "/__acceptance/browser-observation-witness"
      || witnessUrl.search || witnessUrl.hash || witnessUrl.username || witnessUrl.password
      || ticket.witnessUrl !== `${ticket.baseUrl}/__acceptance/browser-observation-witness`) {
    throw fail("browser-witness-helper-request-invalid");
  }
  return { expiresAt, key: `${ticket.checkpointId}\u0000${ticket.witnessToken}` };
}

export function buildBrowserWitnessPublication(ticket, now = Date.now()) {
  validateTicket(ticket, now);
  const witness = canonicalBrowserWitness({
    boundedDrain: AGENT05_BOUNDED_DRAIN,
    claimedImmediateKill: false,
    notice: AGENT05_BOUNDED_DRAIN_NOTICE,
    taskStatus: "cancelled"
  });
  return Object.freeze({
    url: ticket.witnessUrl,
    body: Object.freeze({ checkpointId: ticket.checkpointId, token: ticket.witnessToken, witness }),
    witnessSha256: browserWitnessSha256(witness)
  });
}

export async function publishBrowserWitness(ticket, fetchImplementation = fetch, now = Date.now()) {
  const { key } = validateTicket(ticket, now);
  if (consumedTickets.has(key)) throw fail("browser-witness-helper-ticket-replayed");
  consumedTickets.add(key);
  const publication = buildBrowserWitnessPublication(ticket, now);
  let response;
  try {
    response = await fetchImplementation(publication.url, { method: "POST", redirect: "error",
      headers: { "content-type": "application/json" }, body: JSON.stringify(publication.body) });
  } catch { throw fail("browser-witness-helper-publication-failed"); }
  if (response.status !== 204) throw fail("browser-witness-helper-publication-failed");
  return publication.witnessSha256;
}
