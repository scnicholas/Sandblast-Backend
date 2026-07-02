"use strict";

const assert = require("assert");
const adapter = require("../adapters/guardian.response.adapter.js");

assert.strictEqual(typeof adapter.marionR18CReplyQueueParityRepairApply, "function", "reply queue parity helper must export");

const social = "I’m here, Mac. I’m steady and with the thread. I’ll keep the answer human, protective, and clean. Do you want to keep testing the greeting lane?";
const technical = "I’m reading this as Priority 9F-R3: ALT runtime prompt-echo suppression. The surface request is to patch the Marion ALT/admin runtime so it never returns stale social text as the final answer. Next move: enforce reply-field parity across composer, bridge, final envelope, adapter, chat engine, and index.";

const packet = {
  reply: social,
  directReply: social,
  publicReply: social,
  visibleReply: social,
  displayReply: technical,
  domain: "",
  legalCategory: "",
  r18CFinalAnswerMaterializer: "",
  r18CLawRealWorldAssessment: ""
};

const repaired = adapter.marionR18CReplyQueueParityRepairApply(packet, {
  prompt: "Run a surgical autopsy on the law manifest files."
});

assert.strictEqual(repaired.reply, technical, "reply should be promoted from displayReply");
assert.strictEqual(repaired.directReply, technical, "directReply should match displayReply");
assert.strictEqual(repaired.publicReply, technical, "publicReply should match displayReply");
assert.strictEqual(repaired.visibleReply, technical, "visibleReply should match displayReply");
assert.strictEqual(repaired.displayReply, technical, "displayReply should remain the technical answer");
assert.strictEqual(repaired.domain, "technical", "technical guard prompt should set technical domain");
assert.strictEqual(repaired.r18CReplyQueueParityRepair.active, true, "parity marker should be active");
assert.strictEqual(repaired.r18CReplyQueueParityRepair.technicalGuardPreserved, true, "technical guard should be preserved");

const lawPacket = {
  reply: "I can give general legal-risk triage, not legal advice. This is a copyright/licensing issue, not just a Roku setup question.",
  directReply: "I can give general legal-risk triage, not legal advice. This is a copyright/licensing issue, not just a Roku setup question.",
  publicReply: "I can give general legal-risk triage, not legal advice. This is a copyright/licensing issue, not just a Roku setup question.",
  visibleReply: "I can give general legal-risk triage, not legal advice. This is a copyright/licensing issue, not just a Roku setup question.",
  displayReply: social,
  domain: "law",
  legalCategory: "copyright_licensing",
  r18CLawRealWorldAssessment: true
};

const untouched = adapter.marionR18CReplyQueueParityRepairApply(lawPacket, {
  prompt: "Can I use copyrighted movies on my Roku channel if I have paperwork?"
});

assert.strictEqual(untouched.domain, "law", "legal prompt should remain law");
assert.ok(/copyright\/licensing/i.test(untouched.reply), "legal reply should not be overwritten by technical parity repair");

console.log("PASS r18c reply queue parity repair smoke test");
