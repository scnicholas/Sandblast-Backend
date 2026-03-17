// runtime/composeMarionResponse.js
"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _uniq(arr) { return [...new Set(_safeArray(arr).map(_trim).filter(Boolean))]; }

function _emotionFallbackPlan(primaryEmotion = {}) {
  const emotion = _lower(primaryEmotion.emotion);
  const valence = _lower(primaryEmotion.valence);
  const intensityRaw = Number(primaryEmotion.intensity || 0);
  const intensity = intensityRaw > 1 ? Math.max(0, Math.min(1, intensityRaw / 10)) : Math.max(0, Math.min(1, intensityRaw));

  let semanticFrame = "emotional_attunement";
  let deliveryTone = "steadying";
  let followupStyle = "reflective";
  let transitionReadiness = "medium";
  let transitionTargets = ["clarify"];
  let supportMode = "clarify_and_sequence";
  let routeBias = "clarify";
  let guidance = [
    "Reflect the user’s emotional state clearly.",
    "Keep the language human and natural.",
    "Avoid repetitive support-shell phrasing."
  ];
  let guardrails = [];

  if (["panic", "fear", "overwhelm", "distress", "grief", "shame", "rage"].includes(emotion) || intensity >= 0.7) {
    semanticFrame = "stabilization";
    deliveryTone = "warm_affirming";
    followupStyle = "ground_then_narrow";
    transitionReadiness = "low";
    transitionTargets = ["stabilize", "contain"];
    supportMode = "soothe_and_structure";
    routeBias = "stabilize";
    guidance = [
      "Reduce urgency before deeper analysis.",
      "Use short, grounding language.",
      "Offer one immediate next step only."
    ];
    guardrails = ["Do not over-question.", "Do not mirror panic intensity."];
  } else if (["joy", "relief", "hope", "confidence", "gratitude", "pride", "calm"].includes(emotion) || valence === "positive") {
    semanticFrame = "momentum_preservation";
    deliveryTone = "warm_affirming";
    followupStyle = "direct_answer_then_one_question";
    transitionReadiness = "high";
    transitionTargets = ["channel", "maintain"];
    supportMode = "affirm_and_channel";
    routeBias = "deepen_then_channel";
    guidance = [
      "Affirm the positive shift naturally.",
      "Preserve momentum without sounding mechanical.",
      "Offer one constructive next step."
    ];
    guardrails = [
      "Do not fall back to generic detection language.",
      "Do not flatten positive affect into a bland support template."
    ];
  }

  return {
    interpretation: emotion ? `Detected emotional signal: ${emotion}.` : null,
    supportMode,
    routeBias,
    riskLevel: intensity >= 0.8 ? "high" : "low",
    responsePlan: {
      semanticFrame,
      deliveryTone,
      expressionStyle: "plain_statement",
      followupStyle,
      transitionReadiness,
      transitionTargets
    },
    guidance,
    guardrails
  };
}

function _buildRuntimeFallback(input = {}, routed = {}) {
  const query = _trim(input.userQuery || input.query || input.text);
  const requestedDomain = _trim(input.requestedDomain || input.domain) || "general";
  const supportFlags = _safeObj(routed.supportFlags);

  return {
    ok: true,
    matched: false,
    domain: requestedDomain,
    interpretation: query ? `No high-confidence structured match was found for: ${query}` : null,
    supportMode: supportFlags.needsStabilization ? "soothe_and_structure" : "clarify_and_sequence",
    routeBias: supportFlags.needsStabilization ? "stabilize" : "clarify",
    riskLevel: supportFlags.crisis ? "critical" : (supportFlags.highDistress ? "high" : "low"),
    supportFlags,
    responsePlan: {
      semanticFrame: supportFlags.needsStabilization ? "stabilization" : "clarity_building",
      deliveryTone: supportFlags.needsStabilization ? "warm_affirming" : "steadying",
      expressionStyle: "plain_statement",
      followupStyle: supportFlags.needsClarification ? "direct_answer_then_one_question" : "reflective",
      transitionReadiness: supportFlags.needsStabilization ? "low" : "medium",
      transitionTargets: supportFlags.needsStabilization ? ["stabilize", "contain"] : ["clarify"]
    },
    guidance: [
      "Keep the answer bounded to the strongest available signal.",
      "Avoid template repetition.",
      "Preserve continuity even when structured matching is thin."
    ],
    guardrails: [
      "Do not invent unsupported interpretation.",
      "Do not let fallback language become repetitive."
    ],
    source: {
      domain: requestedDomain,
      matched: false
    }
  };
}

