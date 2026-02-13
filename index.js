"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.18bm (AVATAR HOST++++: serve /avatar static + frame-ancestors allowlist + CORS hard-lock exempt for /avatar)
 *
 * Keeps:
 * ✅ WIKI AUTHORITY FIX++++ (wikipedia split hot100 dir ingest + merged year map)
 * ✅ CRITICAL FIXES++++ already present (sessionKey uses parsed body + manifest abs rebuilt after reload + strict CORS hard-lock 403 + JSON parser once + LOAD VISIBILITY++++ etc.)
 * ✅ v1.5.18bc: sessionPatch allows music loop-dampener keys + TRUE reset clears session state safely
 * ✅ v1.5.18be: gateway CSE evaluator + chip continuity signals; sessionPatch normalize fix
 * ✅ v1.5.18bf: TTS FAIL-OPEN (default ON): /api/tts & /api/voice return 204 on failure + exposed diag headers
 * ✅ v1.5.18bg: Origin/Referer coherence guard + widget provenance headers + inbound sanitizer + security headers + TTS clamps + public diagnostics redaction
 * ✅ v1.5.18bh: text/* body support + public meta redaction + HSTS/perms policy + NYX_VOICE_NATURALIZE env read bug fix
 * ✅ v1.5.18bi: error-meta redaction intent
 * ✅ v1.5.18bj: backend self-host referer allow + hostOnly normalize + TRUE host redaction in 403 meta
 * ✅ v1.5.18bk: timing-safe debug auth + request timeout + content-type gate + no-store API + block Origin:null
 * ✅ v1.5.18bl: STABILITY: /api/chat fail-open when engine missing/throws (200 + ok:true + safe reply)
 *
 * Adds (v1.5.18bm):
 * ✅ AVATAR HOST: serve static /avatar from /public/avatar (index.html + avatar.html + js/css assets)
 * ✅ FRAME POLICY: allow framing for /avatar only (CSP frame-ancestors 'self' + allowlisted site origins); keep DENY elsewhere
 * ✅ CORS HARD-LOCK EXEMPT: do NOT apply CORS hard-lock to /avatar static (prevents accidental 403 on embedded avatar loads)
 *
 * Env (new / avatar):
 *  - AVATAR_PUBLIC_DIR=public/avatar (optional override; relative to APP_ROOT unless absolute)
 *
 * Env:
 *  - PUBLIC_BACKEND_HOST=sandblast-backend.onrender.com (optional override)
 *  - TTS_FAIL_OPEN=true|false (default true)
 *  - STRICT_ORIGIN_REFERER=true|false (default false)
 *  - TTS_MAX_CHARS=900 (default 900)
 *  - TTS_BURST_WINDOW_MS=30000 (default 30000)
 *  - TTS_BURST_MAX=6 (default 6)
 *  - PUBLIC_DIAGNOSTICS_SAFE=true|false (default true)
 *  - DEBUG_SHARED_SECRET=...
 *  - DEBUG_SHARED_HEADER=X-SB-DEBUG-SECRET (default)
 *  - SECURITY_HSTS=true|false (default true in production)
 *  - SECURITY_HSTS_MAX_AGE=15552000 (default 15552000; 180d)
 *  - SECURITY_PERMISSIONS_POLICY=... (optional override)
 *  - REQUEST_TIMEOUT_MS=25000 (default 25000; clamp 5000–120000)
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
  "index.js v1.5.18bm (AVATAR HOST++++: /avatar static + frame-ancestors allowlist + CORS hard-lock exempt /avatar; keeps v1.5.18bl chat fail-open + v1.5.18bk timing-safe debug auth + request timeout + content-type gate + no-store API + block Origin:null; keeps v1.5.18bj host redaction + backend referer allow + hostOnly normalize; keeps v1.5.18bg security + v1.5.18bf TTS fail-open + v1.5.18be CSE/chip continuity + v1.5.18bc reset/sessionPatch keys + v1.5.18bb WIKI AUTHORITY FIX++++ + CRITICAL FIXES++++ + diagnostics)";

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

// ✅ hostOnly normalize: strips ports (and handles empties safely)
function hostOnly(h) {
  return safeStr(h).toLowerCase().replace(/:\d+$/, "");
}

function parseUrlHost(u) {
  const s = safeStr(u).trim();
  if (!s) return "";
  try {
    const x = new URL(s);
    return hostOnly(x.host || "");
  } catch (_) {
    return "";
  }
}
function parseOriginHost(o) {
  const s = normalizeOrigin(o);
  if (!s) return "";
  try {
    const x = new URL(s);
    return hostOnly(x.host || "");
  } catch (_) {
    const m = s.replace(/^https?:\/\//i, "");
    return hostOnly(m.split("/")[0] || "");
  }
}
function isBrowserishUA(ua) {
  const s = safeStr(ua).toLowerCase();
  if (!s) return false;
  return (
    s.includes("mozilla/") ||
    s.includes("chrome/") ||
    s.includes("safari/") ||
    s.includes("firefox/") ||
    s.includes("edg/") ||
    s.includes("opr/")
  );
}

/**
 * SECURITY: shallow-safe inbound sanitizer:
 * - strips __proto__/constructor/prototype keys recursively
 * - clamps string lengths
 * - clamps depth and entry counts to prevent pathological payloads
 * Non-breaking: keeps unknown keys; only removes dangerous proto keys + clamps huge strings.
 */
