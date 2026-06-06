"use strict";

/**
 * LingoLinkDormantScanner
 *
 * Purpose:
 * Lightweight scanner heartbeat for dormant-state language readiness.
 *
 * Scope:
 * - Does not run background work by itself.
 * - Does not open timers by default.
 * - Does not notify externally by itself.
 * - Produces heartbeat/scan packets that Marion can carry safely.
 * - Can scan a provided input opportunistically.
 */

const { detectLanguage } = (() => {
  try {
    return require("./LingoLinkLanguageDetect");
  } catch (_) {
    return {
      detectLanguage: null
    };
  }
})();

const { normalizeInput } = (() => {
  try {
    return require("./LingoLinkNormalizer");
  } catch (_) {
    return {
      normalizeInput: null
    };
  }
})();

const {
  buildUnknownLanguageAlert
} = (() => {
  try {
    return require("./LingoLinkUnknownLanguageAlert");
  } catch (_) {
    return {
      buildUnknownLanguageAlert: null
    };
  }
})();

const SCANNER_VERSION = "nyx.lingolink.dormantScanner/0.1";

const DEFAULT_SCANNER_CONFIG = Object.freeze({
  enabled: true,
  mode: "event_driven",
  dormant: true,
  heartbeatIntervalMs: 60000,
  staleAfterMs: 180000,
  supportedLanguages: ["en", "fr", "es"],
  defaultLanguage: "en",
  unknownLanguage: "unknown",
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    neverOverrideMarion: true
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

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, base));
}

function mergeScannerConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_SCANNER_CONFIG,
    ...incoming,
    supportedLanguages: safeArray(incoming.supportedLanguages).length
      ? safeArray(incoming.supportedLanguages)
      : DEFAULT_SCANNER_CONFIG.supportedLanguages,
    authority: {
      ...DEFAULT_SCANNER_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function nowMs(options = {}) {
  const override = Number(options.now);
  return Number.isFinite(override) ? override : Date.now();
}

function hashText(value) {
  const text = safeString(value).toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function buildScannerHeartbeat(options = {}) {
  const config = mergeScannerConfig(options.config);
  const timestamp = nowMs(options);

  return {
    version: SCANNER_VERSION,
    scanner: "LingoLinkDormantScanner",
    enabled: config.enabled !== false,
    mode: safeString(config.mode || "event_driven"),
    dormant: config.dormant !== false,
    status: config.enabled === false ? "disabled" : "ready",
    heartbeatAt: timestamp,
    heartbeatIntervalMs: clampNumber(config.heartbeatIntervalMs, 60000, 1000, 86400000),
    staleAfterMs: clampNumber(config.staleAfterMs, 180000, 5000, 86400000),
    supportedLanguages: safeArray(config.supportedLanguages),
    defaultLanguage: safeString(config.defaultLanguage || "en"),
    unknownLanguage: safeString(config.unknownLanguage || "unknown"),
    notificationReady: false,
    advisoryOnly: true,
    forceTranslation: false,
    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "LingoLinkDormantScanner"
  };
}

function isHeartbeatStale(heartbeat = {}, options = {}) {
  const hb = safeObject(heartbeat);
  const config = mergeScannerConfig(options.config);
  const current = nowMs(options);
  const heartbeatAt = Number(hb.heartbeatAt);

  if (!Number.isFinite(heartbeatAt)) return true;

  const staleAfterMs = clampNumber(
    hb.staleAfterMs || config.staleAfterMs,
    180000,
    5000,
    86400000
  );

  return current - heartbeatAt > staleAfterMs;
}

function fallbackNormalize(input) {
  const originalText = safeString(input);

  return {
    originalText,
    normalizedText: originalText.replace(/\s+/g, " ").trim(),
    changed: originalText !== originalText.replace(/\s+/g, " ").trim(),
    operations: ["fallback_normalize"],
    source: "LingoLinkDormantScanner"
  };
}

function fallbackDetect(input, config) {
  const text = safeString(input).trim();

  return {
    detectedLanguage: text ? "unknown" : "unknown",
    confidence: 0,
    supported: false,
    requiresTranslation: false,
    fallbackTriggered: true,
    reason: text ? "scanner_dependency_missing" : "empty_input",
    source: "LingoLinkDormantScanner"
  };
}

function scanDormantInput(input, options = {}) {
  const config = mergeScannerConfig(options.config);
  const timestamp = nowMs(options);

  const heartbeat = buildScannerHeartbeat({
    config,
    now: timestamp
  });

  if (config.enabled === false) {
    return {
      version: SCANNER_VERSION,
      scanId: `lingolink_scan_disabled_${timestamp}`,
      enabled: false,
      scanned: false,
      inputHash: "",
      lingoInput: {
        originalText: safeString(input),
        normalizedText: safeString(input),
        changed: false,
        operations: [],
        source: "LingoLinkDormantScanner"
      },
      languageMeta: {
        detectedLanguage: config.defaultLanguage || "en",
        confidence: 1,
        supported: true,
        requiresTranslation: false,
        fallbackTriggered: false,
        reason: "dormant_scanner_disabled",
        source: "LingoLinkDormantScanner"
      },
      unknownLanguageAlert: {
        alertTriggered: false,
        reason: "dormant_scanner_disabled",
        source: "LingoLinkDormantScanner"
      },
      heartbeat,
      notificationReady: false,
      advisoryOnly: true,
      authority: heartbeat.authority,
      source: "LingoLinkDormantScanner"
    };
  }

  const normalization =
    typeof normalizeInput === "function"
      ? normalizeInput(input)
      : fallbackNormalize(input);

  const normalizedText = safeString(normalization.normalizedText);

  const languageMeta =
    typeof detectLanguage === "function"
      ? detectLanguage(normalizedText, {
          config: {
            supportedLanguages: config.supportedLanguages,
            defaultLanguage: config.defaultLanguage,
            unknownLanguage: config.unknownLanguage
          }
        })
      : fallbackDetect(normalizedText, config);

  const alert =
    typeof buildUnknownLanguageAlert === "function"
      ? buildUnknownLanguageAlert(
          {
            message: normalizedText,
            originalInput: normalization.originalText,
            languageMeta,
            gateway: "LingoLinkDormantScanner"
          },
          {
            rawInput: normalization.originalText,
            languageMeta
          }
        )
      : {
          alertTriggered: false,
          reason: "unknown_language_alert_dependency_missing",
          source: "LingoLinkDormantScanner"
        };

  return {
    version: SCANNER_VERSION,
    scanId: `lingolink_scan_${timestamp}_${hashText(normalization.originalText)}`,
    enabled: true,
    scanned: true,

    inputHash: hashText(normalization.originalText),
    lingoInput: normalization,
    languageMeta,
    unknownLanguageAlert: alert,
    heartbeat,

    notificationReady: alert.alertTriggered === true,
    advisoryOnly: true,
    forceTranslation: false,

    authority: {
      ...heartbeat.authority,
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    telemetry: {
      scannerReady: heartbeat.status === "ready",
      dormant: heartbeat.dormant,
      detectedLanguage: languageMeta.detectedLanguage,
      confidence: languageMeta.confidence,
      alertTriggered: alert.alertTriggered === true,
      severity: safeString(alert.severity || "none"),
      source: "LingoLinkDormantScanner"
    },

    source: "LingoLinkDormantScanner"
  };
}

function runDormantScanner(input, options = {}) {
  if (arguments.length === 0) {
    return buildScannerHeartbeat(options);
  }

  return scanDormantInput(input, options);
}

module.exports = {
  buildScannerHeartbeat,
  isHeartbeatStale,
  scanDormantInput,
  runDormantScanner,
  mergeScannerConfig,
  DEFAULT_SCANNER_CONFIG,
  SCANNER_VERSION
};
