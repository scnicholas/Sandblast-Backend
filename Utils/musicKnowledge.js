"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * HARDENED MUSIC MODULE (v1.2.0)
 *
 * CRITICAL FIXES++++
 * ✅ Implements chatEngine hook: handleMusicTurn({ norm, session, knowledge, year, action, opts })
 * ✅ Top10 guarantee preserved (exact 10, deterministic positions 1..10, no silent drops; meta diagnostics optional)
 * ✅ Adds year parsing + bounds enforcement using opts.publicMinYear/publicMaxYear (engine-controlled)
 * ✅ Adds stable “route” mapping + safe fallbacks when action is missing/unknown
 * ✅ Adds loop-fuse dampening (prevents same output spamming on repeated chip taps / identical request signature)
 * ✅ Normalizes followUps for music lane (chips for Top10 / story / micro / year-end)
 * ✅ Session patch is music-only (no global/cog keys) to keep chatEngine authoritative
 *
 * NOTES
 * - UI-agnostic: returns replyRaw + followUps objects; no HTML.
 * - Sync IO retained; cache by mtime.
 * - This module only requires Top10 store file. Story/micro/yearend stubs are safe placeholders until you wire packs.
 */

const fs = require("fs");
const path = require("path");

// =========================
// Constants
// =========================
const DATA_DIR = path.resolve(__dirname, "..", "Data");
const TOP10_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");

const TOP10_REQUIRED_COUNT = 10;
const DEFAULT_PUBLIC_MIN_YEAR = 1950;
const DEFAULT_PUBLIC_MAX_YEAR = 2025;

// Loop fuse
const LOOP_SIG_WINDOW = 3; // remember last N signatures
const LOOP_REPEAT_MAX = 2; // after this, we vary prompt / nudge

// =========================
// Internal cache (mtime-based)
// =========================
let _cache = {
  file: TOP10_FILE,
  mtimeMs: 0,
  store: null,
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
    const clean = txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt; // strip BOM
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

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function coerceText(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function normalizeYearLoose(year) {
  // Accept number/string; strip whitespace; keep only digits; enforce 4-digit year
  const s = String(year ?? "").trim();
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeYearBounded(year, minYear, maxYear) {
  const y = normalizeYearLoose(year);
  if (!y) return null;
  if (y < minYear || y > maxYear) return null;
  return y;
}

function coercePos(rawPos, fallbackPos) {
  const n = Number(rawPos);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.trunc(n);
  return fallbackPos;
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

  // Group by position; keep first-seen per position, record collisions if meta enabled.
  const byPos = new Map();
  for (let i = 0; i < normalized.length; i++) {
    const it = normalized[i];
    const p = coercePos(it.pos, i + 1);

    const safeIt = {
      pos: p,
      title: coerceText(it.title),
      artist: coerceText(it.artist),
    };

    if (!byPos.has(p)) {
      byPos.set(p, safeIt);
    } else if (meta) {
      meta.warnings.push({
        code: "DUPLICATE_POSITION",
        message: `Multiple entries for pos ${p}; keeping the first and ignoring later duplicates.`,
        pos: p,
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
          pos,
        });
      }
      items.push(makePlaceholder(pos));
      continue;
    }

    if (!it.title) {
      if (meta) {
        meta.warnings.push({
          code: "EMPTY_TITLE",
          message: `Empty title at pos ${pos}; placeholder title inserted.`,
          pos,
        });
      }
      items.push({ pos, title: "—", artist: it.artist || "" });
      continue;
    }

    items.push({ pos, title: it.title, artist: it.artist || "" });
  }

  // Extras > 10 surfaced via meta (no silent drops).
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
        count: extras.length,
      });
      meta.extrasIgnored = extras.slice(0, 50);
    }
  }

  return items;
}

