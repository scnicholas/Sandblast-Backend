"use strict";

/**
 * Utils/musicKnowledge.js
 *
 * v1.3.0 (HANDLEMUSICTURN++++ + ROUTE CONTRACT++++ + YEAR-END/Story/Micro scaffolds++++ + DIAG HARDENING++++)
 *
 * Guarantees:
 *  - Top10 returns exactly 10 items (1..10 deterministic selection)
 *  - No silent drops (extras surfaced via meta when enabled)
 *  - No mutation of source data
 *  - Defensive structure validation
 *  - Visible failure modes
 *  - Safe rendering (never empty output)
 *
 * Accepts store shapes:
 *  A) { years: { "1988": { items:[...] } } }   ✅ preferred
 *  B) { years: { "1988": [...] } }            legacy
 *
 * ChatEngine integration:
 *  - Exports handleMusicTurn({ norm, session, knowledge, year, action, opts })
 *  - Returns:
 *      {
 *        ok, replyRaw,
 *        route, actionTaken,
 *        topic, spineStage,
 *        sessionPatch, pendingAsk,
 *        followUps, followUpsStrings,
 *        meta
 *      }
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

// Guardrails (chatEngine also enforces; we keep local safety)
const DEFAULT_PUBLIC_MIN_YEAR = 1950;
const DEFAULT_PUBLIC_MAX_YEAR = 2025;

// =========================
// Cache (mtime guarded)
// =========================
let _cache = {
  mtimeMs: 0,
  store: null,
  file: TOP10_FILE,
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

function safeStr(x) {
  return x === undefined || x === null ? "" : String(x);
}

function normalizeYear(year) {
  const digits = String(year ?? "").replace(/[^\d]/g, "");
  if (digits.length !== 4) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
  return String(n);
}

function toIntYear(year) {
  const y = normalizeYear(year);
  if (!y) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function cleanText(v) {
  return safeStr(v).trim();
}

/**
 * Fix common wiki-cache artifacts:
 * - \" / \" fragments
 * - doubled quotes from scraped "A" / "B" formatting
 */
