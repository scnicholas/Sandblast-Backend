"use strict";

/**
 * Utils/chatEngine.js
 *
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
 * v0.7aZ (LOOP FIX+++++:
 *         + REMOVED: top100_billboard_yearend_1960s_v1 from Top10 loose candidates (stops “derived_top10_from_yearend” loop)
 *         + ADDED: Top10 requires explicit year (if yearSource === "sticky", we refuse + ask for year)
 *         + Keeps: pinned top10 v1 years{YYYY:{items}} fast-path + normalizeSongLine pos/position rank + rows-shape fix,
 *                 Top40 purge, 2025 range, decade-guard, do-not-persist sticky year,
 *                 pinned-first resolvers, action/mode normalization, system lane responder,
 *                 always-advance, payload-root fallback, chip-authoritative mode,
 *                 sticky-year source, session-scoped burst dedupe
 */

const crypto = require("crypto");

// Optional: packets engine (safe)
let packets = null;
try {
  packets = require("./packets.js");
} catch (_) {
  packets = null;
}

// Optional: intent classifier (safe)
let intentClassifier = null;
try {
  intentClassifier = require("./intentClassifier.js");
} catch (_) {
  try {
    intentClassifier = require("./intentClassifier");
  } catch (__) {
    intentClassifier = null;
  }
}

/* ======================================================
   Version + constants
====================================================== */

const CE_VERSION =
  "chatEngine v0.7aZ (remove top100_billboard_yearend_1960s_v1 from Top10 candidates + Top10 requires explicit year; keeps pinned top10 v1 fast-path + normalizeSongLine pos/position rank + rows-shape fix + Top40 purge + 2025 range + decade-guard + do-not-persist sticky year + pinned-first resolvers + action/mode normalization + system lane responder + always-advance + payload-root fallback + chip-authoritative mode + sticky-year source + session-scoped burst dedupe)";

const MAX_REPLY_LEN = 2400;
const MAX_FOLLOWUPS = 10;
const MAX_LABEL_LEN = 52;

const BURST_WINDOW_MS = 2500;
const SUSTAIN_WINDOW_MS = 45000;
const SUSTAIN_REPEAT_LIMIT = 4;
const REPLAY_TTL_MS = 120000;

const MAX_SEEN_KEYS = 96;
const MAX_LOOP_EVENTS = 32;

const ALLOWED_SESSION_PATCH_KEYS = new Set([
  "lane",
  "lastMusicYear",
  "activeMusicMode",
  "activeMusicChart",
  "lastMusicChart",
  "__musicLastSig",
  "depthLevel",
  "recentIntent",
  "recentTopic",
  "voiceMode",
  "lastIntentSig",
  "allowPackets",
  "__nyxPackets",
  "cog",
  "__packIndexSeen",
]);

/* ======================================================
   Helpers
====================================================== */

function nowMs() {
  return Date.now();
}

function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype ||
      Object.getPrototypeOf(x) === null)
  );
}

function normText(t) {
  return String(t || "").trim();
}

function normLower(t) {
  return normText(t).toLowerCase();
}

function clampStr(s, max) {
  const t = String(s || "");
  return t.length > max ? t.slice(0, max) : t;
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const k = Math.trunc(n);
  if (k < 1950 || k > 2025) return null;
  return k;
}

function extractYearFromText(text) {
  // IMPORTANT: decade guard — "1960s" must NOT match year 1960
  const m = String(text || "").match(
    /\b(19[5-9]\d|20[0-1]\d|202[0-5])(?!s\b)\b/
  );
  if (!m) return null;
  return clampYear(m[1]);
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s || ""), "utf8").digest("hex");
}

function safeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeJsonStringify(x) {
  try {
    return JSON.stringify(x);
  } catch (_) {
    return "";
  }
}

function isString(x) {
  return typeof x === "string";
}
function isArray(x) {
  return Array.isArray(x);
}

/* ======================================================
   Music mode inference (text) — TOP40 PURGED
====================================================== */

function inferMusicModeFromText(low) {
  if (!low) return "";
  if (/\b(top\s*10|top10)\b/.test(low)) return "top10";
  // NOTE: intentionally NOT supporting top40/top 40 (purged)
  if (/\b(year[-\s]*end|yearend)\b/.test(low)) return "year_end";
  if (/\b(hot\s*100|billboard|chart|charts|charting|hit\s*parade)\b/.test(low))
    return "charts";
  if (/\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/.test(low))
    return "number_one";
  if (/\b(micro\s*moment|micro)\b/.test(low)) return "micro";
  if (/\b(story\s*moment|story)\b/.test(low)) return "story";
  return "";
}

/* ======================================================
   Canonical action/mode normalization — TOP40 PURGED
====================================================== */

function normalizeMusicAction(action) {
  const a = normLower(action);
  if (!a) return "";

  if (
    ["top10", "top_10", "top-ten", "topten", "year_top10", "year-top10"].includes(
      a
    )
  )
    return "top10";
  if (
    [
      "number1",
      "number_1",
      "no1",
      "#1",
      "number-one",
      "numberone",
      "number_one",
      "num1",
    ].includes(a)
  )
    return "number_one";
  if (
    ["micro", "micro_moment", "micro-moment", "micromoment", "moments_micro"].includes(
      a
    )
  )
    return "micro";
  if (
    ["story", "story_moment", "story-moment", "storymoment", "moments_story"].includes(
      a
    )
  )
    return "story";
  if (["charts", "chart", "charting"].includes(a)) return "charts";
  if (["year_end", "yearend", "year-end", "year end"].includes(a)) return "year_end";

  // NOTE: "top40" intentionally not normalized to a music action anymore.
  return a;
}

const MUSIC_MODES = new Set(["top10", "year_end", "charts", "number_one", "micro", "story"]);
const MUSIC_ACTIONS_STRONG = new Set(["top10", "year_end", "charts", "number_one", "micro", "story"]);
const MUSIC_ACTIONS_WEAK = new Set(["enter", "start", "year"]); // only music if lane=music/years

function normalizeMode(mode, action, low) {
  const m = normLower(mode);
  const a = normalizeMusicAction(action);

  if (m) {
    if (["top10", "top_10", "top-ten", "topten"].includes(m)) return "top10";
    if (["number1", "number_1", "no1", "#1", "number-one", "numberone", "number_one"].includes(m))
      return "number_one";
    if (["micro", "micro_moment", "micro-moment", "micromoment"].includes(m)) return "micro";
    if (["story", "story_moment", "story-moment", "storymoment"].includes(m)) return "story";
    if (["charts", "chart"].includes(m)) return "charts";
    if (["year_end", "yearend", "year-end", "year end"].includes(m)) return "year_end";

    // TOP40 PURGE: do NOT accept "top40" as a mode
    if (["top40", "top_40", "top forty", "top-forty"].includes(m)) return "";

    return m;
  }

  if (a) {
    if (MUSIC_MODES.has(a)) return a;
    if (a === "top40") return "";
  }

  return inferMusicModeFromText(low);
}

/* ======================================================
   Session patch safety
====================================================== */

