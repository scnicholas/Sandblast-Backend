"use strict";

function _uniq(arr = []) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}

function classifyPersistence(signals = {}) {
  const persistent = {};
  const transient = {};

  const domain = signals.domain || "general";
  const intent = signals.intent || "general";
  const primaryEmotion = signals.primaryEmotion || "neutral";
  const emotionalIntensity = Number.isFinite(Number(signals.emotionalIntensity))
    ? Number(signals.emotionalIntensity)
    : 0;

  if (domain && domain !== "general") persistent.domain = domain;
  else transient.domain = domain;

  if (["strategy", "research", "analysis", "planning", "build", "debug"].includes(intent)) {
    persistent.intent = intent;
  } else {
    transient.intent = intent;
  }

  if (signals.recoveryMode) persistent.recoveryMode = signals.recoveryMode;
  if (signals.continuityHealth) transient.continuityHealth = signals.continuityHealth;

  if (primaryEmotion !== "neutral") transient.primaryEmotion = primaryEmotion;
  if (signals.secondaryEmotion) transient.secondaryEmotion = signals.secondaryEmotion;
  if (emotionalIntensity >= 0.65) transient.highEmotion = true;

  if ((signals.suppressionSignals || []).length) transient.suppressionSignals = _uniq(signals.suppressionSignals);
  if ((signals.psychologyPatterns || []).length) transient.psychologyPatterns = _uniq(signals.psychologyPatterns);
  if ((signals.psychologyNeeds || []).length) transient.psychologyNeeds = _uniq(signals.psychologyNeeds);
  if ((signals.psychologyRisks || []).length) transient.psychologyRisks = _uniq(signals.psychologyRisks);
  if ((signals.emotionalNeeds || []).length) transient.emotionalNeeds = _uniq(signals.emotionalNeeds);
  if ((signals.blendProfileKeys || []).length) transient.blendProfileKeys = _uniq(signals.blendProfileKeys);
  if ((signals.evidenceTitles || []).length) transient.evidenceTitles = _uniq(signals.evidenceTitles).slice(0, 8);
  if ((signals.evidenceTags || []).length) transient.evidenceTags = _uniq(signals.evidenceTags).slice(0, 16);
  if ((signals.queryTokens || []).length) transient.queryTokens = _uniq(signals.queryTokens).slice(0, 12);

  persistent.responseMode = signals.responseMode || "balanced";
  persistent.queryFingerprint = signals.queryFingerprint || "";
  persistent.lastMeaningfulDomain = persistent.domain || null;
  persistent.lastMeaningfulIntent = persistent.intent || null;

  return {
    persistent,
    transient
  };
}

module.exports = {
  classifyPersistence
};
