"use strict";

const assert = require("assert");
const adapter = require("../adapters/guardian.response.adapter.js");

const project = adapter.marionR18CFinalAnswerMaterializerProject;
assert.strictEqual(typeof project, "function", "materializer projector export missing");

const prompt = "Can I use copyrighted movies on my Roku channel if I have paperwork?";
const badSocialReply = "I’m with you, Mac. I’ll keep the conversation natural and keep the system noise out of view. Do you want to continue the social response pass?";

const packet = {
  reply: badSocialReply,
  directReply: badSocialReply,
  publicReply: badSocialReply,
  visibleReply: badSocialReply,
  displayReply: badSocialReply,
  domain: "law",
  primaryDomain: "law",
  selectedDomain: "law",
  knowledgeDomain: "law",
  legalCategory: "copyright_licensing",
  legalCategories: ["copyright_licensing"],
  secondaryDomains: ["roku"],
  r18CLawRealWorldAssessment: true,
  jurisdictionSensitivity: true,
  factsAssumptionsSeparated: true,
  legalSourceDocumentCheckRequired: true,
  noLegalCertaintyClaim: true,
  noAttorneyClientRelationship: true,
  lawAssessmentFrame: "legal_category,jurisdiction_sensitivity,facts_vs_assumptions,risk_exposure,missing_information,source_document_check,safe_next_move"
};

const projected = project(packet, { prompt });
assert.strictEqual(projected.domain, "law");
assert.strictEqual(projected.legalCategory, "copyright_licensing");
assert.ok(projected.r18CFinalAnswerMaterializer && projected.r18CFinalAnswerMaterializer.active === true, "materializer metadata missing");
assert.ok(projected.r18CFinalAnswerMaterializer.socialContinuityOverride === true, "social precedence override missing");
assert.ok(/copyright|licens|roku|distribution|source documents|not legal advice/i.test(projected.reply), "law answer was not materialized");
assert.ok(!/social response pass|system noise out of view|conversation natural/i.test(projected.reply), "social continuity reply still projected");

const technicalPrompt = "Give me a surgical autopsy on the law manifest files and resend the zip package.";
const technicalProjected = project({ domain: "law", legalCategory: "copyright_licensing", reply: badSocialReply }, { prompt: technicalPrompt });
assert.strictEqual(technicalProjected.reply, badSocialReply, "technical law-file work must not be converted into legal advice");

console.log("PASS r18c-final-materializer-precedence-repair smoke");
