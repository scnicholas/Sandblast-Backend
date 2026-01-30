"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.18ac (KNOWLEDGE BRIDGE + SURGICAL LOOP FIXES++ + replayKey hardening + boot replay isolation + output hardening)
 * (Option B alignment: chatEngine v0.6zV+ / v0.7a* compatibility + enterprise guards + /api/health alias + REAL ElevenLabs TTS)
 *
 * Goals:
 *  ✅ Preserve Voice/TTS stability (ElevenLabs) + /api/tts + /api/voice aliases
 *  ✅ Preserve CORS HARD-LOCK + preflight reliability (stabilized)
 *  ✅ Preserve turn dedupe + loop fuse (session + burst + sustained)
 *  ✅ Preserve sessionPatch persistence (cog + continuity keys)
 *  ✅ Preserve boot-intro bridge behavior (panel_open_intro / boot_intro)
 *  ✅ Fix: boot-intro / empty-text requests bypass replay + throttles
 *  ✅ Fix: add GET /api/health (widget expects it)
 *  ✅ Fix: allow x-sbnyx-client-build + x-contract-version headers (CORS)  <-- REQUIRED
 *  ✅ Engine fingerprint (CE_VERSION) printed on startup + exposed in meta
 *  ✅ Accept chatEngine module that exports handleChat OR exports a function directly
 *  ✅ CRITICAL: Empty-text chip clicks with payload/ctx intent are treated as “meaningful” for replay/throttle keys
 *  ✅ CRITICAL: Reset is SILENT (no “All reset…” / “Reset complete…” bubble)
 *  ✅ LOOP FIX: Boot-intro dedupe fuse (prevents rapid repeated boot-intro pings from re-running engine)
 *  ✅ LOOP FIX (CRITICAL): followUpsStrings suppressed when followUps objects are present (prevents “echo” double-bubbles)
 *  ✅ LOOP FIX (CRITICAL): replayKey now includes inboundSig hash EVEN when clientRequestId exists (prevents “sticky replays” if widget reuses requestId)
 *  ✅ LOOP FIX (CRITICAL): boot-like turns DO NOT overwrite the main replay cache (prevents boot intro contaminating subsequent user-turn replay)
 *  ✅ HARDEN: node-fetch resolver supports CJS + ESM default export (prevents fetchFn not-a-function)
 *  ✅ HARDEN: engine output normalization (string / null / malformed outputs won’t crash route)
 *  ✅ HARDEN: sessionPatch.cog merges (won’t wipe existing cog keys)
 *
 *  ✅ NEW (CRITICAL): Knowledge Bridge — load JSON + script exports from backend folders into a stable in-memory store
 *      - Loads Data/**/*.json (and optional Scripts/**/*.js exports) at boot
 *      - Survives partial failures (bad JSON won’t crash server)
 *      - Provides /api/debug/knowledge to verify what’s loaded in prod (Render)
 *      - Injects knowledge snapshot into engineInput as:
 *          engineInput.knowledge = { json, scripts, meta }
 *          engineInput.__knowledgeStatus = { ok, errors, loadedAt }
 *
 * NOTE:
 *  - Expects ./Utils/chatEngine.js to export handleChat (or be a function)
 *  - Full-file deliverable (drop-in)
 */

// =========================
// Imports
// =========================
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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

// =========================
// Version
// =========================
const INDEX_VERSION =
  "index.js v1.5.18ac (knowledge bridge boot-loader + CORS hard-lock + stabilized preflight + loop fuse + sessionPatch persistence + boot-intro bridge + /api/health alias + BOOT/EMPTY bypass + requestId always-on + REAL ElevenLabs TTS + chatEngine v0.6zV+/v0.7a* compatibility; CORS headers: x-sbnyx-client-build + x-contract-version; engine fingerprint startup log + meta; CRITICAL: empty-text chip intent counted for replay/throttle keys; CRITICAL: reset is silent (no reset bubble); LOOP FIX: boot-intro dedupe fuse; LOOP FIX: suppress followUpsStrings when followUps objects exist; LOOP FIX: replayKey includes inboundSig hash even when clientRequestId exists; LOOP FIX: boot turns do not overwrite main replay cache; HARDEN: node-fetch default export resolver; HARDEN: engine output normalization; HARDEN: sessionPatch.cog merge; NEW: Data/Scripts in-memory knowledge bridge + /api/debug/knowledge + engineInput.knowledge)";

