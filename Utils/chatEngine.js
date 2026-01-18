"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *  - returns { ok, reply, followUps, sessionPatch, cog, ... }
 *
 * v0.6f (BULLETPROOF: MODE FIX + LOOP-DAMP v2 + LANE OVERRIDE GUARD + YEAR-END SPLIT)
 *
 * FIXES / HARDENING:
 * ✅ Conversational-first UX:
 *    - Greetings/help/bye never route into music prompts unless user explicitly asked music
 *
 * ✅ Music mode pinning:
 *    - top10 != top100
 *    - top10 is "Top 10" (NOT Year-End Hot 100)
 *    - top100 is explicitly "Billboard Year-End Hot 100"
 *    - Never enters top100 unless user explicitly asks top 100 / hot 100 / year-end hot 100
 *
 * ✅ Loop dampeners:
 *    - Per-session recentSig window to suppress repeated same mode+year prompts in tight loops
 *    - Does NOT poison state by writing sig for suppressed turns
 *
 * ✅ Sanitization:
 *    - followUps validated/capped
 *    - sessionPatch allowlist + proto-safe
 */

let generateNyxReply = null;
try {
  const mod = require("./nyxOpenAI");
  if (mod && typeof mod.generateNyxReply === "function") generateNyxReply = mod.generateNyxReply;
} catch (_) {
  generateNyxReply = null;
}

let resolveLane = null;
try {
  const lp = require("./lanePolicy");
  if (lp && typeof lp.resolveLane === "function") resolveLane = lp.resolveLane;
} catch (_) {
  resolveLane = null;
}

let sponsorsLane = null;
let scheduleLane = null;
let moviesLane = null;
try { sponsorsLane = require("./sponsorsLane"); } catch (_) { sponsorsLane = null; }
try { scheduleLane = require("./scheduleLane"); } catch (_) { scheduleLane = null; }
try { moviesLane = require("./moviesLane"); } catch (_) { moviesLane = null; }

let packets = null;
try {
  packets = require("./packets");
  if (!packets || typeof packets.handleChat !== "function") packets = null;
} catch (_) {
  packets = null;
}

/* =========================
   Utilities
========================= */

function normCmd(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2024) return null;
  return n;
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

function normalizeMode(mode) {
  const m = normCmd(mode);
  if (!m) return null;

  if (m === "top10" || m === "top 10" || m === "top ten" || m === "top") return "top10";
  if (m === "top100" || m === "top 100" || m === "hot 100" || m === "year-end hot 100" || m === "year end hot 100")
    return "top100";

  if (m === "story" || m === "story moment" || m === "story_moment") return "story";
  if (m === "micro" || m === "micro moment" || m === "micro_moment") return "micro";
  if (m === "#1" || m === "number1" || m === "number 1" || m === "no.1" || m === "no 1") return "number1";

  return null;
}

