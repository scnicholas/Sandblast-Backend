<<<<<<< HEAD
"use strict";

function _uniq(arr = []) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}
function _trim(v) { return v == null ? "" : String(v).trim(); }
function normalizeText(text = "") {
  return _trim(text).toLowerCase().replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
}
function fingerprint(text = "") {
=======
function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fingerprint(text = '') {
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
  const input = normalizeText(text);
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
<<<<<<< HEAD
  return String(hash >>> 0);
}

function extractMemorySignals({
  userQuery = "",
=======
  return String(hash);
}

function extractMemorySignals({
  userQuery = '',
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
  fusionPacket = {},
  assembledResponse = {}
} = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const evidence = Array.isArray(fusionPacket.evidence) ? fusionPacket.evidence : [];
<<<<<<< HEAD
  const responseMeta = assembledResponse.meta || {};
  const normalizedQuery = normalizeText(userQuery);
  const queryTokens = _uniq(normalizedQuery.split(" ").filter((token) => token.length > 2)).slice(0, 14);

  return {
    query: _trim(userQuery),
    normalizedQuery,
    queryFingerprint: fingerprint(userQuery),
    queryTokens,
    domain: fusionPacket.domain || "general",
    intent: fusionPacket.intent || "general",
    primaryEmotion: emotion.primaryEmotion || "neutral",
    secondaryEmotion: emotion.secondaryEmotion || null,
    emotionalIntensity: Number.isFinite(Number(emotion.intensity)) ? Math.max(0, Math.min(1, Number(emotion.intensity))) : 0,
    emotionalNeeds: _uniq(Array.isArray(emotion.needs) ? emotion.needs : []),
    suppressionSignals: _uniq(Array.isArray(emotion.suppressionSignals) ? emotion.suppressionSignals : []),
    blendProfileKeys: _uniq(Object.keys((emotion.blendProfile && typeof emotion.blendProfile === "object") ? emotion.blendProfile : {})),
    psychologyPatterns: _uniq(Array.isArray(psychology.patterns) ? psychology.patterns : []),
    psychologyNeeds: _uniq(Array.isArray(psychology.needs) ? psychology.needs : []),
    psychologyRisks: _uniq(Array.isArray(psychology.risks) ? psychology.risks : []),
    evidenceTitles: _uniq(evidence.slice(0, 6).map((item) => item && item.title).filter(Boolean)),
    evidenceTags: _uniq(evidence.slice(0, 6).flatMap((item) => Array.isArray(item && item.tags) ? item.tags : [])).slice(0, 16),
    responseMode: assembledResponse.responseMode?.mode || "balanced",
    fallbackApplied: Boolean(assembledResponse.partial || assembledResponse.fallbackApplied),
    continuityHealth: _trim(responseMeta.continuityHealth || ""),
    recoveryMode: _trim(responseMeta.recoveryMode || "")
=======
  const risks = Array.isArray(psychology.risks) ? psychology.risks : [];
  const normalizedQuery = normalizeText(userQuery);
  const queryTokens = uniq(normalizedQuery.split(' ').filter(token => token.length > 2)).slice(0, 12);

  return {
    query: userQuery,
    normalizedQuery,
    queryFingerprint: fingerprint(userQuery),
    queryTokens,
    domain: fusionPacket.domain || 'general',
    intent: fusionPacket.intent || 'general',
    primaryEmotion: emotion.primaryEmotion || 'neutral',
    emotionalIntensity: Number.isFinite(emotion.intensity) ? Math.max(0, Math.min(1, emotion.intensity)) : 0,
    emotionalNeeds: uniq(Array.isArray(emotion.needs) ? emotion.needs : []),
    psychologyPatterns: uniq(Array.isArray(psychology.patterns) ? psychology.patterns : []),
    psychologyNeeds: uniq(Array.isArray(psychology.needs) ? psychology.needs : []),
    psychologyRisks: uniq(risks),
    evidenceTitles: uniq(evidence.slice(0, 5).map(item => item && item.title)),
    responseMode: assembledResponse.responseMode?.mode || 'balanced',
    fallbackApplied: Boolean(assembledResponse.partial || assembledResponse.fallbackApplied)
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
  };
}

module.exports = {
<<<<<<< HEAD
  extractMemorySignals,
  normalizeText,
  fingerprint
};
=======
  extractMemorySignals
};
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