function safeSessionPatch(patch) {
  if (!isPlainObject(patch)) return null;
  const out = Object.create(null);

  for (const k of Object.keys(patch)) {
    if (!ALLOWED_SESSION_PATCH_KEYS.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;

    if (k === "lastMusicYear") {
      const y = clampYear(patch[k]);
      if (y) out.lastMusicYear = y;
      continue;
    }

    if (k === "activeMusicMode") {
      const m = normalizeMode(patch[k], "", "");
      if (m && MUSIC_MODES.has(m)) out.activeMusicMode = m;
      continue;
    }

    if (k === "activeMusicChart" || k === "lastMusicChart") {
      const v = normText(patch[k]);
      if (v) out[k] = v;
      continue;
    }

    if (k === "__musicLastSig") {
      const v = normText(patch[k]);
      if (v) out.__musicLastSig = v.slice(0, 80);
      continue;
    }

    if (k === "depthLevel") {
      const n = Number(patch[k]);
      if (Number.isFinite(n) && n >= 0) out.depthLevel = Math.min(50, Math.trunc(n));
      continue;
    }

    if (k === "recentIntent" || k === "recentTopic") {
      const v = normText(patch[k]);
      if (v) out[k] = v.slice(0, 48);
      continue;
    }

    if (k === "cog") {
      if (!isPlainObject(patch.cog)) continue;
      const c = Object.create(null);
      const s = normLower(patch.cog.state);
      if (s === "cold" || s === "warm" || s === "engaged") c.state = s;
      const y = clampYear(patch.cog.year);
      if (y) c.year = y;
      const lmy = clampYear(patch.cog.lastMusicYear);
      if (lmy) c.lastMusicYear = lmy;
      if (Object.keys(c).length) out.cog = c;
      continue;
    }

    if (k === "__nyxPackets") {
      if (isPlainObject(patch.__nyxPackets)) out.__nyxPackets = patch.__nyxPackets;
      continue;
    }

    if (k === "__packIndexSeen") {
      out.__packIndexSeen = !!patch.__packIndexSeen;
      continue;
    }

    const v = patch[k];
    if (v == null) continue;
    if (typeof v === "boolean") out[k] = v;
    else out[k] = String(v).trim();
  }

  return Object.keys(out).length ? out : null;
}

function mergeSession(session, patch) {
  if (!session || typeof session !== "object") return;
  const safe = safeSessionPatch(patch);
  if (!safe) return;
  for (const k of Object.keys(safe)) session[k] = safe[k];
}

/* ======================================================
   FollowUps: widget-compatible (payload.text fallback)
====================================================== */

function ensureChipPayload(payload) {
  const p = isPlainObject(payload) ? payload : Object.create(null);

  if (p.action) p.action = normalizeMusicAction(p.action);
  if (p.mode) p.mode = normalizeMode(p.mode, p.action, "");

  const text = normText(p.text);

  if (!text) {
    const year = clampYear(p.year);
    const mode = normLower(p.mode);
    const lane = normLower(p.lane);
    const action = normalizeMusicAction(p.action);

    let cmd = "";
    if (lane === "music" || mode || action === "year" || action === "enter" || action === "start") {
      if (mode === "top10") cmd = year ? `top 10 ${year}` : "top 10";
      else if (mode === "number_one") cmd = year ? `#1 ${year}` : "#1";
      else if (mode === "micro") cmd = year ? `micro moment ${year}` : "micro moment";
      else if (mode === "story") cmd = year ? `story moment ${year}` : "story moment";
      else cmd = year ? `music ${year}` : "music";
    } else if (lane === "system" || action === "help" || action === "reset") {
      cmd = action === "reset" ? "reset" : action === "help" ? "help" : "help";
    }

    if (cmd) p.text = cmd;
  }

  return p;
}

function sanitizeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const it of list) {
    if (!it || typeof it !== "object") continue;

    const label = normText(it.label);
    if (!label) continue;

    const payload = ensureChipPayload(it.payload);

    let key = "";
    try {
      key = sha1(label + "::" + JSON.stringify(payload));
    } catch (_) {
      key = sha1(label + "::" + String(Math.random()));
    }
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: String(it.id || safeId("chip")),
      type: String(it.type || "chip"),
      label: clampStr(label, MAX_LABEL_LEN),
      payload,
    });

    if (out.length >= MAX_FOLLOWUPS) break;
  }

  return out;
}

function followUpsToLegacyStrings(followUps) {
  if (!Array.isArray(followUps)) return [];
  return followUps
    .map((x) => String(x && x.label ? x.label : ""))
    .filter(Boolean)
    .slice(0, MAX_FOLLOWUPS);
}

/* ======================================================
   FIRST-TURN ROUTER FOLLOWUPS
====================================================== */

function hasUsableFollowUps(fus) {
  return Array.isArray(fus) && fus.length > 0;
}

function firstTurnRouterFollowUps() {
  return sanitizeFollowUps([
    {
      id: "router_music",
      type: "chip",
      label: "Music",
      payload: { lane: "music", action: "enter", mode: "top10", text: "Pick a year" },
    },
    {
      id: "router_story",
      type: "chip",
      label: "Story moment",
      payload: { lane: "music", action: "year", mode: "story", text: "Story moment" },
    },
    {
      id: "router_talk",
      type: "chip",
      label: "Just talk",
      payload: { lane: "general", action: "free", text: "Just talk" },
    },
  ]);
}

/* ======================================================
   Loop control (burst dedupe + sustained fuse)
====================================================== */

function getReplayStore(session) {
  if (!session.__replay || typeof session.__replay !== "object") {
    session.__replay = Object.create(null);
  }
  if (!session.__replay.map || typeof session.__replay.map !== "object") {
    session.__replay.map = Object.create(null);
  }
  if (!Array.isArray(session.__replay.order)) session.__replay.order = [];
  return session.__replay;
}

function pruneReplayStore(store, tNow) {
  const order = store.order || [];
  const map = store.map || Object.create(null);

  const keep = [];
  for (const key of order) {
    const rec = map[key];
    if (!rec || !rec.t) continue;
    if (tNow - rec.t > REPLAY_TTL_MS) {
      delete map[key];
      continue;
    }
    keep.push(key);
  }

  while (keep.length > MAX_SEEN_KEYS) {
    const k = keep.shift();
    if (k) delete map[k];
  }

  store.order = keep;
}

function sessionScopedVisitorId(session, inputVisitorId) {
  const s = session && typeof session === "object" ? session : null;
  return (
    String(inputVisitorId || "").trim() ||
    String((s && (s.visitorId || s.sessionId || s.deviceId)) || "").trim() ||
    "anon"
  );
}

function buildBurstKey({ sessionId, inboundHash }) {
  const sid = String(sessionId || "anon");
  return sha1(`${sid}::burst::${inboundHash}`);
}

function rememberReply(session, key, out) {
  const store = getReplayStore(session);
  const map = store.map;
  const tNow = nowMs();

  map[key] = { t: tNow, out };
  store.order.push(key);
  pruneReplayStore(store, tNow);
}

function getRememberedReply(session, key) {
  const store = getReplayStore(session);
  const rec = store.map && store.map[key];
  if (!rec || !rec.t) return null;

  const tNow = nowMs();
  if (tNow - rec.t > REPLAY_TTL_MS) return null;
  return rec;
}

function getLoopStore(session) {
  if (!session.__loop || typeof session.__loop !== "object") {
    session.__loop = Object.create(null);
  }
  if (!Array.isArray(session.__loop.events)) session.__loop.events = [];
  return session.__loop;
}

function recordLoopEvent(session, inboundHash) {
  const store = getLoopStore(session);
  const tNow = nowMs();
  const events = store.events;

  const keep = [];
  for (const ev of events) {
    if (!ev || !ev.t) continue;
    if (tNow - ev.t <= SUSTAIN_WINDOW_MS) keep.push(ev);
  }
  keep.push({ t: tNow, h: inboundHash });

  while (keep.length > MAX_LOOP_EVENTS) keep.shift();
  store.events = keep;

  let repeats = 0;
  for (let i = keep.length - 1; i >= 0; i--) {
    if (keep[i].h === inboundHash) repeats++;
    else break;
  }

  return repeats;
}

/* ======================================================
   Payload extraction HARDENING
====================================================== */

function buildPayloadFromRoot(input) {
  if (!input || typeof input !== "object") return null;

  const lane = normText(input.lane || (input.ctx && input.ctx.lane) || "");
  const action = normText(input.action || (input.ctx && input.ctx.action) || "");
  const mode = normText(
    input.mode || input.intent || (input.ctx && (input.ctx.mode || input.ctx.intent)) || ""
  );
  const year = clampYear(input.year || (input.ctx && input.ctx.year) || null);

  if (!lane && !action && !mode && !year) return null;

  const p = Object.create(null);
  if (lane) p.lane = lane;
  if (action) p.action = action;
  if (mode) p.mode = mode;
  if (year) p.year = year;

  const t = normText(input.text || input.message || input.prompt || input.query || "");
  if (t) p.text = t;

  return p;
}

function getPayloadFromAny(input) {
  if (!input || typeof input !== "object") return null;

  const cands = [
    input.payload,
    input && input.payload && input.payload.payload,
    input.ctx && input.ctx.payload,
    input.client && input.client.payload,
    input.ui && input.ui.payload,
    input.body && input.body.payload,
    input._raw && input._raw.payload,
  ];

  for (const c of cands) {
    if (isPlainObject(c)) return c;
  }

  return buildPayloadFromRoot(input);
}

/* ======================================================
   Routing spine (chip-authoritative + text inference)
====================================================== */

