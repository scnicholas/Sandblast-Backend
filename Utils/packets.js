"use strict";

/**
 * Utils/packets.js
 *
 * Deterministic packet selector + renderer.
 * Reads Data/nyx/packets_v1.json and returns:
 *   { reply, followUps, sessionPatch, meta }
 *
 * v1.1c (BULLETPROOF + CHATENGINE GATE: NO HIJACK)
 *
 * HARDENING / FIXES:
 * ✅ Never throws, never bricks boot (all-guards + safe fallbacks)
 * ✅ Safe file path (no cwd surprises) + optional env override
 * ✅ Cache with mtime revalidation (no stale dev edits)
 * ✅ Trigger matching is STRICT + bounded:
 *    - reserved triggers only match exact
 *    - normal triggers must match whole word/phrase boundary (prevents "hi" matching "this")
 * ✅ Anti-hijack guardrails:
 *    - packets are meant for greet/help/bye + explicit "__ask_year__" style calls
 *    - can be forced ONLY via reserved triggers; otherwise requires stable-safe trigger hit
 * ✅ NEW: CHATENGINE GATE:
 *    - packets only run when session.allowPackets===true
 *    - reserved triggers ALWAYS allowed (explicit invocation)
 *    - if a year exists, packets do not fire unless reserved trigger
 * ✅ Prototype-pollution safe sessionPatch allowlist + deep-copy
 * ✅ FollowUps sanitized (length caps, max count, dedupe, no weird objects)
 * ✅ Template selection deterministic and safe (caps, type checks)
 *
 * Template vars:
 *  - {year} supported (if session.lastMusicYear present)
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
const ALLOWED_PATCH_KEYS = new Set(["lane", "lastMusicYear", "activeMusicMode", "voiceMode", "lastIntentSig"]);

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
  return n;
}

function extractYearFromText(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1950 || y > 2024) return null;
  return y;
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
 * - else: idx = hash(text) % len (stable)
 */
function pickTemplate(templates, textLower) {
  const list = Array.isArray(templates) ? templates.filter((x) => typeof x === "string" && x.trim()) : [];
  if (!list.length) return "";
  if (list.length === 1) return String(list[0]);

  const idx = djb2Hash(textLower) % list.length;
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
  return t === "greet" || t === "help" || t === "bye" || t === "system" || t === "prompt";
}

function allowPacketFire({ packet, matchedTrig }) {
  const trig = normText(matchedTrig);
  if (isReservedTrigger(trig)) return true;

  const type = normText(packet && packet.type);
  return isAllowedPacketType(type);
}

/**
 * NEW: chatEngine gate
 * - If session.allowPackets !== true, packets do not run (unless reserved trigger was explicitly invoked).
 * - If a year exists in the inbound text OR session.lastMusicYear, do not run packets unless reserved trigger.
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
  const ySess = clampYear(session && session.lastMusicYear);
  if (yText || ySess) return false;

  return true;
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

    // Prefer explicit year, but support template var {year} using session lastMusicYear only (as designed)
    const y = clampYear(session && session.lastMusicYear);
    const vars = { year: y ? String(y) : "" };

    // Find first matching packet in file order (deterministic)
    let chosen = null;
    let matchedTrig = null;

    for (const p of packets) {
      if (!p || !Array.isArray(p.trigger)) continue;

      for (const trig of p.trigger) {
        if (matchTrigger(lower, trig)) {
          // 1) type/trigger guard
          if (!allowPacketFire({ packet: p, matchedTrig: trig })) break;

          // 2) NEW: chatEngine gate
          if (!gateAllowsRun({ lowerText: lower, session, matchedTrig: trig })) {
            // If blocked, treat as no match and continue scanning
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
        meta: debug ? { ok: false, reason: "no_match_or_blocked" } : null,
      };
    }

    const tmpl = pickTemplate(chosen.templates, lower);
    let reply = replaceVars(tmpl, vars).trim();

    if (reply.length > MAX_REPLY_LEN) reply = reply.slice(0, MAX_REPLY_LEN).trim();

    const followUps = safeFollowUps(chosen.chips);
    const sessionPatch = safeSessionPatch(chosen.sessionPatch);

    return {
      reply,
      followUps,
      sessionPatch,
      meta: debug
        ? {
            ok: true,
            packetId: chosen.id || null,
            packetType: chosen.type || null,
            packetLane: chosen.lane || null,
            matchedTrig: String(matchedTrig || ""),
            reservedTrig: isReservedTrigger(matchedTrig || ""),
            gateAllowPackets: !!(session && session.allowPackets === true),
            blockedByYear: !!(extractYearFromText(lower) || (session && clampYear(session.lastMusicYear))),
            hasYearVar: !!y,
            path: PACKETS_PATH,
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
