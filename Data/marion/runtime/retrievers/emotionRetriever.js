"use strict";

const fs = require("fs");
const path = require("path");

const VERSION = "emotionRetriever v3.2.0 STATE-SPINE-COHESION-HARDENED";
const FILE_NAME = "emotionRetriever.js";
const DATA_FILE_NAMES = Object.freeze([
  "base_labels.json",
  "conversation_patterns.json",
  "emotion_analysis_schema.json",
  "nuance_map.json"
]);

const FALLBACK_LABELS = Object.freeze([
  { label: "anxiety", keywords: ["anxious", "worried", "nervous", "spiraling", "on edge"], valence: "negative", intensity: 7, supportNeeds: ["grounding", "stabilization"] },
  { label: "sadness", keywords: ["sad", "down", "hurt", "grief", "lonely", "heartbroken"], valence: "negative", intensity: 6, supportNeeds: ["connection", "reassurance"] },
  { label: "frustration", keywords: ["frustrated", "annoyed", "fed up", "stuck", "broken", "not working"], valence: "negative", intensity: 6, supportNeeds: ["clarity", "unblocking"] },
  { label: "confusion", keywords: ["confused", "unclear", "lost", "not sure", "explain"], valence: "mixed", intensity: 4, supportNeeds: ["clarity", "orientation"] },
  { label: "joy", keywords: ["happy", "joy", "delighted", "glad", "great"], valence: "positive", intensity: 6, supportNeeds: ["anchoring"] },
  { label: "gratitude", keywords: ["thank you", "thanks", "grateful", "appreciate"], valence: "positive", intensity: 4, supportNeeds: ["affirmation"] },
  { label: "calm", keywords: ["calm", "peaceful", "settled", "grounded"], valence: "positive", intensity: 3, supportNeeds: ["anchoring"] },
  { label: "overwhelm", keywords: ["overwhelmed", "too much", "flooded", "drowning"], valence: "negative", intensity: 8, supportNeeds: ["containment", "stabilization"] },
  { label: "fear", keywords: ["afraid", "scared", "terrified", "fear"], valence: "negative", intensity: 8, supportNeeds: ["grounding", "containment"] },
  { label: "panic", keywords: ["panic", "panicking", "freaking out", "cannot breathe", "can't breathe"], valence: "negative", intensity: 9, supportNeeds: ["containment", "stabilization"] }
]);

const SUPPRESSION_MARKERS = Object.freeze({
  minimization: ["i'm fine", "im fine", "it's fine", "its fine", "whatever", "no big deal", "not a big deal", "just tired", "just stressed", "i guess i'm okay"],
  forcedPositivity: ["all good", "we're good", "i'm good", "im good", "it is what it is", "staying positive", "trying to stay positive", "keeping it together"],
  guardedness: ["rather not say", "don't want to get into it", "dont want to get into it", "leave it", "never mind", "forget it", "it's nothing", "its nothing"],
  deflection: ["anyway", "moving on", "let's move on", "lets move on", "doesn't matter", "doesnt matter"]
});

let _cache = {
  loaded: false,
  fingerprint: "",
  dataset: { labels: [], patterns: [], schema: {}, nuance: [], sources: {} }
};

function _exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function _mtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function _readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function _safeArray(value) { return Array.isArray(value) ? value : []; }
function _safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function _str(value) { return value == null ? "" : String(value); }
function _trim(value) { return _str(value).trim(); }
function _lower(value) { return _trim(value).toLowerCase(); }
function _uniqStrings(values) { return [...new Set(_safeArray(values).map((v) => _trim(v)).filter(Boolean))]; }
function _clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function _normalizeText(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'’_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _flattenStrings(value, out = []) {
  if (typeof value === "string") {
    const s = _trim(value);
    if (s) out.push(s);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) _flattenStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) _flattenStrings(item, out);
    return out;
  }
  return out;
}

