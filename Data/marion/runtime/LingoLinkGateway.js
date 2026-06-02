"use strict";

/**
 * LingoLinkGateway
 *
 * Purpose:
 * Central orchestration gateway for LingoLink Phase 1–4.
 *
 * Flow:
 * raw input
 * → normalize input
 * → detect language
 * → create translation advisory
 * → preserve glossary terms
 * → return one Marion-safe advisory package
 *
 * Authority Rule:
 * LingoLink never overrides Marion.
 * LingoLink only provides advisory metadata.
 */

const { normalizeInput } = require("./LingoLinkNormalizer");
const { detectLanguage } = require("./LingoLinkLanguageDetect");
const { adviseTranslation } = require("./LingoLinkTranslationAdvisor");
const {
  preserveGlossaryTerms,
  inspectGlossaryIntegrity
} = require("./LingoLinkGlossaryGuard");

const DEFAULT_GATEWAY_CONFIG = {
  enabled: true,
  gateway: {
    name: "LingoLink",
    phase: "gateway-orchestration",
    mode: "advisory",
    version: "0.2.0"
  },
  supportedLanguages: ["en", "fr", "es"],
  defaultLanguage: "en",
  unknownLanguage: "unknown",
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  },
  normalization: {
    enabled: true,
    preserveOriginalInput: true,
    preserveAccents: true,
    preserveLineBreaks: true
  },
  translation: {
    enabled: true,
    advisoryOnly: true,
    forceTranslation: false
  },
  glossary: {
    enabled: true,
    advisoryOnly: true
  },
  telemetry: {
    enabled: true,
    includeLanguageCandidates: true,
    includeNormalizationOperations: true,
    includeGlossaryTerms: true
  }
};

function safeString(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  try {
    return String(value);
  } catch (_) {
    return "";
  }
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function mergeGatewayConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_GATEWAY_CONFIG,
    ...incoming,
    gateway: {
      ...DEFAULT_GATEWAY_CONFIG.gateway,
      ...safeObject(incoming.gateway)
    },
    authority: {
      ...DEFAULT_GATEWAY_CONFIG.authority,
      ...safeObject(incoming.authority)
    },
    normalization: {
      ...DEFAULT_GATEWAY_CONFIG.normalization,
      ...safeObject(incoming.normalization)
    },
    translation: {
      ...DEFAULT_GATEWAY_CONFIG.translation,
      ...safeObject(incoming.translation)
    },
    glossary: {
      ...DEFAULT_GATEWAY_CONFIG.glossary,
      ...safeObject(incoming.glossary)
    },
    telemetry: {
      ...DEFAULT_GATEWAY_CONFIG.telemetry,
      ...safeObject(incoming.telemetry)
    }
  };
}

function extractInput(payload) {
  if (typeof payload === "string") return payload;

  const safePayload = safeObject(payload);

  return safeString(
    safePayload.message ||
      safePayload.input ||
      safePayload.text ||
      safePayload.prompt ||
      safePayload.originalInput ||
      ""
  );
}

