"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.18ar (PACK VISIBILITY HARDENING++++ + CHIP SIGNAL ROUNDTRIP: payload<->root intent/route/label)
 *
 * Key fix vs 1.5.18aq:
 *  ✅ CRITICAL: CHIP PAYLOAD NORMALIZER now round-trips intent/route/label (not just lane/action/year/mode)
 *     - prevents “chip looks meaningful in payload but empty at root” → misroutes / frozen follow-ups / weak replay signatures
 *  ✅ Slightly stronger inbound signature derivation using intent/route/label (when no text)
 *
 * Keeps: multi-root crawl, manifest resolves across ALL data roots, stable keying, allow Data outside APP_ROOT,
 * bigger budgets, PUBLIC /api/packsight, pinned resolver, case-insensitive resolution, etc.
 */

// =========================
// Imports
// =========================
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// =========================
// Crash-proof logging (Render-friendly)
// =========================
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.log("[Sandblast][FATAL] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.log("[Sandblast][FATAL] uncaughtException:", err && (err.stack || err.message || err));
  try {
    setTimeout(() => process.exit(1), 250).unref?.();
  } catch (_) {
    process.exit(1);
  }
});

// Optional safe require
function safeRequire(p) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(p);
  } catch (_) {
    return null;
  }
}

// Engine + fetch
const chatEngineMod = safeRequire("./Utils/chatEngine") || safeRequire("./Utils/chatEngine.js") || null;

// fetch resolver (Node 18+ has global.fetch; node-fetch may be CJS fn OR {default: fn})
const nodeFetchMod = global.fetch ? null : safeRequire("node-fetch");
const fetchFn =
  global.fetch ||
  (typeof nodeFetchMod === "function" ? nodeFetchMod : null) ||
  (nodeFetchMod && typeof nodeFetchMod.default === "function" ? nodeFetchMod.default : null);

// Optional external packIndex module (nice-to-have, never required)
const packIndexMod = safeRequire("./Utils/packIndex") || safeRequire("./Utils/packIndex.js") || null;

// Optional external Nyx Voice Naturalizer (nice-to-have)
const nyxVoiceNaturalizeMod =
  safeRequire("./Utils/nyxVoiceNaturalize") || safeRequire("./Utils/nyxVoiceNaturalize.js") || null;

// =========================
// Version
// =========================
const INDEX_VERSION =
  "index.js v1.5.18ar (PACK VISIBILITY HARDENING++++: multi-root crawl + manifest resolves across ALL data roots + stable keying + CHIP SIGNAL ROUNDTRIP intent/route/label + allow Data outside APP_ROOT + bigger budgets + PUBLIC /api/packsight + case-insensitive Data/Scripts resolution + pinned/manifest path fallback + packsight diagnostics + manifest target probes + pinned packs to real Data/* files + manifest tolerance + tts get alias + built-in pack index + manifest pack loader + chip normalizer + nyx voice naturalizer + crash-proof boot + safe JSON parse + diagnostic logging + error middleware + knowledge bridge + CORS hard-lock + loop fuse + silent reset + replayKey hardening + boot replay isolation + output normalization + REAL ElevenLabs TTS)";

// =========================
// Utils
// =========================
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function clampFloat(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function toBool(v, def) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return !!def;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return !!def;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function safeJsonParseMaybe(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "object") return x;
  const s = String(x).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}
function pickClientIp(req) {
  const xf = safeStr(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket?.remoteAddress || "";
}
function normalizeOrigin(o) {
  return safeStr(o).trim().replace(/\/$/, "");
}

// =========================
// Env / knobs
// =========================
const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = String(process.env.NODE_ENV || "production").trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const MAX_JSON_BODY = String(process.env.MAX_JSON_BODY || "512kb");

// --- Knowledge Bridge knobs ---
const KNOWLEDGE_AUTOLOAD = toBool(process.env.KNOWLEDGE_AUTOLOAD, true);

// SAFER DEFAULT: scripts OFF unless explicitly enabled
const KNOWLEDGE_ENABLE_SCRIPTS = toBool(process.env.KNOWLEDGE_ENABLE_SCRIPTS, false);

const KNOWLEDGE_DEBUG_ENDPOINT = toBool(process.env.KNOWLEDGE_DEBUG_ENDPOINT, true);
const KNOWLEDGE_DEBUG_INCLUDE_DATA = toBool(process.env.KNOWLEDGE_DEBUG_INCLUDE_DATA, false);

const KNOWLEDGE_RELOAD_INTERVAL_MS = clampInt(
  process.env.KNOWLEDGE_RELOAD_INTERVAL_MS,
  0,
  0,
  24 * 60 * 60 * 1000
); // 0 = off

const KNOWLEDGE_MAX_FILES = clampInt(process.env.KNOWLEDGE_MAX_FILES, 2500, 200, 20000);

// IMPORTANT: bumped defaults again; wikipedia merged packs are often > 8MB.
const KNOWLEDGE_MAX_FILE_BYTES = clampInt(process.env.KNOWLEDGE_MAX_FILE_BYTES, 25_000_000, 50_000, 250_000_000);
const KNOWLEDGE_MAX_TOTAL_BYTES = clampInt(process.env.KNOWLEDGE_MAX_TOTAL_BYTES, 250_000_000, 1_000_000, 1_500_000_000);

// Root resolution: in Render, __dirname is safest
const APP_ROOT = path.resolve(__dirname);

// If your Data lives on a mounted disk (Render persistent disk), it may be outside APP_ROOT.
// Default ON because this is the #1 reason packs “vanish” in production.
const KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT = toBool(process.env.KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT, true);

// Scripts are riskier; keep default OFF unless you explicitly need it.
const KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT = toBool(process.env.KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT, false);

// =========================
// CRITICAL: Case-insensitive dir/path resolution (Linux-safe)
// =========================
function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}
function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch (_) {
    return null;
  }
}
function resolveDirCaseInsensitive(parentAbs, name) {
  try {
    const direct = path.resolve(parentAbs, name);
    const st = statSafe(direct);
    if (st && st.isDirectory()) return direct;

    const want = String(name || "").trim().toLowerCase();
    if (!want) return direct;

    const entries = fs.readdirSync(parentAbs, { withFileTypes: true });
    const hit = entries.find((e) => e && e.isDirectory() && String(e.name).toLowerCase() === want);
    if (hit) return path.resolve(parentAbs, hit.name);
  } catch (_) {}
  return path.resolve(parentAbs, name);
}
function resolveRelPathCaseInsensitive(rootAbs, relPath) {
  // Best-effort: walks segments under rootAbs and matches each segment case-insensitively when needed.
  try {
    const rel = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel) return rootAbs;

    const parts = rel.split("/").filter(Boolean);
    let cur = rootAbs;

    for (const part of parts) {
      const direct = path.join(cur, part);
      const st = statSafe(direct);
      if (st) {
        cur = direct;
        continue;
      }

      // Try case-insensitive match inside cur
      const want = String(part).toLowerCase();
      let entries = [];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch (_) {
        // can’t list; bail to direct
        cur = direct;
        continue;
      }
      const hit = entries.find((e) => e && String(e.name).toLowerCase() === want);
      if (hit) {
        cur = path.join(cur, hit.name);
      } else {
        cur = direct;
      }
    }

    return cur;
  } catch (_) {
    return path.join(rootAbs, relPath || "");
  }
}
function resolveDataDirFromEnv() {
  const envName = String(process.env.DATA_DIR || "Data").trim();

  // If envName is absolute, respect it (and allow outside APP_ROOT if env allows).
  try {
    if (path.isAbsolute(envName)) return path.resolve(envName);
  } catch (_) {}

  // if envName is a relative folder, resolve against APP_ROOT with case-insensitive fallback
  const absDirect = path.resolve(APP_ROOT, envName);
  const st = statSafe(absDirect);
  if (st && st.isDirectory()) return absDirect;
  // try case-insensitive folder match if envName is single-segment
  if (!envName.includes("/") && !envName.includes("\\")) {
    return resolveDirCaseInsensitive(APP_ROOT, envName);
  }
  // if multi-segment relative, walk case-insensitively
  const rel = path.relative(APP_ROOT, absDirect);
  return resolveRelPathCaseInsensitive(APP_ROOT, rel);
}
function resolveScriptsDirFromEnv() {
  const envName = String(process.env.SCRIPTS_DIR || "Scripts").trim();

  try {
    if (path.isAbsolute(envName)) return path.resolve(envName);
  } catch (_) {}

  const absDirect = path.resolve(APP_ROOT, envName);
  const st = statSafe(absDirect);
  if (st && st.isDirectory()) return absDirect;
  if (!envName.includes("/") && !envName.includes("\\")) {
    return resolveDirCaseInsensitive(APP_ROOT, envName);
  }
  const rel = path.relative(APP_ROOT, absDirect);
  return resolveRelPathCaseInsensitive(APP_ROOT, rel);
}

let DATA_DIR = resolveDataDirFromEnv();
let SCRIPTS_DIR = resolveScriptsDirFromEnv();

// Track candidate DATA roots (helps pinned packs “see” in odd layouts)
const DATA_ROOT_CANDIDATES = (() => {
  const out = [];
  const pushUnique = (p) => {
    if (!p) return;
    const rp = path.resolve(p);
    if (!out.includes(rp)) out.push(rp);
  };

  pushUnique(DATA_DIR);

  // Common alternates (defensive)
  pushUnique(path.resolve(APP_ROOT, "Data"));
  pushUnique(path.resolve(APP_ROOT, "data"));
  pushUnique(resolveDirCaseInsensitive(APP_ROOT, "Data"));
  pushUnique(resolveDirCaseInsensitive(APP_ROOT, "data"));

  // Filter to existing directories first, but keep at least the primary
  const existing = out.filter((p) => {
    const st = statSafe(p);
    return st && st.isDirectory();
  });
  return existing.length ? existing : out.slice(0, 1);
})();

// Nyx Voice Naturalizer knobs
const NYX_VOICE_NATURALIZE = toBool(process.env.NYX_VOICE_NATURALIZE, true);
const NYX_VOICE_NATURALIZE_MAXLEN = clampInt(process.env.NYX_VOICE_NATURALIZE_MAXLEN, 2200, 200, 20000);

