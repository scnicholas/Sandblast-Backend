"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *  - returns { ok, reply, followUps, sessionPatch, cog, ... }
 *
 * v0.6d (GENERAL-FIRST + DEBUG PROBE + QUOTA HARDEN)
 * ✅ Default lane is GENERAL (prevents "hi" -> "tell me a year")
 * ✅ Packets (greeting/help/bye) get first right of refusal when lane is general
 * ✅ Music only engages when user explicitly asks year/mode or session is already music and user asks music-ish
 * ✅ OpenAI quota/billing failure never throws; polish auto-disables briefly
 * ✅ Debug always includes _engine when debug=1
 *
 * Preserves:
 * ✅ nyxOpenAI OPTIONAL (never bricks boot)
 * ✅ lanePolicy OPTIONAL (never bricks boot)
 * ✅ sponsorsLane/scheduleLane/moviesLane OPTIONAL (never bricks boot)
 * ✅ packets OPTIONAL (never bricks boot)
 * ✅ Packet interception with strict gating (no lane hijack)
 * ✅ Lane precedence BEFORE music parsing
 * ✅ Lane handlers invoked when present; otherwise deterministic stubs
 * ✅ Normalizes lane outputs: { reply, followUps, sessionPatch }
 * ✅ SessionPatch allowlist + normalization
 * ✅ Deterministic cog for avatar sync
 */

// OPTIONAL: nyxOpenAI
let generateNyxReply = null;
try {
  const mod = require("./nyxOpenAI");
  if (mod && typeof mod.generateNyxReply === "function") generateNyxReply = mod.generateNyxReply;
} catch (_) {
  generateNyxReply = null;
}

// OPTIONAL: lanePolicy
let resolveLane = null;
try {
  const lp = require("./lanePolicy");
  if (lp && typeof lp.resolveLane === "function") resolveLane = lp.resolveLane;
} catch (_) {
  resolveLane = null;
}

// OPTIONAL: lane handlers
let sponsorsLane = null;
let scheduleLane = null;
let moviesLane = null;

try { sponsorsLane = require("./sponsorsLane"); } catch (_) { sponsorsLane = null; }
try { scheduleLane = require("./scheduleLane"); } catch (_) { scheduleLane = null; }
try { moviesLane = require("./moviesLane"); } catch (_) { moviesLane = null; }

// OPTIONAL: packets selector
let packets = null;
try {
  packets = require("./packets"); // expects { handleChat }
  if (!packets || typeof packets.handleChat !== "function") packets = null;
} catch (_) {
  packets = null;
}

/* ======================================================
   Utilities
====================================================== */

