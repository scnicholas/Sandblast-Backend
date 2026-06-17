"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelTranslationTelemetry.js
 *
 * Phase 3D:
 * Privacy-safe in-memory telemetry for LingoSentinel translation.
 *
 * Does not store raw user text.
 * Stores lengths, hashes, language/provider metadata, latency,
 * warnings, confidence, and safe-block state.
 */

const crypto = require("node:crypto");

const MAX_EVENTS = Number(process.env.LINGOSENTINEL_TRANSLATION_TELEMETRY_LIMIT || 500);
const events = [];

function nowIso() {
  return new Date().toISOString();
}

function hashText(value = "") {
  const text = String(value || "");

  if (!text) return null;

  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 16);
}

function extractText(input = {}) {
  if (typeof input === "string") return input;

  return (
    input.text ||
    input.message ||
    input.query ||
    input.transcript ||
    input.userText ||
    input.input ||
    ""
  );
}

function normalizeWarnings(warnings = []) {
  if (!Array.isArray(warnings)) return [];
  return Array.from(new Set(warnings.map((warning) => String(warning))));
}

function recordTranslationTelemetry(payload = {}) {
  const input = payload.input || {};
  const result = payload.result || {};

  const originalText = extractText(input);
  const translatedText = result.translatedText || "";

  const startedAt = Number(payload.startedAt || Date.now());
  const endedAt = Number(payload.endedAt || Date.now());
  const latencyMs = Math.max(0, endedAt - startedAt);

  const warnings = normalizeWarnings(result.warnings || payload.warnings || []);
  const confidence = result.confidence || {};

  const event = {
    id: `lst-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: nowIso(),

    ok: Boolean(result.ok),
    handled: result.handled !== false,
    translated: Boolean(result.translated),
    translationRequired: Boolean(result.translationRequired),

    provider: result.provider || payload.provider || "unknown",
    source: result.source || input.source || input.from || input.sourceLanguage || null,
    target: result.target || input.target || input.to || input.targetLanguage || null,
    mode: input.mode || (result.translationMeta && result.translationMeta.mode) || "lingosentinel",

    sessionId:
      input.sessionId ||
      input.conversationId ||
      input.threadId ||
      (result.translationMeta && result.translationMeta.sessionId) ||
      "default",

    speakerId: input.speakerId || input.userId || null,

    latencyMs,
    confidenceScore: typeof confidence.score === "number" ? confidence.score : null,
    confidenceLevel: confidence.level || null,

    protectedTermsApplied: Number(
      result.translationMeta && result.translationMeta.protectedTermsApplied
        ? result.translationMeta.protectedTermsApplied
        : 0
    ),

    warningCount: warnings.length,
    warnings,
    error: result.error || payload.error || null,

    safeBlocked: Boolean(result.ok === false && result.error),
    providerDown: Boolean(
      result.error &&
      /ECONNREFUSED|REQUEST_TIMEOUT|ENOTFOUND|EHOSTUNREACH|TRANSLATION_PROVIDER_UNAVAILABLE/i.test(String(result.error))
    ),

    originalTextLength: String(originalText || "").length,
    translatedTextLength: String(translatedText || "").length,
    originalTextHash: hashText(originalText),
    translatedTextHash: hashText(translatedText),
  };

  events.push(event);

  while (events.length > MAX_EVENTS) {
    events.shift();
  }

  return event;
}

function getTranslationTelemetryEvents(limit = 100) {
  const size = Math.max(1, Math.min(Number(limit || 100), MAX_EVENTS));
  return events.slice(-size);
}

function getTranslationTelemetrySnapshot() {
  const total = events.length;
  const translated = events.filter((event) => event.translated).length;
  const safeBlocked = events.filter((event) => event.safeBlocked).length;
  const providerDown = events.filter((event) => event.providerDown).length;

  const latencyValues = events
    .map((event) => event.latencyMs)
    .filter((value) => typeof value === "number");

  const averageLatencyMs = latencyValues.length
    ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
    : 0;

  const byLanguagePair = {};
  const byProvider = {};

  for (const event of events) {
    const pair = `${event.source || "unknown"}>${event.target || "unknown"}`;
    byLanguagePair[pair] = (byLanguagePair[pair] || 0) + 1;

    const provider = event.provider || "unknown";
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  }

  return {
    ok: true,
    total,
    translated,
    safeBlocked,
    providerDown,
    averageLatencyMs,
    byLanguagePair,
    byProvider,
    recentEvents: getTranslationTelemetryEvents(25),
  };
}

function clearTranslationTelemetry() {
  events.length = 0;
  return true;
}

module.exports = {
  recordTranslationTelemetry,
  getTranslationTelemetryEvents,
  getTranslationTelemetrySnapshot,
  clearTranslationTelemetry,
};
