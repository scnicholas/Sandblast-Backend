"use strict";

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _trim(v) {
  return v == null ? "" : String(v).trim();
}

function composeMarionResponse(routed = {}, input = {}) {
  const primaryDomain = _trim(routed.primaryDomain) || "psychology";
  const psychology = _safeObj(_safeObj(routed.domains).psychology);
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  const route = _safeObj(psychology.route);
  const classified = _safeObj(routed.classified);

  if (!psychology.matched || !record.id) {
    return {
      ok: true,
      matched: false,
      domain: primaryDomain,
      interpretation: null,
      supportMode: route.supportMode || "clarify_and_sequence",
      routeBias: route.routeBias || "clarify",
      riskLevel: "low",
      responsePlan: {
        semanticFrame: "clarity_building",
        deliveryTone: "steadying",
        expressionStyle: "plain_statement",
        followupStyle: "reflective",
        transitionReadiness: "medium",
        transitionTargets: ["clarify"]
      },
      guidance: [
        "Reflect the user's current tone simply",
        "Ask one clear follow-up question",
        "Avoid template repetition"
      ],
      guardrails: [],
      source: {
        domain: primaryDomain,
        matched: false
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

  return {
    ok: true,
    matched: true,
    domain: primaryDomain,
    interpretation: record.interpretation || record.summary || null,
    supportMode: record.supportMode || route.supportMode || "clarify_and_sequence",
    routeBias: record.routeBias || route.routeBias || "clarify",
    riskLevel: record.riskLevel || (classified.classifications && classified.classifications.crisis ? "critical" : "low"),
    supportFlags: record.supportFlags || routed.supportFlags || {},
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
      reasons: primary.reasons || []
    },
    matches: _safeArray(psychology.matches).map((m) => ({
      recordId: _safeObj(m.record).id || null,
      subdomain: _safeObj(m.record).subdomain || null,
      topic: _safeObj(m.record).topic || null,
      score: m.score || 0
    }))
  };
}

module.exports = {
  composeMarionResponse
};