function normCmd(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasExplicitYearOrModeAsk(text) {
  const t = normCmd(text);

  // explicit year
  if (/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/.test(t)) return true;

  // explicit music-mode ask (even without year)
  if (/\b(top\s*10|top10|top\s*ten|story\s*moment|micro\s*moment|#\s*1|number\s*1|no\.?\s*1|year\s*end|yearend)\b/.test(t))
    return true;

  // explicit navigation inside music context counts as "ask"
  if (/\b(next\s*year|another\s*year)\b/.test(t)) return true;

  return false;
}

function stripEchoFollowUps(followUps, userText) {
  const u = normCmd(userText);
  if (!Array.isArray(followUps) || !u) return followUps || [];
  return followUps.filter((it) => {
    const send = normCmd(it && it.send ? it.send : "");
    return !!send && send !== u;
  });
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return n;
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
  return clampYear(m[1]);
}

function classifyUserIntent(text) {
  const t = String(text || "").toLowerCase();

  if (/^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t)) {
    return { intent: "year_only", mode: null };
  }

  if (/\banother\s*year\b/.test(t)) return { intent: "nav", nav: "another_year" };
  if (/\bnext\s*year\b/.test(t)) return { intent: "nav", nav: "next_year" };

  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return { intent: "mode", mode: "top10" };
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return { intent: "mode", mode: "story" };
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return { intent: "mode", mode: "micro" };
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return { intent: "mode", mode: "number1" };

  return { intent: "general" };
}

/**
 * SessionPatch apply (safe allowlist)
 * - also supports patch.year / patch.mode aliases
 */
function applySessionPatch(session, patch) {
  if (!session || !patch || typeof patch !== "object") return;

  const ALLOW = new Set(["lane", "lastMusicYear", "activeMusicMode", "voiceMode"]);

  for (const k of Object.keys(patch)) {
    if (!ALLOW.has(k)) continue;
    session[k] = patch[k];
  }

  if (Object.prototype.hasOwnProperty.call(patch, "year")) {
    const y = clampYear(patch.year);
    if (y) session.lastMusicYear = y;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "mode")) {
    const m = normalizeMode(patch.mode);
    if (m) session.activeMusicMode = m;
  }
}

/* ======================================================
   Cog (deterministic)
====================================================== */

function cogFromBase(base) {
  try {
    if (!base) return { phase: "idle", state: "idle", reason: "no_base", lane: "general", ts: Date.now() };

    const lane = base.lane || "general";
    const hasYear = !!base.year;
    const hasMode = !!base.mode;

    if (!hasYear && String(base.baseMessage || "").toLowerCase().includes("tell me a year")) {
      return { phase: "engaged", state: "collect", reason: "need:year", lane, ts: Date.now() };
    }

    if (hasYear && !hasMode) {
      return { phase: "deciding", state: "ready", reason: "need:mode", lane, year: base.year, ts: Date.now() };
    }

    if (hasYear && hasMode) {
      return { phase: "guiding", state: "confident", reason: "run:mode", lane, year: base.year, mode: base.mode, ts: Date.now() };
    }

    return { phase: "idle", state: "attentive", reason: "default", lane, ts: Date.now() };
  } catch {
    return { phase: "idle", state: "attentive", reason: "cog_error", lane: (base && base.lane) || "general", ts: Date.now() };
  }
}

/* ======================================================
   Lane stubs (used only if lane handler missing/throws)
====================================================== */

function buildLaneStub(lane) {
  if (lane === "sponsors") {
    return {
      lane: "sponsors",
      year: null,
      mode: null,
      sessionPatch: { lane: "sponsors" },
      baseMessage: "Sponsors lane. What are we promoting — TV, radio, website, social, or a bundle?",
      followUps: safeFollowUps([
        { label: "TV", send: "tv" },
        { label: "Radio", send: "radio" },
        { label: "Website", send: "website" },
        { label: "Social", send: "social" },
        { label: "Bundle", send: "bundle" },
      ]),
    };
  }

  if (lane === "schedule") {
    return {
      lane: "schedule",
      year: null,
      mode: null,
      sessionPatch: { lane: "schedule" },
      baseMessage: "Schedule lane. Tell me your city (or the city you want converted to).",
      followUps: safeFollowUps([
        { label: "London", send: "in London" },
        { label: "Toronto", send: "in Toronto" },
        { label: "Playing now", send: "what’s playing now" },
        { label: "Today", send: "schedule today" },
      ]),
    };
  }

  if (lane === "movies") {
    return {
      lane: "movies",
      year: null,
      mode: null,
      sessionPatch: { lane: "movies" },
      baseMessage: "Movies/TV lane. Give me a title, a genre, or say “recommend something”.",
      followUps: safeFollowUps([
        { label: "Recommend something", send: "recommend something" },
        { label: "Classic TV", send: "classic tv" },
        { label: "Westerns", send: "westerns" },
        { label: "Detective", send: "detective" },
      ]),
    };
  }

  return {
    lane: "general",
    year: null,
    mode: null,
    sessionPatch: { lane: "general" },
    baseMessage: "Hi — I’m Nyx. Want music (pick a year 1950–2024), schedule, sponsors, or movies/TV?",
    followUps: safeFollowUps([
      { label: "Music (pick a year)", send: "1988" },
      { label: "Schedule", send: "schedule" },
      { label: "Sponsors", send: "sponsors" },
      { label: "Movies/TV", send: "movies" },
    ]),
  };
}

/* ======================================================
   Lane handler invoker (shape-normalizing)
====================================================== */

function normalizeLaneOutput(raw, lane) {
  const out = { reply: "", followUps: [], sessionPatch: null };
  if (!raw || typeof raw !== "object") return out;

  out.reply = String(raw.reply || raw.message || raw.text || "").trim();
  out.followUps = safeFollowUps(raw.followUps || raw.chips || []);
  out.sessionPatch = raw.sessionPatch && typeof raw.sessionPatch === "object" ? raw.sessionPatch : null;

  if (out.sessionPatch && typeof out.sessionPatch === "object") {
    if (!Object.prototype.hasOwnProperty.call(out.sessionPatch, "lane")) {
      out.sessionPatch = { ...out.sessionPatch, lane };
    }
  } else {
    out.sessionPatch = { lane };
  }

  return out;
}

async function callLaneHandler(lane, { text, session, visitorId, debug }) {
  const mod = lane === "sponsors" ? sponsorsLane : lane === "schedule" ? scheduleLane : lane === "movies" ? moviesLane : null;
  if (!mod) return { ok: false, reason: "missing_module" };

  const fn =
    (mod && typeof mod.handleChat === "function" && mod.handleChat) ||
    (typeof mod === "function" && mod) ||
    null;

  if (!fn) return { ok: false, reason: "missing_entrypoint" };

  try {
    const raw = await fn({ text, session, visitorId, debug });
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, reason: "handler_throw", error: String(e && e.message ? e.message : e) };
  }
}

