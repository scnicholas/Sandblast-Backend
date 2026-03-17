"use strict";

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }

function _emotionFallbackPlan(primaryEmotion = {}) {
  const emotion = _trim(primaryEmotion.emotion).toLowerCase();
  const valence = _trim(primaryEmotion.valence).toLowerCase();
  const intensity = Number(primaryEmotion.intensity || 0);

  let semanticFrame = "emotional_attunement";
  let deliveryTone = "steadying";
  let followupStyle = "reflective";
  let transitionReadiness = "medium";
  let transitionTargets = ["clarify"];
  let supportMode = "clarify_and_sequence";
  let routeBias = "clarify";
  let guidance = [
    "Reflect the user's emotional state clearly",
    "Keep the language human and natural",
    "Avoid repetitive support-shell phrasing"
  ];
  let guardrails = [];

  if (["panic", "fear", "overwhelm", "distress", "grief", "shame", "rage"].includes(emotion) || intensity >= 7) {
    semanticFrame = "stabilization";
    deliveryTone = "warm_affirming";
    followupStyle = "ground_then_narrow";
    transitionReadiness = "low";
    transitionTargets = ["stabilize", "contain"];
    supportMode = "soothe_and_structure";
    routeBias = "stabilize";
    guidance = [
      "Reduce urgency before deeper analysis",
      "Use short, grounding language",
      "Offer one immediate next step only"
    ];
    guardrails = ["Do not over-question", "Do not mirror panic intensity"];
  } else if (["joy", "relief", "hope", "confidence", "gratitude", "pride", "calm"].includes(emotion) || valence === "positive") {
    semanticFrame = "momentum_preservation";
    deliveryTone = "warm_affirming";
    followupStyle = "direct_answer_then_one_question";
    transitionReadiness = "high";
    transitionTargets = ["channel", "maintain"];
    supportMode = "affirm_and_channel";
    routeBias = "deepen_then_channel";
    guidance = [
      "Affirm the positive shift naturally",
      "Preserve momentum without sounding mechanical",
      "Offer one constructive next step"
    ];
    guardrails = [
      "Do not fall back to generic detection language",
      "Do not flatten positive affect into a bland support template"
    ];
  }

  return {
    interpretation: emotion ? `Detected emotional signal: ${emotion}.` : null,
    supportMode,
    routeBias,
    riskLevel: intensity >= 8 ? "high" : "low",
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

function composeMarionResponse(routed = {}, input = {}) {
  const primaryDomain = _trim(routed.primaryDomain) || "psychology";
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
    return {
      ok: true,
      matched: !!fallback,
      domain: primaryDomain,
      interpretation: fallback ? fallback.interpretation : null,
      supportMode: fallback ? fallback.supportMode : (route.supportMode || "clarify_and_sequence"),
      routeBias: fallback ? fallback.routeBias : (route.routeBias || "clarify"),
      riskLevel: fallback ? fallback.riskLevel : "low",
      supportFlags: emotion.supportFlags || routed.supportFlags || {},
      responsePlan: fallback ? fallback.responsePlan : {
        semanticFrame: "clarity_building",
        deliveryTone: "steadying",
        expressionStyle: "plain_statement",
        followupStyle: "reflective",
        transitionReadiness: "medium",
        transitionTargets: ["clarify"]
      },
      guidance: fallback ? fallback.guidance : [
        "Reflect the user's current tone simply",
        "Ask one clear follow-up question",
        "Avoid template repetition"
      ],
      guardrails: fallback ? fallback.guardrails : [],
      source: {
        domain: fallback ? "emotion" : primaryDomain,
        matched: !!fallback
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
    transitionTargets: toneProfile.transitionTargets || supportProfile.transitionTargets || []
  };

  const guidance = []
    .concat(_safeArray(record.responseGuidance))
    .concat(_safeArray(supportProfile.responseShape))
    .filter(Boolean);

  const guardrails = []
    .concat(_safeArray(record.contraindications))
    .concat(_safeArray(supportProfile.constraints))
    .filter(Boolean);

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
