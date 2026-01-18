"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *  - returns { ok, reply, followUps, sessionPatch, cog, ... }
 *
 * v0.6i (BULLETPROOF++: MUSIC LANE BRIDGE + CONTENT SIG DAMPENER + SESSIONPATCH ALLOWLIST + INPUT/OUTPUT LOOP GUARD)
 *
 * CORE FIX:
 * ✅ Music lane calls Utils/musicLane.js (which delegates to musicKnowledge) and returns REAL content.
 * ✅ Prevents "Top 10 (1980)" label-only looping.
 *
 * HARDENING (NEW in v0.6i):
 * ✅ Input-loop guard: if the SAME user text repeats in a tight window, return the last output (idempotent)
 * ✅ Output-loop guard: if the SAME output repeats in a tight window (even on explicit asks), return a "break loop" prompt
 * ✅ Windows are ms-based (previous 1800 was ~1.8s ambiguity; now explicit constants)
 * ✅ SessionPatch allowlist expanded to include last in/out signatures + cached last output
 *
 * Preserves:
 * ✅ top10 != top100; never enters top100 unless explicit ask
 * ✅ Greetings/help/bye remain conversational-first
 */

const crypto = require("crypto");

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

// ✅ music adapter (delegates to musicKnowledge internally)
let musicLane = null;
try {
  musicLane = require("./musicLane");
  if (!musicLane || typeof musicLane.handleChat !== "function") musicLane = null;
} catch (_) {
  musicLane = null;
}

/* =========================
   Loop guard constants
========================= */

// If identical inbound text repeats within this window, treat as client retry/loop -> return cached last output.
const INBOUND_DEDUPE_MS = Number(process.env.NYX_INBOUND_DEDUPE_MS || 1500);

// If identical outbound content repeats within this window, treat as loop -> break with safe prompt.
const OUTBOUND_DEDUPE_MS = Number(process.env.NYX_OUTBOUND_DEDUPE_MS || 2500);

// Hard cap: don't trust "cached last output" if it's too old.
const LAST_OUT_MAX_AGE_MS = Number(process.env.NYX_LAST_OUT_MAX_AGE_MS || 60_000);

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