/* ======================================================
   Music deterministic base
====================================================== */

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

function baseFallbackReply(text, session) {
  const cleanText = String(text || "").trim();
  const s = session || {};

  const sYear = clampYear(s.lastMusicYear);
  const sMode = normalizeMode(s.activeMusicMode) || "top10";

  const cls = classifyUserIntent(cleanText);
  const yFromText = extractYear(cleanText);

  const explicitAsk = hasExplicitYearOrModeAsk(cleanText);

  // NAV
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
          navComputedYear: next,
          navKind: "next_year",
        };
      }
    }

    return {
      lane: "music",
      year: null,
      mode: null,
      sessionPatch: { lane: "music", activeMusicMode: sMode },
      baseMessage: "Tell me a year (1950–2024).",
      followUps: buildFollowUpsForYear(null),
      navKind: "another_year",
    };
  }

  // YEAR ONLY
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

  // MODE (with/without year)
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

    return {
      lane: "music",
      year: null,
      mode,
      sessionPatch: { lane: "music", activeMusicMode: mode },
      baseMessage: "Tell me a year (1950–2024).",
      followUps: buildFollowUpsForYear(null),
    };
  }

  // Text contains a year anywhere -> explicit ask
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

  // 🔥 FIX #1: If session has a year but user did NOT explicitly ask for year/mode/nav,
  // do NOT announce "Locked in ####" and do NOT force the year into the reply.
  if (sYear && !explicitAsk) {
    return {
      lane: "music",
      year: null,
      mode: null,
      sessionPatch: null,
      baseMessage:
        "Tell me a year (1950–2024), or say “top 10 1988”, “story moment 1988”, “micro moment 1988”, or “#1 1988”.",
      followUps: buildFollowUpsForYear(null),
      silentSessionYear: sYear,
    };
  }

  // If user *did* explicitly ask for something music-related but gave no year,
  // we can gently offer continuing with stored year (without saying "Locked in").
  if (sYear && explicitAsk) {
    return {
      lane: "music",
      year: sYear,
      mode: sMode,
      sessionPatch: null,
      baseMessage: `Want to continue with ${sYear}? Say “top 10 ${sYear}”, “story moment ${sYear}”, “micro moment ${sYear}”, or “#1 ${sYear}”.`,
      followUps: buildFollowUpsForYear(sYear),
    };
  }

  return {
    lane: "music",
    year: null,
    mode: null,
    sessionPatch: null,
    baseMessage: "Tell me a year (1950–2024).",
    followUps: buildFollowUpsForYear(null),
  };
}

