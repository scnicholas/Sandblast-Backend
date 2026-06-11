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

const MARION_COORDINATION_TELEMETRY_VERSION = "nyx.marion.coordinationTelemetry/0.3.3+voiceLaneTelemetry+productionMonitoringShield+releaseReadinessRollbackSafety";

const DEFAULT_COORDINATION_TELEMETRY_CONFIG = Object.freeze({
  enabled: true,
  includeHashes: true,
  includeTrackSummaries: true,
  maxLaneCarryAgeMs: 5 * 60 * 1000,
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

function finiteTimestamp(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(safeString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestTimestamp() {
  let newest = 0;
  for (let i = 0; i < arguments.length; i += 1) {
    const t = finiteTimestamp(arguments[i]);
    if (t > newest) newest = t;
  }
  return newest;
}

function normalizeLaneName(value) {
  const lane = safeString(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!lane) return "";
  if (lane === "language" || lane === "lingo_link" || lane === "lingolink_gateway") return "lingolink";
  if (lane === "unknown_language" || lane === "unknown_language_alerts") return "unknown_language_alert";
  if (lane === "scanner" || lane === "language_scanner") return "dormant_scanner";
  if (lane === "real_world" || lane === "realworld" || lane === "aster" || lane === "environment" || lane === "real_world_observation") return "real_world_context";
  if (lane === "ethics" || lane === "ethical" || lane === "ethical_gate") return "ethical_gatekeeper";
  if (lane === "risk" || lane === "real_world_risk") return "risk_classifier";
  if (lane === "thalon" || lane === "thalon_readiness") return "thalon_review";
  if (lane === "strategic" || lane === "strategy" || lane === "strategic_review") return "strategic_advisory";
  if (lane === "voice" || lane === "speech" || lane === "mic" || lane === "microphone" || lane === "voice_input" || lane === "voice_lane") return "voice";
  return lane;
}

function uniqueNormalizedLanes(value = []) {
  const out = [];
  const seen = new Set();
  for (const item of safeArray(value)) {
    const lane = normalizeLaneName(item);
    if (!lane || seen.has(lane)) continue;
    seen.add(lane);
    out.push(lane);
  }
  return out;
}

function buildLaneRecencySnapshot(payload = {}, maxAgeMs = 5 * 60 * 1000, now = Date.now()) {
  const p = safeObject(payload);
  const languageTrack = safeObject(p.languageTrack);
  const realWorldTrack = safeObject(p.realWorldTrack);
  const ethicalGate = safeObject(p.ethicalGate || p.ethicalGatekeeper);
  const risk = safeObject(p.riskClassification || p.riskClassifier || p.realWorldRisk);
  const strategicTrack = safeObject(p.strategicTrack);
  const thalon = safeObject(p.thalonReadiness || p.thalon || p.thalonReview || p.strategicReview || strategicTrack.strategicReview);
  const coordinationMeta = safeObject(p.coordinationMeta);
  const carriedRecency = safeObject(p.laneRecency || coordinationMeta.laneRecency || p.recencyMaintenance);
  const carriedTimestamps = safeObject(carriedRecency.laneTimestamps);

  const allowedAge = Math.max(1000, Number(maxAgeMs) || (5 * 60 * 1000));
  const laneTimestamps = {
    lingolink: newestTimestamp(
      carriedTimestamps.lingolink,
      languageTrack.updatedAt,
      safeObject(p.languageMeta).updatedAt,
      safeObject(p.translationMeta).updatedAt,
      safeObject(p.lingoInput).updatedAt,
      safeObject(p.gatewayMeta).updatedAt
    ),
    unknown_language_alert: newestTimestamp(
      carriedTimestamps.unknown_language_alert,
      safeObject(p.unknownLanguageAlert).updatedAt,
      safeObject(languageTrack.unknownLanguageAlert).updatedAt
    ),
    dormant_scanner: newestTimestamp(
      carriedTimestamps.dormant_scanner,
      safeObject(p.dormantScanner).updatedAt,
      safeObject(languageTrack.dormantScanner).updatedAt,
      safeObject(p.scannerHeartbeat).updatedAt,
      safeObject(languageTrack.scannerHeartbeat).updatedAt
    ),
    real_world_context: newestTimestamp(
      carriedTimestamps.real_world_context,
      realWorldTrack.updatedAt,
      safeObject(p.realWorldEnvelope).updatedAt,
      safeObject(p.realWorldObservation).updatedAt,
      safeObject(p.observation).updatedAt,
      safeObject(realWorldTrack.envelope).updatedAt
    ),
    ethical_gatekeeper: newestTimestamp(
      carriedTimestamps.ethical_gatekeeper,
      ethicalGate.updatedAt
    ),
    risk_classifier: newestTimestamp(
      carriedTimestamps.risk_classifier,
      risk.updatedAt
    ),
    thalon_review: newestTimestamp(
      carriedTimestamps.thalon_review,
      thalon.updatedAt
    ),
    strategic_advisory: newestTimestamp(
      carriedTimestamps.strategic_advisory,
      strategicTrack.updatedAt,
      thalon.updatedAt
    ),
    voice: newestTimestamp(
      carriedTimestamps.voice,
      safeObject(p.voice).updatedAt,
      safeObject(p.voiceEnvelope).updatedAt,
      safeObject(p.voiceTrack).updatedAt,
      safeObject(p.voiceLane).updatedAt,
      p.voiceReceivedAt,
      p.receivedAt
    )
  };

  const explicitStale = uniqueNormalizedLanes(carriedRecency.staleLanes || carriedRecency.staleTracks || p.staleLanes || coordinationMeta.staleTracks);
  const laneAgeMs = {};
  const staleSet = new Set(explicitStale);
  for (const lane of Object.keys(laneTimestamps)) {
    const ts = laneTimestamps[lane];
    const age = ts > 0 ? Math.max(0, now - ts) : 0;
    laneAgeMs[lane] = age;
    if (ts > 0 && age > allowedAge) staleSet.add(lane);
  }
  const staleLanes = Array.from(staleSet);

  return {
    enabled: true,
    maxLaneCarryAgeMs: allowedAge,
    staleLanes,
    staleCarrySuppressed: staleLanes.length > 0 || carriedRecency.staleCarrySuppressed === true,
    laneTimestamps,
    laneAgeMs,
    noUserFacingDiagnostics: true,
    publicReplyVisible: false,
    userFacing: false,
    source: "MarionCoordinationTelemetry"
  };
}

function filterFreshActiveLanes(activeLanes = [], laneRecency = {}) {
  const stale = new Set(uniqueNormalizedLanes(safeObject(laneRecency).staleLanes));
  return uniqueNormalizedLanes(activeLanes).filter((lane) => !stale.has(lane));
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
      gatewayMeta.gateway === "LingoLink" ||
      gatewayMeta.source === "LingoLink" ||
      gatewayMeta.lane === "lingolink"
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


function detectVoiceLaneActive(payload = {}) {
  const p = safeObject(payload);
  const voice = safeObject(p.voice || p.voiceEnvelope || p.voiceTrack || p.voiceLane);
  const rawSource = safeString(p.inputChannel || p.source || p.inputSource || voice.inputChannel || voice.source).toLowerCase();
  const rawTranscript = safeString(p.transcript || p.normalizedTranscript || p.originalTranscript || voice.transcript || voice.normalizedTranscript || voice.originalTranscript);

  return Boolean(
    voice.active === true ||
      voice.source === "voice" ||
      voice.inputChannel === "voice" ||
      rawSource === "voice" ||
      rawSource === "speech" ||
      rawSource === "mic" ||
      rawSource === "microphone" ||
      rawTranscript
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
  const voice = safeObject(p.voice || p.voiceEnvelope || p.voiceTrack || p.voiceLane);

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
    },
    strategicAdvisory: {
      active: detectStrategicAdvisoryActive(p),
      decisionPressureIndex: clamp01(safeObject(p.strategicTrack).decisionPressureIndex || thalon.decisionPressureIndex || thalon.pressureIndex, 0),
      requiresHumanReview: safeObject(p.strategicTrack).requiresHumanReview === true || thalon.requiresHumanReview === true || thalon.humanReviewRecommended === true,
      advisoryOnly: true
    },
    voice: {
      active: detectVoiceLaneActive(p),
      inputChannel: safeString(p.inputChannel || p.source || voice.inputChannel || voice.source || ""),
      authorizationState: safeString(voice.authorizationState || safeObject(voice.authorization).authorizationState || p.authorizationState || ""),
      confidence: clamp01(voice.confidence || p.confidence, 0),
      speakAllowed: voice.speakAllowed === true,
      voiceMode: safeString(voice.voiceMode || ""),
      audioStored: false,
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
      advisoryOnly: true,
      forceAction: false,
      noUserFacingDiagnostics: true,
      lingoLinkActive: false,
      unknownLanguageAlertActive: false,
      dormantScannerActive: false,
      realWorldContextActive: false,
      ethicalGatekeeperActive: false,
      riskClassifierActive: false,
      thalonReviewRecommended: false,
      strategicAdvisoryActive: false,
      voiceLaneActive: false,
      activeLanes: [],
      rawActiveLanes: [],
      activeLaneCount: 0,
      staleLaneCarrySuppressed: false,
      staleLanes: [],
      laneRecency: buildLaneRecencySnapshot({}, config.maxLaneCarryAgeMs),
      marionFinalAuthorityPreserved: true,
    advisoryOnly: true,
    forceAction: false,
      noUserFacingDiagnostics: true,
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
  const laneRecency = buildLaneRecencySnapshot(p, config.maxLaneCarryAgeMs);

  const lingoLinkActive = detectLingoLinkActive(p);
  const unknownLanguageAlertActive = detectUnknownLanguageAlertActive(p);
  const dormantScannerActive = detectDormantScannerActive(p);
  const realWorldContextActive = detectRealWorldContextActive(p);
  const ethicalGatekeeperActive = detectEthicalGatekeeperActive(p);
  const riskClassifierActive = detectRiskClassifierActive(p);
  const thalonReviewRecommended = detectThalonReviewRecommended(p);
  const strategicAdvisoryActive = detectStrategicAdvisoryActive(p);
  const voiceLaneActive = detectVoiceLaneActive(p);

  const activeLanes = [];
  if (lingoLinkActive) activeLanes.push("lingolink");
  if (unknownLanguageAlertActive) activeLanes.push("unknown_language_alert");
  if (dormantScannerActive) activeLanes.push("dormant_scanner");
  if (realWorldContextActive) activeLanes.push("real_world_context");
  if (ethicalGatekeeperActive) activeLanes.push("ethical_gatekeeper");
  if (riskClassifierActive) activeLanes.push("risk_classifier");
  if (thalonReviewRecommended) activeLanes.push("thalon_review");
  if (strategicAdvisoryActive) activeLanes.push("strategic_advisory");
  if (voiceLaneActive) activeLanes.push("voice");

  const freshActiveLanes = filterFreshActiveLanes(activeLanes, laneRecency);

  const notificationReady = Boolean(
    safeObject(p.coordinationMeta).notificationReady ||
      safeObject(p.gatewayMeta).notificationReady ||
      safeObject(p.unknownLanguageAlert).notificationReady ||
      safeObject(p.dormantScanner).notificationReady ||
      safeObject(p.realWorldTrack).requiresHumanReview ||
      safeObject(p.ethicalGate).requiresHumanReview ||
      safeObject(p.riskClassification).requiresHumanReview ||
      safeObject(p.thalonReadiness).strategicReviewRequired ||
      voiceLaneActive === true
  );

  const requiresHumanReview = Boolean(
    safeObject(p.coordinationMeta).requiresHumanReview ||
      safeObject(p.realWorldTrack).requiresHumanReview ||
      safeObject(p.ethicalGate).requiresHumanReview ||
      safeObject(p.riskClassification).requiresHumanReview ||
      safeObject(p.thalonReadiness).strategicReviewRequired ||
      voiceLaneActive === true
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
    voiceLaneActive,

    freshLingoLinkActive: freshActiveLanes.includes("lingolink"),
    freshUnknownLanguageAlertActive: freshActiveLanes.includes("unknown_language_alert"),
    freshDormantScannerActive: freshActiveLanes.includes("dormant_scanner"),
    freshRealWorldContextActive: freshActiveLanes.includes("real_world_context"),
    freshEthicalGatekeeperActive: freshActiveLanes.includes("ethical_gatekeeper"),
    freshRiskClassifierActive: freshActiveLanes.includes("risk_classifier"),
    freshThalonReviewRecommended: freshActiveLanes.includes("thalon_review"),
    freshStrategicAdvisoryActive: freshActiveLanes.includes("strategic_advisory"),
    freshVoiceLaneActive: freshActiveLanes.includes("voice"),

    notificationReady,
    requiresHumanReview,

    activeLanes: freshActiveLanes,
    rawActiveLanes: activeLanes,
    activeLaneCount: freshActiveLanes.length,
    staleLaneCarrySuppressed: laneRecency.staleCarrySuppressed,
    staleLanes: laneRecency.staleLanes,
    laneRecency,

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
    rawActiveLanes: safeArray(t.rawActiveLanes),
    activeLaneCount: Number(t.activeLaneCount || 0),
    staleLaneCarrySuppressed: safeObject(t.laneRecency).staleCarrySuppressed === true || safeArray(t.staleLanes).length > 0,
    staleLanes: safeArray(t.staleLanes || safeObject(t.laneRecency).staleLanes),
    laneRecency: safeObject(t.laneRecency),
    freshActiveLanes: safeArray(t.activeLanes),
    voiceLaneActive: t.voiceLaneActive === true,
    freshVoiceLaneActive: safeArray(t.activeLanes).includes("voice"),
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
  detectVoiceLaneActive,
  buildLaneRecencySnapshot,
  filterFreshActiveLanes,
  normalizeLaneName,
  uniqueNormalizedLanes,
  mergeCoordinationTelemetryConfig,
  stableHash,
  DEFAULT_COORDINATION_TELEMETRY_CONFIG,
  MARION_COORDINATION_TELEMETRY_VERSION
};
