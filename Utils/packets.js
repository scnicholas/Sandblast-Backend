"use strict";

/**
 * Utils/packets.js
 *
 * Deterministic packet selector + renderer.
 * Reads Data/nyx/packets_v1.json and returns:
 *   { reply, followUps, sessionPatch, meta }
 *
 * v1.2-C (STATE TEMPLATES + ONCE-PER-SESSION FIX + TYPE NORMALIZATION)
 *
 * HARDENING / FIXES:
 * ✅ Never throws, never bricks boot (all-guards + safe fallbacks)
 * ✅ Safe file path (no cwd surprises) + optional env override
 * ✅ Cache with mtime revalidation (no stale dev edits)
 * ✅ Trigger matching is STRICT + bounded:
 *    - reserved triggers only match exact
 *    - normal triggers must match whole word/phrase boundary (prevents "hi" matching "this")
 * ✅ Anti-hijack guardrails:
 *    - packets are meant for greet/help/bye/fallback/error/prompt/nav + explicit "__ask_year__" style calls
 *    - can be forced ONLY via reserved triggers; otherwise requires stable-safe trigger hit
 * ✅ CHATENGINE GATE:
 *    - packets only run when session.allowPackets===true
 *    - reserved triggers ALWAYS allowed (explicit invocation)
 *    - if a year exists, packets do not fire unless reserved trigger
 * ✅ NEW: State-aware templates:
 *    - if packet.stateTemplates exists, choose templates from stateTemplates[session.cog.state]
 *    - falls back to packet.templates (no regression if stateTemplates missing)
 * ✅ NEW: oncePerSession actually works (persists under session.__nyxPackets.once)
 * ✅ Prototype-pollution safe sessionPatch allowlist + deep-copy
 * ✅ FollowUps sanitized (length caps, max count, dedupe, no weird objects)
 * ✅ Template selection deterministic and safe (caps, type checks)
 *
 * Template vars:
 *  - {year} supported (prefers session.lastMusicYear, then session.cog.year/lastMusicYear)
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_PACKETS_PATH = path.join(__dirname, "..", "Data", "nyx", "packets_v1.json");
const PACKETS_PATH = String(process.env.NYX_PACKETS_PATH || "").trim() || DEFAULT_PACKETS_PATH;

let CACHE = null;
let CACHE_ERR = null;
let CACHE_MTIME_MS = 0;

const MAX_FILE_BYTES = 512 * 1024; // 512KB hard cap (prevents accidental huge files)
const MAX_CHIPS = 10;
const MAX_LABEL_LEN = 48;
const MAX_SEND_LEN = 96;
const MAX_REPLY_LEN = 1200;

// allowlist keys that packets.js may emit in sessionPatch
// (chatEngine will further allowlist when it merges)
const ALLOWED_PATCH_KEYS = new Set([
  "lane",
  "lastMusicYear",
  "activeMusicMode",
  "voiceMode",
  "lastIntentSig",
  "__nyxPackets", // NEW: used for oncePerSession memory (bounded + sanitized)
]);

const MAX_ONCE_IDS = 64;

/* ======================================================
   Helpers
====================================================== */

function normText(t) {
  return String(t || "").trim().toLowerCase();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return Math.trunc(n);
}

function extractYearFromText(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1950 || y > 2024) return null;
  return Math.trunc(y);
}

