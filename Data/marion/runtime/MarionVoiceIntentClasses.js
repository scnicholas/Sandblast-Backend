"use strict";

/**
 * MarionVoiceIntentClasses
 * Shared constants for the Marion admin voice delivery lane.
 * Nyx stays public-facing; Marion stays the decision authority.
 */

const VERSION = "marion.voiceIntentClasses/1.0";

const INTENT_CLASSES = Object.freeze({
  STATUS_REQUEST: "status_request",
  FOLLOW_UP_QUERY: "follow_up_query",
  ACTION_COMMAND: "action_command",
  ADMIN_VOICE_DELIVERY_REQUEST: "admin_voice_delivery_request",
  IDENTITY_AUTHORIZATION: "identity_authorization",
  KNOWLEDGE_QUERY: "knowledge_query",
  UNKNOWN: "unknown"
});

const ACTION_RISK = Object.freeze({
  NONE: "none",
  READ_ONLY: "read_only",
  STATE_CHANGING: "state_changing",
  DESTRUCTIVE: "destructive",
  DEPLOYMENT: "deployment"
});

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function normalizeIntentClass(value) {
  const raw = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return Object.values(INTENT_CLASSES).includes(raw) ? raw : INTENT_CLASSES.UNKNOWN;
}

function normalizeActionRisk(value) {
  const raw = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return Object.values(ACTION_RISK).includes(raw) ? raw : ACTION_RISK.NONE;
}

module.exports = {
  VERSION,
  INTENT_CLASSES,
  ACTION_RISK,
  cleanText,
  normalizeIntentClass,
  normalizeActionRisk
};