function parseInbound(input) {
  const payload = getPayloadFromAny(input);

  if (payload && payload.action) payload.action = normalizeMusicAction(payload.action);

  const textPrimary = normText(input.text || input.message || input.prompt || input.query);
  const textFromPayload =
    payload && typeof payload.text === "string" ? normText(payload.text) : "";
  const finalText = textPrimary || textFromPayload || "";

  const low = normLower(finalText);

  const lane = payload && payload.lane ? normLower(payload.lane) : "";
  const actionRaw = payload && payload.action ? String(payload.action) : "";
  const action = actionRaw ? normalizeMusicAction(actionRaw) : "";
  const rawMode = payload && payload.mode ? normLower(payload.mode) : "";
  const yearFromPayload = clampYear(payload && payload.year);
  const yearFromText = extractYearFromText(finalText);
  const year = yearFromPayload || yearFromText || null;

  const mode = normalizeMode(rawMode, action, low);

  return {
    payload: payload || null,
    text: finalText,
    lower: low,
    lane,
    action,
    mode,
    year,
    _yearSource: yearFromPayload ? "payload" : yearFromText ? "text" : "",
  };
}

function looksLikeStructuredMusic({ lane, action, mode, year, lower }) {
  if (lane === "music" || lane === "years") return true;
  if (mode && MUSIC_MODES.has(normLower(mode))) return true;

  const a = normalizeMusicAction(action);
  if (a && MUSIC_ACTIONS_STRONG.has(a)) return true;

  if (
    year &&
    /\b(top\s*10|top10|hot\s*100|billboard|chart|charts|story\s*moment|micro\s*moment|#\s*1|#1|number\s*one|no\.\s*1|no\s*1|no1)\b/.test(
      lower
    )
  )
    return true;

  return false;
}

/* ======================================================
   YEAR-STICKY MUSIC
====================================================== */

function getStickyMusicYear(session) {
  if (!session || typeof session !== "object") return null;

  const a = clampYear(session.lastMusicYear);
  if (a) return a;

  const c = session.cog && typeof session.cog === "object" ? session.cog : null;
  if (c) {
    const b = clampYear(c.lastMusicYear);
    if (b) return b;
    const d = clampYear(c.year);
    if (d) return d;
  }

  return null;
}

function needsYearForMode(mode) {
  const m = normLower(mode);
  return (
    m === "top10" ||
    m === "number_one" ||
    m === "micro" ||
    m === "story" ||
    m === "charts" ||
    m === "year_end"
  );
}

/* ======================================================
   Knowledge helpers (FLEX pack shapes) — UPDATED
====================================================== */

function normalizeSongLine(item) {
  if (!item) return null;
  if (isString(item)) return item.trim();
  if (isPlainObject(item)) {
    const title = normText(item.title || item.song || item.name);
    const artist = normText(item.artist || item.by);

    // FIX: honor pos/position/# as rank, not just rank
    const rankRaw =
      item.rank != null
        ? item.rank
        : item.pos != null
        ? item.pos
        : item.position != null
        ? item.position
        : item["#"] != null
        ? item["#"]
        : null;

    const rank = rankRaw != null ? String(rankRaw).trim() : "";

    const bits = [];
    if (rank) bits.push(rank + ".");
    if (title) bits.push(title);
    if (artist) bits.push("— " + artist);
    const out = bits.join(" ").trim();
    return out || null;
  }
  return null;
}

// Option A canonical pinned keys (single source of truth)
const PINNED_TOP10_KEY = "music/top10_by_year";
const PINNED_NUMBER1_KEY = "music/number1_by_year";
const PINNED_STORY_KEY = "music/story_moments_by_year";
const PINNED_MICRO_KEY = "music/micro_moments_by_year";

// Compatibility keys (dev-safety only)
const PIN_TOP10_KEYS = ["music/top10_by_year", "music/top10"];
const PIN_NUMBER1_KEYS = [
  "music/number1_by_year",
  "music/number1",
  "music/number_one_by_year",
  "music/no1_by_year",
];
const PIN_STORY_KEYS = ["music/story_moments_by_year", "music/story_moments", "music/moments"];
const PIN_MICRO_KEYS = ["music/micro_moments_by_year", "music/micro_moments", "music/micro"];

const KNOWLEDGE_SCAN_CAP = 1200;

// NEW: unwrap common wrapper shapes (now also treats {rows:[...]} wrappers)
function unwrapPackValue(v, depth = 0) {
  if (depth > 4) return v;
  if (v == null) return v;

  if (isArray(v)) return v;
  if (!isPlainObject(v)) return v;

  // If this is a "wrapper" object with {rows:[...]} and maybe meta, treat wrapper as the pack.
  if (isArray(v.rows) && v.rows.length) return v;

  const cands = ["data", "json", "value", "content", "pack", "parsed", "payload"];
  for (const k of cands) {
    if (Object.prototype.hasOwnProperty.call(v, k)) {
      const inner = v[k];
      if (inner != null) return unwrapPackValue(inner, depth + 1);
    }
  }

  if (Object.prototype.hasOwnProperty.call(v, "blob") && v.blob != null) {
    return unwrapPackValue(v.blob, depth + 1);
  }

  return v;
}

function shapeHint(x) {
  if (isArray(x)) return "array";
  if (isPlainObject(x)) {
    const keys = Object.keys(x);
    const head = keys.slice(0, 6).join(",");
    return `object(${keys.length})[${head}]`;
  }
  return typeof x;
}

function getPinnedPacks(knowledgeJson) {
  const kj = knowledgeJson && isPlainObject(knowledgeJson) ? knowledgeJson : Object.create(null);

  const top10 = Object.prototype.hasOwnProperty.call(kj, PINNED_TOP10_KEY)
    ? unwrapPackValue(kj[PINNED_TOP10_KEY])
    : null;
  const number1 = Object.prototype.hasOwnProperty.call(kj, PINNED_NUMBER1_KEY)
    ? unwrapPackValue(kj[PINNED_NUMBER1_KEY])
    : null;
  const story = Object.prototype.hasOwnProperty.call(kj, PINNED_STORY_KEY)
    ? unwrapPackValue(kj[PINNED_STORY_KEY])
    : null;
  const micro = Object.prototype.hasOwnProperty.call(kj, PINNED_MICRO_KEY)
    ? unwrapPackValue(kj[PINNED_MICRO_KEY])
    : null;

  return { top10, number1, story, micro };
}

// NEW: extract year rows from a rows-array payload like {rows:[{year,rank,title,artist}...]}
function extractRowsForYearFromRowsWrapper(wrapper, year) {
  const v = unwrapPackValue(wrapper);
  if (!isPlainObject(v)) return null;
  const rows = unwrapPackValue(v.rows);
  if (!isArray(rows) || !rows.length) return null;

  const y = Number(year);
  const picked = [];
  for (const r of rows) {
    if (!isPlainObject(r)) continue;
    const ry = clampYear(r.year ?? r.Year ?? r.y ?? r.yr ?? r.Y);
    if (ry !== y) continue;
    picked.push(r);
  }
  return picked.length ? picked : null;
}

// NEW: accept common "year object" containers like {items:[...]} (top10_by_year_v1)
function _extractListFromYearObject(v) {
  if (!isPlainObject(v)) return null;
  const cands = [v.items, v.top10, v.top_10, v.list, v.songs, v.chart, v.entries];
  for (const c of cands) {
    if (isArray(c) && c.length) return c;
  }
  return null;
}

// NEW: explicit fast-path for top10_by_year_v1 canonical structure:
// { version, chart, years:{ "1960":{ items:[...] } } }
function fastPathTop10YearsItems(obj, year) {
  const o = unwrapPackValue(obj);
  if (!isPlainObject(o)) return null;
  const years = unwrapPackValue(o.years);
  if (!isPlainObject(years)) return null;

  const yStr = String(year);
  const yo = years[yStr] || years[year];
  if (!isPlainObject(yo)) return null;

  const list = _extractListFromYearObject(yo);
  return list && list.length ? list : null;
}

function findYearArrayInObject(obj, year) {
  const o = unwrapPackValue(obj);
  if (!isPlainObject(o)) return null;

  // FAST-PATH: canonical top10_by_year_v1 wrapper
  const fp = fastPathTop10YearsItems(o, year);
  if (fp) return fp;

  const y = String(year);

  // Direct year maps
  if (o[y] && isArray(o[y])) return o[y];
  if (o[year] && isArray(o[year])) return o[year];

  // Direct year object with items/list/etc
  if (o[y] && isPlainObject(o[y])) {
    const got = _extractListFromYearObject(o[y]);
    if (got) return got;
  }
  if (o[year] && isPlainObject(o[year])) {
    const got = _extractListFromYearObject(o[year]);
    if (got) return got;
  }

  // Support rows wrapper
  const asRows = extractRowsForYearFromRowsWrapper(o, year);
  if (asRows) return asRows;

  const candidates = [o.data, o.years, o.byYear, o.year, o.by_year];
  for (const c of candidates) {
    const cc = unwrapPackValue(c);
    if (!isPlainObject(cc)) continue;

    // nested wrapper might itself be top10_by_year_v1
    const fp2 = fastPathTop10YearsItems(cc, year);
    if (fp2) return fp2;

    if (cc[y] && isArray(cc[y])) return cc[y];
    if (cc[year] && isArray(cc[year])) return cc[year];

    if (cc[y] && isPlainObject(cc[y])) {
      const got = _extractListFromYearObject(cc[y]);
      if (got) return got;
    }
    if (cc[year] && isPlainObject(cc[year])) {
      const got = _extractListFromYearObject(cc[year]);
      if (got) return got;
    }

    const rows2 = extractRowsForYearFromRowsWrapper(cc, year);
    if (rows2) return rows2;
  }

  return null;
}

