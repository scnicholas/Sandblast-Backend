"use strict";

/**
 * LingoLinkGateway
 *
 * Purpose:
 * Central orchestration gateway for LingoLink Phase 1–6.
 *
 * Flow:
 * raw input
 * → normalize input
 * → detect language
 * → create translation advisory
 * → preserve glossary terms
 * → build unknown-language alert metadata
 * → carry dormant scanner heartbeat/readiness metadata
 * → return one Marion-safe advisory package
 *
 * Authority Rule:
 * LingoLink never overrides Marion.
 * LingoLink only provides advisory metadata.
 */

const GATEWAY_VERSION = "0.3.0";
const GATEWAY_SOURCE = "LingoLinkGateway";

const cryptoMod = (() => {
  try {
    return require("crypto");
  } catch (_) {
    return null;
  }
})();

function safeRequire(pathName, fallback) {
  try {
    const mod = require(pathName);
    return mod || fallback;
  } catch (_) {
    return fallback;
  }
}

const normalizerMod = safeRequire("./LingoLinkNormalizer", {});
const languageDetectMod = safeRequire("./LingoLinkLanguageDetect", {});
const translationAdvisorMod = safeRequire("./LingoLinkTranslationAdvisor", {});
const glossaryGuardMod = safeRequire("./LingoLinkGlossaryGuard", {});
const unknownLanguageAlertMod = safeRequire("./LingoLinkUnknownLanguageAlert", {});
const dormantScannerMod = safeRequire("./LingoLinkDormantScanner", {});

const normalizeInput =
  typeof normalizerMod.normalizeInput === "function"
    ? normalizerMod.normalizeInput
    : fallbackNormalizeInput;

const detectLanguage =
  typeof languageDetectMod.detectLanguage === "function"
    ? languageDetectMod.detectLanguage
    : fallbackDetectLanguage;

const adviseTranslation =
  typeof translationAdvisorMod.adviseTranslation === "function"
    ? translationAdvisorMod.adviseTranslation
    : fallbackAdviseTranslation;

const preserveGlossaryTerms =
  typeof glossaryGuardMod.preserveGlossaryTerms === "function"
    ? glossaryGuardMod.preserveGlossaryTerms
    : fallbackPreserveGlossaryTerms;

const inspectGlossaryIntegrity =
  typeof glossaryGuardMod.inspectGlossaryIntegrity === "function"
    ? glossaryGuardMod.inspectGlossaryIntegrity
    : fallbackInspectGlossaryIntegrity;

const buildUnknownLanguageAlert =
  typeof unknownLanguageAlertMod.buildUnknownLanguageAlert === "function"
    ? unknownLanguageAlertMod.buildUnknownLanguageAlert
    : fallbackBuildUnknownLanguageAlert;

const buildScannerHeartbeat =
  typeof dormantScannerMod.buildScannerHeartbeat === "function"
    ? dormantScannerMod.buildScannerHeartbeat
    : fallbackBuildScannerHeartbeat;

const scanDormantInput =
  typeof dormantScannerMod.scanDormantInput === "function"
    ? dormantScannerMod.scanDormantInput
    : null;

