"use strict";

const { INTENT_CLASSES, cleanText } = require("./MarionVoiceIntentClasses.js");

const VERSION = "marion.voiceDeliveryPolicy/1.0-adminOnlyMarionVoice";

const UNSAFE_SPEAK_PATTERNS = Object.freeze([
  /```[\s\S]*?```/,
  /<\s*(?:script|iframe|object|embed|style)\b/i,
  /\b(?:api[_-]?key|secret|token|password|private\s+key|bearer\s+[a-z0-9._-]+)\b/i,
  /\b(?:stack trace|typeerror|referenceerror|syntaxerror|runtime telemetry|diagnostics)\b/i
]);

function isUnsafeForSpeech(value) {
  const text = cleanText(value);
  return !!text && UNSAFE_SPEAK_PATTERNS.some((rx) => rx.test(text));
}

function cleanSpokenText(value) {
  return cleanText(value)
    .replace(/\bMerion\b/g, "Marion")
    .replace(/\bMarian\b/g, "Marion")
    .replace(/\bMario\b/g, "Marion")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function defaultTextForIntent(intentClass) {
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

function evaluateMarionVoiceDelivery(input = {}) {
  const identity = input.identity && typeof input.identity === "object" ? input.identity : {};
  const intent = input.intent && typeof input.intent === "object" ? input.intent : {};
  const decision = input.decision && typeof input.decision === "object" ? input.decision : {};
  const intentClass = cleanText(intent.intentClass || INTENT_CLASSES.UNKNOWN);
  const adminAuthorized = identity.authorized === true || identity.adminVoiceAllowed === true;
  const baseReply = cleanSpokenText(input.reply || input.textDisplay || defaultTextForIntent(intentClass));
  const unsafe = isUnsafeForSpeech(baseReply);

  let speakAllowed = false;
  let deliveryMode = "text_only";
  let reason = "ADMIN_VOICE_REQUIRED";
  let spokenText = "";
  let textDisplay = baseReply;

  if (!adminAuthorized) {
    speakAllowed = false;
    deliveryMode = "text_only";
    reason = "ADMIN_VOICE_REQUIRED";
  } else if (unsafe) {
    speakAllowed = false;
    deliveryMode = "text_only_sensitive";
    reason = "CONTENT_NOT_SAFE_FOR_SPEECH";
    textDisplay = "Marion has a response, but it contains technical or sensitive material that should remain text-only.";
  } else if (decision.requiresConfirmation === true || decision.decisionState === "confirmation_required") {
    speakAllowed = true;
    deliveryMode = "admin_voice_confirmation_prompt";
    reason = decision.reason || "CONFIRMATION_REQUIRED";
    spokenText = "I need explicit confirmation before carrying out that action.";
    textDisplay = baseReply || spokenText;
  } else if (decision.allowed === false) {
    speakAllowed = false;
    deliveryMode = "text_only_denied";
    reason = decision.reason || "MARION_AUTHORITY_DENIED";
    textDisplay = baseReply;
  } else if (intentClass === INTENT_CLASSES.ACTION_COMMAND) {
    speakAllowed = true;
    deliveryMode = "admin_voice_brief";
    reason = "ADMIN_ACTION_BRIEF_SPEECH_ALLOWED";
    spokenText = baseReply.slice(0, 260);
  } else {
    speakAllowed = true;
    deliveryMode = "admin_voice_full";
    reason = "ADMIN_VOICE_DELIVERY_ALLOWED";
    spokenText = baseReply.slice(0, 700);
  }

  return {
    ok: true,
    version: VERSION,
    publicAgent: "Nyx",
    authority: "Marion",
    voiceOwner: "Marion",
    deliveryChannel: "admin_voice",
    adminAuthorized,
    speakAllowed,
    deliveryMode,
    reason,
    spokenText,
    textDisplay,
    audioStored: false,
    noRawAudioStored: true,
    rawAudioAccepted: false
  };
}

module.exports = {
  VERSION,
  evaluateMarionVoiceDelivery,
  cleanSpokenText,
  isUnsafeForSpeech
};