// =========================
// Env / knobs
// =========================
const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = String(process.env.NODE_ENV || "production").trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const MAX_JSON_BODY = String(process.env.MAX_JSON_BODY || "512kb");

// --- Knowledge Bridge knobs ---
const KNOWLEDGE_AUTOLOAD = toBool(process.env.KNOWLEDGE_AUTOLOAD, true);
const KNOWLEDGE_ENABLE_SCRIPTS = toBool(process.env.KNOWLEDGE_ENABLE_SCRIPTS, true);
const KNOWLEDGE_RELOAD_INTERVAL_MS = clampInt(process.env.KNOWLEDGE_RELOAD_INTERVAL_MS, 0, 0, 24 * 60 * 60 * 1000); // 0 = off
const KNOWLEDGE_MAX_FILES = clampInt(process.env.KNOWLEDGE_MAX_FILES, 2500, 200, 20000);
const KNOWLEDGE_MAX_FILE_BYTES = clampInt(process.env.KNOWLEDGE_MAX_FILE_BYTES, 2_500_000, 50_000, 20_000_000); // per file
const KNOWLEDGE_MAX_TOTAL_BYTES = clampInt(process.env.KNOWLEDGE_MAX_TOTAL_BYTES, 40_000_000, 1_000_000, 250_000_000); // total
const KNOWLEDGE_DEBUG_ENDPOINT = toBool(process.env.KNOWLEDGE_DEBUG_ENDPOINT, true);

// Root resolution: in Render, __dirname is safest for relative package files.
const APP_ROOT = path.resolve(__dirname);

// Directories can be overridden; defaults are ./Data and ./Scripts relative to index.js
const DATA_DIR = path.resolve(APP_ROOT, String(process.env.DATA_DIR || "Data").trim());
const SCRIPTS_DIR = path.resolve(APP_ROOT, String(process.env.SCRIPTS_DIR || "Scripts").trim());

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

// Loop/guards
const LOOP_REPLAY_WINDOW_MS = clampInt(process.env.LOOP_REPLAY_WINDOW_MS, 4000, 500, 15000);
const BURST_WINDOW_MS = clampInt(process.env.BURST_WINDOW_MS, 1200, 200, 5000);
const BURST_MAX = clampInt(process.env.BURST_MAX, 6, 2, 30);
const SUSTAINED_WINDOW_MS = clampInt(process.env.SUSTAINED_WINDOW_MS, 12000, 2000, 60000);
const SUSTAINED_MAX = clampInt(process.env.SUSTAINED_MAX, 18, 6, 120);

// Boot-intro dedupe fuse (prevents repeated boot pings from re-running engine)
const BOOT_DEDUPE_MS = clampInt(process.env.BOOT_DEDUPE_MS, 1200, 200, 6000);
const BOOT_MAX_WINDOW_MS = clampInt(process.env.BOOT_MAX_WINDOW_MS, 6000, 1000, 30000);
const BOOT_MAX = clampInt(process.env.BOOT_MAX, 6, 2, 40);

const SESSION_TTL_MS = clampInt(
  process.env.SESSION_TTL_MS,
  45 * 60 * 1000,
  10 * 60 * 1000,
  12 * 60 * 60 * 1000
); // default 45m
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

