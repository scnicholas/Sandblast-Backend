"use strict";

/**
 * MarionDualTrackGateway
 *
 * Purpose:
 * Coordinates LingoLink language metadata and Marion-safe real-world context
 * metadata without letting either track override Marion.
 *
 * Scope:
 * - Does not call Aster directly.
 * - Does not call Thalon directly.
 * - Does not expose internal metadata publicly.
 * - Does not override Marion.
 */

const {
  classifyContextSource,
  buildSeparatedContextPacket
} = require("./MarionContextSeparationLayer");

const {
  buildRealWorldInputEnvelope
} = require("./MarionRealWorldInputEnvelope");

const DUAL_TRACK_GATEWAY_VERSION = "nyx.marion.dualTrackGateway/0.3.1+productionMonitoringShield";

const DEFAULT_DUAL_TRACK_CONFIG = Object.freeze({
  enabled: true,
  languageTrackEnabled: true,
  realWorldTrackEnabled: true,
  ethicalTrackEnabled: true,
  strategicTrackEnabled: true,
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    realWorldAdvisoryOnly: true,
    ethicalAdvisoryOnly: true,
    strategicAdvisoryOnly: true,
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

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of safeArray(values)) {
    const text = safeString(value).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function extractActiveTracksFromPacket(packet = {}) {
  const p = safeObject(packet);
  const meta = safeObject(p.coordinationMeta || p);
  if (Array.isArray(meta.activeTracks)) return uniqueStrings(meta.activeTracks);
  return uniqueStrings([
    safeObject(p.languageTrack).active === true ? "language" : "",
    safeObject(p.realWorldTrack).active === true ? "real_world" : "",
    safeObject(p.ethicalTrack).active === true ? "ethical" : "",
    safeObject(p.strategicTrack).active === true ? "strategic" : ""
  ].filter(Boolean));
}

function extractPreviousActiveTracks(payload = {}, options = {}) {
  const p = safeObject(payload);
  const o = safeObject(options);
  const previous = safeObject(
    o.previousDualTrack ||
      o.previousPacket ||
      o.previousParallelLaneCoordination ||
      p.previousDualTrack ||
      p.previousPacket ||
      p.previousParallelLaneCoordination ||
      p.previousLaneState
  );
  const previousMeta = safeObject(previous.coordinationMeta || previous);
  const explicit = uniqueStrings(
    previousMeta.activeTracks ||
      previous.activeTracks ||
      safeObject(previous.dualTrackSummary).activeTracks ||
      safeObject(previous.coordinationSummary).activeTracks ||
      []
  );
  if (explicit.length) return explicit;
  return extractActiveTracksFromPacket(previous);
}

function buildLaneRecencyMaintenance(payload = {}, activeTracks = [], options = {}) {
  const currentTracks = uniqueStrings(activeTracks);
  const previousTracks = extractPreviousActiveTracks(payload, options);
  const staleTracks = previousTracks.filter((track) => !currentTracks.includes(track));
  const newlyActiveTracks = currentTracks.filter((track) => !previousTracks.includes(track));
  const unchangedTracks = currentTracks.filter((track) => previousTracks.includes(track));
  const turnId = safeString(safeObject(payload).turnId || safeObject(options).turnId || safeObject(payload).requestId || "");

  return {
    version: "nyx.marion.parallelLaneRecency/0.1",
    active: previousTracks.length > 0 || currentTracks.length > 0,
    currentTracks,
    previousTracks,
    newlyActiveTracks,
    unchangedTracks,
    staleTracks,
    staleLanes: staleTracks,
    staleCarrySuppressed: staleTracks.length > 0,
    normalTurn: currentTracks.length === 0,
    turnId,
    advisoryOnly: true,
    finalAuthority: "Marion",
    publicReplyVisible: false,
    userFacing: false,
    noUserFacingDiagnostics: true,
    source: "MarionDualTrackGateway"
  };
}

function mergeDualTrackConfig(config) {
  const incoming = safeObject(config);

  return {
    ...DEFAULT_DUAL_TRACK_CONFIG,
    ...incoming,
    authority: {
      ...DEFAULT_DUAL_TRACK_CONFIG.authority,
      ...safeObject(incoming.authority),
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      realWorldAdvisoryOnly: true,
      ethicalAdvisoryOnly: true,
      strategicAdvisoryOnly: true,
      neverOverrideMarion: true
    }
  };
}


function looksLikeExplicitLanguageSignal(payload = {}) {
  const p = safeObject(payload);
  const text = safeString(p.message || p.input || p.text || p.prompt || "");
  const lower = text.toLowerCase();

  return Boolean(
    Object.keys(safeObject(p.languageMeta)).length ||
      Object.keys(safeObject(p.lingoInput)).length ||
      Object.keys(safeObject(p.translationMeta)).length ||
      Object.keys(safeObject(p.unknownLanguageAlert)).length ||
      Object.keys(safeObject(p.scannerHeartbeat)).length ||
      Object.keys(safeObject(p.dormantScanner)).length ||
      Object.keys(safeObject(p.gatewayMeta)).length && /lingolink|language|translation/i.test(JSON.stringify(safeObject(p.gatewayMeta))) ||
      /\b(?:translate|translation|language|lingolink|lingo link|bonjour|hola|français|francais|español|espanol)\b/i.test(text) ||
      /[À-ÿ¿¡]/.test(text) ||
      (lower.includes("nyx") && /\b(?:bonjour|hola)\b/i.test(text))
  );
}

function extractLanguageTrack(payload = {}) {
  const p = safeObject(payload);

  return {
    active: looksLikeExplicitLanguageSignal(p),
    source: "LingoLink",
    message: safeString(p.message || p.input || p.text || p.prompt || ""),
    languageMeta: safeObject(p.languageMeta),
    lingoInput: safeObject(p.lingoInput),
    translationMeta: safeObject(p.translationMeta),
    unknownLanguageAlert: safeObject(p.unknownLanguageAlert),
    scannerHeartbeat: safeObject(p.scannerHeartbeat),
    dormantScanner: safeObject(p.dormantScanner),
    gatewayMeta: safeObject(p.gatewayMeta),
    advisoryOnly: true,
    finalAuthority: "Marion"
  };
}

function extractRealWorldObservation(payload = {}) {
  const p = safeObject(payload);

  return safeObject(
    p.realWorldObservation ||
      p.realWorldContext ||
      p.observation ||
      p.sensor ||
      p.sensorData ||
      p.environment ||
      p.visualContext
  );
}

function extractRealWorldTrack(payload = {}, options = {}) {
  const observation = extractRealWorldObservation(payload);

  if (!Object.keys(observation).length) {
    return {
      active: false,
      source: "RealWorldInputEnvelope",
      advisoryOnly: true,
      finalAuthority: "Marion"
    };
  }

  const envelope = buildRealWorldInputEnvelope(observation, {
    config: safeObject(options.realWorldConfig || options.config && options.config.realWorld)
  });

  return {
    active: true,
    source: "RealWorldInputEnvelope",
    envelope,
    observationType: envelope.observationType,
    riskLevel: envelope.riskLevel,
    confidence: envelope.confidence,
    permissionStatus: envelope.permissionStatus,
    blocked: envelope.blocked,
    requiresHumanReview: envelope.requiresHumanReview,
    advisoryOnly: true,
    finalAuthority: "Marion"
  };
}

function extractEthicalTrack(payload = {}) {
  const p = safeObject(payload);
  const ethical = safeObject(
    p.ethicalReview ||
      p.ethicalGate ||
      p.ethicalGatekeeper ||
      p.thalon ||
      p.thalonReview ||
      p.strategyReview
  );

  const concern = safeString(ethical.ethicalConcernLevel || ethical.concernLevel || ethical.riskLevel || "").toLowerCase();
  const requiresHumanReview = Boolean(
    ethical.requiresHumanReview === true ||
      ethical.humanReviewRequired === true ||
      ethical.humanReviewRecommended === true ||
      ethical.blocked === true ||
      concern === "high" ||
      concern === "critical"
  );

  return {
    active: Object.keys(ethical).length > 0,
    source: "ThalonReadinessPending",
    ethicalReview: ethical,
    requiresHumanReview,
    advisoryOnly: true,
    finalAuthority: "Marion"
  };
}

function extractStrategicTrack(payload = {}) {
  const p = safeObject(payload);
  const strategic = safeObject(
    p.strategicReview ||
      p.strategicAssessment ||
      p.thalonStrategicAssessment ||
      p.thalonAdvisory ||
      p.thalon ||
      p.thalonReview ||
      p.strategyReview
  );

  const pressure = Number(strategic.decisionPressureIndex || strategic.pressureIndex || strategic.pressure || 0);

  return {
    active: Object.keys(strategic).length > 0 || pressure > 0,
    source: "ThalonStrategicAdvisory",
    strategicReview: strategic,
    decisionPressureIndex: Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0,
    requiresHumanReview: strategic.requiresHumanReview === true || strategic.humanReviewRecommended === true || pressure >= 0.75,
    advisoryOnly: true,
    finalAuthority: "Marion"
  };
}

function buildMarionDualTrackPacket(payload = {}, options = {}) {
  const config = mergeDualTrackConfig(options.config);

  if (!config.enabled) {
    return {
      version: DUAL_TRACK_GATEWAY_VERSION,
      enabled: false,
      languageTrack: { active: false, source: "LingoLink" },
      realWorldTrack: { active: false, source: "RealWorldInputEnvelope" },
      ethicalTrack: { active: false, source: "ThalonReadinessPending" },
      strategicTrack: { active: false, source: "ThalonStrategicAdvisory" },
      coordinationMeta: {
        activeTracks: [],
        trackCount: 0,
        mixedInput: false,
        laneRecency: buildLaneRecencyMaintenance(payload, [], options),
        staleTracks: [],
        staleLanes: [],
        staleCarrySuppressed: false,
        reason: "dual_track_gateway_disabled",
        source: "MarionDualTrackGateway"
      },
      publicReplyVisible: false,
      userFacing: false,
      publicText: "",
      renderText: "",
      text: "",
      advisoryOnly: true,
      forceAction: false,
      authority: config.authority,
      marionAuthority: true,
      finalAuthority: "Marion",
      source: "MarionDualTrackGateway"
    };
  }

  const separation = buildSeparatedContextPacket(payload, options);
  const classification = classifyContextSource(payload, options);

  const languageTrack = config.languageTrackEnabled === false
    ? { active: false, source: "LingoLink", disabled: true }
    : extractLanguageTrack(payload);

  const realWorldTrack = config.realWorldTrackEnabled === false
    ? { active: false, source: "RealWorldInputEnvelope", disabled: true }
    : extractRealWorldTrack(payload, options);

  const ethicalTrack = config.ethicalTrackEnabled === false
    ? { active: false, source: "ThalonReadinessPending", disabled: true }
    : extractEthicalTrack(payload);

  const strategicTrack = config.strategicTrackEnabled === false
    ? { active: false, source: "ThalonStrategicAdvisory", disabled: true }
    : extractStrategicTrack(payload);

  const activeTracks = [];
  if (languageTrack.active) activeTracks.push("language");
  if (realWorldTrack.active) activeTracks.push("real_world");
  if (ethicalTrack.active) activeTracks.push("ethical");
  if (strategicTrack.active) activeTracks.push("strategic");

  const laneRecency = buildLaneRecencyMaintenance(payload, activeTracks, options);

  const notificationReady = Boolean(
    safeObject(languageTrack.gatewayMeta).notificationReady ||
      safeObject(languageTrack.unknownLanguageAlert).notificationReady ||
      safeObject(languageTrack.dormantScanner).notificationReady ||
      realWorldTrack.requiresHumanReview ||
      ethicalTrack.requiresHumanReview ||
      strategicTrack.requiresHumanReview
  );

  return {
    version: DUAL_TRACK_GATEWAY_VERSION,
    enabled: true,

    classification,
    separation,

    languageTrack,
    realWorldTrack,
    ethicalTrack,
    strategicTrack,

    coordinationMeta: {
      activeTracks,
      trackCount: activeTracks.length,
      mixedInput: activeTracks.length > 1,
      laneRecency,
      staleTracks: laneRecency.staleTracks,
      staleLanes: laneRecency.staleLanes,
      staleCarrySuppressed: laneRecency.staleCarrySuppressed,
      notificationReady,
      requiresHumanReview: Boolean(realWorldTrack.requiresHumanReview || ethicalTrack.requiresHumanReview || strategicTrack.requiresHumanReview),
      publicReplyVisible: false,
      userFacing: false,
      reason: activeTracks.length
        ? "dual_track_packet_created"
        : "no_active_tracks",
      source: "MarionDualTrackGateway"
    },

    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",

    advisoryOnly: true,
    forceAction: false,
    laneRecency,
    staleTracks: laneRecency.staleTracks,
    staleLanes: laneRecency.staleLanes,
    staleCarrySuppressed: laneRecency.staleCarrySuppressed,

    authority: {
      ...config.authority,
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      realWorldAdvisoryOnly: true,
      ethicalAdvisoryOnly: true,
      strategicAdvisoryOnly: true,
      neverOverrideMarion: true
    },

    marionAuthority: true,
    finalAuthority: "Marion",
    source: "MarionDualTrackGateway"
  };
}

function summarizeDualTrackPacket(packet = {}) {
  const p = safeObject(packet);
  const meta = safeObject(p.coordinationMeta || p);
  const activeTracks = Array.isArray(meta.activeTracks)
    ? uniqueStrings(meta.activeTracks)
    : extractActiveTracksFromPacket(p);
  const laneRecency = safeObject(p.laneRecency || meta.laneRecency);
  const staleTracks = uniqueStrings(meta.staleTracks || meta.staleLanes || laneRecency.staleTracks || laneRecency.staleLanes || []);

  return {
    version: DUAL_TRACK_GATEWAY_VERSION,
    enabled: p.enabled !== false,
    activeTracks,
    trackCount: Number(meta.trackCount || activeTracks.length || 0),
    mixedInput: meta.mixedInput === true || activeTracks.length > 1,
    notificationReady: meta.notificationReady === true,
    requiresHumanReview: meta.requiresHumanReview === true,
    laneRecency,
    staleTracks,
    staleLanes: staleTracks,
    staleCarrySuppressed: meta.staleCarrySuppressed === true || laneRecency.staleCarrySuppressed === true || staleTracks.length > 0,
    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",
    advisoryOnly: true,
    marionAuthority: true,
    finalAuthority: "Marion",
    authority: {
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      realWorldAdvisoryOnly: true,
      ethicalAdvisoryOnly: true,
      strategicAdvisoryOnly: true,
      neverOverrideMarion: true
    },
    source: "MarionDualTrackGateway"
  };
}

module.exports = {
  buildMarionDualTrackPacket,
  summarizeDualTrackPacket,
  extractLanguageTrack,
  extractRealWorldTrack,
  extractEthicalTrack,
  extractStrategicTrack,
  buildLaneRecencyMaintenance,
  extractActiveTracksFromPacket,
  looksLikeExplicitLanguageSignal,
  mergeDualTrackConfig,
  DEFAULT_DUAL_TRACK_CONFIG,
  DUAL_TRACK_GATEWAY_VERSION
};
