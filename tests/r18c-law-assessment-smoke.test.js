"use strict";

const assert = require("assert");

function hasLawPacket(packet) {
  assert.equal(packet.r18CLawRealWorldAssessment, true);
  assert.equal(packet.lawAssessmentFrame, "category_jurisdiction_facts_assumptions_risk_missing_info_safe_next_move");
  assert.equal(packet.noLegalCertaintyClaim, true);
  assert.equal(packet.noAttorneyClientRelationship, true);
  assert.ok(String(packet.legalAdviceBoundary || "").includes("not_legal_advice"));
}

const copyrightPrompt = "Can I use copyrighted shows on Roku if I have broadcast paperwork?";
const contractPrompt = "Review this contract indemnity clause and tell me the risk.";

assert.ok(/copyright|roku|broadcast|paperwork/i.test(copyrightPrompt));
assert.ok(/contract|indemnity|risk/i.test(contractPrompt));

module.exports = { hasLawPacket };
