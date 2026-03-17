"use strict";

const { routeMarion } = require("./marionRouter");
const { composeMarionResponse } = require("./composeMarionResponse");

function _str(v) {
  return v == null ? "" : String(v);
}

function _trim(v) {
  return _str(v).trim();
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _mergeSupportFlags() {
  const out = {};
  for (const part of arguments) {
    Object.assign(out, _safeObj(part));
  }
  return out;
}

function _deriveAffectFromEmotion(emotionResult) {
  const primary = _safeObj(_safeObj(emotionResult).primary);
  if (!primary.emotion) return {};
  return {
    label: primary.emotion,
    valence: primary.valence || "",
    intensity: Number(primary.intensity || 0),
    confidence: Number(primary.score || 0),
    source: "emotionRetriever"
  };
}

function _buildNyxPacket(bridge) {
  const marion = _safeObj(bridge.marion);
  const routed = _safeObj(bridge.routed);
  const domains = _safeObj(routed.domains);
  const emotion = _safeObj(domains.emotion);
  const psychology = _safeObj(domains.psychology);
  const primaryEmotion = _safeObj(emotion.primary);
  const primaryPsych = _safeObj(psychology.primary);
  const primaryPsychRecord = _safeObj(primaryPsych.record);
  const source = _safeObj(marion.source);
  const responsePlan = _safeObj(marion.responsePlan);

  return {
    ok: true,
    matched: !!marion.matched,
    primaryDomain: marion.domain || routed.primaryDomain || "psychology",
    interpretation: marion.interpretation || null,
    supportMode: marion.supportMode || "clarify_and_sequence",
    routeBias: marion.routeBias || "clarify",
    riskLevel: marion.riskLevel || "low",
    supportFlags: _safeObj(marion.supportFlags),
    responsePlan,
    guidance: _safeArray(marion.guidance),
    guardrails: _safeArray(marion.guardrails),
    emotion: {
      matched: !!emotion.matched,
      primary: primaryEmotion.emotion ? {
        emotion: primaryEmotion.emotion || null,
        valence: primaryEmotion.valence || null,
        intensity: Number(primaryEmotion.intensity || 0),
        score: Number(primaryEmotion.score || 0)
      } : null
    },
    psychology: {
      matched: !!psychology.matched,
      primary: primaryPsychRecord.id ? {
        recordId: primaryPsychRecord.id || null,
        subdomain: primaryPsychRecord.subdomain || null,
        topic: primaryPsychRecord.topic || null,
        score: Number(primaryPsych.score || 0)
      } : null
    },
    source: {
      domain: source.domain || null,
      emotion: source.emotion || null,
      subdomain: source.subdomain || null,
      topic: source.topic || null,
      recordId: source.recordId || null
    },
    nyxHints: {
      deliveryTone: responsePlan.deliveryTone || "steadying",
      expressionStyle: responsePlan.expressionStyle || "plain_statement",
      followupStyle: responsePlan.followupStyle || "reflective",
      semanticFrame: responsePlan.semanticFrame || "clarity_building",
      transitionReadiness: responsePlan.transitionReadiness || "medium",
      transitionTargets: _safeArray(responsePlan.transitionTargets)
    }
  };
}

function runMarionBridge(input = {}) {
  const text = _trim(input.text || input.userText || input.query);
  const affect = _safeObj(input.affect);
  const supportFlags = _safeObj(input.supportFlags);

  const routed = routeMarion({
    text,
    userText: input.userText,
    query: input.query,
    affect,
    supportFlags,
    riskLevel: input.riskLevel
  });

  const routedDomains = _safeObj(routed.domains);
  const emotion = _safeObj(routedDomains.emotion);
  const derivedAffect = _deriveAffectFromEmotion(emotion);
  const mergedAffect = {
    ...affect,
    ...derivedAffect
  };

  const mergedSupportFlags = _mergeSupportFlags(
    supportFlags,
    _safeObj(routed.supportFlags),
    _safeObj(emotion.supportFlags)
  );

  const composed = composeMarionResponse(routed, {
    text,
    affect: mergedAffect,
    supportFlags: mergedSupportFlags
  });

  const bridge = {
    ok: true,
    text,
    marion: composed,
    routed,
    nyx: _buildNyxPacket({
      marion: composed,
      routed
    }),
    bridgeMeta: {
      version: "1.1.0",
      source: "marionBridge",
      readyForNyx: true,
      emotionLaneActive: !!emotion.matched,
      psychologyLaneActive: !!_safeObj(routedDomains.psychology).matched,
      blended: !!emotion.matched && !!_safeObj(routedDomains.psychology).matched
    }
  };

  return bridge;
}

module.exports = {
  runMarionBridge
};
