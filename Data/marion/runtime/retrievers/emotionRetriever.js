"use strict";

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..", "..");
const EMOTION_ROOT = path.resolve(MARION_ROOT, "..", "..", "emotion");

const DEFAULT_SOURCES = [
  path.join(EMOTION_ROOT, "base_labels.json"),
  path.join(EMOTION_ROOT, "conversation_patterns.json"),
  path.join(EMOTION_ROOT, "emotion_analysis_schema.json"),
  path.join(EMOTION_ROOT, "nuance_map.json")
];

let _cache = {
  sources: {},
  loaded: false,
  dataset: {
    labels: [],
    patterns: [],
    schema: {},
    nuance: []
  }
};

function _exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function _mtime(p) {
  try {
    return fs.statSync(p).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function _readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _str(v) {
  return v == null ? "" : String(v);
}

function _trim(v) {
  return _str(v).trim();
}

function _lower(v) {
  return _trim(v).toLowerCase();
}

function _normalizeText(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _containsPhrase(haystack, phrase) {
  const h = _normalizeText(haystack);
  const p = _normalizeText(phrase);
  return !!p && h.includes(p);
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
    for (const v of Object.values(value)) _flattenStrings(v, out);
    return out;
  }

  return out;
}

function _uniqStrings(arr) {
  return [...new Set(_safeArray(arr).map((x) => _trim(x)).filter(Boolean))];
}

function _ensureLoaded() {
  let shouldReload = !_cache.loaded;

  for (const src of DEFAULT_SOURCES) {
    const current = _mtime(src);
    if ((_cache.sources[src] || 0) !== current) {
      shouldReload = true;
    }
  }

  if (!shouldReload) return _cache.dataset;

  const labels = [];
  const patterns = [];
  let schema = {};
  const nuance = [];

  for (const src of DEFAULT_SOURCES) {
    if (!_exists(src)) continue;

    const data = _readJson(src);
    _cache.sources[src] = _mtime(src);

    const name = path.basename(src).toLowerCase();

    if (name === "base_labels.json") {
      if (Array.isArray(data)) {
        for (const item of data) labels.push(item);
      } else if (data && typeof data === "object") {
        for (const [label, value] of Object.entries(data)) {
          labels.push({
            label,
            ..._safeObj(value)
          });
        }
      }
    }

    if (name === "conversation_patterns.json") {
      if (Array.isArray(data)) {
        for (const item of data) patterns.push(item);
      } else if (data && typeof data === "object") {
        for (const [pattern, value] of Object.entries(data)) {
          patterns.push({
            pattern,
            ..._safeObj(value)
          });
        }
      }
    }

    if (name === "emotion_analysis_schema.json") {
      schema = _safeObj(data);
    }

    if (name === "nuance_map.json") {
      if (Array.isArray(data)) {
        for (const item of data) nuance.push(item);
      } else if (data && typeof data === "object") {
        for (const [topic, value] of Object.entries(data)) {
          nuance.push({
            topic,
            ..._safeObj(value)
          });
        }
      }
    }
  }

  _cache.dataset = {
    labels,
    patterns,
    schema,
    nuance
  };
  _cache.loaded = true;

  return _cache.dataset;
}

function _extractCandidatesFromLabel(entry) {
  const obj = _safeObj(entry);
  return _uniqStrings([
    obj.label,
    obj.name,
    ..._flattenStrings(obj.keywords),
    ..._flattenStrings(obj.signals),
    ..._flattenStrings(obj.aliases),
    ..._flattenStrings(obj.examples)
  ]);
}

function _extractCandidatesFromPattern(entry) {
  const obj = _safeObj(entry);
  return _uniqStrings([
    obj.pattern,
    obj.label,
    obj.emotion,
    ..._flattenStrings(obj.keywords),
    ..._flattenStrings(obj.signals),
    ..._flattenStrings(obj.examples),
    ..._flattenStrings(obj.triggers)
  ]);
}

function _extractCandidatesFromNuance(entry) {
  const obj = _safeObj(entry);
  return _uniqStrings([
    obj.topic,
    obj.label,
    obj.emotion,
    ..._flattenStrings(obj.keywords),
    ..._flattenStrings(obj.signals),
    ..._flattenStrings(obj.examples),
    ..._flattenStrings(obj.related)
  ]);
}

function _scoreEntry(text, entry, candidateExtractor, type) {
  const candidates = candidateExtractor(entry);
  let score = 0;
  const reasons = [];

  for (const c of candidates) {
    if (_containsPhrase(text, c)) {
      const weight =
        type === "label" ? 5 :
        type === "pattern" ? 4 :
        type === "nuance" ? 3 : 2;

      score += weight;
      reasons.push({
        type,
        value: c,
        weight
      });
    }
  }

  return { score, reasons };
}

function _emotionNameFromEntry(entry) {
  const obj = _safeObj(entry);
  return (
    _trim(obj.label) ||
    _trim(obj.emotion) ||
    _trim(obj.name) ||
    _trim(obj.pattern) ||
    _trim(obj.topic) ||
    "unknown"
  );
}

function _buildSupportFlags(emotionName, valence, intensity) {
  const e = _lower(emotionName);
  const v = _lower(valence);

  const highDistressSet = new Set([
    "panic",
    "fear",
    "despair",
    "overwhelm",
    "shame",
    "rage",
    "grief",
    "distress"
  ]);

  const positiveSet = new Set([
    "joy",
    "relief",
    "hope",
    "gratitude",
    "confidence",
    "calm",
    "pride"
  ]);

  return {
    needsStabilization: highDistressSet.has(e) || intensity >= 7,
    needsContainment: e === "panic" || e === "rage" || intensity >= 8,
    needsClarification: e === "confusion" || e === "ambivalence" || e === "uncertainty",
    needsConnection: e === "loneliness" || e === "grief" || e === "sadness" || e === "shame",
    highDistress: highDistressSet.has(e) || v === "negative",
    crisis: false,
    recoveryPresent: e === "relief" || e === "hope" || e === "calm",
    positivePresent: positiveSet.has(e) || v === "positive"
  };
}

function _inferValence(emotionName, entry) {
  const obj = _safeObj(entry);
  const explicit =
    _trim(obj.valence) ||
    _trim(obj.sentiment) ||
    _trim(obj.polarity);

  if (explicit) return _lower(explicit);

  const e = _lower(emotionName);
  if (["joy", "relief", "gratitude", "hope", "confidence", "calm", "pride"].includes(e)) return "positive";
  if (["sadness", "fear", "panic", "shame", "rage", "grief", "overwhelm", "distress", "loneliness"].includes(e)) return "negative";
  return "mixed";
}

function _inferIntensity(score, entry) {
  const obj = _safeObj(entry);
  const explicit = Number(obj.intensity);
  if (Number.isFinite(explicit)) {
    return Math.max(1, Math.min(10, Math.round(explicit)));
  }

  if (score >= 12) return 8;
  if (score >= 8) return 6;
  if (score >= 4) return 4;
  return 2;
}

function _sortScored(arr) {
  return arr
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

function retrieveEmotion(input = {}) {
  const text = _trim(input.text || input.userText || input.query);
  const normalizedText = _normalizeText(text);

  if (!normalizedText) {
    return {
      ok: true,
      domain: "emotion",
      matched: false,
      primary: null,
      matches: [],
      supportFlags: {},
      meta: {
        reason: "empty_text"
      }
    };
  }

  const dataset = _ensureLoaded();

  const scoredLabels = _sortScored(
    _safeArray(dataset.labels).map((entry) => {
      const { score, reasons } = _scoreEntry(normalizedText, entry, _extractCandidatesFromLabel, "label");
      return { entry, score, reasons, type: "label" };
    })
  );

  const scoredPatterns = _sortScored(
    _safeArray(dataset.patterns).map((entry) => {
      const { score, reasons } = _scoreEntry(normalizedText, entry, _extractCandidatesFromPattern, "pattern");
      return { entry, score, reasons, type: "pattern" };
    })
  );

  const scoredNuance = _sortScored(
    _safeArray(dataset.nuance).map((entry) => {
      const { score, reasons } = _scoreEntry(normalizedText, entry, _extractCandidatesFromNuance, "nuance");
      return { entry, score, reasons, type: "nuance" };
    })
  );

  const combined = []
    .concat(scoredLabels, scoredPatterns, scoredNuance)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(input.maxMatches) || 5);

  const primary = combined[0] || null;

  if (!primary) {
    return {
      ok: true,
      domain: "emotion",
      matched: false,
      primary: null,
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
  }

  const emotionName = _emotionNameFromEntry(primary.entry);
  const valence = _inferValence(emotionName, primary.entry);
  const intensity = _inferIntensity(primary.score, primary.entry);
  const supportFlags = _buildSupportFlags(emotionName, valence, intensity);

  return {
    ok: true,
    domain: "emotion",
    matched: true,
    primary: {
      emotion: emotionName,
      valence,
      intensity,
      score: primary.score,
      type: primary.type,
      reasons: primary.reasons,
      entry: primary.entry
    },
    matches: combined.map((m) => {
      const emotion = _emotionNameFromEntry(m.entry);
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
      }
    }
  };
}

module.exports = {
  retrieveEmotion
};
