"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *
 * Returns (NyxReplyContract v1 + backwards compatibility):
 *  {
 *    ok, reply, lane, ctx, ui,
 *    directives: [{type, ...}],             // contract-lock (optional)
 *    followUps: [{id,type,label,payload}],  // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.6zN (ENTERPRISE HARDENED)
 *  ✅ REPLAY SAFETY: requestId idempotency (session-scoped) + short-window dedupe
 *  ✅ TIMEOUT CONTAINMENT: upstream engine wrapped with hard timeout + safe fallback reply
 *  ✅ CONTRACT NORMALIZATION: non-empty reply, safe lane, bounded followUps/directives
 *  ✅ SESSION SAFETY: prototype-pollution guard + allowlisted sessionPatch merge only
 *  ✅ TURN DRIFT CONTROL: empty non-boot ignored; boot-intro does not increment turns
 *  ✅ INTRO: stable-per-login variants + contextual buckets + anti-spam guard
 *  ✅ TEMPLATE SAFETY: regex-escape interpolation
 *  ✅ MUSIC OVERRIDE: year+mode forces lane=music (pre-intro)
 *  ✅ CS-1 soft wiring (if present)
 *  ✅ SAFE PACK LOADING (optional packs never brick)
 *  ✅ SESSIONPATCH MINIMIZER (avoid session bloat)
 *  ✅ OBSERVABILITY: elapsedMs + decision flags
 *
 *  ✅ RESET COMMAND: "__cmd:reset__" handled explicitly (fixes widget reset network error symptom)
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zN (enterprise hardened: idempotency+timeout+contract normalize+session safety+reset)";

// =========================
// Enterprise knobs
// =========================
const ENGINE_TIMEOUT_MS = 9000; // hard cap for upstream engine; keep < typical edge timeouts
const REPLAY_WINDOW_MS = 4000; // suppress accidental double-posts within 4s window
const MAX_FOLLOWUPS = 8; // UI safety; prevents payload bloat
const MAX_FOLLOWUP_LABEL = 48;
const MAX_REPLY_CHARS = 4000; // prevents runaway payloads
const MAX_META_STR = 220;

// =========================
// Intro (varied per login-moment; stable selection per login window)
// =========================
const INTRO_REARM_MS = 12 * 60 * 1000; // treat idle gap >= 12m as "new login"

// Bucketed intros: the widget now feels less rigid because intros match intent/lane.
const INTRO_VARIANTS_BY_BUCKET = {
  general: [
    "Hey — Nyx here.\n\nGive me a year (1950–2024) and I’ll handle the rest.\nExamples: “top 10 1988”, “#1 1964”, “story moment 1977”, “micro moment 1999”.",
    "Welcome in.\n\nYear first (1950–2024), then we go deep.\nTry: “top 10 1988” or “story moment 1977”.",
    "Hi. I’m Nyx.\n\nPick a year (1950–2024) and choose a vibe: Top 10, #1, story moment, or micro moment.",
    "Alright — Nyx online.\n\nGive me a year (1950–2024). If you want structure: “top 10 1988”, “#1 1964”, “micro moment 1999”.",
    "Hey you.\n\nDrop a year (1950–2024). I can do charts, stories, and the little details that make it real.",
    "Nyx checking in.\n\nWhat year are we time-traveling to? (1950–2024).",
  ],
  music: [
    "Music mode.\n\nGive me a year (1950–2024) and tell me what you want: Top 10, #1, story moment, or micro moment.",
    "Alright — music first.\n\nDrop a year (1950–2024). Want Top 10, #1, story moment, or micro moment?",
    "Let’s do this properly.\n\nYear (1950–2024), then we pick the lens: Top 10, #1, story moment, micro moment.",
    "You give me the year — I’ll give you the feeling.\n\nTry: “top 10 1988” or “story moment 1977”.",
  ],
  schedule: [
    "Schedule mode.\n\nTell me your city/timezone and I’ll translate Sandblast time into yours. Or ask for “Now / Next / Later.”",
    "Want the lineup?\n\nSay “Now / Next / Later”, or tell me your city so I can convert times cleanly.",
    "Programming grid time.\n\nTell me where you are (city/timezone) or ask: “What’s on now?”",
  ],
  roku: [
    "Roku mode.\n\nWant live linear, on-demand, or today’s schedule?",
    "Roku.\n\nTell me if you want what’s playing now, the schedule, or a quick guide to the channel flow.",
    "Let’s get you watching.\n\nSay “live”, “on-demand”, or “schedule”.",
  ],
  radio: [
    "Radio mode.\n\nWant the stream link, or do you want to pick an era first?",
    "Sandblast Radio.\n\nGive me a decade or a year and I’ll set the vibe — or say “stream”.",
    "Radio is ready.\n\nPick an era, or ask me to open the stream.",
  ],
  sponsors: [
    "Sponsors & advertising.\n\nWant the rate card, packages, or a quick recommendation based on your goal?",
    "Advertising mode.\n\nTell me: brand, budget range, and what outcome you want — I’ll map you to a package.",
    "Let’s talk sponsors.\n\nDo you want pricing, placements, or a pitch-ready package recommendation?",
  ],
  movies: [
    "Movies & catalog.\n\nAre you looking for licensing, what’s available now, or what we should add next?",
    "Film lane.\n\nTell me: genre, decade, and whether you want public-domain or licensed titles.",
    "Movies.\n\nSay what you’re hunting for — I’ll help you find the cleanest path (PD vs licensed).",
  ],
};

// Chips for intro: keep your canonical feel but make them more “relative”.
const CANON_INTRO_CHIPS = [
  { label: "Pick a year", send: "1988" },
  { label: "Story moment", send: "story moment 1988" },
  { label: "Schedule", send: "schedule" },
  { label: "Sponsors", send: "sponsors" },
];

// =========================
// Optional CS-1 module (soft-load)
// =========================
let cs1 = null;
try {
  cs1 = require("./cs1");
} catch (_) {
  cs1 = null;
}

// =========================
// Optional Packs (soft-load; never brick)
// =========================
let NYX_CONV_PACK = null;
let NYX_PHRASEPACK = null;
let NYX_PACKETS = null;

function safeRequire(path) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (_) {
    return null;
  }
}

