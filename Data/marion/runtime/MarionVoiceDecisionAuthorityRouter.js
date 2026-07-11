"use strict";

const voiceIntentMod = require("./MarionVoiceIntentClasses.js");
const cleanText = typeof voiceIntentMod.cleanText === "function"
  ? voiceIntentMod.cleanText
  : function(value){ return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); };

const INTENT_CLASSES = voiceIntentMod.INTENT_CLASSES || Object.freeze({
  ACTION_COMMAND: "operator_build_command",
  ADMIN_VOICE_DELIVERY_REQUEST: "operator_private_dialogue",
  FOLLOW_UP_QUERY: "follow_up_query",
  STATUS_REQUEST: "operator_status_check",
  UNKNOWN: "unknown"
});

const ACTION_RISK = voiceIntentMod.ACTION_RISK || Object.freeze({
  NONE: "none",
  LOW: "low",
  EXTERNAL: "external_action",
  DEPLOYMENT: "deployment",
  DESTRUCTIVE: "destructive"
});

const VERSION = "marion.voiceDecisionAuthorityRouter/1.1-risk-aware-authority-preserve";

function lower(value) {
  return cleanText(value).toLowerCase();
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = cleanText(arguments[i]);
    if (value) return value;
  }
  return "";
}

function isActionCommandClass(intentClass) {
  const value = lower(intentClass);
  return value === lower(INTENT_CLASSES.ACTION_COMMAND) ||
    value === "operator_build_command" ||
    value === "action_command" ||
    value === "restricted_command";
}

function isAdminVoiceDeliveryClass(intentClass) {
  const value = lower(intentClass);
  return value === lower(INTENT_CLASSES.ADMIN_VOICE_DELIVERY_REQUEST) ||
    value === "admin_voice_delivery_request" ||
    value === "operator_private_dialogue";
}

function isFollowUpClass(intentClass) {
  const value = lower(intentClass);
  return value === lower(INTENT_CLASSES.FOLLOW_UP_QUERY) || /follow[_ -]?up/.test(value);
}

function isStatusClass(intentClass) {
  const value = lower(intentClass);
  return value === lower(INTENT_CLASSES.STATUS_REQUEST) || value === "operator_status_check" || /status/.test(value);
}

function inferActionRisk(input, intent) {
  const explicit = lower(intent.actionRisk || input.actionRisk || "");
  if (explicit) return explicit;
  if (typeof voiceIntentMod.classifyActionRiskFromText === "function") {
    const text = firstText(intent.normalizedText, intent.transcript, input.transcript, input.text, input.message);
    return voiceIntentMod.classifyActionRiskFromText(text);
  }
  const text = lower(firstText(intent.normalizedText, intent.transcript, input.transcript, input.text, input.message));
  if (/\b(delete|remove|erase|wipe|drop|destroy|purge|shutdown)\b/.test(text)) return ACTION_RISK.DESTRUCTIVE;
  if (/\b(deploy|publish|release|restart|run\s+(?:script|command|deployment|test)|execute)\b/.test(text)) return ACTION_RISK.DEPLOYMENT;
  if (/\b(send|email|transfer|pay|post|submit)\b/.test(text)) return ACTION_RISK.EXTERNAL;
  return ACTION_RISK.NONE;
}

function evaluateMarionVoiceAuthorityDecision(input = {}) {
  const intent = input.intent && typeof input.intent === "object" ? input.intent : {};
  const identity = input.identity && typeof input.identity === "object" ? input.identity : {};
  const intentClass = cleanText(intent.intentClass || INTENT_CLASSES.UNKNOWN);
  const actionRisk = inferActionRisk(input, intent);
  const adminAuthorized = identity.authorized === true || identity.adminVoiceAllowed === true || input.adminAuthorized === true;

  const actionCommand = isActionCommandClass(intentClass);
  const adminVoiceDeliveryRequest = isAdminVoiceDeliveryClass(intentClass);
  const elevatedAction = actionRisk === ACTION_RISK.DEPLOYMENT || actionRisk === ACTION_RISK.DESTRUCTIVE || actionRisk === ACTION_RISK.EXTERNAL;

  let allowed = true;
  let decisionState = "allowed";
  let requiresConfirmation = intent.requiresConfirmation === true;
  let reason = "MARION_AUTHORITY_ALLOWED";

  if (actionCommand && !adminAuthorized) {
    allowed = false;
    decisionState = "denied";
    requiresConfirmation = elevatedAction;
    reason = "ACTION_COMMAND_REQUIRES_ADMIN_AUTHORITY";
  } else if (adminVoiceDeliveryRequest && !adminAuthorized) {
    allowed = false;
    decisionState = "text_only";
    reason = "ADMIN_VOICE_DELIVERY_REQUIRES_ADMIN_AUTHORITY";
  } else if (actionCommand && elevatedAction) {
    allowed = false;
    decisionState = "confirmation_required";
    requiresConfirmation = true;
    reason = actionRisk === ACTION_RISK.DESTRUCTIVE
      ? "DESTRUCTIVE_ACTION_REQUIRES_EXPLICIT_CONFIRMATION"
      : actionRisk === ACTION_RISK.DEPLOYMENT
        ? "DEPLOYMENT_ACTION_REQUIRES_EXPLICIT_CONFIRMATION"
        : "EXTERNAL_ACTION_REQUIRES_EXPLICIT_CONFIRMATION";
  } else if (isFollowUpClass(intentClass)) {
    decisionState = "context_validation_required";
    reason = "FOLLOW_UP_REQUIRES_CONTEXT_ANCHOR_VALIDATION";
  } else if (isStatusClass(intentClass)) {
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
    riskAware: true,
    noRawAudioStored: true
  };
}

module.exports = {
  VERSION,
  INTENT_CLASSES,
  ACTION_RISK,
  evaluateMarionVoiceAuthorityDecision,
  inferActionRisk
};
