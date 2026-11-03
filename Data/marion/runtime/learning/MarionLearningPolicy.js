"use strict";

// Private learning policy: deterministic, fail-closed, no activation authority.
const VERSION = "marion.learningPolicy/1.2-strict-signal-and-safe-record-hardening";
const ALLOWED_SCOPES = Object.freeze(["retrieval", "routing", "response_style"]);
const PROTECTED_SCOPES = Object.freeze(["safety", "authorization", "identity", "system_prompt", "model_weights", "tool_execution"]);
const ALLOWED_SIGNAL_CLASSES = Object.freeze(["task_success", "task_failure", "owner_correction", "owner_confirmation", "translation_quality", "ad_outcome"]);
const MINIMUM_EVALUATION_SAMPLES = 20;
const MINIMUM_SCORE_LIFT = 0.03;
const MAXIMUM_REGRESSION = 0.01;
const MAX_SAFE_RECORD_DEPTH = 10;
const MAX_SAFE_RECORD_NODES = 4096;
const MAX_SIGNAL_BYTES = 4096;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const SUBSYSTEM_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/;
const SIGNAL_FIELDS = new Set([
  "signalId", "signalClass", "scope", "sourceSubsystem", "outcomeScore", "occurredAt",
  // Only the adapter's own non-authoritative, fixed-value metadata is accepted on revalidation.
  "recordedAt", "privatePartition", "transcriptStored", "audioStored", "activationAuthorized"
]);
const BLOCKED_KEYS = Object.freeze([
  "transcript", "prompt", "message", "text", "audio", "recording", "personaldata",
  "email", "phone", "address", "secret", "token", "credential", "password",
  "authorization", "cookie", "privatekey", "accesskey"
]);
const FIXED_SAFE_KEYS = new Set(["transcriptstored", "audiostored", "rawaudiostored", "rawtextstored", "activationauthorized"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch (_) { return false; }
}

function isBlockedKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (FIXED_SAFE_KEYS.has(normalized)) return false;
  return BLOCKED_KEYS.some(term => normalized.includes(term));
}

function containsBlockedKeys(value, depth = 0, counter = { nodes: 0, ancestors: new WeakSet() }) {
  try {
    if (depth > MAX_SAFE_RECORD_DEPTH || ++counter.nodes > MAX_SAFE_RECORD_NODES) return true;
    if (value === null || typeof value === "boolean") return false;
    if (typeof value === "string") return false;
    if (typeof value === "number") return !Number.isFinite(value);
    if (!value || typeof value !== "object") return true;
    if (!Array.isArray(value) && !isPlainObject(value)) return true;
    if (counter.ancestors.has(value)) return true;
    counter.ancestors.add(value);
    try {
      if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) return true;
      const names = Object.getOwnPropertyNames(value);
      if (Array.isArray(value)) {
        if (!Number.isSafeInteger(value.length) || value.length > MAX_SAFE_RECORD_NODES) return true;
        if (names.length !== value.length + 1) return true; // sparse or extraneous array properties
      }
      for (const key of names) {
        if (Array.isArray(value) && key === "length") continue;
        if (key === "__proto__" || key === "constructor" || key === "prototype" || isBlockedKey(key)) return true;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable) return true;
        if (containsBlockedKeys(descriptor.value, depth + 1, counter)) return true;
      }
      return Object.getOwnPropertySymbols(value).length !== 0;
    } finally { counter.ancestors.delete(value); }
  } catch (_) { return true; }
}

function validateSafeRecord(value, maxBytes = 65536) {
  if (!isPlainObject(value)) return { ok: false, reason: "record_must_be_plain_object" };
  if (containsBlockedKeys(value)) return { ok: false, reason: "sensitive_or_unsupported_field_present" };
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 65536) {
    return { ok: false, reason: "invalid_record_size_limit" };
  }
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch (_) { return { ok: false, reason: "record_not_json_serializable" }; }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > maxBytes) {
    return { ok: false, reason: "record_size_limit_exceeded" };
  }
  return { ok: true, serialized };
}

