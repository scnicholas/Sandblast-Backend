"use strict";

const { cleanText, INTENT_CLASSES } = require("./MarionVoiceIntentClasses.js");
const { classifyMarionVoiceIntent } = require("./MarionVoiceIntentClassifier.js");
const { evaluateAdminVoiceIdentity } = require("./MarionAdminVoiceIdentityGate.js");
const { evaluateMarionVoiceAuthorityDecision } = require("./MarionVoiceDecisionAuthorityRouter.js");
const { evaluateMarionVoiceDelivery } = require("./MarionVoiceDeliveryPolicy.js");

const VERSION = "marion.voiceDeliveryGateway/1.0-adminOnlyDecisionAuthority";

function defaultMarionReply(intent) {
  const intentClass = cleanText(intent && intent.intentClass);
  if (intentClass === INTENT_CLASSES.STATUS_REQUEST) {
    return "Marion voice delivery is configured as an administrator-only lane. Nyx remains the public conduit, Marion remains the authority, and raw audio is not stored.";
  }
  if (intentClass === INTENT_CLASSES.FOLLOW_UP_QUERY) {
    return "Marion can continue from the prior context after the topic anchor is validated.";
  }
  if (intentClass === INTENT_CLASSES.ACTION_COMMAND) {
    return "Marion received the action command. Administrator authority and confirmation are required before execution.";
  }
  if (intentClass === INTENT_CLASSES.ADMIN_VOICE_DELIVERY_REQUEST) {
    return "Marion voice delivery is restricted to the administrator voice lane.";
  }
  return "Marion received the voice turn and remains the decision authority behind Nyx.";
}

async function handleMarionVoiceDelivery(input = {}, deps = {}) {
  const transcript = cleanText(input.transcript || input.text || input.message || input.query || "");
  const context = input.context && typeof input.context === "object" ? input.context : {};
  const identity = evaluateAdminVoiceIdentity({
    speakerHint: input.speakerHint,
    speaker: input.speaker,
    user: input.user,
    adminToken: input.adminToken,
    token: input.token,
    headers: input.headers || {}
  }, deps.identityOptions || {});

  const intent = classifyMarionVoiceIntent({
    transcript,
    context,
    previousTopic: input.previousTopic || context.topic,
    lastAssistantReply: input.lastAssistantReply || context.lastAssistantReply
  });

  const decision = evaluateMarionVoiceAuthorityDecision({ intent, identity, context });
  const marionReply = cleanText(
    typeof deps.composeMarionReply === "function"
      ? await deps.composeMarionReply({ transcript, intent, identity, decision, context })
      : input.marionReply || input.reply || defaultMarionReply(intent)
  );

  const delivery = evaluateMarionVoiceDelivery({
    reply: marionReply,
    intent,
    identity,
    decision
  });

  return {
    ok: true,
    version: VERSION,
    publicAgent: "Nyx",
    authority: "Marion",
    inputChannel: "voice",
    source: "voice",
    transcriptOnly: true,
    intent,
    decision,
    identity: {
      authorized: identity.authorized,
      adminVoiceAllowed: identity.adminVoiceAllowed,
      reason: identity.reason,
      identityMode: identity.identityMode
    },
    voiceDelivery: delivery,
    reply: delivery.textDisplay,
    spokenText: delivery.spokenText,
    meta: {
      routeAuthority: "Nyx conduit -> MarionVoiceDeliveryGateway -> Marion decision authority -> admin-only voice delivery policy",
      noRawAudioStored: true,
      audioStored: false,
      rawAudioAccepted: false,
      adminOnlyVoiceDelivery: true
    }
  };
}

module.exports = {
  VERSION,
  handleMarionVoiceDelivery,
  defaultMarionReply
};
