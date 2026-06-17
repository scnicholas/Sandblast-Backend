"use strict";

/**
 * Data/marion/runtime/LingoSentinel/LingoSentinelTranslationOrchestrator.js
 *
 * Phase 2B:
 * Registry-driven Marion/LingoSentinel translation orchestration.
 * Argos translates. LingoSentinel governs. Marion authorizes.
 */

const {
  translateWithArgos,
  getArgosHealth,
  getArgosLanguages,
} = require("./ArgosTranslationAdapter");

const {
  getProtectedTerms,
  protectTerms,
  restoreProtectedTerms,
  detectProtectedTermCollision,
} = require("./LingoSentinelProtectedTerms");

const {
  evaluateTranslationConfidence,
  buildTranslationFallback,
} = require("./LingoSentinelTranslationConfidence");

const {
  getSessionTranslationMemory,
  updateSessionTranslationMemory,
} = require("./LingoSentinelTranslationMemory");

const {
  normalizeLanguageCode,
  validateLanguagePair,
  getDefaultTargetLanguage,
  getArgosLanguageCode,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  getSupportedLanguages,
} = require("./LingoSentinelLanguageRegistry");

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function isTranslationEnabled() {
  return parseBoolean(process.env.TRANSLATION_ENABLED, true);
}

function detectLikelyLanguage(text = "") {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();

  if (/[\u4e00-\u9fff]/.test(value)) return "zh";

  if (/\b(bonjour|merci|salut|comment allez|comment ça va|vous|monsieur|madame)\b/i.test(lower)) return "fr";
  if (/[àâçéèêëîïôûùüÿœ]/i.test(value)) return "fr";

  if (/\b(hola|gracias|buenos dias|buenos días|buenas tardes|cómo estás|como estas|usted|señor|señora)\b/i.test(lower)) return "es";
  if (/[ñ¿¡]/.test(value)) return "es";

  if (/\b(olá|ola|obrigado|obrigada|você|voce|como está|como esta|não|nao)\b/i.test(lower)) return "pt";
  if (/[ãõ]/.test(value)) return "pt";

  return "en";
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

function isExplicitTranslationRequest(input = {}) {
  if (input.translate === true || input.translation === true) return true;
  if (input.lingoSentinel === true || input.lingosentinel === true) return true;

  const intent = String(input.intent || input.mode || input.domain || "").toLowerCase();

  return (
    intent.includes("translate") ||
    intent.includes("translation") ||
    intent.includes("lingosentinel") ||
    intent.includes("lingo sentinel")
  );
}

function shouldRouteTranslationRequest(input = {}) {
  const text = extractText(input);

  if (!text || !String(text).trim()) return false;
  if (isExplicitTranslationRequest(input)) return true;

  const target = normalizeLanguageCode(
    input.target || input.to || input.targetLanguage || getDefaultTargetLanguage()
  );

  const source = normalizeLanguageCode(
    input.source || input.from || input.sourceLanguage || ""
  );

  if (source && source !== "auto" && target && source !== target) return true;

  const detected = detectLikelyLanguage(text);
  return detected !== target;
}

function normalizeRequest(input = {}) {
  const text = extractText(input);

  const sessionId =
    input.sessionId ||
    input.conversationId ||
    input.threadId ||
    "default";

  const target = normalizeLanguageCode(
    input.target ||
      input.to ||
      input.targetLanguage ||
      getDefaultTargetLanguage()
  );

  let source = normalizeLanguageCode(
    input.source ||
      input.from ||
      input.sourceLanguage ||
      ""
  );

  if (!source || source === "auto") {
    source = detectLikelyLanguage(text);
  }

  const pair = validateLanguagePair(source, target);

  return {
    text: String(text || ""),
    source: pair.source || source,
    target: pair.target || target,
    argosSource: pair.argosSource || getArgosLanguageCode(source),
    argosTarget: pair.argosTarget || getArgosLanguageCode(target),
    languagePairOk: pair.ok,
    languageWarnings: pair.warnings || [],
    sessionId,
    speakerId: input.speakerId || input.userId || null,
    mode: input.mode || "lingosentinel",
    preserve: Array.isArray(input.preserve) ? input.preserve : [],
    raw: input,
  };
}

function buildUnsupportedLanguageResult(request) {
  const fallback = buildTranslationFallback({
    target: request.target,
    reason: "the requested language pair is not currently supported",
  });

  return {
    ok: false,
    handled: true,
    translationRequired: true,
    translated: false,
    originalText: request.text,
    translatedText: "",
    responseText: fallback.text,
    voiceText: fallback.text,
    source: request.source,
    target: request.target,
    provider: "none",
    confidence: {
      score: 0,
      level: "unsupported",
      deliver: false,
      fallbackRequired: true,
      warnings: request.languageWarnings,
    },
    warnings: request.languageWarnings,
    error: "UNSUPPORTED_LANGUAGE_PAIR",
    translationMeta: {
      provider: "none",
      mode: request.mode,
      sessionId: request.sessionId,
      supportedLanguages: getSupportedLanguageCodes(),
    },
  };
}

async function routeTranslationRequest(input = {}) {
  if (!isTranslationEnabled()) {
    return {
      ok: false,
      handled: true,
      translationRequired: false,
      translated: false,
      originalText: extractText(input),
      translatedText: "",
      responseText: "",
      voiceText: "",
      warnings: ["TRANSLATION_DISABLED"],
      error: "TRANSLATION_DISABLED",
    };
  }

  const request = normalizeRequest(input);
  const memory = getSessionTranslationMemory(request.sessionId);

  if (!request.text.trim()) {
    return {
      ok: false,
      handled: true,
      translationRequired: false,
      translated: false,
      originalText: "",
      translatedText: "",
      responseText: "",
      voiceText: "",
      warnings: ["EMPTY_TEXT"],
      error: "EMPTY_TEXT",
    };
  }

  if (!request.languagePairOk) {
    return buildUnsupportedLanguageResult(request);
  }

  if (request.source === request.target) {
    updateSessionTranslationMemory(request.sessionId, {
      source: request.source,
      target: request.target,
      speakerId: request.speakerId,
      originalText: request.text,
      translatedText: request.text,
    });

    return {
      ok: true,
      handled: true,
      translationRequired: false,
      translated: false,
      originalText: request.text,
      translatedText: request.text,
      responseText: request.text,
      voiceText: request.text,
      source: request.source,
      target: request.target,
      provider: "none",
      confidence: {
        score: 1,
        level: "native",
        deliver: true,
        fallbackRequired: false,
        warnings: ["SOURCE_TARGET_IDENTICAL"],
      },
      warnings: ["SOURCE_TARGET_IDENTICAL"],
      error: null,
      translationMeta: {
        provider: "none",
        mode: request.mode,
        sessionId: request.sessionId,
        memory,
      },
    };
  }

  const protectedTerms = getProtectedTerms(request.preserve);
  const protectedPayload = protectTerms(request.text, protectedTerms);

  const adapterResult = await translateWithArgos({
    text: protectedPayload.text,
    source: request.argosSource,
    target: request.argosTarget,
    mode: request.mode,
    preserve: [],
  });

  const restoredText = restoreProtectedTerms(
    adapterResult.translatedText || "",
    protectedPayload.replacements
  );

  const protectedCollision = detectProtectedTermCollision(
    request.text,
    restoredText,
    protectedPayload.replacements
  );

  const confidence = evaluateTranslationConfidence({
    ok: adapterResult.ok,
    originalText: request.text,
    translatedText: restoredText,
    source: request.source,
    target: request.target,
    warnings: [
      ...request.languageWarnings,
      ...(adapterResult.warnings || []),
    ],
    error: adapterResult.error,
    protectedCollision,
  });

  if (!confidence.deliver) {
    const fallback = buildTranslationFallback({
      target: request.target,
      reason: adapterResult.error || "translation is temporarily unavailable",
    });

    return {
      ok: false,
      handled: true,
      translationRequired: true,
      translated: false,
      originalText: request.text,
      translatedText: "",
      responseText: fallback.text,
      voiceText: fallback.text,
      source: request.source,
      target: request.target,
      provider: adapterResult.provider || "argos",
      confidence,
      warnings: confidence.warnings,
      error: adapterResult.error || "TRANSLATION_BLOCKED",
      translationMeta: {
        provider: adapterResult.provider || "argos",
        mode: request.mode,
        sessionId: request.sessionId,
        protectedTermsApplied: protectedPayload.replacements.length,
        supportedLanguages: getSupportedLanguageCodes(),
        memory,
      },
    };
  }

  const updatedMemory = updateSessionTranslationMemory(request.sessionId, {
    source: request.source,
    target: request.target,
    speakerId: request.speakerId,
    originalText: request.text,
    translatedText: restoredText,
  });

  return {
    ok: true,
    handled: true,
    translationRequired: true,
    translated: true,
    originalText: request.text,
    translatedText: restoredText,
    responseText: restoredText,
    voiceText: restoredText,
    source: request.source,
    target: request.target,
    provider: adapterResult.provider || "argos",
    confidence,
    warnings: confidence.warnings,
    error: null,
    translationMeta: {
      provider: adapterResult.provider || "argos",
      mode: request.mode,
      sessionId: request.sessionId,
      protectedTermsApplied: protectedPayload.replacements.length,
      supportedLanguages: getSupportedLanguageCodes(),
      memory: updatedMemory,
    },
  };
}

module.exports = {
  isTranslationEnabled,
  detectLikelyLanguage,
  shouldRouteTranslationRequest,
  routeTranslationRequest,
  getArgosHealth,
  getArgosLanguages,
  normalizeLanguageCode,
  validateLanguagePair,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  getSupportedLanguages,
};