// =========================
// Knowledge: Pinned packs (stable keys) — resilient resolver
// =========================
//
// NOTE: Updated to match your real filenames in Data/.
//       Resolver tries DATA_ROOT_CANDIDATES + case-insensitive subpaths.
//
const PINNED_PACKS = [
  {
    key: "music/top10_by_year",
    rels: [
      // ✅ YOUR REAL FILES
      "top10_by_year_v1.json",
      "top10_by_year_source_v1.json",

      // Optional alternates (safe to keep)
      "Nyx/top10_by_year_v1.json",
      "Packs/top10_by_year_v1.json",
      "music_top10_by_year.json",
      "Nyx/music_top10_by_year.json",
      "Packs/music_top10_by_year.json",
      "Nyx/music_top10.json",
      "music_top10.json",
    ],
  },
  {
    key: "music/number1_by_year",
    rels: [
      // (No matching file in your Data/ yet — this will stay pinned=false until you add one)
      "music_number1_by_year_v1.json",
      "music_number1_by_year.json",
      "Nyx/music_number1_by_year.json",
      "Packs/music_number1_by_year.json",
      "Nyx/music_number1.json",
      "music_number1.json",
    ],
  },
  {
    key: "music/story_moments_by_year",
    rels: [
      // ✅ YOUR REAL FILES
      "music_story_moments_v1.json",
      "music_story_moments_1950_1989.generated.json",

      // Optional alternates (safe to keep)
      "music/story_moments_by_year.json",
      "Nyx/music_story_moments_by_year.json",
      "Packs/music_story_moments_by_year.json",
      "Nyx/music_story_moments_v1.json",
      "music_story_moments_by_year.json",
    ],
  },
  {
    key: "music/micro_moments_by_year",
    rels: [
      // ✅ YOUR REAL FILES (layered moments)
      "music_moments_v1.json",
      "music_moments_v2.json",
      "music_moments_v2_layer2.json",
      "music_moments_v2_layer2_enriched.json",
      "music_moments_v2_layer2_filled.json",
      "music_moments_v2_layer3.json",

      // Optional alternates
      "music_micro_moments_by_year.json",
      "Nyx/music_micro_moments_by_year.json",
      "Packs/music_micro_moments_by_year.json",
      "Nyx/music_micro_moments.json",
      "music_micro_moments.json",
    ],
  },
];

// =========================
// PACK MANIFEST LOADER (CRITICAL)
// Loads: movies, sponsors, top40 weekly, wikipedia into stable keys
// =========================
//
// NOTE (v1.5.18aq): Manifest items now use rel paths for DATA roots.
//                   Resolver tries across DATA_ROOT_CANDIDATES (mounted disks, etc.).
//
const PACK_MANIFEST = [
  // --- MUSIC: Wikipedia Year-End Hot 100 (single merged file you generate) ---
  {
    key: "music/wiki/yearend_hot100_raw",
    type: "json_file_rel",
    rel: "wikipedia/billboard_yearend_hot100_1950_2024.json",
    transform: (payload) => manifestBuildYearMapFromRows(payload, "yearend_hot100"),
    outKey: "music/wiki/yearend_hot100_by_year",
  },

  // --- MUSIC: Top 40 weekly (folder of JSON packs) ---
  {
    key: "music/top40_weekly_raw",
    type: "json_dir_rel",
    rel: "charts/top40_weekly",
    postTransform: (allJson) => manifestBuildTop40WeeklyIndex(allJson, "music/top40_weekly_raw"),
    outKey: "music/top40_weekly_by_year_week",
  },

  // --- MOVIES ---
  {
    key: "movies/roku_catalog",
    type: "json_file_or_dir_rel",
    rel: "movies",
  },

  // --- SPONSORS ---
  {
    key: "sponsors/packs",
    type: "json_file_or_dir_rel",
    rel: "sponsors",
  },

  // OPTIONAL: if you have runtime JSON packs under Scripts (NOT build scripts)
  {
    key: "legacy/scripts_json",
    type: "json_dir_abs",
    abs: path.resolve(SCRIPTS_DIR, "packs_json"),
  },
];

// CORS
const ORIGINS_ALLOWLIST = String(
  process.env.CORS_ALLOW_ORIGINS ||
    process.env.ALLOW_ORIGINS ||
    "https://sandblast.channel,https://www.sandblast.channel,https://sandblastchannel.com,https://www.sandblastchannel.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ORIGINS_REGEX_ALLOWLIST = String(process.env.CORS_ALLOW_ORIGINS_REGEX || "").trim();

function makeOriginRegexes() {
  const raw = ORIGINS_REGEX_ALLOWLIST
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const r of raw) {
    try {
      out.push(new RegExp(r));
    } catch (_) {}
  }
  return out;
}
const ORIGIN_REGEXES = makeOriginRegexes();

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  if (ORIGINS_ALLOWLIST.includes(o)) return true;
  for (const rx of ORIGIN_REGEXES) {
    try {
      if (rx.test(o)) return true;
    } catch (_) {}
  }
  return false;
}

function makeReqId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_) {}
  return sha1(`${nowMs()}|${Math.random()}|${process.pid}`).slice(0, 20);
}

// Loop/guards
const LOOP_REPLAY_WINDOW_MS = clampInt(process.env.LOOP_REPLAY_WINDOW_MS, 4000, 500, 15000);
const BURST_WINDOW_MS = clampInt(process.env.BURST_WINDOW_MS, 1200, 200, 5000);
const BURST_MAX = clampInt(process.env.BURST_MAX, 6, 2, 30);
const SUSTAINED_WINDOW_MS = clampInt(process.env.SUSTAINED_WINDOW_MS, 12000, 2000, 60000);
const SUSTAINED_MAX = clampInt(process.env.SUSTAINED_MAX, 18, 6, 120);

// Boot-intro dedupe fuse
const BOOT_DEDUPE_MS = clampInt(process.env.BOOT_DEDUPE_MS, 1200, 200, 6000);
const BOOT_MAX_WINDOW_MS = clampInt(process.env.BOOT_MAX_WINDOW_MS, 6000, 1000, 30000);
const BOOT_MAX = clampInt(process.env.BOOT_MAX, 6, 2, 40);

const SESSION_TTL_MS = clampInt(
  process.env.SESSION_TTL_MS,
  45 * 60 * 1000,
  10 * 60 * 1000,
  12 * 60 * 60 * 1000
);
const SESSION_MAX = clampInt(process.env.SESSION_MAX, 50000, 5000, 250000);

// ElevenLabs TTS env
const ELEVEN_API_KEY = String(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || "").trim();
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || process.env.NYX_VOICE_ID || "").trim();
const ELEVEN_TTS_TIMEOUT_MS = clampInt(process.env.ELEVEN_TTS_TIMEOUT_MS, 20000, 4000, 60000);

const NYX_VOICE_STABILITY = clampFloat(process.env.NYX_VOICE_STABILITY, 0.45, 0, 1);
const NYX_VOICE_SIMILARITY = clampFloat(process.env.NYX_VOICE_SIMILARITY, 0.72, 0, 1);
const NYX_VOICE_STYLE = clampFloat(process.env.NYX_VOICE_STYLE, 0.25, 0, 1);
const NYX_VOICE_SPEAKER_BOOST = toBool(process.env.NYX_VOICE_SPEAKER_BOOST, true);

// =========================
// Nyx Voice Naturalizer (pre-TTS)
// =========================
function builtinNyxVoiceNaturalize(input) {
  let s = safeStr(input || "");
  if (!s) return "";

  // strip zero-width + normalize whitespace
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.trim();

  // tame repeated punctuation that can “stutter” in TTS
  s = s.replace(/([!?.,])\1{2,}/g, "$1$1");
  s = s.replace(/…{2,}/g, "…");

  // keep it bounded
  if (s.length > NYX_VOICE_NATURALIZE_MAXLEN) s = s.slice(0, NYX_VOICE_NATURALIZE_MAXLEN).trim();

  return s;
}

function nyxVoiceNaturalize(text) {
  if (!NYX_VOICE_NATURALIZE) return safeStr(text || "");
  try {
    if (nyxVoiceNaturalizeMod) {
      if (typeof nyxVoiceNaturalizeMod === "function") return safeStr(nyxVoiceNaturalizeMod(text) || "");
      if (typeof nyxVoiceNaturalizeMod.nyxVoiceNaturalize === "function")
        return safeStr(nyxVoiceNaturalizeMod.nyxVoiceNaturalize(text) || "");
      if (typeof nyxVoiceNaturalizeMod.default === "function") return safeStr(nyxVoiceNaturalizeMod.default(text) || "");
    }
  } catch (_) {
    // fall back
  }
  return builtinNyxVoiceNaturalize(text);
}

// Boot-like detection
function isBootLike(routeHint, body) {
  const rh = safeStr(routeHint).toLowerCase();
  const mode = safeStr(body?.mode || body?.intent || body?.client?.mode || body?.client?.intent).toLowerCase();
  const src = safeStr(body?.source || body?.client?.source).toLowerCase();

  if (rh === "boot_intro" || rh === "panel_open_intro") return true;
  if (mode === "boot_intro" || mode === "panel_open_intro") return true;

  if (rh.includes("panel_open_intro") || rh.includes("boot_intro")) return true;
  if (mode.includes("panel_open_intro") || mode.includes("boot_intro")) return true;

  if (src.includes("panel_open_intro") || src.includes("boot_intro")) return true;
  if (src.includes("panel-open-intro") || src.includes("boot-intro")) return true;

  if (rh === "boot" && (mode.includes("intro") || src.includes("widget"))) return true;
  if (mode === "boot" && rh.includes("intro")) return true;

  return false;
}

// =========================
// CRITICAL: empty-text chip intent normalization
// =========================
function hasIntentSignals(body) {
  const b = isPlainObject(body) ? body : {};
  const payload = isPlainObject(b.payload) ? b.payload : {};
  const ctx = isPlainObject(b.ctx) ? b.ctx : {};
  const client = isPlainObject(b.client) ? b.client : {};

  const sig =
    safeStr(payload.text || payload.message).trim() ||
    safeStr(b.text || b.message || b.prompt || b.query).trim() ||
    safeStr(payload.mode || payload.action || payload.intent || payload.route || payload.label).trim() ||
    safeStr(ctx.mode || ctx.action || ctx.intent || ctx.route).trim() ||
    safeStr(b.mode || b.action || b.intent || b.route).trim() ||
    safeStr(b.year || payload.year || ctx.year).trim() ||
    safeStr(client.routeHint || client.source).trim();

  return !!sig;
}

function normalizeInboundSignature(body, inboundText) {
  const b = isPlainObject(body) ? body : {};
  const payload = isPlainObject(b.payload) ? b.payload : {};
  const ctx = isPlainObject(b.ctx) ? b.ctx : {};

  const t = safeStr(inboundText).trim();
  if (t) return t.slice(0, 240);

  const tok =
    safeStr(payload.text || payload.message).trim() ||
    safeStr(payload.mode || payload.action || payload.intent || payload.route || payload.label).trim() ||
    safeStr(ctx.mode || ctx.action || ctx.intent || ctx.route).trim() ||
    safeStr(b.mode || b.action || b.intent || b.route || b.label).trim() ||
    "";

  const year = safeStr(b.year || payload.year || ctx.year).trim();
  const sig = [tok, year].filter(Boolean).join(" ").trim();

  return sig.slice(0, 240);
}

// =========================
// CRITICAL: reset detection + SILENT reset reply
// =========================
function isResetCommand(inboundText, source, body) {
  const t = safeStr(inboundText).trim();
  if (t === "__cmd:reset__") return true;

  const s = safeStr(source).toLowerCase();
  if (s === "reset_btn" || s.includes("reset")) return true;

  const b = isPlainObject(body) ? body : {};
  const client = isPlainObject(b.client) ? b.client : {};
  const cs = safeStr(client.source).toLowerCase();
  if (cs === "reset_btn" || cs.includes("reset")) return true;

  const rh = safeStr(b.routeHint || client.routeHint || "").toLowerCase();
  const it = safeStr(b.intent || client.intent || b.mode || client.mode || "").toLowerCase();
  if (rh.includes("reset") || it === "reset") return true;

  return false;
}

