"use strict";
const assert = require("assert");
const adapter = require("../adapters/guardian.response.adapter.js");

const sample = {
  primaryDomain: "law",
  selectedDomain: "law",
  knowledgeDomain: "law",
  legalCategory: "copyright_licensing",
  lawAssessmentFrame: "legal_category,jurisdiction_sensitivity,facts_vs_assumptions,risk_exposure,missing_information,source_document_check,safe_next_move",
  legalRiskBoundary: {
    generalInformationOnly: true,
    noLegalAdvice: true
  },
  jurisdictionSensitivity: true,
  factsAssumptionsSeparated: true,
  legalSourceDocumentCheckRequired: true,
  noLegalCertaintyClaim: true,
  noAttorneyClientRelationship: true
};

assert.strictEqual(typeof adapter.marionR18CFinalAnswerMaterializerProject, "function");
const projected = adapter.marionR18CFinalAnswerMaterializerProject(sample, {
  prompt: "Can I use copyrighted movies on my Roku channel if I have paperwork?"
});

assert(projected.reply && /copyright\/licensing|copyright/i.test(projected.reply), "reply should be materialized as copyright/licensing");
assert(/not legal advice/i.test(projected.reply), "reply should preserve non-advice posture");
assert(!/primaryDomain/i.test(projected.reply), "reply must not expose routing metadata");
assert(!/lawAssessmentFrame/i.test(projected.reply), "reply must not expose assessment-frame metadata");
assert.strictEqual(projected.legalCategory, "copyright_licensing");
assert.strictEqual(projected.finalEnvelope.reply, projected.reply);

const privacy = adapter.marionR18CFinalAnswerMaterializerProject({
  primaryDomain: "law",
  legalCategory: "privacy_data",
  legalRiskBoundary: { noLegalAdvice: true }
}, {
  prompt: "A vendor has customer data. What should I check in the agreement?"
});

assert(/privacy\/data|customer data|vendor agreement/i.test(privacy.reply), "privacy/data prompt should materialize correctly");
assert(!/legalRiskBoundary/i.test(privacy.reply), "privacy reply must not expose raw boundary metadata");

const technical = adapter.marionR18CFinalAnswerMaterializerProject({
  primaryDomain: "law",
  legalCategory: "copyright_licensing"
}, {
  prompt: "Give me a surgical autopsy on the law manifest files and resend a zip."
});
assert.strictEqual(technical.primaryDomain, "law", "technical file work should not be projected into legal advice by this helper call");

console.log("R18C final answer materializer smoke test passed.");