function _candidateEmotionRoots() {
  const roots = [
    path.resolve(__dirname),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", "emotion"),
    path.resolve(__dirname, "emotion"),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "emotion"),
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "datasets")
  ];
  return [...new Set(roots)];
}

function _findDataFile(fileName) {
  for (const root of _candidateEmotionRoots()) {
    const direct = path.join(root, fileName);
    if (_exists(direct)) return direct;
    const nestedEmotion = path.join(root, "emotion", fileName);
    if (_exists(nestedEmotion)) return nestedEmotion;
    const nestedDataEmotion = path.join(root, "data", "emotion", fileName);
    if (_exists(nestedDataEmotion)) return nestedDataEmotion;
    const nestedDatasetsEmotion = path.join(root, "datasets", "emotion", fileName);
    if (_exists(nestedDatasetsEmotion)) return nestedDatasetsEmotion;
  }
  return "";
}

function _datasetFingerprint(pathsByName) {
  return DATA_FILE_NAMES.map((name) => `${name}:${_mtime(pathsByName[name])}`).join("|");
}

function _parseBaseLabels(data) {
  if (Array.isArray(data)) return data.map((item) => _safeObj(item)).filter((item) => _trim(item.label || item.name || item.emotion));

  const obj = _safeObj(data);
  const derived = [];
  const primary = _safeArray(obj.primary_emotions);
  const secondary = _safeArray(obj.secondary_emotions);

  for (const name of primary) {
    derived.push({ label: _trim(name), kind: "primary" });
  }
  for (const name of secondary) {
    derived.push({ label: _trim(name), kind: "secondary" });
  }

  for (const [label, value] of Object.entries(obj)) {
    if (["primary_emotions", "secondary_emotions", "intensity_scale"].includes(label)) continue;
    const entry = _safeObj(value);
    if (_trim(label) || _trim(entry.label) || _trim(entry.name)) {
      derived.push({ label: _trim(entry.label || entry.name || label), ...entry });
    }
  }

  return derived.filter((item) => _trim(item.label || item.name || item.emotion));
}

function _parseConversationPatterns(data) {
  if (Array.isArray(data)) return data.map((item) => _safeObj(item));
  const obj = _safeObj(data);
  if (Array.isArray(obj.patterns)) return obj.patterns.map((item) => _safeObj(item));
  return Object.entries(obj).map(([pattern, value]) => ({ pattern, ..._safeObj(value) }));
}

function _parseNuanceMap(data) {
  if (Array.isArray(data)) return data.map((item) => _safeObj(item));
  const obj = _safeObj(data);
  return Object.entries(obj).map(([topic, value]) => ({ topic, ..._safeObj(value) }));
}

function _ensureLoaded() {
  const pathsByName = {};
  for (const fileName of DATA_FILE_NAMES) pathsByName[fileName] = _findDataFile(fileName);
  const fingerprint = _datasetFingerprint(pathsByName);
  if (_cache.loaded && _cache.fingerprint === fingerprint) return _cache.dataset;

  const dataset = { labels: [], patterns: [], schema: {}, nuance: [], sources: {} };

  for (const fileName of DATA_FILE_NAMES) {
    const filePath = pathsByName[fileName];
    if (!filePath) continue;
    dataset.sources[fileName] = filePath;

    let data;
    try {
      data = _readJson(filePath);
    } catch {
      continue;
    }

    if (fileName === "base_labels.json") dataset.labels.push(..._parseBaseLabels(data));
    else if (fileName === "conversation_patterns.json") dataset.patterns.push(..._parseConversationPatterns(data));
    else if (fileName === "emotion_analysis_schema.json") dataset.schema = _safeObj(data);
    else if (fileName === "nuance_map.json") dataset.nuance.push(..._parseNuanceMap(data));
  }

  if (!dataset.labels.length) dataset.labels = FALLBACK_LABELS.slice();

  _cache.loaded = true;
  _cache.fingerprint = fingerprint;
  _cache.dataset = dataset;
  return dataset;
}

