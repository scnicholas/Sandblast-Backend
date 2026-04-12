"use strict";

/**
 * composeMarionResponse.js
 * Cohesive Marion composition layer.
 */

const VERSION = "composeMarionResponse v1.2.0 PIPELINE-TRACE NORMALIZED-HANDOFF";
const DEBUG_TAG = "[MARION] composeMarionResponse patch active";
try { console.log(DEBUG_TAG, VERSION); } catch (_e) {}

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, _num(v, min))); }
function _uniq(arr) { return [...new Set(_safeArray(arr).map(_trim).filter(Boolean))]; }


function _normalizeSupportFlags() {
  const merged = {};
  for (const src of arguments) {
    const obj = _safeObj(src);
    for (const [key, value] of Object.entries(obj)) {
      merged[_trim(key)] = !!value;
    }
  }
  return merged;
}

function _buildEmotionPayload(primaryEmotion = {}, emotion = {}, supportFlags = {}) {
  const primary = _safeObj(primaryEmotion);
  const blended = _safeObj(emotion);
  return {
    locked: true,
    primaryEmotion: _lower(primary.emotion || blended.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: _lower(primary.secondaryEmotion || blended.secondaryEmotion || "") || null,
    intensity: Number(_clamp(primary.intensity != null ? primary.intensity : blended.intensity, 0, 1).toFixed(3)),
    valence: Number(_clamp(primary.valence != null ? primary.valence : blended.valence, -1, 1).toFixed(3)),
    confidence: Number(_clamp(primary.confidence != null ? primary.confidence : blended.confidence != null ? blended.confidence : 0.82, 0, 1).toFixed(3)),
    supportFlags: _normalizeSupportFlags(supportFlags),
    needs: _uniq(_safeArray(blended.needs).concat(_safeArray(primary.needs))),
    cues: _uniq(_safeArray(blended.cues).concat(_safeArray(primary.cues))),
    blendProfile: _resolveBlendProfile(blended),
    stateDrift: _resolveStateDrift({}, blended)
  };
}

function _buildStrategyPayload(supportMode, modePlan, routed = {}, psychology = {}) {
  const route = _safeObj(psychology.route);
  const record = _safeObj(_safeObj(psychology.primary).record);
  const routeBias = _trim(record.routeBias || route.routeBias || routed.routeBias || "clarify") || "clarify";
  const deliveryTone = _trim(modePlan.deliveryTone || route.deliveryTone || routed.deliveryTone || "steadying") || "steadying";
  let archetype = _trim(route.archetype || record.archetype || routed.archetype || "");
  if (!archetype) {
    if (/crisis|acute|soothe|stabilize|ground/.test(supportMode)) archetype = "ground";
    else if (/affirm|channel/.test(supportMode)) archetype = "channel";
    else if (/celebrate/.test(supportMode)) archetype = "celebrate";
    else archetype = "clarify";
  }
  return {
    archetype,
    supportModeCandidate: supportMode,
    routeBias,
    deliveryTone,
    questionPressure: modePlan.shouldAskFollowup ? "medium" : "low",
    transitionReadiness: _trim(modePlan.transitionReadiness || "medium") || "medium",
    acknowledgementMode: /crisis|acute|soothe|stabilize/.test(supportMode) ? "auto" : "light",
    expressionContract: {
      questionPressure: modePlan.shouldAskFollowup ? "medium" : "low",
      transitionReadiness: _trim(modePlan.transitionReadiness || "medium") || "medium",
      acknowledgementMode: /crisis|acute|soothe|stabilize/.test(supportMode) ? "auto" : "light"
    }
  };
}

function _buildPipelineTrace(primaryDomain, supportMode, riskLevel, emotionPayload, strategyPayload, reply, followUps) {
  return {
    stage: "composeMarionResponse",
    version: VERSION,
    domain: primaryDomain,
    supportMode,
    riskLevel,
    emotion: {
      primaryEmotion: emotionPayload.primaryEmotion,
      intensity: emotionPayload.intensity,
      valence: emotionPayload.valence
    },
    strategy: {
      archetype: strategyPayload.archetype,
      routeBias: strategyPayload.routeBias,
      deliveryTone: strategyPayload.deliveryTone
    },
    replyPreview: _trim(reply).slice(0, 160),
    followUpCount: _safeArray(followUps).length,
    resolvedAt: Date.now()
  };
}

const MODE_DEFAULTS = Object.freeze({
  crisis_escalation: { semanticFrame: "immediate_safety", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "action_gate", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["stabilize", "escalate"], careSequence: ["acknowledge", "stabilize", "escalate"], adviceLevel: "minimal", shouldAskFollowup: false, shouldOfferNextStep: true },
  acute_regulation: { semanticFrame: "acute_regulation", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "ground_then_narrow", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["stabilize", "contain"], careSequence: ["acknowledge", "ground", "narrow"], adviceLevel: "minimal", shouldAskFollowup: true, shouldOfferNextStep: true },
  soothe_and_structure: { semanticFrame: "stabilization", deliveryTone: "warm_affirming", expressionStyle: "plain_statement", followupStyle: "ground_then_narrow", responseLength: "short", pacing: "steady", transitionReadiness: "low", transitionTargets: ["stabilize", "clarify"], careSequence: ["validate", "stabilize", "sequence"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  careful_nonshaming_reflection: { semanticFrame: "identity_decompression", deliveryTone: "gentle_nonintrusive", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "short", pacing: "steady", transitionReadiness: "low", transitionTargets: ["stabilize", "clarify"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: false },
  validate_and_gently_activate: { semanticFrame: "depletion_support", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["clarify", "activate"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  affirm_and_channel: { semanticFrame: "momentum_preservation", deliveryTone: "warm_affirming", expressionStyle: "plain_statement", followupStyle: "direct_answer_then_one_question", responseLength: "short", pacing: "steady", transitionReadiness: "high", transitionTargets: ["maintain", "channel"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  soft_probe_first: { semanticFrame: "guarded_attunement", deliveryTone: "gentle_nonintrusive", expressionStyle: "plain_statement", followupStyle: "soft_probe", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["validate", "clarify"], adviceLevel: "minimal", shouldAskFollowup: true, shouldOfferNextStep: false },
  clarify_and_sequence: { semanticFrame: "clarity_building", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "medium", pacing: "steady", transitionReadiness: "medium", transitionTargets: ["clarify"], adviceLevel: "medium", shouldAskFollowup: true, shouldOfferNextStep: true }
});

function _pickSupportMode(routed = {}, psychology = {}, emotion = {}, supportFlags = {}) {
  const route = _safeObj(psychology.route);
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  if (_safeObj(supportFlags).crisis) return "crisis_escalation";
  if (_safeObj(supportFlags).needsContainment && _safeObj(supportFlags).highDistress) return "acute_regulation";
  if (_safeObj(supportFlags).suppressed || _safeObj(supportFlags).guardedness) return "soft_probe_first";
  const resolved = _trim(record.supportMode || route.supportMode || routed.supportMode || "");
  if (resolved) return resolved;
  const primaryEmotion = _lower(_safeObj(emotion.primary).emotion || emotion.primaryEmotion || "");
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(primaryEmotion)) return "soothe_and_structure";
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(primaryEmotion)) return "acute_regulation";
  return "clarify_and_sequence";
}

function _resolveModePlan(mode) {
  return _safeObj(MODE_DEFAULTS[mode]) || _safeObj(MODE_DEFAULTS.clarify_and_sequence);
}

function _resolveBlendProfile(emotion = {}) {
  const primary = _safeObj(emotion.primary);
  const raw = _safeObj(emotion.blendProfile || emotion.blend_profile || {});
  const out = {};
  for (const [key, value] of Object.entries(raw.weights || raw)) {
    const k = _lower(key);
    const v = _clamp(value, 0, 1);
    if (k && v > 0) out[k] = Number(v.toFixed(3));
  }
  if (!Object.keys(out).length && _trim(primary.emotion || emotion.primaryEmotion)) {
    const p = _lower(primary.emotion || emotion.primaryEmotion);
    const s = _lower(primary.secondaryEmotion || emotion.secondaryEmotion || "");
    out[p] = Number(_clamp(primary.weight || 0.7, 0.45, 1).toFixed(3));
    if (s && s !== p) out[s] = Number((1 - out[p]).toFixed(3));
  }
  const sorted = Object.entries(out).sort((a, b) => b[1] - a[1]);
  return { weights: out, dominantAxis: sorted[0] ? sorted[0][0] : (_lower(primary.emotion || emotion.primaryEmotion) || "neutral") };
}

function _resolveStateDrift(routed = {}, emotion = {}) {
  const drift = _safeObj(routed.stateDrift || emotion.stateDrift || emotion.state_drift);
  if (Object.keys(drift).length) {
    return {
      previousEmotion: _lower(drift.previousEmotion || drift.previous_emotion || ""),
      currentEmotion: _lower(drift.currentEmotion || drift.current_emotion || ""),
      trend: _lower(drift.trend || "stable") || "stable",
      stability: Number(_clamp(drift.stability, 0, 1).toFixed(3))
    };
  }
  const primary = _safeObj(emotion.primary);
  return {
    previousEmotion: _lower(_safeObj(_safeObj(routed.previousTurn).emotion).primaryEmotion || ""),
    currentEmotion: _lower(primary.emotion || emotion.primaryEmotion || "neutral"),
    trend: "stable",
    stability: 0.75
  };
}

function _resolveRiskLevel(supportFlags = {}, psychology = {}, primaryEmotion = {}) {
  if (_safeObj(supportFlags).crisis) return "critical";
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const route = _safeObj(psychology.route);
  const declared = _lower(record.riskLevel || route.riskLevel || psychology.riskLevel || "");
  if (declared) return declared;
  return _clamp(primaryEmotion.intensity, 0, 1) >= 0.82 || _safeObj(supportFlags).highDistress ? "high" : "low";
}

function _buildGuidance(modePlan, psychology = {}, routed = {}, supportFlags = {}) {
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  return _uniq([])
    .concat(_safeArray(record.responseGuidance))
    .concat(_safeArray(supportProfile.responseShape))
    .concat(_safeArray(routed.guidance))
    .concat(_safeObj(supportFlags).suppressed ? ["Do not overinterpret guarded language."] : [])
    .concat(_safeObj(supportFlags).needsContainment ? ["Keep the next move singular and bounded."] : [])
    .concat(modePlan.shouldAskFollowup ? ["Ask at most one follow-up unless the user clearly opens the door further."] : [])
    .concat(["Keep Marion as the sole interpreter and let Nyx express the resolved state only."]);
}

function _buildGuardrails(modePlan, psychology = {}, routed = {}, supportFlags = {}) {
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  return _uniq([])
    .concat(_safeArray(record.contraindications))
    .concat(_safeArray(supportProfile.constraints))
    .concat(_safeArray(routed.guardrails))
    .concat(_safeObj(supportFlags).suppressed ? ["Do not force disclosure."] : [])
    .concat(_safeObj(supportFlags).crisis ? ["Stop normal flow and prioritize safety language."] : [])
    .concat(["Do not allow bridge-level improvisation to override the response contract."]);
}

function _makeSupportReply(primaryEmotion, supportMode, intensity) {
  const emo = _lower(primaryEmotion || "neutral");
  if (supportMode === "crisis_escalation") {
    return "I am here with you. Your safety comes first right now. If you are in immediate danger or might act on this, call emergency services or a crisis line right now.";
  }
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
    return intensity >= 0.8
      ? "I hear how heavy this feels. You do not have to hold all of it at once. What feels heaviest right now?"
      : "I hear the weight in that. You do not have to carry it alone in this moment. What has been sitting on you the most?";
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
    return "I am with you. Let us slow this down and take the most urgent piece first. What feels hardest right now?";
  }
  if (["anger", "frustration"].includes(emo)) {
    return "I can feel the pressure in that. Let us keep it steady and look at the part that needs attention first.";
  }
  return "I am with you. Tell me what feels most important right now.";
}

function _buildFollowUps(modePlan, primaryEmotion, supportFlags = {}) {
  if (supportFlags.crisis) return [];
  if (!modePlan.shouldAskFollowup) return [];
  const emo = _lower(primaryEmotion || "neutral");
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
    return ["What has been sitting on you the most?"];
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
    return ["What feels hardest right now?"];
  }
  return ["What feels most important right now?"];
}

function composeMarionResponse(routed = {}, input = {}) {
  const primaryDomain = _trim(routed.primaryDomain || routed.domain || input.requestedDomain || input.domain || "general") || "general";
  const domains = _safeObj(routed.domains);
  const psychology = _safeObj(domains.psychology || routed.psychology);
  const emotion = _safeObj(domains.emotion || routed.emotion);
  const classified = _safeObj(routed.classified);
  const supportFlags = _normalizeSupportFlags(
    routed.supportFlags,
    emotion.supportFlags,
    _safeObj(_safeObj(_safeObj(psychology.primary).record).supportFlags)
  );

  const primaryEmotion = _safeObj(emotion.primary || emotion);
  const normalizedPrimaryEmotion = _trim(primaryEmotion.emotion || emotion.primaryEmotion || "neutral") || "neutral";
  const supportMode = _pickSupportMode(routed, psychology, emotion, supportFlags) || "clarify_and_sequence";
  const modePlan = _resolveModePlan(supportMode);
  const blendProfile = _resolveBlendProfile(emotion);
  const stateDrift = _resolveStateDrift(routed, emotion);
  const riskLevel = _resolveRiskLevel(supportFlags, psychology, primaryEmotion);
  const emotionPayload = _buildEmotionPayload(primaryEmotion, emotion, supportFlags);

  const responsePlan = {
    semanticFrame: modePlan.semanticFrame,
    deliveryTone: modePlan.deliveryTone,
    expressionStyle: modePlan.expressionStyle,
    followupStyle: modePlan.followupStyle,
    responseLength: modePlan.responseLength,
    pacing: modePlan.pacing,
    transitionReadiness: modePlan.transitionReadiness,
    transitionTargets: modePlan.transitionTargets,
    careSequence: modePlan.careSequence,
    adviceLevel: modePlan.adviceLevel
  };

  const sourcePrimary = _safeObj(psychology.primary);
  const record = _safeObj(sourcePrimary.record);
  const interpretation =
    _trim(record.interpretation) ||
    _trim(record.summary) ||
    _trim(routed.interpretation) ||
    (_trim(normalizedPrimaryEmotion) ? `Resolved emotional posture: ${normalizedPrimaryEmotion}.` : "Resolved posture held.");

  const reply =
    _trim(_safeObj(input).assistantDraft) ||
    _trim(_safeObj(input).reply) ||
    _trim(_safeObj(routed).reply) ||
    _makeSupportReply(normalizedPrimaryEmotion, supportMode, _clamp(primaryEmotion.intensity != null ? primaryEmotion.intensity : emotion.intensity, 0, 1));
  const followUps = _uniq(_buildFollowUps(modePlan, normalizedPrimaryEmotion, supportFlags));
  const strategy = _buildStrategyPayload(supportMode, modePlan, routed, psychology);
  const pipelineTrace = _buildPipelineTrace(primaryDomain, supportMode, riskLevel, emotionPayload, strategy, reply, followUps);

  try {
    console.log("[MARION] composeMarionResponse resolve", {
      domain: primaryDomain,
      emotion: normalizedPrimaryEmotion,
      supportMode,
      riskLevel,
      replyPreview: _trim(reply).slice(0, 120),
      forcedEmotionalExecution: true
    });
  } catch (_e) {}

  return {
    ok: true,
    matched: !!(psychology.matched || emotion.matched || _safeArray(sourcePrimary.matches).length),
    domain: primaryDomain,
    interpretation,
    reply,
    output: reply,
    followUps,
    supportMode,
    routeBias: _trim(record.routeBias || _safeObj(psychology.route).routeBias || routed.routeBias || "clarify") || "clarify",
    riskLevel,
    supportFlags,
    mode: modePlan.semanticFrame,
    intent: _trim(routed.intent || _safeObj(routed.classified).intent || _safeObj(input).intent || "general").toLowerCase() || "general",
    emotion: emotionPayload,
    strategy,
    responsePlan,
    blendProfile,
    stateDrift,
    guidance: _buildGuidance(modePlan, psychology, routed, supportFlags),
    guardrails: _buildGuardrails(modePlan, psychology, routed, supportFlags),
    nyxDirective: {
      tonePosture: modePlan.deliveryTone,
      pacing: modePlan.pacing,
      responseLength: modePlan.responseLength,
      followupStyle: modePlan.followupStyle,
      askAtMost: modePlan.shouldAskFollowup ? 1 : 0,
      shouldOfferNextStep: !!modePlan.shouldOfferNextStep,
      shouldMirrorIntensity: false,
      expressiveRole: "express_resolved_state_only"
    },
    source: {
      domain: primaryDomain,
      subdomain: _trim(record.subdomain) || null,
      topic: _trim(record.topic) || null,
      recordId: _trim(record.id) || null,
      routeRuleId: _trim(_safeObj(psychology.route).ruleId) || null,
      emotion: normalizedPrimaryEmotion || null,
      emotionIntensity: _clamp(primaryEmotion.intensity != null ? primaryEmotion.intensity : emotion.intensity, 0, 1),
      matchScore: _num(sourcePrimary.score, 0)
    },
    diagnostics: {
      classifier: classified.classifications || {},
      psychologyMatched: !!psychology.matched,
      emotionMatched: !!emotion.matched,
      supportFlagCount: Object.keys(_safeObj(supportFlags)).length,
      forcedEmotionalExecution: true,
      responsePlanResolved: !!Object.keys(responsePlan).length,
      handoffNormalized: true,
      replyResolvedFrom: _trim(_safeObj(input).assistantDraft) ? "assistantDraft" : (_trim(_safeObj(input).reply) ? "input.reply" : (_trim(_safeObj(routed).reply) ? "routed.reply" : "support_fallback"))
    },
    pipelineTrace,
    synthesis: {
      reply,
      followUps,
      supportMode,
      responsePlan,
      nyxDirective: {
        tonePosture: modePlan.deliveryTone,
        pacing: modePlan.pacing,
        responseLength: modePlan.responseLength,
        followupStyle: modePlan.followupStyle,
        askAtMost: modePlan.shouldAskFollowup ? 1 : 0,
        shouldOfferNextStep: !!modePlan.shouldOfferNextStep,
        shouldMirrorIntensity: false,
        expressiveRole: "express_resolved_state_only"
      },
      emotion: emotionPayload,
      strategy
    },
    matches: _safeArray(psychology.matches).map((m) => {
      const rec = _safeObj(_safeObj(m).record);
      return { recordId: _trim(rec.id) || null, subdomain: _trim(rec.subdomain) || null, topic: _trim(rec.topic) || null, score: _num(_safeObj(m).score, 0) };
    })
  };
}

module.exports = { composeMarionResponse };
