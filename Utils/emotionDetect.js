"use strict";

const fs = require("fs");
const path = require("path");

const VERSION = "emotionDetect v5.1.0 DATASET-CONTRACT-LOCKED";
const RUNTIME_ROOT = __dirname;
const DEFAULT_SOURCES = [
  path.join(RUNTIME_ROOT, "base_labels.json"),
  path.join(RUNTIME_ROOT, "conversation_patterns.json"),
  path.join(RUNTIME_ROOT, "emotion_analysis_schema.json"),
  path.join(RUNTIME_ROOT, "nuance_map.json")
];

let _cache = {
  sources: {},
  loaded: false,
  dataset: { labels: {}, patterns: [], schema: {}, nuance: {} }
};

function _exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function _mtime(p) { try { return fs.statSync(p).mtimeMs || 0; } catch { return 0; } }
function _readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _str(v) { return v == null ? "" : String(v); }
function _trim(v) { return _str(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}
function _normalizeText(text) {
  return _lower(text)
    .replace(/\bcan'?t\b/g, "cannot")
    .replace(/\bi'?m\b/g, "i am")
    .replace(/[^a-z0-9\s'?-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function _containsPhrase(haystack, phrase) {
  const h = _normalizeText(haystack);
  const p = _normalizeText(phrase);
  return !!p && h.includes(p);
}

function _ensureLoaded() {
  let shouldReload = !_cache.loaded;
  for (const src of DEFAULT_SOURCES) {
    const current = _mtime(src);
    if ((_cache.sources[src] || 0) !== current) shouldReload = true;
  }
  if (!shouldReload) return _cache.dataset;

  let labels = {}, patterns = [], schema = {}, nuance = {};
  for (const src of DEFAULT_SOURCES) {
    if (!_exists(src)) continue;
    const data = _readJson(src);
    _cache.sources[src] = _mtime(src);
    if (!data) continue;
    const name = path.basename(src).toLowerCase();
    if (name === "base_labels.json") labels = _safeObj(data);
    if (name === "conversation_patterns.json") patterns = _safeArray(data.patterns);
    if (name === "emotion_analysis_schema.json") schema = _safeObj(data);
    if (name === "nuance_map.json") nuance = _safeObj(data);
  }
  _cache.dataset = { labels, patterns, schema, nuance };
  _cache.loaded = true;
  return _cache.dataset;
}

function _scorePatterns(text, patterns) {
  const hits = [];
  for (const pattern of _safeArray(patterns)) {
    const phrases = _safeArray(pattern.phrases);
    if (phrases.some((p) => _containsPhrase(text, p))) hits.push(pattern);
  }
  return hits.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
}

function _fallbackEmotion(text) {
  const t = _normalizeText(text);
  if (/\b(depressed|hopeless|empty|numb|shut down)\b/.test(t)) return { primary: "depressed", secondary: "hopelessness", intensity: 0.86, confidence: 0.86 };
  if (/\b(grief|grieving|mourning|heartbroken)\b/.test(t)) return { primary: "grief", secondary: "hurt", intensity: 0.82, confidence: 0.85 };
  if (/\b(sad|down|low|crying)\b/.test(t)) return { primary: "sadness", secondary: "hurt", intensity: 0.72, confidence: 0.8 };
  if (/\b(panic|panicking)\b/.test(t)) return { primary: "panic", secondary: "anxiety", intensity: 0.88, confidence: 0.86 };
  if (/\b(anxious|worried|overwhelmed|spiraling|spiralling)\b/.test(t)) return { primary: "anxiety", secondary: "fear", intensity: 0.76, confidence: 0.82 };
  if (/\b(afraid|terrified|scared)\b/.test(t)) return { primary: "fear", secondary: "anxiety", intensity: 0.78, confidence: 0.82 };
  if (/\b(ashamed|shame|embarrassed)\b/.test(t)) return { primary: "shame", secondary: "self-criticism", intensity: 0.69, confidence: 0.79 };
  if (/\b(guilty|guilt|my fault)\b/.test(t)) return { primary: "guilt", secondary: "repair", intensity: 0.66, confidence: 0.78 };
  if (/\b(alone|lonely|isolated|disconnected)\b/.test(t)) return { primary: "loneliness", secondary: "withdrawal", intensity: 0.67, confidence: 0.77 };
  if (/\b(confused|unclear|mixed up)\b/.test(t)) return { primary: "confusion", secondary: "uncertainty", intensity: 0.52, confidence: 0.73 };
  if (/\b(angry|furious|frustrated|pissed|irritated)\b/.test(t)) return { primary: "anger", secondary: "frustration", intensity: 0.7, confidence: 0.82 };
  if (/\b(relieved)\b/.test(t)) return { primary: "relief", secondary: "calm", intensity: 0.58, confidence: 0.77 };
  if (/\b(happy|great|excited|grateful|thankful)\b/.test(t)) return { primary: "joy", secondary: "relief", intensity: 0.62, confidence: 0.78 };
  return { primary: "neutral", secondary: "informational", intensity: 0.18, confidence: 0.62 };
}

function _nuanceKey(primary) {
  const p = _lower(primary);
  if (["depressed", "grief", "loneliness", "hopelessness", "emotional_numbness"].includes(p)) return "sadness";
  if (["anxiety", "panic", "overwhelm", "uncertainty", "hypervigilance"].includes(p)) return "fear";
  if (["frustration", "resentment", "moral_injury", "boundary_activation"].includes(p)) return "anger";
  if (["relief", "gratitude", "excitement", "contentment"].includes(p)) return "joy";
  if (["confusion", "shock", "amazement"].includes(p)) return "surprise";
  if (["revulsion", "rejection", "moral_disgust"].includes(p)) return "disgust";
  if (["flat", "informational", "guarded", "unclear"].includes(p)) return "neutral";
  if (["shame", "guilt"].includes(p)) return "sadness";
  return p || "neutral";
}

function _canonicalPrimary(primary) {
  const p = _lower(primary);
  const core = ["anger", "joy", "sadness", "fear", "surprise", "disgust", "neutral"];
  return core.includes(p) ? p : _nuanceKey(p);
}

function _deriveValence(primary) {
  if (["joy", "gratitude", "relief", "hope", "excitement", "calm"].includes(primary)) return 0.6;
  if (["neutral", "confusion"].includes(primary)) return 0;
  return -0.6;
}

function _buildSupportFlags(primary, intensity, text) {
  const crisisSignals = /\b(cannot go on|can't go on|want to die|kill myself|end it all|hurt myself|suicide|self harm)\b/i.test(text);
  const highDistressLex = /\b(depressed|hopeless|nothing matters|empty|numb|panic|panicking)\b/i.test(text);
  const vulnerableSet = ["fear", "anxiety", "panic", "sadness", "depressed", "grief", "loneliness", "shame", "guilt"];
  const stabilizationSet = ["fear", "anxiety", "panic", "overwhelm", "sadness", "depressed", "grief", "anger", "frustration"];
  const supportFlags = {
    crisis: crisisSignals,
    highDistress: crisisSignals || intensity >= 0.8 || highDistressLex,
    needsContainment: crisisSignals || intensity >= 0.72 || vulnerableSet.includes(primary),
    needsGentlePacing: crisisSignals || intensity >= 0.67 || vulnerableSet.includes(primary),
    needsStabilization: crisisSignals || (stabilizationSet.includes(primary) && intensity >= 0.6),
    vulnerable: vulnerableSet.includes(primary),
    preferNoQuestion: crisisSignals || ["panic", "grief", "depressed"].includes(primary),
    canChannelForward: ["joy", "gratitude", "relief", "hope", "excitement", "calm"].includes(primary)
  };
  return supportFlags;
}

function detectEmotion(input = {}) {
  const source = typeof input === "string" ? { text: input } : _safeObj(input);
  const text = _trim(source.text || source.message || source.userText || "");
  const dataset = _ensureLoaded();
  const hits = _scorePatterns(text, dataset.patterns);
  const best = hits[0];
  const base = best ? {
    primary: _lower(best.emotion_bias || "neutral"),
    secondary: _lower(best.nuance_bias || "informational"),
    intensity: _clamp(Number(best.weight || 0.5), 0, 1),
    confidence: _clamp(Number(best.weight || 0.5) + 0.08, 0, 0.95)
  } : _fallbackEmotion(text);

  const nuanceKey = _nuanceKey(base.primary);
  const canonicalPrimary = _canonicalPrimary(base.primary);
  const nuanceDef = _safeObj(dataset.nuance[nuanceKey]);
  const supportFlags = _buildSupportFlags(base.primary, base.intensity, text);
  const valence = _deriveValence(base.primary);
  const dominantWeight = Number(Math.max(0.55, base.intensity).toFixed(2));
  const secondaryWeight = Number((1 - dominantWeight).toFixed(2));

  const lockedEmotion = {
    primaryEmotion: base.primary,
    secondaryEmotion: base.secondary,
    intensity: base.intensity,
    confidence: base.confidence,
    valence,
    supportFlags
  };

  return {
    ok: true,
    version: VERSION,
    emotion: {
      primary: base.primary,
      secondary: base.secondary,
      confidence: base.confidence,
      intensity: base.intensity,
      valence
    },
    lockedEmotion,
    blend_profile: {
      weights: {
        [canonicalPrimary]: dominantWeight,
        ...(base.secondary && base.secondary !== "informational" ? { [base.secondary]: secondaryWeight } : {})
      },
      dominant_axis: _safeArray(nuanceDef.blend_axes)[0] || "low_signal_state",
      nuance_key: nuanceKey
    },
    nuance: {
      subtype: base.secondary,
      family: nuanceKey,
      social_pattern: _safeArray(nuanceDef.social_patterns)[0] || null,
      suppression_signal: best ? best.suppression_signal || null : null,
      risk_flags: _safeArray(nuanceDef.risk_flags).slice(0, 3)
    },
    state_drift: {
      previous_emotion: _lower(source.previousEmotion || source.priorEmotion || ""),
      current_emotion: base.primary,
      trend: "stable",
      stability: 0.72,
      volatility: 1 - Math.min(0.9, base.intensity)
    },
    psychology: {
      interpretation: ["sadness", "depressed", "grief", "loneliness"].includes(base.primary)
        ? "possible emotional heaviness with withdrawal risk"
        : ["fear", "anxiety", "panic", "overwhelm"].includes(base.primary)
          ? "possible activation and uncertainty requiring containment"
          : "stable informational posture",
      care_mode: base.primary === "joy" ? "affirmation_first" : "validation_first",
      care_sequence: _safeArray(nuanceDef.care_sequence_defaults).length
        ? nuanceDef.care_sequence_defaults
        : ["validate", "stabilize", "explore"]
    },
    support: {
      tone: ["sadness", "depressed", "grief", "loneliness"].includes(base.primary)
        ? "gentle"
        : ["fear", "anxiety", "panic", "overwhelm"].includes(base.primary)
          ? "steady"
          : "clear",
      followup: base.primary !== "neutral",
      advice_level: base.intensity >= 0.75 ? "low" : "medium",
      timing_profile: _safeObj(nuanceDef.timing_profile)
    },
    guard: {
      diagnosis_block: true,
      safe_to_continue: !supportFlags.crisis,
      escalation_required: supportFlags.crisis
    },
    marion_handoff: {
      locked_emotion: lockedEmotion,
      state_spine: {
        emotionPrimary: base.primary,
        emotionSecondary: base.secondary,
        emotionValence: valence,
        emotionIntensity: base.intensity,
        emotionSupportMode: supportFlags.crisis ? "contain" : supportFlags.highDistress ? "stabilize" : "maintain"
      }
    },
    diagnostics: {
      patternMatchCount: hits.length,
      usedPatternMatch: !!best,
      textLength: text.length
    }
  };
}

module.exports = {
  VERSION,
  detectEmotion,
  analyze: detectEmotion,
  detect: detectEmotion
};