function cleanTitleArtifacts(s) {
  const t = cleanText(s);
  if (!t) return "";
  let out = t.replace(/\\"/g, '"');

  // Normalize patterns like:  A" / "B   or   A\" / \"B
  out = out.replace(/\s*"\s*\/\s*"\s*/g, " / ");
  out = out.replace(/\s*“\s*\/\s*”\s*/g, " / ");

  // Collapse whitespace
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function cleanArtistArtifacts(s) {
  const t = cleanText(s);
  if (!t) return "";
  return t.replace(/\\"/g, '"').replace(/\s+/g, " ").trim();
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
    artist: cleanArtistArtifacts(raw?.artist ?? raw?.artists),
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
          artist: it.artist || "",
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
  const normalized = Array.isArray(rawItems) ? rawItems.map(normalizeItem) : [];
  const cleaned = dedupeExactSongs(normalized, meta);

  const byPos = new Map();

  for (let i = 0; i < cleaned.length; i++) {
    const it = cleaned[i];
    const p = coercePos(it.pos, i + 1);

    if (!byPos.has(p)) {
      byPos.set(p, {
        pos: p,
        title: it.title || "",
        artist: it.artist || "",
      });
    } else if (meta) {
      meta.warnings.push({
        code: "DUPLICATE_POSITION",
        pos: p,
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
          pos,
        });
      }
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
      meta.warnings.push({
        code: "EXTRA_ROWS_IGNORED",
        count: extras.length,
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
        extrasIgnored: [],
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
    ...(wantMeta ? { meta } : {}),
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
// FollowUps helper (simple, predictable)
// =========================
function yearFollowUps(baseAction, year) {
  const y = toIntYear(year);
  const y2 = y ? y - 1 : 1988;
  const y3 = y ? y + 1 : 1992;

  const make = (yy) => ({
    id: `fu_${baseAction}_${yy}`,
    type: "chip",
    label: String(yy),
    payload: { lane: "music", action: baseAction, year: yy, route: baseAction },
  });

  // Keep exactly 3, stable
  return [make(y2), make(y || 1988), make(y3)];
}

function modeFollowUps(year) {
  const y = toIntYear(year) || 1988;
  return [
    {
      id: `fu_top10_${y}`,
      type: "chip",
      label: "Top 10",
      payload: { lane: "music", action: "top10", year: y, route: "top10" },
    },
    {
      id: `fu_story_${y}`,
      type: "chip",
      label: "Make it cinematic",
      payload: { lane: "music", action: "story_moment", year: y, route: "story_moment" },
    },
    {
      id: `fu_yearend_${y}`,
      type: "chip",
      label: "Year-End Hot 100",
      payload: { lane: "music", action: "yearend_hot100", year: y, route: "yearend_hot100" },
    },
  ];
}

// =========================
// PendingAsk contract helper (small + safe)
// =========================
function pendingAskObj(id, type, prompt, required) {
  return {
    id: safeStr(id || ""),
    type: safeStr(type || "clarify"),
    prompt: safeStr(prompt || ""),
    required: required !== false,
  };
}

// =========================
// Core handlers (Top10 / story / micro / yearend)
// =========================
function handleTop10(year, opts) {
  const y = normalizeYear(year);
  if (!y) {
    return {
      ok: false,
      replyRaw: "Give me a valid year (YYYY).",
      route: "top10",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: yearFollowUps("top10", 1988),
      followUpsStrings: ["1987", "1988", "1989"],
      meta: { code: "BAD_YEAR" },
    };
  }

  const wantMeta = !!(opts && opts.meta === true);
  const top10 = getTop10ByYear(y, { meta: wantMeta });

  if (!top10) {
    return {
      ok: false,
      replyRaw: `I don’t have Top 10 data loaded for ${y}.`,
      route: "top10",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: yearFollowUps("top10", y),
      followUpsStrings: yearFollowUps("top10", y).map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }

  const header = `Top 10 — ${y}`;
  const body = renderTop10Text(top10) || `1. "—"\n2. "—"\n3. "—"\n4. "—"\n5. "—"\n6. "—"\n7. "—"\n8. "—"\n9. "—"\n10. "—"`;

  const replyRaw = `${header}\n\n${body}`;

  const sessionPatch = {
    lane: "music",
    lastYear: Number(y),
    lastMusicYear: Number(y),
    lastMode: "top10",
    lastAction: "top10",
    activeMusicChart: cleanText(top10.chart) || "",
    lastMusicChart: cleanText(top10.chart) || "",
  };

  const fu = modeFollowUps(y);

  return {
    ok: true,
    replyRaw,
    route: "top10",
    actionTaken: "served_top10",
    topic: "music",
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    meta: wantMeta ? { top10Meta: top10.meta || null } : {},
  };
}

/**
 * "story_moment" and "micro_moment" are intentionally lightweight here.
 * They DO NOT attempt narrative synthesis from external sources.
 * They work by anchoring on Top10 and applying an internal template.
 * If you later add richer story assets, slot them in here safely.
 */
function handleStoryMoment(year, opts) {
  const y = normalizeYear(year);
  if (!y) {
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the cinematic moment.",
      route: "story_moment",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: yearFollowUps("story_moment", 1988),
      followUpsStrings: ["1987", "1988", "1989"],
      meta: { code: "BAD_YEAR" },
    };
  }

  const top10 = getTop10ByYear(y, { meta: false });

  if (!top10) {
    return {
      ok: false,
      replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`,
      route: "story_moment",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: yearFollowUps("story_moment", y),
      followUpsStrings: yearFollowUps("story_moment", y).map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }

  // Anchor on #1 for the "cinematic" opening.
  const top = top10.items && top10.items[0] ? top10.items[0] : { title: "—", artist: "" };
  const title = cleanText(top.title) || "—";
  const artist = cleanText(top.artist);

  const replyRaw =
    `Cinematic moment — ${y}\n\n` +
    `Open on the hook: "${title}"${artist ? " — " + artist : ""}.\n` +
    `Now cut to the year’s texture: bright synths, clean drums, and radio that feels like neon.\n` +
    `If you want, I’ll do it as: (1) opening scene, (2) turning point, (3) closing line.\n\n` +
    `Want the scene to feel romantic, rebellious, or nostalgic?`;

  const sessionPatch = {
    lane: "music",
    lastYear: Number(y),
    lastMusicYear: Number(y),
    lastMode: "story_moment",
    lastAction: "story_moment",
    activeMusicChart: cleanText(top10.chart) || "",
    lastMusicChart: cleanText(top10.chart) || "",
  };

  const fu = [
    {
      id: `fu_story_rom_${y}`,
      type: "chip",
      label: "Romantic",
      payload: { lane: "music", action: "custom_story", year: Number(y), vibe: "romantic", route: "custom_story" },
    },
    {
      id: `fu_story_reb_${y}`,
      type: "chip",
      label: "Rebellious",
      payload: { lane: "music", action: "custom_story", year: Number(y), vibe: "rebellious", route: "custom_story" },
    },
    {
      id: `fu_story_nos_${y}`,
      type: "chip",
      label: "Nostalgic",
      payload: { lane: "music", action: "custom_story", year: Number(y), vibe: "nostalgic", route: "custom_story" },
    },
  ];

  return {
    ok: true,
    replyRaw,
    route: "story_moment",
    actionTaken: "served_story_moment",
    topic: "music",
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    meta: {},
  };
}

function handleMicroMoment(year, opts) {
  const y = normalizeYear(year);
  if (!y) {
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the micro-moment.",
      route: "micro_moment",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: yearFollowUps("micro_moment", 1988),
      followUpsStrings: ["1987", "1988", "1989"],
      meta: { code: "BAD_YEAR" },
    };
  }

  const top10 = getTop10ByYear(y, { meta: false });

  if (!top10) {
    return {
      ok: false,
      replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`,
      route: "micro_moment",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: yearFollowUps("micro_moment", y),
      followUpsStrings: yearFollowUps("micro_moment", y).map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }

  const pick = top10.items && top10.items[2] ? top10.items[2] : top10.items[0];
  const title = cleanText(pick?.title) || "—";
  const artist = cleanText(pick?.artist);

  const replyRaw =
    `Micro-moment — ${y}\n\n` +
    `One sentence. One image. One hit:\n` +
    `"${title}"${artist ? " — " + artist : ""} is the sound of a car window down at midnight, city lights sliding past.\n\n` +
    `Want it: softer, sharper, or more cinematic?`;

  const sessionPatch = {
    lane: "music",
    lastYear: Number(y),
    lastMusicYear: Number(y),
    lastMode: "micro_moment",
    lastAction: "micro_moment",
    activeMusicChart: cleanText(top10.chart) || "",
    lastMusicChart: cleanText(top10.chart) || "",
  };

  const fu = [
    { id: `fu_micro_soft_${y}`, type: "chip", label: "Softer", payload: { lane: "music", action: "custom_story", year: Number(y), vibe: "romantic", route: "custom_story" } },
    { id: `fu_micro_sharp_${y}`, type: "chip", label: "Sharper", payload: { lane: "music", action: "custom_story", year: Number(y), vibe: "rebellious", route: "custom_story" } },
    { id: `fu_micro_cine_${y}`, type: "chip", label: "Cinematic", payload: { lane: "music", action: "story_moment", year: Number(y), route: "story_moment" } },
  ];

  return {
    ok: true,
    replyRaw,
    route: "micro_moment",
    actionTaken: "served_micro_moment",
    topic: "music",
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    meta: {},
  };
}

function handleCustomStory(year, vibe, opts) {
  const y = normalizeYear(year);
  if (!y) {
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY), then pick a vibe.",
      route: "custom_story",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: yearFollowUps("custom_story", 1988),
      followUpsStrings: ["1987", "1988", "1989"],
      meta: { code: "BAD_YEAR" },
    };
  }

  const v = cleanText(vibe).toLowerCase();
  const vibeLabel = v === "romantic" ? "romantic" : v === "rebellious" ? "rebellious" : "nostalgic";

  const top10 = getTop10ByYear(y, { meta: false });
  if (!top10) {
    return {
      ok: false,
      replyRaw: `I don’t have chart data loaded for ${y}. Pick another year.`,
      route: "custom_story",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: yearFollowUps("custom_story", y),
      followUpsStrings: yearFollowUps("custom_story", y).map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }

  const top = top10.items && top10.items[0] ? top10.items[0] : { title: "—", artist: "" };
  const title = cleanText(top.title) || "—";
  const artist = cleanText(top.artist);

  const vibeLine =
    vibeLabel === "romantic"
      ? "Make it close and warm — like a secret you don’t regret."
      : vibeLabel === "rebellious"
      ? "Make it sharp and alive — like breaking your own rules on purpose."
      : "Make it tender and hazy — like the year is a photograph you can step into.";

  const replyRaw =
    `Custom story — ${y} (${vibeLabel})\n\n` +
    `${vibeLine}\n\n` +
    `Anchor track: "${title}"${artist ? " — " + artist : ""}.\n` +
    `Give me one detail: night-drive, dance-floor, or bedroom-radio — and I’ll write the scene in 3 beats.`;

  const sessionPatch = {
    lane: "music",
    lastYear: Number(y),
    lastMusicYear: Number(y),
    lastMode: "custom_story",
    lastAction: "custom_story",
    activeMusicChart: cleanText(top10.chart) || "",
    lastMusicChart: cleanText(top10.chart) || "",
  };

  const fu = [
    { id: `fu_detail_drive_${y}`, type: "chip", label: "Night-drive", payload: { lane: "music", action: "custom_story", year: Number(y), vibe: vibeLabel, focus: "night-drive", route: "custom_story" } },
    { id: `fu_detail_dance_${y}`, type: "chip", label: "Dance-floor", payload: { lane: "music", action: "custom_story", year: Number(y), vibe: vibeLabel, focus: "dance-floor", route: "custom_story" } },
    { id: `fu_detail_radio_${y}`, type: "chip", label: "Bedroom-radio", payload: { lane: "music", action: "custom_story", year: Number(y), vibe: vibeLabel, focus: "bedroom-radio", route: "custom_story" } },
  ];

  return {
    ok: true,
    replyRaw,
    route: "custom_story",
    actionTaken: "served_custom_story",
    topic: "music",
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    meta: { vibe: vibeLabel },
  };
}

/**
 * yearend_hot100
 * We only have Top10 store here. So we serve Top10 and explicitly label it as a Year-End excerpt.
 * This prevents broken promises while keeping the UX consistent.
 * When you add a full Hot100 store later, swap the resolver behind this route.
 */
function handleYearEndHot100(year, opts) {
  const y = normalizeYear(year);
  if (!y) {
    return {
      ok: false,
      replyRaw: "Give me a year (YYYY) for the year-end list.",
      route: "yearend_hot100",
      actionTaken: "need_year",
      pendingAsk: pendingAskObj("need_year", "clarify", "Give me a year (YYYY).", true),
      followUps: yearFollowUps("yearend_hot100", 1988),
      followUpsStrings: ["1987", "1988", "1989"],
      meta: { code: "BAD_YEAR" },
    };
  }

  const wantMeta = !!(opts && opts.meta === true);
  const top10 = getTop10ByYear(y, { meta: wantMeta });

  if (!top10) {
    return {
      ok: false,
      replyRaw: `I don’t have year-end data loaded for ${y}. Pick another year.`,
      route: "yearend_hot100",
      actionTaken: "year_not_found",
      pendingAsk: pendingAskObj("need_other_year", "clarify", "Pick another year.", true),
      followUps: yearFollowUps("yearend_hot100", y),
      followUpsStrings: yearFollowUps("yearend_hot100", y).map((x) => x.label),
      meta: { code: "YEAR_NOT_FOUND", year: y },
    };
  }

  const header = `Year-End Hot 100 — ${y}\n(Excerpt: Top 10)`;
  const body = renderTop10Text(top10) || `1. "—"\n2. "—"\n3. "—"\n4. "—"\n5. "—"\n6. "—"\n7. "—"\n8. "—"\n9. "—"\n10. "—"`;

  const replyRaw = `${header}\n\n${body}`;

  const sessionPatch = {
    lane: "music",
    lastYear: Number(y),
    lastMusicYear: Number(y),
    lastMode: "yearend_hot100",
    lastAction: "yearend_hot100",
    activeMusicChart: cleanText(top10.chart) || "",
    lastMusicChart: cleanText(top10.chart) || "",
  };

  const fu = modeFollowUps(y);

  return {
    ok: true,
    replyRaw,
    route: "yearend_hot100",
    actionTaken: "served_yearend_excerpt",
    topic: "music",
    spineStage: "deliver",
    sessionPatch,
    pendingAsk: null,
    followUps: fu,
    followUpsStrings: fu.map((x) => x.label),
    meta: wantMeta ? { top10Meta: top10.meta || null, note: "excerpt_top10_only" } : { note: "excerpt_top10_only" },
  };
}

// =========================
// handleMusicTurn (ChatEngine entrypoint)
// =========================
async function handleMusicTurn(args) {
  const norm = isObject(args?.norm) ? args.norm : {};
  const session = isObject(args?.session) ? args.session : {};
  const knowledge = isObject(args?.knowledge) ? args.knowledge : {};
  const opts = isObject(args?.opts) ? args.opts : {};

  const action = cleanText(args?.action || norm?.action || "");
  const year = args?.year ?? norm?.year ?? session?.lastYear ?? null;

  const minY = Number.isFinite(Number(opts.publicMinYear)) ? Number(opts.publicMinYear) : DEFAULT_PUBLIC_MIN_YEAR;
  const maxY = Number.isFinite(Number(opts.publicMaxYear)) ? Number(opts.publicMaxYear) : DEFAULT_PUBLIC_MAX_YEAR;

  const yInt = toIntYear(year);

  // If action implies year but year missing, return a clean pendingAsk bundle
  const requiresYear = new Set(["top10", "story_moment", "micro_moment", "yearend_hot100", "custom_story"]);
  if (requiresYear.has(action) && (yInt === null || !Number.isFinite(yInt))) {
    return {
      ok: true,
      replyRaw: `Give me a year (${minY}–${maxY}).`,
      route: action || "music",
      actionTaken: "need_year",
      topic: "music",
      spineStage: "clarify",
      sessionPatch: { lane: "music" },
      pendingAsk: pendingAskObj("need_year", "clarify", `Give me a year (${minY}–${maxY}).`, true),
      followUps: [
        { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: action || "top10", year: 1973, route: action || "top10" } },
        { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: action || "top10", year: 1988, route: action || "top10" } },
        { id: "fu_1992", type: "chip", label: "1992", payload: { lane: "music", action: action || "top10", year: 1992, route: action || "top10" } },
      ],
      followUpsStrings: ["1973", "1988", "1992"],
      meta: { code: "NEED_YEAR" },
    };
  }

  // Range guard (soft-fail with same UX)
  if (yInt !== null && (yInt < minY || yInt > maxY)) {
    return {
      ok: true,
      replyRaw: `Use a year in ${minY}–${maxY}.`,
      route: action || "music",
      actionTaken: "year_out_of_range",
      topic: "music",
      spineStage: "clarify",
      sessionPatch: { lane: "music" },
      pendingAsk: pendingAskObj("need_year", "clarify", `Use a year in ${minY}–${maxY}.`, true),
      followUps: yearFollowUps(action || "top10", yInt),
      followUpsStrings: yearFollowUps(action || "top10", yInt).map((x) => x.label),
      meta: { code: "YEAR_OUT_OF_RANGE", year: yInt, minY, maxY },
    };
  }

  // If no action provided but we have a year, default to top10
  const act = action || (yInt !== null ? "top10" : "ask_year");

  // Dispatch
  if (act === "top10") return handleTop10(yInt, { meta: !!opts.meta });
  if (act === "story_moment") return handleStoryMoment(yInt, {});
  if (act === "micro_moment") return handleMicroMoment(yInt, {});
  if (act === "yearend_hot100") return handleYearEndHot100(yInt, { meta: !!opts.meta });
  if (act === "custom_story") {
    const vibe = cleanText(norm?.vibe || norm?.payload?.vibe || "");
    return handleCustomStory(yInt, vibe || "nostalgic", {});
  }

  // ask_year / default menu
  return {
    ok: true,
    replyRaw: `Give me a year (${minY}–${maxY}). I’ll start with Top 10.`,
    route: "ask_year",
    actionTaken: "asked_year",
    topic: "music",
    spineStage: "clarify",
    sessionPatch: { lane: "music" },
    pendingAsk: pendingAskObj("need_year", "clarify", `Give me a year (${minY}–${maxY}).`, true),
    followUps: [
      { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: "top10", year: 1973, route: "top10" } },
      { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: "top10", year: 1988, route: "top10" } },
      { id: "fu_1992", type: "chip", label: "1992", payload: { lane: "music", action: "top10", year: 1992, route: "top10" } },
    ],
    followUpsStrings: ["1973", "1988", "1992"],
    meta: { code: "ASK_YEAR" },
  };
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
    sampleWarnings: (sample && sample.meta && Array.isArray(sample.meta.warnings)) ? sample.meta.warnings : [],
  };
}

// =========================
// Exports
// =========================
module.exports = {
  // core store API
  getTop10ByYear,
  renderTop10Text,

  // chatEngine entrypoint
  handleMusicTurn,

  // diagnostics
  getMusicDiag,
};