function silentResetReply() {
  return "";
}

// =========================
// Engine resolver (handleChat OR function export)
// =========================
function resolveEngine(mod) {
  if (!mod) return { fn: null, from: "missing", version: "" };

  if (typeof mod === "function") {
    return { fn: mod, from: "module_function", version: safeStr(mod.CE_VERSION || "") };
  }

  if (typeof mod.handleChat === "function") {
    return { fn: mod.handleChat.bind(mod), from: "module_handleChat", version: safeStr(mod.CE_VERSION || "") };
  }

  if (typeof mod.reply === "function") {
    return { fn: mod.reply.bind(mod), from: "module_reply", version: safeStr(mod.CE_VERSION || "") };
  }

  if (typeof mod.chatEngine === "function") {
    return { fn: mod.chatEngine.bind(mod), from: "module_chatEngine", version: safeStr(mod.CE_VERSION || "") };
  }

  return { fn: null, from: "invalid", version: safeStr(mod.CE_VERSION || "") };
}

const ENGINE = resolveEngine(chatEngineMod);
const ENGINE_VERSION = safeStr(ENGINE.version || chatEngineMod?.CE_VERSION || "").trim();

function normalizeEngineOutput(out) {
  if (out === null || out === undefined) return {};
  if (typeof out === "string") return { ok: true, reply: out };
  if (isPlainObject(out)) return out;
  return { ok: true, reply: safeStr(out) };
}

// =========================
// Knowledge Bridge
// =========================
const KNOWLEDGE = {
  ok: false,
  loadedAt: 0,
  filesScanned: 0,
  filesLoaded: 0,
  totalBytes: 0,
  json: {},
  scripts: {},
  errors: [],
  __manifest: [],
  __packsight: {
    dataRoots: [],
    pinnedResolved: [],
    manifestResolved: [],
    probes: [],
  },
};

function pushKnowledgeError(type, file, msg) {
  const e = { type: safeStr(type), file: safeStr(file), msg: safeStr(msg).slice(0, 300) };
  KNOWLEDGE.errors.push(e);
  if (KNOWLEDGE.errors.length > 80) KNOWLEDGE.errors.shift();
}

function isWithinRoot(p, root) {
  try {
    const rp = path.resolve(p);
    const rr = path.resolve(root);
    return rp === rr || rp.startsWith(rr + path.sep);
  } catch (_) {
    return false;
  }
}

function safeReadFileBytes(fp) {
  try {
    const st = fs.statSync(fp);
    const size = Number(st.size || 0);
    if (!Number.isFinite(size) || size <= 0) return { ok: false, size: 0, buf: null, reason: "empty_or_unknown" };
    if (size > KNOWLEDGE_MAX_FILE_BYTES) return { ok: false, size, buf: null, reason: "file_too_large" };
    return { ok: true, size, buf: fs.readFileSync(fp) };
  } catch (e) {
    return { ok: false, size: 0, buf: null, reason: safeStr(e?.message || e) };
  }
}

function walkFiles(dirAbs, exts, outArr, limit) {
  if (!dirAbs || !fileExists(dirAbs)) return;
  let stack = [dirAbs];
  while (stack.length) {
    const d = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      pushKnowledgeError("readdir", d, e?.message || e);
      continue;
    }
    for (const ent of entries) {
      if (outArr.length >= limit) return;
      const fp = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        stack.push(fp);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (exts.includes(ext)) outArr.push(fp);
      }
    }
  }
}

function fileKeyFromPath(rootAbs, fp) {
  const rel = path.relative(rootAbs, fp).replace(/\\/g, "/");
  const noExt = rel.replace(/\.[^/.]+$/, "");
  return noExt.replace(/[^a-zA-Z0-9/_\-\.]/g, "_");
}

// v1.5.18aq: choose the “best” root for a file so keys don’t fragment across mounts
function bestKeyForFile(fp, roots) {
  const abs = path.resolve(fp);
  const candidates = Array.isArray(roots) ? roots : [];
  let best = null;

  for (const r of candidates) {
    if (!r) continue;
    const rr = path.resolve(r);
    if (!isWithinRoot(abs, rr)) continue;
    const rel = path.relative(rr, abs).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) continue;

    // prefer shorter rel (more “direct” root)
    const score = rel.length;
    if (!best || score < best.score) best = { root: rr, rel, score };
  }

  if (best) return fileKeyFromPath(best.root, abs);

  // fallback: prefer DATA_DIR if it contains it
  if (DATA_DIR && isWithinRoot(abs, DATA_DIR)) return fileKeyFromPath(DATA_DIR, abs);

  // absolute fallback
  return fileKeyFromPath(APP_ROOT, abs);
}

function sanitizeScriptExport(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "function") return { __type: "function", name: safeStr(x.name || "anonymous") };
  if (typeof x === "string") return x.slice(0, 4000);
  if (typeof x === "number" || typeof x === "boolean") return x;
  if (Array.isArray(x)) return x.slice(0, 200).map((v) => sanitizeScriptExport(v));
  if (isPlainObject(x)) {
    const out = {};
    const keys = Object.keys(x).slice(0, 200);
    for (const k of keys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = sanitizeScriptExport(x[k]);
    }
    return out;
  }
  return { __type: typeof x };
}

function pinnedPresence() {
  const out = {};
  for (const p of PINNED_PACKS) {
    out[p.key] = Object.prototype.hasOwnProperty.call(KNOWLEDGE.json, p.key);
  }
  return out;
}

function resolvePinnedFileAbs(rels) {
  const arr = Array.isArray(rels) ? rels : [rels];
  for (const rel of arr) {
    const relNorm = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");
    for (const base of DATA_ROOT_CANDIDATES) {
      // First try direct
      const fpDirect = path.resolve(base, relNorm);
      if (fileExists(fpDirect)) return fpDirect;

      // Then case-insensitive traversal under base (fixes wikipedia/ vs Wikipedia/ etc.)
      const fpCI = resolveRelPathCaseInsensitive(base, relNorm);
      if (fileExists(fpCI)) return fpCI;
    }
  }
  return null;
}

// v1.5.18aq: resolve a manifest REL across all data roots (file OR dir)
function resolveDataRelAcrossRoots(rel) {
  const relNorm = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!relNorm) return null;

  for (const base of DATA_ROOT_CANDIDATES) {
    const direct = path.resolve(base, relNorm);
    if (fileExists(direct)) return direct;

    const ci = resolveRelPathCaseInsensitive(base, relNorm);
    if (fileExists(ci)) return ci;
  }
  return null;
}

function loadPinnedPack(rels, forcedKey, loadedFiles, totalBytesRef) {
  const fp = resolvePinnedFileAbs(rels);

  if (!fp) {
    pushKnowledgeError("pinned_missing", `${forcedKey}`, `Pinned pack missing (tried: ${JSON.stringify(rels)})`);
    return { ok: false, skipped: false, reason: "missing" };
  }

  if (loadedFiles && loadedFiles.has(fp)) {
    return { ok: true, skipped: true, reason: "already_loaded" };
  }

  const r = safeReadFileBytes(fp);
  if (!r.ok) {
    pushKnowledgeError("pinned_read", fp, r.reason || "read_failed");
    return { ok: false, skipped: false, reason: r.reason || "read_failed" };
  }

  const nextTotal = (totalBytesRef.value || 0) + r.size;
  if (nextTotal > KNOWLEDGE_MAX_TOTAL_BYTES) {
    pushKnowledgeError("pinned_budget", fp, "total bytes budget exceeded (pinned pack skipped)");
    return { ok: false, skipped: true, reason: "budget" };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(r.buf.toString("utf8"));
  } catch (e) {
    pushKnowledgeError("pinned_parse", fp, e?.message || e);
    return { ok: false, skipped: false, reason: "parse_failed" };
  }

  KNOWLEDGE.json[String(forcedKey)] = parsed;
  KNOWLEDGE.filesLoaded += 1;
  totalBytesRef.value = nextTotal;
  KNOWLEDGE.totalBytes = totalBytesRef.value;

  if (loadedFiles) loadedFiles.add(fp);

  // packsight
  if (KNOWLEDGE.__packsight && Array.isArray(KNOWLEDGE.__packsight.pinnedResolved)) {
    KNOWLEDGE.__packsight.pinnedResolved.push({ key: String(forcedKey), fp });
  }

  return { ok: true, skipped: false, fp };
}

// =========================
// Manifest helpers (safe, no collisions)
// =========================
function manifestExtractRows(payload) {
  // Accept:
  //  - {rows:[...]}
  //  - raw array [...]
  //  - {data:[...]} / {items:[...]} (best-effort)
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function manifestBuildYearMapFromRows(payload, label) {
  const out = Object.create(null);
  const rows = manifestExtractRows(payload);
  for (const r of rows) {
    const y = Number(r && r.year);
    if (!Number.isFinite(y)) continue;
    if (!out[y]) out[y] = [];
    out[y].push(r);
  }
  for (const y of Object.keys(out)) {
    out[y].sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999));
  }
  return { ok: true, label: safeStr(label), byYear: out, builtAt: new Date().toISOString() };
}

function manifestBuildTop40WeeklyIndex(allJson, prefixKey) {
  const byYearWeek = Object.create(null);
  const root = allJson && typeof allJson === "object" ? allJson : {};

  const keys = Object.keys(root).filter((k) => String(k).startsWith(prefixKey + "/"));
  for (const k of keys) {
    const pack = root[k];
    if (!pack) continue;

    if (pack.byYearWeek && typeof pack.byYearWeek === "object") {
      for (const y of Object.keys(pack.byYearWeek)) {
        if (!byYearWeek[y]) byYearWeek[y] = Object.create(null);
        const weeks = pack.byYearWeek[y] || {};
        for (const w of Object.keys(weeks)) {
          byYearWeek[y][w] = weeks[w];
        }
      }
      continue;
    }

    const rows = manifestExtractRows(pack);
    if (rows.length) {
      for (const r of rows) {
        const y = String(Number(r.year));
        const w = String(Number(r.week));
        if (!y || y === "NaN" || !w || w === "NaN") continue;
        if (!byYearWeek[y]) byYearWeek[y] = Object.create(null);
        if (!byYearWeek[y][w]) byYearWeek[y][w] = [];
        byYearWeek[y][w].push(r);
      }
    }
  }

  for (const y of Object.keys(byYearWeek)) {
    for (const w of Object.keys(byYearWeek[y])) {
      byYearWeek[y][w].sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999));
    }
  }

  return { ok: true, label: "top40_weekly", byYearWeek, builtAt: new Date().toISOString() };
}

