
"use strict";
const assert = require("assert");
const envelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const adapter = require("../adapters/guardian.response.adapter.js");
const memory = require("../memory/guardian.memory.bridge.js");
const audit = require("../audit/guardian.audit.logger.js");
const contract = require("../Data/marion/runtime/marion.runtime.contract.json");

assert.ok(envelope.MARION_R18C_FINAL_RESPONSE_ENVELOPE_VERSION, "final envelope R18C integration export missing");
assert.ok(adapter.MARION_R18C_FINAL_RESPONSE_ENVELOPE_VERSION, "adapter R18C integration export missing");
assert.ok(memory.MARION_R18C_MEMORY_TECHNICAL_LAW_SURGERY_GUARD_VERSION, "memory technical law guard missing");
assert.ok(audit.MARION_R18C_AUDIT_FINAL_RESPONSE_VERSION, "audit law event enrichment missing");
assert.strictEqual(contract.rules.r18CFinalResponseEnvelopeIntegrationActive, true);

const lawPrompt = "Can I use copyrighted movies on my Roku channel if I have paperwork?";
const lawPacket = envelope.marionR18CFinalEnvelopeApply({ directReply: "AI lane active: assess goal, context, data, risk." }, lawPrompt);
assert.strictEqual(lawPacket.r18CLawRealWorldAssessment, true);
assert.strictEqual(lawPacket.legalCategory, "copyright_licensing");
assert.match(lawPacket.directReply, /not legal advice/i);
assert.match(lawPacket.directReply, /OTT|CTV|Roku|distribution/i);
assert.strictEqual(lawPacket.noAttorneyClientRelationship, true);

const employmentPrompt = "I was fired and they gave me a release to sign. Is two weeks fair?";
const employmentPacket = envelope.marionR18CFinalEnvelopeApply({ reply: "" }, employmentPrompt);
assert.strictEqual(employmentPacket.legalCategory, "employment_contractor");
assert.match(employmentPacket.reply, /release|sign|employment/i);

const technicalPrompt = "Give me a surgical autopsy on the law manifest and law payload files and resend the package.";
const technicalPacket = envelope.marionR18CFinalEnvelopeApply({ directReply: "Law assessment: classify the legal category and jurisdiction." }, technicalPrompt);
assert.strictEqual(technicalPacket.lawTechnicalSurgeryGuard, true);
assert.ok(!/^Law assessment:/i.test(technicalPacket.directReply));
assert.match(technicalPacket.directReply, /Technical routing preserved/i);

const adapted = adapter.adaptGuardianResponse({ directReply: "Cyber lane active: verify identity, access, secrets.", prompt: lawPrompt }, {});
assert.ok(adapted.directReply || adapted.visibleReply || adapted.publicReply);
assert.match(adapted.directReply || adapted.visibleReply || adapted.publicReply, /not legal advice|copyright\/licensing/i);

const snap = memory.rememberTurn("marion", { prompt: technicalPrompt, reply: "patched files" });
assert.ok(snap.lawTechnicalSurgeryGuard || snap.activeFeatureLane === "technical");
const evt = audit.logGuardianEvent({ type: "law_final", prompt: lawPrompt, directReply: lawPacket.directReply });
assert.strictEqual(evt.meta.r18CLawRealWorldAssessment, true);
assert.strictEqual(evt.meta.legalCategory, "copyright_licensing");
console.log("R18C final response envelope smoke test passed");