function replaceVars(str, vars) {
  let out = String(str || "");
  if (!vars || typeof vars !== "object") return out;
  for (const k of Object.keys(vars)) {
    const v = String(vars[k]);
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function djb2Hash(str) {
  let h = 5381;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0; // unsigned
}

function safeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const it of list) {
    if (!it || typeof it !== "object") continue;

    const label = String(it.label || "").trim();
    const send = String(it.send || "").trim();

    if (!label || !send) continue;
    if (label.length > MAX_LABEL_LEN) continue;
    if (send.length > MAX_SEND_LEN) continue;

    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    out.push({ label, send });
    if (out.length >= MAX_CHIPS) break;
  }

  return out;
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function safeNyxPacketsPatch(val) {
  // Expected shape: { once: { [packetId]: 1 } }
  // We sanitize and bound it hard.
  if (!isPlainObject(val)) return null;

  const out = Object.create(null);
  const onceIn = isPlainObject(val.once) ? val.once : null;
  if (!onceIn) return null;

  const onceOut = Object.create(null);
  let count = 0;

  for (const k of Object.keys(onceIn)) {
    if (!k || k === "__proto__" || k === "constructor" || k === "prototype") continue;
    const id = String(k).trim();
    if (!id) continue;
    onceOut[id] = 1;
    count++;
    if (count >= MAX_ONCE_IDS) break;
  }

  if (!count) return null;
  out.once = onceOut;
  return out;
}

function safeSessionPatch(patch) {
  if (!patch || typeof patch !== "object") return null;

  const out = Object.create(null);
  for (const k of Object.keys(patch)) {
    if (!ALLOWED_PATCH_KEYS.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;

    if (k === "lastMusicYear") {
      const y = clampYear(patch[k]);
      if (y) out.lastMusicYear = y;
      continue;
    }

    if (k === "__nyxPackets") {
      const safe = safeNyxPacketsPatch(patch[k]);
      if (safe) out.__nyxPackets = safe;
      continue;
    }

    const v = patch[k];
    if (v == null) continue;
    out[k] = String(v).trim();
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Escape regex special chars for boundary match.
 */
function reEscape(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Trigger match policy:
 * - Reserved triggers must match EXACTLY: "__fallback__", "__error__", "__ask_year__", etc.
 * - Normal triggers match on word boundaries (prevents substring hijack).
 */
function isReservedTrigger(trig) {
  const s = normText(trig);
  return s.startsWith("__") && s.endsWith("__") && s.length >= 6;
}

function matchTrigger(textLower, trig) {
  const t = normText(textLower);
  const s = normText(trig);

  if (!s) return false;

  // Reserved: exact match only
  if (isReservedTrigger(s)) return t === s;

  // Normal: boundary match
  const pattern = new RegExp(`(^|\\b)${reEscape(s)}(\\b|$)`, "i");
  return pattern.test(t);
}

/**
 * Deterministic template pick:
 * - if 1 template: return it
 * - else: idx = hash(text + salt) % len (stable)
 */
function pickTemplate(templates, textLower, salt) {
  const list = Array.isArray(templates) ? templates.filter((x) => typeof x === "string" && x.trim()) : [];
  if (!list.length) return "";
  if (list.length === 1) return String(list[0]);

  const key = `${String(textLower || "")}::${String(salt || "")}`;
  const idx = djb2Hash(key) % list.length;
  return String(list[idx] || "");
}

/* ======================================================
   Load + cache
====================================================== */

function readFileSafe(filepath) {
  try {
    const st = fs.statSync(filepath);
    if (!st.isFile()) return { ok: false, reason: "not_file" };
    if (st.size > MAX_FILE_BYTES) return { ok: false, reason: "too_large" };
    const raw = fs.readFileSync(filepath, "utf8");
    return { ok: true, raw, mtimeMs: Number(st.mtimeMs || 0) };
  } catch (e) {
    return { ok: false, reason: "read_fail", error: String(e && e.message ? e.message : e) };
  }
}

function loadPackets() {
  // hot-reload on file mtime change
  try {
    const st = fs.statSync(PACKETS_PATH);
    const mtimeMs = Number(st.mtimeMs || 0);
    if (CACHE && mtimeMs && mtimeMs === CACHE_MTIME_MS) return CACHE;
  } catch (_) {
    if (CACHE) return CACHE;
  }

  if (CACHE_ERR && !CACHE) return null;

  const rf = readFileSafe(PACKETS_PATH);
  if (!rf.ok) {
    CACHE_ERR = rf.reason || "read_fail";
    return CACHE || null;
  }

  try {
    const json = JSON.parse(rf.raw);

    if (!json || typeof json !== "object" || !Array.isArray(json.packets)) {
      CACHE_ERR = "bad_shape";
      return CACHE || null;
    }

    const safePackets = json.packets.filter((p) => p && typeof p === "object");
    CACHE = { packets: safePackets };
    CACHE_ERR = null;
    CACHE_MTIME_MS = rf.mtimeMs || 0;

    return CACHE;
  } catch (e) {
    CACHE_ERR = String(e && e.message ? e.message : e);
    return CACHE || null;
  }
}

/* ======================================================
   Packet intent gating
====================================================== */

function isAllowedPacketType(type) {
  const t = normText(type);

  // Support both your current packet types and older aliases.
  return (
    t === "greeting" ||
    t === "greet" ||
    t === "help" ||
    t === "goodbye" ||
    t === "bye" ||
    t === "fallback" ||
    t === "error" ||
    t === "prompt" ||
    t === "nav" ||
    t === "system"
  );
}

function allowPacketFire({ packet, matchedTrig }) {
  const trig = normText(matchedTrig);
  if (isReservedTrigger(trig)) return true;

  const type = normText(packet && packet.type);
  return isAllowedPacketType(type);
}

/**
 * chatEngine gate
 * - If session.allowPackets !== true, packets do not run (unless reserved trigger explicitly invoked).
 * - If a year exists in inbound OR session year context exists, do not run packets unless reserved trigger.
 */
function gateAllowsRun({ lowerText, session, matchedTrig }) {
  const reserved = isReservedTrigger(matchedTrig || "");

  // Reserved triggers are explicit invocations — always allowed.
  if (reserved) return true;

  // Must be explicitly enabled by chatEngine.
  const allow = !!(session && session.allowPackets === true);
  if (!allow) return false;

  // If a year is present, packets should not hijack music turns.
  const yText = extractYearFromText(lowerText);
  const ySess =
    clampYear(session && session.lastMusicYear) ||
    clampYear(session && session.cog && (session.cog.year || session.cog.lastMusicYear));

  if (yText || ySess) return false;

  return true;
}

/* ======================================================
   State selection (cold / warm / engaged)
====================================================== */

function getNyxState(session) {
  const s =
    normText(session && session.cog && session.cog.state) ||
    normText(session && session.cog && session.cog.phase) || // fallback (harmless)
    normText(session && session.state) ||
    "";

  if (s === "warm" || s === "engaged" || s === "cold") return s;
  return "cold";
}

function getYearVar(session, textLower) {
  // Prefer explicit inbound year (if present) for {year} substitution only.
  // Does NOT change gating (gating happens earlier).
  const yText = extractYearFromText(textLower);
  if (yText) return yText;

  const y1 = clampYear(session && session.lastMusicYear);
  if (y1) return y1;

  const y2 = clampYear(session && session.cog && session.cog.lastMusicYear);
  if (y2) return y2;

  const y3 = clampYear(session && session.cog && session.cog.year);
  if (y3) return y3;

  return null;
}

/* ======================================================
   oncePerSession support (persisted in session.__nyxPackets.once)
====================================================== */

function hasOnceFired(session, packetId) {
  if (!packetId) return false;
  const nyxPackets = session && session.__nyxPackets;
  const once = nyxPackets && nyxPackets.once;
  return !!(once && typeof once === "object" && once[packetId] === 1);
}

function buildOncePatch(session, packetId) {
  if (!packetId) return null;

  const out = Object.create(null);
  const nyxPackets = Object.create(null);
  const once = Object.create(null);

  // carry forward existing (bounded)
  const prev = session && session.__nyxPackets && session.__nyxPackets.once;
  if (prev && typeof prev === "object") {
    let count = 0;
    for (const k of Object.keys(prev)) {
      if (!k || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      once[String(k).trim()] = 1;
      count++;
      if (count >= MAX_ONCE_IDS) break;
    }
  }

  // set current
  once[String(packetId).trim()] = 1;

  nyxPackets.once = once;
  out.__nyxPackets = nyxPackets;
  return out;
}

/* ======================================================
   Public API
====================================================== */

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const data = loadPackets();
    if (!data) {
      return {
        reply: "",
        followUps: [],
        sessionPatch: null,
        meta: debug ? { ok: false, reason: "packets_unavailable", path: PACKETS_PATH, cacheErr: CACHE_ERR } : null,
      };
    }

    const packets = data.packets;
    const t = String(text || "").trim();
    const lower = normText(t);

    const state = getNyxState(session);
    const y = getYearVar(session, lower);
    const vars = { year: y ? String(y) : "" };

    // Find first matching packet in file order (deterministic)
    let chosen = null;
    let matchedTrig = null;

    for (const p of packets) {
      if (!p || !Array.isArray(p.trigger)) continue;

      // oncePerSession enforcement (only if packet requests it)
      const oncePerSession = !!(p.constraints && typeof p.constraints === "object" && p.constraints.oncePerSession === true);
      const pid = String(p.id || "").trim();
      if (oncePerSession && pid && hasOnceFired(session, pid)) continue;

      for (const trig of p.trigger) {
        if (matchTrigger(lower, trig)) {
          // 1) type/trigger guard
          if (!allowPacketFire({ packet: p, matchedTrig: trig })) break;

          // 2) chatEngine gate
          if (!gateAllowsRun({ lowerText: lower, session, matchedTrig: trig })) {
            break;
          }

          chosen = p;
          matchedTrig = trig;
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      return {
        reply: "",
        followUps: [],
        sessionPatch: null,
        meta: debug ? { ok: false, reason: "no_match_or_blocked", state } : null,
      };
    }

    // Prefer stateTemplates[state] when present; fallback to templates.
    let templatesToUse = chosen.templates;
    const st = chosen.stateTemplates;

    if (st && typeof st === "object") {
      const cand = st[state];
      if (Array.isArray(cand) && cand.length) templatesToUse = cand;
    }

    const tmpl = pickTemplate(templatesToUse, lower, `${chosen.id || ""}:${state}`);
    let reply = replaceVars(tmpl, vars).trim();

    if (reply.length > MAX_REPLY_LEN) reply = reply.slice(0, MAX_REPLY_LEN).trim();

    const followUps = safeFollowUps(chosen.chips);

    // sessionPatch:
    // - base patch from packet (sanitized)
    // - if oncePerSession, also persist the fired packet id under __nyxPackets.once
    const basePatch = safeSessionPatch(chosen.sessionPatch) || null;
    const oncePerSession = !!(chosen.constraints && typeof chosen.constraints === "object" && chosen.constraints.oncePerSession === true);
    const pid = String(chosen.id || "").trim();

    let mergedPatch = basePatch ? Object.assign(Object.create(null), basePatch) : null;

    if (oncePerSession && pid) {
      const oncePatch = buildOncePatch(session || {}, pid);
      if (oncePatch) {
        mergedPatch = mergedPatch ? Object.assign(mergedPatch, safeSessionPatch(oncePatch) || {}) : safeSessionPatch(oncePatch);
      }
    }

    return {
      reply,
      followUps,
      sessionPatch: mergedPatch,
      meta: debug
        ? {
            ok: true,
            packetId: chosen.id || null,
            packetType: chosen.type || null,
            packetLane: chosen.lane || null,
            matchedTrig: String(matchedTrig || ""),
            reservedTrig: isReservedTrigger(matchedTrig || ""),
            state,
            usedStateTemplates: !!(chosen.stateTemplates && chosen.stateTemplates[state]),
            gateAllowPackets: !!(session && session.allowPackets === true),
            blockedByYear: !!(
              extractYearFromText(lower) ||
              (session && (clampYear(session.lastMusicYear) || clampYear(session.cog && (session.cog.year || session.cog.lastMusicYear))))
            ),
            hasYearVar: !!y,
            path: PACKETS_PATH
          }
        : null,
    };
  } catch (e) {
    return {
      reply: "",
      followUps: [],
      sessionPatch: null,
      meta: debug
        ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e), path: PACKETS_PATH }
        : null,
    };
  }
}

module.exports = { handleChat };
