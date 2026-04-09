"use strict";

function clamp(n, min = 0, max = 1) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function resolveResponseMode({
  fusionPacket = {},
  answerPlan = {},
  continuityState = {},
  turnMemory = {}
} = {}) {
  const intent = fusionPacket.intent || answerPlan.intent || "general";
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const domain = fusionPacket.domain || answerPlan.domain || "general";
  const diagnostics = fusionPacket.diagnostics || {};

  const intensity = clamp(emotion.intensity || 0);
  const primaryEmotion = emotion.primaryEmotion || "neutral";
  const approach = String(psychology.recommendedApproach || "supportive");
  const evidenceKept = Number(diagnostics.evidenceKept || (fusionPacket.evidence || []).length || 0);
  const fallbackStreak = Number(turnMemory.fallbackStreak || 0);
  const repeatQueryStreak = Number(turnMemory.repeatQueryStreak || 0);
  const recoveryMode = turnMemory.recoveryMode || continuityState.recoveryMode || "normal";
  const suppressionSignals = Array.isArray(emotion.suppressionSignals) ? emotion.suppressionSignals.filter(Boolean) : [];
  const guardedness = clamp(emotion.blendProfile && emotion.blendProfile.guardedness || 0);
  const driftTrend = normalizeText(emotion.stateDrift && emotion.stateDrift.trend) || "steady";

  let mode = "balanced";

  if (intent === "analysis") mode = "analytical";
  if (intent === "research") mode = "evidence-led";
  if (intent === "strategy" || intent === "planning" || intent === "build" || intent === "debug") mode = "strategic";
  if (intent === "support" || intent === "care") mode = "supportive";

  if (intensity > 0.72 && primaryEmotion !== "neutral") {
    mode = "stabilizing";
  }

  if (approach.includes("directive") && intensity > 0.55) {
    mode = "supportive-directive";
  }

  if (suppressionSignals.length && intensity >= 0.35 && mode === "supportive") {
    mode = "soft-probe";
  }

  if (evidenceKept < 2 && (mode === "analytical" || mode === "evidence-led" || mode === "strategic")) {
    mode = "bounded-analytical";
  }

  if (driftTrend === "escalating" && primaryEmotion !== "neutral") {
    mode = evidenceKept >= 2 ? "stabilizing" : "recovery";
  }

  if (recoveryMode === "guided-recovery" || fallbackStreak >= 2 || repeatQueryStreak >= 2 || guardedness >= 0.75) {
    mode = "recovery";
  }

  return {
    mode,
    intent,
    domain,
    primaryEmotion,
    intensity,
    recommendedApproach: approach,
    evidenceKept,
    fallbackStreak,
    repeatQueryStreak,
    recoveryMode,
    suppressionSignals,
    guardedness,
    driftTrend
  };
}

module.exports = {
  resolveResponseMode
};
