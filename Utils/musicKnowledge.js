"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * v1.3.0 — Engine-Wired + Fully Hardened
 *
 * Guarantees:
 *  - Top10 returns exactly 10 items (1..10 deterministic)
 *  - No silent drops (warnings + optional meta.extrasIgnored)
 *  - No mutation of source data
 *  - Defensive structure validation + visible failure modes
 *  - Safe rendering (never empty output)
 *  - Engine contract: exports handleMusicTurn({norm,session,knowledge,year,action,opts})
 *
 * Notes:
 *  - UI-agnostic. Returns replyRaw + followUps + sessionPatch; chatEngine applies constitution.
 *  - FAIL-OPEN: if data missing, responds with year prompt / wiring prompt, never throws.
 */

const fs = require("fs");
const path = require("path");

// =========================
// Constants
// =========================
const DATA_DIR = path.resolve(__dirname, "..", "Data");
const TOP10_FILE = path.join(DATA_DIR, "top10_by_year_v1.json");
const TOP10_REQUIRED_COUNT = 10;

const PUBLIC_MIN_YEAR_DEFAULT = 1950;
const PUBLIC_MAX_YEAR_DEFAULT = 2025;

// =========================
// Cache (mtime guarded)
// =========================
let _cache = {
  mtimeMs: 0,
  store: null,
};

// =========================
// Utility Helpers
// =========================
function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function safeStr(v) {
  return v === undefined || v === null ? "" : String(v);
}

function cleanText(v) {
  return safeStr(v).trim();
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
    _cache = { mtimeMs: 0, store: null };
    return null;
  }

  const mtimeMs = Number(st.mtimeMs || 0);
  if (_cache.store && _cache.mtimeMs === mtimeMs) {
    return _cache.store;
  }

  const store = safeReadJSON(TOP10_FILE);
  _cache = { mtimeMs, store: store || null };
  return _cache.store;
}

function normalizeYear(year) {
  const digits = safeStr(year ?? "").replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
  return String(n);
}

function coercePos(rawPos, fallback) {
  const n = Number(rawPos);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) return Math.trunc(n);
  return fallback;
}

function normalizeItem(raw, index) {
  return {
    pos: coercePos(raw?.pos ?? raw?.rank, index + 1),
    title: cleanText(raw?.title),
    artist: cleanText(raw?.artist ?? raw?.artists),
  };
}

function makePlaceholder(pos) {
  return { pos, title: "—", artist: "" };
}

// =========================
// Deterministic Top10 Builder
// =========================
function buildTop10(rawItems, meta) {
  const normalized = Array.isArray(rawItems) ? rawItems.map(normalizeItem) : [];
  const byPos = new Map();

  for (let i = 0; i < normalized.length; i++) {
    const it = normalized[i];
    const p = coercePos(it.pos, i + 1);

    if (!byPos.has(p)) {
      byPos.set(p, {
        pos: p,
        title: it.title || "",
        artist: it.artist || "",
      });
    } else if (meta) {
      meta.warnings.push({ code: "DUPLICATE_POSITION", pos: p });
    }
  }

  const items = [];
  for (let pos = 1; pos <= TOP10_REQUIRED_COUNT; pos++) {
    const found = byPos.get(pos);

    if (!found) {
      if (meta) meta.warnings.push({ code: "MISSING_POSITION", pos });
      items.push(makePlaceholder(pos));
      continue;
    }

    items.push({
      pos,
      title: found.title || "—",
      artist: found.artist || "",
    });
  }

  if (meta) {
    const extras = [];
    for (const [p, it] of byPos.entries()) {
      if (p > TOP10_REQUIRED_COUNT) extras.push(it);
    }
    if (extras.length) {
      meta.warnings.push({ code: "EXTRA_ROWS_IGNORED", count: extras.length });
      meta.extrasIgnored = extras.slice(0, 50);
    }
  }

  return items;
}