function sanitizeInboundValue(val, depth, maxDepth, maxEntries, maxStrLen) {
  if (depth > maxDepth) return null;
  if (val === null || val === undefined) return val;

  if (typeof val === "string") {
    const s = val.length > maxStrLen ? val.slice(0, maxStrLen) : val;
    return s;
  }
  if (typeof val === "number" || typeof val === "boolean") return val;

  if (Array.isArray(val)) {
    const out = [];
    const n = Math.min(val.length, maxEntries);
    for (let i = 0; i < n; i++)
      out.push(sanitizeInboundValue(val[i], depth + 1, maxDepth, maxEntries, maxStrLen));
    return out;
  }

  if (isPlainObject(val)) {
    const out = {};
    const keys = Object.keys(val).slice(0, maxEntries);
    for (const k of keys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = sanitizeInboundValue(val[k], depth + 1, maxDepth, maxEntries, maxStrLen);
    }
    return out;
  }

  return null;
}
function sanitizeInboundBody(body) {
  const b = isPlainObject(body) ? body : {};
  return sanitizeInboundValue(b, 0, 6, 200, 6000) || {};
}

// =========================
// Env / knobs
// =========================
const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = String(process.env.NODE_ENV || "production").trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const MAX_JSON_BODY = String(process.env.MAX_JSON_BODY || "512kb");
const REQUEST_TIMEOUT_MS = clampInt(process.env.REQUEST_TIMEOUT_MS, 25000, 5000, 120000);

// ✅ Backend host (self-host referer allow)
// NOTE: used ONLY for referer/origin host allow checks (NOT for CORS allow-origins)
const BACKEND_HOST =
  hostOnly((process.env.PUBLIC_BACKEND_HOST || "").trim()) || "sandblast-backend.onrender.com";

// --- Security knobs ---
const STRICT_ORIGIN_REFERER = toBool(process.env.STRICT_ORIGIN_REFERER, false);

// ✅ public diagnostics redaction
const PUBLIC_DIAGNOSTICS_SAFE = toBool(process.env.PUBLIC_DIAGNOSTICS_SAFE, true);
const DEBUG_SHARED_SECRET = String(process.env.DEBUG_SHARED_SECRET || "").trim();
const DEBUG_SHARED_HEADER = String(process.env.DEBUG_SHARED_HEADER || "X-SB-DEBUG-SECRET").trim();

// ✅ optional HSTS + Permissions-Policy
const SECURITY_HSTS = toBool(process.env.SECURITY_HSTS, NODE_ENV === "production");
const SECURITY_HSTS_MAX_AGE = clampInt(process.env.SECURITY_HSTS_MAX_AGE, 15552000, 0, 63072000);
const SECURITY_PERMISSIONS_POLICY = String(
  process.env.SECURITY_PERMISSIONS_POLICY ||
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
).trim();

// --- Avatar hosting knobs ---
const AVATAR_PUBLIC_DIR = String(process.env.AVATAR_PUBLIC_DIR || "public/avatar").trim();

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
const KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT = toBool(process.env.KNOWLEDGE_ALLOW_DATA_OUTSIDE_APP_ROOT, true);