function safeMiniHash(str) {
  const s = coerceText(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function buildTurnSignature({ action, year, vibe, lane }) {
  const key = JSON.stringify({
    a: coerceText(action),
    y: year === null ? null : Number(year),
    v: coerceText(vibe),
    l: coerceText(lane),
  });
  return safeMiniHash(key).slice(0, 12);
}

function loopFuseUpdate(session, sig) {
  const s = isObject(session) ? session : {};
  const arr = Array.isArray(s.__musicLastSigs) ? s.__musicLastSigs.slice() : [];
  arr.push(sig);
  while (arr.length > LOOP_SIG_WINDOW) arr.shift();

  let repeatCount = Number(s.__musicSigRepeatCount || 0) || 0;
  const lastSig = coerceText(s.__musicLastSig || "");

  if (lastSig && sig === lastSig) repeatCount += 1;
  else repeatCount = 0;

  return {
    __musicLastSig: sig,
    __musicLastSigs: arr,
    __musicSigRepeatCount: repeatCount,
  };
}

function buildDefaultMusicChips(year) {
  const y = year || 1988;
  return [
    {
      id: "fu_top10",
      type: "chip",
      label: "Top 10",
      payload: { lane: "music", action: "top10", year: y, route: "top10" },
    },
    {
      id: "fu_story",
      type: "chip",
      label: "Make it cinematic",
      payload: { lane: "music", action: "story_moment", year: y, route: "story_moment" },
    },
    {
      id: "fu_micro",
      type: "chip",
      label: "Micro moment",
      payload: { lane: "music", action: "micro_moment", year: y, route: "micro_moment" },
    },
    {
      id: "fu_yearend",
      type: "chip",
      label: "Year-End Hot 100",
      payload: { lane: "music", action: "yearend_hot100", year: y, route: "yearend_hot100" },
    },
  ];
}

// =========================
// Core: Get Top10 by Year
// =========================
/**
 * getTop10ByYear(year, opts?)
 * opts:
 *  - meta: boolean (default false)
 *  - minYear / maxYear (optional) -> enforce bounds here if desired
 */
function getTop10ByYear(year, opts) {
  const minYear = clampInt(opts && opts.minYear, DEFAULT_PUBLIC_MIN_YEAR, 1800, 3000);
  const maxYear = clampInt(opts && opts.maxYear, DEFAULT_PUBLIC_MAX_YEAR, 1800, 3000);

  const y = normalizeYearBounded(year, minYear, maxYear);
  if (!y) return null;

  const store = loadTop10Store();
  const yKey = String(y);

  if (!store || !isObject(store) || !isObject(store.years) || !isObject(store.years[yKey])) {
    return null;
  }

  const bucket = store.years[yKey];
  const rawItems = bucket && Array.isArray(bucket.items) ? bucket.items : [];

  const wantMeta = !!(opts && opts.meta === true);
  const meta = wantMeta
    ? {
        sourceFile: TOP10_FILE,
        year: yKey,
        warnings: [],
        extrasIgnored: [],
      }
    : null;

  const items = buildTop10FromItems(rawItems, meta);

  const out = {
    year: yKey,
    chart: "Billboard Year-End Hot 100",
    count: TOP10_REQUIRED_COUNT,
    items,
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
// Music turn handler (chatEngine integration)
// =========================
function normalizeAction(action) {
  const a = coerceText(action).toLowerCase();
  if (!a) return "";
  if (a === "top10" || a === "top_10") return "top10";
  if (a === "story_moment" || a === "story" || a === "cinematic") return "story_moment";
  if (a === "micro_moment" || a === "micro") return "micro_moment";
  if (a === "yearend_hot100" || a === "year_end" || a === "yearend") return "yearend_hot100";
  if (a === "ask_year") return "ask_year";
  return a;
}

function handleMissingYear({ minYear, maxYear, action, fallbackYear }) {
  const y = fallbackYear || 1988;
  return {
    ok: true,
    route: "ask_year",
    topic: "music",
    spineStage: "clarify",
    actionTaken: "asked_year",
    lastAssistantSummary: "asked_year",
    replyRaw: `Give me a year (${minYear}–${maxYear}).`,
    followUps: [
      { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: action || "top10", year: 1973 } },
      { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: action || "top10", year: 1988 } },
      { id: "fu_1992", type: "chip", label: "1992", payload: { lane: "music", action: action || "top10", year: 1992 } },
    ],
    followUpsStrings: ["1973", "1988", "1992"],
    sessionPatch: {
      activeMusicChart: "top10",
      lastMusicYear: y,
    },
  };
}

function handleTop10({ year, opts, session }) {
  const wantMeta = !!(opts && opts.meta === true);
  const minYear = clampInt(opts && opts.publicMinYear, DEFAULT_PUBLIC_MIN_YEAR, 1800, 3000);
  const maxYear = clampInt(opts && opts.publicMaxYear, DEFAULT_PUBLIC_MAX_YEAR, 1800, 3000);

  const top10 = getTop10ByYear(year, {
    meta: wantMeta,
    minYear,
    maxYear,
  });

  if (!top10) {
    const y = Number(year);
    const yTxt = Number.isFinite(y) ? String(y) : String(year || "");
    return {
      ok: true,
      route: "top10_not_found",
      topic: "music",
      spineStage: "clarify",
      actionTaken: "top10_not_found",
      lastAssistantSummary: "top10_not_found",
      replyRaw: `I don’t have a Top 10 bucket for ${yTxt}. Try another year (${minYear}–${maxYear}).`,
      followUps: [
        { id: "fu_1960", type: "chip", label: "1960", payload: { lane: "music", action: "top10", year: 1960 } },
        { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: "top10", year: 1973 } },
        { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: "top10", year: 1988 } },
        { id: "fu_1999", type: "chip", label: "1999", payload: { lane: "music", action: "top10", year: 1999 } },
      ],
      followUpsStrings: ["1960", "1973", "1988", "1999"],
      sessionPatch: {
        activeMusicChart: "top10",
        lastMusicYear: Number.isFinite(y) ? y : null,
      },
      meta: wantMeta
        ? {
            reason: "missing_year_bucket",
            sourceFile: TOP10_FILE,
            requestedYear: yTxt,
          }
        : undefined,
    };
  }

  const title = `Top 10 — ${top10.year}`;
  const body = renderTop10Text(top10);

  const replyRaw = `${title}\n\n${body}`;

  const chips = buildDefaultMusicChips(Number(top10.year));

  const sessionPatch = {
    activeMusicChart: "top10",
    lastMusicYear: Number(top10.year),
    lastMusicChart: "top10",
  };

  const out = {
    ok: true,
    route: "top10",
    topic: "music",
    spineStage: "deliver",
    actionTaken: "served_top10",
    lastAssistantSummary: "served_top10",
    replyRaw,
    followUps: chips,
    followUpsStrings: chips.map((c) => c.label),
    sessionPatch,
  };

  if (wantMeta) {
    out.meta = {
      sourceFile: TOP10_FILE,
      year: top10.year,
      warnings: top10.meta ? top10.meta.warnings : [],
      extrasIgnored: top10.meta ? top10.meta.extrasIgnored : [],
    };
  }

  return out;
}