const DEFAULT_GATEWAY_CONFIG = Object.freeze({
  enabled: true,
  gateway: {
    name: "LingoLink",
    phase: "gateway-orchestration-alert-carry",
    mode: "advisory",
    version: GATEWAY_VERSION
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
  unknownLanguageAlert: {
    enabled: true,
    advisoryOnly: true,
    notificationReadyOnly: true
  },
  dormantScanner: {
    enabled: true,
    carryHeartbeat: true,
    scanOnGatewayRun: false,
    mode: "event_driven",
    dormant: true
  },
  telemetry: {
    enabled: true,
    includeLanguageCandidates: true,
    includeNormalizationOperations: true,
    includeGlossaryTerms: true,
    includeUnknownLanguageAlert: true,
    includeDormantScanner: true
  }
});

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
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  const f = Number(fallback);
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

function normalizeTextForHash(value) {
  return safeString(value).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Crypto hardening:
 * Use Node's crypto.createHash only when available. If a runtime has a crypto
 * import issue, fall back to a deterministic FNV-1a style hash. This avoids
 * relying on global crypto, randomUUID, or browser-only WebCrypto behavior.
 */
function stableHash(value) {
  const text = normalizeTextForHash(value);

  if (cryptoMod && typeof cryptoMod.createHash === "function") {
    try {
      return cryptoMod.createHash("sha256").update(text).digest("hex").slice(0, 16);
    } catch (_) {}
  }

  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function makeAuthority(authority = {}) {
  return {
    ...safeObject(authority),
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  };
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
    authority: makeAuthority(incoming.authority || DEFAULT_GATEWAY_CONFIG.authority),
    normalization: {
      ...DEFAULT_GATEWAY_CONFIG.normalization,
      ...safeObject(incoming.normalization)
    },
    translation: {
      ...DEFAULT_GATEWAY_CONFIG.translation,
      ...safeObject(incoming.translation),
      advisoryOnly: true,
      forceTranslation: false
    },
    glossary: {
      ...DEFAULT_GATEWAY_CONFIG.glossary,
      ...safeObject(incoming.glossary),
      advisoryOnly: true
    },
    unknownLanguageAlert: {
      ...DEFAULT_GATEWAY_CONFIG.unknownLanguageAlert,
      ...safeObject(incoming.unknownLanguageAlert),
      advisoryOnly: true
    },
    dormantScanner: {
      ...DEFAULT_GATEWAY_CONFIG.dormantScanner,
      ...safeObject(incoming.dormantScanner)
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

function renderSafeText(value) {
  return safeString(value).replace(/\s+/g, " ").trim();
}

function ensureRenderSafeTranslationMeta(value, fallbackText = "") {
  const meta = safeObject(value);
  const renderText = renderSafeText(
    meta.renderText ||
      meta.publicText ||
      meta.finalText ||
      meta.text ||
      meta.advisoryText ||
      meta.translatedText ||
      fallbackText
  );

  return {
    ...meta,
    advisoryText: safeString(meta.advisoryText || renderText),
    translatedText: safeString(meta.translatedText || renderText),
    text: renderText,
    renderText,
    publicText: renderText,
    finalText: renderText,
    advisoryOnly: true,
    forceTranslation: false,
    safeToRender: true,
    renderSafe: true,
    authority: makeAuthority(meta.authority)
  };
}

function fallbackNormalizeInput(input) {
  const originalText = safeString(input);
  const normalizedText = originalText.replace(/\s+/g, " ").trim();

  return {
    originalText,
    normalizedText,
    changed: originalText !== normalizedText,
    operations: ["fallback_normalize"],
    source: GATEWAY_SOURCE
  };
}

function fallbackDetectLanguage(input, options = {}) {
  const text = safeString(input).trim();
  const config = safeObject(options.config);

  return {
    detectedLanguage: text ? safeString(config.unknownLanguage || "unknown") : "unknown",
    confidence: 0,
    supported: false,
    requiresTranslation: false,
    fallbackTriggered: true,
    reason: text ? "language_detector_dependency_missing" : "empty_input",
    source: GATEWAY_SOURCE
  };
}

function fallbackAdviseTranslation(input, options = {}) {
  const normalization = safeObject(options.normalization);
  const languageMeta = safeObject(options.languageMeta);
  const originalText = safeString(normalization.originalText || input);
  const normalizedText = safeString(normalization.normalizedText || input);
  const detectedLanguage = safeString(languageMeta.detectedLanguage || "unknown");

  return ensureRenderSafeTranslationMeta(
    {
      originalText,
      normalizedText,
      advisoryText: normalizedText,
      translatedText: normalizedText,
      sourceLanguage: detectedLanguage,
      targetLanguage: "en",
      translated: false,
      fallbackTriggered: true,
      reason: "translation_advisor_dependency_missing",
      method: "fallback",
      source: GATEWAY_SOURCE
    },
    normalizedText
  );
}

function fallbackPreserveGlossaryTerms(sourceText, candidateText) {
  const originalText = safeString(sourceText);
  const guardedText = safeString(candidateText);

  return {
    originalText,
    candidateText: guardedText,
    guardedText,
    changed: false,
    protectedTerms: [],
    foundInOriginal: [],
    foundInCandidate: [],
    restoredTerms: [],
    missingTerms: [],
    advisoryOnly: true,
    reason: "glossary_guard_dependency_missing",
    authority: makeAuthority({ glossaryAdvisoryOnly: true }),
    source: GATEWAY_SOURCE
  };
}

function fallbackInspectGlossaryIntegrity(sourceText, candidateText) {
  return {
    originalText: safeString(sourceText),
    candidateText: safeString(candidateText),
    protectedTerms: [],
    foundInOriginal: [],
    foundInCandidate: [],
    missingTerms: [],
    intact: true,
    advisoryOnly: true,
    source: GATEWAY_SOURCE
  };
}

function fallbackBuildUnknownLanguageAlert(payload = {}, options = {}) {
  const sourcePayload = safeObject(payload);
  const languageMeta = safeObject(options.languageMeta || sourcePayload.languageMeta);
  const confidence = clamp01(languageMeta.confidence, 0);
  const detectedLanguage = safeString(languageMeta.detectedLanguage || "unknown") || "unknown";
  const shouldTrigger =
    detectedLanguage === "unknown" ||
    languageMeta.supported === false ||
    languageMeta.fallbackTriggered === true ||
    confidence < 0.65;

  return {
    version: "nyx.lingolink.unknownLanguageAlert/0.1",
    alertId: `lingolink_unknown_${stableHash(`${detectedLanguage}:${confidence}:${sourcePayload.originalInput || sourcePayload.message || ""}`)}`,
    alertType: "unknown_language_pattern",
    alertTriggered: shouldTrigger,
    enabled: true,
    detectedLanguage,
    confidence,
    supported: languageMeta.supported === true,
    fallbackTriggered: languageMeta.fallbackTriggered === true,
    reason: shouldTrigger ? "unknown_or_low_confidence_language" : "no_alert_needed",
    severity: shouldTrigger && confidence <= 0.15 ? "critical" : shouldTrigger && confidence <= 0.35 ? "high" : shouldTrigger && confidence <= 0.55 ? "medium" : shouldTrigger ? "low" : "none",
    sample: safeString(sourcePayload.originalInput || sourcePayload.message || "").slice(0, 240),
    sampleHash: stableHash(sourcePayload.originalInput || sourcePayload.message || ""),
    notificationReady: shouldTrigger,
    notificationChannel: "marion_dashboard",
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",
    advisoryOnly: true,
    forceTranslation: false,
    authority: makeAuthority(),
    metadata: {
      source: GATEWAY_SOURCE,
      createdAt: Date.now(),
      fallback: true
    },
    source: GATEWAY_SOURCE
  };
}

function fallbackBuildScannerHeartbeat(options = {}) {
  const config = mergeGatewayConfig(safeObject(options.config));

  return {
    version: "nyx.lingolink.dormantScanner/0.1",
    scanner: "LingoLinkDormantScanner",
    enabled: config.dormantScanner.enabled !== false,
    mode: safeString(config.dormantScanner.mode || "event_driven"),
    dormant: config.dormantScanner.dormant !== false,
    status: config.dormantScanner.enabled === false ? "disabled" : "ready",
    heartbeatAt: Number(options.now) || Date.now(),
    supportedLanguages: safeArray(config.supportedLanguages),
    defaultLanguage: safeString(config.defaultLanguage || "en"),
    unknownLanguage: safeString(config.unknownLanguage || "unknown"),
    notificationReady: false,
    advisoryOnly: true,
    forceTranslation: false,
    authority: makeAuthority(config.authority),
    source: GATEWAY_SOURCE
  };
}

function buildDisabledGateway(rawInput, config) {
  const originalText = safeString(rawInput);
  const authority = makeAuthority(config.authority);
  const translationMeta = ensureRenderSafeTranslationMeta(
    {
      originalText,
      normalizedText: originalText,
      advisoryText: originalText,
      translatedText: originalText,
      sourceLanguage: config.defaultLanguage || "en",
      targetLanguage: config.defaultLanguage || "en",
      translated: false,
      fallbackTriggered: false,
      reason: "lingolink_gateway_disabled",
      method: "disabled",
      source: GATEWAY_SOURCE,
      authority
    },
    originalText
  );
  const unknownLanguageAlert = fallbackBuildUnknownLanguageAlert(
    {
      message: originalText,
      originalInput: originalText,
      languageMeta: {
        detectedLanguage: config.defaultLanguage || "en",
        confidence: 1,
        supported: true,
        fallbackTriggered: false
      }
    },
    {
      languageMeta: {
        detectedLanguage: config.defaultLanguage || "en",
        confidence: 1,
        supported: true,
        fallbackTriggered: false
      }
    }
  );
  unknownLanguageAlert.alertTriggered = false;
  unknownLanguageAlert.notificationReady = false;
  unknownLanguageAlert.reason = "lingolink_gateway_disabled";
  unknownLanguageAlert.severity = "none";

  const scannerHeartbeat = buildScannerHeartbeat({
    config: {
      ...config,
      dormantScanner: {
        ...safeObject(config.dormantScanner),
        enabled: config.dormantScanner && config.dormantScanner.enabled !== false
      }
    }
  });

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
      source: GATEWAY_SOURCE
    },
    lingoInput: {
      originalText,
      normalizedText: originalText,
      changed: false,
      operations: [],
      source: GATEWAY_SOURCE
    },
    translationMeta,
    glossaryMeta: {
      originalText,
      candidateText: originalText,
      guardedText: originalText,
      changed: false,
      restoredTerms: [],
      missingTerms: [],
      advisoryOnly: true,
      reason: "lingolink_gateway_disabled",
      source: GATEWAY_SOURCE
    },
    glossaryIntegrity: {
      originalText,
      candidateText: originalText,
      intact: true,
      missingTerms: [],
      source: GATEWAY_SOURCE
    },
    unknownLanguageAlert,
    dormantScanner: {
      heartbeat: scannerHeartbeat,
      scan: null,
      notificationReady: false,
      source: GATEWAY_SOURCE
    },
    scannerHeartbeat,
    gatewayMeta: {
      gateway: "LingoLink",
      phase: "gateway-orchestration-alert-carry",
      enabled: false,
      advisoryOnly: true,
      fallbackTriggered: false,
      alertTriggered: false,
      scannerReady: scannerHeartbeat.status === "ready",
      reason: "lingolink_gateway_disabled",
      source: GATEWAY_SOURCE
    },
    telemetry: {
      enabled: false,
      source: GATEWAY_SOURCE
    },
    authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    source: GATEWAY_SOURCE
  };
}

function createGatewayTelemetry({
  config,
  languageMeta,
  lingoInput,
  translationMeta,
  glossaryMeta,
  unknownLanguageAlert,
  scannerHeartbeat,
  dormantScan
}) {
  if (!config.telemetry || config.telemetry.enabled === false) {
    return {
      enabled: false,
      source: GATEWAY_SOURCE
    };
  }

  const candidates = safeObject(languageMeta.candidates);

  return {
    enabled: true,
    detectedLanguage: safeString(languageMeta.detectedLanguage || "unknown"),
    languageConfidence: clamp01(languageMeta.confidence, 0),
    languageSupported: languageMeta.supported === true,
    requiresTranslation: languageMeta.requiresTranslation === true,
    languageCandidates: config.telemetry.includeLanguageCandidates !== false ? candidates : {},
    normalizationChanged: lingoInput.changed === true,
    normalizationOperations:
      config.telemetry.includeNormalizationOperations !== false && Array.isArray(lingoInput.operations)
        ? lingoInput.operations
        : [],
    translated: translationMeta.translated === true,
    translationMethod: safeString(translationMeta.method || ""),
    translationRenderSafe: translationMeta.renderSafe === true && translationMeta.safeToRender === true,
    glossaryChanged: glossaryMeta.changed === true,
    restoredTerms:
      config.telemetry.includeGlossaryTerms !== false && Array.isArray(glossaryMeta.restoredTerms)
        ? glossaryMeta.restoredTerms
        : [],
    missingTerms:
      config.telemetry.includeGlossaryTerms !== false && Array.isArray(glossaryMeta.missingTerms)
        ? glossaryMeta.missingTerms
        : [],
    unknownLanguageAlert:
      config.telemetry.includeUnknownLanguageAlert !== false
        ? {
            alertTriggered: unknownLanguageAlert.alertTriggered === true,
            notificationReady: unknownLanguageAlert.notificationReady === true,
            severity: safeString(unknownLanguageAlert.severity || "none"),
            reason: safeString(unknownLanguageAlert.reason || "")
          }
        : {},
    dormantScanner:
      config.telemetry.includeDormantScanner !== false
        ? {
            enabled: scannerHeartbeat.enabled === true,
            status: safeString(scannerHeartbeat.status || "unknown"),
            mode: safeString(scannerHeartbeat.mode || "event_driven"),
            heartbeatAt: scannerHeartbeat.heartbeatAt || 0,
            scanned: !!(dormantScan && dormantScan.scanned),
            notificationReady: !!(dormantScan && dormantScan.notificationReady)
          }
        : {},
    advisoryOnly: true,
    correlationHash: stableHash(`${safeString(lingoInput.originalText)}:${safeString(languageMeta.detectedLanguage)}:${safeString(translationMeta.reason)}`),
    source: GATEWAY_SOURCE
  };
}

function runLingoLinkGateway(payload, options = {}) {
  const config = mergeGatewayConfig(options.config);
  const rawInput = extractInput(payload);

  if (!config.enabled) {
    return buildDisabledGateway(rawInput, config);
  }

  const authority = makeAuthority(config.authority);

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

  const translationMeta = ensureRenderSafeTranslationMeta(
    adviseTranslation(normalizedText, {
      normalization,
      languageMeta,
      config: {
        enabled: config.translation.enabled !== false,
        defaultLanguage: config.defaultLanguage,
        supportedLanguages: config.supportedLanguages,
        advisoryOnly: true,
        forceTranslation: false,
        authority
      }
    }),
    normalizedText
  );

  const glossaryMeta = preserveGlossaryTerms(
    normalization.originalText,
    translationMeta.advisoryText || translationMeta.translatedText || translationMeta.renderText || normalizedText,
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

  const unknownLanguageAlert = buildUnknownLanguageAlert(
    {
      message: normalizedText,
      input: normalizedText,
      originalInput: normalization.originalText,
      languageMeta,
      gateway: "LingoLink",
      source: GATEWAY_SOURCE
    },
    {
      rawInput: normalization.originalText,
      languageMeta,
      config: {
        ...safeObject(config.unknownLanguageAlert),
        enabled: config.unknownLanguageAlert.enabled !== false,
        authority
      }
    }
  );

  const scannerHeartbeat = buildScannerHeartbeat({
    config: {
      enabled: config.dormantScanner.enabled !== false,
      mode: config.dormantScanner.mode || "event_driven",
      dormant: config.dormantScanner.dormant !== false,
      supportedLanguages: config.supportedLanguages,
      defaultLanguage: config.defaultLanguage,
      unknownLanguage: config.unknownLanguage,
      authority
    }
  });

  const dormantScan =
    config.dormantScanner.scanOnGatewayRun === true && typeof scanDormantInput === "function"
      ? scanDormantInput(rawInput, {
          config: {
            enabled: config.dormantScanner.enabled !== false,
            mode: config.dormantScanner.mode || "event_driven",
            dormant: config.dormantScanner.dormant !== false,
            supportedLanguages: config.supportedLanguages,
            defaultLanguage: config.defaultLanguage,
            unknownLanguage: config.unknownLanguage,
            authority
          }
        })
      : null;

  const dormantScanner = {
    heartbeat: scannerHeartbeat,
    scan: dormantScan,
    notificationReady: unknownLanguageAlert.notificationReady === true || !!(dormantScan && dormantScan.notificationReady),
    advisoryOnly: true,
    forceTranslation: false,
    authority,
    source: GATEWAY_SOURCE
  };

  const gatewayMeta = {
    gateway: config.gateway.name || "LingoLink",
    phase: config.gateway.phase || "gateway-orchestration-alert-carry",
    mode: config.gateway.mode || "advisory",
    version: config.gateway.version || GATEWAY_VERSION,
    enabled: true,
    advisoryOnly: true,
    fallbackTriggered:
      Boolean(languageMeta.fallbackTriggered) ||
      Boolean(translationMeta.fallbackTriggered),
    alertTriggered: unknownLanguageAlert.alertTriggered === true,
    notificationReady: unknownLanguageAlert.notificationReady === true,
    scannerReady: scannerHeartbeat.status === "ready",
    languageDetected: safeString(languageMeta.detectedLanguage || "unknown"),
    sourceLanguage: safeString(translationMeta.sourceLanguage || languageMeta.detectedLanguage || "unknown"),
    targetLanguage: safeString(translationMeta.targetLanguage || config.defaultLanguage || "en"),
    glossaryIntact: glossaryIntegrity.intact !== false,
    correlationHash: stableHash(`${normalization.originalText}:${safeString(languageMeta.detectedLanguage)}:${safeString(translationMeta.reason)}`),
    cryptoMode: cryptoMod && typeof cryptoMod.createHash === "function" ? "node_crypto_sha256" : "fnv_fallback",
    reason: "lingolink_gateway_completed",
    source: GATEWAY_SOURCE
  };

  const telemetry = createGatewayTelemetry({
    config,
    languageMeta,
    lingoInput: normalization,
    translationMeta,
    glossaryMeta,
    unknownLanguageAlert,
    scannerHeartbeat,
    dormantScan
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
    unknownLanguageAlert,
    dormantScanner,
    scannerHeartbeat,
    gatewayMeta,
    telemetry,
    authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    source: GATEWAY_SOURCE
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
    unknownLanguageAlert: gatewayPackage.unknownLanguageAlert,
    dormantScanner: gatewayPackage.dormantScanner,
    scannerHeartbeat: gatewayPackage.scannerHeartbeat,
    gatewayMeta: gatewayPackage.gatewayMeta,
    telemetry: gatewayPackage.telemetry,
    authority: gatewayPackage.authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    source: GATEWAY_SOURCE
  };
}

module.exports = {
  runLingoLinkGateway,
  buildMarionBridgePayload,
  extractInput,
  mergeGatewayConfig,
  stableHash,
  ensureRenderSafeTranslationMeta,
  DEFAULT_GATEWAY_CONFIG,
  GATEWAY_VERSION
};