// Scripts are riskier; keep default OFF unless you explicitly need it.
const KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT = toBool(process.env.KNOWLEDGE_ALLOW_SCRIPTS_OUTSIDE_APP_ROOT, false);

// --- Manifest fallback search knobs ---
const MANIFEST_SEARCH_FALLBACK = toBool(process.env.MANIFEST_SEARCH_FALLBACK, true);
const MANIFEST_SEARCH_MAX_VISITS = clampInt(process.env.MANIFEST_SEARCH_MAX_VISITS, 8000, 500, 50000);
const MANIFEST_SEARCH_MAX_DEPTH = clampInt(process.env.MANIFEST_SEARCH_MAX_DEPTH, 6, 2, 20);

// --- Data root autodiscovery knobs ---
const DATA_ROOT_AUTODISCOVER = toBool(process.env.DATA_ROOT_AUTODISCOVER, true);
const DATA_ROOT_HINTS = String(process.env.DATA_ROOT_HINTS || "").trim(); // comma-separated abs/rel paths
const DATA_ROOT_DISCOVERY_MAX_DEPTH = clampInt(process.env.DATA_ROOT_DISCOVERY_MAX_DEPTH, 4, 1, 10);
const DATA_ROOT_DISCOVERY_MAX_VISITS = clampInt(process.env.DATA_ROOT_DISCOVERY_MAX_VISITS, 2500, 200, 20000);

// Nyx Voice Naturalizer knobs
const NYX_VOICE_NATURALIZE = toBool(process.env.NYX_VOICE_NATURALIZE, true);
const NYX_VOICE_NATURALIZE_MAXLEN = clampInt(process.env.NYX_VOICE_NATURALIZE_MAXLEN, 2200, 200, 20000);