function buildDisabledGateway(rawInput, config) {
  const originalText = safeString(rawInput);

  return {
    enabled: false,
    input: originalText,
    message: originalText,
    originalInput: originalText,

    languageMeta: {
      detectedLanguage: config.defaultLanguage || "en",
      confidence: 1,
      supported: true,
      requiresTranslation: false,
      fallbackTriggered: false,
      reason: "lingolink_gateway_disabled",
      source: "LingoLinkGateway"
    },

    lingoInput: {
      originalText,
      normalizedText: originalText,
      changed: false,
      operations: [],
      source: "LingoLinkGateway"
    },

    translationMeta: {
      originalText,
      normalizedText: originalText,
      advisoryText: originalText,
      translatedText: originalText,
      sourceLanguage: config.defaultLanguage || "en",
      targetLanguage: config.defaultLanguage || "en",
      translated: false,
      advisoryOnly: true,
      forceTranslation: false,
      fallbackTriggered: false,
      reason: "lingolink_gateway_disabled",
      source: "LingoLinkGateway"
    },

    glossaryMeta: {
      originalText,
      candidateText: originalText,
      guardedText: originalText,
      changed: false,
      restoredTerms: [],
      missingTerms: [],
      advisoryOnly: true,
      reason: "lingolink_gateway_disabled",
      source: "LingoLinkGateway"
    },

    gatewayMeta: {
      gateway: "LingoLink",
      phase: "gateway-orchestration",
      enabled: false,
      advisoryOnly: true,
      fallbackTriggered: false,
      reason: "lingolink_gateway_disabled",
      source: "LingoLinkGateway"
    },

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function createGatewayTelemetry({
  config,
  languageMeta,
  lingoInput,
  translationMeta,
  glossaryMeta
}) {
  if (!config.telemetry || config.telemetry.enabled === false) {
    return {
      enabled: false,
      source: "LingoLinkGateway"
    };
  }

  return {
    enabled: true,
    detectedLanguage: languageMeta.detectedLanguage,
    languageConfidence: languageMeta.confidence,
    languageSupported: languageMeta.supported,
    requiresTranslation: languageMeta.requiresTranslation,
    normalizationChanged: lingoInput.changed,
    normalizationOperations: Array.isArray(lingoInput.operations)
      ? lingoInput.operations
      : [],
    translated: translationMeta.translated,
    translationMethod: translationMeta.method,
    glossaryChanged: glossaryMeta.changed,
    restoredTerms: Array.isArray(glossaryMeta.restoredTerms)
      ? glossaryMeta.restoredTerms
      : [],
    missingTerms: Array.isArray(glossaryMeta.missingTerms)
      ? glossaryMeta.missingTerms
      : [],
    advisoryOnly: true,
    source: "LingoLinkGateway"
  };
}

function runLingoLinkGateway(payload, options = {}) {
  const config = mergeGatewayConfig(options.config);

  const rawInput = extractInput(payload);

  if (!config.enabled) {
    return buildDisabledGateway(rawInput, config);
  }

  const normalization = normalizeInput(rawInput, {
    preserveLineBreaks: config.normalization.preserveLineBreaks !== false
  });

  const normalizedText = safeString(normalization.normalizedText);

  const languageMeta = detectLanguage(normalizedText, {
    config: {
      supportedLanguages: config.supportedLanguages,
      defaultLanguage: config.defaultLanguage,
      unknownLanguage: config.unknownLanguage,
      confidenceThresholds: config.confidenceThresholds
    }
  });

  const translationMeta = adviseTranslation(normalizedText, {
    normalization,
    languageMeta,
    config: {
      enabled: config.translation.enabled !== false,
      defaultLanguage: config.defaultLanguage,
      supportedLanguages: config.supportedLanguages,
      advisoryOnly: true,
      forceTranslation: false,
      authority: config.authority
    }
  });

  const glossaryMeta = preserveGlossaryTerms(
    normalization.originalText,
    translationMeta.advisoryText || translationMeta.translatedText || normalizedText,
    {
      config: {
        enabled: config.glossary.enabled !== false,
        advisoryOnly: true,
        authority: {
          finalAuthority: "Marion",
          glossaryAdvisoryOnly: true,
          neverOverrideMarion: true
        }
      },
      protectedTerms: options.protectedTerms
    }
  );

  const glossaryIntegrity = inspectGlossaryIntegrity(
    normalization.originalText,
    glossaryMeta.guardedText,
    {
      protectedTerms: options.protectedTerms
    }
  );

  const gatewayMeta = {
    gateway: config.gateway.name || "LingoLink",
    phase: config.gateway.phase || "gateway-orchestration",
    mode: config.gateway.mode || "advisory",
    version: config.gateway.version || "0.2.0",
    enabled: true,
    advisoryOnly: true,
    fallbackTriggered:
      Boolean(languageMeta.fallbackTriggered) ||
      Boolean(translationMeta.fallbackTriggered),
    languageDetected: languageMeta.detectedLanguage,
    sourceLanguage: translationMeta.sourceLanguage,
    targetLanguage: translationMeta.targetLanguage,
    glossaryIntact: glossaryIntegrity.intact,
    reason: "lingolink_gateway_completed",
    source: "LingoLinkGateway"
  };

  const authority = {
    ...config.authority,
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  };

  const telemetry = createGatewayTelemetry({
    config,
    languageMeta,
    lingoInput: normalization,
    translationMeta,
    glossaryMeta
  });

  return {
    enabled: true,

    input: normalizedText,
    message: normalizedText,
    originalInput: normalization.originalText,

    languageMeta,
    lingoInput: normalization,
    translationMeta,
    glossaryMeta,
    glossaryIntegrity,
    gatewayMeta,
    telemetry,
    authority,

    marionAuthority: true,
    finalAuthority: "Marion",
    source: "LingoLinkGateway"
  };
}

function buildMarionBridgePayload(payload, options = {}) {
  const gatewayPackage = runLingoLinkGateway(payload, options);

  return {
    message: gatewayPackage.message,
    input: gatewayPackage.input,
    originalInput: gatewayPackage.originalInput,

    languageMeta: gatewayPackage.languageMeta,
    lingoInput: gatewayPackage.lingoInput,
    translationMeta: gatewayPackage.translationMeta,
    glossaryMeta: gatewayPackage.glossaryMeta,
    glossaryIntegrity: gatewayPackage.glossaryIntegrity,
    gatewayMeta: gatewayPackage.gatewayMeta,
    telemetry: gatewayPackage.telemetry,

    authority: gatewayPackage.authority,
    marionAuthority: true,
    finalAuthority: "Marion",

    source: "LingoLinkGateway"
  };
}

module.exports = {
  runLingoLinkGateway,
  buildMarionBridgePayload,
  extractInput,
  mergeGatewayConfig,
  DEFAULT_GATEWAY_CONFIG
};