// =========================
// Public: Get Top10 by Year
// =========================
function getTop10ByYear(year, opts) {
  const y = normalizeYear(year);
  if (!y) return null;

  const store = loadStore();
  if (!store || !isObject(store) || !isObject(store.years)) return null;

  const bucket = store.years[y];
  if (!isObject(bucket) || !Array.isArray(bucket.items)) return null;

  const wantMeta = !!(opts && opts.meta === true);

  const meta = wantMeta
    ? {
        sourceFile: TOP10_FILE,
        year: y,
        warnings: [],
        extrasIgnored: [],
      }
    : null;

  const items = buildTop10(bucket.items, meta);

  return {
    year: y,
    chart: cleanText(bucket.chart) || "Billboard Year-End Hot 100",
    count: TOP10_REQUIRED_COUNT,
    items,
    ...(wantMeta ? { meta } : {}),
  };
}

// =========================
// Render (Legacy Compatibility)
// =========================
function renderTop10Text(top10) {
  if (!top10 || !Array.isArray(top10.items)) return "";

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
// Engine Wiring: handleMusicTurn
// =========================
function clampYearToRange(y, minY, maxY) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < minY || t > maxY) return null;
  return t;
}

function buildYearChips(action, lane, minY, maxY) {
  // A few strong “demo” years + guard range.
  const picks = [1973, 1988, 1992, 2001, 2016].filter(
    (x) => x >= minY && x <= maxY
  );
  const uniq = Array.from(new Set(picks)).slice(0, 4);

  const route = safeStr(action || "top10");
  return uniq.map((y) => ({
    id: `fu_${y}`,
    type: "chip",
    label: String(y),
    payload: { lane: lane || "music", action: route, year: y, route },
  }));
}

function safeMusicReplyFallback(minY, maxY) {
  return `Give me a year (${minY}–${maxY}). I’ll start with Top 10.`;
}

function buildCinematicFromTop10(top10, year, vibe) {
  // Deterministic, compact, and safe: no “invented facts”, just vibe + names.
  const v = cleanText(vibe).toLowerCase();
  const tone =
    v === "romantic"
      ? "romantic"
      : v === "rebellious"
      ? "rebellious"
      : v === "nostalgic"
      ? "nostalgic"
      : "cinematic";

  const items = Array.isArray(top10?.items) ? top10.items : [];
  const top3 = items.slice(0, 3).map((it) => ({
    title: cleanText(it?.title) || "—",
    artist: cleanText(it?.artist) || "",
  }));

  const opener =
    tone === "romantic"
      ? `Cinematic moment — ${year}. Lights low.`
      : tone === "rebellious"
      ? `Cinematic moment — ${year}. Neon, speed, zero apology.`
      : tone === "nostalgic"
      ? `Cinematic moment — ${year}. That soft ache of “back then.”`
      : `Cinematic moment — ${year}. Frame one: you’re already in it.`;

  const lines = [];
  lines.push(opener);
  lines.push("");
  lines.push(
    `Anchor songs: ${top3
      .map((s) => `"${s.title}"${s.artist ? " — " + s.artist : ""}`)
      .join(" | ")}`
  );
  lines.push("");
  lines.push(
    "Micro-script (15s):\n" +
      "1) Establish the room (1 sentence).\n" +
      "2) Drop the chorus line (1 sentence).\n" +
      "3) End on a decision (1 sentence)."
  );

  return lines.join("\n");
}

function buildMicroMoment(top10, year, vibe) {
  const v = cleanText(vibe).toLowerCase();
  const items = Array.isArray(top10?.items) ? top10.items : [];
  const pick = items[0] || { title: "—", artist: "" };

  const header = `Micro-moment — ${year}.`;
  const seed = `"${cleanText(pick.title) || "—"}"${
    cleanText(pick.artist) ? " — " + cleanText(pick.artist) : ""
  }`;

  const style =
    v === "romantic"
      ? "Touch the memory, don’t chase it."
      : v === "rebellious"
      ? "Turn the volume into a boundary."
      : v === "nostalgic"
      ? "Let the past be sweet, not sticky."
      : "Keep it sharp and vivid.";

  return `${header}\n\nAnchor: ${seed}\n\nOne-line directive: ${style}`;
}

function buildYearEndHot100Note(year) {
  // We only have top10_by_year file right now; be explicit.
  return `Year-End Hot 100 — ${year}\n\nRight now I have Top 10 wired. If you want full Year-End Hot 100, drop a Data file like yearend_hot100_by_year_v1.json and I’ll wire it the same way (ranked + bounded + deterministic).`;
}

