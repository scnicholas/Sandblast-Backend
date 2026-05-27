"use strict";

/**
 * Nyx Context Passport Parser
 *
 * Purpose:
 * Reads backend /api/chat responses and extracts only safe,
 * UI-facing Context Passport metadata.
 *
 * Contract:
 * - Never throws.
 * - Never changes assistant reply text.
 * - Never exposes diagnostics, stack traces, tokens, or raw backend internals.
 * - Silently degrades when metadata is missing.
 */

const {
  NYX_CONTEXT_PASSPORT_SCHEMA_VERSION,
  LANGUAGE_LABELS,
  DOMAIN_LABELS,
  CONFIDENCE_BANDS,
  HANDOFF_STATUSES,
  isBlockedFieldName,
  isBlockedValue,
} = require("./nyxContextPassportSchema");

const PARSER_VERSION = "nyx.contextPassport.parser/1.0";

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const text = safeStr(arguments[i]);
    if (text) return text;
  }
  return "";
}

function normalizeLanguage(value, fallback = "unknown") {
  const raw = safeStr(value, fallback).toLowerCase();

  if (raw === "eng" || raw.startsWith("en-")) return "en";
  if (raw === "spa" || raw === "es-419" || raw.startsWith("es-")) return "es";
  if (raw === "fre" || raw === "fra" || raw.startsWith("fr-")) return "fr";

  if (["en", "es", "fr"].includes(raw)) return raw;
  return fallback;
}

