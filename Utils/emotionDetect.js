
"use strict";

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const DEFAULT_SOURCES = [
  path.join(RUNTIME_ROOT, "base_labels.json"),
  path.join(RUNTIME_ROOT, "conversation_patterns.json"),
  path.join(RUNTIME_ROOT, "emotion_analysis_schema.json"),
  path.join(RUNTIME_ROOT, "nuance_map.json")
];

let _cache = { sources: {}, loaded: false, dataset: { labels: {}, patterns: [], schema: {}, nuance: {} } };

function _exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function _mtime(p) { try { return fs.statSync(p).mtimeMs || 0; } catch { return 0; } }
function _readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _str(v) { return v == null ? "" : String(v); }
function _trim(v) { return _str(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _normalizeText(text) { return _lower(text).replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim(); }
function _containsPhrase(haystack, phrase) { const h = _normalizeText(haystack); const p = _normalizeText(phrase); return !!p && h.includes(p); }

function _ensureLoaded() {
  let shouldReload = !_cache.loaded;
  for (const src of DEFAULT_SOURCES) { const current = _mtime(src); if ((_cache.sources[src] || 0) !== current) shouldReload = true; }
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
  if (/\b(depressed|hopeless|empty|numb)\b/.test(t)) return { primary: "depressed", secondary: "hopelessness", intensity: 0.86, confidence: 0.86 };
  if (/\b(sad|grief|heartbroken|down)\b/.test(t)) return { primary: "sadness", secondary: "hurt", intensity: 0.72, confidence: 0.8 };
  if (/\b(panic|panicking)\b/.test(t)) return { primary: "panic", secondary: "anxiety", intensity: 0.88, confidence: 0.86 };
  if (/\b(anxious|worried|overwhelmed)\b/.test(t)) return { primary: "anxiety", secondary: "fear", intensity: 0.76, confidence: 0.82 };
  if (/\b(afraid|terrified|scared)\b/.test(t)) return { primary: "fear", secondary: "anxiety", intensity: 0.78, confidence: 0.82 };
  if (/\b(angry|furious|frustrated|pissed)\b/.test(t)) return { primary: "anger", secondary: "frustration", intensity: 0.7, confidence: 0.82 };
  if (/\b(happy|great|excited|grateful|relieved)\b/.test(t)) return { primary: "joy", secondary: "relief", intensity: 0.62, confidence: 0.78 };
  return { primary: "neutral", secondary: "informational", intensity: 0.18, confidence: 0.62 };
}

function detectEmotion(input = {}) {
  const text = _trim(typeof input === "string" ? input : (input.text || input.message || ""));
  const dataset = _ensureLoaded();
  const hits = _scorePatterns(text, dataset.patterns);
  const best = hits[0];
  const base = best ? {
    primary: _lower(best.emotion_bias || "neutral"),
    secondary: _lower(best.nuance_bias || "informational"),
    intensity: Number(best.weight || 0.5),
    confidence: Math.min(0.95, Number(best.weight || 0.5) + 0.08)
  } : _fallbackEmotion(text);

  const nuanceDef = _safeObj(dataset.nuance[base.primary]);
  const crisisSignals = /\b(can't go on|cannot go on|want to die|kill myself|end it all|hurt myself|suicide|self harm)\b/i.test(text);
  const supportFlags = {
    crisis: crisisSignals,
    highDistress: crisisSignals || base.intensity >= 0.8 || /\b(depressed|hopeless|can't go on|nothing matters)\b/i.test(text),
    needsContainment: crisisSignals || base.intensity >= 0.72,
    needsStabilization: crisisSignals || ["fear","anxiety","panic","overwhelm","sadness","depressed","anger"].includes(base.primary) && base.intensity >= 0.65,
    vulnerable: ["fear","anxiety","panic","sadness","depressed"].includes(base.primary)
  };

  return {
    emotion: {
      primary: base.primary,
      secondary: base.secondary,
      confidence: base.confidence,
      intensity: base.intensity
    },
    blend_profile: {
      weights: { [base.primary]: Number(Math.max(0.55, base.intensity).toFixed(2)), ...(base.secondary && base.secondary !== "informational" ? { [base.secondary]: Number((1 - Math.max(0.55, base.intensity)).toFixed(2)) } : {}) },
      dominant_axis: _safeArray(nuanceDef.blend_axes)[0] || "low_signal_state"
    },
    nuance: {
      subtype: base.secondary,
      social_pattern: _safeArray(nuanceDef.social_patterns)[0] || null,
      suppression_signal: best ? best.suppression_signal || null : null,
      risk_flags: _safeArray(nuanceDef.risk_flags).slice(0, 3)
    },
    state_drift: { previous_emotion: "", current_emotion: base.primary, trend: "stable", stability: 0.72, volatility: 1 - Math.min(0.9, base.intensity) },
    psychology: {
      interpretation: ["sadness", "depressed"].includes(base.primary) ? "possible emotional heaviness with withdrawal risk" : ["fear", "anxiety", "panic"].includes(base.primary) ? "possible activation and uncertainty requiring containment" : "stable informational posture",
      care_mode: base.primary === "joy" ? "affirmation_first" : "validation_first",
      care_sequence: _safeArray(nuanceDef.care_sequence_defaults).length ? nuanceDef.care_sequence_defaults : ["validate","stabilize","explore"]
    },
    support: {
      tone: ["sadness", "depressed"].includes(base.primary) ? "gentle" : ["fear", "anxiety", "panic"].includes(base.primary) ? "steady" : "clear",
      followup: base.primary !== "neutral",
      advice_level: base.intensity >= 0.75 ? "low" : "medium",
      timing_profile: _safeObj(nuanceDef.timing_profile)
    },
    guard: { diagnosis_block: true, safe_to_continue: !crisisSignals, escalation_required: crisisSignals },
    marion_handoff: {
      locked_emotion: {
        primaryEmotion: base.primary,
        secondaryEmotion: base.secondary,
        intensity: base.intensity,
        confidence: base.confidence,
        supportFlags
      }
    }
  };
}

module.exports = { detectEmotion, analyze: detectEmotion, detect: detectEmotion };