function buildFollowUpsForMusic(action, year, lane) {
  const y = Number(year);
  const yrOk = Number.isFinite(y) ? y : null;

  const base = [
    {
      id: "fu_top10",
      type: "chip",
      label: "Top 10",
      payload: { lane: lane || "music", action: "top10", year: yrOk ?? undefined, route: "top10" },
    },
    {
      id: "fu_cinematic",
      type: "chip",
      label: "Make it cinematic",
      payload: { lane: lane || "music", action: "story_moment", year: yrOk ?? undefined, route: "story_moment" },
    },
    {
      id: "fu_micro",
      type: "chip",
      label: "Micro-moment",
      payload: { lane: lane || "music", action: "micro_moment", year: yrOk ?? undefined, route: "micro_moment" },
    },
    {
      id: "fu_yearend",
      type: "chip",
      label: "Year-End Hot 100",
      payload: { lane: lane || "music", action: "yearend_hot100", year: yrOk ?? undefined, route: "yearend_hot100" },
    },
  ];

  // If year missing, chips still okay; chatEngine guards year before calling us for year-required actions,
  // but this keeps the module usable independently.
  return base.map((c) => {
    const p = isObject(c.payload) ? c.payload : {};
    if (p.year === undefined) {
      const { year: _drop, ...rest } = p;
      return { ...c, payload: rest };
    }
    return c;
  });
}

/**
 * Main music router used by chatEngine.
 *
 * Expected input:
 *  {
 *    norm, session, knowledge, year, action,
 *    opts: { allowDerivedTop10, publicMinYear, publicMaxYear }
 *  }
 *
 * Returns:
 *  {
 *    route, replyRaw, followUps, followUpsStrings,
 *    sessionPatch, pendingAsk, topic, spineStage, actionTaken, meta
 *  }
 */
