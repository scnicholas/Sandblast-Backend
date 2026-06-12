"use strict";

const { INTENT_CLASSES, ACTION_RISK, cleanText } = require("./MarionVoiceIntentClasses.js");

const VERSION = "marion.voiceDecisionAuthorityRouter/1.0-authorityPreserve";

function evaluateMarionVoiceAuthorityDecision(input = {}) {
  const intent = input.intent && typeof input.intent === "object" ? input.intent : {};
  const identity = input.identity && typeof input.identity === "object" ? input.identity : {};
  const intentClass = cleanText(intent.intentClass || INTENT_CLASSES.UNKNOWN);
  const actionRisk = cleanText(intent.actionRisk || ACTION_RISK.NONE);
  const adminAuthorized = identity.authorized === true || identity.adminVoiceAllowed === true;

  let allowed = true;
  let decisionState = "allowed";
  let requiresConfirmation = intent.requiresConfirmation === true;
  let reason = "MARION_AUTHORITY_ALLOWED";

  if (intentClass === INTENT_CLASSES.ACTION_COMMAND && !adminAuthorized) {
    allowed = false;
    decisionState = "denied";
    reason = "ACTION_COMMAND_REQUIRES_ADMIN_AUTHORITY";
  } else if (intentClass === INTENT_CLASSES.ADMIN_VOICE_DELIVERY_REQUEST && !adminAuthorized) {
    allowed = false;
    decisionState = "text_only";
    reason = "ADMIN_VOICE_DELIVERY_REQUIRES_ADMIN_AUTHORITY";
  } else if (intentClass === INTENT_CLASSES.ACTION_COMMAND && (actionRisk === ACTION_RISK.DEPLOYMENT || actionRisk === ACTION_RISK.DESTRUCTIVE)) {
    allowed = false;
    decisionState = "confirmation_required";
    requiresConfirmation = true;
    reason = actionRisk === ACTION_RISK.DESTRUCTIVE
      ? "DESTRUCTIVE_ACTION_REQUIRES_EXPLICIT_CONFIRMATION"
      : "DEPLOYMENT_ACTION_REQUIRES_EXPLICIT_CONFIRMATION";
  } else if (intentClass === INTENT_CLASSES.FOLLOW_UP_QUERY) {
    decisionState = "context_validation_required";
    reason = "FOLLOW_UP_REQUIRES_CONTEXT_ANCHOR_VALIDATION";
  } else if (intentClass === INTENT_CLASSES.STATUS_REQUEST) {
    decisionState = "status_allowed";
    reason = "STATUS_REQUEST_ALLOWED";
  }

  return {
    ok: true,
    version: VERSION,
    publicAgent: "Nyx",
    authority: "Marion",
    finalAuthority: true,
    adminAuthorized,
    allowed,
    decisionState,
    requiresConfirmation,
    reason,
    intentClass,
    actionRisk,
    noRawAudioStored: true
  };
}

module.exports = {
  VERSION,
  evaluateMarionVoiceAuthorityDecision
};
