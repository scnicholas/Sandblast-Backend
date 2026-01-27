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
 * v0.6zU (ENTERPRISE HARDENED + AUTHORITATIVE YEAR COMMIT (SURGICAL) + LOOPKILLER++++ + PACKETS GATING WIRED)
 *  ✅ FIX: Numeric year authoritative for Music + Top10 even when year arrives via payload/ctx
 *  ✅ FIX: Commit authoritative year into session.cog.year + session.cog.lastMusicYear + session.lastMusicYear
 *  ✅ FIX: Mode-only → auto-attach last known year (prefers session.lastMusicYear, then session.cog.year/lastMusicYear)
 *  ✅ FIX: Block “A year usually clears…” when year exists anywhere (text/payload/ctx/cog/session)
 *  ✅ FIX: FollowUps fallback uses resolved year (not text-only)
 *  ✅ NEW: PACKETS GATING — packets.js can only fire when chatEngine explicitly allows it (prevents hijack)
 *     - sets session.allowPackets (THIS is what packets.js reads)
 *     - allowPackets is also passed into engine args for downstream awareness
 *  ✅ Keeps: engine-autowire, intro replay suppression, post-intro grace, idempotency, timeout, contract normalize
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zU (enterprise hardened: authoritative year commit across payload/ctx/cog + mode-only attach + loopkiller++++ + packets gating wired + post-intro grace + idempotency + timeout + contract normalize + session safety)";

// =========================
// Enterprise knobs
// =========================
const ENGINE_TIMEOUT_MS = 9000;
const REPLAY_WINDOW_MS = 4000;
const MAX_FOLLOWUPS = 8;
const MAX_FOLLOWUP_LABEL = 48;
const MAX_REPLY_CHARS = 4000;
const MAX_META_STR = 220;

// =========================
// Intro
// =========================
const INTRO_REARM_MS = 12 * 60 * 1000;
const POST_INTRO_GRACE_MS = 650;

const INTRO_VARIANTS_BY_BUCKET = {
  general: [
    "Hey — Nyx here. Glad you’re in.\n\nGive me a year (1950–2024) and I’ll take it from there. Try: “top 10 1988” or “story moment 1977”.",
    "Hi. Come on in.\n\nPick a year (1950–2024) and tell me the vibe: Top 10, #1, story moment, or micro moment.",
    "Hey you. Nyx on.\n\nDrop a year (1950–2024). I’ll do charts, stories, and the little details that make it real.",
    "Welcome back — Nyx online.\n\nYear first (1950–2024). Then we can go Top 10, #1, story moment, or micro moment.",
    "Alright. I’m here.\n\nSay a year (1950–2024) and what you want: “top 10 1988”, “#1 1964”, “micro moment 1999”.",
    "Hey. Let’s time-travel.\n\nGive me a year (1950–2024) and I’ll handle the rest.",
  ],
  music: [
    "Hey — music mode.\n\nGive me a year (1950–2024) and choose: Top 10, #1, story moment, or micro moment.",
    "Hi. Let’s do the soundtrack version.\n\nDrop a year (1950–2024). Want Top 10, #1, story moment, or micro moment?",
    "Alright — music first.\n\nYear (1950–2024), then we pick the lens: Top 10, #1, story moment, micro moment.",
    "Hey you. Give me the year… I’ll give you the feeling.\n\nTry: “top 10 1988” or “story moment 1977”.",
  ],
  schedule: [
    "Hey — schedule mode.\n\nTell me your city/timezone and I’ll translate Sandblast time into yours. Or ask “Now / Next / Later.”",
    "Hi. Want the lineup?\n\nSay “Now / Next / Later”, or tell me your city so I can convert times cleanly.",
    "Alright — programming grid time.\n\nTell me where you are (city/timezone) or ask: “What’s on now?”",
  ],
  roku: [
    "Hey — Roku mode.\n\nWant live linear, on-demand, or today’s schedule?",
    "Hi. Let’s get you watching.\n\nSay “live”, “on-demand”, or “schedule”.",
    "Alright — Roku.\n\nTell me what you want: what’s on now, the schedule, or a quick channel guide.",
  ],
  radio: [
    "Hey — radio mode.\n\nWant the stream link, or do you want to pick an era first?",
    "Hi. Sandblast Radio is ready.\n\nPick a decade or year… or say “stream”.",
    "Alright — set the vibe.\n\nGive me an era, or ask me to open the stream.",
  ],
  sponsors: [
    "Hey — sponsors & advertising.\n\nDo you want the rate card, packages, or a recommendation based on your goal?",
    "Hi. Advertising mode.\n\nTell me: brand, budget range, and desired outcome — I’ll map you to a package.",
    "Alright — let’s talk sponsors.\n\nPricing, placements, or a pitch-ready package recommendation?",
  ],
  movies: [
    "Hey — movies & catalog.\n\nAre you looking for licensing, what’s available now, or what we should add next?",
    "Hi. Film lane.\n\nTell me: genre, decade, and PD vs licensed — I’ll point you cleanly.",
    "Alright — movies.\n\nTell me what you’re hunting for, and I’ll chart the best path.",
  ],
};

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
function safeRequire(p) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(p);
  } catch (_) {
    return null;
  }
}

