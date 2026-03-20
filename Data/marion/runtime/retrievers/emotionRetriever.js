"use strict";

const fs = require("fs");
const path = require("path");

const VERSION = "emotionRetriever v2.1.0 LOCKED-EMOTION-CONTRACT";
const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..", "..");
const EMOTION_ROOT = path.resolve(MARION_ROOT, "..", "..", "emotion");

const DEFAULT_SOURCES = [
  path.join(EMOTION_ROOT, "base_labels.json"),
  path.join(EMOTION_ROOT, "conversation_patterns.json"),
  path.join(EMOTION_ROOT, "emotion_analysis_schema.json"),
  path.join(EMOTION_ROOT, "nuance_map.json")
];

const FALLBACK_LABELS = [
  { label: "anxiety", keywords: ["anxious", "worried", "nervous", "spiraling", "on edge"], valence: "negative", intensity: 7, supportNeeds: ["grounding", "stabilization"] },
  { label: "sadness", keywords: ["sad", "down", "hurt", "grief", "lonely", "heartbroken"], valence: "negative", intensity: 6, supportNeeds: ["connection", "reassurance"] },
  { label: "frustration", keywords: ["frustrated", "annoyed", "fed up", "stuck", "broken", "not working"], valence: "negative", intensity: 6, supportNeeds: ["clarity", "unblocking"] },
  { label: "confusion", keywords: ["confused", "unclear", "lost", "not sure", "explain"], valence: "mixed", intensity: 4, supportNeeds: ["clarity", "orientation"] },
  { label: "joy", keywords: ["happy", "joy", "delighted", "glad", "great"], valence: "positive", intensity: 6, supportNeeds: ["anchoring"] },
  { label: "gratitude", keywords: ["thank you", "thanks", "grateful", "appreciate"], valence: "positive", intensity: 4, supportNeeds: ["affirmation"] },
  { label: "calm", keywords: ["calm", "peaceful", "settled", "grounded"], valence: "positive", intensity: 3, supportNeeds: ["anchoring"] },
  { label: "overwhelm", keywords: ["overwhelmed", "too much", "flooded", "drowning"], valence: "negative", intensity: 8, supportNeeds: ["containment", "stabilization"] },
  { label: "fear", keywords: ["afraid", "scared", "terrified", "fear"], valence: "negative", intensity: 8, supportNeeds: ["grounding", "containment"] },
  { label: "panic", keywords: ["panic", "panicking", "freaking out", "cannot breathe"], valence: "negative", intensity: 9, supportNeeds: ["containment", "stabilization"] }
];

let _cache = {
  loaded: false,
  dataset: { labels: [], patterns: [], schema: {}, nuance: [] },
  sources: {}
};