function handleStoryMoment({ year }) {
  const y = String(year);
  return {
    ok: true,
    route: "story_moment_stub",
    topic: "music",
    spineStage: "deliver",
    actionTaken: "served_story_stub",
    lastAssistantSummary: "served_story_stub",
    replyRaw:
      `Story Moment — ${y}\n\n` +
      `I’m ready to make it cinematic — but I need the story-moments pack wired in this module (or a resolver callback).\n` +
      `Send me your story-moments JSON/schema and I’ll lock it into handleMusicTurn.`,
    followUps: buildDefaultMusicChips(Number(y)),
    followUpsStrings: ["Top 10", "Make it cinematic", "Micro moment", "Year-End Hot 100"],
    sessionPatch: { activeMusicChart: "story_moment", lastMusicYear: Number(year) },
  };
}

function handleMicroMoment({ year }) {
  const y = String(year);
  return {
    ok: true,
    route: "micro_moment_stub",
    topic: "music",
    spineStage: "deliver",
    actionTaken: "served_micro_stub",
    lastAssistantSummary: "served_micro_stub",
    replyRaw:
      `Micro Moment — ${y}\n\n` +
      `I can do the micro-moment style, but the micro-moments pack isn’t wired here yet.\n` +
      `Drop the micro-moments JSON/schema and I’ll make this deterministic + loop-safe.`,
    followUps: buildDefaultMusicChips(Number(y)),
    followUpsStrings: ["Top 10", "Make it cinematic", "Micro moment", "Year-End Hot 100"],
    sessionPatch: { activeMusicChart: "micro_moment", lastMusicYear: Number(year) },
  };
}

function handleYearEnd({ year }) {
  const y = String(year);
  return {
    ok: true,
    route: "yearend_stub",
    topic: "music",
    spineStage: "deliver",
    actionTaken: "served_yearend_stub",
    lastAssistantSummary: "served_yearend_stub",
    replyRaw:
      `Year-End Hot 100 — ${y}\n\n` +
      `This needs the full year-end dataset resolver wired here (not in chatEngine).\n` +
      `Send the year-end JSON pack (or your current loader) and I’ll harden it like Top10 (no drops, bounded output).`,
    followUps: buildDefaultMusicChips(Number(y)),
    followUpsStrings: ["Top 10", "Make it cinematic", "Micro moment", "Year-End Hot 100"],
    sessionPatch: { activeMusicChart: "yearend_hot100", lastMusicYear: Number(year) },
  };
}