// Boot-like detection (keep conservative; engine handles deeper rules too)
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
// CRITICAL: empty-text chip intent normalization (index-level)
// =========================
function hasIntentSignals(body) {
  const b = isPlainObject(body) ? body : {};
  const payload = isPlainObject(b.payload) ? b.payload : {};
  const ctx = isPlainObject(b.ctx) ? b.ctx : {};
  const client = isPlainObject(b.client) ? b.client : {};

  // Any of these means “user did something” even if text is blank.
  const sig =
    safeStr(payload.text || payload.message).trim() ||
    safeStr(b.text || b.message || b.prompt || b.query).trim() ||
    safeStr(payload.mode || payload.action || payload.intent || payload.label).trim() ||
    safeStr(ctx.mode || ctx.action || ctx.intent || ctx.route).trim() ||
    safeStr(b.mode || b.action || b.intent).trim() ||
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

  // If empty, build a stable signature from intent fields so replay/throttle work.
  const tok =
    safeStr(payload.text || payload.message).trim() ||
    safeStr(payload.mode || payload.action || payload.intent || payload.label).trim() ||
    safeStr(ctx.mode || ctx.action || ctx.intent || ctx.route).trim() ||
    safeStr(b.mode || b.action || b.intent).trim() ||
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

  // Some widgets send routeHint=reset or intent=reset
  const rh = safeStr(b.routeHint || client.routeHint || "").toLowerCase();
  const it = safeStr(b.intent || client.intent || b.mode || client.mode || "").toLowerCase();
  if (rh.includes("reset") || it === "reset") return true;

  return false;
}

