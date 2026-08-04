"use strict";

/**
 * runtime/layer4/ToneEnvelopeBuilder.js
 *
 * Builds bounded tone metadata only. It does not author or finalize replies.
 */

const VERSION = "marion.toneEnvelopeBuilder/2.1-conflict-resolved";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function buildToneEnvelope({ fusionPacket = {}, responseMode = {}, turnMemory = {} } = {}) {
  const fusion = safeObject(fusionPacket);
  const emotion = safeObject(fusion.emotion);
  const psychology = safeObject(fusion.psychology);
  const mode = safeObject(responseMode);
  const memory = safeObject(turnMemory);
  const blendProfile = safeObject(emotion.blendProfile);

  const domain = String(fusion.domain || "general").trim().toLowerCase() || "general";
  const intensity = clamp(emotion.intensity || 0);
  const primaryEmotion = String(emotion.primaryEmotion || "neutral").trim() || "neutral";
  const fallbackStreak = Math.max(0, Number(memory.fallbackStreak || 0) || 0);
  const repeatQueryStreak = Math.max(0, Number(memory.repeatQueryStreak || 0) || 0);
  const recoveryMode = String(memory.recoveryMode || "normal").trim() || "normal";
  const suppressionSignals = Array.isArray(emotion.suppressionSignals)
    ? emotion.suppressionSignals.filter(Boolean)
    : [];
  const guardedness = clamp(blendProfile.guardedness || 0);

  const directives = [];
  const forbidden = [];
  let warmth = 0.55;
  let precision = 0.72;
  let directness = 0.66;

  if (primaryEmotion !== "neutral") {
    directives.push(`Acknowledge ${primaryEmotion} without melodrama or mimicry.`);
    warmth += 0.1;
  }

  if (intensity > 0.7) {
    directives.push("Keep pacing calm, grounded, and emotionally steady.");
    directives.push("Lead with steadiness before complexity.");
    forbidden.push("abruptness", "cold detachment");
    warmth += 0.08;
    directness -= 0.08;
  }

  if (suppressionSignals.length) {
    directives.push("Use low-pressure language and avoid interrogative intensity.");
    forbidden.push("forced intimacy", "pressure-heavy probing");
    warmth += 0.04;
    directness -= 0.03;
  }

  if (String(psychology.recommendedApproach || "").includes("directive")) {
    directives.push("Be guiding and clear without sounding controlling.");
    directness += 0.06;
  }

  if (["analytical", "evidence-led", "bounded-analytical"].includes(mode.mode)) {
    directives.push("Prioritize clarity, structure, and bounded claims.");
    precision += 0.12;
  }

  if (mode.mode === "strategic") {
    directives.push("Frame the answer in operational steps with forward motion.");
    precision += 0.08;
    directness += 0.06;
  }

  if (mode.mode === "soft-probe") {
    directives.push("Keep the tone gentle, clear, and non-intrusive.");
    directness -= 0.04;
    warmth += 0.04;
  }

  if (mode.mode === "recovery") {
    directives.push("Break repetition. Do not restate the same reassurance in new clothes.");
    directives.push("Use one clear next move, not a spiral of options.");
    precision += 0.06;
    directness += 0.04;
    forbidden.push("repetitive reassurance", "circular phrasing");
  }

  if (["law", "finance", "cybersecurity"].includes(domain)) {
    directives.push(`Maintain disciplined ${domain} framing.`);
    precision += 0.08;
    forbidden.push("overclaiming");
  }

  if (domain === "psychology") {
    directives.push("Be supportive, stable, and human-aware.");
    forbidden.push("clinical coldness");
  }

  if (guardedness >= 0.7) {
    directives.push("Keep the answer compact and avoid emotional overreach.");
    precision += 0.04;
    forbidden.push("performative empathy");
  }

  if (fallbackStreak >= 2 || repeatQueryStreak >= 2 || recoveryMode === "guided-recovery") {
    directives.push("Tighten the answer and reduce ornamental language.");
    forbidden.push("generic filler");
    precision += 0.05;
    directness += 0.04;
  }

  return {
    warmth: clamp(Number(warmth.toFixed(4))),
    precision: clamp(Number(precision.toFixed(4))),
    directness: clamp(Number(directness.toFixed(4))),
    directives: unique(directives),
    forbidden: unique(forbidden)
  };
}

module.exports = {
  VERSION,
  buildToneEnvelope
};
