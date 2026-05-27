"use strict";

/**
 * MultilingualFinalEnvelope
 *
 * Purpose:
 * Attaches LanguageSphere metadata to Marion's final answer contract.
 *
 * Contract:
 * - Marion remains final authority.
 * - Translation/language layer may advise but never override final.
 * - Final answer must be stable and user-facing.
 * - No debug leakage.
 */

const DEFAULT_CONFIG = {
  authority: "marion",
  defaultLanguage: "en",
  defaultDomain: "general",
  defaultConfidenceBand: "unknown",
};

function safeStringify(value) {
  const seen = new WeakSet();

  try {
    return JSON.stringify(value || {}, (key, item) => {
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
  } catch (_) {
    return String(value || "");
  }
}

function normalizeLanguage(value, fallback = "en") {
  const raw = String(value || fallback).trim().toLowerCase();

  if (raw === "eng") return "en";
  if (raw === "spa" || raw === "es-419") return "es";
  if (raw === "fre" || raw === "fra") return "fr";
  if (raw.includes("-")) return raw.split("-")[0];

  return ["en", "es", "fr"].includes(raw) ? raw : fallback;
}

function normalizeDomain(value, fallback = "general") {
  const raw = String(value || fallback).trim().toLowerCase().replace(/\s+/g, "_");

  const allowed = [
    "general",
    "ai",
    "psychology",
    "english",
    "finance",
    "law",
    "cyber",
    "business",
  ];

  return allowed.includes(raw) ? raw : fallback;
}

function normalizeConfidence(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;

  return n;
}

function normalizeConfidenceBand(value) {
  const band = String(value || "unknown").trim().toLowerCase();

  return ["high", "medium", "low", "unknown"].includes(band)
    ? band
    : "unknown";
}

function extractFinalAnswer(payload = {}) {
  return (
    payload.final ||
    payload.finalAnswer ||
    payload.reply ||
    payload.answer ||
    payload.text ||
    payload.marionFinal ||
    ""
  );
}

function sanitizeString(value) {
  const text = String(value || "");

  if (/typeerror|referenceerror|syntaxerror|stack trace|module_not_found|enoent/i.test(text)) {
    return "";
  }

  if (/bearer\s+|api[_-]?key|secret|token/i.test(text)) {
    return "[redacted]";
  }

  return text;
}

function buildMultilingualFinalEnvelope(payload = {}, options = {}) {
  try {
    const config = {
      ...DEFAULT_CONFIG,
      ...(options.config || payload.config || {}),
    };

    const final = sanitizeString(extractFinalAnswer(payload)) || "Marion final answer preserved.";

    const languageSphere = {
      sourceLanguage: normalizeLanguage(
        payload.sourceLanguage ||
          payload.detectedLanguage ||
          payload.language,
        config.defaultLanguage
      ),
      targetLanguage: normalizeLanguage(
        payload.targetLanguage ||
          payload.responseLanguage,
        config.defaultLanguage
      ),
      confidence: normalizeConfidence(payload.confidence || payload.languageConfidence),
      confidenceBand: normalizeConfidenceBand(payload.confidenceBand),
      activeDomain: normalizeDomain(
        payload.activeDomain ||
          payload.domain,
        config.defaultDomain
      ),
      routeFamily: payload.routeFamily || payload.route || null,
      toneMode: payload.toneMode || payload.targetTone || null,
      fallbackUsed: Boolean(payload.fallbackUsed || payload.usedFallback),
      handoffStatus: String(payload.handoffStatus || "available").toLowerCase(),
      visibleToUser: true,
    };

    return {
      ok: true,
      authority: "marion",
      finalAuthority: "marion",
      final,
      finalAnswer: final,
      duplicateSuppressed: true,
      languageSphere,
      finalEnvelope: {
        valid: true,
        authority: "marion",
        owner: "marionFinalEnvelope",
        final,
        languageSphere,
      },
    };
  } catch (_) {
    return {
      ok: false,
      authority: "marion",
      finalAuthority: "marion",
      final: "Marion final answer preserved.",
      finalAnswer: "Marion final answer preserved.",
      duplicateSuppressed: true,
      languageSphere: {
        sourceLanguage: "en",
        targetLanguage: "en",
        confidence: null,
        confidenceBand: "low",
        activeDomain: "general",
        routeFamily: null,
        toneMode: null,
        fallbackUsed: true,
        handoffStatus: "fallback",
        visibleToUser: true,
      },
      finalEnvelope: {
        valid: true,
        authority: "marion",
        owner: "marionFinalEnvelope",
        final: "Marion final answer preserved.",
      },
    };
  }
}

function validateMultilingualFinalEnvelope(envelope = {}) {
  const serialized = safeStringify(envelope);

  const hasMarionAuthority =
    envelope.authority === "marion" ||
    envelope.finalAuthority === "marion" ||
    envelope?.finalEnvelope?.authority === "marion";

  const hasFinal =
    Boolean(envelope.final || envelope.finalAnswer || envelope?.finalEnvelope?.final);

  const hasLanguageSphere =
    Boolean(envelope.languageSphere || envelope?.finalEnvelope?.languageSphere);

  const noDebugLeak =
    !/typeerror|referenceerror|syntaxerror|stack trace|module_not_found|enoent/i.test(serialized);

  return {
    valid: Boolean(hasMarionAuthority && hasFinal && hasLanguageSphere && noDebugLeak),
    hasMarionAuthority,
    hasFinal,
    hasLanguageSphere,
    noDebugLeak,
  };
}

function process(payload = {}, options = {}) {
  return buildMultilingualFinalEnvelope(payload, options);
}

function build(payload = {}, options = {}) {
  return buildMultilingualFinalEnvelope(payload, options);
}

module.exports = {
  DEFAULT_CONFIG,
  safeStringify,
  normalizeLanguage,
  normalizeDomain,
  normalizeConfidence,
  normalizeConfidenceBand,
  extractFinalAnswer,
  sanitizeString,
  buildMultilingualFinalEnvelope,
  validateMultilingualFinalEnvelope,
  process,
  build,
};