function isGreetingLike(text) {
  const t = normCmd(text);
  return /\b(hi|hello|hey|yo|good morning|good afternoon|good evening|howdy)\b/.test(t);
}
function isHelpLike(text) {
  const t = normCmd(text);
  return /\b(help|options|menu|what can you do|capabilities|commands)\b/.test(t);
}
function isByeLike(text) {
  const t = normCmd(text);
  return /\b(bye|goodbye|good night|goodnight|later|see you|i'?m done|thats all|that’s all)\b/.test(t);
}

function explicitTop100Ask(text) {
  const t = normCmd(text);
  return /\b(top\s*100|top100|hot\s*100|billboard\s*top\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t);
}

function hasExplicitYearOrModeAsk(text) {
  const t = normCmd(text);
  if (/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/.test(t)) return true;

  if (/\b(top\s*10|top10|top\s*ten|story\s*moment|micro\s*moment|#\s*1|number\s*1|no\.?\s*1|no\s*1)\b/.test(t)) return true;

  if (explicitTop100Ask(t)) return true;
  if (/\b(next\s*year|another\s*year)\b/.test(t)) return true;

  // year-end keyword alone counts as music ask (but still doesn't imply top100)
  if (/\b(year\s*end|yearend|year-end)\b/.test(t)) return true;

  return false;
}

function classifyUserIntent(text) {
  const t = normCmd(text);

  if (/^\s*(19[5-9]\d|20[0-1]\d|202[0-4])\s*$/.test(t)) return { intent: "year_only" };

  if (/\banother\s*year\b/.test(t)) return { intent: "nav", nav: "another_year" };
  if (/\bnext\s*year\b/.test(t)) return { intent: "nav", nav: "next_year" };

  if (explicitTop100Ask(t)) return { intent: "mode", mode: "top100" };

  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return { intent: "mode", mode: "top10" };
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return { intent: "mode", mode: "story" };
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return { intent: "mode", mode: "micro" };
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return { intent: "mode", mode: "number1" };

  return { intent: "general" };
}

function stripEchoFollowUps(followUps, userText) {
  const u = normCmd(userText);
  if (!Array.isArray(followUps) || !u) return followUps || [];
  return followUps.filter((it) => {
    const send = normCmd(it && it.send ? it.send : "");
    return !!send && send !== u;
  });
}

function safeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const label = String(it && it.label ? it.label : "").trim();
    const send = String(it && it.send ? it.send : "").trim();
    if (!label || !send) continue;
    if (label.length > 48 || send.length > 80) continue;
    const k = send.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label, send });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * SessionPatch apply (allowlist + proto safe)
 */
function applySessionPatch(session, patch) {
  if (!session || !patch || typeof patch !== "object") return;

  const ALLOW = new Set(["lane", "lastMusicYear", "activeMusicMode", "voiceMode", "lastIntentSig", "lastIntentAt"]);
  for (const k of Object.keys(patch)) {
    if (!ALLOW.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
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

/* =========================
   Cog (deterministic)
========================= */

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

/* =========================
   Lane stubs
========================= */

function buildLaneStub(lane) {
  if (lane === "sponsors") {
    return {
      lane: "sponsors",
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
      sessionPatch: { lane: "movies" },
      baseMessage: "Movies/TV lane. Give me a title, a genre, or say “recommend something”.",
      followUps: safeFollowUps([
        { label: "Recommend", send: "recommend something" },
        { label: "Classic TV", send: "classic tv" },
        { label: "Westerns", send: "westerns" },
        { label: "Detective", send: "detective" },
      ]),
    };
  }
  return {
    lane: "general",
    sessionPatch: { lane: "general" },
    baseMessage: "Hi — I’m Nyx. Want music (pick a year 1950–2024), schedule, sponsors, or movies/TV?",
    followUps: safeFollowUps([
      { label: "Pick a year", send: "1988" },
      { label: "Top 10", send: "top 10 1988" },
      { label: "Schedule", send: "schedule" },
      { label: "Sponsors", send: "sponsors" },
      { label: "Movies/TV", send: "movies" },
    ]),
  };
}

/* =========================
   Lane handler invoker
========================= */

function normalizeLaneOutput(raw, lane) {
  const out = { reply: "", followUps: [], sessionPatch: null };
  if (!raw || typeof raw !== "object") return out;

  out.reply = String(raw.reply || raw.message || raw.text || "").trim();
  out.followUps = safeFollowUps(raw.followUps || raw.chips || []);
  out.sessionPatch = raw.sessionPatch && typeof raw.sessionPatch === "object" ? raw.sessionPatch : null;

  if (!out.sessionPatch) out.sessionPatch = { lane };
  else if (!Object.prototype.hasOwnProperty.call(out.sessionPatch, "lane")) out.sessionPatch = { ...out.sessionPatch, lane };

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

/* =========================
   Music deterministic base
========================= */

function baseForMode(mode, year) {
  if (!year) return "Tell me a year (1950–2024).";

  switch (mode) {
    case "story":
      return `Story moment (${year})`;
    case "micro":
      return `Micro moment (${year})`;
    case "number1":
      return `#1 song (${year})`;
    case "top100":
      return `Billboard Year-End Hot 100 (${year})`;
    case "top10":
    default:
      // ✅ FIX: top10 must NOT say Year-End Hot 100
      return `Top 10 (${year})`;
  }
}

function buildFollowUpsForYear(year) {
  if (!year) {
    return safeFollowUps([
      { label: "1988", send: "1988" },
      { label: "Top 10", send: "top 10 1988" },
      { label: "Story", send: "story moment 1988" },
      { label: "Micro", send: "micro moment 1988" },
      { label: "#1", send: "#1 1988" },
    ]);
  }

  return safeFollowUps([
    { label: `Top 10 ${year}`, send: `top 10 ${year}` },
    { label: `Story ${year}`, send: `story moment ${year}` },
    { label: `Micro ${year}`, send: `micro moment ${year}` },
    { label: `#1 ${year}`, send: `#1 ${year}` },
    { label: `Top 100 ${year}`, send: `top 100 ${year}` }, // explicit available
    { label: "Another year", send: "another year" },
    { label: "Next year", send: "next year" },
  ]);
}

function makeIntentSig(lane, mode, year) {
  return `${String(lane || "general")}::${String(mode || "")}::${String(year || "")}`;
}

function baseFallbackReply(text, session) {
  const cleanText = String(text || "").trim();
  const s = session || {};

  const sYear = clampYear(s.lastMusicYear);
  const sMode = normalizeMode(s.activeMusicMode) || "top10";

  const cls = classifyUserIntent(cleanText);
  const yFromText = extractYear(cleanText);
  const explicitAsk = hasExplicitYearOrModeAsk(cleanText);
  const wantsTop100 = explicitTop100Ask(cleanText);

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
    };
  }

  // YEAR ONLY
  if (cls.intent === "year_only") {
    const y = yFromText;
    if (y) {
      const mode = wantsTop100 ? "top100" : sMode;
      const patch = { lane: "music", lastMusicYear: y, activeMusicMode: mode };
      return { lane: "music", year: y, mode, sessionPatch: patch, baseMessage: baseForMode(mode, y), followUps: buildFollowUpsForYear(y) };
    }
  }

  // MODE
  if (cls.intent === "mode") {
    const requested = normalizeMode(cls.mode) || "top10";
    const mode = requested === "top100" ? (wantsTop100 ? "top100" : "top10") : requested;

    const year = yFromText || sYear || null;
    if (year) {
      const patch = { lane: "music", lastMusicYear: year, activeMusicMode: mode };
      return { lane: "music", year, mode, sessionPatch: patch, baseMessage: baseForMode(mode, year), followUps: buildFollowUpsForYear(year) };
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

  // Year mentioned
  if (yFromText) {
    const mode = wantsTop100 ? "top100" : sMode;
    const patch = { lane: "music", lastMusicYear: yFromText, activeMusicMode: mode };
    return { lane: "music", year: yFromText, mode, sessionPatch: patch, baseMessage: baseForMode(mode, yFromText), followUps: buildFollowUpsForYear(yFromText) };
  }

  // Stored year but no explicit ask → don't force it
  if (sYear && !explicitAsk) {
    return {
      lane: "music",
      year: null,
      mode: null,
      sessionPatch: null,
      baseMessage: "Tell me a year (1950–2024), or say “top 10 1988”, “story moment 1988”, “micro moment 1988”, or “#1 1988”.",
      followUps: buildFollowUpsForYear(null),
    };
  }

  // Explicit ask but no year
  if (sYear && explicitAsk) {
    const mode = wantsTop100 ? "top100" : sMode;
    return {
      lane: "music",
      year: sYear,
      mode,
      sessionPatch: null,
      baseMessage: `Want to continue with ${sYear}? Say “top 10 ${sYear}”, “story moment ${sYear}”, “micro moment ${sYear}”, or “#1 ${sYear}”.`,
      followUps: buildFollowUpsForYear(sYear),
    };
  }

  return { lane: "music", year: null, mode: null, sessionPatch: null, baseMessage: "Tell me a year (1950–2024).", followUps: buildFollowUpsForYear(null) };
}

/* =========================
   Packets helpers
========================= */

function replaceVars(str, vars) {
  let out = String(str || "");
  if (!vars || typeof vars !== "object") return out;
  for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

function allowPacketIntercept({ lane, session, text }) {
  const sLane = String((session && session.lane) || "").trim().toLowerCase();
  const t = normCmd(text);
  const looks = isGreetingLike(t) || isHelpLike(t) || isByeLike(t);

  if (sLane && sLane !== "general" && sLane !== "music") return looks;
  if (lane && lane !== "music" && lane !== "general") return looks;
  return looks;
}

/* =========================
   OpenAI polish (optional)
========================= */

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

    return raw.includes("insufficient_quota") || raw.includes("exceeded your current quota") || raw.includes("plan and billing") || raw.includes("billing details");
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

/* =========================
   Public API
========================= */

async function handleChat({ text, session, visitorId, now, debug }) {
  const cleanText = String(text || "").trim();
  const s = session || {};
  const yKnown = clampYear(s.lastMusicYear);
  const sessionLane = String(s.lane || "").toLowerCase();
  const cls = classifyUserIntent(cleanText);

  const explicitMusicAsk = hasExplicitYearOrModeAsk(cleanText);
  const isMusicish =
    cls.intent === "year_only" || cls.intent === "mode" || cls.intent === "nav" || /\b(billboard|hot 100|top 10|top 100)\b/.test(normCmd(cleanText));

  const hasStoredMusicContext = !!yKnown && sessionLane === "music";

  // 1) lanePolicy (guard greetings)
  let laneDecision = null;
  try {
    if (resolveLane) laneDecision = resolveLane({ text: cleanText, session: s });
  } catch (_) {
    laneDecision = null;
  }

  let lane = "";
  const lpLane = laneDecision && laneDecision.lane ? String(laneDecision.lane).trim().toLowerCase() : "";

  // Only allow lanePolicy to override greet/help/bye if it explicitly sets force:true
  const lpForce = !!(laneDecision && laneDecision.force === true);

  if (lpLane && (lpForce || (!isGreetingLike(cleanText) && !isHelpLike(cleanText) && !isByeLike(cleanText)))) {
    lane = lpLane;
  } else {
    if (isGreetingLike(cleanText) || isHelpLike(cleanText) || isByeLike(cleanText)) lane = "general";
    else lane = explicitMusicAsk || (hasStoredMusicContext && isMusicish) ? "music" : "general";
  }

  // 2) packets
  if (packets && allowPacketIntercept({ lane, session: s, text: cleanText })) {
    const p = await packets.handleChat({ text: cleanText, session: s, visitorId, debug: !!debug });
    const pReply = String(p && p.reply ? p.reply : "").trim();

    if (pReply) {
      if (p.sessionPatch) applySessionPatch(s, p.sessionPatch);

      const replyVar = replaceVars(pReply, { year: yKnown || "" });

      let followUps = safeFollowUps(p.followUps || []);
      followUps = stripEchoFollowUps(followUps, cleanText);

      let reply = replyVar;
      const polished = await tryNyxPolish({ domain: "general", intent: "packet", userMessage: cleanText, baseMessage: replyVar, visitorId: visitorId || "Guest" });
      if (polished) reply = polished;

      const cog = cogFromBase({ lane: s.lane || "general", year: yKnown || null, mode: null, baseMessage: replyVar });

      const out = { ok: true, contractVersion: "1", lane: s.lane || "general", year: yKnown || null, mode: s.activeMusicMode || null, voiceMode: s.voiceMode || "standard", reply, followUps, sessionPatch: p.sessionPatch || null, cog };

      if (debug) {
        out.baseMessage = replyVar;
        out._engine = { version: "chatEngine v0.6f", usedPackets: true, hasLanePolicy: !!resolveLane, laneDecision: laneDecision || null, chosenLane: lane, explicitMusicAsk, hasStoredMusicContext, isMusicish, hasNyxPolish: !!generateNyxReply, quotaCooling: quotaCooling(Date.now()) };
      }
      return out;
    }
  }

  // 3) general
  if (lane === "general") {
    const base = buildLaneStub("general");
    if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

    const cog = cogFromBase({ lane: "general", year: null, mode: null, baseMessage: base.baseMessage });

    let reply = base.baseMessage;
    const polished = await tryNyxPolish({ domain: "general", intent: "general", userMessage: cleanText, baseMessage: base.baseMessage, visitorId: visitorId || "Guest" });
    if (polished) reply = polished;

    let followUps = stripEchoFollowUps(base.followUps || [], cleanText);

    const out = { ok: true, contractVersion: "1", lane: "general", year: null, mode: null, voiceMode: s.voiceMode || "standard", reply, followUps, sessionPatch: base.sessionPatch || null, cog };

    if (debug) {
      out.baseMessage = base.baseMessage;
      out._engine = { version: "chatEngine v0.6f", usedPackets: false, hasLanePolicy: !!resolveLane, laneDecision: laneDecision || null, chosenLane: "general", explicitMusicAsk, hasStoredMusicContext, isMusicish, hasNyxPolish: !!generateNyxReply };
    }
    return out;
  }

  // 4) non-music lanes
  if (lane !== "music") {
    let base = null;
    const call = await callLaneHandler(lane, { text: cleanText, session: s, visitorId, debug });

    if (call.ok) {
      const norm = normalizeLaneOutput(call.raw, lane);
      base = norm.reply ? { lane, sessionPatch: norm.sessionPatch, baseMessage: norm.reply, followUps: norm.followUps } : buildLaneStub(lane);
    } else {
      base = buildLaneStub(lane);
    }

    if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

    const cog = cogFromBase({ lane: base.lane, year: null, mode: null, baseMessage: base.baseMessage });

    let reply = base.baseMessage;
    const polished = await tryNyxPolish({ domain: "general", intent: lane, userMessage: cleanText, baseMessage: base.baseMessage, visitorId: visitorId || "Guest" });
    if (polished) reply = polished;

    let followUps = stripEchoFollowUps(base.followUps || [], cleanText);

    const out = { ok: true, contractVersion: "1", lane: base.lane, year: null, mode: null, voiceMode: s.voiceMode || "standard", reply, followUps, sessionPatch: base.sessionPatch || null, cog };

    if (debug) {
      out.baseMessage = base.baseMessage;
      out._engine = { version: "chatEngine v0.6f", hasLanePolicy: !!resolveLane, laneDecision: laneDecision || null, chosenLane: lane, laneCallOk: call.ok, laneCallFailReason: call.ok ? null : call.reason, hasNyxPolish: !!generateNyxReply };
    }
    return out;
  }

  // 5) music lane (pin lane + guard top100)
  s.lane = "music";

  const wantsTop100Now = explicitTop100Ask(cleanText) || (cls.intent === "mode" && cls.mode === "top100");

  // hard guard: top100 cannot persist unless asked now
  if (normalizeMode(s.activeMusicMode) === "top100" && !wantsTop100Now) {
    s.activeMusicMode = "top10";
  }

  const base = baseFallbackReply(cleanText, s);

  if (base.sessionPatch) applySessionPatch(s, base.sessionPatch);

  // loop dampener v2: suppress same sig in tight window WITHOUT poisoning state
  const sig = makeIntentSig("music", base.mode || "", base.year || "");
  const lastSig = String(s.lastIntentSig || "");
  const lastAt = Number(s.lastIntentAt || 0);
  const nowT = Number.isFinite(now) ? Number(now) : Date.now();
  const within = Number.isFinite(lastAt) && lastAt > 0 && (nowT - lastAt) >= 0 && (nowT - lastAt) <= 1800;

  let suppressed = false;
  if (lastSig && sig === lastSig && within && !explicitMusicAsk) {
    suppressed = true;
  }

  let reply = base.baseMessage;

  if (suppressed) {
    // don't repeat the same base; ask for a clarifying input
    reply = "I’m here. Give me a year (1950–2024), or say “top 10 1988”, “story moment 1988”, “micro moment 1988”, or “#1 1988”.";
  } else {
    // commit sig only when not suppressed
    applySessionPatch(s, { lastIntentSig: sig, lastIntentAt: nowT });
  }

  // packets ask-year template
  if (!base.year && packets) {
    try {
      const p = await packets.handleChat({ text: "music __ask_year__", session: s, visitorId, debug: !!debug });
      if (p && p.reply) reply = String(p.reply).trim() || reply;
    } catch (_) {}
  }

  const polished = await tryNyxPolish({ domain: "radio", intent: base.mode || "music", userMessage: cleanText, baseMessage: reply, visitorId: visitorId || "Guest" });
  if (polished) reply = polished;

  let followUps = stripEchoFollowUps(base.followUps || [], cleanText);

  const cog = cogFromBase({ ...base, baseMessage: reply });

  const out = { ok: true, contractVersion: "1", lane: base.lane, year: base.year, mode: base.mode, voiceMode: s.voiceMode || "standard", reply, followUps, sessionPatch: base.sessionPatch || null, cog };

  if (debug) {
    out.baseMessage = base.baseMessage;
    out._engine = { version: "chatEngine v0.6f", hasPackets: !!packets, hasLanePolicy: !!resolveLane, laneDecision: laneDecision || null, chosenLane: "music", explicitMusicAsk, hasStoredMusicContext, isMusicish, wantsTop100Now, intentSig: sig, lastIntentSig: lastSig, suppressed, quotaCooling: quotaCooling(Date.now()) };
  }

  return out;
}

module.exports = { handleChat };