NYX_CONV_PACK =
  safeRequire("./nyxConversationalPack") ||
  safeRequire("./nyxConvPack") ||
  safeRequire("./nyx_conv_pack") ||
  null;

NYX_PHRASEPACK =
  safeRequire("./nyxPhrasePack") ||
  safeRequire("./phrasePack") ||
  safeRequire("./nyx_phrase_pack") ||
  null;

NYX_PACKETS =
  safeRequire("./nyxPackets") ||
  safeRequire("./packets") ||
  safeRequire("./nyx_packets") ||
  null;

// =========================
// Helpers
// =========================
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function safeInt(n, def = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  if (v > 2147483000) return 2147483000;
  if (v < -2147483000) return -2147483000;
  return Math.trunc(v);
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function normText(s) {
  return safeStr(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function escapeRegExp(s) {
  return safeStr(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function interpolateTemplate(s, vars) {
  let out = safeStr(s);
  const v = vars && typeof vars === "object" ? vars : {};
  for (const k of Object.keys(v)) {
    const key = escapeRegExp(k);
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), safeStr(v[k]));
  }
  return out;
}
function nonEmptyReply(s, fallback) {
  const a = safeStr(s).trim();
  if (a) return a;
  const b = safeStr(fallback).trim();
  return b || "Okay — tell me what you want next.";
}
function clampStr(s, max) {
  const t = safeStr(s);
  if (t.length <= max) return t;
  return t.slice(0, max);
}
function pickDeterministic(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const h = sha1(seed || "seed");
  const n = parseInt(h.slice(0, 8), 16);
  return arr[n % arr.length];
}
async function withTimeout(promise, ms, tag) {
  let to = null;
  const timeout = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`timeout:${tag || "engine"}:${ms}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (to) clearTimeout(to);
  }
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function safeMetaStr(s) {
  return clampStr(safeStr(s).replace(/[\r\n\t]/g, " ").trim(), MAX_META_STR);
}

// =========================
// Extractors
// =========================
function extractYear(text) {
  const m = safeStr(text).match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1950 || y > 2024) return null;
  return y;
}
function extractMode(text) {
  const t = normText(text);
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";
  return null;
}
function isGreetingOnly(t) {
  return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|sup|what's up|whats up)$/i.test(
    safeStr(t).trim()
  );
}
function isEmptyOrNoText(t) {
  return !safeStr(t).trim();
}

// =========================
// Intent bypass (avoid intro stealing real tasks)
// =========================
function hasStrongFirstTurnIntent(text) {
  const t = normText(text);
  if (!t) return false;

  if (extractYear(t)) return true;
  if (extractMode(t)) return true;

  if (/\b(schedule|programming|what(?:'s|\s+is)\s+on|guide|grid)\b/.test(t)) return true;
  if (/\b(sponsor|advertis|rate\s*card|pricing|packages)\b/.test(t)) return true;
  if (/\b(movie|film|licens|catalog)\b/.test(t)) return true;
  if (/\b(roku|tv|channel|install|launch|open\s+on\s+roku)\b/.test(t)) return true;
  if (/\b(radio|listen|stream)\b/.test(t)) return true;

  if (t.length >= 12 && !isGreetingOnly(t)) return true;

  return false;
}

// =========================
// Login-moment intro rearm
// =========================
function isLoginMoment(session, startedAt) {
  const last = safeInt(session.lastTurnAt || session.lastInAt || 0, 0);
  const gap = last ? startedAt - last : Infinity;
  if (gap >= INTRO_REARM_MS) return true;
  if (!session.__hasRealUserTurn) return true;
  return false;
}

/**
 * Detect widget boot / panel-open intro pings where text can be empty.
 */
function isBootIntroSource(input) {
  try {
    const src =
      safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
      safeStr(input && input.source).trim();
    const t = normText(src);
    return (
      t.includes("panel_open_intro") ||
      t.includes("panel-open-intro") ||
      t.includes("boot_intro") ||
      t.includes("boot-intro")
    );
  } catch (_) {
    return false;
  }
}

// =========================
// Intro bucket selection (contextual + “relative”)
// =========================
function pickIntroBucket(session, inboundText, routeHint, input) {
  const t = normText(inboundText);
  const rh = normText(routeHint);
  const src = normText(
    safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
      safeStr(input && input.source).trim()
  );

  const lane = normText(session && session.lane);
  if (lane && INTRO_VARIANTS_BY_BUCKET[lane]) return lane;

  if (rh.includes("schedule") || /\b(schedule|programming|what's on|whats on|grid|now|next|later)\b/.test(t))
    return "schedule";
  if (rh.includes("roku") || /\b(roku|channel|tv|install|open on roku)\b/.test(t)) return "roku";
  if (rh.includes("radio") || /\b(radio|listen|stream)\b/.test(t)) return "radio";
  if (rh.includes("sponsor") || /\b(sponsor|advertis|rate card|pricing|packages)\b/.test(t)) return "sponsors";
  if (rh.includes("movie") || /\b(movie|film|licens|catalog)\b/.test(t)) return "movies";

  if (src.includes("panel_open_intro") || src.includes("boot_intro")) {
    if (rh.includes("music") || rh.includes("years")) return "music";
    return "general";
  }

  if (isGreetingOnly(inboundText) && (session.lastMusicYear || session.activeMusicMode)) return "music";

  return "general";
}

// =========================
// Intro decision
// =========================
function shouldServeIntroLoginMoment(session, inboundText, startedAt, input, routeHint) {
  if (!session) return false;

  const empty = isEmptyOrNoText(inboundText);

  if (empty) {
    if (!isBootIntroSource(input)) return false;
    if (!isLoginMoment(session, startedAt)) return false;

    const introAt = safeInt(session.introAt || 0, 0);
    if (introAt && startedAt - introAt < INTRO_REARM_MS) return false;

    return true;
  }

  const strong = hasStrongFirstTurnIntent(inboundText);
  if (strong && !isGreetingOnly(inboundText)) return false;

  if (!isLoginMoment(session, startedAt)) return false;

  const introAt = safeInt(session.introAt || 0, 0);
  if (introAt && startedAt - introAt < INTRO_REARM_MS) return false;

  return true;
}

// =========================
// MUSIC OVERRIDE (year + mode forces lane=music)
// =========================
function applyMusicOverride(session, inboundText) {
  const year = extractYear(inboundText);
  const mode = extractMode(inboundText);
  if (!year || !mode) return { forced: false };

  session.lastMusicYear = year;
  session.lastYear = year;
  session.lastMode = mode;
  session.activeMusicMode = mode;
  session.lane = "music";

  return { forced: true, lane: "music", year, mode };
}

// =========================
// Continuity scaffolding (safe)
// =========================
function ensureContinuityState(session) {
  const s = session && typeof session === "object" ? session : {};
  if (!s.__nyxCont) s.__nyxCont = {};
  if (!s.__nyxIntro) s.__nyxIntro = {};
  if (!s.__nyxPackets) s.__nyxPackets = {};
  return s;
}

// =========================
// SessionPatch minimizer
// =========================
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
  "lanesVisited",
  "yearsVisited",
  "modesVisited",
  "lastLane",
  "lastYear",
  "lastMode",
  "lastFork",
  "depthLevel",
  "elasticToggle",
  "lastElasticAt",
  "lane",
  "pendingLane",
  "pendingMode",
  "pendingYear",
  "recentIntent",
  "recentTopic",
  "activeMusicMode",
  "lastMusicYear",
  "year",
  "mode",
  "depthPreference",
  "userName",
  "nameAskedAt",
  "lastOpenQuestion",
  "userGoal",
  "lastNameUseTurn",
  "visitorId",
  "voiceMode",
  "__cs1",
  "cog",
  "__introDone",
  "turnCount",
  "__hasRealUserTurn",

  // enterprise replay safety fields (internal)
  "__ce_lastReqId",
  "__ce_lastReqAt",
  "__ce_lastOutHash",
  "__ce_lastOut",
  "__ce_lastOutLane",
]);

function buildSessionPatch(session) {
  const s = session && typeof session === "object" ? session : {};
  const out = {};
  for (const k of Object.keys(s)) {
    if (!PATCH_KEYS.has(k)) continue;
    out[k] = s[k];
  }
  if (out.__introDone && !out.introDone) out.introDone = true;
  return out;
}

// =========================
// FollowUp helpers
// =========================
function normFollowUpChip(label, send) {
  const l = clampStr(safeStr(label).trim() || "Send", MAX_FOLLOWUP_LABEL);
  const s = safeStr(send).trim();
  const id = sha1(l + "::" + s).slice(0, 8);
  return { id, type: "send", label: l, payload: { text: s } };
}
function toFollowUps(chips) {
  const arr = Array.isArray(chips) ? chips : [];
  const out = [];
  const seen = new Set();
  for (const c of arr) {
    const label = safeStr(c && c.label).trim() || "Send";
    const send = safeStr(c && c.send).trim();
    const key = normText(label + "::" + send);
    if (!send) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normFollowUpChip(label, send));
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out;
}
function toFollowUpsStrings(chips) {
  const arr = Array.isArray(chips) ? chips : [];
  const out = [];
  const seen = new Set();
  for (const c of arr) {
    const send = safeStr(c && c.send).trim();
    const k = normText(send);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(send);
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out.length ? out : undefined;
}
function normalizeFollowUps(followUps) {
  const arr = Array.isArray(followUps) ? followUps : [];
  const out = [];
  const seen = new Set();
  for (const f of arr) {
    if (!f) continue;
    const type = safeStr(f.type || "send").trim() || "send";
    if (type !== "send") continue;
    const label = clampStr(safeStr(f.label).trim() || "Send", MAX_FOLLOWUP_LABEL);
    const payload = isPlainObject(f.payload) ? f.payload : { text: safeStr(f.payload && f.payload.text) };
    const text = safeStr(payload.text).trim();
    if (!text) continue;
    const id = safeStr(f.id).trim() || sha1(label + "::" + text).slice(0, 8);
    const key = normText(id + "::" + label + "::" + text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, type: "send", label, payload: { text } });
    if (out.length >= MAX_FOLLOWUPS) break;
  }
  return out;
}
function normalizeDirectives(directives) {
  const arr = Array.isArray(directives) ? directives : [];
  const out = [];
  for (const d of arr) {
    if (!isPlainObject(d)) continue;
    const type = safeStr(d.type).trim();
    if (!type) continue;
    const obj = { type };
    for (const [k, v] of Object.entries(d)) {
      if (k === "type") continue;
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (typeof v === "string") obj[k] = clampStr(v, 500);
      else if (typeof v === "number" || typeof v === "boolean") obj[k] = v;
      else if (v === null) obj[k] = null;
    }
    out.push(obj);
    if (out.length >= 8) break;
  }
  return out.length ? out : undefined;
}

// =========================
// CS-1 hooks (soft)
// =========================
function cs1Init(session) {
  try {
    if (!cs1) return;
    if (typeof cs1.ensure === "function") cs1.ensure(session);
    if (typeof cs1.init === "function") cs1.init(session);
  } catch (_) {}
}
function cs1MarkSpeak(session, tag) {
  try {
    if (!cs1) return;
    if (typeof cs1.markSpeak === "function") cs1.markSpeak(session, tag);
    else if (typeof cs1.mark === "function") cs1.mark(session, { type: "speak", tag });
  } catch (_) {}
}
function cs1SelectContinuity(session, inboundText) {
  try {
    if (!cs1) return null;
    if (typeof cs1.select === "function") return cs1.select({ session, text: inboundText });
    if (typeof cs1.pick === "function") return cs1.pick({ session, text: inboundText });
    return null;
  } catch (_) {
    return null;
  }
}

// =========================
// Intro selection (stable per login window + bucket)
// =========================
function pickIntroForLogin(session, startedAt, bucketKey) {
  const bucket = Math.floor(startedAt / INTRO_REARM_MS);
  const bkey = safeStr(bucketKey || "general");

  const prevBucket = safeStr(session.introBucket || "");
  const prevId = safeInt(session.introVariantId || 0, 0);
  if (prevBucket === `${bkey}:${bucket}`) {
    const arr = INTRO_VARIANTS_BY_BUCKET[bkey] || INTRO_VARIANTS_BY_BUCKET.general;
    if (Number.isFinite(prevId) && prevId >= 0 && prevId < arr.length) {
      return { text: arr[prevId], id: prevId, bucket: `${bkey}:${bucket}` };
    }
  }

  const arr = INTRO_VARIANTS_BY_BUCKET[bkey] || INTRO_VARIANTS_BY_BUCKET.general;

  const seed = `${safeStr(session.sessionId || session.visitorId || "")}|${bucket}|${bkey}|intro`;
  const h = sha1(seed);
  const n = parseInt(h.slice(0, 8), 16);
  const id = Math.abs(n) % arr.length;

  return { text: arr[id] || arr[0], id, bucket: `${bkey}:${bucket}` };
}

// =========================
// Default core fallback
// =========================
function fallbackCore({ text, session }) {
  const t = normText(text);
  const y = extractYear(t);
  const m = extractMode(t);

  if (y && m) {
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      lane: "music",
      cog: {
        phase: "engaged",
        state: "confident",
        reason: "music_override",
        lane: "music",
        year: String(y),
        mode: m,
      },
    };
  }

  if (y) {
    session.lastMusicYear = y;
    session.lastYear = y;
    session.lane = "music";
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      lane: "music",
      cog: { phase: "listening", state: "confident", reason: "year_only", lane: "music", year: String(y) },
      followUps: toFollowUps([
        { label: "Top 10", send: `top 10 ${y}` },
        { label: "#1", send: `#1 ${y}` },
        { label: "Story moment", send: `story moment ${y}` },
        { label: "Micro moment", send: `micro moment ${y}` },
      ]),
    };
  }

  if (!t || isGreetingOnly(text)) {
    return {
      reply: INTRO_VARIANTS_BY_BUCKET.general[0],
      lane: "general",
      followUps: toFollowUps(CANON_INTRO_CHIPS),
    };
  }

  return {
    reply:
      "Tell me a year (1950–2024), or say “top 10 1988”, “#1 1988”, “story moment 1988”, or “micro moment 1988”.",
    lane: session.lane || "general",
  };
}

