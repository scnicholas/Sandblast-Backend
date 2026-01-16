"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *  - returns { reply, followUps, sessionPatch, ... }
 *
 * v0.3 (CRITICAL PATCHSET)
 * ✅ Fixes "OPTIONS preflight" breakage driver by NEVER requiring client headers
 * ✅ Deterministic base reply remains source of truth
 * ✅ Robust parsing: top10/story/micro/#1 + year extraction
 * ✅ "another year" / "next year" session-aware (never asks year if already known unless explicitly "another year")
 * ✅ Optional Nyx polish via nyxOpenAI (never blocks; never throws; never changes session state)
 * ✅ SessionPatch allowlist + normalization (year/mode aliases supported)
 * ✅ Adds cog object (for avatar cognitive sync) while staying deterministic
 */

const { generateNyxReply } = require("./nyxOpenAI");

function clampYear(y) {
  if (!Number.isFinite(y)) return null;
  if (y < 1950 || y > 2024) return null;
  return y;
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

function normalizeMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  if (!m) return null;
  if (m === "top10" || m === "top 10" || m === "top ten" || m === "top") return "top10";
  if (m === "story" || m === "story moment" || m === "story_moment") return "story";
  if (m === "micro" || m === "micro moment" || m === "micro_moment") return "micro";
  if (m === "#1" || m === "number1" || m === "number 1" || m === "no.1" || m === "no 1") return "number1";
  return null;
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  return clampYear(Number(m[1]));
}

function classifyUserIntent(text) {
  const t = String(text || "").toLowerCase();

  // year-only
  if (/^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t)) {
    return { intent: "year_only", mode: null };
  }

  // navigation (check BEFORE mode, since phrases can overlap)
  if (/\banother\s*year\b/.test(t)) return { intent: "nav", nav: "another_year" };
  if (/\bnext\s*year\b/.test(t)) return { intent: "nav", nav: "next_year" };

  // mode phrases
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return { intent: "mode", mode: "top10" };
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return { intent: "mode", mode: "story" };
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return { intent: "mode", mode: "micro" };
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return { intent: "mode", mode: "number1" };

  return { intent: "general" };
}

function applySessionPatch(session, patch) {
  if (!session || !patch || typeof patch !== "object") return;

  // allowlist only
  const ALLOW = new Set(["lane", "lastMusicYear", "activeMusicMode", "voiceMode"]);

  for (const k of Object.keys(patch)) {
    if (!ALLOW.has(k)) continue;
    session[k] = patch[k];
  }

  // normalize common aliases if present
  if (Object.prototype.hasOwnProperty.call(patch, "year")) {
    const y = clampYear(Number(patch.year));
    if (y) session.lastMusicYear = y;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "mode")) {
    const m = normalizeMode(patch.mode);
    if (m) session.activeMusicMode = m;
  }
}

function baseForMode(mode, year) {
  if (!year) return "Tell me a year (1950–2024).";

  switch (mode) {
    case "story":
      return `Story moment (${year})`;
    case "micro":
      return `Micro moment (${year})`;
    case "number1":
      return `#1 song (${year})`;
    case "top10":
    default:
      return `Top 10 — Billboard Year-End Hot 100 (${year})`;
  }
}

function buildFollowUpsForYear(year) {
  if (!year) {
    return safeFollowUps([
      { label: "1988", send: "1988" },
      { label: "Top 10", send: "top 10" },
      { label: "Story moment", send: "story moment" },
      { label: "Micro moment", send: "micro moment" },
    ]);
  }

  return safeFollowUps([
    { label: `Top 10 ${year}`, send: `top 10 ${year}` },
    { label: `Story moment ${year}`, send: `story moment ${year}` },
    { label: `Micro moment ${year}`, send: `micro moment ${year}` },
    { label: `#1 ${year}`, send: `#1 ${year}` },
    { label: "Another year", send: "another year" },
    { label: "Next year", send: "next year" },
  ]);
}

/**
 * Deterministic cognition state (for avatar sync)
 * - Never uses OpenAI
 * - Derived purely from base decision + presence of year/mode
 */
function cogFromBase(base) {
  try {
    if (!base) return { phase: "idle", state: "idle", reason: "no_base", lane: "general", ts: Date.now() };

    const lane = base.lane || "general";
    const hasYear = !!base.year;
    const hasMode = !!base.mode;

    // Asking user to provide year => engaged_collect
    if (!hasYear && (base.baseMessage || "").toLowerCase().includes("tell me a year")) {
      return { phase: "engaged", state: "collect", reason: "need:year", lane, ts: Date.now() };
    }

    // Has year but unclear mode => deciding_ready (rare here, but safe)
    if (hasYear && !hasMode) {
      return { phase: "deciding", state: "ready", reason: "need:mode", lane, year: base.year, ts: Date.now() };
    }

    // Executing a mode for a year => guiding_confident
    if (hasYear && hasMode) {
      return { phase: "guiding", state: "confident", reason: "run:mode", lane, year: base.year, mode: base.mode, ts: Date.now() };
    }

    return { phase: "idle", state: "attentive", reason: "default", lane, ts: Date.now() };
  } catch {
    return { phase: "idle", state: "attentive", reason: "cog_error", lane: (base && base.lane) || "general", ts: Date.now() };
  }
}

