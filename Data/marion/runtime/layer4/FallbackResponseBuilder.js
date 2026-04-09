"use strict";

function normalizeText(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function chooseOpening({ domain = "general", primaryEmotion = "neutral", mode = "balanced", recoveryMode = "normal", suppressionSignals = [] } = {}) {
  if (recoveryMode === "guided-recovery") {
    switch (domain) {
      case "psychology":
        return primaryEmotion !== "neutral"
          ? `I can hear the ${primaryEmotion} in this, so I’m keeping the next step steady and clear.`
          : "I want to keep this steady and clear so we do not spiral or overcomplicate it.";
      case "finance":
        return "The signal is thinner than I want, so I’m going to keep this precise and risk-aware.";
      case "law":
        return "I’m going to answer this carefully and keep the boundaries of certainty explicit.";
      case "cybersecurity":
        return "I’m treating this as a controlled response: clear signal first, then defensive next action.";
      default:
        return "The signal is not perfect, so I’m going to keep this grounded, direct, and useful.";
    }
  }

  if (mode === "analytical" || mode === "evidence-led" || mode === "bounded-analytical") {
    return "The signal is limited, so I’m keeping this precise and bounded.";
  }

  if (Array.isArray(suppressionSignals) && suppressionSignals.length) {
    return primaryEmotion !== "neutral"
      ? `I can hear some ${primaryEmotion} underneath this, so I’m going to stay gentle, clear, and not overread it.`
      : "I can tell the signal is guarded, so I’m going to keep this steady and low-pressure.";
  }

  if (primaryEmotion !== "neutral") {
    return `I can hear some ${primaryEmotion} in this, so I’m going to answer with care and clarity.`;
  }

  return "I want to answer this carefully and stay inside the strongest signal available.";
}

function choosePosture({ domain = "general", mode = "balanced", primaryEmotion = "neutral", recoveryMode = "normal", suppressionSignals = [] } = {}) {
  if (recoveryMode === "guided-recovery") {
    if (domain === "psychology") return "stabilizing-supportive";
    if (domain === "finance" || domain === "law" || domain === "cybersecurity") return "bounded-analytical";
    return "guided-recovery";
  }

  if (mode === "analytical" || mode === "evidence-led" || mode === "bounded-analytical") return "analytical";
  if (mode === "stabilizing" || mode === "supportive-directive" || primaryEmotion !== "neutral") return "supportive";
  if (suppressionSignals.length) return "soft-probe";
  return "balanced";
}

function chooseNextMove({ domain = "general", mode = "balanced", lowEvidence = false, thinReasoning = false, recoveryMode = "normal", suppressionSignals = [] } = {}) {
  if (recoveryMode === "guided-recovery") {
    switch (domain) {
      case "psychology":
        return "Acknowledge the state first, avoid flooding, then offer one grounded next step.";
      case "finance":
        return "State the clearest risk-adjusted conclusion and avoid speculative fill.";
      case "law":
        return "Give a qualified answer, mark uncertainty, and suggest the safest next step.";
      case "cybersecurity":
        return "Identify the most likely risk signal and move directly to containment-minded guidance.";
      default:
        return "Answer directly, keep scope tight, and avoid repeating generic reassurance.";
    }
  }

  if (suppressionSignals.length) {
    return "Keep pressure low, avoid overprobing, and offer one clear next move.";
  }

  if (mode === "analytical" || mode === "bounded-analytical") {
    return "Answer directly, mark uncertainty, and avoid invention.";
  }

  if (lowEvidence || thinReasoning) {
    return "Use the strongest available signal, keep claims narrow, and avoid overbuilding the answer.";
  }

  return "Give a clear, grounded answer with minimal overreach.";
}

function buildVariationTag({ domain = "general", mode = "balanced", primaryEmotion = "neutral", recoveryMode = "normal", suppressionSignals = [] } = {}) {
  return [domain, mode, primaryEmotion, recoveryMode, suppressionSignals.join("+")].filter(Boolean).join("::");
}

function buildFallbackResponse({
  fusionPacket = {},
  responseMode = {},
  answerPlan = {},
  continuityState = {},
  turnMemory = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const diagnostics = fusionPacket.diagnostics || {};
  const domain = fusionPacket.domain || responseMode.domain || "general";
  const primaryEmotion = emotion.primaryEmotion || "neutral";
  const mode = responseMode.mode || "balanced";
  const lowEvidence = (diagnostics.evidenceKept || (fusionPacket.evidence || []).length || 0) < 2;
  const thinReasoning = ((answerPlan.reasoningSteps || []).length || 0) < 2;
  const recoveryMode = turnMemory.recoveryMode || continuityState.recoveryMode || "normal";
  const suppressionSignals = Array.isArray(emotion.suppressionSignals) ? emotion.suppressionSignals.filter(Boolean) : [];
  const guardedness = clamp((emotion.blendProfile && emotion.blendProfile.guardedness) || 0);

  return {
    fallback: true,
    domain,
    mode,
    posture: choosePosture({ domain, mode, primaryEmotion, recoveryMode, suppressionSignals }),
    opening: chooseOpening({ domain, primaryEmotion, mode, recoveryMode, suppressionSignals }),
    nextMove: chooseNextMove({ domain, mode, lowEvidence, thinReasoning, recoveryMode, suppressionSignals }),
    lowEvidence,
    thinReasoning,
    recoveryMode,
    guardedness,
    suppressionSignals,
    variationTag: buildVariationTag({ domain, mode, primaryEmotion, recoveryMode, suppressionSignals }),
    meta: {
      primaryEmotion: normalizeText(primaryEmotion) || "neutral",
      driftTrend: normalizeText(emotion.stateDrift && emotion.stateDrift.trend) || "steady"
    }
  };
}

module.exports = {
  buildFallbackResponse
};
