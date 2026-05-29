"use strict";

/**
 * Nyx Context Passport Schema
 *
 * Purpose:
 * Defines the safe UI-facing contract for Context Passport metadata.
 *
 * Rule:
 * Nyx may show only safe fields. Backend diagnostics, raw envelopes,
 * stack traces, tokens, telemetry internals, and routing diagnostics
 * must never render to the user.
 */

const NYX_CONTEXT_PASSPORT_SCHEMA_VERSION = "nyx.contextPassport.schema/1.0";

const ALLOWED_LANGUAGES = Object.freeze(["en", "es", "fr", "unknown"]);

const LANGUAGE_LABELS = Object.freeze({
  en: "English",
  es: "Spanish",
  fr: "French",
  unknown: "Unknown",
});

const DOMAIN_LABELS = Object.freeze({
  general: "General",
  ai: "AI",
  psychology: "Psychology",
  english: "English",
  finance: "Finance",
  law: "Law",
  cyber: "Cyber",
  business: "Business",
  unknown: "Unknown",
});

const CONFIDENCE_BANDS = Object.freeze([
  "high",
  "medium",
  "low",
  "weak",
  "unknown",
]);

const HANDOFF_STATUSES = Object.freeze([
  "available",
  "complete",
  "fallback",
  "partial",
  "unavailable",
  "guarded",
  "unknown",
]);

const SAFE_PASSPORT_FIELDS = Object.freeze([
  "version",
  "visible",
  "authority",
  "sourceLanguage",
  "targetLanguage",
  "activeLanguage",
  "responseLanguage",
  "activeDomain",
  "confidenceBand",
  "toneMode",
  "handoffStatus",
  "fallbackUsed",
  "label",
  "shortLabel",
  "requestId",
  "updatedAt",
]);

const BLOCKED_FIELD_PATTERNS = Object.freeze([
  /runtimeTelemetry/i,
  /failureSignature/i,
  /stack/i,
  /stackTrace/i,
  /debug/i,
  /debugError/i,
  /rawError/i,
  /diagnostic/i,
  /diagnostics/i,
  /headers/i,
  /authorization/i,
  /bearer/i,
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /finalEnvelopeDiagnostics/i,
  /routeKind/i,
  /replyAuthority/i,
  /finalEnvelopeTrusted/i,
  /canEmit/i,
  /sessionPatch/i,
]);

const BLOCKED_VALUE_PATTERNS = Object.freeze([
  /TypeError/i,
  /ReferenceError/i,
  /SyntaxError/i,
  /MODULE_NOT_FOUND/i,
  /ENOENT/i,
  /stack trace/i,
  /Bearer\s+/i,
  /api[_-]?key/i,
  /secret-token/i,
  /password/i,
  /MARION::FINAL::/i,
  /CHATENGINE_COORDINATOR_ONLY_ACTIVE/i,
  /nyx\.marion\.final\//i,
  /nyx\.marion\.stateSpine\//i,
]);

function isBlockedFieldName(key) {
  const value = String(key || "");
  return BLOCKED_FIELD_PATTERNS.some((rx) => rx.test(value));
}

function isBlockedValue(value) {
  const text = String(value == null ? "" : value);
  return BLOCKED_VALUE_PATTERNS.some((rx) => rx.test(text));
}

function isAllowedPassportField(key) {
  return SAFE_PASSPORT_FIELDS.includes(String(key || ""));
}

module.exports = {
  NYX_CONTEXT_PASSPORT_SCHEMA_VERSION,
  ALLOWED_LANGUAGES,
  LANGUAGE_LABELS,
  DOMAIN_LABELS,
  CONFIDENCE_BANDS,
  HANDOFF_STATUSES,
  SAFE_PASSPORT_FIELDS,
  BLOCKED_FIELD_PATTERNS,
  BLOCKED_VALUE_PATTERNS,
  isBlockedFieldName,
  isBlockedValue,
  isAllowedPassportField,
};