"use strict";

const VERSION = "marion.learningPolicy/1.0";
const ALLOWED_SCOPES = Object.freeze(["retrieval", "routing", "response_style"]);
const PROTECTED_SCOPES = Object.freeze(["safety", "authorization", "identity", "system_prompt", "model_weights", "tool_execution"]);
const ALLOWED_SIGNAL_CLASSES = Object.freeze(["task_success", "task_failure", "owner_correction", "owner_confirmation", "translation_quality", "ad_outcome"]);
const MINIMUM_EVALUATION_SAMPLES = 20;
const MINIMUM_SCORE_LIFT = 0.03;
const MAXIMUM_REGRESSION = 0.01;

const BLOCKED_KEYS = new Set([
  "transcript", "rawTranscript", "prompt", "userMessage", "message", "text",
  "audio", "rawAudio", "recording", "personalData", "email", "phone", "address",
  "secret", "token", "credential", "password"
]);

function cleanString(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function containsBlockedKeys(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(key) || containsBlockedKeys(nested, depth + 1)) return true;
  }
  return false;
}

function validateSignal(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (containsBlockedKeys(src)) return { ok: false, reason: "sensitive_field_present" };
  const signalId = cleanString(src.signalId);
  const signalClass = cleanString(src.signalClass, 40);
  const scope = cleanString(src.scope, 40);
  const sourceSubsystem = cleanString(src.sourceSubsystem, 60);
  const outcomeScore = Number(src.outcomeScore);
  if (!signalId || !ALLOWED_SIGNAL_CLASSES.includes(signalClass) || !ALLOWED_SCOPES.includes(scope) || !sourceSubsystem || !Number.isFinite(outcomeScore) || outcomeScore < 0 || outcomeScore > 1) {
    return { ok: false, reason: PROTECTED_SCOPES.includes(scope) ? "protected_scope" : "invalid_signal" };
  }
  return {
    ok: true,
    signal: Object.freeze({
      signalId, signalClass, scope, sourceSubsystem,
      outcomeScore, occurredAt: cleanString(src.occurredAt, 40),
      privatePartition: "marion_learning_private",
      transcriptStored: false, audioStored: false, activationAuthorized: false
    })
  };
}

module.exports = {
  VERSION, ALLOWED_SCOPES, PROTECTED_SCOPES, ALLOWED_SIGNAL_CLASSES,
  MINIMUM_EVALUATION_SAMPLES, MINIMUM_SCORE_LIFT, MAXIMUM_REGRESSION,
  validateSignal
};
