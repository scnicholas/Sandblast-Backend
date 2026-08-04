"use strict";

/**
 * MemorySignalExtractor.js
 *
 * Extracts bounded, serialization-safe continuity signals.
 * It does not own memory persistence or final-reply authority.
 */

const VERSION =
  "marion.memorySignalExtractor/2.1-conflict-resolved-safe-signals";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  try {
    return String(value).trim();
  } catch (_) {
    return fallback;
  }
}

function unique(values = []) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source.filter(Boolean))];
}

function normalizeText(text = "") {
  return safeText(text)
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(text = "") {
  const input = normalizeText(text);
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }

  return String(hash >>> 0);
}

function clampUnitInterval(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.max(0, Math.min(1, number))
    : 0;
}

function extractMemorySignals({
  userQuery = "",
  fusionPacket = {},
  assembledResponse = {}
} = {}) {
  const fusion = safeObject(fusionPacket);
  const response = safeObject(assembledResponse);
  const emotion = safeObject(fusion.emotion);
  const psychology = safeObject(fusion.psychology);
  const responseMeta = safeObject(response.meta);
  const evidence = Array.isArray(fusion.evidence)
    ? fusion.evidence
    : [];

  const normalizedQuery = normalizeText(userQuery);
  const queryTokens = unique(
    normalizedQuery
      .split(" ")
      .filter((token) => token.length > 2)
  ).slice(0, 14);

  const evidenceWindow = evidence.slice(0, 6);

  return {
    query: safeText(userQuery),
    normalizedQuery,
    queryFingerprint: fingerprint(userQuery),
    queryTokens,
    domain: safeText(fusion.domain, "general") || "general",
    intent: safeText(fusion.intent, "general") || "general",
    primaryEmotion:
      safeText(emotion.primaryEmotion, "neutral") || "neutral",
    secondaryEmotion:
      safeText(emotion.secondaryEmotion) || null,
    emotionalIntensity:
      clampUnitInterval(emotion.intensity),
    emotionalNeeds:
      unique(Array.isArray(emotion.needs) ? emotion.needs : []),
    suppressionSignals:
      unique(
        Array.isArray(emotion.suppressionSignals)
          ? emotion.suppressionSignals
          : []
      ),
    blendProfileKeys:
      unique(
        Object.keys(
          safeObject(emotion.blendProfile)
        )
      ),
    psychologyPatterns:
      unique(
        Array.isArray(psychology.patterns)
          ? psychology.patterns
          : []
      ),
    psychologyNeeds:
      unique(
        Array.isArray(psychology.needs)
          ? psychology.needs
          : []
      ),
    psychologyRisks:
      unique(
        Array.isArray(psychology.risks)
          ? psychology.risks
          : []
      ),
    evidenceTitles:
      unique(
        evidenceWindow
          .map((item) => safeText(safeObject(item).title))
          .filter(Boolean)
      ),
    evidenceTags:
      unique(
        evidenceWindow.flatMap((item) => {
          const tags = safeObject(item).tags;
          return Array.isArray(tags) ? tags : [];
        })
      ).slice(0, 16),
    responseMode:
      safeText(safeObject(response.responseMode).mode, "balanced") ||
      "balanced",
    fallbackApplied:
      Boolean(response.partial || response.fallbackApplied),
    continuityHealth:
      safeText(responseMeta.continuityHealth),
    recoveryMode:
      safeText(responseMeta.recoveryMode)
  };
}

module.exports = {
  VERSION,
  extractMemorySignals,
  normalizeText,
  fingerprint
};
