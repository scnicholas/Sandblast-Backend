
"use strict";

const assert = require("assert");
const adapter = require("../adapters/guardian.response.adapter.js");
const finalEnvelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const composer = require("../Data/marion/runtime/composeMarionResponse.js");
const chatEngine = require("../Utils/chatEngine.js");

const prompt = "Can I use copyrighted movies on my Roku channel if I have paperwork?";
const bad = { reply: "I'm here, Mac.", result: { reply: "Still with you, Mac." } };

for (const mod of [adapter, finalEnvelope, bridge, composer, chatEngine]) {
  assert.strictEqual(typeof mod.marionR18CLiveHandlerRepairApply, "function", "missing apply helper");
  const packet = JSON.parse(JSON.stringify(bad));
  const out = mod.marionR18CLiveHandlerRepairApply(packet, { prompt });
  const reply = out.reply || out.directReply || "";
  assert(/copyright|licens|roku|distribution/i.test(reply), "law reply not repaired: " + reply);
  assert.strictEqual(out.primaryDomain, "law");
  assert.strictEqual(out.legalCategory, "copyright_licensing");
}

const technicalPrompt = "Give me a surgical autopsy on the law manifest files and resend the zip.";
const technicalPacket = { reply: "I'm here, Mac." };
const untouched = adapter.marionR18CLiveHandlerRepairApply(technicalPacket, { prompt: technicalPrompt });
assert.strictEqual(untouched.reply, "I'm here, Mac.", "technical file work must not be converted into law advice");

const privacyPrompt = "A vendor has customer data. What should I check in the agreement?";
const privacyOut = adapter.marionR18CLiveHandlerRepairApply({ reply: "Still with you, Mac." }, { prompt: privacyPrompt });
assert.strictEqual(privacyOut.legalCategory, "privacy_data");
assert(/privacy|data|vendor|agreement/i.test(privacyOut.reply));

console.log("R18C live-handler repair smoke test passed");
