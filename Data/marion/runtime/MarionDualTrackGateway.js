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

const DUAL_TRACK_GATEWAY_VERSION = "nyx.marion.dualTrackGateway/0.1";

const DEFAULT_DUAL_TRACK_CONFIG = Object.freeze({
  enabled: true,
  languageTrackEnabled: true,
  realWorldTrackEnabled: true,
  ethicalTrackEnabled: true,
  authority: {
    finalAuthority: "Marion",
    lingoLinkAdvisoryOnly: true,
    realWorldAdvisoryOnly: true,
    ethicalAdvisoryOnly: true,
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
      p.thalon ||
      p.thalonReview ||
      p.strategyReview
  );

  return {
    active: Object.keys(ethical).length > 0,
    source: "ThalonReadinessPending",
    ethicalReview: ethical,
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

  const activeTracks = [];
  if (languageTrack.active) activeTracks.push("language");
  if (realWorldTrack.active) activeTracks.push("real_world");
  if (ethicalTrack.active) activeTracks.push("ethical");

  const notificationReady = Boolean(
    safeObject(languageTrack.gatewayMeta).notificationReady ||
      safeObject(languageTrack.unknownLanguageAlert).notificationReady ||
      safeObject(languageTrack.dormantScanner).notificationReady ||
      realWorldTrack.requiresHumanReview
  );

  return {
    version: DUAL_TRACK_GATEWAY_VERSION,
    enabled: true,

    classification,
    separation,

    languageTrack,
    realWorldTrack,
    ethicalTrack,

    coordinationMeta: {
      activeTracks,
      trackCount: activeTracks.length,
      mixedInput: activeTracks.length > 1,
      notificationReady,
      requiresHumanReview: Boolean(realWorldTrack.requiresHumanReview),
      publicReplyVisible: false,
      userFacing: false,
      reason: activeTracks.length
        ? "dual_track_packet_created"
        : "no_active_tracks",
      source: "MarionDualTrackGateway"
    },

    userFacing: false,
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
    authority: {
      finalAuthority: "Marion",
      lingoLinkAdvisoryOnly: true,
      realWorldAdvisoryOnly: true,
      ethicalAdvisoryOnly: true,
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
  mergeDualTrackConfig,
  DEFAULT_DUAL_TRACK_CONFIG,
  DUAL_TRACK_GATEWAY_VERSION
};