async function handleMusicTurn(args) {
  const norm = isObject(args?.norm) ? args.norm : {};
  const session = isObject(args?.session) ? args.session : {};
  const year = args?.year ?? null;
  const action = cleanText(args?.action || "");
  const opts = isObject(args?.opts) ? args.opts : {};

  const minY = Number.isFinite(Number(opts.publicMinYear))
    ? Math.trunc(Number(opts.publicMinYear))
    : PUBLIC_MIN_YEAR_DEFAULT;
  const maxY = Number.isFinite(Number(opts.publicMaxYear))
    ? Math.trunc(Number(opts.publicMaxYear))
    : PUBLIC_MAX_YEAR_DEFAULT;

  const lane = "music";
  const vibe = cleanText(norm?.vibe || norm?.payload?.vibe || session?.vibe || "");

  // Guard (module-level): if year is needed but missing, ask cleanly.
  const yearInt = year !== null ? clampYearToRange(year, minY, maxY) : null;

  const requiresYear = ["top10", "story_moment", "micro_moment", "yearend_hot100", "custom_story"];
  if (requiresYear.includes(action) && !yearInt) {
    const replyRaw = safeMusicReplyFallback(minY, maxY);
    const fu = buildYearChips(action || "top10", lane, minY, maxY);

    return {
      route: "music_need_year",
      replyRaw,
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      topic: "music",
      spineStage: "clarify",
      actionTaken: "asked_year",
      pendingAsk: {
        id: "need_year",
        type: "clarify",
        prompt: `Give me a year (${minY}–${maxY}).`,
        required: true,
      },
      sessionPatch: { lane: "music" },
      meta: { minY, maxY },
    };
  }

  // Default behavior: if lane=music and year present but no action, treat as top10.
  const resolvedAction = action || (yearInt ? "top10" : "");

  // Try to load Top10 when needed.
  let top10 = null;
  let top10Meta = null;
  const wantsTop10 =
    resolvedAction === "top10" ||
    resolvedAction === "story_moment" ||
    resolvedAction === "micro_moment" ||
    resolvedAction === "custom_story";

  if (wantsTop10 && yearInt) {
    // meta opt enabled if allowDerivedTop10 OR explicit dev signals
    const wantMeta = !!opts.allowDerivedTop10;
    top10 = getTop10ByYear(yearInt, { meta: wantMeta });
    top10Meta = top10 && top10.meta ? top10.meta : null;
  }

  // If we wanted Top10 but it's missing, fail visibly.
  if (wantsTop10 && yearInt && !top10) {
    const replyRaw =
      `I don’t have Top 10 data wired for ${yearInt} yet.\n\n` +
      `Confirm the file exists: Data/top10_by_year_v1.json (years["${yearInt}"].items).`;
    const fu = buildYearChips("top10", lane, minY, maxY);

    return {
      route: "music_top10_missing_year",
      replyRaw,
      followUps: fu,
      followUpsStrings: fu.map((x) => x.label),
      topic: "music",
      spineStage: "clarify",
      actionTaken: "missing_data",
      pendingAsk: {
        id: "need_data",
        type: "clarify",
        prompt: "Wire Top10 data for that year (or pick another year).",
        required: true,
      },
      sessionPatch: { lane: "music", lastYear: yearInt },
      meta: { year: yearInt, file: TOP10_FILE },
    };
  }

  // Build reply per action.
  let replyRaw = "";
  let topic = "music";
  let spineStage = "deliver";
  let actionTaken = "served_music";
  let meta = {};

  if (resolvedAction === "top10") {
    const titleLine = `Top 10 — ${yearInt}`;
    const list = renderTop10Text(top10);
    replyRaw = `${titleLine}\n\n${list || "1. \"—\""}`
      .trim();
    topic = "top10";
    actionTaken = "served_top10";
    meta = top10Meta ? { top10Meta } : {};
  } else if (resolvedAction === "story_moment") {
    replyRaw = buildCinematicFromTop10(top10, yearInt, vibe);
    topic = "story_moment";
    actionTaken = "served_story_moment";
    meta = top10Meta ? { top10Meta } : {};
  } else if (resolvedAction === "micro_moment") {
    replyRaw = buildMicroMoment(top10, yearInt, vibe);
    topic = "micro_moment";
    actionTaken = "served_micro_moment";
    meta = top10Meta ? { top10Meta } : {};
  } else if (resolvedAction === "yearend_hot100") {
    replyRaw = buildYearEndHot100Note(yearInt);
    topic = "yearend_hot100";
    actionTaken = "served_yearend_note";
    meta = { needsData: true, suggestedFile: "yearend_hot100_by_year_v1.json" };
  } else if (resolvedAction === "custom_story") {
    // Custom story uses the same safe cinematic scaffold, but labels it as custom.
    const base = buildCinematicFromTop10(top10, yearInt, vibe);
    replyRaw = base.replace(/^Cinematic moment — /, "Custom story — ");
    topic = "custom_story";
    actionTaken = "served_custom_story";
    meta = top10Meta ? { top10Meta } : {};
  } else {
    // Unknown action — give a clean menu (but still within music lane).
    replyRaw = yearInt
      ? `Pick one for ${yearInt}:\n\n• Top 10\n• Make it cinematic\n• Micro-moment\n• Year-End Hot 100`
      : safeMusicReplyFallback(minY, maxY);
    topic = "menu";
    spineStage = "clarify";
    actionTaken = "served_music_menu";
  }

  if (!cleanText(replyRaw)) {
    replyRaw = safeMusicReplyFallback(minY, maxY);
    spineStage = "clarify";
    actionTaken = "reply_safety_fallback";
  }

  // Follow-ups (engine expects these)
  const followUps = buildFollowUpsForMusic(resolvedAction, yearInt, lane);
  const followUpsStrings = followUps.map((x) => x.label);

  // Session patch (music-owned)
  const sessionPatch = {
    lane: "music",
    lastYear: yearInt ?? session.lastYear ?? null,
    lastMode: "music",
    lastMusicYear: yearInt ?? session.lastMusicYear ?? null,
    lastAction: resolvedAction || session.lastAction || "",
    // small, safe helper flags for UI
    activeMusicChart:
      cleanText(top10?.chart) || cleanText(session.activeMusicChart) || "",
    lastMusicChart:
      cleanText(top10?.chart) || cleanText(session.lastMusicChart) || "",
  };

  return {
    route: "music",
    replyRaw,
    followUps,
    followUpsStrings,
    sessionPatch,
    pendingAsk: null,
    topic,
    spineStage,
    actionTaken,
    meta: {
      year: yearInt,
      action: resolvedAction,
      vibe: vibe || "",
      ...(meta || {}),
    },
  };
}

// =========================
// Exports
// =========================
module.exports = {
  // data API
  getTop10ByYear,
  renderTop10Text,

  // engine API
  handleMusicTurn,

  // constants (safe)
  TOP10_REQUIRED_COUNT,
  TOP10_FILE,
};