// =========================
// Replay / idempotency cache (session-scoped)
// =========================
function replayKey(session, requestId, inboundText, source) {
  const rid = safeStr(requestId).trim();
  const sig = sha1(
    `${safeStr(session.sessionId || session.visitorId || "")}|${safeStr(source)}|${safeStr(inboundText)}`
  ).slice(0, 12);
  return rid ? `rid:${rid}` : `sig:${sig}`;
}
function readReplay(session, key, now) {
  const lastKey = safeStr(session.__ce_lastReqId || "");
  const lastAt = safeInt(session.__ce_lastReqAt || 0, 0);
  if (!lastKey || lastKey !== key) return null;
  if (!lastAt || now - lastAt > REPLAY_WINDOW_MS) return null;

  const out = session.__ce_lastOut;
  const outLane = safeStr(session.__ce_lastOutLane || "general") || "general";
  const outHash = safeStr(session.__ce_lastOutHash || "");
  if (!out || !outHash) return null;

  return { reply: out, lane: outLane };
}
function writeReplay(session, key, now, reply, lane) {
  session.__ce_lastReqId = key;
  session.__ce_lastReqAt = now;
  session.__ce_lastOut = reply;
  session.__ce_lastOutLane = lane;
  session.__ce_lastOutHash = sha1(`${lane}::${reply}`).slice(0, 16);
}