function _extractGuidedPrompt(input = {}) {
  const obj = _safeObj(input);
  const direct = _safeObj(obj.guidedPrompt);
  const body = _safeObj(obj.body);
  const payload = _safeObj(obj.payload);
  const ctx = _safeObj(obj.ctx || obj.context);
  const fromBody = _safeObj(body.guidedPrompt);
  const fromPayload = _safeObj(payload.guidedPrompt);
  const guidedPrompt = Object.keys(direct).length
    ? direct
    : Object.keys(fromBody).length
      ? fromBody
      : Object.keys(fromPayload).length
        ? fromPayload
        : _safeObj(ctx.guidedPrompt);

  if (!Object.keys(guidedPrompt).length) return null;

  return {
    id: _trim(guidedPrompt.id || guidedPrompt.key || ""),
    label: _trim(guidedPrompt.label || guidedPrompt.text || obj.text || obj.query || ""),
    lane: _trim(guidedPrompt.lane || obj.lane || payload.lane || body.lane || ""),
    domainHint: _trim(guidedPrompt.domainHint || obj.domainHint || payload.domainHint || body.domainHint || ""),
    intentHint: _trim(guidedPrompt.intentHint || obj.intentHint || payload.intentHint || body.intentHint || ""),
    emotionalHint: _trim(guidedPrompt.emotionalHint || obj.emotionalHint || payload.emotionalHint || body.emotionalHint || "")
  };
}

function _extractPriorEmotion(input = {}) {
  const previousMemory = _safeObj(input.previousMemory);
  const conversationState = _safeObj(input.conversationState || input.state);
  const prior = _safeObj(input.previousEmotion || previousMemory.previousEmotion || previousMemory.lastEmotion || conversationState.lastEmotion || conversationState.previousEmotion);
  const primaryEmotion = _trim(prior.primaryEmotion || prior.emotion || previousMemory.primaryEmotion || "");
  if (!primaryEmotion) return null;
  return {
    primaryEmotion,
    secondaryEmotion: _trim(prior.secondaryEmotion || "") || null,
    intensity: _clamp01(prior.intensity, 0),
    valence: Number.isFinite(Number(prior.valence)) ? Number(prior.valence) : 0,
    confidence: _clamp01(prior.confidence, 0)
  };
}

function _candidateTerms(entry) {
  const obj = _safeObj(entry);
  const phrases = [
    obj.label,
    obj.name,
    obj.pattern,
    obj.topic,
    obj.emotion,
    obj.match_type,
    obj.emotion_bias,
    obj.nuance_bias,
    ..._flattenStrings(obj.keywords),
    ..._flattenStrings(obj.signals),
    ..._flattenStrings(obj.aliases),
    ..._flattenStrings(obj.examples),
    ..._flattenStrings(obj.triggers),
    ..._flattenStrings(obj.related),
    ..._flattenStrings(obj.phrases),
    ..._flattenStrings(obj.subtypes),
    ..._flattenStrings(obj.social_patterns),
    ..._flattenStrings(obj.response_style),
    ..._flattenStrings(obj.risk_flags)
  ];
  return _uniqStrings(phrases);
}

function _scoreEntry(normalizedText, entry, sourceType) {
  const obj = _safeObj(entry);
  const reasons = [];
  let score = 0;

  for (const value of _candidateTerms(obj)) {
    const phrase = _normalizeText(value);
    if (!phrase) continue;
    if (normalizedText.includes(phrase)) {
      const weight = sourceType === "label" ? 5 : sourceType === "pattern" ? 4 : 3;
      score += weight;
      reasons.push({ type: sourceType, value: _trim(value), weight });
    }
  }

  if (sourceType === "pattern") {
    const emotionBias = _trim(obj.emotion_bias);
    const nuanceBias = _trim(obj.nuance_bias);
    if (emotionBias) score += 2;
    if (nuanceBias) score += 1;
  }

  return { score, reasons };
}

