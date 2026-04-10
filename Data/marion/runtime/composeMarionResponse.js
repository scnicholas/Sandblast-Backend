"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, _num(v, min))); }
function _uniq(arr) { return [...new Set(_safeArray(arr).map(_trim).filter(Boolean))]; }

const MODE_DEFAULTS = Object.freeze({
  crisis_escalation: { semanticFrame: "immediate_safety", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "action_gate", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["stabilize", "escalate"], careSequence: ["acknowledge", "stabilize", "escalate"], adviceLevel: "minimal", shouldAskFollowup: false, shouldOfferNextStep: true },
  acute_regulation: { semanticFrame: "acute_regulation", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "ground_then_narrow", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["stabilize", "contain"], careSequence: ["acknowledge", "ground", "narrow"], adviceLevel: "minimal", shouldAskFollowup: true, shouldOfferNextStep: true },
  soothe_and_structure: { semanticFrame: "stabilization", deliveryTone: "warm_affirming", expressionStyle: "plain_statement", followupStyle: "ground_then_narrow", responseLength: "short", pacing: "steady", transitionReadiness: "low", transitionTargets: ["stabilize", "clarify"], careSequence: ["validate", "stabilize", "sequence"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  careful_nonshaming_reflection: { semanticFrame: "identity_decompression", deliveryTone: "gentle_nonintrusive", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "short", pacing: "steady", transitionReadiness: "low", transitionTargets: ["stabilize", "clarify"], careSequence: ["validate", "de-shame", "reflect"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: false },
  validate_and_gently_activate: { semanticFrame: "depletion_support", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["clarify", "activate"], careSequence: ["validate", "soft_probe", "activate"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  affirm_and_channel: { semanticFrame: "momentum_preservation", deliveryTone: "warm_affirming", expressionStyle: "plain_statement", followupStyle: "direct_answer_then_one_question", responseLength: "short", pacing: "steady", transitionReadiness: "high", transitionTargets: ["maintain", "channel"], careSequence: ["affirm", "anchor", "channel"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  soft_probe_first: { semanticFrame: "guarded_attunement", deliveryTone: "gentle_nonintrusive", expressionStyle: "plain_statement", followupStyle: "soft_probe", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["validate", "clarify"], careSequence: ["acknowledge", "soft_probe", "hold_open"], adviceLevel: "minimal", shouldAskFollowup: true, shouldOfferNextStep: false },
  clarify_and_sequence: { semanticFrame: "clarity_building", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "medium", pacing: "steady", transitionReadiness: "medium", transitionTargets: ["clarify"], careSequence: ["clarify", "sequence"], adviceLevel: "medium", shouldAskFollowup: true, shouldOfferNextStep: true }
});

function _pickSupportMode(routed = {}, psychology = {}, emotion = {}, supportFlags = {}) {
  const route = _safeObj(psychology.route);
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  if (_safeObj(supportFlags).crisis) return "crisis_escalation";
  if (_safeObj(supportFlags).needsContainment && _safeObj(supportFlags).highDistress) return "acute_regulation";
  if (_safeObj(supportFlags).suppressed || _safeObj(supportFlags).guardedness) return "soft_probe_first";
  if (_safeObj(supportFlags).needsStabilization) return "soothe_and_structure";
  return _trim(record.supportMode || route.supportMode || routed.supportMode || "");
}
function _resolveModePlan(mode) { return _safeObj(MODE_DEFAULTS[mode]) || _safeObj(MODE_DEFAULTS.clarify_and_sequence); }
function _resolveBlendProfile(emotion = {}) {
  const primary = _safeObj(emotion.primary);
  const raw = _safeObj(emotion.blendProfile || emotion.blend_profile || {});
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = _lower(key);
    const v = _clamp(value, 0, 1);
    if (k && v > 0) out[k] = Number(v.toFixed(3));
  }
  if (!Object.keys(out).length) {
    const p = _lower(primary.emotion || emotion.primaryEmotion || "neutral") || "neutral";
    const s = _lower(primary.secondaryEmotion || emotion.secondaryEmotion || "");
    out[p] = Number(_clamp(primary.weight || primary.intensity || emotion.intensity || 0.7, 0.45, 1).toFixed(3));
    if (s && s !== p) out[s] = Number((1 - out[p]).toFixed(3));
  }
  const sorted = Object.entries(out).sort((a, b) => b[1] - a[1]);
  return { weights: out, dominantAxis: sorted[0] ? sorted[0][0] : "neutral" };
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
  const previous = _safeObj(_safeObj(routed.previousTurn).emotion);
  const currentEmotion = _lower(primary.emotion || emotion.primaryEmotion || routed.primaryEmotion || "neutral");
  const previousEmotion = _lower(previous.primaryEmotion || previous.emotion || "");
  const intensity = _clamp(primary.intensity != null ? primary.intensity : emotion.intensity, 0, 1);
  const previousIntensity = _clamp(previous.intensity, intensity, intensity);
  let trend = "stable";
  if (previousEmotion && previousEmotion !== currentEmotion) trend = "shifting";
  if (intensity - previousIntensity >= 0.18) trend = "escalating";
  if (previousIntensity - intensity >= 0.18) trend = "deescalating";
  return { previousEmotion, currentEmotion, trend, stability: Number((1 - Math.abs(intensity - previousIntensity)).toFixed(3)) };
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
  return _uniq([]
    .concat(_safeArray(record.responseGuidance))
    .concat(_safeArray(supportProfile.responseShape))
    .concat(_safeArray(routed.guidance))
    .concat(_safeObj(supportFlags).suppressed ? ["Do not overinterpret guarded language."] : [])
    .concat(_safeObj(supportFlags).needsContainment ? ["Keep the next move singular and bounded."] : [])
    .concat(modePlan.shouldAskFollowup ? ["Ask at most one follow-up unless the user clearly opens the door further."] : [])
    .concat(["Keep Marion as the sole interpreter and let Nyx express the resolved state only."]));
}
function _buildGuardrails(modePlan, psychology = {}, routed = {}, supportFlags = {}) {
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  return _uniq([]
    .concat(_safeArray(record.contraindications))
    .concat(_safeArray(supportProfile.constraints))
    .concat(_safeArray(routed.guardrails))
    .concat(_safeObj(supportFlags).suppressed ? ["Do not force disclosure."] : [])
    .concat(_safeObj(supportFlags).crisis ? ["Stop normal flow and prioritize safety language."] : [])
    .concat(["Do not allow bridge-level improvisation to override the response contract."]));
}

function composeMarionResponse(routed = {}, input = {}) {
  const primaryDomain = _trim(routed.primaryDomain || routed.domain || input.requestedDomain || input.domain || "general") || "general";
  const domains = _safeObj(routed.domains);
  const psychology = _safeObj(domains.psychology || routed.psychology);
  const emotion = _safeObj(domains.emotion || routed.emotion);
  const classified = _safeObj(routed.classified);
  const supportFlags = {
    ..._safeObj(routed.supportFlags),
    ..._safeObj(emotion.supportFlags),
    ..._safeObj(_safeObj(_safeObj(psychology.primary).record).supportFlags)
  };

  const primaryEmotion = _safeObj(emotion.primary || emotion);
  const supportMode = _pickSupportMode(routed, psychology, emotion, supportFlags) || "clarify_and_sequence";
  const modePlan = _resolveModePlan(supportMode);
  const blendProfile = _resolveBlendProfile(emotion);
  const stateDrift = _resolveStateDrift(routed, emotion);
  const riskLevel = _resolveRiskLevel(supportFlags, psychology, primaryEmotion);

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
    (_trim(primaryEmotion.emotion || emotion.primaryEmotion) ? `Resolved emotional posture: ${_trim(primaryEmotion.emotion || emotion.primaryEmotion)}.` : "Resolved posture held.");

  return {
    ok: true,
    matched: !!(psychology.matched || emotion.matched || _safeArray(sourcePrimary.matches).length),
    domain: primaryDomain,
    interpretation,
    supportMode,
    routeBias: _trim(record.routeBias || _safeObj(psychology.route).routeBias || routed.routeBias || "clarify") || "clarify",
    riskLevel,
    supportFlags,
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
      emotion: _trim(primaryEmotion.emotion || emotion.primaryEmotion) || null,
      emotionIntensity: _clamp(primaryEmotion.intensity != null ? primaryEmotion.intensity : emotion.intensity, 0, 1),
      matchScore: _num(sourcePrimary.score, 0)
    },
    diagnostics: {
      classifier: classified.classifications || {},
      psychologyMatched: !!psychology.matched,
      emotionMatched: !!emotion.matched,
      supportFlagCount: Object.keys(_safeObj(supportFlags)).length
    },
    matches: _safeArray(psychology.matches).map((m) => {
      const rec = _safeObj(_safeObj(m).record);
      return { recordId: _trim(rec.id) || null, subdomain: _trim(rec.subdomain) || null, topic: _trim(rec.topic) || null, score: _num(_safeObj(m).score, 0) };
    })
  };
}

module.exports = { composeMarionResponse };