function normalizeDomain(value, fallback = "general") {
  const raw = safeStr(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases = {
    artificial_intelligence: "ai",
    legal: "law",
    cybersecurity: "cyber",
    english_language: "english",
  };

  const domain = aliases[raw] || raw;

  if (Object.prototype.hasOwnProperty.call(DOMAIN_LABELS, domain)) {
    return domain;
  }

  return fallback;
}

function normalizeConfidenceBand(value, fallback = "unknown") {
  const band = safeStr(value, fallback).toLowerCase();
  return CONFIDENCE_BANDS.includes(band) ? band : fallback;
}

function normalizeHandoffStatus(value, fallback = "unknown") {
  const status = safeStr(value, fallback).toLowerCase();
  return HANDOFF_STATUSES.includes(status) ? status : fallback;
}

function normalizeAuthority(value) {
  const raw = safeStr(value, "marion").toLowerCase().replace(/\s+/g, "");

  if (
    raw === "marion" ||
    raw === "marionfinal" ||
    raw === "marionfinalenvelope" ||
    raw === "marion.final" ||
    raw === "marion-final-envelope" ||
    raw.startsWith("marion") ||
    raw.startsWith("compose.final-user-facing-reply")
  ) {
    return "marion";
  }

  return "marion";
}

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

function containsUnsafeData(value) {
  if (!value) return false;

  if (typeof value === "string") {
    return isBlockedValue(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsUnsafeData);
  }

  if (isObj(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (isBlockedFieldName(key)) return true;
      if (containsUnsafeData(item)) return true;
    }
  }

  return false;
}

function pickCandidateResponse(response = {}) {
  const src = isObj(response) ? response : {};

  const candidates = [
    src.contextPassport,
    src.payload && src.payload.contextPassport,
    src.meta && src.meta.contextPassport,

    src.languageSphere,
    src.payload && src.payload.languageSphere,
    src.meta && src.meta.languageSphere,

    src.multilingualFinalEnvelope,
    src.payload && src.payload.multilingualFinalEnvelope,

    src.finalEnvelope && src.finalEnvelope.languageSphere,
    src.finalEnvelope && src.finalEnvelope.contextPassport,
  ].filter(isObj);

  return candidates.length ? candidates[0] : {};
}

function collectMetadataSources(response = {}) {
  const src = isObj(response) ? response : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const finalEnvelope = isObj(src.finalEnvelope) ? src.finalEnvelope : {};
  const multilingualFinalEnvelope = isObj(src.multilingualFinalEnvelope)
    ? src.multilingualFinalEnvelope
    : {};

  const contextPassport = isObj(src.contextPassport)
    ? src.contextPassport
    : isObj(payload.contextPassport)
      ? payload.contextPassport
      : isObj(meta.contextPassport)
        ? meta.contextPassport
        : {};

  const languageSphere = isObj(src.languageSphere)
    ? src.languageSphere
    : isObj(payload.languageSphere)
      ? payload.languageSphere
      : isObj(meta.languageSphere)
        ? meta.languageSphere
        : isObj(finalEnvelope.languageSphere)
          ? finalEnvelope.languageSphere
          : isObj(multilingualFinalEnvelope.languageSphere)
            ? multilingualFinalEnvelope.languageSphere
            : {};

  return {
    src,
    payload,
    meta,
    finalEnvelope,
    multilingualFinalEnvelope,
    contextPassport,
    languageSphere,
    candidate: pickCandidateResponse(response),
  };
}

function makePassportLabel(passport = {}) {
  const source = passport.sourceLanguage || passport.activeLanguage || "unknown";
  const target = passport.targetLanguage || passport.responseLanguage || "unknown";
  const domain = passport.activeDomain || "general";

  const sourceLabel = source === "unknown" ? "Language" : source.toUpperCase();
  const targetLabel = target === "unknown" ? "EN" : target.toUpperCase();
  const domainLabel = DOMAIN_LABELS[domain] || "General";

  if (passport.fallbackUsed) {
    return `${targetLabel} fallback · Marion ✓`;
  }

  if (source !== target && source !== "unknown") {
    return `${sourceLabel} → ${targetLabel} · ${domainLabel} · Marion ✓`;
  }

  return `${targetLabel} · ${domainLabel} · Marion ✓`;
}

function makeShortLabel(passport = {}) {
  const label = makePassportLabel(passport);
  return label.length > 48 ? `${label.slice(0, 45).trim()}…` : label;
}

function parseNyxContextPassport(response = {}, options = {}) {
  try {
    if (!isObj(response)) {
      return {
        version: PARSER_VERSION,
        visible: false,
        authority: "marion",
        reason: "invalid_response",
      };
    }

    const sources = collectMetadataSources(response);
    const combined = {
      ...sources.languageSphere,
      ...sources.contextPassport,
      ...sources.candidate,
    };

    const hasAnyMetadata =
      Object.keys(sources.languageSphere).length > 0 ||
      Object.keys(sources.contextPassport).length > 0 ||
      Object.keys(sources.candidate).length > 0;

    if (!hasAnyMetadata) {
      return {
        version: PARSER_VERSION,
        schemaVersion: NYX_CONTEXT_PASSPORT_SCHEMA_VERSION,
        visible: false,
        authority: "marion",
        reason: "metadata_missing",
      };
    }

    if (containsUnsafeData(combined)) {
      return {
        version: PARSER_VERSION,
        schemaVersion: NYX_CONTEXT_PASSPORT_SCHEMA_VERSION,
        visible: false,
        authority: "marion",
        reason: "unsafe_metadata_blocked",
      };
    }

    const sourceLanguage = normalizeLanguage(
      firstText(
        combined.sourceLanguage,
        combined.detectedLanguage,
        combined.activeLanguage,
        combined.language
      ),
      "unknown"
    );

    const targetLanguage = normalizeLanguage(
      firstText(
        combined.targetLanguage,
        combined.responseLanguage,
        combined.target,
        options.defaultTargetLanguage
      ),
      "en"
    );

    const activeDomain = normalizeDomain(
      firstText(combined.activeDomain, combined.domain, combined.routeDomain),
      "general"
    );

    const passport = {
      version: PARSER_VERSION,
      schemaVersion: NYX_CONTEXT_PASSPORT_SCHEMA_VERSION,
      visible: combined.visible === false ? false : true,
      authority: normalizeAuthority(
        firstText(
          combined.authority,
          combined.finalAuthority,
          sources.finalEnvelope.authority,
          sources.src.authority
        )
      ),
      sourceLanguage,
      targetLanguage,
      activeLanguage: sourceLanguage,
      responseLanguage: targetLanguage,
      sourceLanguageLabel: LANGUAGE_LABELS[sourceLanguage] || "Unknown",
      targetLanguageLabel: LANGUAGE_LABELS[targetLanguage] || "English",
      activeDomain,
      activeDomainLabel: DOMAIN_LABELS[activeDomain] || "General",
      confidenceBand: normalizeConfidenceBand(combined.confidenceBand, "unknown"),
      toneMode: safeStr(combined.toneMode || combined.targetTone || "clear_direct"),
      handoffStatus: normalizeHandoffStatus(combined.handoffStatus, "available"),
      fallbackUsed: Boolean(combined.fallbackUsed || combined.usedFallback),
      requestId: safeStr(combined.requestId || sources.src.requestId || sources.payload.requestId),
      updatedAt: Date.now(),
    };

    passport.label = makePassportLabel(passport);
    passport.shortLabel = makeShortLabel(passport);

    return passport;
  } catch (_) {
    return {
      version: PARSER_VERSION,
      schemaVersion: NYX_CONTEXT_PASSPORT_SCHEMA_VERSION,
      visible: false,
      authority: "marion",
      reason: "parser_exception_fallback",
    };
  }
}

function parse(response = {}, options = {}) {
  return parseNyxContextPassport(response, options);
}

module.exports = {
  PARSER_VERSION,
  isObj,
  safeStr,
  firstText,
  normalizeLanguage,
  normalizeDomain,
  normalizeConfidenceBand,
  normalizeHandoffStatus,
  normalizeAuthority,
  safeStringify,
  containsUnsafeData,
  collectMetadataSources,
  makePassportLabel,
  makeShortLabel,
  parseNyxContextPassport,
  parse,
};