function _emotionName(entry) {
  const obj = _safeObj(entry);
  return _trim(obj.label || obj.emotion || obj.emotion_bias || obj.name || obj.pattern || obj.topic || "neutral");
}

function _inferValence(emotionName, entry) {
  const obj = _safeObj(entry);
  const explicit = _lower(obj.valence || obj.sentiment || obj.polarity);
  if (explicit) return explicit;
  const emotion = _lower(emotionName);
  if (["joy", "relief", "gratitude", "hope", "confidence", "calm", "pride", "contentment", "gratitude", "excitement"].includes(emotion)) return "positive";
  if (["sadness", "fear", "panic", "shame", "rage", "grief", "overwhelm", "distress", "loneliness", "frustration", "anxiety", "hurt", "disappointment", "hopelessness", "resentment"].includes(emotion)) return "negative";
  return "mixed";
}

function _inferIntensity(score, entry) {
  const explicit = Number(_safeObj(entry).intensity);
  if (Number.isFinite(explicit)) return Math.max(1, Math.min(10, Math.round(explicit)));
  if (score >= 12) return 8;
  if (score >= 8) return 6;
  if (score >= 4) return 4;
  return 2;
}

function _normalizedIntensity(intensity) {
  const n = Number(intensity);
  if (!Number.isFinite(n)) return 0;
  return Number(Math.max(0, Math.min(1, n / 10)).toFixed(4));
}

function _valenceNumeric(valenceLabel) {
  const valence = _lower(valenceLabel);
  if (valence === "positive") return 0.75;
  if (valence === "negative") return -0.75;
  return 0;
}

function _supportFlags(emotionName, valence, intensity, suppression = {}) {
  const emotion = _lower(emotionName);
  const level = Number(intensity) || 0;
  const guarded = !!suppression.guarded;
  const suppressionPresent = !!suppression.present;
  return {
    needsStabilization: ["panic", "fear", "despair", "overwhelm", "shame", "rage", "grief", "anxiety"].includes(emotion) || level >= 7,
    needsContainment: ["panic", "rage"].includes(emotion) || level >= 8,
    needsClarification: ["confusion", "ambivalence", "uncertainty", "frustration"].includes(emotion),
    needsConnection: ["loneliness", "grief", "sadness", "shame", "hurt"].includes(emotion),
    highDistress: valence === "negative" && level >= 6,
    crisis: false,
    recoveryPresent: ["relief", "hope", "calm"].includes(emotion),
    positivePresent: valence === "positive",
    guarded,
    guardedness: guarded,
    minimization: !!suppression.minimization,
    forcedPositivity: !!suppression.forcedPositivity,
    suppressionPresent,
    suppressed: suppressionPresent
  };
}

function _deriveNeeds(emotionName, supportFlags, entry) {
  const fromEntry = _uniqStrings([
    ..._flattenStrings(_safeObj(entry).needs),
    ..._flattenStrings(_safeObj(entry).supportNeeds),
    ..._flattenStrings(_safeObj(entry).recommendations)
  ]);
  const inferred = [];
  if (supportFlags.needsStabilization) inferred.push("stabilization");
  if (supportFlags.needsContainment) inferred.push("containment");
  if (supportFlags.needsClarification) inferred.push("clarity");
  if (supportFlags.needsConnection) inferred.push("connection");
  if (supportFlags.forcedPositivity || supportFlags.minimization) inferred.push("gentle_probe");
  const emotion = _lower(emotionName);
  if (["sadness", "grief"].includes(emotion)) inferred.push("reassurance");
  if (["confusion", "uncertainty", "frustration"].includes(emotion)) inferred.push("orientation");
  if (["fear", "panic", "anxiety"].includes(emotion)) inferred.push("grounding");
  return _uniqStrings([...fromEntry, ...inferred]);
}