function composeMarionResponse(routed = {}, input = {}) {
  const primaryDomain = _trim(routed.primaryDomain) || "general";
  const domains = _safeObj(routed.domains);
  const psychology = _safeObj(domains.psychology);
  const emotion = _safeObj(domains.emotion);
  const classified = _safeObj(routed.classified);

  if (primaryDomain === "emotion" && emotion.matched) {
    const primaryEmotion = _safeObj(emotion.primary);
    const fallback = _emotionFallbackPlan(primaryEmotion);
    return {
      ok: true,
      matched: true,
      domain: "emotion",
      interpretation: fallback.interpretation,
      supportMode: fallback.supportMode,
      routeBias: fallback.routeBias,
      riskLevel: fallback.riskLevel,
      supportFlags: emotion.supportFlags || routed.supportFlags || {},
      responsePlan: fallback.responsePlan,
      guidance: fallback.guidance,
      guardrails: fallback.guardrails,
      source: {
        domain: "emotion",
        emotion: primaryEmotion.emotion || null,
        valence: primaryEmotion.valence || null,
        intensity: primaryEmotion.intensity || 0,
        matchScore: primaryEmotion.score || 0,
        reasons: primaryEmotion.reasons || []
      },
      matches: _safeArray(emotion.matches).map((m) => ({
        emotion: m.emotion || null,
        valence: m.valence || null,
        intensity: m.intensity || 0,
        score: m.score || 0
      }))
    };
  }

  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  const route = _safeObj(psychology.route);

  if (!psychology.matched || !record.id) {
    const primaryEmotion = _safeObj(emotion.primary);
    const fallback = emotion.matched ? _emotionFallbackPlan(primaryEmotion) : null;
    const runtimeFallback = fallback || _buildRuntimeFallback(input, routed);

    return {
      ok: true,
      matched: !!fallback,
      domain: primaryDomain || runtimeFallback.domain,
      interpretation: runtimeFallback.interpretation,
      supportMode: runtimeFallback.supportMode,
      routeBias: runtimeFallback.routeBias,
      riskLevel: runtimeFallback.riskLevel,
      supportFlags: emotion.supportFlags || routed.supportFlags || {},
      responsePlan: runtimeFallback.responsePlan,
      guidance: runtimeFallback.guidance,
      guardrails: runtimeFallback.guardrails,
      source: {
        domain: runtimeFallback.source.domain,
        matched: runtimeFallback.source.matched
      }
    };
  }

  const toneProfile = _safeObj(record.toneProfile);
  const responsePlan = {
    semanticFrame: toneProfile.semanticFrame || supportProfile.semanticFrame || "clarity_building",
    deliveryTone: toneProfile.deliveryTone || supportProfile.deliveryTone || "steadying",
    expressionStyle: toneProfile.expressionStyle || supportProfile.expressionStyle || "plain_statement",
    followupStyle: toneProfile.followupStyle || supportProfile.followupStyle || "reflective",
    transitionReadiness: toneProfile.transitionReadiness || supportProfile.transitionReadiness || "medium",
    transitionTargets: _uniq(toneProfile.transitionTargets || supportProfile.transitionTargets || [])
  };

  const guidance = _uniq(
    []
      .concat(_safeArray(record.responseGuidance))
      .concat(_safeArray(supportProfile.responseShape))
      .concat(["Keep continuity with the active user thread."])
  );

  const guardrails = _uniq(
    []
      .concat(_safeArray(record.contraindications))
      .concat(_safeArray(supportProfile.constraints))
      .concat(["Do not allow structured support language to become repetitive."])
  );

  const emotionPrimary = _safeObj(emotion.primary);

  return {
    ok: true,
    matched: true,
    domain: primaryDomain,
    interpretation: record.interpretation || record.summary || null,
    supportMode: record.supportMode || route.supportMode || "clarify_and_sequence",
    routeBias: record.routeBias || route.routeBias || "clarify",
    riskLevel: record.riskLevel || (_safeObj(classified.classifications).crisis ? "critical" : "low"),
    supportFlags: record.supportFlags || emotion.supportFlags || routed.supportFlags || {},
    responsePlan,
    guidance,
    guardrails,
    source: {
      domain: primaryDomain,
      subdomain: record.subdomain || null,
      topic: record.topic || null,
      recordId: record.id || null,
      routeRuleId: route.ruleId || null,
      matchScore: primary.score || 0,
      reasons: primary.reasons || [],
      emotion: emotionPrimary.emotion || null,
      emotionValence: emotionPrimary.valence || null,
      emotionIntensity: emotionPrimary.intensity || 0
    },
    matches: _safeArray(psychology.matches).map((m) => ({
      recordId: _safeObj(m.record).id || null,
      subdomain: _safeObj(m.record).subdomain || null,
      topic: _safeObj(m.record).topic || null,
      score: m.score || 0
    }))
  };
}

module.exports = { composeMarionResponse };