function findYearTextInObject(obj, year) {
  const o = unwrapPackValue(obj);
  if (!isPlainObject(o)) return null;
  const y = String(year);

  const v1 = o[y] || o[year];
  if (isString(v1) && v1.trim()) return v1.trim();
  if (isPlainObject(v1) && isString(v1.moment || v1.story || v1.text))
    return normText(v1.moment || v1.story || v1.text);

  const candidates = [o.data, o.years, o.byYear, o.year, o.by_year];
  for (const c of candidates) {
    const cc = unwrapPackValue(c);
    if (!isPlainObject(cc)) continue;
    const v = cc[y] || cc[year];
    if (isString(v) && v.trim()) return v.trim();
    if (isPlainObject(v) && isString(v.moment || v.story || v.text))
      return normText(v.moment || v.story || v.text);
  }

  return null;
}

function findMomentInRowsArray(arr, year) {
  const a = unwrapPackValue(arr);
  if (!isArray(a)) return null;
  const y = Number(year);

  for (const row of a) {
    if (!isPlainObject(row)) continue;
    const ry = clampYear(row.year || row.y || row.yr);
    if (ry !== y) continue;

    const t = normText(row.moment || row.story || row.text || row.copy || "");
    if (t) return t;
  }
  return null;
}

function findNumberOneInRowsArray(arr, year) {
  const a = unwrapPackValue(arr);
  if (!isArray(a)) return null;
  const y = Number(year);

  for (const row of a) {
    if (!isPlainObject(row)) continue;
    const ry = clampYear(row.year || row.y || row.yr);
    if (ry !== y) continue;

    const title = normText(row.title || row.song || row.name || row.track);
    const artist = normText(row.artist || row.by || row.performer);
    if (title && artist) return { title, artist };
    if (title) return { title, artist: "" };
  }
  return null;
}

function findYearInArrayPack(arr, year) {
  const a = unwrapPackValue(arr);
  if (!isArray(a)) return null;
  const y = Number(year);

  for (const row of a) {
    if (!isPlainObject(row)) continue;
    const ry = clampYear(row.year || row.y || row.yr);
    if (ry !== y) continue;

    const list = row.top10 || row.top_10 || row.list || row.songs || row.chart || row.entries;
    if (isArray(list) && list.length) return list;
  }

  return null;
}

function keyLooksLikeTop10(k) {
  const kl = String(k || "").toLowerCase();
  if (!kl) return false;
  return (
    kl.includes("top10_by_year") ||
    kl.includes("top10-by-year") ||
    kl.includes("top_10_by_year") ||
    kl.includes("top10") ||
    kl.includes("top_10") ||
    kl.includes("topten") ||
    kl.includes("chart") ||
    kl.includes("charts")
  );
}

function keyLooksLikeMoment(k) {
  const kl = String(k || "").toLowerCase();
  if (!kl) return false;
  return kl.includes("moment") || kl.includes("story") || kl.includes("micro");
}

function keyLooksLikeNumberOne(k) {
  const kl = String(k || "").toLowerCase();
  if (!kl) return false;
  return (
    kl.includes("number1_by_year") ||
    kl.includes("number_one_by_year") ||
    kl.includes("no1_by_year") ||
    kl.includes("number1") ||
    kl.includes("number_one") ||
    kl.includes("no1")
  );
}

/**
 * Pinned-only resolvers, with dev-safety fallback if pinned missing.
 */

