"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * HARDENED TOP10 GUARANTEE PATCH (v1.1.0)
 *
 * Guarantees:
 *  - Top10 always returns exactly 10 items
 *  - No implicit slicing (we select positions 1..10 deterministically)
 *  - No silent row drops (any ignored/extra rows are surfaced via meta when enabled)
 *  - Structured + legacy render support
 *
 * Notes:
 *  - This module is intentionally UI-agnostic.
 *  - Sync IO is retained (your backend is already sync-heavy in other utils), but we cache by mtime.
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
// Internal cache (mtime-based)
// =========================
let _cache = {
  file: TOP10_FILE,
  mtimeMs: 0,
  store: null
};

// =========================
// Helpers
// =========================
function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (_e) {
    return null;
  }
}

function safeReadJSON(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    // Allow BOM
    const clean = txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt;
    return JSON.parse(clean);
  } catch (_e) {
    return null;
  }
}

function loadTop10Store() {
  const st = safeStat(TOP10_FILE);
  if (!st || !st.isFile()) {
    _cache = { file: TOP10_FILE, mtimeMs: 0, store: null };
    return null;
  }

  const mtimeMs = Number(st.mtimeMs || 0);
  if (_cache.store && _cache.mtimeMs === mtimeMs) return _cache.store;

  const store = safeReadJSON(TOP10_FILE);
  _cache = { file: TOP10_FILE, mtimeMs, store: store || null };
  return _cache.store;
}

function normalizeYear(year) {
  // Accept number/string; strip whitespace; keep only digits; enforce 4-digit year
  const s = String(year ?? "").trim();
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1800 || n > 3000) return null; // conservative bounds
  return String(n);
}

function coercePos(rawPos, fallbackPos) {
  const n = Number(rawPos);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.trunc(n);
  return fallbackPos;
}

function coerceText(v) {
  // Preserve legitimate strings; avoid "undefined"/"null" artifacts
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function normalizeItem(raw, index) {
  const pos = coercePos(raw && (raw.pos ?? raw.rank), index + 1);
  const title = coerceText(raw && raw.title);
  const artist = coerceText(raw && (raw.artist ?? raw.artists));
  return { pos, title, artist };
}

function makePlaceholder(pos) {
  return { pos, title: "—", artist: "" };
}

function buildTop10FromItems(rawItems, meta) {
  const normalized = Array.isArray(rawItems) ? rawItems.map(normalizeItem) : [];

  // Group by position; keep first-seen per position, but record collisions if meta enabled.
  const byPos = new Map();
  for (let i = 0; i < normalized.length; i++) {
    const it = normalized[i];
    const p = coercePos(it.pos, i + 1);

    // Ensure we keep rows even if missing title/artist; we’ll backfill placeholders later if truly empty.
    const safeIt = {
      pos: p,
      title: coerceText(it.title),
      artist: coerceText(it.artist)
    };

    if (!byPos.has(p)) {
      byPos.set(p, safeIt);
    } else if (meta) {
      meta.warnings.push({
        code: "DUPLICATE_POSITION",
        message: `Multiple entries for pos ${p}; keeping the first and ignoring later duplicates.`,
        pos: p
      });
    }
  }

  // Deterministically select positions 1..10 (no slicing of arrays).
  const items = [];
  for (let pos = 1; pos <= TOP10_REQUIRED_COUNT; pos++) {
    const it = byPos.get(pos);
    if (!it) {
      if (meta) {
        meta.warnings.push({
          code: "MISSING_POSITION",
          message: `Missing entry for pos ${pos}; placeholder inserted.`,
          pos
        });
      }
      items.push(makePlaceholder(pos));
      continue;
    }

    // If title is blank, we still keep the row but nudge with placeholder title to avoid empty render.
    if (!it.title) {
      if (meta) {
        meta.warnings.push({
          code: "EMPTY_TITLE",
          message: `Empty title at pos ${pos}; placeholder title inserted.`,
          pos
        });
      }
      items.push({ pos, title: "—", artist: it.artist || "" });
      continue;
    }

    items.push({ pos, title: it.title, artist: it.artist || "" });
  }

  // If there are entries beyond 10, surface them via meta (no silent drops).
  if (meta) {
    const extras = [];
    for (const [p, it] of byPos.entries()) {
      if (p > TOP10_REQUIRED_COUNT) extras.push(it);
    }
    if (extras.length) {
      extras.sort((a, b) => a.pos - b.pos);
      meta.warnings.push({
        code: "EXTRA_ROWS_IGNORED",
        message: `Found ${extras.length} entries with pos > ${TOP10_REQUIRED_COUNT}; ignored to satisfy exact-10 guarantee.`,
        count: extras.length
      });
      meta.extrasIgnored = extras.slice(0, 50); // cap for safety
    }
  }

  return items;
}

// =========================
// Core: Get Top10 by Year
// =========================
/**
 * getTop10ByYear(year, opts?)
 * opts:
 *  - meta: boolean (default false) -> include meta diagnostics without changing core contract by default
 */
function getTop10ByYear(year, opts) {
  const y = normalizeYear(year);
  if (!y) return null;

  const store = loadTop10Store();
  if (!store || !isObject(store) || !isObject(store.years) || !isObject(store.years[y])) {
    return null;
  }

  const bucket = store.years[y];
  const rawItems = bucket && Array.isArray(bucket.items) ? bucket.items : [];

  const wantMeta = !!(opts && opts.meta === true);
  const meta = wantMeta
    ? {
        sourceFile: TOP10_FILE,
        year: y,
        warnings: [],
        extrasIgnored: []
      }
    : null;

  const items = buildTop10FromItems(rawItems, meta);

  const out = {
    year: y,
    chart: "Billboard Year-End Hot 100",
    count: TOP10_REQUIRED_COUNT,
    items
  };

  if (wantMeta) out.meta = meta;

  return out;
}

// =========================
// Render (Legacy Compatibility)
// =========================
function renderTop10Text(top10) {
  if (!top10 || !Array.isArray(top10.items)) return "";
  return top10.items
    .map((item, idx) => {
      const pos = Number(item && item.pos);
      const safePos = Number.isFinite(pos) ? pos : idx + 1;
      const title = coerceText(item && item.title) || "—";
      const artist = coerceText(item && item.artist);
      return `${safePos}. "${title}"${artist ? " — " + artist : ""}`;
    })
    .join("\n");
}

// =========================
// Public API
// =========================
module.exports = {
  getTop10ByYear,
  renderTop10Text
};
