"use strict";

/**
 * Dataset Source Adapter
 * - Reads curated JSON packs via ../../datasetLoader (expected at /utils/datasetLoader.js)
 * - Returns evidence items with scores + optional direct answer.
 */

function safeStr(x){ return x == null ? "" : String(x); }
function isPlainObject(x){
  return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

let Dataset = null;
let __lazy = { tried: false, ok: false };

function _requireDataset() {
  if (Dataset) return Dataset;
  try {
    Dataset = require("../../datasetLoader");
  } catch (e) {
    Dataset = null;
  }
  return Dataset;
}

function ensureLoaded() {
  const D = _requireDataset();
  if (!D || typeof D.loadAll !== "function") return { ok: false, error: "DATASET_MODULE_MISSING" };
  if (__lazy.tried) return { ok: __lazy.ok };
  __lazy.tried = true;
  try {
    const res = D.loadAll();
    __lazy.ok = !!(res && res.ok);
    return { ok: __lazy.ok, ...res };
  } catch (e) {
    __lazy.ok = false;
    return { ok: false, error: "DATASET_LOAD_FAILED", detail: String(e && (e.message || e)) };
  }
}

function queryDataset(text, opts) {
  const D = _requireDataset();
  if (!D || typeof D.search !== "function") return { ok: false, error: "DATASET_MODULE_MISSING" };

  const q = safeStr(text).trim();
  if (!q) return { ok: true, hits: [], best: null };

  const o = isPlainObject(opts) ? opts : {};
  const limit = Number.isFinite(o.limit) ? o.limit : 3;

  try {
    const res = D.search(q, { limit });
    const hits = (res && Array.isArray(res.hits)) ? res.hits : [];
    const best = (res && res.hit) ? res.hit : (hits[0] || null);

    const exactish = best && safeStr(best.question).trim().toLowerCase() === q.toLowerCase();
    const score = best ? Number(best.score || 0) : 0;
    const confident = !!(best && (exactish || score >= 3));

    return {
      ok: true,
      type: "dataset",
      confident,
      best,
      hits,
      stats: (typeof D.stats === "function") ? D.stats() : null,
    };
  } catch (e) {
    return { ok: false, error: "DATASET_QUERY_FAILED", detail: String(e && (e.message || e)) };
  }
}

module.exports = { ensureLoaded, queryDataset };