function findTop10PinnedFirst(pinned, knowledgeJson, year) {
  const y = clampYear(year);
  if (!y) return null;

  if (pinned && pinned.top10) {
    const v = pinned.top10;

    // FAST-PATH (again) in case pinned wrapper is intact
    const fp = fastPathTop10YearsItems(v, y);
    if (fp && fp.length)
      return { sourceKey: PINNED_TOP10_KEY, list: fp, shape: shapeHint(v), pinned: true };

    const direct = findYearArrayInObject(v, y);
    if (direct && direct.length)
      return { sourceKey: PINNED_TOP10_KEY, list: direct, shape: shapeHint(v), pinned: true };

    // If pinned is {rows:[{year,rank,title,artist}...]} support it directly
    const rowsPicked = extractRowsForYearFromRowsWrapper(v, y);
    if (rowsPicked && rowsPicked.length)
      return { sourceKey: PINNED_TOP10_KEY, list: rowsPicked, shape: shapeHint(v), pinned: true };

    const asArr = findYearInArrayPack(v, y);
    if (asArr && asArr.length)
      return { sourceKey: PINNED_TOP10_KEY, list: asArr, shape: shapeHint(v), pinned: true };
  }

  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;

  for (const k of PIN_TOP10_KEYS) {
    if (k === PINNED_TOP10_KEY) continue;
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const fp = fastPathTop10YearsItems(v, y);
    if (fp && fp.length) return { sourceKey: k, list: fp, shape: shapeHint(v), pinned: false };

    const direct = findYearArrayInObject(v, y);
    if (direct && direct.length) return { sourceKey: k, list: direct, shape: shapeHint(v), pinned: false };

    const rowsPicked = extractRowsForYearFromRowsWrapper(v, y);
    if (rowsPicked && rowsPicked.length) return { sourceKey: k, list: rowsPicked, shape: shapeHint(v), pinned: false };

    const asArr = findYearInArrayPack(v, y);
    if (asArr && asArr.length) return { sourceKey: k, list: asArr, shape: shapeHint(v), pinned: false };
  }

  const keys = Object.keys(knowledgeJson).slice(0, KNOWLEDGE_SCAN_CAP);
  for (const k of keys) {
    if (!keyLooksLikeTop10(k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const fp = fastPathTop10YearsItems(v, y);
    if (fp && fp.length) return { sourceKey: k, list: fp, shape: shapeHint(v), pinned: false };

    const direct = findYearArrayInObject(v, y);
    if (direct && direct.length) return { sourceKey: k, list: direct, shape: shapeHint(v), pinned: false };

    const rowsPicked = extractRowsForYearFromRowsWrapper(v, y);
    if (rowsPicked && rowsPicked.length) return { sourceKey: k, list: rowsPicked, shape: shapeHint(v), pinned: false };

    const asArr = findYearInArrayPack(v, y);
    if (asArr && asArr.length) return { sourceKey: k, list: asArr, shape: shapeHint(v), pinned: false };
  }

  return null;
}

function findStoryPinnedFirst(pinned, knowledgeJson, year) {
  const y = clampYear(year);
  if (!y) return null;

  if (pinned && pinned.story) {
    const v = pinned.story;

    const t1 = findYearTextInObject(v, y);
    if (t1) return { sourceKey: PINNED_STORY_KEY, text: t1, shape: shapeHint(v), pinned: true };

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const t2 = rows ? findMomentInRowsArray(rows, y) : null;
    if (t2) return { sourceKey: PINNED_STORY_KEY, text: t2, shape: shapeHint(v), pinned: true };
  }

  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;

  for (const k of PIN_STORY_KEYS) {
    if (k === PINNED_STORY_KEY) continue;
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const t1 = findYearTextInObject(v, y);
    if (t1) return { sourceKey: k, text: t1, shape: shapeHint(v), pinned: false };

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const t2 = rows ? findMomentInRowsArray(rows, y) : null;
    if (t2) return { sourceKey: k, text: t2, shape: shapeHint(v), pinned: false };
  }

  const keys = Object.keys(knowledgeJson).slice(0, KNOWLEDGE_SCAN_CAP);
  for (const k of keys) {
    if (!keyLooksLikeMoment(k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const t1 = findYearTextInObject(v, y);
    if (t1) return { sourceKey: k, text: t1, shape: shapeHint(v), pinned: false };

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const t2 = rows ? findMomentInRowsArray(rows, y) : null;
    if (t2) return { sourceKey: k, text: t2, shape: shapeHint(v), pinned: false };
  }

  return null;
}

function findMicroPinnedFirst(pinned, knowledgeJson, year) {
  const y = clampYear(year);
  if (!y) return null;

  if (pinned && pinned.micro) {
    const v = pinned.micro;

    const t1 = findYearTextInObject(v, y);
    if (t1) return { sourceKey: PINNED_MICRO_KEY, text: t1, shape: shapeHint(v), pinned: true };

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const t2 = rows ? findMomentInRowsArray(rows, y) : null;
    if (t2) return { sourceKey: PINNED_MICRO_KEY, text: t2, shape: shapeHint(v), pinned: true };
  }

  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;

  for (const k of PIN_MICRO_KEYS) {
    if (k === PINNED_MICRO_KEY) continue;
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const t1 = findYearTextInObject(v, y);
    if (t1) return { sourceKey: k, text: t1, shape: shapeHint(v), pinned: false };

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const t2 = rows ? findMomentInRowsArray(rows, y) : null;
    if (t2) return { sourceKey: k, text: t2, shape: shapeHint(v), pinned: false };
  }

  const keys = Object.keys(knowledgeJson).slice(0, KNOWLEDGE_SCAN_CAP);
  for (const k of keys) {
    if (!keyLooksLikeMoment(k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const t2 = rows ? findMomentInRowsArray(rows, y) : null;
    if (t2) return { sourceKey: k, text: t2, shape: shapeHint(v), pinned: false };
  }

  return null;
}

function findNumberOnePinnedFirst(pinned, knowledgeJson, year) {
  const y = clampYear(year);
  if (!y) return null;

  if (pinned && pinned.number1) {
    const v = pinned.number1;
    const yStr = String(y);

    if (isPlainObject(v)) {
      const direct = v[yStr] || v[y];
      if (isPlainObject(direct)) {
        const title = normText(direct.title || direct.song || direct.name || direct.track);
        const artist = normText(direct.artist || direct.by || direct.performer);
        if (title)
          return {
            sourceKey: PINNED_NUMBER1_KEY,
            entry: { title, artist },
            shape: shapeHint(v),
            pinned: true,
          };
      }
    }

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const hit = rows ? findNumberOneInRowsArray(rows, y) : null;
    if (hit) return { sourceKey: PINNED_NUMBER1_KEY, entry: hit, shape: shapeHint(v), pinned: true };
  }

  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;

  for (const k of PIN_NUMBER1_KEYS) {
    if (k === PINNED_NUMBER1_KEY) continue;
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, k)) continue;
    const v = unwrapPackValue(knowledgeJson[k]);

    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const hit = rows ? findNumberOneInRowsArray(rows, y) : null;
    if (hit) return { sourceKey: k, entry: hit, shape: shapeHint(v), pinned: false };

    if (isPlainObject(v)) {
      const yStr = String(y);
      const cand =
        v[yStr] ||
        v[y] ||
        (isPlainObject(v.byYear) ? v.byYear[yStr] || v.byYear[y] : null);
      if (isPlainObject(cand)) {
        const title = normText(cand.title || cand.song || cand.name || cand.track);
        const artist = normText(cand.artist || cand.by || cand.performer);
        if (title) return { sourceKey: k, entry: { title, artist }, shape: shapeHint(v), pinned: false };
      }
    }
  }

  const keys = Object.keys(knowledgeJson).slice(0, KNOWLEDGE_SCAN_CAP);
  for (const k of keys) {
    if (!keyLooksLikeNumberOne(k)) continue;

    const v = unwrapPackValue(knowledgeJson[k]);
    const rows = isPlainObject(v) ? unwrapPackValue(v.rows) : null;
    const hit = rows ? findNumberOneInRowsArray(rows, y) : null;
    if (hit) return { sourceKey: k, entry: hit, shape: shapeHint(v), pinned: false };

    if (isPlainObject(v)) {
      const yStr = String(y);
      const cand =
        v[yStr] ||
        v[y] ||
        (isPlainObject(v.byYear) ? v.byYear[yStr] || v.byYear[y] : null);
      if (isPlainObject(cand)) {
        const title = normText(cand.title || cand.song || cand.name || cand.track);
        const artist = normText(cand.artist || cand.by || cand.performer);
        if (title) return { sourceKey: k, entry: { title, artist }, shape: shapeHint(v), pinned: false };
      }
    }
  }

  return null;
}

/* ======================================================
   TOP10 LOOSE ACCEPTANCE (SAFE DERIVATION + PROVENANCE)
   UPDATED: supports {rows:[...]} payloads + yearObj.items
====================================================== */

function _parseRank(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  const s = normText(v);
  const m = s.match(/^\s*(\d{1,3})\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

function _splitTitleArtist(s) {
  const t = normText(s);
  const seps = [" — ", " – ", " - ", ": "];
  for (const sep of seps) {
    const idx = t.indexOf(sep);
    if (idx > 0 && idx < t.length - sep.length) {
      const a = t.slice(0, idx).trim();
      const b = t.slice(idx + sep.length).trim();
      return { title: a, artist: b, split: true };
    }
  }
  return { title: t, artist: "", split: false };
}

function _extractYearRowsFromPayload(payload, year) {
  const yStr = String(year);
  const p = unwrapPackValue(payload);

  if (isPlainObject(p)) {
    // canonical fast-path (again) for top10_by_year_v1
    const fp = fastPathTop10YearsItems(p, year);
    if (fp) return fp;

    // direct year maps
    const direct = p[yStr] || p[year];
    if (isArray(direct)) return direct;

    // direct year object with items/list/etc
    if (isPlainObject(direct)) {
      const got = _extractListFromYearObject(direct);
      if (got) return got;
    }

    // common nests
    const byYear = unwrapPackValue(p.byYear || p.by_year || p.years || p.data || null);
    if (isPlainObject(byYear)) {
      const fp2 = fastPathTop10YearsItems(byYear, year);
      if (fp2) return fp2;

      const v = byYear[yStr] || byYear[year];
      if (isArray(v)) return v;

      // nested year object with items/list/etc
      if (isPlainObject(v)) {
        const got = _extractListFromYearObject(v);
        if (got) return got;
      }
    }

    // rows wrapper
    if (isArray(p.rows)) {
      const picked = extractRowsForYearFromRowsWrapper(p, year);
      if (picked) return picked;
    }
  }

  if (isArray(p)) {
    const rows = p.filter((r) => {
      if (!isPlainObject(r)) return false;
      const ry = clampYear(r.year ?? r.Year ?? r.y ?? r.yr ?? r.Y);
      return ry === year;
    });
    if (rows.length) return rows;
    return p;
  }

  return null;
}

function _normalizeTop10Rows(rows) {
  if (!isArray(rows)) return null;

  const out = [];
  for (const r of rows) {
    if (!r) continue;

    if (typeof r === "string") {
      const s = r.trim().replace(/^\s*#?\s*/, "");
      const m = s.match(/^(\d{1,3})\s*[\.\)]\s*(.+)$/);
      const rank = m ? parseInt(m[1], 10) : null;
      const rest = m ? m[2] : s;
      const ta = _splitTitleArtist(rest);
      out.push({ rank, title: ta.title || "Unknown", artist: ta.artist || "Unknown" });
      continue;
    }

    if (isPlainObject(r)) {
      const rank = _parseRank(r.rank ?? r.Rank ?? r.position ?? r.pos ?? r["#"] ?? r.no ?? r.number);

      let title = normText(r.title ?? r.song ?? r.Song ?? r.track ?? r.name);
      let artist = normText(r.artist ?? r.Artist ?? r.performer);

      if (!title) title = normText(r.entry ?? r.Item ?? r.single ?? r.value ?? r.text ?? r.line);
      if (title && !artist) {
        const ta = _splitTitleArtist(title);
        if (ta.split && ta.artist) {
          title = ta.title;
          artist = ta.artist;
        }
      }

      out.push({
        rank,
        title: title || "Unknown",
        artist: artist || "Unknown",
      });
    }
  }

  const cleaned = out
    .filter((x) => x && typeof x.rank === "number" && x.rank >= 1 && x.rank <= 10)
    .sort((a, b) => a.rank - b.rank);

  const byRank = new Map();
  for (const x of cleaned) {
    if (!byRank.has(x.rank)) byRank.set(x.rank, x);
  }

  const top10 = [];
  for (let i = 1; i <= 10; i++) {
    if (!byRank.has(i)) return null;
    top10.push(byRank.get(i));
  }

  return top10;
}

function resolveTop10LooseButSafe(knowledgeJson, year) {
  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;
  const y = clampYear(year);
  if (!y) return null;

  const candidates = [
    { id: "music/top10_by_year", method: "direct", confidence: "high" },
    {
      id: "wikipedia/billboard_yearend_hot100_1970_2010",
      method: "derived_top10_from_wikipedia_yearend",
      confidence: "medium",
    },
    {
      id: "wikipedia/billboard_yearend_singles_1950_1959",
      method: "derived_top10_from_wikipedia_yearend",
      confidence: "medium",
    },

    // REMOVED: this was causing the loop you reported
    // { id: "top100_billboard_yearend_1960s_v1", method: "derived_top10_from_yearend", confidence: "medium" },

    { id: "top10_by_year_source_v1", method: "derived_top10_from_source_table", confidence: "low" },
  ];

  for (const c of candidates) {
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, c.id)) continue;

    const raw = knowledgeJson[c.id];
    const pack = unwrapPackValue(raw);

    const payload = isPlainObject(pack)
      ? unwrapPackValue(
          pack.data ?? pack.payload ?? pack.value ?? pack.json ?? pack.content ?? pack.parsed ?? pack
        )
      : pack;

    const rows = _extractYearRowsFromPayload(payload, y);

    let rows2 = rows;
    if (isArray(rows) && rows.length && isPlainObject(rows[0])) {
      const nested = findYearInArrayPack(rows, y);
      if (nested && isArray(nested)) rows2 = nested;
    }

    const top10 = _normalizeTop10Rows(rows2);
    if (top10) {
      return {
        year: y,
        top10,
        sourceId: c.id,
        method: c.method,
        confidence: c.confidence,
        shape: shapeHint(payload),
      };
    }
  }

  return null;
}

/* ======================================================
   Music responder
====================================================== */

function formatTop10Reply(year, list) {
  const lines = [];
  const top = list.slice(0, 10);

  for (let i = 0; i < top.length; i++) {
    const line = normalizeSongLine(top[i]) || null;
    if (!line) continue;
    const hasRank = /^\s*\d+\./.test(line);
    lines.push(hasRank ? line : `${i + 1}. ${line}`);
  }

  if (!lines.length) return `Top 10 songs of ${year}: (data loaded, but format is unexpected).`;
  return `Top 10 songs of ${year}:\n\n${lines.join("\n")}`;
}

function formatNumberOneLine(entry) {
  if (!entry || !isPlainObject(entry)) return "";
  const title = normText(entry.title);
  const artist = normText(entry.artist);
  if (title && artist) return `${title} — ${artist}`;
  if (title) return title;
  return "";
}

function buildPowerChainFollowUps(year) {
  const y = clampYear(year);
  if (!y) return [];

  return [
    { id: "chain_no1", type: "chip", label: "#1 song", payload: { lane: "music", action: "year", year: y, mode: "number_one" } },
    { id: "chain_top10", type: "chip", label: "Top 10", payload: { lane: "music", action: "year", year: y, mode: "top10" } },
    { id: "chain_micro", type: "chip", label: "Micro moment", payload: { lane: "music", action: "year", year: y, mode: "micro" } },
    { id: "chain_story", type: "chip", label: "Story moment", payload: { lane: "music", action: "year", year: y, mode: "story" } },
  ];
}

function musicReply({ year, mode, knowledge, yearSource }) {
  const y = clampYear(year);
  const m = normalizeMode(mode, "", "");

  // LOOP-KILLER: Top 10 requires explicit year. Never answer Top10 from sticky year.
  if (m === "top10" && yearSource === "sticky") {
    const chips = sanitizeFollowUps([
      { id: "pick_1960", type: "chip", label: "1960 Top 10", payload: { lane: "music", action: "year", year: 1960, mode: "top10" } },
      { id: "pick_1977", type: "chip", label: "1977 Top 10", payload: { lane: "music", action: "year", year: 1977, mode: "top10" } },
      { id: "pick_1988", type: "chip", label: "1988 Top 10", payload: { lane: "music", action: "year", year: 1988, mode: "top10" } },
      { id: "pick_1999", type: "chip", label: "1999 Top 10", payload: { lane: "music", action: "year", year: 1999, mode: "top10" } },
    ]);

    return {
      reply: "Top 10 needs a specific year (1950–2025). Tap a year chip or type one in.",
      followUps: chips,
      sessionPatch: { lane: "music", activeMusicMode: "top10" },
      meta: { used: "top10_requires_explicit_year" },
    };
  }

  if (!y) {
    return {
      reply: "Pick a year between 1950 and 2025 and I’ll pull the Top 10, #1, or a story moment — your call.",
      followUps: sanitizeFollowUps([
        { id: "y1981", type: "chip", label: "1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
        { id: "y1981no1", type: "chip", label: "#1 song (1981)", payload: { lane: "music", action: "year", year: 1981, mode: "number_one" } },
        { id: "y1988", type: "chip", label: "1988 Story moment", payload: { lane: "music", action: "year", year: 1988, mode: "story" } },
      ]),
      sessionPatch: { lane: "music", activeMusicMode: m && MUSIC_MODES.has(m) ? m : "top10" },
      meta: { used: "music_no_year" },
    };
  }

  const knowledgeJson = knowledge && knowledge.json && isPlainObject(knowledge.json) ? knowledge.json : null;
  const pinned = getPinnedPacks(knowledgeJson);

  const wantsTop10 = m === "top10";
  const wantsNumberOne = m === "number_one";
  const wantsMicro = m === "micro";
  const wantsStory = m === "story";
  const wantsCharts = m === "charts" || m === "year_end";

  let reply = "";
  let diag = null;

  if (wantsNumberOne) {
    const no1 = findNumberOnePinnedFirst(pinned, knowledgeJson, y);
    if (no1 && no1.entry) {
      const line = formatNumberOneLine(no1.entry);
      reply = line ? `#1 song of ${y}: ${line}` : `#1 song of ${y}: (data loaded, format unexpected).`;
      reply += `\n\nSource: ${no1.sourceKey} • Method: direct • Confidence: ${no1.pinned ? "high" : "medium"}`;
      reply += `\n\nPower move: want the Top 10 for context, then a micro moment to seal the vibe?`;
      diag = { no1Key: no1.sourceKey, no1Shape: no1.shape || null, pinned: !!no1.pinned };
    } else {
      const derived = resolveTop10LooseButSafe(knowledgeJson, y);
      if (derived && isArray(derived.top10) && derived.top10.length) {
        const first = normalizeSongLine(derived.top10[0]) || null;
        reply = first ? `#1 song of ${y}: ${first}` : `#1 song of ${y}: (data loaded, format unexpected).`;
        reply += `\n\nSource: ${derived.sourceId} • Method: ${derived.method} • Confidence: ${derived.confidence}`;
        reply += `\n\nPower move: pull the full Top 10 next, then a micro moment.`;
        diag = {
          top10HitKey: derived.sourceId,
          top10HitShape: derived.shape || null,
          top10Len: derived.top10.length,
          top10Method: derived.method,
          top10Confidence: derived.confidence,
        };
      } else {
        reply = `#1 song of ${y}: I can pull it once the #1-by-year pack is loaded (${PINNED_NUMBER1_KEY}).`;
        diag = { no1Key: null, pinnedMissing: !pinned.number1 };
      }
    }
  } else if (wantsTop10) {
    const hit = findTop10PinnedFirst(pinned, knowledgeJson, y);
    const derived = !hit || !isArray(hit.list) || hit.list.length < 10 ? resolveTop10LooseButSafe(knowledgeJson, y) : null;

    if (derived && isArray(derived.top10) && derived.top10.length === 10) {
      reply = formatTop10Reply(y, derived.top10);
      reply += `\n\nSource: ${derived.sourceId} • Method: ${derived.method} • Confidence: ${derived.confidence}`;
      reply += `\n\nPower move: tap “#1 song” to anchor, then “Micro moment” to make it cinematic.`;
      diag = {
        top10HitKey: derived.sourceId,
        top10HitShape: derived.shape || null,
        top10Len: derived.top10.length,
        top10Method: derived.method,
        top10Confidence: derived.confidence,
      };
    } else if (hit && isArray(hit.list) && hit.list.length >= 10) {
      reply = formatTop10Reply(y, hit.list);
      reply += `\n\nSource: ${hit.sourceKey} • Method: direct • Confidence: ${hit.pinned ? "high" : "medium"}`;
      reply += `\n\nPower move: go #1 → Micro moment. That’s your “broadcast-tight” chain.`;
      diag = { top10HitKey: hit.sourceKey, top10HitShape: hit.shape || null, top10Len: hit.list.length, pinned: !!hit.pinned };
    } else if (hit && isArray(hit.list) && hit.list.length) {
      reply =
        `Top songs of ${y} (partial list from loaded sources):\n\n${hit.list
          .slice(0, 10)
          .map((v, i) => `${i + 1}. ${normalizeSongLine(v) || String(v)}`)
          .join("\n")}`;
      reply += `\n\nSource: ${hit.sourceKey} • Method: partial • Confidence: low`;
      diag = { top10HitKey: hit.sourceKey, top10HitShape: hit.shape || null, top10Len: hit.list.length, pinned: !!hit.pinned };
    } else {
      reply =
        `I can’t responsibly assemble a clean Top 10 for ${y} from the currently loaded sources. ` +
        `If you want, I can show the closest ranked list I *do* have and tell you exactly which pack it came from.`;
      diag = { top10HitKey: null, top10Len: 0, pinnedMissing: !pinned.top10 };
    }
  } else if (wantsMicro) {
    const micro = findMicroPinnedFirst(pinned, knowledgeJson, y);
    reply =
      micro && micro.text
        ? `Micro moment (${y}): ${clampStr(micro.text, 260)}`
        : `Micro moment for ${y}: give me a vibe (soul, rock, pop) or an artist and I’ll make it razor-specific.`;
    diag = micro
      ? { microKey: micro.sourceKey, microShape: micro.shape || null, pinned: !!micro.pinned }
      : { microKey: null, pinnedMissing: !pinned.micro };
  } else if (wantsStory) {
    const story = findStoryPinnedFirst(pinned, knowledgeJson, y);
    reply =
      story && story.text
        ? `Story moment for ${y}: ${clampStr(story.text, 900)}`
        : `Story moment for ${y}: I can anchor it on the year’s #1 song and give you the cultural pulse in 50–60 words.`;
    diag = story
      ? { storyKey: story.sourceKey, storyShape: story.shape || null, pinned: !!story.pinned }
      : { storyKey: null, pinnedMissing: !pinned.story };
  } else if (wantsCharts) {
    reply = `Got it — ${y}. Do you want the Top 10 list, or just the #1 with a quick story moment?`;
  } else {
    reply = `Tell me what you want for ${y}: Top 10, #1, story moment, or a micro moment.`;
  }

  const followUps = buildPowerChainFollowUps(y);

  // IMPORTANT: do NOT persist sticky-borrowed years as canonical lastMusicYear.
  const persistYear = yearSource === "payload" || yearSource === "text" || yearSource === "classifier";

  const sp = { lane: "music", activeMusicMode: m && MUSIC_MODES.has(m) ? m : "top10" };
  if (persistYear) sp.lastMusicYear = y;

  return {
    reply,
    followUps,
    sessionPatch: sp,
    meta: { used: "music_reply", mode: m || null, diag: diag || null },
  };
}

/* ======================================================
   System responder
====================================================== */

function buildSystemHelpFollowUps() {
  return sanitizeFollowUps([
    { id: "sys_music", type: "chip", label: "Music by year", payload: { lane: "music", action: "start", mode: "top10" } },
    { id: "sys_1981", type: "chip", label: "1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
    { id: "sys_1988", type: "chip", label: "1988 Story moment", payload: { lane: "music", action: "year", year: 1988, mode: "story" } },
    { id: "sys_reset", type: "chip", label: "Reset", payload: { lane: "system", action: "reset" } },
  ]);
}

function handleSystem({ action, session }) {
  const a = normLower(action);

  if (a === "reset") {
    try {
      delete session.__replay;
      delete session.__loop;
    } catch (_) {}

    try {
      session.__turnCount = 0;
      session.allowPackets = true;
      session.lane = "general";
      session.lastMusicYear = null;
      session.activeMusicMode = null;
      session.activeMusicChart = null;
      session.lastMusicChart = null;
      session.__musicLastSig = null;
      session.lastIntentSig = null;
      session.__packIndexSeen = false;
      session.depthLevel = 0;
      session.recentIntent = null;
      session.recentTopic = null;
    } catch (_) {}

    const followUps = sanitizeFollowUps([
      { id: "r_music", type: "chip", label: "Music", payload: { lane: "music", action: "start", mode: "top10", text: "Pick a year" } },
      { id: "r_talk", type: "chip", label: "Just talk", payload: { lane: "general", action: "free", text: "Just talk" } },
      { id: "r_help", type: "chip", label: "What can you do?", payload: { lane: "system", action: "help" } },
    ]);

    return {
      reply: "Reset done. Where do you want to go next?",
      followUps,
      sessionPatch: {
        lane: "general",
        allowPackets: true,
        lastMusicYear: null,
        activeMusicMode: null,
        activeMusicChart: null,
        lastMusicChart: null,
        __musicLastSig: null,
        depthLevel: 0,
        recentIntent: null,
        recentTopic: null,
      },
      meta: { used: "system_reset" },
      directives: [{ type: "reset" }],
    };
  }

  return {
    reply:
      "Here’s what I can do right now:\n" +
      "• Music by year (Top 10, #1 song, story moment, micro moment)\n" +
      "• Keep the chain going with smart follow-ups (no dead ends)\n" +
      "• General Q&A when you just want to talk\n\n" +
      "Pick a chip and I’ll drive.",
    followUps: buildSystemHelpFollowUps(),
    sessionPatch: { lane: "general", allowPackets: true },
    meta: { used: "system_help" },
  };
}

/* ======================================================
   Packets gate + always-advance
====================================================== */

function computeAllowPackets({ structuredMusic, lane }) {
  if (structuredMusic) return false;
  if (lane === "music" || lane === "years") return false;
  return true;
}

function ensureAdvance({ reply, followUps }) {
  const r = normText(reply);
  if (r) return { reply: r, followUps };

  const chips =
    Array.isArray(followUps) && followUps.length
      ? followUps
      : [
          { id: "help", type: "chip", label: "What can you do?", payload: { lane: "system", action: "help" } },
          { id: "music", type: "chip", label: "Music by year", payload: { lane: "music", action: "start" } },
          { id: "reset", type: "chip", label: "Reset", payload: { lane: "system", action: "reset" } },
        ];

  return {
    reply: "I’m here — tell me what you want next, or tap a chip and I’ll take it from there.",
    followUps: chips,
  };
}

/* ======================================================
   Intent classifier integration (optional) — TOP40 PURGED
====================================================== */

function getIntentSignals(text, payload) {
  if (!intentClassifier) return null;
  try {
    if (typeof intentClassifier.classify === "function") {
      return intentClassifier.classify(text, { payload: payload || null });
    }
    if (typeof intentClassifier.classifyIntent === "function") {
      return intentClassifier.classifyIntent(text);
    }
  } catch (_) {}
  return null;
}

function mapMusicActionToMode(musicAction) {
  const a = normalizeMusicAction(musicAction);
  if (!a) return "";
  if (a === "top10") return "top10";
  if (a === "year_end") return "year_end";
  if (a === "number_one") return "number_one";
  if (a === "charts") return "charts";
  if (a === "story") return "story";
  if (a === "micro") return "micro";
  return a;
}

/* ======================================================
   Public API
====================================================== */

async function handleChat(input = {}) {
  const tNow = nowMs();

  const session =
    input && input.session && typeof input.session === "object" ? input.session : Object.create(null);

  const turnCountRaw = Number(session.__turnCount || 0);
  const turnCount = Number.isFinite(turnCountRaw) && turnCountRaw >= 0 ? turnCountRaw : 0;

  const clientSource = normLower(
    (input && input.client && input.client.source) ||
      input.source ||
      (input && input.meta && input.meta.source) ||
      ""
  );

  const sessionId = sessionScopedVisitorId(
    session,
    input.visitorId || input.visitorID || input.sessionId
  );

  const clientRequestId = String(input.clientRequestId || input.requestId || "");
  const debug = !!input.debug;

  const inbound = parseInbound(input);

  const intentSig = getIntentSignals(inbound.text, inbound.payload);
  const intentMusicAction =
    intentSig && (intentSig.musicAction || intentSig.music_action)
      ? String(intentSig.musicAction || intentSig.music_action)
      : "";
  const intentMusicYear =
    intentSig && (intentSig.musicYear || intentSig.music_year)
      ? clampYear(intentSig.musicYear || intentSig.music_year)
      : null;

  let yearSource = inbound._yearSource || "";

  const forcedMode = mapMusicActionToMode(intentMusicAction);
  if (forcedMode) inbound.mode = forcedMode;

  if (!inbound.year && intentMusicYear) {
    inbound.year = intentMusicYear;
    yearSource = "classifier";
  }

  if (!inbound.mode) inbound.mode = inferMusicModeFromText(inbound.lower);

  if (!inbound.year && inbound.mode && needsYearForMode(inbound.mode)) {
    const sticky = getStickyMusicYear(session);
    if (sticky) {
      inbound.year = sticky;
      yearSource = "sticky";
    }
  }

  const inboundHash = sha1(
    safeJsonStringify({
      t: inbound.lower,
      lane: inbound.lane,
      action: inbound.action,
      mode: inbound.mode,
      year: inbound.year,
      ys: yearSource,
      p: inbound.payload
        ? {
            lane: inbound.payload.lane,
            action: inbound.payload.action,
            mode: inbound.payload.mode,
            year: inbound.payload.year,
          }
        : null,
    })
  );

  const repeats = recordLoopEvent(session, inboundHash);

  if (repeats >= SUSTAIN_REPEAT_LIMIT) {
    const breakerReply =
      "We’re looping. Want a clean reset, or do you want me to keep the lane and pull a different year’s Top 10?";
    const breakerFollowUps = sanitizeFollowUps([
      { id: "reset_all", type: "chip", label: "Reset and restart", payload: { lane: "system", action: "reset" } },
      { id: "try_1981", type: "chip", label: "Try 1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
      { id: "try_1977", type: "chip", label: "Try 1977 Top 10", payload: { lane: "music", action: "year", year: 1977, mode: "top10" } },
    ]);

    return {
      ok: true,
      reply: breakerReply,
      lane: inbound.lane || session.lane || "general",
      ctx: { loopFuse: true, repeats },
      ui: null,
      directives: [{ type: "loop_fuse", repeats }],
      followUps: breakerFollowUps,
      followUpsStrings: followUpsToLegacyStrings(breakerFollowUps),
      sessionPatch: safeSessionPatch({ lastIntentSig: inboundHash, allowPackets: false }) || null,
      cog: session.cog || null,
      requestId: clientRequestId || null,
      meta: debug ? { engine: CE_VERSION, reason: "sustained_loop_fuse", inboundHash, repeats } : null,
    };
  }

  const burstKey = buildBurstKey({ sessionId, inboundHash });
  const remembered = getRememberedReply(session, burstKey);
  if (remembered && remembered.t && tNow - remembered.t <= BURST_WINDOW_MS) {
    const out = remembered.out;
    return Object.assign(Object.create(null), out, {
      meta: debug
        ? Object.assign(Object.create(null), out.meta || null, {
            engine: CE_VERSION,
            burstReplay: true,
            burstKey,
            inboundHash,
          })
        : null,
    });
  }

  const isSystem =
    inbound.lane === "system" ||
    normLower(inbound.action) === "reset" ||
    normLower(inbound.action) === "help";

  const structuredMusic = looksLikeStructuredMusic({
    lane: inbound.lane,
    action: inbound.action,
    mode: inbound.mode,
    year: inbound.year,
    lower: inbound.lower,
  });

  session.allowPackets = computeAllowPackets({
    structuredMusic,
    lane: inbound.lane || session.lane || "",
  });

  let routed = null;

  if (isSystem) {
    routed = handleSystem({ action: inbound.action || "help", session });
    mergeSession(session, routed.sessionPatch);
  } else if (structuredMusic) {
    const mode = inbound.mode || inferMusicModeFromText(inbound.lower) || "top10";

    routed = musicReply({
      year: inbound.year,
      mode,
      knowledge: input.knowledge || null,
      yearSource,
    });

    mergeSession(session, routed.sessionPatch);
  } else {
    if (!routed && packets && typeof packets.handleChat === "function" && session.allowPackets) {
      const p = await packets.handleChat({
        text: inbound.text,
        session,
        visitorId: sessionId,
        debug,
        laneHint: inbound.lane || session.lane || "",
        routeHint: "",
      });

      if (p && p.reply) {
        const fus = sanitizeFollowUps(
          (p.followUps || []).map((x) => ({
            id: safeId("chip"),
            type: "chip",
            label: x.label,
            payload: { text: x.send },
          }))
        );

        routed = {
          reply: p.reply,
          followUps: fus,
          sessionPatch: p.sessionPatch || null,
          meta: p.meta || null,
        };
        mergeSession(session, routed.sessionPatch);
      }
    }

    if (!routed) {
      const y = inbound.year || extractYearFromText(inbound.text);
      const mode = inbound.mode || inferMusicModeFromText(inbound.lower) || "story";

      if (y) {
        routed = musicReply({
          year: y,
          mode,
          knowledge: input.knowledge || null,
          yearSource: inbound._yearSource || "text",
        });
      } else {
        routed = {
          reply:
            "Tell me what you want next—music by year, a show, a channel question, or something else. Give me a year and I’ll anchor instantly.",
          followUps: sanitizeFollowUps([
            { id: "chip_1981", type: "chip", label: "1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
            { id: "chip_1988", type: "chip", label: "1988 Story moment", payload: { lane: "music", action: "year", year: 1988, mode: "story" } },
            { id: "chip_help", type: "chip", label: "What can you do?", payload: { lane: "system", action: "help" } },
          ]),
          sessionPatch: { lane: session.lane || "general", allowPackets: true },
          meta: { used: "always_advance_fallback" },
        };
      }
      mergeSession(session, routed.sessionPatch);
    }
  }

  const isFirstTurn =
    turnCount === 0 ||
    clientSource === "panel_open_intro" ||
    clientSource === "boot_intro" ||
    clientSource === "panel_open" ||
    clientSource === "open";

  if (isFirstTurn && (!routed || !hasUsableFollowUps(routed.followUps))) {
    if (!routed) routed = { reply: "", followUps: [] };
    routed.followUps = firstTurnRouterFollowUps();
  }

  const safeOut = ensureAdvance({ reply: routed.reply, followUps: routed.followUps });
  const followUps = sanitizeFollowUps(safeOut.followUps || []);

  const explicitYearForPatch =
    inbound.year && (yearSource === "payload" || yearSource === "text" || yearSource === "classifier")
      ? inbound.year
      : null;

  const out = {
    ok: true,
    reply: clampStr(safeOut.reply, MAX_REPLY_LEN),
    lane: inbound.lane || session.lane || "general",
    ctx: {
      structuredMusic: !!structuredMusic,
      allowPackets: !!session.allowPackets,
      repeats,
      musicMode: inbound.mode || null,
      musicYear: inbound.year || null,
      yearSource: yearSource || null,
      classifierAction: forcedMode || null,
      payloadSeen: !!inbound.payload,
      stickyYearUsed: yearSource === "sticky",
      firstTurn: !!isFirstTurn,
      clientSource: clientSource || null,
      system: !!isSystem,
    },
    ui: null,
    directives: (routed && Array.isArray(routed.directives) ? routed.directives : []) || [],
    followUps,
    followUpsStrings: followUpsToLegacyStrings(followUps),
    sessionPatch:
      safeSessionPatch({
        lane: inbound.lane || session.lane || "general",
        lastIntentSig: inboundHash,
        allowPackets: session.allowPackets === true,
        lastMusicYear: explicitYearForPatch || session.lastMusicYear || null,
        activeMusicMode: session.activeMusicMode || inbound.mode || null,
        activeMusicChart: session.activeMusicChart || null,
        lastMusicChart: session.lastMusicChart || null,
        __musicLastSig: session.__musicLastSig || null,
        depthLevel: session.depthLevel != null ? session.depthLevel : null,
        recentIntent: session.recentIntent || null,
        recentTopic: session.recentTopic || null,
        __nyxPackets: session.__nyxPackets || null,
        __packIndexSeen: !!session.__packIndexSeen,
        cog: session.cog || null,
      }) || null,
    cog: session.cog || null,
    requestId: clientRequestId || null,
    meta: debug
      ? {
          engine: CE_VERSION,
          inboundHash,
          burstKey,
          structuredMusic,
          repeats,
          lane: inbound.lane || session.lane || "",
          intentSig: intentSig || null,
          packetMeta: routed && routed.meta ? routed.meta : null,
          turnCount,
          clientSource,
          isFirstTurn,
          isSystem,
        }
      : null,
  };

  try {
    session.__turnCount = turnCount + 1;
  } catch (_) {}

  rememberReply(session, burstKey, out);
  return out;
}

/**
 * Export aliases for maximum compatibility with index.js resolvers.
 */
function module_handleChat(args) {
  return handleChat(args);
}
function respond(args) {
  return handleChat(args);
}
function chat(args) {
  return handleChat(args);
}
function run(args) {
  return handleChat(args);
}
function route(args) {
  return handleChat(args);
}

handleChat.CE_VERSION = CE_VERSION;
module_handleChat.CE_VERSION = CE_VERSION;

module.exports = {
  CE_VERSION,
  handleChat,
  module_handleChat,
  respond,
  chat,
  run,
  route,
};
