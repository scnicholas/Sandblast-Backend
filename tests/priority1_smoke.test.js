"use strict";

const gate = require("./MarionEthicalGatekeeper.js");
const adapter = require("./guardian.response.adapter.js");
const finalEnvelope = require("./marionFinalEnvelope.js");
const bridge = require("./marionBridge.js");
const composer = require("./composeMarionResponse.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const normalGate = gate.evaluateEthicalGate({ observationSummary: "Normal environmental review." });
assert(normalGate.allowed === true && normalGate.blocked === false, "normal ethical gate should pass");

const heldGate = gate.evaluateEthicalGate({ observationSummary: "Activate alarm for protection but no explicit code." });
assert(heldGate.blocked === true && heldGate.defensiveEscalation.active === true, "unverified defensive escalation should hold");

const authorizedGate = gate.evaluateEthicalGate({
  observationSummary: "Emergency personal safety imminent threat activate defensive alert with explicit authorized command.",
  defensiveJustification: {
    explicitCommand: true,
    immediateThreat: true,
    protectivePurpose: true,
    escalationRequested: true,
    permissionAllowed: true
  }
});
assert(authorizedGate.allowed === true, "authorized defensive gate should be allowed");
assert(authorizedGate.defensiveEscalation.escalationAllowed === true, "authorized defensive metadata should permit bounded escalation");

const packet = adapter.adaptGuardianResponse({ reply: "Visible response", ethicalGate: authorizedGate, authorization: "bearer SECRET" }, null);
assert(packet.directReply === "Visible response", "adapter should preserve direct reply");
assert(packet.approvalRequired === true, "adapter should carry human-review approval requirement");
assert(packet.ethicalGate && packet.defensiveEscalation, "adapter should carry ethical metadata");

const final = finalEnvelope.createMarionFinalEnvelope({
  reply: "This is a valid final reply.",
  ethicalGate: authorizedGate,
  defensiveEscalation: authorizedGate.defensiveEscalation,
  defensiveJustification: authorizedGate.defensiveJustification
});
assert(final.finalEnvelope.ethicalCarryActive === true, "final envelope should carry ethical metadata");
assert(final.payload.defensiveEscalation, "payload should carry defensive escalation metadata");

const carry = bridge._internal.bridgeDefensiveEscalationCarry({
  userQuery: "Emergency personal safety imminent threat activate defensive alert with explicit authorized command."
}, {});
assert(carry.immediateThreat === true, "bridge should extract immediate-threat flag");
assert(carry.explicitCommand === true, "bridge should extract explicit-command flag");
assert(carry.protectivePurpose === true, "bridge should extract protective-purpose flag");

const coordination = bridge._internal.buildParallelCoordinationSafe({
  userQuery: "Emergency personal safety imminent threat activate defensive alert with explicit authorized command."
}, {});
assert(coordination.ethicalGate && coordination.ethicalGate.defensiveEscalation, "parallel coordination should include ethical gate metadata");

const composed = composer.composeMarionResponse({}, {
  text: "Explain the ethical guardrail for defensive escalation alarm scenario with Aster and Talon."
});
const reply = composed.reply || composed.text || composed.publicReply || "";
assert(/defensive signalling|gatekeeper/i.test(reply), "composer should answer defensive escalation guardrail prompts");

console.log(JSON.stringify({
  ok: true,
  gateDecision: authorizedGate.decision,
  adapterVersion: packet.adapterVersion,
  finalEnvelopeCarry: final.finalEnvelope.ethicalCarryActive,
  bridgeDecision: coordination.ethicalGate.decision,
  composerReply: reply
}, null, 2));