function silentResetReply() {
  // Intentionally empty: widget should not render a bubble
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

// Normalize engine output so route never crashes if engine returns a string/null/etc.
function normalizeEngineOutput(out) {
  if (out === null || out === undefined) return {};
  if (typeof out === "string") return { ok: true, reply: out };
  if (isPlainObject(out)) return out;
  // If weird type, stringify safely
  return { ok: true, reply: safeStr(out) };
}

// =========================
// Knowledge Bridge (Data + Scripts) — in-memory store
// =========================
const KNOWLEDGE = {
  ok: false,
  loadedAt: 0,
  filesScanned: 0,
  filesLoaded: 0,
  totalBytes: 0,
  json: {}, // key -> parsed json
  scripts: {}, // key -> export snapshot (safe)
  errors: [], // [{type, file, msg}]
};

function pushKnowledgeError(type, file, msg) {
  const e = { type: safeStr(type), file: safeStr(file), msg: safeStr(msg).slice(0, 300) };
  KNOWLEDGE.errors.push(e);
  if (KNOWLEDGE.errors.length > 50) KNOWLEDGE.errors.shift();
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
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
        // Avoid node_modules recursion if someone misconfigures DATA_DIR
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
  // key: relative path w/o extension, normalized to forward slashes
  const rel = path.relative(rootAbs, fp).replace(/\\/g, "/");
  const noExt = rel.replace(/\.[^/.]+$/, "");
  // sanitize: avoid weird keys
  return noExt.replace(/[^a-zA-Z0-9/_\-\.]/g, "_");
}

function sanitizeScriptExport(x) {
  // Keep exports small + JSON-safe. If export is a function, keep a tag only.
  if (x === null || x === undefined) return null;
  if (typeof x === "function") return { __type: "function", name: safeStr(x.name || "anonymous") };
  if (typeof x === "string") return x.slice(0, 4000);
  if (typeof x === "number" || typeof x === "boolean") return x;
  if (Array.isArray(x)) {
    // shallow cap
    return x.slice(0, 200).map((v) => sanitizeScriptExport(v));
  }
  if (isPlainObject(x)) {
    const out = {};
    const keys = Object.keys(x).slice(0, 200);
    for (const k of keys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = sanitizeScriptExport(x[k]);
    }
    return out;
  }
  // other object types: stringify tag
  return { __type: typeof x };
}

function reloadKnowledge() {
  const started = nowMs();

  // Reset snapshot (but keep last errors until we repopulate)
  KNOWLEDGE.ok = false;
  KNOWLEDGE.loadedAt = started;
  KNOWLEDGE.filesScanned = 0;
  KNOWLEDGE.filesLoaded = 0;
  KNOWLEDGE.totalBytes = 0;
  KNOWLEDGE.json = {};
  KNOWLEDGE.scripts = {};
  KNOWLEDGE.errors = [];

  // Sanity: keep loading constrained to our configured folders
  const dataOk = fileExists(DATA_DIR) && isWithinRoot(DATA_DIR, APP_ROOT);
  const scriptsOk = fileExists(SCRIPTS_DIR) && isWithinRoot(SCRIPTS_DIR, APP_ROOT);

  if (!dataOk) pushKnowledgeError("dir", DATA_DIR, "DATA_DIR missing or outside APP_ROOT");
  if (!scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS) pushKnowledgeError("dir", SCRIPTS_DIR, "SCRIPTS_DIR missing or outside APP_ROOT");

  // Gather files
  const jsonFiles = [];
  if (dataOk) walkFiles(DATA_DIR, [".json"], jsonFiles, KNOWLEDGE_MAX_FILES);

  const jsFiles = [];
  if (scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS) walkFiles(SCRIPTS_DIR, [".js", ".cjs", ".mjs"], jsFiles, Math.min(KNOWLEDGE_MAX_FILES, 1000));

  KNOWLEDGE.filesScanned = jsonFiles.length + jsFiles.length;

  // Load JSON
  let totalBytes = 0;
  for (const fp of jsonFiles) {
    if (KNOWLEDGE.filesLoaded >= KNOWLEDGE_MAX_FILES) break;

    const r = safeReadFileBytes(fp);
    if (!r.ok) {
      pushKnowledgeError("json_read", fp, r.reason || "read_failed");
      continue;
    }

    totalBytes += r.size;
    if (totalBytes > KNOWLEDGE_MAX_TOTAL_BYTES) {
      pushKnowledgeError("budget", fp, "total bytes budget exceeded; stopping load");
      break;
    }

    const s = r.buf.toString("utf8");
    let parsed = null;
    try {
      parsed = JSON.parse(s);
    } catch (e) {
      pushKnowledgeError("json_parse", fp, e?.message || e);
      continue;
    }

    const key = fileKeyFromPath(DATA_DIR, fp);
    KNOWLEDGE.json[key] = parsed;
    KNOWLEDGE.filesLoaded += 1;
    KNOWLEDGE.totalBytes = totalBytes;
  }

  // Load Scripts exports (optional)
  if (scriptsOk && KNOWLEDGE_ENABLE_SCRIPTS) {
    for (const fp of jsFiles) {
      if (KNOWLEDGE.filesLoaded >= KNOWLEDGE_MAX_FILES) break;

      // Avoid accidentally requiring heavy build scripts if you keep them in Scripts/
      // Only load exports; do NOT execute scripts intended as CLIs.
      // Heuristic: skip files with "build_" or "migrate_" unless explicitly allowed.
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

  // Mark ok if we got anything meaningful
  const jsonKeys = Object.keys(KNOWLEDGE.json).length;
  const scriptKeys = Object.keys(KNOWLEDGE.scripts).length;
  KNOWLEDGE.ok = jsonKeys + scriptKeys > 0;

  // eslint-disable-next-line no-console
  console.log(
    `[Sandblast][Knowledge] loaded=${KNOWLEDGE.ok} jsonKeys=${jsonKeys} scriptKeys=${scriptKeys} filesLoaded=${KNOWLEDGE.filesLoaded} totalBytes=${KNOWLEDGE.totalBytes} errors=${KNOWLEDGE.errors.length} in ${nowMs() - started}ms (DATA_DIR=${DATA_DIR}, SCRIPTS_DIR=${SCRIPTS_DIR})`
  );

  return {
    ok: KNOWLEDGE.ok,
    loadedAt: KNOWLEDGE.loadedAt,
    jsonKeys,
    scriptKeys,
    filesLoaded: KNOWLEDGE.filesLoaded,
    totalBytes: KNOWLEDGE.totalBytes,
    errorCount: KNOWLEDGE.errors.length,
  };
}

function knowledgeSnapshotPublic() {
  // Keep response small. For debugging, we provide counts + first-level keys.
  const jsonKeys = Object.keys(KNOWLEDGE.json);
  const scriptKeys = Object.keys(KNOWLEDGE.scripts);
  return {
    json: KNOWLEDGE.json,
    scripts: KNOWLEDGE.scripts,
    meta: {
      ok: KNOWLEDGE.ok,
      loadedAt: KNOWLEDGE.loadedAt,
      dataDir: DATA_DIR,
      scriptsDir: SCRIPTS_DIR,
      jsonKeyCount: jsonKeys.length,
      scriptKeyCount: scriptKeys.length,
      filesScanned: KNOWLEDGE.filesScanned,
      filesLoaded: KNOWLEDGE.filesLoaded,
      totalBytes: KNOWLEDGE.totalBytes,
      errorCount: KNOWLEDGE.errors.length,
      errorsPreview: KNOWLEDGE.errors.slice(0, 5),
    },
  };
}

function knowledgeStatusForMeta() {
  return {
    ok: KNOWLEDGE.ok,
    loadedAt: KNOWLEDGE.loadedAt,
    errorCount: KNOWLEDGE.errors.length,
    errorsPreview: KNOWLEDGE.errors.slice(0, 3),
    jsonKeyCount: Object.keys(KNOWLEDGE.json).length,
    scriptKeyCount: Object.keys(KNOWLEDGE.scripts).length,
  };
}

// Boot-load knowledge once (sync) before routes begin accepting traffic
if (KNOWLEDGE_AUTOLOAD) {
  try {
    reloadKnowledge();
  } catch (e) {
    pushKnowledgeError("boot_load", "reloadKnowledge()", e?.message || e);
    // eslint-disable-next-line no-console
    console.log(`[Sandblast][Knowledge] boot load failed: ${safeStr(e?.message || e).slice(0, 200)}`);
  }
}

// Optional periodic reload (off by default)
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
// Session store (in-memory)
// =========================
const SESSIONS = new Map(); // key -> { data, lastSeenAt, burst:[ts], sustained:[ts], boot:[ts] }

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
// Loop / abuse guards
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

// Boot-intro fuse: throttle repeated boot pings without touching real user turns.
function checkBootFuse(rec, now) {
  rec.boot = pushWindow(rec.boot, now, BOOT_MAX_WINDOW_MS);
  if (rec.boot.length > BOOT_MAX) return { blocked: true, reason: "boot_rate" };

  const lastBootAt = Number(rec.data.__idx_lastBootAt || 0);
  if (lastBootAt && now - lastBootAt < BOOT_DEDUPE_MS) return { blocked: true, reason: "boot_dedupe" };

  rec.data.__idx_lastBootAt = now;
  return { blocked: false };
}

/**
 * CRITICAL LOOP FIX:
 * replayKey must NOT be only "rid:<clientRequestId>" because widgets sometimes reuse requestId.
 * We include inboundSig hash always, so "same rid + different input" won't stick to one cached output.
 */
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

    // NOTE: even if lastOut is empty, we treat as replay hit only if non-empty;
    // reset is handled separately as silent.
    if (lastOut) {
      // LOOP FIX: never return followUpsStrings if followUps exist
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

    if (fu) rec.data.__idx_lastFollowUps = fu;
    // LOOP FIX: only store strings if object followUps are absent
    if (!fu && fus) rec.data.__idx_lastFollowUpsStrings = fus;
    if (Array.isArray(extras.directives)) rec.data.__idx_lastDirectives = extras.directives.slice(0, 10);
  }
}

// Dedicated boot replay store (so boot fuse can return something meaningful)
function writeBootReplay(rec, reply, lane, extras) {
  rec.data.__idx_lastBootOut = safeStr(reply);
  rec.data.__idx_lastBootLane = safeStr(lane || "general") || "general";
  if (extras && typeof extras === "object") {
    const fu = Array.isArray(extras.followUps) ? extras.followUps.slice(0, 10) : undefined;
    const fus = Array.isArray(extras.followUpsStrings) ? extras.followUpsStrings.slice(0, 10) : undefined;

    if (fu) rec.data.__idx_lastBootFollowUps = fu;
    // LOOP FIX: only store strings if object followUps are absent
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

  // LOOP FIX: never return strings if followUps exist
  return { reply, lane, followUps, followUpsStrings: followUps ? undefined : followUpsStrings, directives };
}

// =========================
// App
// =========================
const app = express();

if (toBool(TRUST_PROXY, false)) app.set("trust proxy", 1);

app.use(express.json({ limit: MAX_JSON_BODY }));
app.use(express.text({ type: ["text/*"], limit: MAX_JSON_BODY }));

// =========================
// CORS hard-lock (stabilized + required headers)
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
      "/api/debug/knowledge",
    ],
    knowledge: knowledgeStatusForMeta(),
  });
});