function ownValue(src, field) {
  const descriptor = Object.getOwnPropertyDescriptor(src, field);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : undefined;
}

function optionalTimestamp(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  // Date.parse normalizes some impossible dates (e.g. February 30).
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth ? value : null;
}

function validateSignal(input) {
  if (!isPlainObject(input)) return { ok: false, reason: "invalid_signal" };
  try {
    // The runtime may supply an undefined optional timestamp. Do not allow
    // undefined elsewhere, nor silently drop unsupported or accessor fields.
    const sanitized = Object.create(null);
    for (const key of Object.getOwnPropertyNames(input)) {
      if (!SIGNAL_FIELDS.has(key)) return { ok: false, reason: "unsupported_signal_field" };
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return { ok: false, reason: "sensitive_field_present" };
      if (descriptor.value === undefined && (key === "occurredAt" || key === "recordedAt")) continue;
      sanitized[key] = descriptor.value;
    }
    if (Object.getOwnPropertySymbols(input).length || containsBlockedKeys(sanitized)) return { ok: false, reason: "sensitive_field_present" };
    const signalId = ownValue(input, "signalId");
    const signalClass = ownValue(input, "signalClass");
    const scope = ownValue(input, "scope");
    const sourceSubsystem = ownValue(input, "sourceSubsystem");
    const outcomeScore = ownValue(input, "outcomeScore");
    const occurredAt = optionalTimestamp(ownValue(input, "occurredAt"));
    if (PROTECTED_SCOPES.includes(scope)) return { ok: false, reason: "protected_scope" };
    if (typeof signalId !== "string" || !ID_RE.test(signalId) ||
        !ALLOWED_SIGNAL_CLASSES.includes(signalClass) || !ALLOWED_SCOPES.includes(scope) ||
        typeof sourceSubsystem !== "string" || !SUBSYSTEM_RE.test(sourceSubsystem) ||
        typeof outcomeScore !== "number" || !Number.isFinite(outcomeScore) || outcomeScore < 0 || outcomeScore > 1 ||
        occurredAt === null) return { ok: false, reason: "invalid_signal" };

    const recordedAtRaw = ownValue(input, "recordedAt");
    const recordedAt = optionalTimestamp(recordedAtRaw);
    if (recordedAt === null || (recordedAtRaw !== undefined && !recordedAt)) return { ok: false, reason: "invalid_signal" };
    for (const [key, expected] of [
      ["privatePartition", "marion_learning_private"],
      ["transcriptStored", false], ["audioStored", false], ["activationAuthorized", false]
    ]) {
      const actual = ownValue(input, key);
      if (actual !== undefined && actual !== expected) return { ok: false, reason: "invalid_signal" };
    }
    const signal = Object.freeze({
      signalId, signalClass, scope, sourceSubsystem, outcomeScore, occurredAt,
      privatePartition: "marion_learning_private", transcriptStored: false,
      audioStored: false, activationAuthorized: false
    });
    // recordedAt is stored separately by the adapter; keep it valid on store re-validation.
    const persistedSignal = recordedAt ? Object.freeze({ ...signal, recordedAt }) : signal;
    if (Buffer.byteLength(JSON.stringify(persistedSignal), "utf8") > MAX_SIGNAL_BYTES) return { ok: false, reason: "signal_size_limit_exceeded" };
    return { ok: true, signal: persistedSignal };
  } catch (_) { return { ok: false, reason: "invalid_signal" }; }
}

module.exports = {
  VERSION, ALLOWED_SCOPES, PROTECTED_SCOPES, ALLOWED_SIGNAL_CLASSES,
  MINIMUM_EVALUATION_SAMPLES, MINIMUM_SCORE_LIFT, MAXIMUM_REGRESSION,
  containsBlockedKeys, validateSafeRecord, validateSignal
};