const NYX_CONV_PACK =
  safeRequire("./nyxConversationalPack") ||
  safeRequire("./nyxConvPack") ||
  safeRequire("./nyx_conv_pack") ||
  null;

const NYX_PHRASEPACK =
  safeRequire("./nyxPhrasePack") ||
  safeRequire("./phrasePack") ||
  safeRequire("./nyx_phrase_pack") ||
  null;

// NOTE: this resolves to your packets.js when required via "./packets"
const NYX_PACKETS =
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
function clampStr(s, max) {
  const t = safeStr(s);
  if (t.length <= max) return t;
  return t.slice(0, max);
}
function nonEmptyReply(s, fallback) {
  const a = safeStr(s).trim();
  if (a) return a;
  const b = safeStr(fallback).trim();
  return b || "Okay — tell me what you want next.";
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
function pickRandomIndex(max) {
  try {
    return crypto.randomInt(0, max);
  } catch (_) {
    return Math.floor(Math.random() * max);
  }
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
function extractYearAuthoritative(text) {
  return extractYear(text);
}

// year resolver across inbound shapes
function coerceYearAny(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1950 && n <= 2024) return Math.trunc(n);
  const y = extractYear(safeStr(v));
  return y || null;
}
function resolveInboundYear(input, inboundText, session) {
  const y1 = coerceYearAny(input && input.year);
  const y2 = coerceYearAny(input && input.payload && input.payload.year);
  const y3 = coerceYearAny(input && input.ctx && input.ctx.year);
  const y4 = coerceYearAny(input && input.body && input.body.year);
  const y5 = extractYearAuthoritative(inboundText);

  const yS1 = coerceYearAny(session && session.lastMusicYear);
  const yS2 = coerceYearAny(session && session.lastYear);
  const yC1 = coerceYearAny(session && session.cog && session.cog.lastMusicYear);
  const yC2 = coerceYearAny(session && session.cog && session.cog.year);

  return y1 || y2 || y3 || y4 || y5 || yS1 || yC1 || yC2 || yS2 || null;
}
function commitYear(session, year, source) {
  if (!year) return;
  session.lastMusicYear = year;
  session.lastYear = year;

  session.cog = isPlainObject(session.cog) ? session.cog : {};
  session.cog.year = year;
  session.cog.lastMusicYear = year;
  session.cog.yearSource = source || session.cog.yearSource || "unknown";
}

function isTop10IntentText(text) {
  const t = normText(text);
  return /\btop\s*10\b/.test(t) || /\btop10\b/.test(t) || /\btop\s*ten\b/.test(t);
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
function isModeOnly(text) {
  const y = extractYear(text);
  const m = extractMode(text);
  return !!m && !y;
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
// Inbound extraction
// =========================
function extractInboundTextFromInput(input) {
  const direct =
    safeStr(input && (input.text || input.message || input.prompt || input.query || "")).trim() ||
    safeStr(input && input.body && (input.body.text || input.body.message || "")).trim() ||
    safeStr(input && input.payload && (input.payload.text || input.payload.message || "")).trim() ||
    safeStr(input && input.data && (input.data.text || input.data.message || "")).trim();

  if (direct) return direct;

  const evt =
    safeStr(input && input.event && (input.event.text || input.event.message || "")).trim() ||
    safeStr(input && input.followUp && input.followUp.payload && input.followUp.payload.text).trim();

  return evt || "";
}

// =========================
// Boot intro pings
// =========================
function isBootIntroSource(input) {
  try {
    const src =
      safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
      safeStr(input && input.source).trim();
    const tt = normText(src);
    return (
      tt.includes("panel_open_intro") ||
      tt.includes("panel-open-intro") ||
      tt.includes("boot_intro") ||
      tt.includes("boot-intro")
    );
  } catch (_) {
    return false;
  }
}

// =========================
// INBOUND NORMALIZATION (loop killer)
// =========================
function normalizeInboundText(text, session, routeHint) {
  const raw = safeStr(text).trim();
  if (!raw) return raw;

  const y = extractYear(raw);
  const m = extractMode(raw);

  if (!y && m) {
    const yy1 = Number(session && session.lastMusicYear);
    if (Number.isFinite(yy1) && yy1 >= 1950 && yy1 <= 2024) return `${raw} ${yy1}`.trim();

    const yy2 = Number(session && session.cog && session.cog.year);
    if (Number.isFinite(yy2) && yy2 >= 1950 && yy2 <= 2024) return `${raw} ${yy2}`.trim();

    const yy3 = Number(session && session.cog && session.cog.lastMusicYear);
    if (Number.isFinite(yy3) && yy3 >= 1950 && yy3 <= 2024) return `${raw} ${yy3}`.trim();
  }

  if (y && !m && session && session.activeMusicMode && !isGreetingOnly(raw)) {
    const mm = safeStr(session.activeMusicMode).trim();
    if (mm === "top10") return `top 10 ${y}`;
    if (mm === "top100") return `top 100 ${y}`;
    if (mm === "number1") return `#1 ${y}`;
    if (mm === "story") return `story moment ${y}`;
    if (mm === "micro") return `micro moment ${y}`;
  }

  if (y && !m && !isGreetingOnly(raw)) {
    const rh = normText(routeHint || "");
    const lane = normText(session && session.lane);
    const inMusic = rh.includes("music") || lane === "music";
    if (inMusic) return `top 10 ${y}`;
  }

  return raw;
}

// =========================
// Intro logic
// =========================
function isLoginMoment(session, startedAt) {
  const last = safeInt(session.lastTurnAt || session.lastInAt || 0, 0);
  const gap = last ? startedAt - last : Infinity;
  if (gap >= INTRO_REARM_MS) return true;
  if (!session.__hasRealUserTurn) return true;
  return false;
}
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
function shouldServeIntroLoginMoment(session, inboundText, startedAt, input) {
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

  if (
    isGreetingOnly(inboundText) &&
    (session.lastMusicYear ||
      (session.cog && (session.cog.year || session.cog.lastMusicYear)) ||
      session.activeMusicMode)
  )
    return "music";

  return "general";
}
function pickIntroForLogin(session, startedAt, bucketKey) {
  const bucket = Math.floor(startedAt / INTRO_REARM_MS);
  const bkey = safeStr(bucketKey || "general");
  const bucketStamp = `${bkey}:${bucket}`;

  const arr = INTRO_VARIANTS_BY_BUCKET[bkey] || INTRO_VARIANTS_BY_BUCKET.general;

  const prevBucket = safeStr(session.introBucket || "");
  const prevId = safeInt(session.introVariantId || 0, 0);

  if (prevBucket === bucketStamp && prevId >= 0 && prevId < arr.length) {
    return { text: arr[prevId], id: prevId, bucket: bucketStamp };
  }

  const id = pickRandomIndex(arr.length);
  return { text: arr[id] || arr[0], id, bucket: bucketStamp };
}

// =========================
// PACKETS GATING (prevents packets.js hijacking music flows)
// =========================
function shouldAllowPackets(inboundText, routeHint, session, resolvedYear) {
  if (resolvedYear) return false;

  const t = normText(inboundText);
  if (!t) return true;

  if (isGreetingOnly(t)) return true;
  if (/\b(help|support|how do i|what can you do)\b/.test(t)) return true;
  if (/\b(bye|goodbye|see you|later|exit)\b/.test(t)) return true;

  return false;
}

// =========================
// MUSIC OVERRIDE (year + mode forces lane=music)
// =========================
function applyMusicOverride(session, inboundText) {
  const year = extractYear(inboundText);
  const mode = extractMode(inboundText);
  if (!year || !mode) return { forced: false };

  commitYear(session, year, "user_text");

  session.lane = "music";
  session.lastMode = mode;
  session.activeMusicMode = mode;

  session.cog.lane = "music";
  session.cog.mode = mode;

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
// SessionPatch allowlist
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
  "__ce_lastReqId",
  "__ce_lastReqAt",
  "__ce_lastOutHash",
  "__ce_lastOut",
  "__ce_lastOutLane",

  // NEW: packets gate flag (so widget/index can persist it if needed)
  "allowPackets",
]);

function buildSessionPatch(session) {
  const s = session && typeof session === "object" ? session : {};
  const out = {};
  for (const k of Object.keys(s)) {
    if (!PATCH_KEYS.has(k)) continue;
    if (k === "cog") {
      if (isPlainObject(s.cog)) out.cog = s.cog;
      continue;
    }
    out[k] = s[k];
  }
  if (out.__introDone && !out.introDone) out.introDone = true;
  return out;
}

// =========================
// FollowUps / directives normalization
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
// Replay cache (session-scoped)
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
// Hard reset
// =========================
function hardResetSession(session, startedAt) {
  const keep = { visitorId: safeStr(session.visitorId || ""), sessionId: safeStr(session.sessionId || "") };
  for (const k of Object.keys(session)) delete session[k];
  if (keep.visitorId) session.visitorId = keep.visitorId;
  if (keep.sessionId) session.sessionId = keep.sessionId;

  session.lane = "general";
  session.turnCount = 0;
  session.turns = 0;
  session.startedAt = startedAt;
  session.lastTurnAt = startedAt;
  session.__hasRealUserTurn = 0;

  session.__introDone = 0;
  session.introDone = false;
  session.introAt = 0;
  session.introVariantId = 0;
  session.introBucket = "";

  session.lastInText = "";
  session.lastInAt = 0;
  session.lastOut = "";
  session.lastOutAt = 0;

  session.__ce_lastReqId = "";
  session.__ce_lastReqAt = 0;
  session.__ce_lastOutHash = "";
  session.__ce_lastOut = "";
  session.__ce_lastOutLane = "";

  session.allowPackets = false; // NEW
  session.cog = {};

  ensureContinuityState(session);
  return session;
}

// =========================
// ENGINE AUTOWIRE
// =========================
function resolveEngine(input) {
  if (typeof input.engine === "function") return { fn: input.engine, from: "input.engine" };

  const p = NYX_PACKETS;
  if (p && typeof p.handleChat === "function") return { fn: p.handleChat.bind(p), from: "nyxPackets.handleChat" };
  if (p && typeof p.chat === "function") return { fn: p.chat.bind(p), from: "nyxPackets.chat" };
  if (p && typeof p.respond === "function") return { fn: p.respond.bind(p), from: "nyxPackets.respond" };
  if (p && typeof p.run === "function") return { fn: p.run.bind(p), from: "nyxPackets.run" };
  if (p && typeof p.route === "function") return { fn: p.route.bind(p), from: "nyxPackets.route" };

  const c = NYX_CONV_PACK;
  if (c && typeof c.handleChat === "function") return { fn: c.handleChat.bind(c), from: "nyxConvPack.handleChat" };
  if (c && typeof c.respond === "function") return { fn: c.respond.bind(c), from: "nyxConvPack.respond" };
  if (c && typeof c.run === "function") return { fn: c.run.bind(c), from: "nyxConvPack.run" };

  return { fn: null, from: "none" };
}

// =========================
// Fallback (only used when no engine is available)
// =========================
function fallbackCore({ text, session, resolvedYear }) {
  const t = normText(text);
  const y = resolvedYear || extractYear(t);
  const m = extractMode(t);

  if (y && m) {
    return { reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`, lane: "music" };
  }

  if (y) {
    commitYear(session, y, "fallback");
    return {
      reply: `Got it — ${y}. Want Top 10, #1, a story moment, or a micro moment?`,
      lane: "music",
      followUps: toFollowUps([
        { label: "Top 10", send: `top 10 ${y}` },
        { label: "#1", send: `#1 ${y}` },
        { label: "Story moment", send: `story moment ${y}` },
        { label: "Micro moment", send: `micro moment ${y}` },
      ]),
    };
  }

  if (!t || isGreetingOnly(text)) {
    return { reply: INTRO_VARIANTS_BY_BUCKET.general[0], lane: "general", followUps: toFollowUps(CANON_INTRO_CHIPS) };
  }

  return {
    reply:
      "Give me a year (1950–2024), or say “top 10 1988”, “#1 1988”, “story moment 1988”, or “micro moment 1988”.",
    lane: session.lane || "general",
  };
}

// =========================
// Engine-aware fallback follow-ups
// =========================
function maybeAttachMusicFollowUps(core, resolvedYear, inboundText, session) {
  const year = resolvedYear || extractYear(inboundText);
  if (!year) return core;

  const hasFU = Array.isArray(core && core.followUps) && core.followUps.length;
  if (hasFU) return core;

  core.followUps = toFollowUps([
    { label: "Top 10", send: `top 10 ${year}` },
    { label: "#1", send: `#1 ${year}` },
    { label: "Story moment", send: `story moment ${year}` },
    { label: "Micro moment", send: `micro moment ${year}` },
  ]);
  core.followUpsStrings = toFollowUpsStrings([
    { label: "Top 10", send: `top 10 ${year}` },
    { label: "#1", send: `#1 ${year}` },
    { label: "Story moment", send: `story moment ${year}` },
    { label: "Micro moment", send: `micro moment ${year}` },
  ]);

  session.lane = "music";
  commitYear(session, year, session.cog.yearSource || "engine_followups_fallback");
  session.cog.lane = "music";

  return core;
}

// =========================
// Main handler
// =========================
async function handleChat(input = {}) {
  const startedAt = nowMs();
  const requestId = safeStr(input.requestId).trim() || sha1(`${startedAt}|${Math.random()}`).slice(0, 10);

  const session = ensureContinuityState(input.session || {});
  session.cog = isPlainObject(session.cog) ? session.cog : {};

  let inboundText = extractInboundTextFromInput(input);

  const source =
    safeStr(input && input.client && (input.client.source || input.client.src || "")).trim() ||
    safeStr(input && input.source).trim() ||
    "unknown";

  const routeHint =
    safeStr((input && input.client && input.client.routeHint) || input.routeHint || session.lane || "general").trim() ||
    "general";

  // RESET
  if (inboundText === "__cmd:reset__") {
    hardResetSession(session, startedAt);

    const RESET_FOLLOWUPS = [
      { label: "Pick a year", send: "Pick a year" },
      { label: "Music", send: "Music" },
      { label: "Radio", send: "Radio" },
    ];

    const reply = "All reset. Where do you want to start?";

    session.lane = "general";
    session.lastOut = reply;
    session.lastOutAt = startedAt;

    writeReplay(session, replayKey(session, requestId, inboundText, source), startedAt, reply, "general");

    return {
      ok: true,
      reply,
      lane: "general",
      followUps: toFollowUps(RESET_FOLLOWUPS),
      followUpsStrings: toFollowUpsStrings(RESET_FOLLOWUPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "fresh", reason: "hard_reset", lane: "general" },
      requestId,
      meta: { engine: CE_VERSION, reset: true, resetOption: "A", source: safeMetaStr(source), elapsedMs: nowMs() - startedAt },
    };
  }

  // Normalize inbound
  const preNorm = inboundText;
  inboundText = normalizeInboundText(inboundText, session, routeHint);
  const inboundNormalized = inboundText !== preNorm;

  // Resolve year from all inbound shapes
  const resolvedYear0 = resolveInboundYear(input, inboundText, session);

  // Commit if present
  if (resolvedYear0) commitYear(session, resolvedYear0, "resolved_inbound");

  // AUTHORITATIVE YEAR COMMIT (pre-engine)
  const modeNow = extractMode(inboundText);
  const top10Asked = isTop10IntentText(inboundText) || modeNow === "top10";

  const laneHint = normText(session.lane || routeHint || "");
  const forceMusicYear = !!resolvedYear0 && (laneHint === "music" || top10Asked);

  if (forceMusicYear) {
    session.lane = "music";
    session.cog.lane = "music";
    if (modeNow) session.cog.mode = modeNow;

    if (top10Asked) {
      session.activeMusicMode = "top10";
      session.lastMode = "top10";
      session.cog.mode = "top10";
      if (!modeNow) inboundText = `top 10 ${resolvedYear0}`;
    }
  }

  const inboundIsEmpty = isEmptyOrNoText(inboundText);
  const bootIntroEmpty = inboundIsEmpty && isBootIntroSource({ ...input, source });

  // Replay safety
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

  // POST-INTRO GRACE suppression
  const introAt = safeInt(session.introAt || 0, 0);
  const justIntroed = !!introAt && startedAt - introAt < POST_INTRO_GRACE_MS;
  if (justIntroed && (inboundIsEmpty || isModeOnly(inboundText))) {
    const reply = nonEmptyReply(session.lastOut, INTRO_VARIANTS_BY_BUCKET.general[0]);
    session.lastOut = reply;
    session.lastOutAt = startedAt;
    writeReplay(session, rkey, startedAt, reply, "general");
    return {
      ok: true,
      reply,
      lane: "general",
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "post_intro_grace", lane: "general" },
      requestId,
      meta: { engine: CE_VERSION, suppressed: "post_intro_grace", source: safeMetaStr(source), elapsedMs: nowMs() - startedAt },
    };
  }

  // Boot intro suppression
  if (bootIntroEmpty) {
    const introAt2 = safeInt(session.introAt || 0, 0);
    if (introAt2 && startedAt - introAt2 < INTRO_REARM_MS) {
      const lastOut = safeStr(session.lastOut || "").trim();
      const lane0 = safeStr(session.lane || "general") || "general";
      const reply = lastOut || "Ready when you are.";
      writeReplay(session, replayKey(session, requestId, inboundText, source), startedAt, reply, lane0);
      return {
        ok: true,
        reply,
        lane: lane0,
        followUps: toFollowUps(CANON_INTRO_CHIPS),
        followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
        sessionPatch: buildSessionPatch(session),
        cog: { phase: "listening", state: "confident", reason: "boot_intro_suppressed", lane: lane0 },
        requestId,
        meta: { engine: CE_VERSION, bootIntroSuppressed: true, source: safeMetaStr(source), elapsedMs: nowMs() - startedAt },
      };
    }
  }

  // Ignore empty non-boot
  if (inboundIsEmpty && !bootIntroEmpty) {
    const reply = "Ready when you are. Tell me a year (1950–2024), or what you want to do next.";
    const laneX = safeStr(session.lane || "general") || "general";
    return {
      ok: true,
      reply,
      lane: laneX,
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "ignored_empty_nonboot", lane: laneX },
      requestId,
      meta: { engine: CE_VERSION, ignoredEmpty: true, source: safeMetaStr(source), elapsedMs: nowMs() - startedAt },
    };
  }

  // Turn counters
  if (!bootIntroEmpty) {
    session.turnCount = safeInt(session.turnCount || 0, 0) + 1;
    session.turns = safeInt(session.turns || 0, 0) + 1;
  }
  if (!session.startedAt) session.startedAt = startedAt;
  if (!inboundIsEmpty) session.__hasRealUserTurn = 1;

  session.lastTurnAt = startedAt;
  if (!bootIntroEmpty) {
    session.lastInText = inboundText;
    session.lastInAt = startedAt;
  }

  // Lane seed
  let lane = safeStr(session.lane || routeHint || "general").trim() || "general";

  // Music override (text-based mode+year)
  const ov = applyMusicOverride(session, inboundText);
  if (ov.forced) lane = "music";
  if (forceMusicYear) lane = "music";

  // Intro
  const doIntro = !ov.forced && !forceMusicYear && shouldServeIntroLoginMoment(session, inboundText, startedAt, { ...input, source });
  if (doIntro) {
    session.__introDone = 1;
    session.introDone = true;
    session.introAt = startedAt;

    const bucketKey = pickIntroBucket(session, inboundText, routeHint, { ...input, source });
    session.lane = "general";

    const pick = pickIntroForLogin(session, startedAt, bucketKey);
    session.introVariantId = pick.id;
    session.introBucket = pick.bucket;

    const introLine = nonEmptyReply(pick.text, INTRO_VARIANTS_BY_BUCKET.general[0]);

    session.lastOut = introLine;
    session.lastOutAt = startedAt;

    writeReplay(session, rkey, startedAt, introLine, "general");

    return {
      ok: true,
      reply: introLine,
      lane: "general",
      followUps: toFollowUps(CANON_INTRO_CHIPS),
      followUpsStrings: toFollowUpsStrings(CANON_INTRO_CHIPS),
      sessionPatch: buildSessionPatch(session),
      cog: { phase: "listening", state: "confident", reason: "intro_login_moment", lane: "general" },
      requestId,
      meta: { engine: CE_VERSION, intro: true, introBucket: safeMetaStr(bucketKey), source: safeMetaStr(source) },
    };
  }

  // Resolve engine
  const resolved = resolveEngine(input);

  let core = null;
  let engineTimedOut = false;
  let engineEmptyReply = false;
  let engineOk = false;

  // PACKETS gating decision
  const allowPackets = shouldAllowPackets(inboundText, routeHint, session, resolvedYear0);

  // >>> THE IMPORTANT WIRE: packets.js reads session.allowPackets
  session.allowPackets = !!allowPackets;

  try {
    if (resolved.fn) {
      core = await withTimeout(
        Promise.resolve(
          resolved.fn({
            text: inboundText,
            session,
            requestId,
            routeHint: lane,

            // Provide flag explicitly too (harmless; useful if other engines inspect it)
            allowPackets,

            packs: {
              conv: NYX_CONV_PACK,
              phrase: NYX_PHRASEPACK,
              packets: NYX_PACKETS,
            },
            ctx: { year: resolvedYear0 || undefined, lane },
          })
        ),
        ENGINE_TIMEOUT_MS,
        "engine"
      );
      engineOk = true;
      if (core && typeof core === "object") {
        const rr = safeStr(core.reply || "").trim();
        engineEmptyReply = !rr;
      }
    } else {
      core = fallbackCore({ text: inboundText, session, resolvedYear: resolvedYear0 });
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
  } finally {
    // Reduce surface area: packets should be allowed only for this one evaluation window.
    // Reserved triggers still bypass inside packets.js if explicitly invoked.
    session.allowPackets = false;
  }

  // Attach safe music followUps if engine forgot chips
  if (core && typeof core === "object") core = maybeAttachMusicFollowUps(core, resolvedYear0, inboundText, session);

  // Normalize lane + reply
  const outLane = safeStr((core && core.lane) || session.lane || lane || "general").trim() || "general";
  session.lane = (ov.forced || forceMusicYear) ? "music" : outLane;

  // BLOCK the year-missing fallback when year exists anywhere
  const resolvedYearFinal = resolveInboundYear(input, inboundText, session);

  let reply = nonEmptyReply(
    core && core.reply,
    resolvedYearFinal
      ? `Got it — ${resolvedYearFinal}. What do you want: Top 10, #1, story moment, or micro moment?`
      : "A year usually clears things up."
  );
  reply = clampStr(reply, MAX_REPLY_CHARS);

  // sessionPatch allowlist merge
  if (core && isPlainObject(core.sessionPatch)) {
    for (const [k, v] of Object.entries(core.sessionPatch)) {
      if (!PATCH_KEYS.has(k)) continue;
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (k === "cog") {
        if (isPlainObject(v)) session.cog = v;
        continue;
      }
      session[k] = v;
    }
  }

  // Re-commit year after engine merge
  const yPost = resolveInboundYear(input, inboundText, session);
  if (yPost) commitYear(session, yPost, session.cog.yearSource || "post_engine");

  session.lastOut = reply;
  session.lastOutAt = startedAt;

  // Normalize directives/followUps
  const directives = normalizeDirectives(core && core.directives);
  const followUps = normalizeFollowUps(core && core.followUps);
  const followUpsStrings =
    Array.isArray(core && core.followUpsStrings) && core.followUpsStrings.length
      ? core.followUpsStrings.slice(0, MAX_FOLLOWUPS)
      : undefined;

  // Cache replay output
  writeReplay(session, rkey, startedAt, reply, session.lane);

  return {
    ok: true,
    reply,
    lane: session.lane,
    directives,
    followUps,
    followUpsStrings,
    sessionPatch: buildSessionPatch(session),
    cog:
      (core && core.cog && typeof core.cog === "object" && core.cog) || {
        phase: "listening",
        state: "confident",
        reason: (ov.forced || forceMusicYear) ? "music_override" : "ok",
        lane: session.lane,
      },
    requestId,
    meta: {
      engine: CE_VERSION,
      source: safeMetaStr(source),
      routeHint: safeMetaStr(routeHint),
      inboundNormalized,
      allowPackets,
      resolvedYear: resolvedYearFinal || null,
      override:
        (ov.forced ? `music:${safeMetaStr(ov.mode)}:${safeMetaStr(ov.year)}` : "") ||
        (forceMusicYear ? `music:top10:${safeMetaStr(resolvedYear0)}` : ""),
      elapsedMs: nowMs() - startedAt,
      engineResolvedFrom: resolved.from,
      engineOk,
      engineTimeout: !!engineTimedOut,
      engineEmptyReply,
      packsLoaded: { conv: !!NYX_CONV_PACK, phrase: !!NYX_PHRASEPACK, packets: !!NYX_PACKETS, cs1: !!cs1 },
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
