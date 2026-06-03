"use strict";

/**
 * MarionCoordinationTelemetry
 *
 * Purpose:
 * Builds compact coordination telemetry across Marion's parallel advisory lanes:
 * - LingoLink language pipeline
 * - Unknown language alert path
 * - Dormant scanner path
 * - Real-world context envelope
 * - Ethical gatekeeper
 * - Real-world risk classifier
 * - Thalon readiness / strategic advisory path
 *
 * Scope:
 * - Does not expose public reply text.
 * - Does not override Marion.
 * - Does not send notifications.
 * - Produces diagnostic telemetry only.
 */

const MARION_COORDINATION_TELEMETRY_VERSION = "nyx.marion.coordinationTelemetry/0.2";

const DEFAULT_COORDINATION_TELEMETRY_CONFIG = Object.freeze({
  enabled: true,
  includeHashes: true,
  includeTrackSummaries: true,
  publicReplyVisible: false,
  authority: {
    finalAuthority: "Marion",
    coordinationTelemetryAdvisoryOnly: true,
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

function safeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function mergeCoordinationTelemetryConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_COORDINATION_TELEMETRY_CONFIG,
    ...incoming,
    publicReplyVisible: false,
    authority: {
      ...DEFAULT_COORDINATION_TELEMETRY_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      coordinationTelemetryAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}

function stableHash(value) {
  const text = safeString(value).toLowerCase().replace(/\s+/g, " ").trim();

  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function detectLingoLinkActive(payload = {}) {
  const p = safeObject(payload);
  const languageTrack = safeObject(p.languageTrack);
  const gatewayMeta = safeObject(p.gatewayMeta);

  return Boolean(
    languageTrack.active === true ||
      Object.keys(safeObject(p.languageMeta)).length ||
      Object.keys(safeObject(p.lingoInput)).length ||
      Object.keys(safeObject(p.translationMeta)).length ||
      Object.keys(gatewayMeta).length ||
      gatewayMeta.gateway === "LingoLink"
  );
}

function detectUnknownLanguageAlertActive(payload = {}) {
  const p = safeObject(payload);
  const languageTrack = safeObject(p.languageTrack);
  const alert = safeObject(p.unknownLanguageAlert || languageTrack.unknownLanguageAlert);
  const gatewayMeta = safeObject(p.gatewayMeta || languageTrack.gatewayMeta);

  return Boolean(
    alert.alertTriggered === true ||
      alert.notificationReady === true ||
      gatewayMeta.alertTriggered === true ||
      safeObject(p.dormantScanner).notificationReady === true
  );
}

function detectDormantScannerActive(payload = {}) {
  const p = safeObject(payload);
  const languageTrack = safeObject(p.languageTrack);

  return Boolean(
    Object.keys(safeObject(p.scannerHeartbeat)).length ||
      Object.keys(safeObject(p.dormantScanner)).length ||
      Object.keys(safeObject(languageTrack.scannerHeartbeat)).length ||
      Object.keys(safeObject(languageTrack.dormantScanner)).length
  );
}

function detectRealWorldContextActive(payload = {}) {
  const p = safeObject(payload);
  const realWorldTrack = safeObject(p.realWorldTrack);

  return Boolean(
    realWorldTrack.active === true ||
      Object.keys(safeObject(p.realWorldEnvelope)).length ||
      Object.keys(safeObject(p.realWorldObservation)).length ||
      Object.keys(safeObject(p.observation)).length ||
      Object.keys(safeObject(realWorldTrack.envelope)).length
  );
}

function detectEthicalGatekeeperActive(payload = {}) {
  const p = safeObject(payload);

  return Boolean(
    Object.keys(safeObject(p.ethicalGate)).length ||
      Object.keys(safeObject(p.ethicalGatekeeper)).length ||
      Object.keys(safeObject(p.ethicalReview)).length
  );
}

function detectRiskClassifierActive(payload = {}) {
  const p = safeObject(payload);

  return Boolean(
    Object.keys(safeObject(p.riskClassification)).length ||
      Object.keys(safeObject(p.riskClassifier)).length ||
      Object.keys(safeObject(p.realWorldRisk)).length
  );
}

function detectThalonReviewRecommended(payload = {}) {
  const p = safeObject(payload);
  const thalon = safeObject(p.thalonReadiness || p.thalon || p.thalonReview);

  return Boolean(
    thalon.strategicReviewRequired === true ||
      thalon.thalonReady === true && safeString(thalon.recommendationMode) === "advisory_review"
  );
}

function detectStrategicAdvisoryActive(payload = {}) {
  const p = safeObject(payload);
  const strategicTrack = safeObject(p.strategicTrack);
  const thalon = safeObject(p.thalonReadiness || p.thalon || p.thalonReview || p.strategicReview || strategicTrack.strategicReview);

  return Boolean(
    strategicTrack.active === true ||
      thalon.strategicReviewRequired === true ||
      thalon.advisoryOnly === true ||
      Number(thalon.decisionPressureIndex || thalon.pressureIndex || 0) > 0
  );
}

function extractCoordinationIds(payload = {}) {
  const p = safeObject(payload);
  const gatewayMeta = safeObject(p.gatewayMeta || safeObject(p.languageTrack).gatewayMeta);
  const coordinationMeta = safeObject(p.coordinationMeta);

  const correlationId = safeString(
    p.correlationId ||
      gatewayMeta.correlationId ||
      coordinationMeta.correlationId ||
      p.traceId ||
      gatewayMeta.traceId ||
      ""
  );

  const traceId = safeString(
    p.traceId ||
      gatewayMeta.traceId ||
      correlationId ||
      ""
  );

  const inputHash = safeString(
    p.inputHash ||
      gatewayMeta.inputHash ||
      ""
  );

  const gatewayHash = safeString(
    p.gatewayHash ||
      gatewayMeta.gatewayHash ||
      ""
  );

  const stable = safeString(
    p.stableHash ||
      gatewayMeta.stableHash ||
      inputHash ||
      gatewayHash ||
      correlationId ||
      ""
  );

  return {
    correlationId,
    traceId,
    inputHash,
    gatewayHash,
    stableHash: stable
  };
}

function buildLaneSummary(payload = {}) {
  const p = safeObject(payload);
  const languageMeta = safeObject(p.languageMeta || safeObject(p.languageTrack).languageMeta);
  const translationMeta = safeObject(p.translationMeta || safeObject(p.languageTrack).translationMeta);
  const alert = safeObject(p.unknownLanguageAlert || safeObject(p.languageTrack).unknownLanguageAlert);
  const realWorldTrack = safeObject(p.realWorldTrack);
  const realWorldEnvelope = safeObject(realWorldTrack.envelope || p.realWorldEnvelope);
  const ethicalGate = safeObject(p.ethicalGate || p.ethicalGatekeeper);
  const risk = safeObject(p.riskClassification || p.riskClassifier || p.realWorldRisk);
  const thalon = safeObject(p.thalonReadiness || p.thalon || p.thalonReview);

  return {
    language: {
      active: detectLingoLinkActive(p),
      detectedLanguage: safeString(languageMeta.detectedLanguage || ""),
      confidence: clamp01(languageMeta.confidence, 0),
      requiresTranslation: languageMeta.requiresTranslation === true,
      translated: translationMeta.translated === true,
      advisoryOnly: true
    },
    unknownLanguageAlert: {
      active: detectUnknownLanguageAlertActive(p),
      alertTriggered: alert.alertTriggered === true,
      notificationReady: alert.notificationReady === true,
      severity: safeString(alert.severity || "none"),
      advisoryOnly: true
    },
    dormantScanner: {
      active: detectDormantScannerActive(p),
      notificationReady: safeObject(p.dormantScanner).notificationReady === true,
      advisoryOnly: true
    },
    realWorld: {
      active: detectRealWorldContextActive(p),
      observationType: safeString(realWorldTrack.observationType || realWorldEnvelope.observationType || ""),
      riskLevel: safeString(realWorldTrack.riskLevel || realWorldEnvelope.riskLevel || ""),
      requiresHumanReview: realWorldTrack.requiresHumanReview === true || realWorldEnvelope.requiresHumanReview === true,
      blocked: realWorldTrack.blocked === true || realWorldEnvelope.blocked === true,
      advisoryOnly: true
    },
    ethicalGatekeeper: {
      active: detectEthicalGatekeeperActive(p),
      decision: safeString(ethicalGate.decision || ""),
      blocked: ethicalGate.blocked === true,
      ethicalConcernLevel: safeString(ethicalGate.ethicalConcernLevel || ""),
      requiresHumanReview: ethicalGate.requiresHumanReview === true,
      advisoryOnly: true
    },
    riskClassifier: {
      active: detectRiskClassifierActive(p),
      riskLevel: safeString(risk.riskLevel || ""),
      requiresHumanReview: risk.requiresHumanReview === true,
      emergencySafeWordingRequired: risk.emergencySafeWordingRequired === true,
      advisoryOnly: true
    },
    thalon: {
      active: Object.keys(thalon).length > 0,
      thalonReady: thalon.thalonReady === true,
      strategicReviewRequired: thalon.strategicReviewRequired === true,
      ethicalConcernLevel: safeString(thalon.ethicalConcernLevel || ""),
      advisoryOnly: true
    }
  };
}

function buildMarionCoordinationTelemetry(payload = {}, options = {}) {
  const config = mergeCoordinationTelemetryConfig(options.config);

  if (!config.enabled) {
    return {
      version: MARION_COORDINATION_TELEMETRY_VERSION,
      enabled: false,
      reason: "coordination_telemetry_disabled",
      lingoLinkActive: false,
      unknownLanguageAlertActive: false,
      dormantScannerActive: false,
      realWorldContextActive: false,
      ethicalGatekeeperActive: false,
      riskClassifierActive: false,
      thalonReviewRecommended: false,
      marionFinalAuthorityPreserved: true,
      publicReplyVisible: false,
      userFacing: false,
      publicText: "",
      renderText: "",
      text: "",
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "MarionCoordinationTelemetry"
    };
  }

  const p = safeObject(payload);
  const ids = extractCoordinationIds(p);
  const laneSummary = buildLaneSummary(p);

  const lingoLinkActive = detectLingoLinkActive(p);
  const unknownLanguageAlertActive = detectUnknownLanguageAlertActive(p);
  const dormantScannerActive = detectDormantScannerActive(p);
  const realWorldContextActive = detectRealWorldContextActive(p);
  const ethicalGatekeeperActive = detectEthicalGatekeeperActive(p);
  const riskClassifierActive = detectRiskClassifierActive(p);
  const thalonReviewRecommended = detectThalonReviewRecommended(p);
  const strategicAdvisoryActive = detectStrategicAdvisoryActive(p);

  const activeLanes = [];
  if (lingoLinkActive) activeLanes.push("lingolink");
  if (unknownLanguageAlertActive) activeLanes.push("unknown_language_alert");
  if (dormantScannerActive) activeLanes.push("dormant_scanner");
  if (realWorldContextActive) activeLanes.push("real_world_context");
  if (ethicalGatekeeperActive) activeLanes.push("ethical_gatekeeper");
  if (riskClassifierActive) activeLanes.push("risk_classifier");
  if (thalonReviewRecommended) activeLanes.push("thalon_review");
  if (strategicAdvisoryActive) activeLanes.push("strategic_advisory");

  const notificationReady = Boolean(
    safeObject(p.coordinationMeta).notificationReady ||
      safeObject(p.gatewayMeta).notificationReady ||
      safeObject(p.unknownLanguageAlert).notificationReady ||
      safeObject(p.dormantScanner).notificationReady ||
      safeObject(p.realWorldTrack).requiresHumanReview ||
      safeObject(p.ethicalGate).requiresHumanReview ||
      safeObject(p.riskClassification).requiresHumanReview ||
      safeObject(p.thalonReadiness).strategicReviewRequired
  );

  const requiresHumanReview = Boolean(
    safeObject(p.coordinationMeta).requiresHumanReview ||
      safeObject(p.realWorldTrack).requiresHumanReview ||
      safeObject(p.ethicalGate).requiresHumanReview ||
      safeObject(p.riskClassification).requiresHumanReview ||
      safeObject(p.thalonReadiness).strategicReviewRequired
  );

  return {
    version: MARION_COORDINATION_TELEMETRY_VERSION,
    enabled: true,

    lingoLinkActive,
    unknownLanguageAlertActive,
    dormantScannerActive,
    realWorldContextActive,
    ethicalGatekeeperActive,
    riskClassifierActive,
    thalonReviewRecommended,
    strategicAdvisoryActive,

    notificationReady,
    requiresHumanReview,

    activeLanes,
    activeLaneCount: activeLanes.length,

    marionFinalAuthorityPreserved: true,
    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    correlationId: config.includeHashes === false ? "" : ids.correlationId,
    traceId: config.includeHashes === false ? "" : ids.traceId,
    inputHash: config.includeHashes === false ? "" : ids.inputHash,
    gatewayHash: config.includeHashes === false ? "" : ids.gatewayHash,
    stableHash: config.includeHashes === false ? "" : ids.stableHash,

    laneSummary: config.includeTrackSummaries === false ? {} : laneSummary,

    advisoryOnly: true,
    forceAction: false,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      coordinationTelemetryAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    updatedAt: Date.now(),
    source: "MarionCoordinationTelemetry"
  };
}

function summarizeCoordinationTelemetry(telemetry = {}) {
  const t = safeObject(telemetry);

  return {
    version: MARION_COORDINATION_TELEMETRY_VERSION,
    enabled: t.enabled !== false,
    activeLanes: safeArray(t.activeLanes),
    activeLaneCount: Number(t.activeLaneCount || 0),
    notificationReady: t.notificationReady === true,
    requiresHumanReview: t.requiresHumanReview === true,
    marionFinalAuthorityPreserved: t.marionFinalAuthorityPreserved !== false,
    publicReplyVisible: false,
    userFacing: false,
    authority: {
      finalAuthority: "Marion",
      coordinationTelemetryAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "MarionCoordinationTelemetry"
  };
}

module.exports = {
  buildMarionCoordinationTelemetry,
  summarizeCoordinationTelemetry,
  buildLaneSummary,
  extractCoordinationIds,
  detectLingoLinkActive,
  detectUnknownLanguageAlertActive,
  detectDormantScannerActive,
  detectRealWorldContextActive,
  detectEthicalGatekeeperActive,
  detectRiskClassifierActive,
  detectThalonReviewRecommended,
  detectStrategicAdvisoryActive,
  mergeCoordinationTelemetryConfig,
  stableHash,
  DEFAULT_COORDINATION_TELEMETRY_CONFIG,
  MARION_COORDINATION_TELEMETRY_VERSION
};
