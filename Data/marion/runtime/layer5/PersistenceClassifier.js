"use strict";

/**
 * PersistenceClassifier.js
 *
 * Separates bounded persistent continuity signals from transient turn state.
 */

const VERSION =
  "marion.persistenceClassifier/2.1-conflict-resolved-bounded-carry";

const PERSISTENT_INTENTS = Object.freeze([
  "strategy",
  "research",
  "analysis",
  "planning",
  "build",
  "debug"
]);

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function unique(values = []) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source.filter(Boolean))];
}

function copyBounded(values, limit) {
  return unique(values).slice(0, limit);
}

function classifyPersistence(signals = {}) {
  const source = safeObject(signals);
  const persistent = {};
  const transient = {};

  const domain = source.domain || "general";
  const intent = source.intent || "general";
  const primaryEmotion = source.primaryEmotion || "neutral";

  const emotionalIntensityValue =
    Number(source.emotionalIntensity);

  const emotionalIntensity =
    Number.isFinite(emotionalIntensityValue)
      ? Math.max(0, Math.min(1, emotionalIntensityValue))
      : 0;

  if (domain && domain !== "general") {
    persistent.domain = domain;
  } else {
    transient.domain = domain;
  }

  if (PERSISTENT_INTENTS.includes(intent)) {
    persistent.intent = intent;
  } else {
    transient.intent = intent;
  }

  if (source.recoveryMode) {
    persistent.recoveryMode = source.recoveryMode;
  }

  if (source.continuityHealth) {
    transient.continuityHealth = source.continuityHealth;
  }

  if (primaryEmotion !== "neutral") {
    transient.primaryEmotion = primaryEmotion;
  }

  if (source.secondaryEmotion) {
    transient.secondaryEmotion = source.secondaryEmotion;
  }

  if (emotionalIntensity >= 0.65) {
    transient.highEmotion = true;
  }

  const boundedTransientArrays = [
    ["suppressionSignals", 16],
    ["psychologyPatterns", 16],
    ["psychologyNeeds", 16],
    ["psychologyRisks", 16],
    ["emotionalNeeds", 16],
    ["blendProfileKeys", 16],
    ["evidenceTitles", 8],
    ["evidenceTags", 16],
    ["queryTokens", 12]
  ];

  for (const [key, limit] of boundedTransientArrays) {
    if (Array.isArray(source[key]) && source[key].length) {
      transient[key] = copyBounded(source[key], limit);
    }
  }

  if (source.fallbackApplied === true) {
    transient.fallbackApplied = true;
  }

  persistent.responseMode =
    source.responseMode || "balanced";

  persistent.queryFingerprint =
    source.queryFingerprint || "";

  persistent.lastMeaningfulDomain =
    persistent.domain || null;

  persistent.lastMeaningfulIntent =
    persistent.intent || null;

  return {
    persistent,
    transient
  };
}

module.exports = {
  VERSION,
  PERSISTENT_INTENTS,
  classifyPersistence
};