// =========================
// HARD RESET COMMAND (enterprise-safe)
// =========================
function hardResetSession(session, startedAt) {
  const keep = {
    visitorId: safeStr(session.visitorId || ""),
    sessionId: safeStr(session.sessionId || ""),
  };

  for (const k of Object.keys(session)) delete session[k];

  if (keep.visitorId) session.visitorId = keep.visitorId;
  if (keep.sessionId) session.sessionId = keep.sessionId;

  session.lane = "general";
  session.lastLane = "general";
  session.turnCount = 0;
  session.turns = 0;
  session.startedAt = startedAt;
  session.lastTurnAt = startedAt;

  session.__hasRealUserTurn = 0;

  // Intro must be eligible again after reset
  session.__introDone = 0;
  session.introDone = false;
  session.introAt = 0;
  session.introVariantId = 0;
  session.introBucket = "";

  // Clear last I/O
  session.lastInText = "";
  session.lastInAt = 0;
  session.lastOut = "";
  session.lastOutAt = 0;

  // Clear replay cache so reset can’t be “replayed into not-reset”
  session.__ce_lastReqId = "";
  session.__ce_lastReqAt = 0;
  session.__ce_lastOutHash = "";
  session.__ce_lastOut = "";
  session.__ce_lastOutLane = "";

  // Keep continuity shells
  if (!session.__nyxCont) session.__nyxCont = {};
  if (!session.__nyxIntro) session.__nyxIntro = {};
  if (!session.__nyxPackets) session.__nyxPackets = {};

  return session;
}