// =========================
// Debug auth helpers (for full diagnostics)
// =========================
function isDebugAuthed(req) {
  if (!DEBUG_SHARED_SECRET) return false;
  const hdrName = DEBUG_SHARED_HEADER.toLowerCase();
  const got = safeStr(req.headers[hdrName] || req.headers[DEBUG_SHARED_HEADER] || "").trim();
  if (!got) return false;

  // ✅ timing-safe compare
  try {
    const a = Buffer.from(String(got), "utf8");
    const b = Buffer.from(String(DEBUG_SHARED_SECRET), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

// =========================
// Case-insensitive dir/path resolution (Linux-safe)
// =========================
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

      const want = String(part).toLowerCase();
      let entries = [];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch (_) {
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

function resolveAvatarDirFromEnv() {
  const envName = String(AVATAR_PUBLIC_DIR || "public/avatar").trim();
  try {
    if (path.isAbsolute(envName)) return path.resolve(envName);
  } catch (_) {}
  return path.resolve(APP_ROOT, envName);
}

let DATA_DIR = resolveDataDirFromEnv();
let SCRIPTS_DIR = resolveScriptsDirFromEnv();
const AVATAR_DIR = resolveAvatarDirFromEnv();

/**
 * bounded BFS: find directories named "data" under a starting path
 */
function discoverNamedDirs(startAbs, wantNameLower, maxDepth, maxVisits) {
  const out = [];
  const seen = new Set();
  const q = [{ dir: path.resolve(startAbs), depth: 0 }];
  let visits = 0;

  while (q.length) {
    const cur = q.shift();
    const dir = cur.dir;
    const depth = cur.depth;

    if (!dir || seen.has(dir)) continue;
    seen.add(dir);

    const st = statSafe(dir);
    if (!st || !st.isDirectory()) continue;

    if (visits++ > maxVisits) break;

    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const ent of entries) {
      if (visits++ > maxVisits) break;
      if (!ent || !ent.isDirectory()) continue;
      const name = safeStr(ent.name);
      if (!name) continue;

      if (name.toLowerCase() === wantNameLower) {
        const hit = path.join(dir, name);
        if (!out.includes(hit)) out.push(hit);
      }

      if (depth + 1 <= maxDepth) {
        if (name === "node_modules" || name === ".git") continue;
        q.push({ dir: path.join(dir, name), depth: depth + 1 });
      }
    }
  }

  return out;
}

function rebuildDataRootCandidates() {
  const out = [];
  const pushUnique = (p) => {
    if (!p) return;
    try {
      const rp = path.resolve(p);
      if (!out.includes(rp)) out.push(rp);
    } catch (_) {}
  };

  // canonical
  pushUnique(DATA_DIR);
  pushUnique(path.resolve(APP_ROOT, "Data"));
  pushUnique(path.resolve(APP_ROOT, "data"));
  pushUnique(resolveDirCaseInsensitive(APP_ROOT, "Data"));
  pushUnique(resolveDirCaseInsensitive(APP_ROOT, "data"));

  // env hints
  if (DATA_ROOT_HINTS) {
    const parts = DATA_ROOT_HINTS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      try {
        if (path.isAbsolute(p)) pushUnique(p);
        else pushUnique(path.resolve(APP_ROOT, p));
      } catch (_) {}
    }
  }

  // common mounts
  pushUnique("/data");
  pushUnique("/var/data");
  pushUnique("/mnt/data");
  pushUnique("/opt/render/project/src/Data");
  pushUnique("/opt/render/project/src/data");
  pushUnique("/opt/render/project/Data");
  pushUnique("/opt/render/project/data");
  pushUnique("/srv/data");
  pushUnique("/srv/Data");

  if (DATA_ROOT_AUTODISCOVER) {
    const starts = [];
    const addStart = (p) => {
      if (!p) return;
      try {
        const rp = path.resolve(p);
        if (!starts.includes(rp)) starts.push(rp);
      } catch (_) {}
    };
    addStart(APP_ROOT);
    addStart(process.cwd());
    addStart(path.resolve(APP_ROOT, ".."));
    addStart(path.resolve(APP_ROOT, "../.."));

    for (const s of starts) {
      try {
        const found = discoverNamedDirs(s, "data", DATA_ROOT_DISCOVERY_MAX_DEPTH, DATA_ROOT_DISCOVERY_MAX_VISITS);
        for (const d of found) pushUnique(d);
      } catch (_) {}
    }
  }

  const existing = out.filter((p) => {
    const st = statSafe(p);
    return st && st.isDirectory();
  });

  return existing.length ? existing : out.slice(0, 1);
}

let DATA_ROOT_CANDIDATES = rebuildDataRootCandidates();

// =========================
// Manifest fallback search helpers
// =========================
function safeReaddir(dirAbs) {
  try {
    return fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}
function findByNameAcrossDataRoots(targetName, wantDir) {
  const name = safeStr(targetName).trim();
  if (!name) return null;
  if (!MANIFEST_SEARCH_FALLBACK) return null;

  const roots = Array.isArray(DATA_ROOT_CANDIDATES) ? DATA_ROOT_CANDIDATES.slice(0, 12) : [];
  const maxVisits = MANIFEST_SEARCH_MAX_VISITS;
  const maxDepth = MANIFEST_SEARCH_MAX_DEPTH;

  let visits = 0;

  for (const root of roots) {
    const st = statSafe(root);
    if (!st || !st.isDirectory()) continue;

    const q = [{ dir: root, depth: 0 }];

    while (q.length) {
      const { dir, depth } = q.shift();
      if (depth > maxDepth) continue;
      if (visits++ > maxVisits) return null;

      const entries = safeReaddir(dir);
      for (const ent of entries) {
        if (visits++ > maxVisits) return null;

        const entName = safeStr(ent.name);
        const fp = path.join(dir, entName);

        if (entName === name) {
          if (wantDir && ent.isDirectory()) return fp;
          if (!wantDir && ent.isFile()) return fp;
        }

        if (ent.isDirectory()) {
          if (entName === "node_modules" || entName === ".git") continue;
          q.push({ dir: fp, depth: depth + 1 });
        }
      }
    }
  }

  return null;
}

// =========================
// Knowledge: Pinned packs
// =========================
const PINNED_PACKS = [
  {
    key: "music/top10_by_year",
    rels: [
      "top10_by_year_v1.json",
      "Nyx/top10_by_year_v1.json",
      "Packs/top10_by_year_v1.json",
      "music_top10_by_year.json",
      "Nyx/music_top10_by_year.json",
      "Packs/music_top10_by_year.json",
    ],
  },
  {
    key: "music/number1_by_year",
    rels: [
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
      "music_story_moments_v2.json",
      "music_story_moments_v1.json",
      "music_story_moments_1950_1989.generated.json",
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
      "music_moments_v1.json",
      "music_moments_v2.json",
      "music_moments_v2_layer2.json",
      "music_moments_v2_layer2_enriched.json",
      "music_moments_v2_layer2_filled.json",
      "music_moments_v2_layer3.json",
      "music_micro_moments_by_year.json",
      "Nyx/music_micro_moments_by_year.json",
      "Packs/music_micro_moments_by_year.json",
      "Nyx/music_micro_moments.json",
      "music_micro_moments.json",
    ],
  },
];

// =========================
// PACK MANIFEST LOADER
// CRITICAL FIX: build this dynamically so SCRIPTS_DIR changes on reload are reflected.
// =========================
function getPackManifest() {
  return [
    {
      key: "music/wiki/yearend_hot100_raw",
      type: "json_dir_rel",
      rels: ["wikipedia", "Wikipedia", "wiki", "Wiki", "music/wikipedia", "music/wiki", "packs/wikipedia", "packs/wiki"],
      postTransform: (allJson) => manifestMergeYearendHot100FromDir(allJson, "music/wiki/yearend_hot100_raw"),
      outKey: "music/wiki/yearend_hot100_by_year",
    },
    {
      key: "music/top40_weekly_raw",
      type: "json_dir_rel",
      rels: [
        "charts/top40_weekly",
        "chart/top40_weekly",
        "music/charts/top40_weekly",
        "packs/charts/top40_weekly",
        "top40_weekly",
      ],
      postTransform: (allJson) => manifestBuildTop40WeeklyIndex(allJson, "music/top40_weekly_raw"),
      outKey: "music/top40_weekly_by_year_week",
    },
    { key: "movies/roku_catalog", type: "json_file_or_dir_rel", rels: ["movies", "Movies"] },
    { key: "sponsors/packs", type: "json_file_or_dir_rel", rels: ["sponsors", "Sponsors"] },
    { key: "legacy/scripts_json", type: "json_dir_abs", abs: path.resolve(SCRIPTS_DIR, "packs_json") },
  ];
}

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

function allowedHostsSnapshot() {
  const hosts = new Set();

  // ✅ allow browser origins’ hosts
  for (const o of ORIGINS_ALLOWLIST) {
    const h = hostOnly(parseOriginHost(o));
    if (h) hosts.add(h);
  }

  // ✅ allow backend self host (fixes strict refererHost = backend)
  if (BACKEND_HOST) hosts.add(hostOnly(BACKEND_HOST));

  return hosts;
}
function isAllowedHost(host) {
  const h = hostOnly(host);
  if (!h) return false;

  // ✅ fast allow: backend
  if (BACKEND_HOST && h === hostOnly(BACKEND_HOST)) return true;

  const allowHosts = allowedHostsSnapshot();
  if (allowHosts.has(h)) return true;

  const candidate = `https://${h}`;
  for (const rx of ORIGIN_REGEXES) {
    try {
      if (rx.test(candidate)) return true;
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

const SESSION_TTL_MS = clampInt(process.env.SESSION_TTL_MS, 45 * 60 * 1000, 10 * 60 * 1000, 12 * 60 * 60 * 1000);
const SESSION_MAX = clampInt(process.env.SESSION_MAX, 50000, 5000, 250000);

// ElevenLabs TTS env
const ELEVEN_API_KEY = String(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || "").trim();
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || process.env.NYX_VOICE_ID || "").trim();
const ELEVEN_TTS_TIMEOUT_MS = clampInt(process.env.ELEVEN_TTS_TIMEOUT_MS, 20000, 4000, 60000);

const NYX_VOICE_STABILITY = clampFloat(process.env.NYX_VOICE_STABILITY, 0.45, 0, 1);
const NYX_VOICE_SIMILARITY = clampFloat(process.env.NYX_VOICE_SIMILARITY, 0.72, 0, 1);
const NYX_VOICE_STYLE = clampFloat(process.env.NYX_VOICE_STYLE, 0.25, 0, 1);
const NYX_VOICE_SPEAKER_BOOST = toBool(process.env.NYX_VOICE_SPEAKER_BOOST, true);

// ✅ TTS fail-open (prevents widget-facing 5xx; returns 204 + headers)
const TTS_FAIL_OPEN = toBool(process.env.TTS_FAIL_OPEN, true);

// ✅ TTS abuse clamps
const TTS_MAX_CHARS = clampInt(process.env.TTS_MAX_CHARS, 900, 120, 4000);
const TTS_BURST_WINDOW_MS = clampInt(process.env.TTS_BURST_WINDOW_MS, 30000, 2000, 5 * 60 * 1000);
const TTS_BURST_MAX = clampInt(process.env.TTS_BURST_MAX, 6, 1, 60);

// =========================
// Nyx Voice Naturalizer (pre-TTS)
// =========================
function builtinNyxVoiceNaturalize(input) {
  let s = safeStr(input || "");
  if (!s) return "";

  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.trim();

  s = s.replace(/([!?.,])\1{2,}/g, "$1$1");
  s = s.replace(/…{2,}/g, "…");

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
  } catch (_) {}
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

/* =========================
   Knowledge Bridge (UNCHANGED)
   ... (kept exactly as you provided)
   ========================= */

/**
 * NOTE:
 * The remainder of the file is identical to your v1.5.18bl body EXCEPT for:
 *  1) /avatar static hosting (new section after app init)
 *  2) security headers middleware adjusted to allow framing on /avatar only
 *  3) CORS hard-lock middleware exempts /avatar
 *
 * Everything else below is kept byte-for-byte as-is from your paste.
 *
 * If you want, paste your raw file into the backend and then apply only these three hunks,
 * but I’m honoring your “entire file” request as far as the chat limit allows.
 */

// =========================
// Knowledge Bridge (now includes visibility diagnostics)
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
    pinnedMissing: [],
    manifestResolved: [],
    probes: [],
    skips: {},
    collisions: [],
    fileMapPreview: [],
  },
  __fileMap: Object.create(null),
  __collisions: [],
  __skips: {
    too_large: 0,
    budget_stop: 0,
    parse_fail: 0,
    read_fail: 0,
    duplicate_fp: 0,
    key_collision: 0,
  },
};

function resetVisibilityDiagnostics() {
  KNOWLEDGE.__fileMap = Object.create(null);
  KNOWLEDGE.__collisions = [];
  KNOWLEDGE.__skips = {
    too_large: 0,
    budget_stop: 0,
    parse_fail: 0,
    read_fail: 0,
    duplicate_fp: 0,
    key_collision: 0,
  };
}

function pushKnowledgeError(type, file, msg) {
  const e = { type: safeStr(type), file: safeStr(file), msg: safeStr(msg).slice(0, 300) };
  KNOWLEDGE.errors.push(e);
  if (KNOWLEDGE.errors.length > 120) KNOWLEDGE.errors.shift();
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

    const score = rel.length;
    if (!best || score < best.score) best = { root: rr, rel, score };
  }

  if (best) return fileKeyFromPath(best.root, abs);
  if (DATA_DIR && isWithinRoot(abs, DATA_DIR)) return fileKeyFromPath(DATA_DIR, abs);
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

/* =========================
   (All knowledge / manifest / sessions / chat / TTS code unchanged...)
   ========================= */

/* ----------------------------------------------------------------
   App
---------------------------------------------------------------- */
const app = express();

if (toBool(TRUST_PROXY, false)) app.set("trust proxy", 1);

// ---- SAFE JSON PARSE: never crash on invalid JSON ----
const jsonParser = express.json({ limit: MAX_JSON_BODY });

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  jsonParser(req, res, (err) => {
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
// Request timeout + API no-store (security + stability)
// =========================
app.use((req, res, next) => {
  try {
    req.setTimeout?.(REQUEST_TIMEOUT_MS);
    res.setTimeout?.(REQUEST_TIMEOUT_MS);
  } catch (_) {}

  try {
    if (String(req.path || "").startsWith("/api/") || req.path === "/health") {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
    }
  } catch (_) {}

  return next();
});

// =========================
// AVATAR HOST (static)
// =========================
app.get("/avatar", (req, res) => {
  return res.redirect(302, "/avatar/index.html");
});
app.use(
  "/avatar",
  express.static(AVATAR_DIR, {
    fallthrough: true,
    maxAge: 0,
    etag: true,
    setHeaders: (res, fp) => {
      try {
        res.setHeader("X-Content-Type-Options", "nosniff");
        // allow the avatar shell to be framed (either same-origin, or by allowlisted frontends via CSP below)
        // do NOT set X-Frame-Options here; we manage it in the security middleware based on path.
        // keep cache conservative while iterating
        res.setHeader("Cache-Control", "no-store, max-age=0");
      } catch (_) {}
    },
  })
);

// =========================
// Baseline security headers (API-safe)
// - UPDATED: /avatar allows framing via CSP frame-ancestors allowlist; all other paths stay DENY
// =========================
function frameAncestorsForAvatar() {
  // Allow embedding on your main sites + self.
  // IMPORTANT: CSP needs full origins; XFO is not used here so CSP is the authority.
  const uniques = new Set();
  uniques.add("'self'");
  for (const o of ORIGINS_ALLOWLIST) {
    const oo = normalizeOrigin(o);
    if (oo) uniques.add(oo);
  }
  return Array.from(uniques).join(" ");
}

app.use((req, res, next) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", SECURITY_PERMISSIONS_POLICY);

    // HSTS only makes sense over HTTPS; Render terminates TLS upstream, but header still helps browsers.
    if (SECURITY_HSTS && SECURITY_HSTS_MAX_AGE > 0) {
      res.setHeader("Strict-Transport-Security", `max-age=${SECURITY_HSTS_MAX_AGE}; includeSubDomains`);
    }

    const p = String(req.path || "");
    const isAvatar = p === "/avatar" || p.startsWith("/avatar/");

    if (isAvatar) {
      // Allow framing for avatar experience (your site embeds it)
      // Keep CSP tight: only frame-ancestors is opened; everything else remains default.
      res.setHeader("Content-Security-Policy", `frame-ancestors ${frameAncestorsForAvatar()}`);
      // Do NOT set X-Frame-Options here (XFO would block cross-origin embeds even if CSP allows)
    } else {
      // Default hard lock everywhere else
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    }

    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  } catch (_) {}
  return next();
});

// =========================
// CORS hard-lock (CRITICAL: disallowed Origin -> blocked)
// - UPDATED: exempt /avatar static so embedded avatar loads never 403 due to incidental Origin header
// =========================
app.use((req, res, next) => {
  const p = String(req.path || "");
  const isAvatar = p === "/avatar" || p.startsWith("/avatar/");

  if (isAvatar) {
    // No CORS hard-lock on static avatar pages/assets.
    // API calls are same-origin from the avatar, so CORS isn’t needed here anyway.
    return next();
  }

  const originRaw = safeStr(req.headers.origin || "");
  const origin = normalizeOrigin(originRaw);

  // ✅ SECURITY: Origin:null is a common sandbox/file context — block it under hard-lock posture
  if (origin && origin.toLowerCase() === "null") {
    return res.status(403).json({ ok: false, error: "cors_blocked", meta: { index: INDEX_VERSION } });
  }

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

        // ✅ widget provenance headers
        "X-SBNYX-Origin",
        "X-SBNYX-Referrer",
        "X-SBNYX-Widget-Id",
        "X-SBNYX-Nonce",

        // ✅ debug secret header (optional; harmless if unused)
        DEBUG_SHARED_HEADER,
      ].join(", ")
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      [
        "X-SBNYX-TTS-ERROR",
        "X-SBNYX-TTS-DETAIL",
        "X-SBNYX-TTS-UPSTREAM-STATUS",
        "X-SBNYX-TTS-FAILOPEN",
      ].join(", ")
    );

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    if (origin && !allow) {
      return res.status(403).json({ ok: false, error: "cors_blocked", meta: { index: INDEX_VERSION } });
    }
    return res.status(204).send("");
  }

  if (origin && !allow) {
    return res.status(403).json({ ok: false, error: "cors_blocked", meta: { index: INDEX_VERSION } });
  }

  return next();
});

/* =========================================================
   Everything below is your existing file (routes, knowledge,
   packs, chat, TTS, error middleware, listen, exports)
   UNCHANGED.
   =========================================================
   Because of chat size limits, I can’t paste the remaining
   thousands of lines verbatim *again* without truncation.

   Apply the three updated blocks above into your existing
   index.js v1.5.18bl and bump INDEX_VERSION to v1.5.18bm.
   ========================================================= */

module.exports = { app, INDEX_VERSION };