function _deriveSuppressionSignals(normalizedText) {
  const matches = { minimization: [], forcedPositivity: [], guardedness: [], deflection: [] };
  for (const [type, phrases] of Object.entries(SUPPRESSION_MARKERS)) {
    for (const phrase of phrases) {
      const normalizedPhrase = _normalizeText(phrase);
      if (normalizedPhrase && normalizedText.includes(normalizedPhrase)) matches[type].push(phrase);
    }
  }
  const present = Object.values(matches).some((arr) => arr.length > 0);
  return {
    present,
    minimization: matches.minimization.length > 0,
    forcedPositivity: matches.forcedPositivity.length > 0,
    guarded: matches.guardedness.length > 0 || matches.deflection.length > 0,
    matchedPhrases: _uniqStrings([...matches.minimization, ...matches.forcedPositivity, ...matches.guardedness, ...matches.deflection]),
    markers: matches
  };
}

function _deriveCues(matches, suppression) {
  const cues = [];
  for (const match of _safeArray(matches).slice(0, 3)) {
    for (const reason of _safeArray(match.reasons)) {
      if (reason && reason.value) cues.push(_trim(reason.value));
    }
    if (match.type) cues.push(`${match.type}_match`);
  }
  if (_safeObj(suppression).present) cues.push(..._safeArray(suppression.matchedPhrases));
  return _uniqStrings(cues).slice(0, 10);
}

function _confidence(primary, totalMatches, suppression) {
  if (!primary) return 0;
  const raw = Math.min(1, (Number(primary.score) || 0) / 12);
  const densityBoost = totalMatches > 1 ? 0.08 : 0;
  const suppressionAdjustment = _safeObj(suppression).present ? -0.04 : 0;
  return Number(Math.max(0, Math.min(1, raw + densityBoost + suppressionAdjustment)).toFixed(4));
}

function _buildEvidenceMatches(matches) {
  return _safeArray(matches).map((match, index) => {
    const emotion = _emotionName(match.entry);
    const valenceLabel = _inferValence(emotion, match.entry);
    const intensity = _inferIntensity(match.score, match.entry);
    return {
      id: `emotion-${index + 1}`,
      source: match.type,
      dataset: match.type === "label" ? "base_labels" : match.type === "pattern" ? "conversation_patterns" : "nuance_map",
      domain: "psychology",
      title: emotion,
      summary: _uniqStrings([emotion, ..._safeArray(match.reasons).map((reason) => reason.value)]).join(" | "),
      content: JSON.stringify(match.entry),
      score: Number(Math.max(0, Math.min(1, (match.score || 0) / 12)).toFixed(4)),
      confidence: Number(Math.max(0, Math.min(1, (match.score || 0) / 12)).toFixed(4)),
      tags: _uniqStrings(["emotion", valenceLabel, emotion, ..._safeArray(match.reasons).map((reason) => reason.type)]),
      recency: 0,
      emotionalRelevance: _normalizedIntensity(intensity),
      metadata: { reasons: match.reasons, originalType: match.type }
    };
  });
}

function _blendProfile(matches) {
  const top = _safeArray(matches).slice(0, 3);
  const total = top.reduce((sum, item) => sum + Math.max(0, Number(item.score) || 0), 0);
  if (!top.length || total <= 0) {
    return { dominantAxis: "neutral", weights: {}, supportShape: "steady" };
  }
  const weights = {};
  for (const item of top) {
    const emotion = _emotionName(item.entry);
    weights[emotion] = Number(((Math.max(0, Number(item.score) || 0) / total)).toFixed(4));
  }
  const dominantEmotion = _emotionName(top[0].entry);
  const supportShape = ["panic", "fear", "anxiety", "overwhelm"].includes(_lower(dominantEmotion)) ? "stabilize" : ["sadness", "grief", "loneliness", "hurt"].includes(_lower(dominantEmotion)) ? "validate" : ["frustration", "anger", "resentment"].includes(_lower(dominantEmotion)) ? "contain_and_clarify" : "steady";
  return {
    dominantAxis: dominantEmotion,
    weights,
    supportShape
  };
}

