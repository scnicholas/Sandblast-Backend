"use strict";

const { classifyQuery } = require("./queryClassifier");
const { retrieveEmotion } = require("./emotionRetriever");
const { retrievePsychology } = require("./psychologyRetriever");
let domainRouter = null;
try { domainRouter = require("./domainRouter"); } catch (_e) { domainRouter = null; }

function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, _num(v, min))); }
function _mergeSupportFlags(a, b, c) { return { ..._safeObj(a), ..._safeObj(b), ..._safeObj(c) }; }

function _canonicalizeDomain(value) {
  const fn = domainRouter && typeof domainRouter.canonicalizeDomain === "function"
    ? domainRouter.canonicalizeDomain
    : null;
  const canonical = fn ? fn(value, "core") : (value || "core");
  const alias = {
    core: "general",
    fin: "finance",
    en: "english",
    cyber: "cybersecurity",
    psychology: "psychology",
    psych: "psychology",
    strat: "strategy",
    mkt: "marketing",
    strategy: "strategy",
    cybersecurity: "cybersecurity",
    legal: "law",
    law: "law",
    english: "english",
    finance: "finance"
  };
  return alias[canonical] || canonical || "general";
}

function _choosePrimaryDomain(classified, psychology, routed) {
  const classifications = _safeObj(classified.classifications);
  const candidates = _safeArray(classified.domainCandidates);
  if (classifications.crisis && psychology && psychology.matched) return "psychology";
  if (psychology && psychology.matched) return "psychology";
  if (routed && routed.primary) return _canonicalizeDomain(routed.primary);
  return _canonicalizeDomain(candidates[0] || "general");
}

