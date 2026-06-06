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
 * → create unknown-language alert metadata
 * → carry dormant scanner heartbeat/scan metadata
 * → return one Marion-safe advisory package
 *
 * Authority Rule:
 * LingoLink never overrides Marion.
 * LingoLink only provides advisory metadata.
 */

let nodeCrypto = null;
try {
  nodeCrypto = require("crypto");
} catch (_) {
  nodeCrypto = null;
}

const { normalizeInput } = require("./LingoLinkNormalizer");
const { detectLanguage } = require("./LingoLinkLanguageDetect");
const { adviseTranslation } = require("./LingoLinkTranslationAdvisor");
const {
  preserveGlossaryTerms,
  inspectGlossaryIntegrity
} = require("./LingoLinkGlossaryGuard");

const unknownLanguageAlertMod = (() => {
  try {
    return require("./LingoLinkUnknownLanguageAlert");
  } catch (_) {
    return null;
  }
})();

const dormantScannerMod = (() => {
  try {
    return require("./LingoLinkDormantScanner");
  } catch (_) {
    return null;
  }
})();

const DEFAULT_GATEWAY_CONFIG = {
  enabled: true,
  gateway: {
    name: "LingoLink",
    phase: "gateway-orchestration-alert-scanner-carry",
    mode: "advisory",
    version: "0.3.0"
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
  alert: {
    enabled: true,
    alertOnUnknown: true,
    alertOnUnsupported: true,
    alertOnLowConfidence: true,
    alertOnAmbiguous: true
  },
  dormantScanner: {
    enabled: true,
    mode: "event_driven",
    dormant: true,
    heartbeatIntervalMs: 60000,
    staleAfterMs: 180000
  },
  telemetry: {
    enabled: true,
    includeLanguageCandidates: true,
    includeNormalizationOperations: true,
    includeGlossaryTerms: true,
    includeAlert: true,
    includeScanner: true,
    includeCorrelation: true
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanForHash(value) {
  return safeString(value).replace(/\s+/g, " ").trim();
}

function fallbackStableHash(value) {
  const text = cleanForHash(value);
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv_${(hash >>> 0).toString(16)}`;
}

function stableHash(value, prefix = "ll") {
  const text = cleanForHash(value);

  try {
    if (nodeCrypto && typeof nodeCrypto.createHash === "function") {
      return `${prefix}_${nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24)}`;
    }
  } catch (_) {}

  return `${prefix}_${fallbackStableHash(text).replace(/^fnv_/, "")}`;
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
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },
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
    alert: {
      ...DEFAULT_GATEWAY_CONFIG.alert,
      ...safeObject(incoming.alert)
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

function ensureAuthority(authority = {}) {
  return {
    ...safeObject(authority),
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
  };
}

function ensureRenderSafeTranslationMeta(value = {}, fallbackText = "") {
  const meta = safeObject(value);
  const text = safeString(
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
    advisoryText: safeString(meta.advisoryText || text),
    translatedText: safeString(meta.translatedText || text),
    text,
    renderText: safeString(meta.renderText || text),
    publicText: safeString(meta.publicText || text),
    finalText: safeString(meta.finalText || text),
    safeToRender: true,
    renderSafe: true,
    advisoryOnly: true,
    forceTranslation: false,
    authority: ensureAuthority(meta.authority)
  };
}

function buildFallbackUnknownLanguageAlert({ rawInput = "", languageMeta = {}, config = {}, reason = "alert_dependency_missing" } = {}) {
  const detectedLanguage = safeString(languageMeta.detectedLanguage || "unknown") || "unknown";
  const confidence = Number(languageMeta.confidence);
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const alertTriggered =
    config.enabled !== false &&
    (detectedLanguage === "unknown" || languageMeta.supported === false || languageMeta.fallbackTriggered === true);

  return {
    version: "nyx.lingolink.unknownLanguageAlert/fallback",
    alertId: stableHash(`${detectedLanguage}:${safeConfidence}:${rawInput}`, "alert"),
    alertType: "unknown_language_pattern",
    alertTriggered,
    enabled: config.enabled !== false,
    detectedLanguage,
    confidence: safeConfidence,
    supported: languageMeta.supported === true,
    fallbackTriggered: languageMeta.fallbackTriggered === true,
    reason: alertTriggered ? safeString(languageMeta.reason || reason) : "no_alert_needed",
    severity: alertTriggered ? "medium" : "none",
    sample: cleanForHash(rawInput).slice(0, 240),
    sampleHash: stableHash(rawInput, "sample"),
    notificationReady: alertTriggered,
    notificationChannel: "marion_dashboard",
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",
    advisoryOnly: true,
    forceTranslation: false,
    authority: ensureAuthority(),
    metadata: {
      source: "LingoLinkGatewayFallbackAlert",
      gateway: "LingoLink"
    },
    source: "LingoLinkGatewayFallbackAlert"
  };
}

function buildUnknownLanguageAlertCarry({ rawInput, normalizedText, languageMeta, config } = {}) {
  if (unknownLanguageAlertMod && typeof unknownLanguageAlertMod.buildUnknownLanguageAlert === "function") {
    try {
      return unknownLanguageAlertMod.buildUnknownLanguageAlert(
        {
          message: normalizedText,
          originalInput: rawInput,
          languageMeta,
          gateway: "LingoLinkGateway",
          source: "LingoLinkGateway"
        },
        {
          rawInput,
          languageMeta,
          config: safeObject(config.alert)
        }
      );
    } catch (_) {}
  }

  return buildFallbackUnknownLanguageAlert({ rawInput, languageMeta, config: safeObject(config.alert) });
}

function buildFallbackScannerHeartbeat(config = {}) {
  const scannerConfig = safeObject(config.dormantScanner);
  const now = Date.now();

  return {
    version: "nyx.lingolink.dormantScanner/fallbackHeartbeat",
    scanner: "LingoLinkDormantScanner",
    enabled: scannerConfig.enabled !== false,
    mode: safeString(scannerConfig.mode || "event_driven"),
    dormant: scannerConfig.dormant !== false,
    status: scannerConfig.enabled === false ? "disabled" : "ready",
    heartbeatAt: now,
    heartbeatIntervalMs: Number(scannerConfig.heartbeatIntervalMs) || 60000,
    staleAfterMs: Number(scannerConfig.staleAfterMs) || 180000,
    supportedLanguages: safeArray(config.supportedLanguages).length ? safeArray(config.supportedLanguages) : ["en", "fr", "es"],
    defaultLanguage: safeString(config.defaultLanguage || "en"),
    unknownLanguage: safeString(config.unknownLanguage || "unknown"),
    notificationReady: false,
    advisoryOnly: true,
    forceTranslation: false,
    authority: ensureAuthority(),
    source: "LingoLinkGatewayFallbackScanner"
  };
}

function buildFallbackDormantScanner({ rawInput = "", normalization = {}, languageMeta = {}, alert = {}, heartbeat = {}, config = {} } = {}) {
  return {
    version: "nyx.lingolink.dormantScanner/fallbackScan",
    scanId: stableHash(`scan:${rawInput}`, "scan"),
    enabled: safeObject(config.dormantScanner).enabled !== false,
    scanned: true,
    inputHash: stableHash(rawInput, "input"),
    lingoInput: normalization,
    languageMeta,
    unknownLanguageAlert: alert,
    heartbeat,
    notificationReady: alert.alertTriggered === true,
    advisoryOnly: true,
    forceTranslation: false,
    authority: ensureAuthority(),
    telemetry: {
      scannerReady: safeString(heartbeat.status) === "ready",
      dormant: heartbeat.dormant !== false,
      detectedLanguage: languageMeta.detectedLanguage,
      confidence: languageMeta.confidence,
      alertTriggered: alert.alertTriggered === true,
      severity: safeString(alert.severity || "none"),
      source: "LingoLinkGatewayFallbackScanner"
    },
    source: "LingoLinkGatewayFallbackScanner"
  };
}

function buildScannerCarry({ rawInput, normalization, languageMeta, alert, config } = {}) {
  let scannerHeartbeat = null;
  let dormantScanner = null;

  if (dormantScannerMod && typeof dormantScannerMod.buildScannerHeartbeat === "function") {
    try {
      scannerHeartbeat = dormantScannerMod.buildScannerHeartbeat({
        config: {
          ...safeObject(config.dormantScanner),
          supportedLanguages: config.supportedLanguages,
          defaultLanguage: config.defaultLanguage,
          unknownLanguage: config.unknownLanguage,
          authority: config.authority
        }
      });
    } catch (_) {}
  }

  if (!scannerHeartbeat) {
    scannerHeartbeat = buildFallbackScannerHeartbeat(config);
  }

  if (dormantScannerMod && typeof dormantScannerMod.scanDormantInput === "function") {
    try {
      dormantScanner = dormantScannerMod.scanDormantInput(rawInput, {
        config: {
          ...safeObject(config.dormantScanner),
          supportedLanguages: config.supportedLanguages,
          defaultLanguage: config.defaultLanguage,
          unknownLanguage: config.unknownLanguage,
          authority: config.authority
        }
      });
    } catch (_) {}
  }

  if (!dormantScanner) {
    dormantScanner = buildFallbackDormantScanner({
      rawInput,
      normalization,
      languageMeta,
      alert,
      heartbeat: scannerHeartbeat,
      config
    });
  }

  return {
    scannerHeartbeat: {
      ...scannerHeartbeat,
      advisoryOnly: true,
      forceTranslation: false,
      authority: ensureAuthority(scannerHeartbeat.authority)
    },
    dormantScanner: {
      ...dormantScanner,
      advisoryOnly: true,
      forceTranslation: false,
      authority: ensureAuthority(dormantScanner.authority)
    }
  };
}

function buildDisabledGateway(rawInput, config) {
  const originalText = safeString(rawInput);
  const inputHash = stableHash(originalText, "input");
  const gatewayHash = stableHash(`disabled:${originalText}`, "gw");
  const correlationId = stableHash(`LingoLink:disabled:${originalText}`, "corr");
  const authority = ensureAuthority(config.authority);

  const languageMeta = {
    detectedLanguage: config.defaultLanguage || "en",
    confidence: 1,
    supported: true,
    requiresTranslation: false,
    fallbackTriggered: false,
    reason: "lingolink_gateway_disabled",
    source: "LingoLinkGateway"
  };

  const lingoInput = {
    originalText,
    normalizedText: originalText,
    changed: false,
    operations: [],
    source: "LingoLinkGateway"
  };

  const translationMeta = ensureRenderSafeTranslationMeta({
    originalText,
    normalizedText: originalText,
    advisoryText: originalText,
    translatedText: originalText,
    sourceLanguage: config.defaultLanguage || "en",
    targetLanguage: config.defaultLanguage || "en",
    translated: false,
    fallbackTriggered: false,
    reason: "lingolink_gateway_disabled",
    source: "LingoLinkGateway",
    authority
  }, originalText);

  const glossaryMeta = {
    originalText,
    candidateText: originalText,
    guardedText: originalText,
    changed: false,
    restoredTerms: [],
    missingTerms: [],
    advisoryOnly: true,
    reason: "lingolink_gateway_disabled",
    source: "LingoLinkGateway"
  };

  const unknownLanguageAlert = buildFallbackUnknownLanguageAlert({ rawInput: originalText, languageMeta, config: { enabled: false } });
  const scannerHeartbeat = buildFallbackScannerHeartbeat({ ...config, dormantScanner: { ...safeObject(config.dormantScanner), enabled: false } });
  const dormantScanner = buildFallbackDormantScanner({
    rawInput: originalText,
    normalization: lingoInput,
    languageMeta,
    alert: unknownLanguageAlert,
    heartbeat: scannerHeartbeat,
    config: { ...config, dormantScanner: { ...safeObject(config.dormantScanner), enabled: false } }
  });

  return {
    enabled: false,
    input: originalText,
    message: originalText,
    originalInput: originalText,
    inputHash,
    gatewayHash,
    correlationId,
    traceId: correlationId,
    languageMeta,
    lingoInput,
    translationMeta,
    glossaryMeta,
    glossaryIntegrity: {
      originalText,
      candidateText: originalText,
      missingTerms: [],
      intact: true,
      advisoryOnly: true,
      source: "LingoLinkGateway"
    },
    unknownLanguageAlert,
    scannerHeartbeat,
    dormantScanner,
    gatewayMeta: {
      gateway: "LingoLink",
      phase: "gateway-orchestration-alert-scanner-carry",
      version: "0.3.0",
      enabled: false,
      advisoryOnly: true,
      fallbackTriggered: false,
      alertTriggered: false,
      notificationReady: false,
      inputHash,
      gatewayHash,
      correlationId,
      traceId: correlationId,
      stableHash: gatewayHash,
      reason: "lingolink_gateway_disabled",
      source: "LingoLinkGateway"
    },
    telemetry: {
      enabled: false,
      inputHash,
      gatewayHash,
      correlationId,
      traceId: correlationId,
      source: "LingoLinkGateway"
    },
    authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    source: "LingoLinkGateway"
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
  dormantScanner,
  correlation
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
    alertTriggered: unknownLanguageAlert.alertTriggered === true,
    notificationReady:
      unknownLanguageAlert.notificationReady === true ||
      dormantScanner.notificationReady === true,
    alertSeverity: safeString(unknownLanguageAlert.severity || "none"),
    scannerStatus: safeString(scannerHeartbeat.status || "unknown"),
    scannerDormant: scannerHeartbeat.dormant !== false,
    scannerReady: safeString(scannerHeartbeat.status || "ready") === "ready",
    inputHash: correlation.inputHash,
    gatewayHash: correlation.gatewayHash,
    correlationId: correlation.correlationId,
    traceId: correlation.traceId,
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

  const rawTranslationMeta = adviseTranslation(normalizedText, {
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

  const translationMeta = ensureRenderSafeTranslationMeta(rawTranslationMeta, normalizedText);

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

  const unknownLanguageAlert = buildUnknownLanguageAlertCarry({
    rawInput: normalization.originalText,
    normalizedText,
    languageMeta,
    config
  });

  const scannerCarry = buildScannerCarry({
    rawInput: normalization.originalText,
    normalization,
    languageMeta,
    alert: unknownLanguageAlert,
    config
  });

  const scannerHeartbeat = scannerCarry.scannerHeartbeat;
  const dormantScanner = scannerCarry.dormantScanner;

  const inputHash = stableHash(normalization.originalText, "input");
  const gatewayHash = stableHash(
    JSON.stringify({
      input: normalization.originalText,
      normalizedText,
      language: languageMeta.detectedLanguage,
      translated: translationMeta.translated,
      alert: unknownLanguageAlert.alertTriggered === true
    }),
    "gw"
  );
  const correlationId = stableHash(`${inputHash}:${gatewayHash}:${languageMeta.detectedLanguage}`, "corr");
  const traceId = correlationId;

  const notificationReady =
    unknownLanguageAlert.notificationReady === true ||
    dormantScanner.notificationReady === true;

  const alertTriggered =
    unknownLanguageAlert.alertTriggered === true ||
    safeObject(dormantScanner.unknownLanguageAlert).alertTriggered === true;

  const gatewayMeta = {
    gateway: config.gateway.name || "LingoLink",
    phase: config.gateway.phase || "gateway-orchestration-alert-scanner-carry",
    mode: config.gateway.mode || "advisory",
    version: config.gateway.version || "0.3.0",
    enabled: true,
    advisoryOnly: true,
    fallbackTriggered:
      Boolean(languageMeta.fallbackTriggered) ||
      Boolean(translationMeta.fallbackTriggered),
    alertTriggered,
    notificationReady,
    languageDetected: languageMeta.detectedLanguage,
    sourceLanguage: translationMeta.sourceLanguage,
    targetLanguage: translationMeta.targetLanguage,
    glossaryIntact: glossaryIntegrity.intact,
    scannerStatus: safeString(scannerHeartbeat.status || "ready"),
    scannerDormant: scannerHeartbeat.dormant !== false,
    inputHash,
    gatewayHash,
    stableHash: gatewayHash,
    correlationId,
    traceId,
    reason: "lingolink_gateway_completed",
    source: "LingoLinkGateway"
  };

  const authority = ensureAuthority(config.authority);

  const telemetry = createGatewayTelemetry({
    config,
    languageMeta,
    lingoInput: normalization,
    translationMeta,
    glossaryMeta,
    unknownLanguageAlert,
    scannerHeartbeat,
    dormantScanner,
    correlation: {
      inputHash,
      gatewayHash,
      correlationId,
      traceId
    }
  });

  return {
    enabled: true,

    input: normalizedText,
    message: normalizedText,
    originalInput: normalization.originalText,

    inputHash,
    gatewayHash,
    correlationId,
    traceId,

    languageMeta,
    lingoInput: normalization,
    translationMeta,
    glossaryMeta,
    glossaryIntegrity,
    unknownLanguageAlert,
    scannerHeartbeat,
    dormantScanner,
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

    inputHash: gatewayPackage.inputHash,
    gatewayHash: gatewayPackage.gatewayHash,
    correlationId: gatewayPackage.correlationId,
    traceId: gatewayPackage.traceId,

    languageMeta: gatewayPackage.languageMeta,
    lingoInput: gatewayPackage.lingoInput,
    translationMeta: gatewayPackage.translationMeta,
    glossaryMeta: gatewayPackage.glossaryMeta,
    glossaryIntegrity: gatewayPackage.glossaryIntegrity,
    unknownLanguageAlert: gatewayPackage.unknownLanguageAlert,
    scannerHeartbeat: gatewayPackage.scannerHeartbeat,
    dormantScanner: gatewayPackage.dormantScanner,
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
  stableHash,
  ensureRenderSafeTranslationMeta,
  DEFAULT_GATEWAY_CONFIG
};