function _exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function _mtime(p) { try { return fs.statSync(p).mtimeMs || 0; } catch { return 0; } }
function _readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _str(v) { return v == null ? "" : String(v); }
function _trim(v) { return _str(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _normalizeText(text) { return _lower(text).replace(/[^a-z0-9\s'’-]+/g, " ").replace(/\s+/g, " ").trim(); }
function _uniqStrings(arr) { return [...new Set(_safeArray(arr).map((x) => _trim(x)).filter(Boolean))]; }

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
  }
  return out;
}

function _ensureLoaded() {
  let shouldReload = !_cache.loaded;
  for (const src of DEFAULT_SOURCES) {
    const current = _mtime(src);
    if ((_cache.sources[src] || 0) !== current) shouldReload = true;
  }
  if (!shouldReload) return _cache.dataset;

  const dataset = { labels: [], patterns: [], schema: {}, nuance: [] };
  for (const src of DEFAULT_SOURCES) {
    if (!_exists(src)) continue;
    const data = _readJson(src);
    _cache.sources[src] = _mtime(src);
    const name = path.basename(src).toLowerCase();
    if (name === "base_labels.json") {
      if (Array.isArray(data)) dataset.labels.push(...data);
      else for (const [label, value] of Object.entries(_safeObj(data))) dataset.labels.push({ label, ..._safeObj(value) });
    } else if (name === "conversation_patterns.json") {
      if (Array.isArray(data)) dataset.patterns.push(...data);
      else for (const [pattern, value] of Object.entries(_safeObj(data))) dataset.patterns.push({ pattern, ..._safeObj(value) });
    } else if (name === "emotion_analysis_schema.json") {
      dataset.schema = _safeObj(data);
    } else if (name === "nuance_map.json") {
      if (Array.isArray(data)) dataset.nuance.push(...data);
      else for (const [topic, value] of Object.entries(_safeObj(data))) dataset.nuance.push({ topic, ..._safeObj(value) });
    }
  }

  if (!dataset.labels.length) dataset.labels = FALLBACK_LABELS.slice();
  _cache.loaded = true;
  _cache.dataset = dataset;
  return dataset;
}

function _candidates(entry) {
  const obj = _safeObj(entry);
  return _uniqStrings([
    obj.label,
    obj.name,
    obj.pattern,
    obj.topic,
    obj.emotion,
    ..._flattenStrings(obj.keywords),
    ..._flattenStrings(obj.signals),
    ..._flattenStrings(obj.aliases),
    ..._flattenStrings(obj.examples),
    ..._flattenStrings(obj.triggers),
    ..._flattenStrings(obj.related)
  ]);
}

function _scoreEntry(text, entry, type) {
  const candidates = _candidates(entry);
  let score = 0;
  const reasons = [];
  for (const value of candidates) {
    const phrase = _normalizeText(value);
    if (!phrase) continue;
    if (text.includes(phrase)) {
      const weight = type === "label" ? 5 : type === "pattern" ? 4 : 3;
      score += weight;
      reasons.push({ type, value, weight });
    }
  }
  return { score, reasons };
}

function _emotionName(entry) {
  const obj = _safeObj(entry);
  return _trim(obj.label) || _trim(obj.emotion) || _trim(obj.name) || _trim(obj.pattern) || _trim(obj.topic) || "neutral";
}

function _inferValence(emotionName, entry) {
  const obj = _safeObj(entry);
  const explicit = _lower(obj.valence || obj.sentiment || obj.polarity);
  if (explicit) return explicit;
  const e = _lower(emotionName);
  if (["joy", "relief", "gratitude", "hope", "confidence", "calm", "pride"].includes(e)) return "positive";
  if (["sadness", "fear", "panic", "shame", "rage", "grief", "overwhelm", "distress", "loneliness", "frustration", "anxiety"].includes(e)) return "negative";
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

function _supportFlags(emotionName, valence, intensity) {
  const e = _lower(emotionName);
  return {
    needsStabilization: ["panic", "fear", "despair", "overwhelm", "shame", "rage", "grief", "anxiety"].includes(e) || intensity >= 7,
    needsContainment: ["panic", "rage"].includes(e) || intensity >= 8,
    needsClarification: ["confusion", "ambivalence", "uncertainty", "frustration"].includes(e),
    needsConnection: ["loneliness", "grief", "sadness", "shame"].includes(e),
    highDistress: valence === "negative" || intensity >= 7,
    crisis: false,
    recoveryPresent: ["relief", "hope", "calm"].includes(e),
    positivePresent: valence === "positive"
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
  const e = _lower(emotionName);
  if (["sadness", "grief"].includes(e)) inferred.push("reassurance");
  if (["confusion", "uncertainty", "frustration"].includes(e)) inferred.push("orientation");
  if (["fear", "panic", "anxiety"].includes(e)) inferred.push("grounding");
  return _uniqStrings([...fromEntry, ...inferred]);
}

function _deriveCues(matches) {
  const cues = [];
  for (const match of _safeArray(matches).slice(0, 3)) {
    for (const reason of _safeArray(match.reasons)) if (reason && reason.value) cues.push(_trim(reason.value));
    if (match.type) cues.push(`${match.type}_match`);
  }
  return _uniqStrings(cues).slice(0, 8);
}

function _confidence(primary, totalMatches) {
  if (!primary) return 0;
  const raw = Math.min(1, (Number(primary.score) || 0) / 12);
  const densityBoost = totalMatches > 1 ? 0.08 : 0;
  return Number(Math.max(0, Math.min(1, raw + densityBoost)).toFixed(4));
}

function _intensityToNormalized(intensity) {
  const n = Number(intensity);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Number((n / 10).toFixed(4))));
}

function _valenceToNumeric(valence) {
  const v = _lower(valence);
  if (v === "positive") return 0.75;
  if (v === "negative") return -0.75;
  return 0;
}

function _buildEvidenceMatches(combined) {
  return _safeArray(combined).map((m, idx) => {
    const emotion = _emotionName(m.entry);
    const valence = _inferValence(emotion, m.entry);
    const intensity = _inferIntensity(m.score, m.entry);
    return {
      id: `emotion-${idx + 1}`,
      source: m.type,
      dataset: m.type === "label" ? "base_labels" : m.type === "pattern" ? "conversation_patterns" : "nuance_map",
      domain: "psychology",
      title: emotion,
      summary: _uniqStrings([emotion, ..._safeArray(m.reasons).map((r) => r.value)]).join(" | "),
      content: JSON.stringify(m.entry),
      score: Number(Math.max(0, Math.min(1, (m.score || 0) / 12)).toFixed(4)),
      confidence: Number(Math.max(0, Math.min(1, (m.score || 0) / 12)).toFixed(4)),
      tags: _uniqStrings(["emotion", valence, emotion, ..._safeArray(m.reasons).map((r) => r.type)]),
      recency: 0,
      emotionalRelevance: _intensityToNormalized(intensity),
      metadata: { reasons: m.reasons, originalType: m.type }
    };
  });
}

function buildLockedEmotionContract(result = {}) {
  const primary = _safeObj(result.primary);
  const contract = {
    source: "emotionRetriever",
    version: VERSION,
    locked: true,
    domain: "emotion",
    matched: !!result.matched,
    primaryEmotion: _trim(result.primaryEmotion) || "neutral",
    secondaryEmotion: _trim(result.secondaryEmotion) || null,
    intensity: Number.isFinite(Number(result.intensity)) ? Number(result.intensity) : _intensityToNormalized(primary.intensity || 0),
    valence: Number.isFinite(Number(result.valence)) ? Number(result.valence) : _valenceToNumeric(primary.valence || "mixed"),
    valenceLabel: _lower(primary.valence || (result.valence > 0 ? "positive" : result.valence < 0 ? "negative" : "mixed")) || "mixed",
    confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0,
    needs: _uniqStrings(result.needs),
    cues: _uniqStrings(result.cues),
    supportFlags: _safeObj(result.supportFlags),
    evidenceMatches: _safeArray(result.evidenceMatches),
    matches: _safeArray(result.matches),
    meta: _safeObj(result.meta)
  };
  contract.signature = `${contract.primaryEmotion}|${contract.secondaryEmotion || "none"}|${contract.intensity}|${contract.valenceLabel}`;
  return contract;
}

function retrieveEmotion(input = {}) {
  const text = _trim(input.text || input.userText || input.query);
  const normalizedText = _normalizeText(text);
  const dataset = _ensureLoaded();

  if (!normalizedText) {
    const empty = {
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
      meta: { reason: "empty_text" }
    };
    empty.lockedEmotion = buildLockedEmotionContract(empty);
    return empty;
  }

  const scored = [];
  for (const entry of _safeArray(dataset.labels)) {
    const { score, reasons } = _scoreEntry(normalizedText, entry, "label");
    if (score > 0) scored.push({ entry, score, reasons, type: "label" });
  }
  for (const entry of _safeArray(dataset.patterns)) {
    const { score, reasons } = _scoreEntry(normalizedText, entry, "pattern");
    if (score > 0) scored.push({ entry, score, reasons, type: "pattern" });
  }
  for (const entry of _safeArray(dataset.nuance)) {
    const { score, reasons } = _scoreEntry(normalizedText, entry, "nuance");
    if (score > 0) scored.push({ entry, score, reasons, type: "nuance" });
  }

  scored.sort((a, b) => b.score - a.score);
  const combined = scored.slice(0, Number(input.maxMatches) || 5);
  const primary = combined[0] || null;

  if (!primary) {
    const unmatched = {
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
      meta: {
        sourceCounts: {
          labels: _safeArray(dataset.labels).length,
          patterns: _safeArray(dataset.patterns).length,
          nuance: _safeArray(dataset.nuance).length
        }
      }
    };
    unmatched.lockedEmotion = buildLockedEmotionContract(unmatched);
    return unmatched;
  }

  const emotionName = _emotionName(primary.entry);
  const secondaryEmotion = combined[1] ? _emotionName(combined[1].entry) : null;
  const valenceLabel = _inferValence(emotionName, primary.entry);
  const intensityRaw = _inferIntensity(primary.score, primary.entry);
  const supportFlags = _supportFlags(emotionName, valenceLabel, intensityRaw);
  const result = {
    ok: true,
    domain: "emotion",
    matched: true,
    primary: {
      emotion: emotionName,
      valence: valenceLabel,
      intensity: intensityRaw,
      score: primary.score,
      type: primary.type,
      reasons: primary.reasons,
      entry: primary.entry
    },
    primaryEmotion: emotionName,
    secondaryEmotion,
    intensity: _intensityToNormalized(intensityRaw),
    valence: _valenceToNumeric(valenceLabel),
    needs: _deriveNeeds(emotionName, supportFlags, primary.entry),
    cues: _deriveCues(combined),
    confidence: _confidence(primary, combined.length),
    evidenceMatches: _buildEvidenceMatches(combined),
    matches: combined.map((m) => {
      const emotion = _emotionName(m.entry);
      return {
        emotion,
        valence: _inferValence(emotion, m.entry),
        intensity: _inferIntensity(m.score, m.entry),
        score: m.score,
        type: m.type,
        reasons: m.reasons,
        entry: m.entry
      };
    }),
    supportFlags,
    meta: {
      sourceCounts: {
        labels: _safeArray(dataset.labels).length,
        patterns: _safeArray(dataset.patterns).length,
        nuance: _safeArray(dataset.nuance).length
      },
      normalizedText,
      schemaLoaded: Object.keys(_safeObj(dataset.schema)).length > 0,
      linkedDatasets: ["base_labels", "conversation_patterns", "emotion_analysis_schema", "nuance_map"]
    }
  };
  result.lockedEmotion = buildLockedEmotionContract(result);
  return result;
}

module.exports = {
  VERSION,
  retrieveEmotion,
  retrieve: retrieveEmotion,
  buildLockedEmotionContract
};
