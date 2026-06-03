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

const DUAL_TRACK_GATEWAY_VERSION = "nyx.marion.dualTrackGateway/0.3";

const DEFAULT_DUAL_TRACK_CONFIG = Object.freeze({
  enabled: true,
  languageTrackEnabled: true,
  realWorldTrackEnabled: true,
  ethicalTrackEnabled: true,
  strategicTrackEnabled: true,
  maxLaneCarryAgeMs: 5 * 60 * 1000,
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

function buildDualTrackRecency(payload = {}, tracks = {}, maxAgeMs = 5 * 60 * 1000, now = Date.now()) {
  const p = safeObject(payload);
  const languageTrack = safeObject(tracks.languageTrack);
  const realWorldTrack = safeObject(tracks.realWorldTrack);
  const ethicalTrack = safeObject(tracks.ethicalTrack);
  const strategicTrack = safeObject(tracks.strategicTrack);
  const allowedAge = Math.max(1000, Number(maxAgeMs) || (5 * 60 * 1000));
  const laneTimestamps = {
    language: newestTimestamp(languageTrack.updatedAt, p.updatedAt, p.languageMeta && p.languageMeta.updatedAt, p.translationMeta && p.translationMeta.updatedAt, p.gatewayMeta && p.gatewayMeta.updatedAt),
    real_world: newestTimestamp(realWorldTrack.updatedAt, realWorldTrack.envelope && realWorldTrack.envelope.updatedAt, p.realWorldObservation && p.realWorldObservation.updatedAt),
    ethical: newestTimestamp(ethicalTrack.updatedAt, ethicalTrack.ethicalReview && ethicalTrack.ethicalReview.updatedAt),
    strategic: newestTimestamp(strategicTrack.updatedAt, strategicTrack.strategicReview && strategicTrack.strategicReview.updatedAt)
  };
  const staleTracks = [];
  const laneAgeMs = {};
  for (const lane of Object.keys(laneTimestamps)) {
    const ts = laneTimestamps[lane];
    const age = ts > 0 ? Math.max(0, now - ts) : 0;
    laneAgeMs[lane] = age;
    if (ts > 0 && age > allowedAge) staleTracks.push(lane);
  }
  return {
    enabled: true,
    maxLaneCarryAgeMs: allowedAge,
    staleTracks,
    staleCarrySuppressed: staleTracks.length > 0,
    laneTimestamps,
    laneAgeMs,
    publicReplyVisible: false,
    userFacing: false,
    noUserFacingDiagnostics: true,
    source: "MarionDualTrackGateway"
  };
}

function isFreshTrack(trackName, recency = {}) {
  return !safeObject(recency).staleTracks || safeObject(recency).staleTracks.indexOf(trackName) === -1;
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

function extractLanguageTrack(payload = {}) {
  const p = safeObject(payload);

  return {
    active: Boolean(
      safeString(p.message || p.input || p.text || p.prompt) ||
        Object.keys(safeObject(p.languageMeta)).length ||
        Object.keys(safeObject(p.lingoInput)).length ||
        Object.keys(safeObject(p.translationMeta)).length ||
        Object.keys(safeObject(p.unknownLanguageAlert)).length
    ),
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
    finalAuthority: "Marion",
    updatedAt: finiteTimestamp(p.updatedAt || safeObject(p.languageMeta).updatedAt || safeObject(p.translationMeta).updatedAt || safeObject(p.gatewayMeta).updatedAt) || 0
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
    finalAuthority: "Marion",
    updatedAt: finiteTimestamp(observation.updatedAt || envelope.updatedAt) || 0
  };
}

function extractEthicalTrack(payload = {}) {
  const p = safeObject(payload);
  const ethical = safeObject(
    p.ethicalReview ||
      p.thalon ||
      p.thalonReview ||
      p.strategyReview
  );

  return {
    active: Object.keys(ethical).length > 0,
    source: "ThalonReadinessPending",
    ethicalReview: ethical,
    advisoryOnly: true,
    finalAuthority: "Marion",
    updatedAt: finiteTimestamp(ethical.updatedAt) || 0
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
    finalAuthority: "Marion",
    updatedAt: finiteTimestamp(strategic.updatedAt) || 0
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
        reason: "dual_track_gateway_disabled",
        source: "MarionDualTrackGateway"
      },
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

  const laneRecency = buildDualTrackRecency(payload, { languageTrack, realWorldTrack, ethicalTrack, strategicTrack }, config.maxLaneCarryAgeMs);

  const activeTracks = [];
  if (languageTrack.active && isFreshTrack("language", laneRecency)) activeTracks.push("language");
  if (realWorldTrack.active && isFreshTrack("real_world", laneRecency)) activeTracks.push("real_world");
  if (ethicalTrack.active && isFreshTrack("ethical", laneRecency)) activeTracks.push("ethical");
  if (strategicTrack.active && isFreshTrack("strategic", laneRecency)) activeTracks.push("strategic");

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
      notificationReady,
      requiresHumanReview: Boolean((isFreshTrack("real_world", laneRecency) && realWorldTrack.requiresHumanReview) || (isFreshTrack("ethical", laneRecency) && ethicalTrack.requiresHumanReview) || (isFreshTrack("strategic", laneRecency) && strategicTrack.requiresHumanReview)),
      staleCarrySuppressed: laneRecency.staleCarrySuppressed,
      staleTracks: laneRecency.staleTracks,
      publicReplyVisible: false,
      userFacing: false,
      reason: activeTracks.length
        ? "dual_track_packet_created"
        : "no_active_tracks",
      source: "MarionDualTrackGateway"
    },

    userFacing: false,
    laneRecency,
    publicText: "",
    renderText: "",
    text: "",

    advisoryOnly: true,
    forceAction: false,

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
  const meta = safeObject(p.coordinationMeta);

  return {
    version: DUAL_TRACK_GATEWAY_VERSION,
    enabled: p.enabled !== false,
    activeTracks: Array.isArray(meta.activeTracks) ? meta.activeTracks : [],
    trackCount: Number(meta.trackCount || 0),
    mixedInput: meta.mixedInput === true,
    notificationReady: meta.notificationReady === true,
    requiresHumanReview: meta.requiresHumanReview === true,
    staleCarrySuppressed: meta.staleCarrySuppressed === true || safeObject(p.laneRecency).staleCarrySuppressed === true,
    staleTracks: Array.isArray(meta.staleTracks) ? meta.staleTracks : safeObject(p.laneRecency).staleTracks || [],
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
  buildDualTrackRecency,
  isFreshTrack,
  mergeDualTrackConfig,
  DEFAULT_DUAL_TRACK_CONFIG,
  DUAL_TRACK_GATEWAY_VERSION
};
