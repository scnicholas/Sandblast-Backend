"use strict";

/**
 * Utils/packets.js
 *
 * Deterministic packet selector + renderer.
 * Reads Data/nyx/packets_v1.json and returns:
 *   { reply, followUps, sessionPatch, meta }
 *
 * Design goals:
 *  - Deterministic: no randomness that can drift across runs
 *  - Safe: never throws; never bricks boot
 *  - Minimal: selector is lightweight; chatEngine remains boss
 *
 * Selection:
 *  - If text matches any packet.trigger -> choose the FIRST packet in file order (stable)
 *  - "__fallback__" only used if caller requests it explicitly
 *  - "__error__" only used if caller requests it explicitly
 *
 * Template vars:
 *  - {year} supported (if session.lastMusicYear present)
 */

const fs = require("fs");
const path = require("path");

const PACKETS_PATH = path.join(process.cwd(), "Data", "nyx", "packets_v1.json");

let CACHE = null;
let CACHE_ERR = null;

function loadPackets() {
  if (CACHE) return CACHE;
  if (CACHE_ERR) return null;

  try {
    const raw = fs.readFileSync(PACKETS_PATH, "utf8");
    const json = JSON.parse(raw);

    if (!json || !Array.isArray(json.packets)) {
      CACHE_ERR = "bad_shape";
      return null;
    }

    CACHE = json;
    return CACHE;
  } catch (e) {
    CACHE_ERR = String(e && e.message ? e.message : e);
    return null;
  }
}

function safeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const label = String(it && it.label ? it.label : "").trim();
    const send = String(it && it.send ? it.send : "").trim();
    if (!label || !send) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
  }
  return out;
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

function normText(t) {
  return String(t || "").trim().toLowerCase();
}

function matchTrigger(text, trig) {
  const t = normText(text);
  const s = normText(trig);

  // reserved triggers
  if (s === "__fallback__" || s === "__error__") return t === s;

  // phrase contains trigger (simple, stable)
  if (!s) return false;
  return t.includes(s);
}

/**
 * Deterministic pick:
 * - stable order based on file order
 * - stable choice among templates: pick index = hash(text) % templates.length
 */
function djb2Hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickTemplate(templates, text) {
  const list = Array.isArray(templates) ? templates.filter(Boolean) : [];
  if (!list.length) return "";
  if (list.length === 1) return String(list[0]);

  const idx = djb2Hash(normText(text)) % list.length;
  return String(list[idx]);
}

/**
 * Public API
 */
async function handleChat({ text, session, visitorId, debug }) {
  try {
    const data = loadPackets();
    if (!data) {
      return { reply: "", followUps: [], sessionPatch: null, meta: debug ? { ok: false, reason: "packets_unavailable" } : null };
    }

    const packets = data.packets;
    const t = String(text || "").trim();
    const lower = normText(t);

    const y = clampYear(session && session.lastMusicYear);
    const vars = { year: y ? String(y) : "" };

    // Find first matching packet in file order (deterministic)
    let chosen = null;
    for (const p of packets) {
      if (!p || !Array.isArray(p.trigger)) continue;

      let hit = false;
      for (const trig of p.trigger) {
        if (matchTrigger(lower, trig)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        chosen = p;
        break;
      }
    }

    if (!chosen) {
      return { reply: "", followUps: [], sessionPatch: null, meta: debug ? { ok: false, reason: "no_match" } : null };
    }

    const tmpl = pickTemplate(chosen.templates, lower);
    const reply = replaceVars(tmpl, vars).trim();

    return {
      reply,
      followUps: safeFollowUps(chosen.chips),
      sessionPatch: chosen.sessionPatch && typeof chosen.sessionPatch === "object" ? chosen.sessionPatch : null,
      meta: debug
        ? { ok: true, packetId: chosen.id, packetType: chosen.type, packetLane: chosen.lane, hasYear: !!y }
        : null,
    };
  } catch (e) {
    return { reply: "", followUps: [], sessionPatch: null, meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null };
  }
}

module.exports = { handleChat };
