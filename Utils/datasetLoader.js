"use strict";

/**
 * Utils/datasetLoader.js  (OPINTEL DATASETS v1)
 * - Fail-open loader for small/medium JSON datasets stored under Utils/datasets
 * - Supports: array-of-records, or {items:[...]} wrappers
 * - Provides: loadAll(), search(query, opts), stats()
 *
 * Dataset record shape (recommended):
 *  { id?, topic?, tags?, question?, answer?, text?, source?, updatedAt? }
 *
 * NOTE: This is NOT training. It is retrieval from your curated datasets.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeStr(x){ return x === null || x === undefined ? "" : String(x); }
function isPlainObject(x){
  return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}
function clampInt(v, def, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function sha1(s){ return crypto.createHash("sha1").update(String(s||"")).digest("hex"); }

const DEFAULT_DIR = path.join(__dirname, "datasets");

let __loadedAt = 0;
let __items = [];
let __files = [];

function coerceItems(parsed){
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed) && Array.isArray(parsed.items)) return parsed.items;
  if (isPlainObject(parsed) && Array.isArray(parsed.data)) return parsed.data;
  return [];
}

function listJsonFiles(dirAbs){
  try {
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    return entries
      .filter((e) => e && e.isFile() && /\.json$/i.test(String(e.name||"")))
      .map((e) => path.join(dirAbs, e.name));
  } catch (_e) {
    return [];
  }
}

function normalizeRecord(rec, file, idx){
  const r = isPlainObject(rec) ? rec : {};
  const topic = safeStr(r.topic || r.domain || r.lane || "");
  const q = safeStr(r.question || r.q || "");
  const a = safeStr(r.answer || r.a || r.reply || "");
  const text = safeStr(r.text || r.content || "").trim();
  const tags = Array.isArray(r.tags) ? r.tags.slice(0, 12).map(safeStr) : [];
  const id = safeStr(r.id || r._id || r.key || "").trim() || `ds_${sha1(file + "|" + idx).slice(0, 12)}`;

  const searchText = (q + "\n" + a + "\n" + text + "\n" + topic + "\n" + tags.join(" ")).toLowerCase();

  return {
    id,
    topic,
    tags,
    question: q,
    answer: a,
    text,
    source: safeStr(r.source || path.basename(file)),
    updatedAt: safeStr(r.updatedAt || r.updated || ""),
    __file: safeStr(file),
    __idx: idx,
    __search: searchText,
  };
}

function loadAll(opts){
  const o = isPlainObject(opts) ? opts : {};
  const dirAbs = path.resolve(safeStr(o.dir || process.env.SB_DATASETS_DIR || DEFAULT_DIR));
  const maxFiles = clampInt(o.maxFiles || process.env.SB_DATASETS_MAX_FILES, 32, 1, 500);
  const maxTotalItems = clampInt(o.maxTotalItems || process.env.SB_DATASETS_MAX_ITEMS, 20000, 100, 200000);

  const files = listJsonFiles(dirAbs).slice(0, maxFiles);
  const items = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, "utf8");
      const parsed = JSON.parse(raw);
      const arr = coerceItems(parsed);
      for (let i = 0; i < arr.length; i++) {
        items.push(normalizeRecord(arr[i], f, i));
        if (items.length >= maxTotalItems) break;
      }
    } catch (_e) {}
    if (items.length >= maxTotalItems) break;
  }

  __items = items;
  __files = files;
  __loadedAt = Date.now();

  return { ok: true, dirAbs, files: files.length, items: items.length, loadedAt: __loadedAt };
}

function scoreHit(item, qLower){
  const t = safeStr(item.__search || "");
  if (!t || !qLower) return 0;
  const toks = qLower.split(/\s+/).filter(Boolean).slice(0, 10);
  let s = 0;
  for (const tok of toks) {
    if (tok.length < 2) continue;
    if (t.includes(tok)) s += 1;
  }
  if (safeStr(item.question||"").toLowerCase().includes(qLower)) s += 2;
  if (safeStr(item.topic||"").toLowerCase().includes(qLower)) s += 1;
  return s;
}

function search(query, opts){
  const q = safeStr(query).trim();
  if (!q) return { ok: true, hit: null, hits: [] };

  const o = isPlainObject(opts) ? opts : {};
  const limit = clampInt(o.limit, 3, 1, 10);
  const topic = safeStr(o.topic || "").trim().toLowerCase();

  const qLower = q.toLowerCase();

  const candidates = topic
    ? __items.filter((it) => safeStr(it.topic||"").toLowerCase() === topic)
    : __items;

  const scored = candidates
    .map((it) => ({ it, s: scoreHit(it, qLower) }))
    .filter((x) => x.s > 0)
    .sort((a,b) => b.s - a.s)
    .slice(0, limit);

  const hits = scored.map((x) => ({
    id: x.it.id,
    topic: x.it.topic,
    tags: x.it.tags,
    question: x.it.question,
    answer: x.it.answer,
    text: x.it.text,
    source: x.it.source,
    score: x.s,
  }));

  return { ok: true, hit: hits[0] || null, hits };
}

function stats(){
  return { ok: true, loadedAt: __loadedAt, items: __items.length, files: __files.length };
}

module.exports = {
  loadAll,
  search,
  stats,
};