// =========================
// Main handler
// =========================
async function handleChat(input = {}) {
  const startedAt = nowMs();

  const requestId = safeStr(input.requestId).trim() || sha1(`${startedAt}|${Math.random()}`).slice(0, 10);

  const session = ensureContinuityState(input.session || {});
  cs1Init(session);

  const inboundText = safeStr(input.text || input.message || "").trim();
  const inboundIsEmpty = isEmptyOrNoText(inboundText);

  const source =
    safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
    safeStr(input && input.source).trim() ||
    "unknown";

  const routeHint =
    safeStr((input && input.client && input.client.routeHint) || input.routeHint || session.lane || "general").trim() ||
    "general";

  const bootIntroEmpty = inboundIsEmpty && isBootIntroSource({ ...input, source });

  // =========================
  // RESET COMMAND (must be handled before replay/intro/engine)
  // =========================
  if (inboundText === "__cmd:reset__") {
    hardResetSession(session, startedAt);
    cs1MarkSpeak(session, "reset");

    const reply = "All reset. Where do you want to start?";
    const lane = "general";
    const followUps = toFollowUps(CANON_INTRO_CHIPS);

    // write replay AFTER reset so a rapid duplicate reset stays consistent
    const rkey = replayKey(session, requestId, inboundText, source);
    writeReplay(session, rkey, startedAt, reply, lane);

    return {
      ok: true,
      reply,
      lane,
      followUps,
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "fresh", reason: "hard_reset", lane },
      requestId,
      meta: {
        engine: CE_VERSION,
        reset: true,
        source: safeMetaStr(source),
        elapsedMs: nowMs() - startedAt,
      },
    };
  }

  // =========================
  // HARD IGNORE NON-BOOT EMPTY TURN
  // =========================
  if (inboundIsEmpty && !bootIntroEmpty) {
    const reply = "Ready when you are. Tell me a year (1950–2024), or what you want to do next.";
    const lane = safeStr(session.lane || "general") || "general";
    return {
      ok: true,
      reply,
      lane,
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "ignored_empty_nonboot", lane },
      requestId,
      meta: { engine: CE_VERSION, ignoredEmpty: true, source: safeMetaStr(source), elapsedMs: nowMs() - startedAt },
    };
  }

  // =========================
  // REPLAY SAFETY (idempotent within short window)
  // =========================
  const rkey = replayKey(session, requestId, inboundText, source);
  const cached = readReplay(session, rkey, startedAt);
  if (cached) {
    return {
      ok: true,
      reply: cached.reply,
      lane: cached.lane,
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "replay_cache", lane: cached.lane },
      requestId,
      meta: { engine: CE_VERSION, replay: true, source: safeMetaStr(source), elapsedMs: nowMs() - startedAt },
    };
  }

  // Telemetry counters: only for non-phantom turns; boot-intro should NOT increment.
  if (!bootIntroEmpty) {
    session.turnCount = safeInt(session.turnCount || 0, 0) + 1;
    session.turns = safeInt(session.turns || 0, 0) + 1;
  } else {
    session.turnCount = safeInt(session.turnCount || 0, 0);
    session.turns = safeInt(session.turns || 0, 0);
  }

  if (!session.startedAt) session.startedAt = startedAt;

  if (!inboundIsEmpty) session.__hasRealUserTurn = 1;

  session.lastTurnAt = startedAt;

  if (!bootIntroEmpty) {
    session.lastInText = inboundText;
    session.lastInAt = startedAt;
  }

  let lane = safeStr(session.lane || routeHint || "general").trim() || "general";

  // MUSIC OVERRIDE (pre-normalize)
  const ov = applyMusicOverride(session, inboundText);
  if (ov.forced) lane = ov.lane;

  // INTRO (contextual + stable-per-login window)
  const doIntro =
    !ov.forced && shouldServeIntroLoginMoment(session, inboundText, startedAt, { ...input, source }, routeHint);

  if (doIntro) {
    session.__introDone = 1;
    session.introDone = true;
    session.introAt = startedAt;

    const bucketKey = pickIntroBucket(session, inboundText, routeHint, { ...input, source });

    session.lane = "general";

    cs1MarkSpeak(session, "intro");

    const pick = pickIntroForLogin(session, startedAt, bucketKey);
    session.introVariantId = pick.id;
    session.introBucket = pick.bucket;

    const introLine = nonEmptyReply(pick.text, INTRO_VARIANTS_BY_BUCKET.general[0]);
    const followUps = toFollowUps(CANON_INTRO_CHIPS);

    writeReplay(session, rkey, startedAt, introLine, "general");

    return {
      ok: true,
      reply: introLine,
      lane: "general",
      followUps,
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "intro_login_moment", lane: "general", ts: startedAt },
      requestId,
      meta: {
        engine: CE_VERSION,
        intro: true,
        introBucket: safeMetaStr(bucketKey),
        loginMoment: true,
        source: safeMetaStr(source),
        elapsedMs: nowMs() - startedAt,
      },
    };
  }

  // Optional continuity selector (soft)
  const continuity = cs1SelectContinuity(session, inboundText);
  if (continuity && typeof continuity === "object") {
    session.__cs1 = continuity.__cs1 || continuity.state || session.__cs1;
  }

  // =========================
  // Core engine: if caller supplies engine, use it; else fallbackCore
  // Wrapped with timeout + hard failure containment
  // =========================
  let core = null;
  let engineTimedOut = false;
  try {
    if (typeof input.engine === "function") {
      core = await withTimeout(
        Promise.resolve(
          input.engine({
            text: inboundText,
            session,
            requestId,
            routeHint: lane,
            packs: { conv: NYX_CONV_PACK, phrase: NYX_PHRASEPACK, packets: NYX_PACKETS },
            interpolateTemplate,
            pickDeterministic,
          })
        ),
        ENGINE_TIMEOUT_MS,
        "engine"
      );
    } else {
      core = fallbackCore({ text: inboundText, session });
    }
  } catch (e) {
    const msg = safeStr(e && e.message ? e.message : e).trim();
    engineTimedOut = msg.startsWith("timeout:engine:");
    core = {
      reply: engineTimedOut
        ? "Still with you. Give me a year (1950–2024) or say “top 10 1988” and I’ll jump right in."
        : "I hit a snag, but I’m still here. Tell me a year (1950–2024), or say “top 10 1988”.",
      lane: session.lane || lane || "general",
      cog: {
        phase: "engaged",
        state: "error",
        reason: engineTimedOut ? "engine_timeout" : "engine_error",
        detail: safeMetaStr(msg),
      },
    };
  }

  // Normalize lane
  const outLane = safeStr((core && core.lane) || session.lane || lane || "general").trim() || "general";
  session.lane = outLane;
  if (ov.forced) session.lane = "music";

  // Guarantee reply
  let reply = nonEmptyReply(core && core.reply, "A year usually clears things up.");
  reply = clampStr(reply, MAX_REPLY_CHARS);

  // directives
  const directives = normalizeDirectives(core && core.directives);

  // followUps
  const followUps = normalizeFollowUps(core && core.followUps);
  const followUpsStrings =
    Array.isArray(core && core.followUpsStrings) && core.followUpsStrings.length
      ? core.followUpsStrings.slice(0, MAX_FOLLOWUPS)
      : undefined;

  // sessionPatch merge (minimized + safe)
  if (core && isPlainObject(core.sessionPatch)) {
    for (const [k, v] of Object.entries(core.sessionPatch)) {
      if (!PATCH_KEYS.has(k)) continue;
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      session[k] = v;
    }
  }

  session.lastOut = reply;
  session.lastOutAt = startedAt;

  const cog =
    (core && core.cog && typeof core.cog === "object" ? core.cog : null) || {
      phase: "listening",
      state: "confident",
      reason: ov.forced ? "music_override" : "ok",
      lane: session.lane,
    };

  if (ov.forced) cs1MarkSpeak(session, "music_override");

  writeReplay(session, rkey, startedAt, reply, session.lane);

  return {
    ok: true,
    reply,
    lane: session.lane,
    directives,
    followUps,
    followUpsStrings,
    sessionPatch: buildSessionPatch(session),
    cog,
    requestId,
    meta: {
      engine: CE_VERSION,
      override: ov.forced ? `music:${safeMetaStr(ov.mode)}:${safeMetaStr(ov.year)}` : "",
      source: safeMetaStr(source),
      engineTimeout: !!engineTimedOut,
      elapsedMs: nowMs() - startedAt,
      packsLoaded: {
        conv: !!NYX_CONV_PACK,
        phrase: !!NYX_PHRASEPACK,
        packets: !!NYX_PACKETS,
        cs1: !!cs1,
      },
    },
  };
}

// Back-compat exports
module.exports = {
  handleChat,
  reply: handleChat,
  chatEngine: handleChat,
  CE_VERSION,
};