function _resolvePrimaryEmotion(emotion = {}) {
  const primary = _safeObj(emotion.primary);
  return {
    emotion: _lower(primary.emotion || emotion.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: _lower(primary.secondaryEmotion || primary.secondary || emotion.secondaryEmotion || ""),
    intensity: Number(_clamp(primary.intensity || emotion.intensity, 0, 1).toFixed(3)),
    confidence: Number(_clamp(primary.confidence || emotion.confidence, 0, 1).toFixed(3)),
    valence: primary.valence != null ? primary.valence : null
  };
}

function _buildBlendProfile(primaryEmotion = {}, emotion = {}) {
  const explicit = _safeObj(emotion.blendProfile || emotion.blend_profile);
  const weights = {};
  for (const [k, v] of Object.entries(explicit)) {
    const key = _lower(k);
    const value = Number(_clamp(v, 0, 1).toFixed(3));
    if (key && value > 0) weights[key] = value;
  }
  if (!Object.keys(weights).length) {
    const p = _lower(primaryEmotion.emotion || "neutral");
    const s = _lower(primaryEmotion.secondaryEmotion || "");
    const pWeight = primaryEmotion.intensity >= 0.75 ? 0.8 : 0.7;
    weights[p] = pWeight;
    if (s && s !== p) weights[s] = Number((1 - pWeight).toFixed(3));
  }
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  return {
    weights,
    dominantAxis: sorted[0] ? sorted[0][0] : _lower(primaryEmotion.emotion || "neutral")
  };
}

function _shouldForcePsychology(classified = {}, finalSupportFlags = {}, primaryEmotion = {}) {
  const flags = _safeObj(finalSupportFlags);
  const classes = _safeObj(_safeObj(classified).classifications);
  const emo = _lower(primaryEmotion.emotion || "");
  if (classes.crisis || classes.support || classes.emotional) return true;
  if (flags.crisis || flags.highDistress || flags.needsContainment || flags.needsStabilization) return true;
  if (["sadness", "sad", "depressed", "loneliness", "grief", "fear", "panic", "anxiety", "overwhelm", "overwhelmed", "anger", "frustration"].includes(emo)) return true;
  return false;
}

function _buildStateDrift(primaryEmotion = {}, previousMemory = {}) {
  const prev = _safeObj(previousMemory.emotion || previousMemory.lastEmotion);
  const previousEmotion = _lower(prev.primaryEmotion || prev.emotion || "");
  const previousIntensity = _clamp(prev.intensity, 0, 1);
  const currentEmotion = _lower(primaryEmotion.emotion || "neutral");
  const currentIntensity = _clamp(primaryEmotion.intensity, 0, 1);

  let trend = "stable";
  if (previousEmotion && previousEmotion !== currentEmotion) trend = "shifting";
  if (currentIntensity - previousIntensity >= 0.18) trend = "escalating";
  if (previousIntensity - currentIntensity >= 0.18) trend = "deescalating";

  return {
    previousEmotion,
    currentEmotion,
    trend,
    stability: Number((1 - Math.abs(currentIntensity - previousIntensity)).toFixed(3))
  };
}

function routeMarion(input = {}) {
  const text = input.text || input.userText || input.userQuery || input.query || input.message || "";
  const previousMemory = _safeObj(input.previousMemory);

  const emotion = retrieveEmotion({
    text,
    userText: input.userText || text,
    query: input.query || input.userQuery || text,
    maxMatches: 5
  }) || { matched: false, supportFlags: {}, matches: [] };

  const primaryEmotion = _resolvePrimaryEmotion(emotion);
  const mergedFlags = _mergeSupportFlags(input.supportFlags, _safeObj(emotion.supportFlags));
  const classified = classifyQuery({
    text,
    affect: input.affect,
    supportFlags: mergedFlags,
    emotion
  });

  const finalSupportFlags = _mergeSupportFlags(mergedFlags, classified.supportFlags);
  let psychology = null;
  if (_safeArray(classified.domainCandidates).includes("psychology") || _shouldForcePsychology(classified, finalSupportFlags, primaryEmotion)) {
    psychology = retrievePsychology({
      text,
      query: input.query || input.userQuery || text,
      userQuery: input.userQuery || text,
      supportFlags: finalSupportFlags,
      emotion: primaryEmotion,
      riskLevel: input.riskLevel || (_safeObj(classified.classifications).crisis ? "critical" : (finalSupportFlags.highDistress ? "high" : "low")),
      maxMatches: 3
    });
  }

  let routed = null;
  if (domainRouter && typeof domainRouter.routeDomain === "function") {
    routed = domainRouter.routeDomain(
      { text, lane: input.requestedDomain || input.domain || "", action: input.action || "" },
      _safeObj(input.session),
      { intent: _trim(input.intent || _safeArray(classified.domainCandidates)[0] || "general"), riskTier: _safeObj(classified.classifications).crisis ? "high" : "low" },
      { maxSecondary: 3 }
    );
  }

  const primaryDomain = _choosePrimaryDomain(classified, psychology, routed);
  const secondaryDomains = _safeArray(routed && routed.secondary).map(_canonicalizeDomain).filter((d) => d !== primaryDomain);
  const blendProfile = _buildBlendProfile(primaryEmotion, emotion);
  const stateDrift = _buildStateDrift(primaryEmotion, previousMemory);

  return {
    ok: true,
    primaryDomain,
    secondaryDomains,
    classified,
    supportFlags: finalSupportFlags,
    primaryEmotion,
    blendProfile,
    stateDrift,
    conversationState: _safeObj(input.conversationState),
    previousTurn: {
      emotion: {
        primaryEmotion: _lower(_safeObj(previousMemory.emotion).primaryEmotion || _safeObj(previousMemory.emotion).emotion || ""),
        intensity: _clamp(_safeObj(previousMemory.emotion).intensity, 0, 1)
      }
    },
    domains: {
      emotion: {
        ..._safeObj(emotion),
        primary: primaryEmotion,
        blendProfile,
        stateDrift,
        supportFlags: _mergeSupportFlags(_safeObj(emotion.supportFlags), finalSupportFlags)
      },
      psychology: psychology || { matched: false, matches: [] }
    },
    diagnostics: {
      domainCandidates: _safeArray(classified.domainCandidates),
      usedPsychology: !!(psychology && psychology.matched),
      supportFlagCount: Object.keys(finalSupportFlags).length,
      routed: routed ? { primary: _canonicalizeDomain(routed.primary), secondary: secondaryDomains } : null
    }
  };
}

module.exports = { routeMarion };
