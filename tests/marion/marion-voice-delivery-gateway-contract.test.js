"use strict";

const assert = require("assert");
const { handleMarionVoiceDelivery } = require("../../Data/marion/runtime/MarionVoiceDeliveryGateway.js");
const { INTENT_CLASSES } = require("../../Data/marion/runtime/MarionVoiceIntentClasses.js");

(async () => {
  let packet = await handleMarionVoiceDelivery({
    transcript: "Nyx, give me the voice lane status.",
    speakerHint: "Mac"
  });
  assert.strictEqual(packet.ok, true);
  assert.strictEqual(packet.publicAgent, "Nyx");
  assert.strictEqual(packet.authority, "Marion");
  assert.strictEqual(packet.intent.intentClass, INTENT_CLASSES.STATUS_REQUEST);
  assert.strictEqual(packet.identity.authorized, true);
  assert.strictEqual(packet.voiceDelivery.speakAllowed, true);
  assert.strictEqual(packet.voiceDelivery.audioStored, false);
  assert.strictEqual(packet.meta.noRawAudioStored, true);

  packet = await handleMarionVoiceDelivery({
    transcript: "Deploy this to production.",
    speakerHint: "Mac"
  });
  assert.strictEqual(packet.intent.intentClass, INTENT_CLASSES.ACTION_COMMAND);
  assert.strictEqual(packet.decision.requiresConfirmation, true);
  assert.strictEqual(packet.voiceDelivery.deliveryMode, "admin_voice_confirmation_prompt");

  packet = await handleMarionVoiceDelivery({
    transcript: "Update the index file.",
    speakerHint: "Guest"
  });
  assert.strictEqual(packet.intent.intentClass, INTENT_CLASSES.ACTION_COMMAND);
  assert.strictEqual(packet.identity.authorized, false);
  assert.strictEqual(packet.voiceDelivery.speakAllowed, false);

  console.log("PASS marion-voice-delivery-gateway-contract");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