function normalizeMode(mode) {
  const m = normCmd(mode);
  if (!m) return null;

  if (m === "top10" || m === "top 10" || m === "top ten" || m === "top") return "top10";
  if (m === "top100" || m === "top 100" || m === "hot 100" || m === "year-end hot 100" || m === "year end hot 100") return "top100";

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

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

/**
 * SessionPatch apply (allowlist + proto safe)
 */
function applySessionPatch(session, patch) {
  if (!session || !patch || typeof patch !== "object") return;

  const ALLOW = new Set([
    "lane",
    "voiceMode",

    // music continuity
    "lastMusicYear",
    "activeMusicMode",
    "activeMusicChart",
    "lastMusicChart",

    // loop dampeners (legacy + new)
    "lastIntentSig",
    "lastIntentAt",
    "__musicLastContentSig",
    "__musicLastContentAt",

    // ✅ v0.6i inbound/outbound loop guards
    "__lastInSig",
    "__lastInAt",
    "__lastOutSig",
    "__lastOutAt",
    "__lastOutReply",
    "__lastOutFollowUps",
  ]);

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
   MUSIC helpers
========================= */

function normalizeMusicOutput(raw) {
  const reply = String(raw && raw.reply ? raw.reply : "").trim();

  let followUps = [];
  if (Array.isArray(raw && raw.followUps)) {
    if (raw.followUps.length && typeof raw.followUps[0] === "string") {
      followUps = raw.followUps.map((x) => ({ label: String(x).slice(0, 48), send: String(x).slice(0, 80) }));
    } else {
      followUps = raw.followUps;
    }
  } else if (Array.isArray(raw && raw.chips)) {
    followUps = raw.chips;
  } else {
    followUps = [];
  }

  const sessionPatch = raw && raw.sessionPatch && typeof raw.sessionPatch === "object" ? raw.sessionPatch : null;

  return { reply, followUps: safeFollowUps(followUps), sessionPatch };
}

function contentSig(reply, followUps) {
  const s = `${String(reply || "")}||${JSON.stringify(followUps || [])}`;
  return sha1(s);
}

function nowMsFrom(now) {
  return Number.isFinite(now) ? Number(now) : Date.now();
}

function withinMs(nowMs, thenMs, windowMs) {
  const n = Number(nowMs);
  const t = Number(thenMs);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
  const d = n - t;
  return d >= 0 && d <= windowMs;
}

function setLastOut(session, nowMs, reply, followUps) {
  const sig = contentSig(reply, followUps);
  applySessionPatch(session, {
    __lastOutSig: sig,
    __lastOutAt: nowMs,
    __lastOutReply: String(reply || ""),
    __lastOutFollowUps: Array.isArray(followUps) ? followUps : [],
  });
  return sig;
}

function canUseCachedLastOut(session, nowMs) {
  const at = Number(session && session.__lastOutAt || 0);
  if (!Number.isFinite(at) || at <= 0) return false;
  return withinMs(nowMs, at, LAST_OUT_MAX_AGE_MS) && !!(session && session.__lastOutReply);
}

function buildLoopBreakPrompt() {
  const reply =
    "I’m here — but something is auto-repeating. Give me a fresh input: a year (1950–2024), or “#1”, “story moment”, or “micro moment”.";
  const followUps = safeFollowUps([
    { label: "Another year", send: "another year" },
    { label: "1988", send: "1988" },
    { label: "#1", send: "#1" },
    { label: "Story", send: "story moment" },
    { label: "Micro", send: "micro moment" },
  ]);
  return { reply, followUps };
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
    cls.intent === "year_only" ||
    cls.intent === "mode" ||
    cls.intent === "nav" ||
    /\b(billboard|hot 100|top 10|top 100)\b/.test(normCmd(cleanText));

  const hasStoredMusicContext = !!yKnown && sessionLane === "music";

  const nowT = nowMsFrom(now);

  // ✅ v0.6i INPUT LOOP GUARD (idempotent response for tight repeats)
  const inSig = sha1(normCmd(cleanText));
  const lastInSig = String(s.__lastInSig || "");
  const lastInAt = Number(s.__lastInAt || 0);

  if (lastInSig && inSig === lastInSig && withinMs(nowT, lastInAt, INBOUND_DEDUPE_MS) && canUseCachedLastOut(s, nowT)) {
    const cachedReply = String(s.__lastOutReply || "").trim();
    const cachedFollowUps = safeFollowUps(Array.isArray(s.__lastOutFollowUps) ? s.__lastOutFollowUps : []);
    const outLane = String(s.lane || "general");
    const outYear = clampYear(s.lastMusicYear) || null;
    const outMode = normalizeMode(s.activeMusicMode) || null;
    const cog = cogFromBase({ lane: outLane, year: outYear, mode: outMode, baseMessage: cachedReply });

    const out = {
      ok: true,
      contractVersion: "1",
      lane: outLane,
      year: outYear,
      mode: outMode,
      voiceMode: s.voiceMode || "standard",
      reply: cachedReply,
      followUps: stripEchoFollowUps(cachedFollowUps, cleanText),
      sessionPatch: null,
      cog,
    };

    if (debug) {
      out._engine = {
        version: "chatEngine v0.6i",
        loopGuard: "inbound_dedupe_return_cached_last_out",
        inSig,
        lastInAt,
        nowT,
      };
    }
    return out;
  }

  applySessionPatch(s, { __lastInSig: inSig, __lastInAt: nowT });

  // 1) lanePolicy (guard greetings)
  let laneDecision = null;
  try {
    if (resolveLane) laneDecision = resolveLane({ text: cleanText, session: s });
  } catch (_) {
    laneDecision = null;
  }

  let lane = "";
  const lpLane = laneDecision && laneDecision.lane ? String(laneDecision.lane).trim().toLowerCase() : "";
  const lpForce = !!(laneDecision && laneDecision.force === true);

  if (lpLane && (lpForce || (!isGreetingLike(cleanText) && !isHelpLike(cleanText) && !isByeLike(cleanText)))) {
    lane = lpLane;
  } else {
    if (isGreetingLike(cleanText) || isHelpLike(cleanText) || isByeLike(cleanText)) lane = "general";
    else lane = explicitMusicAsk || (hasStoredMusicContext && isMusicish) ? "music" : "general";
  }

  // 2) packets (greetings/help/bye)
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

      const cog = cogFromBase({ lane: s.lane || "general", year: yKnown || null, mode: null, baseMessage: replyVar });

      // ✅ v0.6i OUT cache + OUT loop break check
      const outSig = contentSig(reply, followUps);
      const lastOutSig = String(s.__lastOutSig || "");
      const lastOutAt = Number(s.__lastOutAt || 0);

      if (lastOutSig && outSig === lastOutSig && withinMs(nowT, lastOutAt, OUTBOUND_DEDUPE_MS)) {
        const br = buildLoopBreakPrompt();
        reply = br.reply;
        followUps = stripEchoFollowUps(br.followUps, cleanText);
      } else {
        setLastOut(s, nowT, reply, followUps);
      }

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
          version: "chatEngine v0.6i",
          usedPackets: true,
          hasMusicLane: !!musicLane,
          hasLanePolicy: !!resolveLane,
          laneDecision: laneDecision || null,
          chosenLane: lane,
          explicitMusicAsk,
          hasStoredMusicContext,
          isMusicish,
          hasNyxPolish: !!generateNyxReply,
          quotaCooling: quotaCooling(Date.now()),
        };
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
    const polished = await tryNyxPolish({
      domain: "general",
      intent: "general",
      userMessage: cleanText,
      baseMessage: base.baseMessage,
      visitorId: visitorId || "Guest",
    });
    if (polished) reply = polished;

    let followUps = stripEchoFollowUps(base.followUps || [], cleanText);

    // ✅ v0.6i OUT cache + OUT loop break check
    const outSig = contentSig(reply, followUps);
    const lastOutSig = String(s.__lastOutSig || "");
    const lastOutAt = Number(s.__lastOutAt || 0);

    if (lastOutSig && outSig === lastOutSig && withinMs(nowT, lastOutAt, OUTBOUND_DEDUPE_MS)) {
      const br = buildLoopBreakPrompt();
      reply = br.reply;
      followUps = stripEchoFollowUps(br.followUps, cleanText);
    } else {
      setLastOut(s, nowT, reply, followUps);
    }

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
        version: "chatEngine v0.6i",
        usedPackets: false,
        hasMusicLane: !!musicLane,
        hasLanePolicy: !!resolveLane,
        laneDecision: laneDecision || null,
        chosenLane: "general",
        explicitMusicAsk,
        hasStoredMusicContext,
        isMusicish,
        hasNyxPolish: !!generateNyxReply,
      };
    }
    return out;
  }

  // 4) non-music lanes
  if (lane !== "music") {
    let base = null;
    const call = await callLaneHandler(lane, { text: cleanText, session: s, visitorId, debug });

    if (call.ok) {
      const normed = normalizeLaneOutput(call.raw, lane);
      base = normed.reply
        ? { lane, sessionPatch: normed.sessionPatch, baseMessage: normed.reply, followUps: normed.followUps }
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

    let followUps = stripEchoFollowUps(base.followUps || [], cleanText);

    // ✅ v0.6i OUT cache + OUT loop break check
    const outSig = contentSig(reply, followUps);
    const lastOutSig = String(s.__lastOutSig || "");
    const lastOutAt = Number(s.__lastOutAt || 0);

    if (lastOutSig && outSig === lastOutSig && withinMs(nowT, lastOutAt, OUTBOUND_DEDUPE_MS)) {
      const br = buildLoopBreakPrompt();
      reply = br.reply;
      followUps = stripEchoFollowUps(br.followUps, cleanText);
    } else {
      setLastOut(s, nowT, reply, followUps);
    }

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
        version: "chatEngine v0.6i",
        hasMusicLane: !!musicLane,
        hasLanePolicy: !!resolveLane,
        laneDecision: laneDecision || null,
        chosenLane: lane,
        laneCallOk: call.ok,
        laneCallFailReason: call.ok ? null : call.reason,
        hasNyxPolish: !!generateNyxReply,
      };
    }
    return out;
  }

  // 5) music lane (pin lane + guard top100)
  s.lane = "music";

  const wantsTop100Now = explicitTop100Ask(cleanText) || (cls.intent === "mode" && cls.mode === "top100");
  if (normalizeMode(s.activeMusicMode) === "top100" && !wantsTop100Now) {
    s.activeMusicMode = "top10";
  }

  if (musicLane) {
    try {
      const mRaw = await Promise.resolve(
        musicLane.handleChat({ text: cleanText, session: s, visitorId, debug: !!debug })
      );

      const m = normalizeMusicOutput(mRaw);
      if (m.sessionPatch) applySessionPatch(s, m.sessionPatch);

      let reply = m.reply;
      let followUps = m.followUps;

      // ✅ v0.6i OUT loop dampener (works for explicit asks too)
      const sig = contentSig(reply, followUps);
      const lastSig = String(s.__musicLastContentSig || "");
      const lastAt = Number(s.__musicLastContentAt || 0);

      if (sig && lastSig && sig === lastSig && withinMs(nowT, lastAt, OUTBOUND_DEDUPE_MS)) {
        const br = buildLoopBreakPrompt();
        reply = br.reply;
        followUps = br.followUps;
      } else {
        applySessionPatch(s, { __musicLastContentSig: sig, __musicLastContentAt: nowT });
      }

      const polished = await tryNyxPolish({
        domain: "radio",
        intent: "music",
        userMessage: cleanText,
        baseMessage: reply,
        visitorId: visitorId || "Guest",
      });
      if (polished) reply = polished;

      followUps = stripEchoFollowUps(followUps || [], cleanText);

      const y = clampYear(s.lastMusicYear) || null;
      const mode = normalizeMode(s.activeMusicMode) || null;
      const cog = cogFromBase({ lane: "music", year: y, mode, baseMessage: reply });

      // ✅ v0.6i OUT cache + OUT loop break check (global)
      const outSig = contentSig(reply, followUps);
      const lastOutSig = String(s.__lastOutSig || "");
      const lastOutAt = Number(s.__lastOutAt || 0);

      if (lastOutSig && outSig === lastOutSig && withinMs(nowT, lastOutAt, OUTBOUND_DEDUPE_MS)) {
        const br2 = buildLoopBreakPrompt();
        reply = br2.reply;
        followUps = stripEchoFollowUps(br2.followUps, cleanText);
      } else {
        setLastOut(s, nowT, reply, followUps);
      }

      const out = {
        ok: true,
        contractVersion: "1",
        lane: "music",
        year: y,
        mode,
        voiceMode: s.voiceMode || "standard",
        reply,
        followUps,
        sessionPatch: m.sessionPatch || null,
        cog,
      };

      if (debug) {
        out.baseMessage = m.reply;
        out._engine = {
          version: "chatEngine v0.6i",
          chosenLane: "music",
          usedMusicLane: true,
          wantsTop100Now,
          contentSig: sig,
          lastContentSig: lastSig,
        };
      }

      if (reply) return out;
    } catch (e) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.warn("[chatEngine] musicLane failed:", e && e.message ? e.message : e);
      }
    }
  }

  // Fallback (rare)
  const baseMessage =
    "Tell me a year (1950–2024), or say “top 10 1988”, “story moment 1988”, “micro moment 1988”, or “#1 1988”.";
  let reply = baseMessage;

  if (packets) {
    try {
      const p = await packets.handleChat({ text: "music __ask_year__", session: s, visitorId, debug: !!debug });
      if (p && p.reply) reply = String(p.reply).trim() || reply;
    } catch (_) {}
  }

  const polished = await tryNyxPolish({
    domain: "radio",
    intent: "music",
    userMessage: cleanText,
    baseMessage: reply,
    visitorId: visitorId || "Guest",
  });
  if (polished) reply = polished;

  let followUps = stripEchoFollowUps(
    safeFollowUps([
      { label: "1956", send: "1956" },
      { label: "Top 10 1988", send: "top 10 1988" },
      { label: "Story 1988", send: "story moment 1988" },
      { label: "Micro 1988", send: "micro moment 1988" },
    ]),
    cleanText
  );

  // ✅ v0.6i OUT cache + OUT loop break check
  const outSig = contentSig(reply, followUps);
  const lastOutSig = String(s.__lastOutSig || "");
  const lastOutAt = Number(s.__lastOutAt || 0);

  if (lastOutSig && outSig === lastOutSig && withinMs(nowT, lastOutAt, OUTBOUND_DEDUPE_MS)) {
    const br = buildLoopBreakPrompt();
    reply = br.reply;
    followUps = stripEchoFollowUps(br.followUps, cleanText);
  } else {
    setLastOut(s, nowT, reply, followUps);
  }

  const cog = cogFromBase({
    lane: "music",
    year: yKnown || null,
    mode: normalizeMode(s.activeMusicMode) || null,
    baseMessage: reply,
  });

  const out = {
    ok: true,
    contractVersion: "1",
    lane: "music",
    year: yKnown || null,
    mode: normalizeMode(s.activeMusicMode) || null,
    voiceMode: s.voiceMode || "standard",
    reply,
    followUps,
    sessionPatch: null,
    cog,
  };

  if (debug) {
    out.baseMessage = baseMessage;
    out._engine = { version: "chatEngine v0.6i", chosenLane: "music", usedMusicLane: false, reason: "musicLane_missing_or_empty" };
  }

  return out;
}

module.exports = { handleChat };