// If a manifest path is missing, retry with case-insensitive resolution relative to DATA roots / SCRIPTS_DIR / APP_ROOT.
function resolveManifestAbsFallback(absPath) {
  const p = path.resolve(absPath);
  if (fileExists(p)) return p;

  // If path is under a known data root, retry case-insensitive relative traversal.
  for (const base of DATA_ROOT_CANDIDATES) {
    try {
      const rel = path.relative(base, p);
      if (rel && !rel.startsWith("..")) {
        const alt = resolveRelPathCaseInsensitive(base, rel);
        if (fileExists(alt)) return alt;
      }
    } catch (_) {}
  }

  // Retry under SCRIPTS_DIR similarly
  try {
    const relS = path.relative(SCRIPTS_DIR, p);
    if (relS && !relS.startsWith("..")) {
      const altS = resolveRelPathCaseInsensitive(SCRIPTS_DIR, relS);
      if (fileExists(altS)) return altS;
    }
  } catch (_) {}

  // Last-ditch: if absPath looks relative-ish, try from APP_ROOT case-insensitively
  try {
    const relA = path.relative(APP_ROOT, p);
    if (relA && !relA.startsWith("..")) {
      const altA = resolveRelPathCaseInsensitive(APP_ROOT, relA);
      if (fileExists(altA)) return altA;
    }
  } catch (_) {}

  return p;
}

function manifestLoadJsonFileIntoKey(fp, key, loadedFiles, totalBytesRef) {
  const realFp = resolveManifestAbsFallback(fp);

  if (loadedFiles && loadedFiles.has(realFp)) return { ok: true, skipped: true, reason: "already_loaded" };
  if (!fileExists(realFp)) return { ok: false, skipped: false, reason: "missing" };

  const r = safeReadFileBytes(realFp);
  if (!r.ok) {
    pushKnowledgeError("manifest_read", realFp, r.reason || "read_failed");
    return { ok: false, skipped: false, reason: r.reason || "read_failed" };
  }

  const nextTotal = (totalBytesRef.value || 0) + r.size;
  if (nextTotal > KNOWLEDGE_MAX_TOTAL_BYTES) {
    pushKnowledgeError("manifest_budget", realFp, "total bytes budget exceeded (manifest file skipped)");
    return { ok: false, skipped: true, reason: "budget" };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(r.buf.toString("utf8"));
  } catch (e) {
    pushKnowledgeError("manifest_parse", realFp, e?.message || e);
    return { ok: false, skipped: false, reason: "parse_failed" };
  }

  KNOWLEDGE.json[key] = parsed;
  KNOWLEDGE.filesLoaded += 1;
  totalBytesRef.value = nextTotal;
  KNOWLEDGE.totalBytes = totalBytesRef.value;
  if (loadedFiles) loadedFiles.add(realFp);

  // packsight
  if (KNOWLEDGE.__packsight && Array.isArray(KNOWLEDGE.__packsight.manifestResolved)) {
    KNOWLEDGE.__packsight.manifestResolved.push({ key: String(key), fp: realFp });
  }

  return { ok: true, skipped: false, fp: realFp };
}

function manifestLoadJsonDirIntoPrefix(dirAbs, prefixKey, loadedFiles, totalBytesRef, maxFiles = 5000) {
  const realDir = resolveManifestAbsFallback(dirAbs);
  const st = statSafe(realDir);
  if (!st || !st.isDirectory()) return { ok: false, reason: "missing_dir", loaded: 0 };

  const files = [];
  walkFiles(realDir, [".json"], files, maxFiles);

  let loaded = 0;
  for (const fp of files) {
    const rel = path.relative(realDir, fp).replace(/\\/g, "/");
    const noExt = rel.replace(/\.[^/.]+$/, "");
    const key = `${prefixKey}/${noExt}`;
    const res = manifestLoadJsonFileIntoKey(fp, key, loadedFiles, totalBytesRef);
    if (res.ok && !res.skipped) loaded++;
    if (totalBytesRef.value > KNOWLEDGE_MAX_TOTAL_BYTES) break;
    if (KNOWLEDGE.filesLoaded >= KNOWLEDGE_MAX_FILES) break;
  }
  return { ok: true, loaded, dir: realDir };
}

function manifestLoadFileOrDir(absPath, baseKey, loadedFiles, totalBytesRef) {
  try {
    const resolved = resolveManifestAbsFallback(absPath);
    if (fileExists(resolved)) {
      const st = fs.statSync(resolved);
      if (st.isDirectory()) {
        return manifestLoadJsonDirIntoPrefix(resolved, baseKey, loadedFiles, totalBytesRef);
      }
      if (st.isFile() && path.extname(resolved).toLowerCase() === ".json") {
        return manifestLoadJsonFileIntoKey(resolved, baseKey, loadedFiles, totalBytesRef);
      }
    }

    const tryJson = resolved.endsWith(".json") ? resolved : resolved + ".json";
    if (fileExists(tryJson)) return manifestLoadJsonFileIntoKey(tryJson, baseKey, loadedFiles, totalBytesRef);
  } catch (e) {
    pushKnowledgeError("manifest_stat", absPath, e?.message || e);
  }

  return { ok: false, reason: "missing_file_or_dir" };
}

function manifestLoadPacks(loadedFiles, totalBytesRef) {
  const loadedSummary = [];

  for (const item of PACK_MANIFEST) {
    try {
      // v1.5.18aq: resolve rels across roots (data mounts, etc.)
      if (item.type === "json_file_rel") {
        const fp = resolveDataRelAcrossRoots(item.rel);
        const res = fp
          ? manifestLoadJsonFileIntoKey(fp, item.key, loadedFiles, totalBytesRef)
          : { ok: false, reason: "missing" };

        if (res.ok && !res.skipped && typeof item.transform === "function" && item.outKey) {
          const derived = item.transform(KNOWLEDGE.json[item.key]);
          KNOWLEDGE.json[item.outKey] = derived;
        }

        loadedSummary.push({ key: item.key, ok: res.ok, skipped: !!res.skipped, reason: res.reason || "" });
        continue;
      }

      if (item.type === "json_dir_rel") {
        const dir = resolveDataRelAcrossRoots(item.rel);
        const res = dir
          ? manifestLoadJsonDirIntoPrefix(dir, item.key, loadedFiles, totalBytesRef)
          : { ok: false, reason: "missing_dir" };

        if (res.ok && typeof item.postTransform === "function" && item.outKey) {
          const derived = item.postTransform(KNOWLEDGE.json, item.key);
          KNOWLEDGE.json[item.outKey] = derived;
        }

        loadedSummary.push({ key: item.key, ok: res.ok, loaded: res.loaded || 0, reason: res.reason || "" });
        continue;
      }

      if (item.type === "json_file_or_dir_rel") {
        const p = resolveDataRelAcrossRoots(item.rel);
        const res = p ? manifestLoadFileOrDir(p, item.key, loadedFiles, totalBytesRef) : { ok: false, reason: "missing_file_or_dir" };
        loadedSummary.push({ key: item.key, ok: res.ok, reason: res.reason || "" });
        continue;
      }

      // absolute types (scripts etc.)
      if (item.type === "json_dir_abs") {
        const res = manifestLoadJsonDirIntoPrefix(item.abs, item.key, loadedFiles, totalBytesRef);
        loadedSummary.push({ key: item.key, ok: res.ok, loaded: res.loaded || 0, reason: res.reason || "" });
        continue;
      }

      if (item.type === "json_file_abs") {
        const res = manifestLoadJsonFileIntoKey(item.abs, item.key, loadedFiles, totalBytesRef);
        loadedSummary.push({ key: item.key, ok: res.ok, skipped: !!res.skipped, reason: res.reason || "" });
        continue;
      }
    } catch (e) {
      pushKnowledgeError("manifest_exception", item.key, e?.message || e);
      loadedSummary.push({ key: item.key, ok: false, reason: "exception" });
    }
  }

  return loadedSummary;
}

// Probes to quickly answer “does this exist and what path resolved?”
function buildManifestProbes() {
  const targets = [
    { id: "wiki_yearend_hot100", rel: "wikipedia/billboard_yearend_hot100_1950_2024.json", kind: "file" },
    { id: "top40_weekly_dir", rel: "charts/top40_weekly", kind: "dir" },
    { id: "movies_root", rel: "movies", kind: "dir_or_file" },
    { id: "sponsors_root", rel: "sponsors", kind: "dir_or_file" },
  ];

  const probes = [];
  for (const t of targets) {
    const perRoot = [];
    for (const base of DATA_ROOT_CANDIDATES.slice(0, 8)) {
      const direct = path.resolve(base, t.rel);
      const directExists = fileExists(direct);
      const ci = resolveRelPathCaseInsensitive(base, t.rel);
      const ciExists = fileExists(ci);

      const resolved = resolveManifestAbsFallback(direct);
      const resolvedExists = fileExists(resolved);

      perRoot.push({
        base,
        direct,
        directExists,
        ci,
        ciExists,
        resolved,
        resolvedExists,
      });
    }

    // pick a “best” resolved for quick display
    let best = null;
    for (const r of perRoot) {
      if (r.resolvedExists) {
        best = { fp: r.resolved, via: "resolveManifestAbsFallback", base: r.base };
        break;
      }
      if (r.ciExists) {
        best = { fp: r.ci, via: "case_insensitive_walk", base: r.base };
        break;
      }
      if (r.directExists) {
        best = { fp: r.direct, via: "direct", base: r.base };
        break;
      }
    }

    probes.push({
      id: t.id,
      rel: t.rel,
      kind: t.kind,
      best,
      any: !!best,
      rootsChecked: perRoot.length,
      // keep compact: only show first 2 roots fully, rest summarized
      preview: perRoot.slice(0, 2),
      remainingAny: perRoot.slice(2).some((x) => x.resolvedExists || x.ciExists || x.directExists),
    });
  }

  return probes;
}