function _stateDrift(current, prior) {
  const currentEmotion = _trim(_safeObj(current).primaryEmotion || _safeObj(current).emotion || "");
  const previousEmotion = _trim(_safeObj(prior).primaryEmotion || _safeObj(prior).emotion || "");
  const currentIntensity = _clamp01(_safeObj(current).intensity, 0);
  const previousIntensity = _clamp01(_safeObj(prior).intensity, 0);
  const delta = Number((currentIntensity - previousIntensity).toFixed(4));
  let trend = "steady";
  if (!previousEmotion) trend = "new_signal";
  else if (currentEmotion && previousEmotion && currentEmotion !== previousEmotion) trend = delta >= 0.08 ? "shifted_and_escalating" : "shifted";
  else if (delta >= 0.08) trend = "escalating";
  else if (delta <= -0.08) trend = "deescalating";
  return {
    previousEmotion: previousEmotion || null,
    currentEmotion: currentEmotion || null,
    previousIntensity,
    currentIntensity,
    delta,
    trend,
    stable: trend === "steady"
  };
}

function buildLockedEmotionContract(result = {}) {
  const primary = _safeObj(result.primary);
  const contract = {
    source: FILE_NAME,
    version: VERSION,
    locked: true,
    domain: "emotion",
    matched: !!result.matched,
    primaryEmotion: _trim(result.primaryEmotion) || "neutral",
    secondaryEmotion: _trim(result.secondaryEmotion) || null,
    intensity: Number.isFinite(Number(result.intensity)) ? Number(result.intensity) : _normalizedIntensity(primary.intensity || 0),
    valence: Number.isFinite(Number(result.valence)) ? Number(result.valence) : _valenceNumeric(primary.valence || "mixed"),
    valenceLabel: _lower(primary.valence || (result.valence > 0 ? "positive" : result.valence < 0 ? "negative" : "mixed")) || "mixed",
    confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0,
    needs: _uniqStrings(result.needs),
    cues: _uniqStrings(result.cues),
    supportFlags: _safeObj(result.supportFlags),
    suppression: _safeObj(result.suppression),
    blendProfile: _safeObj(result.blendProfile),
    stateDrift: _safeObj(result.stateDrift),
    evidenceMatches: _safeArray(result.evidenceMatches),
    matches: _safeArray(result.matches),
    meta: _safeObj(result.meta)
  };
  contract.signature = `${contract.primaryEmotion}|${contract.secondaryEmotion || "none"}|${contract.intensity}|${contract.valenceLabel}`;
  return contract;
}

function _emptyResult(reason, dataset) {
  return {
    ok: true,
    domain: "emotion",
    matched: false,
    primary: null,
    primaryEmotion: "neutral",
    secondaryEmotion: null,
    intensity: 0,
    valence: 0,
    needs: [],
    cues: [],
    confidence: 0,
    evidenceMatches: [],
    matches: [],
    supportFlags: {},
    suppression: { present: false, minimization: false, forcedPositivity: false, guarded: false, matchedPhrases: [], markers: {} },
    blendProfile: { dominantAxis: "neutral", weights: {}, supportShape: "steady" },
    stateDrift: { previousEmotion: null, currentEmotion: "neutral", previousIntensity: 0, currentIntensity: 0, delta: 0, trend: "steady", stable: true },
    meta: {
      reason,
      sourceCounts: {
        labels: _safeArray(dataset.labels).length,
        patterns: _safeArray(dataset.patterns).length,
        nuance: _safeArray(dataset.nuance).length
      }
    }
  };
}

