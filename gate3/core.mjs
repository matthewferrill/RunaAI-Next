import {
  parseGate3ApprovalRequest, parseGate3DeclineRequest, parseGate3ProposalRequest,
  parseGate3Proposal, parseGate3Receipt,
} from "./contracts.mjs";

const coded = (code, message) => Object.assign(new Error(message), { code });

export class Gate3GovernedActionService {
  constructor({ store, telemetry = null }) {
    this.store = store;
    this.telemetry = telemetry;
  }

  async propose(rawRequest) {
    const request = parseGate3ProposalRequest(rawRequest);
    this.#verifiedSteward(request.participant);
    if (request.origin.type === "retrieved-content") {
      throw coded("action-origin-denied", "Retrieved content is material, never action authority.");
    }
    const execute = async () => parseGate3Proposal(await this.store.propose(request));
    return this.#span("runaai.gate3.propose", request, execute);
  }

  async approveAndExecute(rawRequest, options = {}) {
    const request = parseGate3ApprovalRequest(rawRequest);
    this.#verifiedSteward(request.participant);
    const execute = async () => parseGate3Receipt(await this.store.approveAndExecute(request, options));
    return this.#span("runaai.gate3.approve_execute", request, execute);
  }

  async decline(rawRequest) {
    const request = parseGate3DeclineRequest(rawRequest);
    this.#verifiedSteward(request.participant);
    const execute = async () => parseGate3Proposal(await this.store.decline(request));
    return this.#span("runaai.gate3.decline", request, execute);
  }

  async readReceipt(participant, receiptId) {
    this.#verifiedSteward(participant);
    return parseGate3Receipt(await this.store.readReceipt(participant.principalId, receiptId));
  }

  #verifiedSteward(participant) {
    if (!participant?.verified) throw coded("action-not-authorized", "A verified steward session is required.");
  }

  #span(name, request, execute) {
    if (!this.telemetry) return execute();
    return this.telemetry.span(name, request, { component: "gate3", operation: name.split(".").at(-1),
      "action.kind": "participant-setting.set-default-intelligence-level" }, execute);
  }
}
