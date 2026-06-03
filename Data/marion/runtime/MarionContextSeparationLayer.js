"use strict";

/**
 * MarionContextSeparationLayer
 *
 * Purpose:
 * Separates language input, real-world context input, and ethical/strategic
 * review input before Marion coordinates them.
 *
 * Scope:
 * - Does not override Marion.
 * - Does not call Aster or Thalon.
 * - Does not translate.
 * - Does not infer private/sensitive traits.
 * - Produces source classification metadata only.
 */

const CONTEXT_SEPARATION_VERSION = "nyx.marion.contextSeparation/0.1";

const DEFAULT_CONTEXT_CONFIG = Object.freeze({
  enabled: true,
  languageSources: ["text", "message", "prompt", "voice_text", "lingolink"],
  realWorldSources: ["sensor", "camera", "visual", "environment", "observation", "real_world_context"],
  ethicalSources: ["ethical_review", "strategy", "thalom", "thalon"],
  authority: {
    finalAuthority: "Marion",
    contextSeparationAdvisoryOnly: true,
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

function lower(value) {
  return safeString(value).trim().toLowerCase();
}

function mergeContextConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_CONTEXT_CONFIG,
    ...incoming,
    languageSources: safeArray(incoming.languageSources).length
      ? safeArray(incoming.languageSources)
      : DEFAULT_CONTEXT_CONFIG.languageSources,
    realWorldSources: safeArray(incoming.realWorldSources).length
      ? safeArray(incoming.realWorldSources)
      : DEFAULT_CONTEXT_CONFIG.realWorldSources,
    ethicalSources: safeArray(incoming.ethicalSources).length
      ? safeArray(incoming.ethicalSources)
      : DEFAULT_CONTEXT_CONFIG.ethicalSources,
    authority: {
      ...DEFAULT_CONTEXT_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      contextSeparationAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function hasAnyObjectKeys(value) {
  return Object.keys(safeObject(value)).length > 0;
}

function extractTextCandidate(payload = {}) {
  if (typeof payload === "string") return payload;

  const p = safeObject(payload);

  return safeString(
    p.message ||
      p.input ||
      p.text ||
      p.prompt ||
      p.originalInput ||
      safeObject(p.lingoInput).normalizedText ||
      safeObject(p.lingoInput).originalText ||
      ""
  );
}

function hasLanguageSignal(payload = {}) {
  const p = safeObject(payload);
  const text = extractTextCandidate(payload);

  return Boolean(
    text ||
      hasAnyObjectKeys(p.languageMeta) ||
      hasAnyObjectKeys(p.lingoInput) ||
      hasAnyObjectKeys(p.translationMeta) ||
      hasAnyObjectKeys(p.lingoLink) ||
      hasAnyObjectKeys(p.unknownLanguageAlert)
  );
}

function hasRealWorldSignal(payload = {}) {
  const p = safeObject(payload);

  return Boolean(
    hasAnyObjectKeys(p.realWorldContext) ||
      hasAnyObjectKeys(p.realWorldObservation) ||
      hasAnyObjectKeys(p.observation) ||
      hasAnyObjectKeys(p.sensor) ||
      hasAnyObjectKeys(p.sensorData) ||
      hasAnyObjectKeys(p.environment) ||
      hasAnyObjectKeys(p.visualContext) ||
      lower(p.sourceType).includes("real_world") ||
      lower(p.modality).includes("sensor") ||
      lower(p.modality).includes("visual") ||
      lower(p.type).includes("observation")
  );
}

function hasEthicalSignal(payload = {}) {
  const p = safeObject(payload);

  return Boolean(
    hasAnyObjectKeys(p.ethicalReview) ||
      hasAnyObjectKeys(p.thalon) ||
      hasAnyObjectKeys(p.thalonReview) ||
      hasAnyObjectKeys(p.strategyReview) ||
      lower(p.sourceType).includes("ethical") ||
      lower(p.sourceType).includes("thalon")
  );
}

function classifyContextSource(payload = {}, options = {}) {
  const config = mergeContextConfig(options.config);

  if (!config.enabled) {
    return {
      version: CONTEXT_SEPARATION_VERSION,
      enabled: false,
      sourceType: "disabled",
      routedTo: "Marion",
      languageTrackEligible: false,
      realWorldTrackEligible: false,
      ethicalTrackEligible: false,
      mixedInput: false,
      reason: "context_separation_disabled",
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "MarionContextSeparationLayer"
    };
  }

  const language = hasLanguageSignal(payload);
  const realWorld = hasRealWorldSignal(payload);
  const ethical = hasEthicalSignal(payload);
  const activeCount = [language, realWorld, ethical].filter(Boolean).length;

  let sourceType = "unknown";
  let routedTo = "Marion";

  if (language && !realWorld && !ethical) {
    sourceType = "language";
    routedTo = "LingoLink";
  } else if (!language && realWorld && !ethical) {
    sourceType = "real_world_context";
    routedTo = "RealWorldInputEnvelope";
  } else if (!language && !realWorld && ethical) {
    sourceType = "ethical_review";
    routedTo = "ThalonReadiness";
  } else if (activeCount > 1) {
    sourceType = "mixed";
    routedTo = "MarionDualTrackGateway";
  }

  return {
    version: CONTEXT_SEPARATION_VERSION,
    enabled: true,
    sourceType,
    routedTo,

    languageTrackEligible: language,
    realWorldTrackEligible: realWorld,
    ethicalTrackEligible: ethical,
    mixedInput: activeCount > 1,

    lingoLinkEligible: language,
    realWorldEligible: realWorld,
    ethicalReviewEligible: ethical,

    textCandidate: extractTextCandidate(payload),

    reason:
      sourceType === "unknown"
        ? "no_context_signal_detected"
        : sourceType === "mixed"
          ? "multiple_context_signals_detected"
          : `${sourceType}_context_detected`,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      contextSeparationAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    advisoryOnly: true,
    source: "MarionContextSeparationLayer"
  };
}

function buildSeparatedContextPacket(payload = {}, options = {}) {
  const classification = classifyContextSource(payload, options);
  const p = safeObject(payload);

  return {
    version: CONTEXT_SEPARATION_VERSION,
    classification,

    languageInput: classification.languageTrackEligible
      ? {
          active: true,
          message: extractTextCandidate(payload),
          languageMeta: safeObject(p.languageMeta),
          lingoInput: safeObject(p.lingoInput),
          translationMeta: safeObject(p.translationMeta),
          unknownLanguageAlert: safeObject(p.unknownLanguageAlert),
          source: "MarionContextSeparationLayer"
        }
      : {
          active: false,
          source: "MarionContextSeparationLayer"
        },

    realWorldInput: classification.realWorldTrackEligible
      ? {
          active: true,
          observation: safeObject(
            p.realWorldObservation ||
              p.realWorldContext ||
              p.observation ||
              p.sensor ||
              p.sensorData ||
              p.environment ||
              p.visualContext
          ),
          source: "MarionContextSeparationLayer"
        }
      : {
          active: false,
          source: "MarionContextSeparationLayer"
        },

    ethicalInput: classification.ethicalTrackEligible
      ? {
          active: true,
          ethicalReview: safeObject(
            p.ethicalReview ||
              p.thalon ||
              p.thalonReview ||
              p.strategyReview
          ),
          source: "MarionContextSeparationLayer"
        }
      : {
          active: false,
          source: "MarionContextSeparationLayer"
        },

    authority: classification.authority,
    marionAuthority: true,
    finalAuthority: "Marion",
    advisoryOnly: true,
    source: "MarionContextSeparationLayer"
  };
}

module.exports = {
  classifyContextSource,
  buildSeparatedContextPacket,
  mergeContextConfig,
  extractTextCandidate,
  hasLanguageSignal,
  hasRealWorldSignal,
  hasEthicalSignal,
  DEFAULT_CONTEXT_CONFIG,
  CONTEXT_SEPARATION_VERSION
};