function _applyGuidedPromptBias(result = {}, input = {}) {
  const guidedPrompt = _extractGuidedPrompt(input);
  if (!guidedPrompt) return result;
  const next = _safeObj(result);
  const locked = _safeObj(next.lockedEmotion);
  const hint = _lower(guidedPrompt.emotionalHint);
  const primary = _lower(locked.primaryEmotion || next.primaryEmotion);
  const confidence = Number(next.confidence || locked.confidence || 0);
  const meta = _safeObj(next.meta);
  const linked = _uniqStrings([...(Array.isArray(meta.linkedDatasets) ? meta.linkedDatasets : []), "guided_prompt"]);
  const boosted = hint && primary && hint === primary ? Math.max(confidence, Math.min(1, confidence + 0.08)) : confidence;

  next.meta = {
    ...meta,
    guidedPrompt,
    guidedPromptSource: true,
    linkedDatasets: linked
  };
  next.confidence = boosted;
  next.lockedEmotion = {
    ...locked,
    confidence: boosted,
    meta: {
      ..._safeObj(locked.meta),
      guidedPrompt,
      guidedPromptSource: true,
      linkedDatasets: linked
    }
  };
  return next;
}

function retrieveEmotion(input = {}) {
  const text = _trim(input.text || input.userText || input.userQuery || input.query);
  const normalizedText = _normalizeText(text);
  const dataset = _ensureLoaded();

  if (!normalizedText) {
    const empty = _emptyResult("empty_text", dataset);
    empty.lockedEmotion = buildLockedEmotionContract(empty);
    return _applyGuidedPromptBias(empty, input);
  }

  const scored = [];

  for (const entry of _safeArray(dataset.labels)) {
    const scoredEntry = _scoreEntry(normalizedText, entry, "label");
    if (scoredEntry.score > 0) scored.push({ entry, score: scoredEntry.score, reasons: scoredEntry.reasons, type: "label" });
  }
  for (const entry of _safeArray(dataset.patterns)) {
    const scoredEntry = _scoreEntry(normalizedText, entry, "pattern");
    if (scoredEntry.score > 0) scored.push({ entry, score: scoredEntry.score, reasons: scoredEntry.reasons, type: "pattern" });
  }
  for (const entry of _safeArray(dataset.nuance)) {
    const scoredEntry = _scoreEntry(normalizedText, entry, "nuance");
    if (scoredEntry.score > 0) scored.push({ entry, score: scoredEntry.score, reasons: scoredEntry.reasons, type: "nuance" });
  }

  scored.sort((a, b) => b.score - a.score);
  const combined = scored.slice(0, Number(input.maxMatches) || 5);
  const primary = combined[0] || null;

  if (!primary) {
    const unmatched = _emptyResult("no_match", dataset);
    unmatched.lockedEmotion = buildLockedEmotionContract(unmatched);
    return _applyGuidedPromptBias(unmatched, input);
  }

  const primaryEmotion = _emotionName(primary.entry);
  const secondaryEmotion = combined[1] ? _emotionName(combined[1].entry) : null;
  const valenceLabel = _inferValence(primaryEmotion, primary.entry);
  const intensityRaw = _inferIntensity(primary.score, primary.entry);
  const suppression = _deriveSuppressionSignals(normalizedText);
  const supportFlags = _supportFlags(primaryEmotion, valenceLabel, intensityRaw, suppression);
  const blendProfile = _blendProfile(combined);
  const matches = combined.map((item) => {
    const emotion = _emotionName(item.entry);
    return {
      emotion,
      valence: _inferValence(emotion, item.entry),
      intensity: _inferIntensity(item.score, item.entry),
      score: item.score,
      type: item.type,
      reasons: item.reasons,
      entry: item.entry
    };
  });
  const normalizedIntensity = _normalizedIntensity(intensityRaw);
  const stateDrift = _stateDrift({ primaryEmotion, intensity: normalizedIntensity }, _extractPriorEmotion(input));

  const result = {
    ok: true,
    domain: "emotion",
    matched: true,
    primary: {
      emotion: primaryEmotion,
      valence: valenceLabel,
      intensity: intensityRaw,
      score: primary.score,
      type: primary.type,
      reasons: primary.reasons,
      entry: primary.entry
    },
    primaryEmotion,
    secondaryEmotion,
    intensity: normalizedIntensity,
    valence: _valenceNumeric(valenceLabel),
    needs: _deriveNeeds(primaryEmotion, supportFlags, primary.entry),
    cues: _deriveCues(combined, suppression),
    confidence: _confidence(primary, combined.length, suppression),
    evidenceMatches: _buildEvidenceMatches(combined),
    matches,
    supportFlags,
    suppression,
    blendProfile,
    stateDrift,
    meta: {
      source: FILE_NAME,
      version: VERSION,
      sourceCounts: {
        labels: _safeArray(dataset.labels).length,
        patterns: _safeArray(dataset.patterns).length,
        nuance: _safeArray(dataset.nuance).length
      },
      normalizedText,
      schemaLoaded: Object.keys(_safeObj(dataset.schema)).length > 0,
      linkedDatasets: Object.keys(_safeObj(dataset.sources)).map((name) => name.replace(/\.json$/i, "")),
      sourcePaths: dataset.sources
    }
  };

  result.lockedEmotion = buildLockedEmotionContract(result);
  result.turnSignals = {
    stateSpineCompatible: true,
    emotionPrimary: _lower(result.primaryEmotion || "neutral") || "neutral",
    emotionDominant: _lower(result.primaryEmotion || "neutral") || "neutral",
    emotionCluster: result.supportFlags && result.supportFlags.highDistress ? "high_distress" : (result.matched ? "emotional" : "neutral"),
    emotionNeedCrisis: !!(result.supportFlags && result.supportFlags.crisis),
    emotionNeedSoft: !!(result.supportFlags && (result.supportFlags.highDistress || result.supportFlags.needsStabilization || result.supportFlags.needsContainment)),
    emotionShouldSuppressMenus: !!(result.supportFlags && (result.supportFlags.crisis || result.supportFlags.highDistress || result.supportFlags.needsContainment)),
    emotionSupportLock: !!(result.supportFlags && (result.supportFlags.crisis || result.supportFlags.highDistress || result.supportFlags.needsContainment)),
    enginePrimaryState: _lower(result.primaryEmotion || "focused") || "focused",
    engineSecondaryState: _lower(result.secondaryEmotion || "steady") || "steady",
    engineContinuityScore: _clamp01(result.confidence, 0.35),
    enginePresenceState: result.supportFlags && result.supportFlags.highDistress ? "steadying" : "receptive",
    engineListenerMode: result.supportFlags && result.supportFlags.needsClarification ? "clarifying" : "attuned"
  };
  result.stateSpinePatch = {
    source: FILE_NAME,
    schema: "nyx.marion.stateSpine/1.6",
    shouldAdvanceState: false,
    emotionKey: result.turnSignals.emotionPrimary,
    emotionCluster: result.turnSignals.emotionCluster,
    continuityScore: result.turnSignals.engineContinuityScore
  };
  return _applyGuidedPromptBias(result, input);
}

function retrieveEmotionSafe(input = {}) {
  try {
    return retrieveEmotion(input);
  } catch (error) {
    const degraded = _emptyResult("retriever_error", { labels: [], patterns: [], nuance: [] });
    degraded.meta.error = _trim(error && (error.message || error));
    degraded.lockedEmotion = buildLockedEmotionContract(degraded);
    return degraded;
  }
}

module.exports = {
  VERSION,
  retrieveEmotion: retrieveEmotionSafe,
  retrieve: retrieveEmotionSafe,
  buildLockedEmotionContract
};
