"use strict";

const VERSION = "marionRouter v1.2.0 AUTOPSY-HARDENED-SOFTFAIL-CONTINUITY";
const DEBUG_TAG = "[MARION] marionRouter patch active";
try { console.log(DEBUG_TAG, VERSION); } catch (_e) {}

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

const INTERNAL_BLOCKER_PATTERNS = [
  /marion input required before reply emission/i,
  /reply emission/i,
  /bridge rejected/i,
  /authoritative_reply_missing/i,
  /packet_synthesis_reply_missing/i,
  /contract_missing/i,
  /packet_missing/i,
  /bridge_rejected/i,
  /marion_contract_invalid/i,
  /compose_marion_response_unavailable/i,
  /packet_invalid/i
];

function _isInternalBlockerText(value) {
  const text = _trim(value);
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}

function _safeEmotionResult(raw = {}) {
  const src = _safeObj(raw);
  return {
    matched: !!src.matched,
    supportFlags: _safeObj(src.supportFlags),
    matches: _safeArray(src.matches),
    primary: _safeObj(src.primary),
    primaryEmotion: _trim(src.primaryEmotion),
    intensity: _num(src.intensity, 0),
    confidence: _num(src.confidence, 0),
    blendProfile: _safeObj(src.blendProfile || src.blend_profile),
    stateDrift: _safeObj(src.stateDrift || src.state_drift)
  };
}

function _safePsychologyResult(raw = {}) {
  const src = _safeObj(raw);
  const primary = _safeObj(src.primary);
  const record = _safeObj(primary.record);
  const blocked = [
    src.reply, src.text, src.answer, src.output,
    record.reply, record.text, record.answer, record.output, record.interpretation
  ].some(_isInternalBlockerText);
  return {
    ...src,
    matched: blocked ? false : !!src.matched,
    matches: blocked ? [] : _safeArray(src.matches),
    route: _safeObj(src.route),
    primary: blocked ? { ...primary, record: { ...record, reply: '', text: '', answer: '', output: '', interpretation: '' } } : primary,
    blockedInternalEmission: blocked
  };
}

function _safeClassifiedResult(raw = {}) {
  const src = _safeObj(raw);
  return {
    ...src,
    classifications: _safeObj(src.classifications),
    domainCandidates: _safeArray(src.domainCandidates).map(_canonicalizeDomain).filter(Boolean),
    supportFlags: _safeObj(src.supportFlags)
  };
}

function _buildSoftRouteFallback(text = '', previousMemory = {}, reason = 'router_soft_fallback') {
  const prevEmotion = _safeObj(previousMemory.emotion || previousMemory.lastEmotion);
  const currentEmotion = _resolvePrimaryEmotion({});
  const blendProfile = _buildBlendProfile(currentEmotion, {});
  const stateDrift = _buildStateDrift(currentEmotion, previousMemory);
  return {
    ok: true,
    partial: true,
    primaryDomain: 'general',
    secondaryDomains: [],
    classified: { classifications: {}, domainCandidates: ['general'], supportFlags: {} },
    supportFlags: {},
    primaryEmotion: currentEmotion,
    blendProfile,
    stateDrift,
    conversationState: {},
    previousTurn: {
      emotion: {
        primaryEmotion: _lower(prevEmotion.primaryEmotion || prevEmotion.emotion || ''),
        intensity: _clamp(_safeObj(previousMemory.emotion).intensity, 0, 1)
      }
    },
    domains: {
      emotion: { matched: false, supportFlags: {}, matches: [], primary: currentEmotion, blendProfile, stateDrift },
      psychology: { matched: false, matches: [], blockedInternalEmission: false }
    },
    diagnostics: {
      domainCandidates: ['general'],
      usedPsychology: false,
      supportFlagCount: 0,
      routed: null,
      softFallback: true,
      reason: _trim(reason || 'router_soft_fallback') || 'router_soft_fallback'
    }
  };
}

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

