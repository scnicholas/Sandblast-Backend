"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * v1.2.1 (STORE-SCHEMA ALIGN++++ + DUPLICATE+QUOTE CLEAN++++ + DIAG EXPORT++++)
 *
 * Guarantees:
 *  - Top10 always returns exactly 10 items (1..10 deterministic selection)
 *  - No silent drops (extras surfaced via meta when enabled)
 *  - No mutation of source data
 *  - Defensive structure validation
 *  - Visible failure modes
 *  - Safe rendering (never empty output)
 *
 * Accepts store shapes:
 *  A) { years: { "1988": { items:[...] } } }   ✅ your posted file
 *  B) { years: { "1988": [...] } }            legacy
 *
 * This module is UI-agnostic.
 */

const fs = require("fs");
const path = require("path");

// =========================
// Constants
// =========================
const DATA_DIR = path.resolve(__dirname, "..", "Data");
const TOP10_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");
const TOP10_REQUIRED_COUNT = 10;

// =========================
// Cache (mtime guarded)
// =========================
let _cache = {
  mtimeMs: 0,
  store: null,
  file: TOP10_FILE
};

// =========================
// Utility Helpers
// =========================
function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function safeReadJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const clean = raw && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function loadStore() {
  const st = safeStat(TOP10_FILE);
  if (!st || !st.isFile()) {
    _cache = { mtimeMs: 0, store: null, file: TOP10_FILE };
    return null;
  }

  const mtimeMs = Number(st.mtimeMs || 0);
  if (_cache.store && _cache.mtimeMs === mtimeMs) {
    return _cache.store;
  }

  const store = safeReadJSON(TOP10_FILE);
  _cache = { mtimeMs, store: store || null, file: TOP10_FILE };
  return _cache.store;
}

function normalizeYear(year) {
  const digits = String(year ?? "").replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
  return String(n);
}

