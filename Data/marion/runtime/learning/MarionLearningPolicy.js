"use strict";

const VERSION = "marion.learningPolicy/1.0";
const ALLOWED_SCOPES = Object.freeze(["retrieval", "routing", "response_style"]);
const PROTECTED_SCOPES = Object.freeze(["safety", "authorization", "identity", "system_prompt", "model_weights", "tool_execution"]);
const ALLOWED_SIGNAL_CLASSES = Object.freeze(["task_success", "task_failure", "owner_correction", "owner_confirmation", "translation_quality", "ad_outcome"]);
const MINIMUM_EVALUATION_SAMPLES = 20;
const MINIMUM_SCORE_LIFT = 0.03;
const MAXIMUM_REGRESSION = 0.01;
const MAX_SAFE_RECORD_DEPTH = 10;
const MAX_SAFE_RECORD_NODES = 4096;

const BLOCKED_KEYS = Object.freeze([
  "transcript", "prompt", "message", "text", "audio", "recording", "personaldata",
  "email", "phone", "address", "secret", "token", "credential", "password",
  "authorization", "cookie", "privatekey", "accesskey"
]);

function cleanString(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBlockedKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["transcriptstored", "audiostored", "rawaudiostored", "rawtextstored", "activationauthorized"].includes(normalized)) return false;
  return BLOCKED_KEYS.some(term => normalized.includes(term));
}

function containsBlockedKeys(value, depth = 0, counter = { nodes: 0 }) {
  if (depth > MAX_SAFE_RECORD_DEPTH || ++counter.nodes > MAX_SAFE_RECORD_NODES) return true;
  if (Array.isArray(value)) return value.some(item => containsBlockedKeys(item, depth + 1, counter));
  if (!isPlainObject(value)) return value !== null && typeof value === "object";
  for (const key of Object.keys(value)) {
    if (isBlockedKey(key) || containsBlockedKeys(value[key], depth + 1, counter)) return true;
  }
  return false;
}

function validateSafeRecord(value, maxBytes = 65536) {
  if (!isPlainObject(value)) return { ok: false, reason: "record_must_be_plain_object" };
  if (containsBlockedKeys(value)) return { ok: false, reason: "sensitive_field_present" };
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_) {
    return { ok: false, reason: "record_not_json_serializable" };
  }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > maxBytes) {
    return { ok: false, reason: "record_size_limit_exceeded" };
  }
  return { ok: true, serialized };
}

function validateSignal(input) {
  const src = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) return { ok: false, reason: "invalid_signal" };
  if (containsBlockedKeys(src)) return { ok: false, reason: "sensitive_field_present" };
  const signalId = cleanString(src.signalId);
  const signalClass = cleanString(src.signalClass, 40);
  const scope = cleanString(src.scope, 40);
  const sourceSubsystem = cleanString(src.sourceSubsystem, 60);
  const outcomeScore = src.outcomeScore;
  if (!signalId || !ALLOWED_SIGNAL_CLASSES.includes(signalClass) || !ALLOWED_SCOPES.includes(scope) || !sourceSubsystem || typeof outcomeScore !== "number" || !Number.isFinite(outcomeScore) || outcomeScore < 0 || outcomeScore > 1) {
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
  containsBlockedKeys, validateSafeRecord, validateSignal
};
