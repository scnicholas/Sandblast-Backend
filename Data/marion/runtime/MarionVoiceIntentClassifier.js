"use strict";

const {
  VERSION: INTENT_CLASSES_VERSION,
  INTENT_CLASSES,
  ACTION_RISK,
  cleanText
} = require("./MarionVoiceIntentClasses.js");

const VERSION = "marion.voiceIntentClassifier/1.0-adminDeliveryIntentClasses";

function stripWakeWord(value) {
  return cleanText(value)
    .replace(/^\s*(?:vera|nyx|marion|marian|mario)\s*[,:\-]?\s*/i, "")
    .replace(/^\s*next\s*[,:\-]?\s*/i, "nyx ")
    .trim();
}

function normalizeForIntent(value) {
  return stripWakeWord(value)
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function topicFromText(value) {
  const text = cleanText(value).toLowerCase();
  const m = text.match(/\b(?:about|on|for|with|regarding)\s+([a-z0-9][a-z0-9\s\-]{2,56})/i);
  if (m) return cleanText(m[1]).replace(/[?.!,;:]+$/g, "");
  const q = text.match(/\b(?:what is|explain|define|break down)\s+([a-z0-9][a-z0-9\s\-]{2,56})/i);
  return q ? cleanText(q[1]).replace(/[?.!,;:]+$/g, "") : "";
}

function inferActionRisk(normalized) {
  if (!normalized) return ACTION_RISK.NONE;
  if (/\b(?:force\s+push|delete|remove|erase|wipe|destroy|trash|purge|drop|overwrite|reset\s+production|revoke)\b/.test(normalized)) {
    return ACTION_RISK.DESTRUCTIVE;
  }
  if (/\b(?:deploy|push|publish|release|rollback|merge|rebase|commit|send|email|archive)\b/.test(normalized)) {
    return ACTION_RISK.DEPLOYMENT;
  }
  if (/\b(?:create|update|patch|fix|write|generate|add|modify|change|lock|unlock|enable|disable|run|start|stop)\b/.test(normalized)) {
    return ACTION_RISK.STATE_CHANGING;
  }
  if (/\b(?:show|list|check|read|open|inspect|status|summarize|review|audit)\b/.test(normalized)) {
    return ACTION_RISK.READ_ONLY;
  }
  return ACTION_RISK.NONE;
}

function commandVerb(normalized) {
  const m = normalized.match(/^\s*(?:please\s+)?(create|update|patch|fix|write|generate|add|modify|change|lock|unlock|enable|disable|run|start|stop|deploy|push|publish|release|rollback|merge|rebase|commit|send|email|archive|delete|remove|wipe|reset|show|list|check|read|open|inspect|audit)\b/i);
  return m ? m[1].toLowerCase() : "";
}

function classifyMarionVoiceIntent(input = {}) {
  const transcript = cleanText(input.transcript || input.text || input.message || input.query || "");
  const normalizedText = normalizeForIntent(transcript);
  const previousTopic = cleanText(input.previousTopic || input.topic || (input.context && input.context.topic) || "");
  const short = normalizedText.replace(/[?.!]+$/g, "").trim();

  let intentClass = INTENT_CLASSES.UNKNOWN;
  let confidence = 0.35;
  let rationale = "No strong intent pattern matched.";

  if (/\b(?:voice lane status|voice status|route status|system status|status report|health check|are you active|is voice active|voice delivery status)\b/.test(normalizedText)) {
    intentClass = INTENT_CLASSES.STATUS_REQUEST;
    confidence = 0.94;
    rationale = "Status/health wording matched.";
  } else if (/\b(?:admin voice|administrator voice|private voice|marion voice delivery|marion delivery system|speak only to me|voice only for admin|voice authorization)\b/.test(normalizedText)) {
    intentClass = INTENT_CLASSES.ADMIN_VOICE_DELIVERY_REQUEST;
    confidence = 0.92;
    rationale = "Admin voice delivery wording matched.";
  } else if (/\b(?:this is mac|i am mac|speaker is mac|authorize me|admin check|identity check|voice auth|voice authorization)\b/.test(normalizedText)) {
    intentClass = INTENT_CLASSES.IDENTITY_AUTHORIZATION;
    confidence = 0.88;
    rationale = "Identity/authorization wording matched.";
  } else if ((previousTopic || input.lastAssistantReply) && /^(?:why|why is that|how so|example|give me an example|another example|show another example|what happens next|what next|then what|continue|go deeper|tell me more|expand|keep going)$/.test(short)) {
    intentClass = INTENT_CLASSES.FOLLOW_UP_QUERY;
    confidence = 0.89;
    rationale = "Short continuation phrase matched with prior context.";
  } else if (/^(?:why|how|what happens next|what next|then what|continue|go deeper|tell me more|expand)\b/.test(normalizedText) && (previousTopic || input.lastAssistantReply)) {
    intentClass = INTENT_CLASSES.FOLLOW_UP_QUERY;
    confidence = 0.78;
    rationale = "Continuation wording matched with prior context.";
  } else if (/^(?:please\s+)?(?:create|update|patch|fix|write|generate|add|modify|change|lock|unlock|enable|disable|run|start|stop|deploy|push|publish|release|rollback|merge|rebase|commit|send|email|archive|delete|remove|wipe|reset)\b/.test(normalizedText)) {
    intentClass = INTENT_CLASSES.ACTION_COMMAND;
    confidence = 0.91;
    rationale = "Action verb appeared at command position.";
  } else if (/\b(?:what is|explain|define|break down|tell me about|how does|why does)\b/.test(normalizedText)) {
    intentClass = INTENT_CLASSES.KNOWLEDGE_QUERY;
    confidence = 0.76;
    rationale = "Knowledge-query wording matched.";
  } else if (normalizedText) {
    intentClass = INTENT_CLASSES.KNOWLEDGE_QUERY;
    confidence = 0.58;
    rationale = "Non-empty voice turn defaults to knowledge/query handling.";
  }

  const actionRisk = intentClass === INTENT_CLASSES.ACTION_COMMAND ? inferActionRisk(normalizedText) : ACTION_RISK.NONE;
  const requiresAdmin = intentClass === INTENT_CLASSES.ACTION_COMMAND || intentClass === INTENT_CLASSES.ADMIN_VOICE_DELIVERY_REQUEST;
  const requiresConfirmation = actionRisk === ACTION_RISK.DEPLOYMENT || actionRisk === ACTION_RISK.DESTRUCTIVE;

  return {
    ok: true,
    version: VERSION,
    intentClassesVersion: INTENT_CLASSES_VERSION,
    transcript,
    normalizedText,
    intentClass,
    confidence,
    requiresAdmin,
    requiresConfirmation,
    actionRisk,
    rationale,
    slots: {
      topic: topicFromText(normalizedText) || previousTopic,
      commandVerb: commandVerb(normalizedText)
    }
  };
}

module.exports = {
  VERSION,
  classifyMarionVoiceIntent,
  normalizeForIntent,
  stripWakeWord,
  inferActionRisk
};