function _resolveConversationState(input = {}, previousMemory = {}, primaryEmotion = {}) {
  const direct = _safeObj(input.conversationState);
  const prevPatch = _safeObj(_safeObj(previousMemory).memoryPatch);
  const previousState = _safeObj(previousMemory.conversationState || previousMemory.continuityState || prevPatch.conversationState);
  const lastEmotion = _safeObj(direct.lastEmotion);
  const previousLastEmotion = _safeObj(previousState.lastEmotion);
  const currentEmotion = _lower(
    lastEmotion.primaryEmotion ||
    primaryEmotion.emotion ||
    direct.currentEmotion ||
    previousState.currentEmotion ||
    "neutral"
  ) || "neutral";
  const previousEmotion = _lower(
    direct.previousEmotion ||
    lastEmotion.previousEmotion ||
    previousLastEmotion.primaryEmotion ||
    previousState.previousEmotion ||
    _safeObj(previousMemory.lastEmotion).primaryEmotion ||
    ""
  );
  const lastTopics = []
    .concat(_safeArray(direct.lastTopics))
    .concat(_safeArray(previousState.lastTopics))
    .filter(Boolean);
  const unresolvedSignals = []
    .concat(_safeArray(direct.unresolvedSignals))
    .concat(_safeArray(previousState.unresolvedSignals))
    .filter(Boolean);
  const repetitionCount = Math.max(0, _num(
    direct.repetitionCount,
    previousState.repetitionCount || previousMemory.repetitionCount || 0
  ));
  const depthLevel = Math.max(1, Math.min(6, _num(
    direct.depthLevel,
    previousState.depthLevel || previousMemory.depthLevel || (repetitionCount > 0 ? 2 : 1)
  )));
  const threadContinuation = !!(
    direct.threadContinuation ||
    previousState.threadContinuation ||
    repetitionCount > 0 ||
    unresolvedSignals.length > 0 ||
    depthLevel > 1
  );
  return {
    previousEmotion,
    currentEmotion,
    emotionTrend: _trim(direct.emotionTrend || previousState.emotionTrend || "stable") || "stable",
    lastTopics: [...new Set(lastTopics.map((x) => _trim(x)).filter(Boolean))].slice(0, 6),
    repetitionCount,
    depthLevel,
    unresolvedSignals: [...new Set(unresolvedSignals.map((x) => _trim(x)).filter(Boolean))].slice(0, 6),
    threadContinuation,
    continuityMode: _trim(direct.continuityMode || previousState.continuityMode || (threadContinuation ? "deepen" : "stabilize")) || "stabilize",
    lastEmotion: {
      primaryEmotion: currentEmotion,
      previousEmotion: previousEmotion || null,
      intensity: _clamp(primaryEmotion.intensity, 0, 1)
    }
  };
}

function routeMarion(input = {}) {
  const text = input.text || input.userText || input.userQuery || input.query || input.message || "";
  const previousMemory = _safeObj(input.previousMemory);

  try {
    const emotionRaw = typeof retrieveEmotion === "function"
      ? retrieveEmotion({
          text,
          userText: input.userText || text,
          query: input.query || input.userQuery || text,
          maxMatches: 5
        })
      : {};

    const emotion = _safeEmotionResult(emotionRaw);
    const primaryEmotion = _resolvePrimaryEmotion(emotion);
    const mergedFlags = _mergeSupportFlags(input.supportFlags, _safeObj(emotion.supportFlags));

    const classifiedRaw = typeof classifyQuery === "function"
      ? classifyQuery({
          text,
          affect: input.affect,
          supportFlags: mergedFlags,
          emotion
        })
      : {};

    const classified = _safeClassifiedResult(classifiedRaw);
    const finalSupportFlags = _mergeSupportFlags(mergedFlags, classified.supportFlags);

    let psychology = null;
    if (_safeArray(classified.domainCandidates).includes("psychology") || _shouldForcePsychology(classified, finalSupportFlags, primaryEmotion)) {
      const psychologyRaw = typeof retrievePsychology === "function"
        ? retrievePsychology({
            text,
            query: input.query || input.userQuery || text,
            userQuery: input.userQuery || text,
            supportFlags: finalSupportFlags,
            emotion: primaryEmotion,
            riskLevel: input.riskLevel || (_safeObj(classified.classifications).crisis ? "critical" : (finalSupportFlags.highDistress ? "high" : "low")),
            maxMatches: 3
          })
        : null;
      psychology = _safePsychologyResult(psychologyRaw || {});
    }

    let routed = null;
    if (domainRouter && typeof domainRouter.routeDomain === "function") {
      try {
        routed = domainRouter.routeDomain(
          { text, lane: input.requestedDomain || input.domain || "", action: input.action || "" },
          _safeObj(input.session),
          { intent: _trim(input.intent || _safeArray(classified.domainCandidates)[0] || "general"), riskTier: _safeObj(classified.classifications).crisis ? "high" : "low" },
          { maxSecondary: 3 }
        );
      } catch (_e) {
        routed = null;
      }
    }

    const primaryDomain = _choosePrimaryDomain(classified, psychology, routed);
    const conversationState = _resolveConversationState(input, previousMemory, primaryEmotion);
    const secondaryDomains = _safeArray(routed && routed.secondary).map(_canonicalizeDomain).filter((d) => d && d !== primaryDomain);
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
      conversationState,
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
        psychology: psychology || { matched: false, matches: [], blockedInternalEmission: false }
      },
      diagnostics: {
        domainCandidates: _safeArray(classified.domainCandidates),
        usedPsychology: !!(psychology && psychology.matched),
        supportFlagCount: Object.keys(finalSupportFlags).length,
        routed: routed ? { primary: _canonicalizeDomain(routed.primary), secondary: secondaryDomains } : null,
        blockedInternalEmission: !!(psychology && psychology.blockedInternalEmission),
        softFallback: false,
        continuityActive: !!conversationState.threadContinuation,
        continuityDepth: _num(conversationState.depthLevel, 1)
      }
    };
  } catch (err) {
    const fallback = _buildSoftRouteFallback(text, previousMemory, err && (err.message || err) || 'router_exception');
    fallback.diagnostics.error = _trim(err && (err.message || err) || 'router_exception');
    return fallback;
  }
}

module.exports = { VERSION, routeMarion };