/* ======================================================
   Packets helpers
====================================================== */

function replaceVars(str, vars) {
  let out = String(str || "");
  if (!vars || typeof vars !== "object") return out;
  for (const k of Object.keys(vars)) {
    const v = String(vars[k]);
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

/**
 * Packet gating: packets should NOT hijack active lane flows.
 */
function allowPacketIntercept({ lane, session, text }) {
  const sLane = String((session && session.lane) || "").trim().toLowerCase();
  const t = String(text || "").trim().toLowerCase();

  const looksLikeGreet = /\b(hi|hello|hey|good\s*morning|good\s*afternoon|good\s*evening)\b/.test(t);
  const looksLikeHelp = /\b(help|options|menu|what can you do|capabilities)\b/.test(t);
  const looksLikeBye = /\b(bye|goodbye|good\s*night|goodnight|later|see you|i'?m done|thats all|that’s all)\b/.test(t);

  // Non-general active lane: allow only greet/help/bye
  if (sLane && sLane !== "general" && sLane !== "music") {
    return looksLikeGreet || looksLikeHelp || looksLikeBye;
  }

  // LanePolicy chose non-music lane: allow only greet/help/bye
  if (lane && lane !== "music" && lane !== "general") {
    return looksLikeGreet || looksLikeHelp || looksLikeBye;
  }

  return looksLikeGreet || looksLikeHelp || looksLikeBye;
}

/* ======================================================
   OpenAI polish (optional) + quota hardening
====================================================== */

const QUOTA_COOLDOWN_MS = Number(process.env.NYX_QUOTA_COOLDOWN_MS || 60_000);
let _quotaCooldownUntil = 0;

function quotaCooling(nowMs) {
  const now = Number(nowMs || Date.now());
  return now < _quotaCooldownUntil;
}

function markQuotaCooldown(nowMs) {
  const now = Number(nowMs || Date.now());
  _quotaCooldownUntil = Math.max(_quotaCooldownUntil, now + QUOTA_COOLDOWN_MS);
}

function isUpstreamQuotaError(e) {
  try {
    if (!e) return false;
    const code = String(e.code || (e.error && e.error.code) || "");
    const type = String(e.type || (e.error && e.error.type) || "");
    const status = Number(e.status || e.statusCode || (e.response && e.response.status) || NaN);

    const msg = String(e.message || (e.error && e.error.message) || "");
    const stack = String(e.stack || "");
    const raw = (code + " " + type + " " + msg + "\n" + stack).toLowerCase();

    if (code === "insufficient_quota" || type === "insufficient_quota") return true;
    if (Number.isFinite(status) && status === 429 && raw.includes("insufficient_quota")) return true;

    return (
      raw.includes("insufficient_quota") ||
      raw.includes("exceeded your current quota") ||
      raw.includes("plan and billing") ||
      raw.includes("billing details")
    );
  } catch (_) {
    return false;
  }
}

async function tryNyxPolish({ domain, intent, userMessage, baseMessage, visitorId }) {
  try {
    if (!baseMessage) return null;
    if (!generateNyxReply) return null;
    if (quotaCooling(Date.now())) return null;

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
  } catch (e) {
    if (isUpstreamQuotaError(e)) {
      markQuotaCooldown(Date.now());
      return null;
    }
    return null;
  }
}

/* ======================================================
   Public API
====================================================== */

async function handleChat({ text, session, visitorId, now, debug }) {
  const cleanText = String(text || "").trim();
  const s = session || {};
  const yKnown = clampYear(s.lastMusicYear);

  // Determine if user explicitly asked for music-year/mode/nav
  const explicitMusicAsk = hasExplicitYearOrModeAsk(cleanText);
  const hasStoredMusicContext = clampYear(s.lastMusicYear) && String(s.lane || "").toLowerCase() === "music";

  // 1) LANE POLICY FIRST (but default to GENERAL, not MUSIC)
  let laneDecision = null;
  try {
    if (resolveLane) laneDecision = resolveLane({ text: cleanText, session: s });
  } catch (_) {
    laneDecision = null;
  }

  // If lanePolicy yields something explicit, respect it.
  // Otherwise: general unless user explicitly asked music OR session is already music and user asks music-ish.
  let lane = String((laneDecision && laneDecision.lane) || s.lane || "general").trim() || "general";
  if (!laneDecision || !laneDecision.lane) {
    lane = explicitMusicAsk || hasStoredMusicContext ? "music" : "general";
  }

  // 2) PACKETS INTERCEPT (greeting/help/goodbye only, gated) — now works for "hi" reliably
  if (packets && allowPacketIntercept({ lane, session: s, text: cleanText })) {
    const p = await packets.handleChat({ text: cleanText, session: s, visitorId, debug: !!debug });
    const pReply = String(p && p.reply ? p.reply : "").trim();

    if (pReply) {
      if (p.sessionPatch) applySessionPatch(s, p.sessionPatch);

      const replyVar = replaceVars(pReply, { year: yKnown || "" });

      let followUps = safeFollowUps(p.followUps || []);
      followUps = stripEchoFollowUps(followUps, cleanText);

      let reply = replyVar;
      const polished = await tryNyxPolish({
        domain: "general",
        intent: "packet",
        userMessage: cleanText,
        baseMessage: replyVar,
        visitorId: visitorId || "Guest",
      });
      if (polished) reply = polished;

      const baseForCog = { lane: (s.lane || "general"), year: yKnown || null, mode: null, baseMessage: replyVar };
      const cog = cogFromBase(baseForCog);

      const out = {
        ok: true,
        contractVersion: "1",
        lane: s.lane || "general",
        year: yKnown || null,
        mode: s.activeMusicMode || null,
        voiceMode: s.voiceMode || "standard",
        reply,
        followUps,
        sessionPatch: p.sessionPatch || null,
        cog,
      };

      if (debug) {
        out.baseMessage = replyVar;
        out._engine = {
          version: "chatEngine v0.6d",
          usedPackets: true,
          hasPackets: true,
          hasLanePolicy: !!resolveLane,
          laneDecision: laneDecision || null,
          chosenLane: lane,
          explicitMusicAsk,
          hasStoredMusicContext: !!hasStoredMusicContext,
          hasNyxPolish: !!generateNyxReply,
          quotaCooling: quotaCooling(Date.now()),
          quotaCooldownMs: QUOTA_COOLDOWN_MS,
        };
      }

      return out;
    }
  }

  // 3) GENERAL lane: give a friendly menu (do NOT ask year on "hi")
  if (lane === "general") {
    const base = buildLaneStub("general");
    if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

    const cog = cogFromBase({ lane: "general", year: null, mode: null, baseMessage: base.baseMessage });

    let reply = base.baseMessage;
    const polished = await tryNyxPolish({
      domain: "general",
      intent: "general",
      userMessage: cleanText,
      baseMessage: base.baseMessage,
      visitorId: visitorId || "Guest",
    });
    if (polished) reply = polished;

    let followUps = base.followUps || [];
    followUps = stripEchoFollowUps(followUps, cleanText);

    const out = {
      ok: true,
      contractVersion: "1",
      lane: "general",
      year: null,
      mode: null,
      voiceMode: s.voiceMode || "standard",
      reply,
      followUps,
      sessionPatch: base.sessionPatch || null,
      cog,
    };

    if (debug) {
      out.baseMessage = base.baseMessage;
      out._engine = {
        version: "chatEngine v0.6d",
        usedPackets: false,
        hasPackets: !!packets,
        hasLanePolicy: !!resolveLane,
        laneDecision: laneDecision || null,
        chosenLane: "general",
        explicitMusicAsk,
        hasStoredMusicContext: !!hasStoredMusicContext,
        hasNyxPolish: !!generateNyxReply,
        quotaCooling: quotaCooling(Date.now()),
        quotaCooldownMs: QUOTA_COOLDOWN_MS,
      };
    }

    return out;
  }

  // 4) NON-MUSIC LANES: call real lane handler (fallback to stub)
  if (lane !== "music") {
    let base = null;

    const call = await callLaneHandler(lane, { text: cleanText, session: s, visitorId, debug });

    if (call.ok) {
      const norm = normalizeLaneOutput(call.raw, lane);
      base = norm.reply
        ? { lane, year: null, mode: null, sessionPatch: norm.sessionPatch, baseMessage: norm.reply, followUps: norm.followUps }
        : buildLaneStub(lane);
    } else {
      base = buildLaneStub(lane);
    }

    if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

    const cog = cogFromBase({ lane: base.lane, year: null, mode: null, baseMessage: base.baseMessage });

    let reply = base.baseMessage;
    const polished = await tryNyxPolish({
      domain: "general",
      intent: lane,
      userMessage: cleanText,
      baseMessage: base.baseMessage,
      visitorId: visitorId || "Guest",
    });
    if (polished) reply = polished;

    let followUps = base.followUps || [];
    followUps = stripEchoFollowUps(followUps, cleanText);

    const out = {
      ok: true,
      contractVersion: "1",
      lane: base.lane,
      year: null,
      mode: null,
      voiceMode: s.voiceMode || "standard",
      reply,
      followUps,
      sessionPatch: base.sessionPatch || null,
      cog,
    };

    if (debug) {
      out.baseMessage = base.baseMessage;
      out._engine = {
        version: "chatEngine v0.6d",
        usedPackets: false,
        hasPackets: !!packets,
        hasLanePolicy: !!resolveLane,
        laneDecision: laneDecision || null,
        chosenLane: lane,
        hasSponsorsLane: !!sponsorsLane,
        hasScheduleLane: !!scheduleLane,
        hasMoviesLane: !!moviesLane,
        laneCallOk: call.ok,
        laneCallFailReason: call.ok ? null : call.reason,
        hasNyxPolish: !!generateNyxReply,
        quotaCooling: quotaCooling(Date.now()),
        quotaCooldownMs: QUOTA_COOLDOWN_MS,
      };
    }

    return out;
  }

  // 5) MUSIC lane deterministic base
  const base = baseFallbackReply(cleanText, s);

  if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

  const domain = "radio";
  const intent = base.mode || "general";
  const cog = cogFromBase(base);

  let reply = base.baseMessage;

  // If music is asking for year AND packets exist, prefer phrasepack ask_year templates
  if (!base.year && packets) {
    const p = await packets.handleChat({ text: "music __ask_year__", session: s, visitorId, debug: !!debug });
    if (p && p.reply) reply = String(p.reply).trim() || reply;
  }

  const polished = await tryNyxPolish({
    domain,
    intent,
    userMessage: cleanText,
    baseMessage: reply,
    visitorId: visitorId || "Guest",
  });
  if (polished) reply = polished;

  let followUps = base.followUps || [];
  followUps = stripEchoFollowUps(followUps, cleanText);

  const out = {
    ok: true,
    contractVersion: "1",
    lane: base.lane,
    year: base.year,
    mode: base.mode,
    voiceMode: s.voiceMode || "standard",
    reply,
    followUps,
    sessionPatch: base.sessionPatch || null,
    cog,
  };

  if (debug) {
    out.baseMessage = reply;
    out._engine = {
      version: "chatEngine v0.6d",
      hasPackets: !!packets,
      hasNyxPolish: !!generateNyxReply,
      hasLanePolicy: !!resolveLane,
      laneDecision: laneDecision || null,
      chosenLane: "music",
      explicitMusicAsk,
      hasStoredMusicContext: !!hasStoredMusicContext,
      quotaCooling: quotaCooling(Date.now()),
      quotaCooldownMs: QUOTA_COOLDOWN_MS,
    };
  }

  return out;
}

module.exports = { handleChat };
