"use strict";

/**
 * Utils/packets.js
 *
 * Deterministic packet selector + renderer.
 * Reads Data/nyx/packets_v1.json and returns:
 *   { reply, followUps, sessionPatch, meta }
 *
 * v1.1b (BULLETPROOF: SAFE LOAD + STRICT MATCH + NO HIJACK + TEMPLATE HARDEN + CHIP SANITIZE)
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
  // convert to unsigned
  return h >>> 0;
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

    // Keep strings only for lane/mode/voiceMode/lastIntentSig
    const v = patch[k];
    if (v == null) continue;
    out[k] = String(v).trim();
  }

  // empty?
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
 *   Example: trigger "hi" should match "hi", "hi there" but NOT "this".
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
  // This catches:
  //  - "good morning" inside "good morning mac"
  //  - "help" inside "can you help?"
  // and avoids "hi" inside "this".
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
    // stat fail -> rely on cache if any
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

    // sanitize minimally: ensure packets list is objects
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

/**
 * Only these packet types are allowed to match freely.
 * Anything else must be invoked via reserved triggers (explicit call).
 *
 * This prevents someone accidentally adding a trigger that hijacks whole flows.
 */
function isAllowedPacketType(type) {
  const t = normText(type);
  return t === "greet" || t === "help" || t === "bye" || t === "system" || t === "prompt";
}

/**
 * Decide if a matched packet is allowed to fire.
 * - Reserved triggers are always allowed (explicit call).
 * - Non-reserved triggers only allowed for safe types.
 */
function allowPacketFire({ packet, matchedTrig }) {
  const trig = normText(matchedTrig);
  if (isReservedTrigger(trig)) return true;

  const type = normText(packet && packet.type);
  return isAllowedPacketType(type);
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

    const y = clampYear(session && session.lastMusicYear);
    const vars = { year: y ? String(y) : "" };

    // Find first matching packet in file order (deterministic)
    let chosen = null;
    let matchedTrig = null;

    for (const p of packets) {
      if (!p || !Array.isArray(p.trigger)) continue;

      for (const trig of p.trigger) {
        if (matchTrigger(lower, trig)) {
          // gate it (prevents hijack from unsafe packet types)
          if (allowPacketFire({ packet: p, matchedTrig: trig })) {
            chosen = p;
            matchedTrig = trig;
          }
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      return { reply: "", followUps: [], sessionPatch: null, meta: debug ? { ok: false, reason: "no_match" } : null };
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
            hasYear: !!y,
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