/**
 * handleMusicTurn({ norm, session, knowledge, year, action, opts })
 *
 * Returns:
 *  {
 *    ok, replyRaw,
 *    followUps, followUpsStrings,
 *    sessionPatch, meta,
 *    route, topic, lastAssistantSummary, actionTaken, spineStage
 *  }
 */
function handleMusicTurn({ norm, session, knowledge, year, action, opts }) {
  const s = isObject(session) ? session : {};
  const o = isObject(opts) ? opts : {};
  const minYear = clampInt(o.publicMinYear, DEFAULT_PUBLIC_MIN_YEAR, 1800, 3000);
  const maxYear = clampInt(o.publicMaxYear, DEFAULT_PUBLIC_MAX_YEAR, 1800, 3000);

  const lane = "music";
  const vibe = coerceText((norm && norm.vibe) || (norm && norm.payload && norm.payload.vibe) || "");
  const a = normalizeAction(action || (norm && norm.action) || "");
  const y = normalizeYearBounded(year, minYear, maxYear);

  // Loop signature + dampening
  const sig = buildTurnSignature({ action: a || "top10", year: y, vibe, lane });
  const loopPatch = loopFuseUpdate(s, sig);
  const repeatCount = Number(loopPatch.__musicSigRepeatCount || 0) || 0;

  // Missing year handling (only when action needs it)
  const requiresYear = ["top10", "story_moment", "micro_moment", "yearend_hot100"];
  if (requiresYear.includes(a || "top10") && !y) {
    const missing = handleMissingYear({
      minYear,
      maxYear,
      action: a || "top10",
      fallbackYear: normalizeYearLoose(s.lastMusicYear) || null,
    });
    missing.sessionPatch = { ...missing.sessionPatch, ...loopPatch };
    missing.meta = isObject(missing.meta) ? missing.meta : undefined;
    return missing;
  }

  // Choose route
  let out = null;

  if (!a || a === "top10") {
    out = handleTop10({ year: y, opts: { publicMinYear: minYear, publicMaxYear: maxYear, meta: !!o.meta }, session: s });
  } else if (a === "story_moment") {
    out = handleStoryMoment({ year: y });
  } else if (a === "micro_moment") {
    out = handleMicroMoment({ year: y });
  } else if (a === "yearend_hot100") {
    out = handleYearEnd({ year: y });
  } else if (a === "ask_year") {
    out = handleMissingYear({ minYear, maxYear, action: "top10", fallbackYear: normalizeYearLoose(s.lastMusicYear) || null });
  } else {
    // Unknown action: fail-open to Top10 (safe, deterministic)
    out = handleTop10({ year: y, opts: { publicMinYear: minYear, publicMaxYear: maxYear, meta: !!o.meta }, session: s });
    out.route = "unknown_action_fallback_top10";
    out.actionTaken = "fallback_top10";
    out.lastAssistantSummary = "fallback_top10";
  }

  // Loop dampening response tweak (no UI, just copy variance)
  if (repeatCount >= LOOP_REPEAT_MAX) {
    const yrTxt = String(y);
    out.replyRaw =
      `Same request detected (${yrTxt}). Want a different cut?\n\n` +
      `• Top 10 (clean list)\n` +
      `• Cinematic story moment\n` +
      `• Micro moment\n` +
      `• Full year-end view\n\n` +
      `If you pick one, I’ll switch format immediately.`;
    out.route = "loop_dampen_prompt";
    out.spineStage = "clarify";
    out.actionTaken = "loop_dampen_prompt";
    out.lastAssistantSummary = "loop_dampen_prompt";
    out.followUps = buildDefaultMusicChips(y);
    out.followUpsStrings = out.followUps.map((c) => c.label);
  }

  // Enforce sessionPatch: music-only keys + loop patch merged in
  const patch = isObject(out.sessionPatch) ? out.sessionPatch : {};
  out.sessionPatch = {
    ...patch,
    ...loopPatch,
    lane: "music",
    lastYear: y, // sticky convenience; chatEngine treats year as sticky anyway
  };

  // Bounded meta (optional)
  if (o && o.meta === true) {
    out.meta = {
      ...(isObject(out.meta) ? out.meta : {}),
      sig,
      repeatCount,
      minYear,
      maxYear,
      action: a || "top10",
      year: y,
      vibe: vibe || "",
      storeLoaded: !!loadTop10Store(),
    };
  }

  return out;
}

// =========================
// Public API
// =========================
module.exports = {
  // Core
  getTop10ByYear,
  renderTop10Text,

  // chatEngine hook
  handleMusicTurn,
};