function baseFallbackReply(text, session) {
  const cleanText = String(text || "").trim();
  const sYear = clampYear(Number(session && session.lastMusicYear));
  const sMode = normalizeMode(session && session.activeMusicMode) || "top10";

  const cls = classifyUserIntent(cleanText);
  const yFromText = extractYear(cleanText);

  // NAV: another/next year (session-aware)
  if (cls.intent === "nav" && sYear) {
    if (cls.nav === "next_year") {
      const next = clampYear(sYear + 1);
      if (next) {
        const patch = { lane: "music", lastMusicYear: next, activeMusicMode: sMode };
        return {
          lane: "music",
          year: next,
          mode: sMode,
          sessionPatch: patch,
          baseMessage: baseForMode(sMode, next),
          followUps: buildFollowUpsForYear(next),
        };
      }
    }

    // "another year" => ask year (but keep mode)
    return {
      lane: "music",
      year: null,
      mode: null,
      sessionPatch: { lane: "music", activeMusicMode: sMode },
      baseMessage: "Tell me a year (1950–2024).",
      followUps: buildFollowUpsForYear(null),
    };
  }

  // YEAR-ONLY
  if (cls.intent === "year_only") {
    const y = yFromText;
    if (y) {
      const patch = { lane: "music", lastMusicYear: y, activeMusicMode: sMode || "top10" };
      return {
        lane: "music",
        year: y,
        mode: patch.activeMusicMode,
        sessionPatch: patch,
        baseMessage: baseForMode(patch.activeMusicMode, y),
        followUps: buildFollowUpsForYear(y),
      };
    }
  }

  // MODE (optionally with year)
  if (cls.intent === "mode") {
    const mode = cls.mode || "top10";
    const year = yFromText || sYear || null;

    if (year) {
      const patch = { lane: "music", lastMusicYear: year, activeMusicMode: mode };
      return {
        lane: "music",
        year,
        mode,
        sessionPatch: patch,
        baseMessage: baseForMode(mode, year),
        followUps: buildFollowUpsForYear(year),
      };
    }

    // mode requested but no year known
    return {
      lane: "music",
      year: null,
      mode,
      sessionPatch: { lane: "music", activeMusicMode: mode },
      baseMessage: "Tell me a year (1950–2024).",
      followUps: buildFollowUpsForYear(null),
    };
  }

  // If user typed a year anywhere (but it wasn't year-only), still respect it
  if (yFromText) {
    const patch = { lane: "music", lastMusicYear: yFromText, activeMusicMode: sMode };
    return {
      lane: "music",
      year: yFromText,
      mode: sMode,
      sessionPatch: patch,
      baseMessage: baseForMode(sMode, yFromText),
      followUps: buildFollowUpsForYear(yFromText),
    };
  }

  // DEFAULT: If session already has a year, never ask again
  if (sYear) {
    return {
      lane: "music",
      year: sYear,
      mode: sMode,
      sessionPatch: null,
      baseMessage: `Locked in ${sYear}. Choose: “top 10 ${sYear}”, “story moment ${sYear}”, “micro moment ${sYear}”, or “#1 ${sYear}”.`,
      followUps: buildFollowUpsForYear(sYear),
    };
  }

  // Ask year (only when none exists)
  return {
    lane: "music",
    year: null,
    mode: null,
    sessionPatch: null,
    baseMessage: "Tell me a year (1950–2024).",
    followUps: buildFollowUpsForYear(null),
  };
}

/**
 * OpenAI polish guard:
 * - only attempt if nyxOpenAI is available AND baseMessage exists
 * - never alters session state
 * - never throws
 * - returns null on any failure
 */
async function tryNyxPolish({ domain, intent, userMessage, baseMessage, visitorId }) {
  try {
    if (!baseMessage) return null;

    const refined = await generateNyxReply({
      domain,
      intent,
      userMessage,
      baseMessage,
      boundaryContext: { role: "internal", actor: visitorId || "Guest" },
      timeoutMs: 9000,
    });

    if (typeof refined === "string" && refined.trim()) return refined.trim();
    return null;
  } catch {
    return null;
  }
}

async function handleChat({ text, session, visitorId, now, debug }) {
  const cleanText = String(text || "").trim();
  const s = session || {};

  // Deterministic base output (later: swap this with real lanes)
  const base = baseFallbackReply(cleanText, s);

  // Apply patch BEFORE polish so state stays correct even if OpenAI fails
  if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

  // Domain mapping (placeholder)
  const domain = base.lane === "music" ? "radio" : "general";
  const intent = base.mode || "general";

  // Deterministic cog for avatar sync
  const cog = cogFromBase(base);

  // Optional Nyx polish (never blocks; never throws)
  let reply = base.baseMessage;
  const polished = await tryNyxPolish({
    domain,
    intent,
    userMessage: cleanText,
    baseMessage: base.baseMessage,
    visitorId: visitorId || "Guest",
  });
  if (polished) reply = polished;

  const out = {
    ok: true,
    contractVersion: "1",
    lane: base.lane,
    year: base.year,
    mode: base.mode,
    voiceMode: s.voiceMode || "standard",
    reply,
    followUps: base.followUps,
    sessionPatch: base.sessionPatch || null,
    cog,
  };

  // Debug-only echo (never required by clients)
  if (debug) out.baseMessage = base.baseMessage;

  return out;
}

module.exports = { handleChat };
