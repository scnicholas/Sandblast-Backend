"use strict";

/**
 * utils/chatTelemetryAdapter.js
 *
 * chatTelemetryAdapter v1.0.0
 * ------------------------------------------------------------
 * PURPOSE
 * - Extract dataset/telemetry helpers out of chatEngine.js
 * - Keep telemetry fail-open
 * - Provide one clean adapter surface for:
 *   - getDatasetStats()
 *   - searchDataset(query, opts)
 *   - buildTelemetry(...)
 * - Preserve structural integrity if Dataset is missing
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Safe dependency loading
 * Phase 02: Query normalization
 * Phase 03: Options normalization
 * Phase 04: Dataset stats delegation
 * Phase 05: Dataset search delegation
 * Phase 06: Fail-open stats fallback
 * Phase 07: Fail-open search fallback
 * Phase 08: Emotion packet normalization
 * Phase 09: Lane normalization
 * Phase 10: Request metadata shaping
 * Phase 11: Public-mode telemetry shaping
 * Phase 12: Phase-tag support
 * Phase 13: Safe numeric coercion
 * Phase 14: Defensive return contracts
 * Phase 15: Stable export surface
 */

let Dataset = null;
try { Dataset = require("./datasetLoader"); } catch (_e) { Dataset = null; }

const CTA_VERSION = "chatTelemetryAdapter v1.0.0";

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function nowMs() {
  return Date.now();
}

function normalizeQuery(q) {
  return oneLine(q || "").slice(0, 400);
}

function normalizeSearchOptions(opts) {
  const src = isPlainObject(opts) ? opts : {};
  return {
    limit: clampInt(src.limit, 10, 1, 100),
    lane: oneLine(src.lane || "").slice(0, 40),
    publicMode: !!src.publicMode,
    allowFallback: src.allowFallback !== false,
    mode: oneLine(src.mode || "").slice(0, 40),
    year: clampInt(src.year, 0, 0, 3000) || null
  };
}

function normalizeEmotion(emo) {
  const e = isPlainObject(emo) ? emo : {};
  return {
    mode: oneLine(e.mode || "").slice(0, 40),
    valence: oneLine(e.valence || "").slice(0, 40),
    dominantEmotion: oneLine(e.dominantEmotion || "").slice(0, 60),
    cached: !!e.cached,
    contradictions: clampInt(e?.contradictions?.count || e?.contradictions || 0, 0, 0, 99),
    recoveryPresent: !!(e?.supportFlags?.recoveryPresent || e?.recoveryPresent),
    positivePresent: !!(e?.supportFlags?.positivePresent || e?.positivePresent)
  };
}

function getDatasetStats() {
  try {
    if (Dataset && typeof Dataset.stats === "function") {
      const out = Dataset.stats();
      return isPlainObject(out) ? out : { ok: true, raw: out };
    }
  } catch (_e) {}
  return null;
}

function searchDataset(query, opts) {
  const q = normalizeQuery(query);
  const normalizedOpts = normalizeSearchOptions(opts);

  if (!q) {
    return {
      ok: true,
      hit: null,
      hits: [],
      skipped: true,
      reason: "empty_query"
    };
  }

  try {
    if (Dataset && typeof Dataset.search === "function") {
      const out = Dataset.search(q, normalizedOpts);
      if (isPlainObject(out)) {
        return {
          ok: out.ok !== false,
          hit: out.hit || null,
          hits: Array.isArray(out.hits) ? out.hits : [],
          source: "datasetLoader"
        };
      }
    }
  } catch (_e) {}

  return {
    ok: true,
    hit: null,
    hits: [],
    source: "fallback",
    failedOpen: true
  };
}

function buildTelemetry(params) {
  const src = isPlainObject(params) ? params : {};
  const norm = isPlainObject(src.norm) ? src.norm : {};
  const emo = normalizeEmotion(src.emo);
  const lane =
    oneLine(src.lane || norm.lane || norm?.payload?.lane || "general").slice(0, 40) || "general";
  const requestId = oneLine(src.requestId || "").slice(0, 100);
  const publicMode = !!src.publicMode;
  const phase = oneLine(src.phase || "turn").slice(0, 60) || "turn";

  return {
    phase,
    requestId,
    lane,
    publicMode,
    version: CTA_VERSION,
    t: nowMs(),
    emotion: emo.mode || emo.valence || emo.dominantEmotion
      ? {
          mode: emo.mode,
          valence: emo.valence,
          dominantEmotion: emo.dominantEmotion,
          cached: emo.cached,
          contradictions: emo.contradictions,
          recoveryPresent: emo.recoveryPresent,
          positivePresent: emo.positivePresent
        }
      : null,
    dataset: getDatasetStats()
  };
}

function getTelemetryStatus() {
  return {
    ok: true,
    version: CTA_VERSION,
    datasetLoaded: !!Dataset,
    canStats: !!(Dataset && typeof Dataset.stats === "function"),
    canSearch: !!(Dataset && typeof Dataset.search === "function")
  };
}

module.exports = {
  CTA_VERSION,
  getDatasetStats,
  searchDataset,
  buildTelemetry,
  normalizeSearchOptions,
  getTelemetryStatus
};