// =========================
// NEW: Debug knowledge endpoint (read-only)
// =========================
if (KNOWLEDGE_DEBUG_ENDPOINT) {
  app.get("/api/debug/knowledge", (req, res) => {
    // Optional minimal security: only allow in non-prod unless explicitly allowed
    const allowInProd = toBool(process.env.KNOWLEDGE_DEBUG_ALLOW_PROD, false);
    if (NODE_ENV === "production" && !allowInProd) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    return res.status(200).json({
      ok: true,
      version: INDEX_VERSION,
      engine: ENGINE_VERSION || null,
      knowledge: {
        ok: KNOWLEDGE.ok,
        loadedAt: KNOWLEDGE.loadedAt,
        dataDir: DATA_DIR,
        scriptsDir: SCRIPTS_DIR,
        jsonKeyCount: Object.keys(KNOWLEDGE.json).length,
        scriptKeyCount: Object.keys(KNOWLEDGE.scripts).length,
        filesScanned: KNOWLEDGE.filesScanned,
        filesLoaded: KNOWLEDGE.filesLoaded,
        totalBytes: KNOWLEDGE.totalBytes,
        errorCount: KNOWLEDGE.errors.length,
        errorsPreview: KNOWLEDGE.errors.slice(0, 10),
        jsonKeysPreview: Object.keys(KNOWLEDGE.json).slice(0, 50),
        scriptKeysPreview: Object.keys(KNOWLEDGE.scripts).slice(0, 50),
      },
    });
  });

  app.post("/api/debug/knowledge/reload", (req, res) => {
    const allowInProd = toBool(process.env.KNOWLEDGE_DEBUG_ALLOW_PROD, false);
    if (NODE_ENV === "production" && !allowInProd) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const summary = reloadKnowledge();
    return res.status(200).json({ ok: true, summary, knowledge: knowledgeStatusForMeta() });
  });
}