function reloadKnowledge() {
  const started = nowMs();

  KNOWLEDGE.ok = false;
  KNOWLEDGE.loadedAt = started;
  KNOWLEDGE.filesScanned = 0;
  KNOWLEDGE.filesLoaded = 0;
  KNOWLEDGE.totalBytes = 0;
  KNOWLEDGE.json = {};
  KNOWLEDGE.scripts = {};
  KNOWLEDGE.errors = [];
  KNOWLEDGE.__manifest = [];
  KNOWLEDGE.__packsight = {
    dataRoots: DATA_ROOT_CANDIDATES.slice(0, 6),
    pinnedResolved: [],
    manifestResolved: [],
    probes: [],
  };

  // refresh probes early (even if loads fail)
  try {
    KNOWLEDGE.__packsight.probes = buildManifestProbes();
  } catch (_) {
    KNOWLEDGE.__packsight.probes = [];
  }

  const dataOk = DATA_ROOT_CANDIDATES.some((d) => {
    if (!fileExists(d)) return false;
    if (KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT) return true;
    return isWithinRoot(d, APP_ROOT);
  });

  const scriptsOk = (() => {
    if (!fileExists(SCRIPTS_DIR)) return false;
    if (KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT) return true;
    return isWithinRoot(SCRIPTS_DIR, APP_ROOT);
  })();

  if (!dataOk) {
    pushKnowledgeError(
      "dir",
      DATA_DIR,
      `DATA roots not readable (missing OR blocked by APP_ROOT). allowOutside=${KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT}`
    );
  }
  if (!scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS) {
    pushKnowledgeError(
      "dir",
      SCRIPTS_DIR,
      `SCRIPTS_DIR not readable (missing OR blocked by APP_ROOT). allowOutside=${KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT}`
    );
  }

  const loadedFiles = new Set(); // prevents double-loading pinned + crawl + manifest
  const totalBytesRef = { value: 0 };

  // ---- Force-load pinned packs under stable keys (before generic crawl) ----
  if (dataOk) {
    for (const p of PINNED_PACKS) {
      try {
        loadPinnedPack(p.rels, p.key, loadedFiles, totalBytesRef);
      } catch (e) {
        pushKnowledgeError("pinned_exception", p.key, e?.message || e);
      }
      if (KNOWLEDGE.filesLoaded >= KNOWLEDGE_MAX_FILES) break;
      if (totalBytesRef.value > KNOWLEDGE_MAX_TOTAL_BYTES) break;
    }
  }

  // ---- Load MANIFEST packs next ----
  if (dataOk || (scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS)) {
    try {
      const manifestSummary = manifestLoadPacks(loadedFiles, totalBytesRef);
      KNOWLEDGE.__manifest = Array.isArray(manifestSummary) ? manifestSummary : [];
    } catch (e) {
      pushKnowledgeError("manifest_load", "PACK_MANIFEST", e?.message || e);
    }
  }

  // ---- Crawl remaining JSON files (v1.5.18aq: walk ALL data roots, not just one) ----
  const jsonFiles = [];
  const seen = new Set();

  const rootsToWalk = DATA_ROOT_CANDIDATES.filter((d) => {
    const st = statSafe(d);
    return st && st.isDirectory();
  });

  for (const root of rootsToWalk) {
    if (jsonFiles.length >= KNOWLEDGE_MAX_FILES) break;
    const tmp = [];
    walkFiles(root, [".json"], tmp, Math.max(0, KNOWLEDGE_MAX_FILES - jsonFiles.length));
    for (const fp of tmp) {
      const abs = path.resolve(fp);
      if (seen.has(abs)) continue;
      seen.add(abs);
      jsonFiles.push(abs);
      if (jsonFiles.length >= KNOWLEDGE_MAX_FILES) break;
    }
  }

  const jsFiles = [];
  if (scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS) {
    walkFiles(SCRIPTS_DIR, [".js", ".cjs"], jsFiles, Math.min(KNOWLEDGE_MAX_FILES, 1000));
  }

  KNOWLEDGE.filesScanned = jsonFiles.length + jsFiles.length;

  // Continue loading remaining json files (skip already-loaded pinned/manifest files)
  for (const fp of jsonFiles) {
    if (KNOWLEDGE.filesLoaded >= KNOWLEDGE_MAX_FILES) break;
    if (loadedFiles.has(fp)) continue;

    const r = safeReadFileBytes(fp);
    if (!r.ok) {
      pushKnowledgeError("json_read", fp, r.reason || "read_failed");
      continue;
    }

    const nextTotal = totalBytesRef.value + r.size;
    if (nextTotal > KNOWLEDGE_MAX_TOTAL_BYTES) {
      pushKnowledgeError("budget", fp, "total bytes budget exceeded; stopping load");
      break;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(r.buf.toString("utf8"));
    } catch (e) {
      pushKnowledgeError("json_parse", fp, e?.message || e);
      continue;
    }

    // v1.5.18aq: stable per-file key using best root (prevents fragmentation)
    const key = bestKeyForFile(fp, rootsToWalk.length ? rootsToWalk : DATA_ROOT_CANDIDATES);

    if (!Object.prototype.hasOwnProperty.call(KNOWLEDGE.json, key)) {
      KNOWLEDGE.json[key] = parsed;
    }
    KNOWLEDGE.filesLoaded += 1;
    totalBytesRef.value = nextTotal;
    KNOWLEDGE.totalBytes = totalBytesRef.value;
    loadedFiles.add(fp);

    if (totalBytesRef.value > KNOWLEDGE_MAX_TOTAL_BYTES) break;
  }

  if (scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS) {
    for (const fp of jsFiles) {
      if (KNOWLEDGE.filesLoaded >= KNOWLEDGE_MAX_FILES) break;

      const base = path.basename(fp).toLowerCase();
      const allowBuildScripts = toBool(process.env.KNOWLEDGE_ALLOW_BUILD_SCRIPTS, false);
      if (!allowBuildScripts && (base.startsWith("build_") || base.includes("migrate") || base.includes("seed_"))) {
        continue;
      }

      let mod = null;
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        mod = require(fp);
      } catch (e) {
        pushKnowledgeError("script_require", fp, e?.message || e);
        continue;
      }

      const key = fileKeyFromPath(SCRIPTS_DIR, fp);
      KNOWLEDGE.scripts[key] = sanitizeScriptExport(mod);
      KNOWLEDGE.filesLoaded += 1;
    }
  }

  const jsonKeys = Object.keys(KNOWLEDGE.json).length;
  const scriptKeys = Object.keys(KNOWLEDGE.scripts).length;
  KNOWLEDGE.ok = jsonKeys + scriptKeys > 0;

  const pins = pinnedPresence();
  const pinnedOk = Object.values(pins).some(Boolean);

  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast][Knowledge] loaded=${KNOWLEDGE.ok} pinnedAny=${pinnedOk} jsonKeys=${jsonKeys} scriptKeys=${scriptKeys} filesLoaded=${KNOWLEDGE.filesLoaded} totalBytes=${KNOWLEDGE.totalBytes} errors=${KNOWLEDGE.errors.length} in ${
      nowMs() - started
    }ms (DATA_DIR=${DATA_DIR}, dataRoots=${JSON.stringify(
      DATA_ROOT_CANDIDATES.slice(0, 4)
    )}, allowDataOutside=${KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT}, SCRIPTS_DIR=${SCRIPTS_DIR}, scriptsEnabled=${KNOWLEDGE_ENABLE_SCRIPTS}, allowScriptsOutside=${KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT})`
  );
  // eslint-disable-next-line no-console
  console.log(`[Sandblast][Knowledge] pinnedPresence=${JSON.stringify(pins)}`);
  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast][Knowledge] pinnedResolved=${JSON.stringify((KNOWLEDGE.__packsight?.pinnedResolved || []).slice(0, 12))}`
  );
  // eslint-disable-next-line no-console
  console.log(`[Sandblast][Knowledge] manifest=${JSON.stringify((KNOWLEDGE.__manifest || []).slice(0, 12))}`);
  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast][Knowledge] probes=${JSON.stringify(
      (KNOWLEDGE.__packsight?.probes || []).map((p) => ({ id: p.id, rel: p.rel, any: p.any, best: p.best }))
    )}`
  );

  return { ok: KNOWLEDGE.ok, loadedAt: KNOWLEDGE.loadedAt, jsonKeys, scriptKeys, filesLoaded: KNOWLEDGE.filesLoaded };
}

function knowledgeStatusForMeta() {
  return {
    ok: KNOWLEDGE.ok,
    loadedAt: KNOWLEDGE.loadedAt,
    errorCount: KNOWLEDGE.errors.length,
    errorsPreview: KNOWLEDGE.errors.slice(0, 3),
    jsonKeyCount: Object.keys(KNOWLEDGE.json).length,
    scriptKeyCount: Object.keys(KNOWLEDGE.scripts).length,
    pinned: pinnedPresence(),
    manifest: Array.isArray(KNOWLEDGE.__manifest) ? KNOWLEDGE.__manifest.slice(0, 12) : [],
  };
}

function knowledgeSnapshotForEngine() {
  return {
    json: KNOWLEDGE.json,
    scripts: KNOWLEDGE.scripts,
    meta: {
      ok: KNOWLEDGE.ok,
      loadedAt: KNOWLEDGE.loadedAt,
      jsonKeyCount: Object.keys(KNOWLEDGE.json).length,
      scriptKeyCount: Object.keys(KNOWLEDGE.scripts).length,
      filesScanned: KNOWLEDGE.filesScanned,
      filesLoaded: KNOWLEDGE.filesLoaded,
      totalBytes: KNOWLEDGE.totalBytes,
      errorCount: KNOWLEDGE.errors.length,
      errorsPreview: KNOWLEDGE.errors.slice(0, 5),
      pinned: pinnedPresence(),
      manifest: Array.isArray(KNOWLEDGE.__manifest) ? KNOWLEDGE.__manifest : [],
      packsight: KNOWLEDGE.__packsight,
    },
  };
}

if (KNOWLEDGE_AUTOLOAD) {
  try {
    reloadKnowledge();
  } catch (e) {
    pushKnowledgeError("boot_load", "reloadKnowledge()", e?.message || e);
    // eslint-disable-next-line no-console
    console.log(`[Sandblast][Knowledge] boot load failed: ${safeStr(e?.message || e).slice(0, 200)}`);
  }
}

if (KNOWLEDGE_AUTOLOAD && KNOWLEDGE_RELOAD_INTERVAL_MS > 0) {
  setInterval(() => {
    try {
      reloadKnowledge();
    } catch (e) {
      pushKnowledgeError("interval_load", "reloadKnowledge()", e?.message || e);
    }
  }, KNOWLEDGE_RELOAD_INTERVAL_MS).unref?.();
}

// =========================
// Built-in Pack Index (no dependency)
// =========================
function buildBuiltinPackIndex() {
  const jsonKeys = Object.keys(KNOWLEDGE.json || {});
  const pins = pinnedPresence();

  const groups = {
    pinned: [],
    music: [],
    movies: [],
    sponsors: [],
    top10: [],
    generic: [],
  };

  const packs = {};

  for (const k of jsonKeys) {
    const kl = String(k).toLowerCase();

    const domain =
      kl.includes("sponsor") || kl.startsWith("sponsors/") || kl.includes("/sponsors/")
        ? "sponsors"
        : kl.includes("movie") || kl.startsWith("movies/") || kl.includes("/movies/")
          ? "movies"
          : kl.includes("music") || kl.startsWith("music/") || kl.includes("/music/")
            ? "music"
            : "generic";

    const kind =
      kl.includes("top10") || kl.includes("top_10") || kl.includes("top-ten") || kl.includes("topten") ? "top10" : "pack";

    packs[k] = {
      id: k,
      available: true,
      domain,
      kind,
    };

    if (domain === "music") groups.music.push(k);
    if (domain === "movies") groups.movies.push(k);
    if (domain === "sponsors") groups.sponsors.push(k);
    if (kind === "top10") groups.top10.push(k);
    if (domain === "generic") groups.generic.push(k);
  }

  for (const [pk, ok] of Object.entries(pins || {})) {
    if (ok) groups.pinned.push(pk);
  }

  for (const g of Object.keys(groups)) groups[g].sort();

  const groupCounts = {};
  for (const [gk, arr] of Object.entries(groups)) groupCounts[gk] = Array.isArray(arr) ? arr.length : 0;

  return {
    ok: true,
    builtAt: new Date().toISOString(),
    pinned: pins,
    summary: {
      jsonKeyCount: jsonKeys.length,
      pinnedAny: Object.values(pins || {}).some(Boolean),
      groups: groupCounts,
    },
    groups,
    packs,
  };
}

function packIndexAvailable() {
  return !!(
    packIndexMod &&
    (typeof packIndexMod.getPackIndex === "function" || typeof packIndexMod.refreshPackIndex === "function")
  );
}

function getPackIndexSafe(forceRefresh) {
  try {
    if (packIndexMod) {
      if (forceRefresh && typeof packIndexMod.refreshPackIndex === "function") return packIndexMod.refreshPackIndex();
      if (typeof packIndexMod.getPackIndex === "function") return packIndexMod.getPackIndex({ forceRefresh: false });
    }
  } catch (e) {
    pushKnowledgeError("packIndex_exception", "Utils/packIndex.js", e?.message || e);
  }
  return buildBuiltinPackIndex();
}

// =========================
// Session store
// =========================
const SESSIONS = new Map();

function sessionKeyFromReq(req) {
  const b = isPlainObject(req.body) ? req.body : {};
  const h = req.headers || {};
  const sid =
    safeStr(b.sessionId || b.visitorId || b.deviceId).trim() ||
    safeStr(h["x-sb-session"] || h["x-session-id"] || h["x-visitor-id"]).trim();

  if (sid) return sid.slice(0, 120);

  const fp = sha1(`${pickClientIp(req)}|${safeStr(req.headers["user-agent"] || "")}`).slice(0, 24);
  return `fp_${fp}`;
}

function pruneSessions(now) {
  for (const [k, v] of SESSIONS.entries()) {
    if (!v || !v.lastSeenAt) {
      SESSIONS.delete(k);
      continue;
    }
    if (now - v.lastSeenAt > SESSION_TTL_MS) SESSIONS.delete(k);
  }
  if (SESSIONS.size > SESSION_MAX) {
    const arr = Array.from(SESSIONS.entries()).sort((a, b) => (a[1].lastSeenAt || 0) - (b[1].lastSeenAt || 0));
    const cut = SESSIONS.size - SESSION_MAX;
    for (let i = 0; i < cut; i++) SESSIONS.delete(arr[i][0]);
  }
}

function getSession(req) {
  const now = nowMs();
  pruneSessions(now);

  const key = sessionKeyFromReq(req);
  let rec = SESSIONS.get(key);
  if (!rec) {
    rec = {
      data: { sessionId: key, visitorId: key, lane: "general", cog: {} },
      lastSeenAt: now,
      burst: [],
      sustained: [],
      boot: [],
    };
    SESSIONS.set(key, rec);
  }
  rec.lastSeenAt = now;
  if (!Array.isArray(rec.boot)) rec.boot = [];
  return { key, rec };
}

// =========================
// Loop / guards
// =========================
function pushWindow(arr, now, windowMs) {
  const a = Array.isArray(arr) ? arr : [];
  a.push(now);
  const cutoff = now - windowMs;
  while (a.length && a[0] < cutoff) a.shift();
  return a;
}

function checkBurst(rec, now) {
  rec.burst = pushWindow(rec.burst, now, BURST_WINDOW_MS);
  if (rec.burst.length > BURST_MAX) return { blocked: true, reason: "burst" };
  return { blocked: false };
}

function checkSustained(rec, now) {
  rec.sustained = pushWindow(rec.sustained, now, SUSTAINED_WINDOW_MS);
  if (rec.sustained.length > SUSTAINED_MAX) return { blocked: true, reason: "sustained" };
  return { blocked: false };
}

function checkBootFuse(rec, now) {
  rec.boot = pushWindow(rec.boot, now, BOOT_MAX_WINDOW_MS);
  if (rec.boot.length > BOOT_MAX) return { blocked: true, reason: "boot_rate" };

  const lastBootAt = Number(rec.data.__idx_lastBootAt || 0);
  if (lastBootAt && now - lastBootAt < BOOT_DEDUPE_MS) return { blocked: true, reason: "boot_dedupe" };

  rec.data.__idx_lastBootAt = now;
  return { blocked: false };
}

function replayDedupe(rec, inboundSig, source, clientRequestId) {
  const now = nowMs();
  const rid = safeStr(clientRequestId).trim();

  const sigHash = sha1(`${safeStr(rec.data.sessionId)}|${safeStr(source)}|${safeStr(inboundSig)}`).slice(0, 12);
  const key = rid ? `rid:${rid}|sig:${sigHash}` : `sig:${sigHash}`;

  const lastKey = safeStr(rec.data.__idx_lastReqKey || "");
  const lastAt = Number(rec.data.__idx_lastReqAt || 0);
  if (lastKey && key === lastKey && lastAt && now - lastAt <= LOOP_REPLAY_WINDOW_MS) {
    const lastOut = safeStr(rec.data.__idx_lastOut || "");
    const lastLane = safeStr(rec.data.__idx_lastLane || "general") || "general";
    const lastFU = Array.isArray(rec.data.__idx_lastFollowUps) ? rec.data.__idx_lastFollowUps : undefined;
    const lastFUS = Array.isArray(rec.data.__idx_lastFollowUpsStrings)
      ? rec.data.__idx_lastFollowUpsStrings
      : undefined;
    const lastDir = Array.isArray(rec.data.__idx_lastDirectives) ? rec.data.__idx_lastDirectives : undefined;

    if (lastOut) {
      return {
        hit: true,
        reply: lastOut,
        lane: lastLane,
        followUps: lastFU,
        followUpsStrings: lastFU ? undefined : lastFUS,
        directives: lastDir,
      };
    }
  }

  rec.data.__idx_lastReqKey = key;
  rec.data.__idx_lastReqAt = now;
  return { hit: false };
}

function writeReplay(rec, reply, lane, extras) {
  rec.data.__idx_lastOut = safeStr(reply);
  rec.data.__idx_lastLane = safeStr(lane || "general") || "general";
  if (extras && typeof extras === "object") {
    const fu = Array.isArray(extras.followUps) ? extras.followUps.slice(0, 10) : undefined;
    const fus = Array.isArray(extras.followUpsStrings) ? extras.followUpsStrings.slice(0, 10) : undefined;

    if (fu) {
      rec.data.__idx_lastFollowUps = fu;
      rec.data.__idx_lastFollowUpsStrings = [];
    }
    if (!fu && fus) rec.data.__idx_lastFollowUpsStrings = fus;

    if (Array.isArray(extras.directives)) rec.data.__idx_lastDirectives = extras.directives.slice(0, 10);
  }
}

function writeBootReplay(rec, reply, lane, extras) {
  rec.data.__idx_lastBootOut = safeStr(reply);
  rec.data.__idx_lastBootLane = safeStr(lane || "general") || "general";
  if (extras && typeof extras === "object") {
    const fu = Array.isArray(extras.followUps) ? extras.followUps.slice(0, 10) : undefined;
    const fus = Array.isArray(extras.followUpsStrings) ? extras.followUpsStrings.slice(0, 10) : undefined;

    if (fu) {
      rec.data.__idx_lastBootFollowUps = fu;
      rec.data.__idx_lastBootFollowUpsStrings = [];
    }
    if (!fu && fus) rec.data.__idx_lastBootFollowUpsStrings = fus;

    if (Array.isArray(extras.directives)) rec.data.__idx_lastBootDirectives = extras.directives.slice(0, 10);
  }
}

function readBootReplay(rec) {
  const reply = safeStr(rec.data.__idx_lastBootOut || "");
  const lane = safeStr(rec.data.__idx_lastBootLane || rec.data.lane || "general") || "general";
  const followUps = Array.isArray(rec.data.__idx_lastBootFollowUps) ? rec.data.__idx_lastBootFollowUps : undefined;
  const followUpsStrings = Array.isArray(rec.data.__idx_lastBootFollowUpsStrings)
    ? rec.data.__idx_lastBootFollowUpsStrings
    : undefined;
  const directives = Array.isArray(rec.data.__idx_lastBootDirectives) ? rec.data.__idx_lastBootDirectives : undefined;

  return { reply, lane, followUps, followUpsStrings: followUps ? undefined : followUpsStrings, directives };
}

// =========================
// App
// =========================
const app = express();

if (toBool(TRUST_PROXY, false)) app.set("trust proxy", 1);

// ---- SAFE JSON PARSE: never crash on invalid JSON ----
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  express.json({ limit: MAX_JSON_BODY })(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        ok: false,
        error: "invalid_json",
        detail: safeStr(err.message || err).slice(0, 240),
        meta: { index: INDEX_VERSION },
      });
    }
    return next();
  });
});
app.use(express.text({ type: ["text/*"], limit: MAX_JSON_BODY }));

// =========================
// CORS hard-lock
// =========================
app.use((req, res, next) => {
  const originRaw = safeStr(req.headers.origin || "");
  const origin = normalizeOrigin(originRaw);
  const allow = origin ? isAllowedOrigin(origin) : false;

  if (origin) res.setHeader("Vary", "Origin");

  if (origin && allow) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-SB-Session",
        "X-Session-Id",
        "X-Visitor-Id",
        "X-Request-Id",
        "X-Route-Hint",
        "X-Client-Source",
        "x-client-source",
        "X-SBNYX-Client-Build",
        "x-sbnyx-client-build",
        "X-SBNYX-Widget-Version",
        "x-sbnyx-widget-version",
        "X-Contract-Version",
        "x-contract-version",
      ].join(", ")
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") return res.status(204).send("");
  return next();
});

// =========================
// Health + discovery
// =========================
app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "sandblast-backend",
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    env: NODE_ENV,
    knowledge: knowledgeStatusForMeta(),
    packs: { ok: true, using: packIndexAvailable() ? "external" : "builtin" },
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    up: true,
    now: new Date().toISOString(),
    knowledge: knowledgeStatusForMeta(),
    packs: { ok: true, using: packIndexAvailable() ? "external" : "builtin" },
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    up: true,
    now: new Date().toISOString(),
    knowledge: knowledgeStatusForMeta(),
    packs: { ok: true, using: packIndexAvailable() ? "external" : "builtin" },
  });
});

app.get("/api/discovery", (req, res) => {
  res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    endpoints: [
      "/api/sandblast-gpt",
      "/api/nyx/chat",
      "/api/chat",
      "/api/tts",
      "/api/voice",
      "/health",
      "/api/health",
      "/api/knowledge",
      "/api/packsight",
      "/api/debug/knowledge",
      "/api/debug/packsight",
      "/api/packs",
      "/api/packs/refresh",
    ],
    knowledge: knowledgeStatusForMeta(),
    packs: { ok: true, using: packIndexAvailable() ? "external" : "builtin" },
  });
});

// =========================
// Pack Index endpoints (ALWAYS available)
// =========================
app.get("/api/packs", (req, res) => {
  const idx = getPackIndexSafe(false);
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    packs: idx,
  });
});

function doPacksRefresh(req, res) {
  const doReloadKnowledge = toBool(req.query.reloadKnowledge, false);
  if (doReloadKnowledge) {
    try {
      reloadKnowledge();
    } catch (e) {
      pushKnowledgeError("packs_reloadKnowledge", "reloadKnowledge()", e?.message || e);
    }
  }
  const idx = getPackIndexSafe(true);
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    packs: idx,
  });
}

app.post("/api/packs/refresh", doPacksRefresh);
app.get("/api/packs/refresh", doPacksRefresh);

// =========================
// PUBLIC Packsight (SAFE): always available in production
// =========================
app.get("/api/packsight", (req, res) => {
  const pins = pinnedPresence();
  const idx = getPackIndexSafe(false);

  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    data: {
      appRoot: APP_ROOT,
      dataDir: DATA_DIR,
      dataRoots: DATA_ROOT_CANDIDATES,
      scriptsDir: SCRIPTS_DIR,
      scriptsEnabled: KNOWLEDGE_ENABLE_SCRIPTS,
      allowDataOutsideAppRoot: KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT,
      allowScriptsOutsideAppRoot: KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT,
      budgets: {
        maxFiles: KNOWLEDGE_MAX_FILES,
        maxFileBytes: KNOWLEDGE_MAX_FILE_BYTES,
        maxTotalBytes: KNOWLEDGE_MAX_TOTAL_BYTES,
      },
      pinnedPresence: pins,
      pinnedResolved: KNOWLEDGE.__packsight?.pinnedResolved || [],
      manifestPreview: (KNOWLEDGE.__manifest || []).slice(0, 20),
      manifestResolved: KNOWLEDGE.__packsight?.manifestResolved || [],
      probes: KNOWLEDGE.__packsight?.probes || [],
      errorCount: KNOWLEDGE.errors.length,
      errorsPreview: KNOWLEDGE.errors.slice(0, 12),
    },
    packsSummary: idx.summary,
    pinnedKeys: idx.groups?.pinned || [],
  });
});

// Optional: small knowledge status alias
app.get("/api/knowledge", (req, res) => {
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    engine: ENGINE_VERSION || null,
    engineFrom: ENGINE.from,
    knowledge: knowledgeStatusForMeta(),
    packs: getPackIndexSafe(false).summary,
  });
});

// =========================
// Debug knowledge endpoints
// =========================
if (KNOWLEDGE_DEBUG_ENDPOINT) {
  app.get("/api/debug/knowledge", (req, res) => {
    const allowInProd = toBool(process.env.KNOWLEDGE_DEBUG_ALLOW_PROD, false);
    if (NODE_ENV === "production" && !allowInProd) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const jsonKeys = Object.keys(KNOWLEDGE.json);
    const scriptKeys = Object.keys(KNOWLEDGE.scripts);

    return res.status(200).json({
      ok: true,
      version: INDEX_VERSION,
      engine: ENGINE_VERSION || null,
      knowledge: {
        ok: KNOWLEDGE.ok,
        loadedAt: KNOWLEDGE.loadedAt,
        appRoot: APP_ROOT,
        dataDir: DATA_DIR,
        dataRoots: DATA_ROOT_CANDIDATES,
        scriptsDir: SCRIPTS_DIR,
        scriptsEnabled: KNOWLEDGE_ENABLE_SCRIPTS,
        allowDataOutsideAppRoot: KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT,
        allowScriptsOutsideAppRoot: KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT,
        jsonKeyCount: jsonKeys.length,
        scriptKeyCount: scriptKeys.length,
        filesScanned: KNOWLEDGE.filesScanned,
        filesLoaded: KNOWLEDGE.filesLoaded,
        totalBytes: KNOWLEDGE.totalBytes,
        budgets: {
          maxFiles: KNOWLEDGE_MAX_FILES,
          maxFileBytes: KNOWLEDGE_MAX_FILE_BYTES,
          maxTotalBytes: KNOWLEDGE_MAX_TOTAL_BYTES,
        },
        pinned: pinnedPresence(),
        pinnedConfig: PINNED_PACKS.map((p) => ({ key: p.key, rels: p.rels })),
        manifest: Array.isArray(KNOWLEDGE.__manifest) ? KNOWLEDGE.__manifest : [],
        manifestConfig: PACK_MANIFEST.map((m) => ({
          key: m.key,
          type: m.type,
          rel: m.rel || null,
          abs: m.abs || null,
          outKey: m.outKey || null,
        })),
        packsight: KNOWLEDGE.__packsight,
        errorCount: KNOWLEDGE.errors.length,
        errorsPreview: KNOWLEDGE.errors.slice(0, 12),
        jsonKeysPreview: jsonKeys.slice(0, 160),
        scriptKeysPreview: scriptKeys.slice(0, 80),
        includeData: KNOWLEDGE_DEBUG_INCLUDE_DATA,
        json: KNOWLEDGE_DEBUG_INCLUDE_DATA ? KNOWLEDGE.json : undefined,
        scripts: KNOWLEDGE_DEBUG_INCLUDE_DATA ? KNOWLEDGE.scripts : undefined,
      },
      packs: { ok: true, using: packIndexAvailable() ? "external" : "builtin", preview: getPackIndexSafe(false).summary },
    });
  });

  // compact “Nyx can see packs?” endpoint (safe + small) — gated in prod
  app.get("/api/debug/packsight", (req, res) => {
    const allowInProd = toBool(process.env.KNOWLEDGE_DEBUG_ALLOW_PROD, false);
    if (NODE_ENV === "production" && !allowInProd) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const pins = pinnedPresence();
    const idx = getPackIndexSafe(false);

    return res.status(200).json({
      ok: true,
      version: INDEX_VERSION,
      engine: ENGINE_VERSION || null,
      data: {
        dataDir: DATA_DIR,
        dataRoots: DATA_ROOT_CANDIDATES,
        allowDataOutsideAppRoot: KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT,
        pinnedPresence: pins,
        pinnedResolved: KNOWLEDGE.__packsight?.pinnedResolved || [],
        manifestPreview: (KNOWLEDGE.__manifest || []).slice(0, 20),
        manifestResolved: KNOWLEDGE.__packsight?.manifestResolved || [],
        probes: KNOWLEDGE.__packsight?.probes || [],
      },
      packsSummary: idx.summary,
      pinnedKeys: idx.groups?.pinned || [],
    });
  });

  app.post("/api/debug/knowledge/reload", (req, res) => {
    const allowInProd = toBool(process.env.KNOWLEDGE_DEBUG_ALLOW_PROD, false);
    if (NODE_ENV === "production" && !allowInProd) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const summary = reloadKnowledge();
    return res.status(200).json({
      ok: true,
      summary,
      knowledge: knowledgeStatusForMeta(),
      packs: { ok: true, using: packIndexAvailable() ? "external" : "builtin", preview: getPackIndexSafe(false).summary },
    });
  });
}

// =========================
// CRITICAL: CHIP PAYLOAD NORMALIZER (prevents misroutes)
// =========================
function normalizeChipPayload(b) {
  if (!b || typeof b !== "object") return b;

  const rootHas = b.lane || b.action || b.year || b.mode || b.intent || b.route || b.label;

  if (!isPlainObject(b.payload)) b.payload = {};

  // root -> payload (if root has signals, ensure payload receives them)
  if (rootHas) {
    if (b.lane && !b.payload.lane) b.payload.lane = b.lane;
    if (b.action && !b.payload.action) b.payload.action = b.action;
    if (b.year && !b.payload.year) b.payload.year = b.year;
    if (b.mode && !b.payload.mode) b.payload.mode = b.mode;
    if (b.intent && !b.payload.intent) b.payload.intent = b.intent;
    if (b.route && !b.payload.route) b.payload.route = b.route;
    if (b.label && !b.payload.label) b.payload.label = b.label;
  }

  // payload -> root (CRITICAL: round-trip ALL chip signals, not just lane/action/year/mode)
  if (isPlainObject(b.payload)) {
    if (b.payload.lane && !b.lane) b.lane = b.payload.lane;
    if (b.payload.action && !b.action) b.action = b.payload.action;
    if (b.payload.year && !b.year) b.year = b.payload.year;
    if (b.payload.mode && !b.mode) b.mode = b.payload.mode;

    if (b.payload.intent && !b.intent) b.intent = b.payload.intent;
    if (b.payload.route && !b.route) b.route = b.payload.route;
    if (b.payload.label && !b.label) b.label = b.payload.label;
  }

  return b;
}

// =========================
// Chat route
// =========================
async function handleChatRoute(req, res) {
  const startedAt = nowMs();
  const body = isPlainObject(req.body) ? req.body : safeJsonParseMaybe(req.body) || {};

  normalizeChipPayload(body);

  const clientRequestId = safeStr(body.requestId || body.clientRequestId || req.headers["x-request-id"] || "").trim();
  const serverRequestId = clientRequestId || makeReqId();

  const source = safeStr(body?.client?.source || body?.source || req.headers["x-client-source"] || "").trim() || "unknown";

  const routeHint =
    safeStr(body?.client?.routeHint || body?.routeHint || body?.lane || req.headers["x-route-hint"] || "").trim() ||
    "general";

  const inboundText = safeStr(body.text || body.message || body.prompt || body.query || body?.payload?.text || "").trim();

  const inboundSig = normalizeInboundSignature(body, inboundText);
  const meaningful = !!inboundSig || hasIntentSignals(body);

  const { rec } = getSession(req);
  const bootLike = isBootLike(routeHint, body);

  const isReset = isResetCommand(inboundText, source, body);

  if (bootLike && !isReset) {
    const bf = checkBootFuse(rec, startedAt);
    if (bf.blocked) {
      const cached = readBootReplay(rec);
      const reply = cached.reply || "";
      return res.status(200).json({
        ok: true,
        reply,
        lane: cached.lane || rec.data.lane || "general",
        directives: cached.directives,
        followUps: cached.followUps,
        followUpsStrings: cached.followUpsStrings,
        sessionPatch: {},
        requestId: serverRequestId,
        meta: {
          index: INDEX_VERSION,
          engine: ENGINE_VERSION || null,
          knowledge: knowledgeStatusForMeta(),
          bootLike: true,
          bootFuse: bf.reason,
          source,
          routeHint,
          elapsedMs: nowMs() - startedAt,
        },
      });
    }
  }

  if (!bootLike && meaningful && !isReset) {
    const burst = checkBurst(rec, startedAt);
    const sus = checkSustained(rec, startedAt);
    if (burst.blocked || sus.blocked) {
      const reply =
        burst.reason === "burst"
          ? "One sec — you’re firing a little fast. Try again in a moment."
          : "Give me a breath — then hit me again with a year or a request.";
      writeReplay(rec, reply, rec.data.lane || "general");

      return res.status(200).json({
        ok: true,
        reply,
        lane: rec.data.lane || "general",
        sessionPatch: {},
        requestId: serverRequestId,
        meta: {
          index: INDEX_VERSION,
          engine: ENGINE_VERSION || null,
          knowledge: knowledgeStatusForMeta(),
          throttled: burst.blocked ? "burst" : "sustained",
          elapsedMs: nowMs() - startedAt,
        },
      });
    }
  }

  if (!bootLike && meaningful && !isReset) {
    const dedupe = replayDedupe(rec, inboundSig, source, clientRequestId);
    if (dedupe.hit) {
      return res.status(200).json({
        ok: true,
        reply: dedupe.reply,
        lane: dedupe.lane,
        directives: dedupe.directives,
        followUps: dedupe.followUps,
        followUpsStrings: dedupe.followUpsStrings,
        sessionPatch: {},
        requestId: serverRequestId,
        meta: {
          index: INDEX_VERSION,
          engine: ENGINE_VERSION || null,
          knowledge: knowledgeStatusForMeta(),
          replay: true,
          elapsedMs: nowMs() - startedAt,
        },
      });
    }
  }

  if (!ENGINE.fn) {
    const reply = "Backend engine not loaded. Check deploy: Utils/chatEngine.js is missing or exports are wrong.";
    writeReplay(rec, reply, "general");
    return res.status(500).json({
      ok: false,
      reply,
      lane: "general",
      requestId: serverRequestId,
      meta: {
        index: INDEX_VERSION,
        engine: "missing_or_invalid",
        engineFrom: ENGINE.from,
        engineVersion: ENGINE_VERSION || null,
        knowledge: knowledgeStatusForMeta(),
      },
    });
  }

  if (KNOWLEDGE_AUTOLOAD && !KNOWLEDGE.ok) {
    const tried = toBool(global.__SBNYX_KNOWLEDGE_LAZY_TRIED, false);
    if (!tried) {
      global.__SBNYX_KNOWLEDGE_LAZY_TRIED = true;
      try {
        reloadKnowledge();
      } catch (e) {
        pushKnowledgeError("lazy_reload", "reloadKnowledge()", e?.message || e);
      }
    }
  }

  const engineInput = {
    ...body,
    requestId: serverRequestId,
    clientRequestId: clientRequestId || undefined,
    text: inboundText,
    source,
    routeHint,
    client: {
      ...(isPlainObject(body.client) ? body.client : {}),
      source,
      routeHint,
    },
    session: rec.data,
    knowledge: knowledgeSnapshotForEngine(),
    __knowledgeStatus: knowledgeStatusForMeta(),
    packIndex: getPackIndexSafe(false),
  };

  let out;
  try {
    out = await ENGINE.fn(engineInput);
    out = normalizeEngineOutput(out);
  } catch (e) {
    const msg = safeStr(e?.message || e).trim();
    const k = knowledgeStatusForMeta();
    const reply = k.ok
      ? "I hit a snag, but I’m still here. Give me a year (1950–2024) and I’ll jump right in."
      : "I’m online, but my knowledge packs didn’t load yet. Try again in a moment — or hit refresh — and I’ll reconnect.";
    writeReplay(rec, reply, rec.data.lane || "general");
    return res.status(500).json({
      ok: true,
      reply,
      lane: rec.data.lane || "general",
      requestId: serverRequestId,
      meta: {
        index: INDEX_VERSION,
        engine: ENGINE_VERSION || null,
        knowledge: k,
        error: safeStr(msg).slice(0, 200),
      },
    });
  }

  if (out && isPlainObject(out.sessionPatch)) {
    applySessionPatch(rec.data, out.sessionPatch);
  }

  const lane = safeStr(out?.lane || rec.data.lane || "general") || "general";
  rec.data.lane = lane;

  const rawReply = safeStr(out?.reply || "").trim();
  const reply = isReset ? silentResetReply() : rawReply || "Okay — tell me what you want next.";

  const directives = Array.isArray(out?.directives) ? out.directives : undefined;
  const followUps = Array.isArray(out?.followUps) ? out.followUps : undefined;
  const followUpsStrings =
    !followUps && Array.isArray(out?.followUpsStrings) && out?.followUpsStrings.length
      ? out.followUpsStrings
      : undefined;

  if (!isReset && !bootLike) {
    writeReplay(rec, reply, lane, { directives, followUps, followUpsStrings });
  } else if (isReset) {
    rec.data.__idx_lastOut = "";
    rec.data.__idx_lastLane = lane;
  }

  if (bootLike && !isReset) {
    writeBootReplay(rec, reply, lane, { directives, followUps, followUpsStrings });
  }

  return res.status(200).json({
    ok: true,
    reply,
    lane,
    ctx: out?.ctx,
    ui: out?.ui,
    directives,
    followUps,
    followUpsStrings,
    sessionPatch: out?.sessionPatch || {},
    cog: out?.cog,
    requestId: out?.requestId || serverRequestId,
    meta: {
      ...(isPlainObject(out?.meta) ? out.meta : {}),
      index: INDEX_VERSION,
      engine: ENGINE_VERSION || null,
      engineFrom: ENGINE.from,
      knowledge: knowledgeStatusForMeta(),
      elapsedMs: nowMs() - startedAt,
      source,
      routeHint,
      bootLike: !!bootLike,
      inboundSig: inboundSig ? String(inboundSig).slice(0, 160) : null,
      meaningful: !!meaningful,
      resetSilenced: !!isReset,
      echoSuppressed: !!followUps && Array.isArray(out?.followUpsStrings) && out?.followUpsStrings.length ? true : false,
      packs: getPackIndexSafe(false).summary,
    },
  });
}

function applySessionPatch(session, patch) {
  if (!isPlainObject(session) || !isPlainObject(patch)) return;

  const PATCH_KEYS = new Set([
    "introDone",
    "introAt",
    "introVariantId",
    "introBucket",
    "lastInText",
    "lastInAt",
    "lastOut",
    "lastOutAt",
    "turns",
    "startedAt",
    "lastTurnAt",
    "lane",
    "lastLane",
    "lastYear",
    "lastMode",
    "activeMusicMode",
    "lastMusicYear",
    "pendingYear",
    "pendingMode",
    "pendingLane",
    "turnCount",
    "__hasRealUserTurn",
    "__introDone",
    "__cs1",
    "cog",
    "allowPackets",
    "__nyxIntro",
    "__nyxVelvet",
  ]);

  for (const [k, v] of Object.entries(patch)) {
    if (!PATCH_KEYS.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;

    if (k === "cog") {
      if (!isPlainObject(session.cog)) session.cog = {};
      if (isPlainObject(v)) {
        for (const [ck, cv] of Object.entries(v)) {
          if (ck === "__proto__" || ck === "constructor" || ck === "prototype") continue;
          session.cog[ck] = cv;
        }
      }
      continue;
    }

    if (k === "__nyxIntro") {
      if (!isPlainObject(session.__nyxIntro)) session.__nyxIntro = {};
      if (isPlainObject(v)) {
        for (const [ik, iv] of Object.entries(v)) {
          if (ik === "__proto__" || ik === "constructor" || ik === "prototype") continue;
          session.__nyxIntro[ik] = iv;
        }
      }
      continue;
    }

    session[k] = v;
  }
}

// Endpoints
app.post("/api/sandblast-gpt", handleChatRoute);
app.post("/api/nyx/chat", handleChatRoute);
app.post("/api/chat", handleChatRoute);

// =========================
// TTS (REAL ElevenLabs)
// =========================
async function handleTtsRoute(req, res) {
  const startedAt = nowMs();

  let body = isPlainObject(req.body) ? req.body : safeJsonParseMaybe(req.body) || {};
  if (typeof req.body === "string") body = { text: req.body };

  const rawText = safeStr(body.text || body.message || body.prompt || "").trim();
  const noText = toBool(body.NO_TEXT || body.noText, false);

  // Optional bypass (some callers might want *exact* text)
  const disableNaturalize = toBool(body.disableNaturalize, false);

  const text = disableNaturalize ? rawText : nyxVoiceNaturalize(rawText);

  if (!ELEVEN_API_KEY || !ELEVEN_VOICE_ID || !fetchFn) {
    return res.status(501).json({
      ok: false,
      error: "TTS not configured (missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID or fetch).",
      meta: { index: INDEX_VERSION },
    });
  }

  if (!text && !noText) {
    return res.status(400).json({ ok: false, error: "Missing text for TTS.", meta: { index: INDEX_VERSION } });
  }

  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => {
    try {
      if (ac) ac.abort();
    } catch (_) {}
  }, ELEVEN_TTS_TIMEOUT_MS);

  try {
    const payload = {
      text: text || " ",
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: NYX_VOICE_STABILITY,
        similarity_boost: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
      },
    };

    const r = await fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
      signal: ac ? ac.signal : undefined,
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "TTS upstream error",
        detail: safeStr(errTxt).slice(0, 800),
        meta: { index: INDEX_VERSION, status: r.status },
      });
    }

    const buf = Buffer.from(await r.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(buf.length));
    return res.status(200).send(buf);
  } catch (e) {
    const msg = safeStr(e?.message || e).trim();
    const aborted = /aborted|abort|timeout/i.test(msg);
    return res.status(aborted ? 504 : 500).json({
      ok: false,
      error: aborted ? "TTS timeout" : "TTS failure",
      detail: safeStr(msg).slice(0, 250),
      meta: { index: INDEX_VERSION, elapsedMs: nowMs() - startedAt },
    });
  } finally {
    clearTimeout(t);
  }
}

// POST is the real contract
app.post("/api/tts", handleTtsRoute);
app.post("/api/voice", handleTtsRoute);

// GET aliases: return guidance (avoids silent 404 / confusion)
function ttsGetGuidance(req, res) {
  return res.status(405).json({
    ok: false,
    error: "method_not_allowed",
    detail: 'Use POST with JSON body: { text: "..." }',
    meta: { index: INDEX_VERSION },
  });
}
app.get("/api/tts", ttsGetGuidance);
app.get("/api/voice", ttsGetGuidance);

// =========================
// Express error middleware (last)
// =========================
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.log("[Sandblast][ExpressError]", err && (err.stack || err.message || err));
  if (res.headersSent) return next(err);
  return res.status(500).json({
    ok: false,
    error: "server_error",
    detail: safeStr(err?.message || err).slice(0, 240),
    meta: { index: INDEX_VERSION },
  });
});

// =========================
// Start
// =========================
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] ${INDEX_VERSION} listening on ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] Engine: from=${ENGINE.from} version=${ENGINE_VERSION || "(unknown)"} loaded=${!!ENGINE.fn}`);
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] Fetch: ${fetchFn ? "OK" : "MISSING"} (global.fetch=${!!global.fetch})`);
  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast] Knowledge: autoload=${KNOWLEDGE_AUTOLOAD} ok=${KNOWLEDGE.ok} jsonKeys=${
      Object.keys(KNOWLEDGE.json).length
    } scriptKeys=${Object.keys(KNOWLEDGE.scripts).length} errors=${KNOWLEDGE.errors.length} APP_ROOT=${APP_ROOT} DATA_DIR=${DATA_DIR} dataRoots=${JSON.stringify(
      DATA_ROOT_CANDIDATES.slice(0, 4)
    )} allowDataOutside=${KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT} SCRIPTS_DIR=${SCRIPTS_DIR} scriptsEnabled=${KNOWLEDGE_ENABLE_SCRIPTS} allowScriptsOutside=${KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT} reloadEveryMs=${KNOWLEDGE_RELOAD_INTERVAL_MS} debugIncludeData=${KNOWLEDGE_DEBUG_INCLUDE_DATA}`
  );
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] Knowledge pinned=${JSON.stringify(pinnedPresence())}`);
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] Knowledge manifest=${JSON.stringify((KNOWLEDGE.__manifest || []).slice(0, 12))}`);
  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast] Packs: using=${packIndexAvailable() ? "external" : "builtin"} summary=${JSON.stringify(
      getPackIndexSafe(false).summary
    )}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast] NyxVoice: naturalize=${NYX_VOICE_NATURALIZE} (external=${!!nyxVoiceNaturalizeMod}) maxLen=${NYX_VOICE_NATURALIZE_MAXLEN}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast] Packsight probes=${JSON.stringify(
      (KNOWLEDGE.__packsight?.probes || []).map((p) => ({ id: p.id, rel: p.rel, any: p.any, best: p.best }))
    )}`
  );
});

module.exports = { app, INDEX_VERSION };
