"use strict";

const assert = require("assert");
const { evaluateMarionVoiceDelivery } = require("../../Data/marion/runtime/MarionVoiceDeliveryPolicy.js");
const { INTENT_CLASSES } = require("../../Data/marion/runtime/MarionVoiceIntentClasses.js");

let delivery = evaluateMarionVoiceDelivery({
  reply: "Marion voice delivery is active.",
  intent: { intentClass: INTENT_CLASSES.STATUS_REQUEST },
  identity: { authorized: false },
  decision: { allowed: true }
});
assert.strictEqual(delivery.speakAllowed, false);
assert.strictEqual(delivery.deliveryMode, "text_only");

delivery = evaluateMarionVoiceDelivery({
  reply: "Marion voice delivery is active.",
  intent: { intentClass: INTENT_CLASSES.STATUS_REQUEST },
  identity: { authorized: true },
  decision: { allowed: true }
});
assert.strictEqual(delivery.speakAllowed, true);
assert.strictEqual(delivery.voiceOwner, "Marion");
assert.strictEqual(delivery.audioStored, false);

delivery = evaluateMarionVoiceDelivery({
  reply: "Here is the api key: secret token.",
  intent: { intentClass: INTENT_CLASSES.KNOWLEDGE_QUERY },
  identity: { authorized: true },
  decision: { allowed: true }
});
assert.strictEqual(delivery.speakAllowed, false);
assert.strictEqual(delivery.reason, "CONTENT_NOT_SAFE_FOR_SPEECH");

delivery = evaluateMarionVoiceDelivery({
  reply: "Marion received the deploy command.",
  intent: { intentClass: INTENT_CLASSES.ACTION_COMMAND },
  identity: { authorized: true },
  decision: { allowed: false, requiresConfirmation: true, decisionState: "confirmation_required" }
});
assert.strictEqual(delivery.speakAllowed, true);
assert.strictEqual(delivery.deliveryMode, "admin_voice_confirmation_prompt");

console.log("PASS marion-voice-delivery-policy");