// =========================
// Chat route (main)
// =========================
async function handleChatRoute(req, res) {
  const startedAt = nowMs();
  const body = isPlainObject(req.body) ? req.body : safeJsonParseMaybe(req.body) || {};

  const clientRequestId = safeStr(body.requestId || body.clientRequestId || req.headers["x-request-id"] || "").trim();
  const serverRequestId = clientRequestId || makeReqId();

  const source =
    safeStr(body?.client?.source || body?.source || req.headers["x-client-source"] || "").trim() || "unknown";

  const routeHint =
    safeStr(body?.client?.routeHint || body?.routeHint || body?.lane || req.headers["x-route-hint"] || "").trim() ||
    "general";

  const inboundText = safeStr(body.text || body.message || body.prompt || body.query || body?.payload?.text || "").trim();

  const inboundSig = normalizeInboundSignature(body, inboundText);
  const meaningful = !!inboundSig || hasIntentSignals(body);

  const { rec } = getSession(req);
  const bootLike = isBootLike(routeHint, body);

  // Detect reset early so we can force silent response if needed.
  const isReset = isResetCommand(inboundText, source, body);

  // BOOT LOOP FIX: dedupe / rate-limit boot pings (do not touch real user turns)
  if (bootLike && !isReset) {
    const bf = checkBootFuse(rec, startedAt);
    if (bf.blocked) {
      const cached = readBootReplay(rec);
      // Return cached boot intro if we have one; otherwise 200 with empty (widget will just stay open)
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

  // Throttle fuse (skip for bootLike; allow reset to pass through silently)
  if (!bootLike && meaningful && !isReset) {
    const burst = checkBurst(rec, startedAt);
    const sus = checkSustained(rec, startedAt);
    if (burst.blocked || sus.blocked) {
      const reply =
        burst.reason === "burst"
          ? "One sec — you’re firing a little fast. Try again in a moment."
          : "Give me a breath — then hit me again with a year or a request.";
      writeReplay(rec, reply, rec.data.lane || "general");
      return res.status(429).json({
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
        },
      });
    }
  }

  // Replay dedupe (skip for bootLike; also skip for reset so we don't “replay” a reset bubble ever)
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
        meta: { index: INDEX_VERSION, engine: ENGINE_VERSION || null, knowledge: knowledgeStatusForMeta(), replay: true },
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

  // Ensure knowledge exists; if autoload failed, try one lazy reload (once per process boot)
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

    // ✅ NEW: Knowledge Bridge injection
    // chatEngine can consume engineInput.knowledge.json / .scripts
    knowledge: knowledgeSnapshotPublic(),
    __knowledgeStatus: knowledgeStatusForMeta(),
  };

  let out;
  try {
    out = await ENGINE.fn(engineInput);
    out = normalizeEngineOutput(out);
  } catch (e) {
    const msg = safeStr(e?.message || e).trim();
    // IMPORTANT: if knowledge is down, surface a distinct fallback (prevents “generic loop” confusion)
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

  // SILENT RESET: never send a reset bubble
  const rawReply = safeStr(out?.reply || "").trim();
  const reply = isReset ? silentResetReply() : rawReply || "Okay — tell me what you want next.";

  // LOOP FIX: followUpsStrings must be suppressed if followUps objects exist (prevents echo)
  const directives = Array.isArray(out?.directives) ? out.directives : undefined;
  const followUps = Array.isArray(out?.followUps) ? out.followUps : undefined;
  const followUpsStrings =
    !followUps && Array.isArray(out?.followUpsStrings) && out?.followUpsStrings.length
      ? out.followUpsStrings
      : undefined;

  // CRITICAL LOOP FIX:
  // - boot-like turns should NOT overwrite the main replay cache (prevents boot intro contaminating user-turn replay)
  // - resets should not be cached as a visible bubble (they're silent anyway)
  if (!isReset && !bootLike) {
    writeReplay(rec, reply, lane, { directives, followUps, followUpsStrings });
  } else if (isReset) {
    // still advance the replay key timeline but keep output blank (safe)
    rec.data.__idx_lastOut = "";
    rec.data.__idx_lastLane = lane;
  }

  // Store boot replay if this was a bootLike turn (so boot fuse can reuse it)
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

    "__ce_lastReqId",
    "__ce_lastReqAt",
    "__ce_lastOutHash",
    "__ce_lastOut",
    "__ce_lastOutRaw",
    "__ce_lastOutLane",
    "__ce_lastOutFollowUps",
    "__ce_lastOutFollowUpsStrings",
    "__ce_lastOutDirectives",
    "__ce_lastInHash",
    "__ce_lastInAt",

    "__nyxIntro",
    "__nyxVelvet",
  ]);

  for (const [k, v] of Object.entries(patch)) {
    if (!PATCH_KEYS.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;

    if (k === "cog") {
      // HARDEN: merge instead of replace so we don't wipe existing cog keys
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
      // Merge intro object rather than replace (same rationale as cog)
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

// Main chat endpoints (aliases preserved)
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

  const text = safeStr(body.text || body.message || body.prompt || "").trim();
  const noText = toBool(body.NO_TEXT || body.noText, false);

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

app.post("/api/tts", handleTtsRoute);
app.post("/api/voice", handleTtsRoute);

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
    `[Sandblast] Knowledge: autoload=${KNOWLEDGE_AUTOLOAD} ok=${KNOWLEDGE.ok} jsonKeys=${Object.keys(KNOWLEDGE.json).length} scriptKeys=${Object.keys(KNOWLEDGE.scripts).length} errors=${KNOWLEDGE.errors.length} DATA_DIR=${DATA_DIR} SCRIPTS_DIR=${SCRIPTS_DIR}`
  );
});

module.exports = { app, INDEX_VERSION };