function cleanText(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/**
 * Fix common wiki-cache artifacts:
 * - \" / \" fragments
 * - doubled quotes from scraped "A" / "B" formatting
 */
function cleanTitleArtifacts(s) {
  const t = cleanText(s);
  if (!t) return "";
  // Replace escaped quotes sequences if present
  let out = t.replace(/\\"/g, '"');

  // Normalize weird patterns like:  A" / "B   or   A\" / \"B
  out = out.replace(/\s*"\s*\/\s*"\s*/g, ' / ');
  out = out.replace(/\s*“\s*\/\s*”\s*/g, ' / ');

  // Collapse repeated whitespace
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function cleanArtistArtifacts(s) {
  const t = cleanText(s);
  if (!t) return "";
  let out = t.replace(/\\"/g, '"').replace(/\s+/g, " ").trim();
  return out;
}

function coercePos(rawPos, fallback) {
  const n = Number(rawPos);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.trunc(n);
  return fallback;
}

function normalizeItem(raw, index) {
  return {
    pos: coercePos(raw?.pos ?? raw?.rank, index + 1),
    title: cleanTitleArtifacts(raw?.title),
    artist: cleanArtistArtifacts(raw?.artist ?? raw?.artists)
  };
}

function makePlaceholder(pos) {
  return { pos, title: "—", artist: "" };
}

function keySong(title, artist) {
  return `${cleanText(title).toLowerCase()}||${cleanText(artist).toLowerCase()}`;
}

/**
 * De-dupe exact same song+artist rows inside a year.
 * Keeps first occurrence; later duplicates get noted in meta (if enabled).
 */
function dedupeExactSongs(items, meta) {
  const seen = new Set();
  const out = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const k = keySong(it.title, it.artist);
    if (!k || k === "||") {
      out.push(it);
      continue;
    }
    if (seen.has(k)) {
      if (meta) {
        meta.warnings.push({
          code: "DUPLICATE_SONG_IGNORED",
          title: it.title || "",
          artist: it.artist || ""
        });
      }
      continue;
    }
    seen.add(k);
    out.push(it);
  }

  return out;
}

// =========================
// Deterministic Top10 Builder
// =========================
function buildTop10(rawItems, meta) {
  const normalized = Array.isArray(rawItems)
    ? rawItems.map(normalizeItem)
    : [];

  const cleaned = dedupeExactSongs(normalized, meta);

  const byPos = new Map();

  for (let i = 0; i < cleaned.length; i++) {
    const it = cleaned[i];
    const p = coercePos(it.pos, i + 1);

    if (!byPos.has(p)) {
      byPos.set(p, {
        pos: p,
        title: it.title || "",
        artist: it.artist || ""
      });
    } else if (meta) {
      meta.warnings.push({
        code: "DUPLICATE_POSITION",
        pos: p
      });
    }
  }

  const items = [];

  for (let pos = 1; pos <= TOP10_REQUIRED_COUNT; pos++) {
    const found = byPos.get(pos);

    if (!found) {
      if (meta) {
        meta.warnings.push({
          code: "MISSING_POSITION",
          pos
        });
      }
      items.push(makePlaceholder(pos));
      continue;
    }

    items.push({
      pos,
      title: found.title || "—",
      artist: found.artist || ""
    });
  }

  if (meta) {
    const extras = [];
    for (const [p, it] of byPos.entries()) {
      if (p > TOP10_REQUIRED_COUNT) extras.push(it);
    }

    if (extras.length) {
      meta.warnings.push({
        code: "EXTRA_ROWS_IGNORED",
        count: extras.length
      });
      meta.extrasIgnored = extras.slice(0, 50);
    }
  }

  return items;
}

// =========================
// Store Access (supports both shapes)
// =========================
function getYearBucket(store, y) {
  if (!store || !isObject(store) || !isObject(store.years)) return null;

  const bucket = store.years[y];
  if (!bucket) return null;

  // Shape A: { year, chart, items:[...] }
  if (isObject(bucket) && Array.isArray(bucket.items)) return bucket;

  // Shape B (legacy): years[y] is the array itself
  if (Array.isArray(bucket)) {
    return { year: Number(y), chart: "", items: bucket };
  }

  return null;
}

// =========================
// Public: Get Top10 by Year
// =========================
function getTop10ByYear(year, opts) {
  const y = normalizeYear(year);
  if (!y) return null;

  const store = loadStore();
  const bucket = getYearBucket(store, y);
  if (!bucket) return null;

  const wantMeta = !!(opts && opts.meta === true);

  const meta = wantMeta
    ? {
        sourceFile: TOP10_FILE,
        storeVersion: cleanText(store?.version) || "",
        storeChart: cleanText(store?.chart) || "",
        year: y,
        warnings: [],
        extrasIgnored: []
      }
    : null;

  const items = buildTop10(bucket.items, meta);

  const resolvedChart =
    cleanText(bucket.chart) ||
    cleanText(store?.chart) ||
    "Billboard Year-End Hot 100";

  return {
    year: y,
    chart: resolvedChart,
    count: TOP10_REQUIRED_COUNT,
    items,
    ...(wantMeta ? { meta } : {})
  };
}

// =========================
// Render (Legacy Compatibility)
// =========================
function renderTop10Text(top10) {
  if (!top10 || !Array.isArray(top10.items)) {
    return "";
  }

  const lines = [];

  for (let i = 0; i < top10.items.length; i++) {
    const it = top10.items[i];
    const pos = Number.isFinite(it?.pos) ? it.pos : i + 1;
    const title = cleanText(it?.title) || "—";
    const artist = cleanText(it?.artist);

    lines.push(`${pos}. "${title}"${artist ? " — " + artist : ""}`);
  }

  return lines.join("\n");
}

// =========================
// Diagnostics (for /api/diag/music)
// =========================
function getMusicDiag(sampleYear) {
  const st = safeStat(TOP10_FILE);
  const store = loadStore();
  const y = normalizeYear(sampleYear || 1988);

  const bucket = getYearBucket(store, y);
  const sample = bucket ? getTop10ByYear(y, { meta: true }) : null;

  return {
    ok: !!(st && st.isFile() && store && isObject(store.years)),
    file: TOP10_FILE,
    exists: !!(st && st.isFile()),
    mtimeMs: st ? Number(st.mtimeMs || 0) : 0,
    storeVersion: cleanText(store?.version) || "",
    storeChart: cleanText(store?.chart) || "",
    yearCount: store && isObject(store.years) ? Object.keys(store.years).length : 0,
    sampleYear: y,
    sampleOk: !!sample,
    sampleWarnings: sample?.meta?.warnings || []
  };
}

// =========================
// Exports
// =========================
module.exports = {
  getTop10ByYear,
  renderTop10Text,
  getMusicDiag
};
