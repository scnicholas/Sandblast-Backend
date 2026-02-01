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
 * v0.7aO (FIRST-TURN ROUTER FOLLOWUPS + v0.7aN HARDENING PRESERVED)
 *
 * Critical adds vs v0.7aN:
 * ✅ FIRST-TURN ROUTER FOLLOWUPS: when session is fresh (or panel_open_intro) and followUps are missing/empty,
 *    Nyx ALWAYS emits a widget-compatible set so the UI can advance deterministically (prevents “frozen chips / no change”).
 * ✅ Session-internal turn counter (__turnCount) to reliably detect first turn without depending on client state.
 *
 * (All v0.7aN fixes preserved)
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
  "chatEngine v0.7aO (first-turn router followUps + routing hardening + payload-root fallback + chip-authoritative mode + sticky-year source + session-scoped burst dedupe)";

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
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
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
  if (k < 1950 || k > 2024) return null;
  return k;
}

function extractYearFromText(text) {
  const m = String(text || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s || ""), "utf8").digest("hex");
}

function safeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
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
   FollowUps: MUST be widget-compatible
   - Include structured fields AND payload.text fallback
====================================================== */

function ensureChipPayload(payload) {
  const p = isPlainObject(payload) ? payload : Object.create(null);

  const text = normText(p.text);

  if (!text) {
    const year = clampYear(p.year);
    const mode = normLower(p.mode);
    const lane = normLower(p.lane);
    const action = normLower(p.action);

    let cmd = "";
    if (lane === "music" || mode || action === "year") {
      if (mode === "top10") cmd = year ? `top 10 ${year}` : "top 10";
      else if (mode === "number_one") cmd = year ? `#1 ${year}` : "#1";
      else if (mode === "micro") cmd = year ? `micro moment ${year}` : "micro moment";
      else if (mode === "story") cmd = year ? `story moment ${year}` : "story moment";
      else cmd = year ? `music ${year}` : "music";
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
   - Emits widget-compatible sends (payload.text)
   - Avoids “no followUps on boot” → frozen UI
====================================================== */

function hasUsableFollowUps(fus) {
  return Array.isArray(fus) && fus.length > 0;
}

function firstTurnRouterFollowUps() {
  // IMPORTANT:
  // Your current widget filters allowed "send" strings heavily.
  // So we make labels “pretty”, but payload.text is what gets sent.
  // This keeps it compatible even if the widget ignores payload fields.
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

  // consecutive repeats from the end
  let repeats = 0;
  for (let i = keep.length - 1; i >= 0; i--) {
    if (keep[i].h === inboundHash) repeats++;
    else break;
  }

  return repeats;
}

/* ======================================================
   Payload extraction HARDENING
   - Includes root field fallback if payload is missing
====================================================== */

function buildPayloadFromRoot(input) {
  if (!input || typeof input !== "object") return null;

  const lane = normText(input.lane || (input.ctx && input.ctx.lane) || "");
  const action = normText(input.action || (input.ctx && input.ctx.action) || "");
  const mode = normText(input.mode || input.intent || (input.ctx && (input.ctx.mode || input.ctx.intent)) || "");
  const year = clampYear(input.year || (input.ctx && input.ctx.year) || null);

  if (!lane && !action && !mode && !year) return null;

  const p = Object.create(null);
  if (lane) p.lane = lane;
  if (action) p.action = action;
  if (mode) p.mode = mode;
  if (year) p.year = year;

  // text fallback if present at root
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

  // ROOT fallback if no payload object exists
  return buildPayloadFromRoot(input);
}

/* ======================================================
   Routing spine (chip-authoritative + text inference)
====================================================== */

function inferMusicModeFromText(low) {
  if (!low) return "";
  if (/\b(top\s*10|top10)\b/.test(low)) return "top10";
  if (/\b(top\s*40|top40)\b/.test(low)) return "top40";
  if (/\b(year[-\s]*end|yearend)\b/.test(low)) return "year_end";
  if (/\b(hot\s*100|billboard|chart|charts|charting|hit\s*parade)\b/.test(low)) return "charts";
  if (/\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/.test(low)) return "number_one";
  if (/\b(micro\s*moment|micro)\b/.test(low)) return "micro";
  if (/\b(story\s*moment|story)\b/.test(low)) return "story";
  return "";
}

function normalizeMode(mode, action, low) {
  const m = normLower(mode);
  const a = normLower(action);

  // payload.mode always wins
  if (m) return m;

  // action maps to mode
  if (a && ["top10", "top40", "year_end", "charts", "number_one", "micro", "story", "story_moment"].includes(a)) {
    return a === "story_moment" ? "story" : a;
  }

  // infer from text
  return inferMusicModeFromText(low);
}

function parseInbound(input) {
  const payload = getPayloadFromAny(input);

  const textPrimary = normText(input.text || input.message || input.prompt || input.query);
  const textFromPayload = payload && typeof payload.text === "string" ? normText(payload.text) : "";
  const finalText = textPrimary || textFromPayload || "";

  const low = normLower(finalText);

  const lane = payload && payload.lane ? normLower(payload.lane) : "";
  const action = payload && payload.action ? normLower(payload.action) : "";
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
  if (action || mode) return true;

  if (
    year &&
    /\b(top\s*10|top10|top\s*40|top40|hot\s*100|billboard|chart|charts|story\s*moment|micro\s*moment|#\s*1|#1|number\s*one|no\.\s*1|no\s*1)\b/.test(
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
    m === "top40" ||
    m === "charts" ||
    m === "year_end"
  );
}

/* ======================================================
   Knowledge helpers (FLEX pack shapes)
====================================================== */

function isString(x) {
  return typeof x === "string";
}
function isArray(x) {
  return Array.isArray(x);
}

function normalizeSongLine(item) {
  if (!item) return null;
  if (isString(item)) return item.trim();
  if (isPlainObject(item)) {
    const title = normText(item.title || item.song || item.name);
    const artist = normText(item.artist || item.by);
    const rank = item.rank != null ? String(item.rank).trim() : "";
    const bits = [];
    if (rank) bits.push(rank + ".");
    if (title) bits.push(title);
    if (artist) bits.push("— " + artist);
    const out = bits.join(" ").trim();
    return out || null;
  }
  return null;
}

const PIN_TOP10_KEYS = ["music/top10_by_year", "music/number1_by_year", "music/top10"];
const PIN_STORY_KEYS = [
  "music/story_moments_by_year",
  "music/micro_moments_by_year",
  "music/story_moments",
  "music/moments",
];

const KNOWLEDGE_SCAN_CAP = 1200;

function findYearArrayInObject(obj, year) {
  if (!isPlainObject(obj)) return null;
  const y = String(year);

  if (obj[y] && isArray(obj[y])) return obj[y];
  if (obj[year] && isArray(obj[year])) return obj[year];

  const candidates = [obj.data, obj.years, obj.byYear, obj.year];
  for (const c of candidates) {
    if (!isPlainObject(c)) continue;
    if (c[y] && isArray(c[y])) return c[y];
    if (c[year] && isArray(c[year])) return c[year];
  }

  return null;
}

function findYearTextInObject(obj, year) {
  if (!isPlainObject(obj)) return null;
  const y = String(year);

  const v1 = obj[y] || obj[year];
  if (isString(v1) && v1.trim()) return v1.trim();
  if (isPlainObject(v1) && isString(v1.moment || v1.story || v1.text))
    return normText(v1.moment || v1.story || v1.text);

  const candidates = [obj.data, obj.years, obj.byYear, obj.year];
  for (const c of candidates) {
    if (!isPlainObject(c)) continue;
    const v = c[y] || c[year];
    if (isString(v) && v.trim()) return v.trim();
    if (isPlainObject(v) && isString(v.moment || v.story || v.text))
      return normText(v.moment || v.story || v.text);
  }

  return null;
}

function findYearInArrayPack(arr, year) {
  if (!isArray(arr)) return null;
  const y = Number(year);

  for (const row of arr) {
    if (!isPlainObject(row)) continue;
    const ry = clampYear(row.year || row.y || row.yr);
    if (ry !== y) continue;

    const list = row.top10 || row.top_10 || row.list || row.songs || row.chart || row.entries;
    if (isArray(list) && list.length) return list;
  }

  return null;
}

function findTop10InKnowledge(knowledgeJson, year) {
  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;

  for (const k of PIN_TOP10_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, k)) continue;
    const v = knowledgeJson[k];

    const direct = findYearArrayInObject(v, year);
    if (direct && direct.length) return { sourceKey: k, list: direct };

    const asArr = findYearInArrayPack(v, year);
    if (asArr && asArr.length) return { sourceKey: k, list: asArr };
  }

  const keys = Object.keys(knowledgeJson).slice(0, KNOWLEDGE_SCAN_CAP);
  for (const k of keys) {
    const kl = String(k).toLowerCase();
    if (!(kl.includes("top10") || kl.includes("top_10") || kl.includes("chart") || kl.includes("topten"))) continue;

    const v = knowledgeJson[k];
    const direct = findYearArrayInObject(v, year);
    if (direct && direct.length) return { sourceKey: k, list: direct };

    const asArr = findYearInArrayPack(v, year);
    if (asArr && asArr.length) return { sourceKey: k, list: asArr };
  }

  return null;
}

function findStoryMomentInKnowledge(knowledgeJson, year) {
  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;

  for (const k of PIN_STORY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(knowledgeJson, k)) continue;
    const v = knowledgeJson[k];
    const t = findYearTextInObject(v, year);
    if (t) return { sourceKey: k, text: t };
  }

  const keys = Object.keys(knowledgeJson).slice(0, KNOWLEDGE_SCAN_CAP);
  for (const k of keys) {
    const kl = String(k).toLowerCase();
    if (!(kl.includes("moment") || kl.includes("story") || kl.includes("micro"))) continue;

    const v = knowledgeJson[k];
    const t = findYearTextInObject(v, year);
    if (t) return { sourceKey: k, text: t };
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

function musicReply({ year, mode, knowledge }) {
  const y = clampYear(year);
  const m = normLower(mode);

  if (!y) {
    return {
      reply: "Pick a year between 1950 and 2024 and I’ll pull the Top 10, #1, or a story moment — your call.",
      followUps: [
        { id: "y1981", type: "chip", label: "1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
        { id: "y1981no1", type: "chip", label: "#1 song (1981)", payload: { lane: "music", action: "year", year: 1981, mode: "number_one" } },
        { id: "y1988", type: "chip", label: "1988 Story moment", payload: { lane: "music", action: "year", year: 1988, mode: "story" } },
      ],
      sessionPatch: { lane: "music", activeMusicMode: m || "top10" },
      meta: { used: "music_no_year" },
    };
  }

  const knowledgeJson = knowledge && knowledge.json && isPlainObject(knowledge.json) ? knowledge.json : null;

  const wantsTop10 = m === "top10";
  const wantsNumberOne = m === "number_one";
  const wantsMicro = m === "micro";
  const wantsStory = m === "story";
  const wantsCharts = m === "charts" || m === "year_end" || m === "top40";

  let reply = "";

  if (wantsTop10) {
    const hit = findTop10InKnowledge(knowledgeJson, y);
    if (hit && isArray(hit.list) && hit.list.length >= 10) {
      reply = formatTop10Reply(y, hit.list);
    } else if (hit && isArray(hit.list) && hit.list.length) {
      reply = `Top songs of ${y} (partial pack):\n\n${hit.list
        .slice(0, 10)
        .map((v, i) => `${i + 1}. ${normalizeSongLine(v) || String(v)}`)
        .join("\n")}`;
    } else {
      reply = `Top 10 for ${y}: I don’t see a usable Top 10 list in the loaded packs yet.`;
    }
  } else if (wantsNumberOne) {
    const hit = findTop10InKnowledge(knowledgeJson, y);
    if (hit && isArray(hit.list) && hit.list.length) {
      const first = normalizeSongLine(hit.list[0]) || null;
      reply = first ? `#1 song of ${y}: ${first}` : `#1 song of ${y}: (data loaded, format unexpected).`;
    } else {
      reply = `#1 song of ${y}: I can pull it once the chart pack for that year is usable.`;
    }
  } else if (wantsMicro) {
    const story = findStoryMomentInKnowledge(knowledgeJson, y);
    reply =
      story && story.text
        ? `Micro moment (${y}): ${clampStr(story.text, 260)}`
        : `Micro moment for ${y}: give me a vibe (soul, rock, pop) or an artist and I’ll make it razor-specific.`;
  } else if (wantsStory) {
    const story = findStoryMomentInKnowledge(knowledgeJson, y);
    reply =
      story && story.text
        ? `Story moment for ${y}: ${clampStr(story.text, 900)}`
        : `Story moment for ${y}: I can anchor it on the year’s #1 song and give you the cultural pulse in 50–60 words.`;
  } else if (wantsCharts) {
    reply = `Got it — ${y}. Do you want the Top 10 list, or just the #1 with a quick story moment?`;
  } else {
    reply = `Tell me what you want for ${y}: Top 10, #1, story moment, or a micro moment.`;
  }

  const followUps = [
    { id: "m_top10", type: "chip", label: "Top 10", payload: { lane: "music", action: "year", year: y, mode: "top10" } },
    { id: "m_no1", type: "chip", label: "#1 song", payload: { lane: "music", action: "year", year: y, mode: "number_one" } },
    { id: "m_story", type: "chip", label: "Story moment", payload: { lane: "music", action: "year", year: y, mode: "story" } },
    { id: "m_micro", type: "chip", label: "Micro moment", payload: { lane: "music", action: "year", year: y, mode: "micro" } },
  ];

  return {
    reply,
    followUps,
    sessionPatch: { lane: "music", lastMusicYear: y, activeMusicMode: m || "top10" },
    meta: { used: "music_reply", mode: m || null },
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
   Intent classifier integration (optional)
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
  const a = normLower(musicAction);
  if (!a) return "";
  if (a === "top10") return "top10";
  if (a === "top40") return "top40";
  if (a === "year_end") return "year_end";
  if (a === "number_one") return "number_one";
  if (a === "charts") return "charts";
  if (a === "story_moment") return "story";
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

  // Session-internal turn counter (do NOT expose; used only for first-turn routing)
  const turnCountRaw = Number(session.__turnCount || 0);
  const turnCount = Number.isFinite(turnCountRaw) && turnCountRaw >= 0 ? turnCountRaw : 0;

  // detect client source (widget sends: input.client.source)
  const clientSource = normLower(
    (input && input.client && input.client.source) ||
      input.source ||
      (input && input.meta && input.meta.source) ||
      ""
  );

  // session-scoped id for burst dedupe stability
  const sessionId = sessionScopedVisitorId(session, input.visitorId || input.visitorID || input.sessionId);

  const clientRequestId = String(input.clientRequestId || input.requestId || "");
  const debug = !!input.debug;

  const inbound = parseInbound(input);

  // classifier hardening
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

  // YEAR-STICKY: if we have a mode that requires a year and no year was provided, pull from session/cog
  if (!inbound.year && inbound.mode && needsYearForMode(inbound.mode)) {
    const sticky = getStickyMusicYear(session);
    if (sticky) {
      inbound.year = sticky;
      yearSource = "sticky";
    }
  }

  const inboundHash = sha1(
    JSON.stringify({
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

  // burst dedupe (session-scoped, not global "anon")
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

  if (structuredMusic) {
    // CRITICAL: chip-authoritative mode: inbound.mode already respected by normalizeMode()
    const mode = inbound.mode || inferMusicModeFromText(inbound.lower) || "top10";

    routed = musicReply({
      year: inbound.year,
      mode,
      knowledge: input.knowledge || null,
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
        routed = musicReply({ year: y, mode, knowledge: input.knowledge || null });
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

  // ======================================================
  // FIRST-TURN ROUTER FOLLOWUPS (CRITICAL)
  // - If first turn (or panel_open_intro) and followUps missing, inject router chips.
  // ======================================================
  const isFirstTurn =
    turnCount === 0 ||
    clientSource === "panel_open_intro" ||
    clientSource === "boot_intro" ||
    clientSource === "panel_open" ||
    clientSource === "open";

  if (isFirstTurn && (!routed || !hasUsableFollowUps(routed.followUps))) {
    if (!routed) routed = { reply: "", followUps: [] };
    routed.followUps = firstTurnRouterFollowUps();
    // If reply is empty, ensureAdvance will generate a gentle line.
  }

  const safeOut = ensureAdvance({ reply: routed.reply, followUps: routed.followUps });
  const followUps = sanitizeFollowUps(safeOut.followUps || []);

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
    },
    ui: null,
    directives: [],
    followUps,
    followUpsStrings: followUpsToLegacyStrings(followUps),
    sessionPatch:
      safeSessionPatch({
        lane: inbound.lane || session.lane || "general",
        lastIntentSig: inboundHash,
        allowPackets: session.allowPackets === true,
        lastMusicYear: session.lastMusicYear || inbound.year || null,
        activeMusicMode: session.activeMusicMode || inbound.mode || null,
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
        }
      : null,
  };

  // advance internal turn counter (do NOT expose; does not go through sessionPatch)
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
