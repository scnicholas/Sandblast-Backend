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
 * v0.7aJ (CHART-AUTHORITATIVE + TOP10 FIX + INTENT-DRIVEN MODE + ALWAYS-ADVANCE++)
 *
 * CRITICAL FIXES (your reported bug):
 * ✅ "top 10 1981" now routes to TOP10 (never story) even without chips
 * ✅ Structured detection now extracts mode/action from raw text (top10/story/micro/#1)
 * ✅ Optional intentClassifier integration (if present) to hard-lock musicAction/musicYear
 * ✅ When chart data exists in knowledge packs, engine will actually render a Top 10 list
 *
 * Existing loop protections kept:
 * ✅ ReplayKey includes inbound hash even when clientRequestId exists (prevents sticky replays)
 * ✅ Burst dedupe (same inbound within short window returns same reply deterministically)
 * ✅ Sustained loop fuse (N repeats -> gentle breaker + reset chip)
 * ✅ Packets gate hardened: packets can NEVER hijack structured music / chip-routed turns
 * ✅ Always-advance: never returns empty replies
 *
 * Compatibility:
 * ✅ supports chips payload: {lane, action, year, mode, text}
 * ✅ supports legacy text-only
 * ✅ supports packets.js reserved triggers
 */

const crypto = require("crypto");

// Optional: packets engine (safe)
let packets = null;
try {
  packets = require("./packets.js");
} catch (_) {
  packets = null;
}

// Optional: intent classifier (safe) — enables hard action/year extraction
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
  "chatEngine v0.7aJ (chart-authoritative + top10 fix + intent-driven mode + always-advance++)";

const MAX_REPLY_LEN = 2000;
const MAX_FOLLOWUPS = 10;
const MAX_LABEL_LEN = 52;

const BURST_WINDOW_MS = 2500; // short burst dedupe window
const SUSTAIN_WINDOW_MS = 45000; // sustained loop detection window
const SUSTAIN_REPEAT_LIMIT = 4; // how many repeats before fuse trips
const REPLAY_TTL_MS = 120000; // keep replay records briefly

// Session safety caps
const MAX_SEEN_KEYS = 64;
const MAX_LOOP_EVENTS = 24;

// Allowlist keys that chatEngine will accept as sessionPatch (defense-in-depth)
const ALLOWED_SESSION_PATCH_KEYS = new Set([
  "lane",
  "lastMusicYear",
  "activeMusicMode",
  "voiceMode",
  "lastIntentSig",
  "allowPackets",
  "__nyxPackets",
  "cog",
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
  // short id for chips
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeFollowUps(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const it of list) {
    if (!it || typeof it !== "object") continue;

    const label = normText(it.label);
    if (!label) continue;

    const payload = isPlainObject(it.payload) ? it.payload : null;
    if (!payload) continue;

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
  // Legacy widget expects strings sometimes; map to label as safe fallback
  return followUps
    .map((x) => String(x && x.label ? x.label : ""))
    .filter(Boolean)
    .slice(0, MAX_FOLLOWUPS);
}

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
      // only accept a small safe subset
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
      // accept as-is only if plain object (packets.js already sanitizes)
      if (isPlainObject(patch.__nyxPackets)) out.__nyxPackets = patch.__nyxPackets;
      continue;
    }

    // general stringy keys
    const v = patch[k];
    if (v == null) continue;
    if (typeof v === "boolean") {
      out[k] = v;
    } else {
      out[k] = String(v).trim();
    }
  }

  return Object.keys(out).length ? out : null;
}

function mergeSession(session, patch) {
  if (!session || typeof session !== "object") return;
  const safe = safeSessionPatch(patch);
  if (!safe) return;

  for (const k of Object.keys(safe)) {
    session[k] = safe[k];
  }
}

/* ======================================================
   Loop control (burst dedupe + sustained fuse + replay)
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

  // Remove old entries
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

  // Cap size
  while (keep.length > MAX_SEEN_KEYS) {
    const k = keep.shift();
    if (k) delete map[k];
  }
  store.order = keep;
}

function buildReplayKey({ visitorId, clientRequestId, inboundHash }) {
  // ALWAYS include inboundHash even if clientRequestId exists.
  const v = String(visitorId || "anon");
  const cr = String(clientRequestId || "");
  return sha1(`${v}::${cr}::${inboundHash}`);
}

function rememberReply(session, replayKey, rec) {
  const store = getReplayStore(session);
  const map = store.map;
  const tNow = nowMs();

  map[replayKey] = Object.assign(Object.create(null), rec, { t: tNow });

  store.order.push(replayKey);
  pruneReplayStore(store, tNow);
}

function getRememberedReply(session, replayKey) {
  const store = getReplayStore(session);
  const rec = store.map && store.map[replayKey];
  if (!rec) return null;
  if (!rec.t) return null;

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

  // keep only within sustain window
  const keep = [];
  for (const ev of events) {
    if (!ev || !ev.t) continue;
    if (tNow - ev.t <= SUSTAIN_WINDOW_MS) keep.push(ev);
  }
  keep.push({ t: tNow, h: inboundHash });

  // cap
  while (keep.length > MAX_LOOP_EVENTS) keep.shift();
  store.events = keep;

  // count recent repeats (consecutive)
  let repeats = 0;
  for (let i = keep.length - 1; i >= 0; i--) {
    if (keep[i].h === inboundHash) repeats++;
    else break;
  }

  return repeats;
}

/* ======================================================
   Routing spine (chip-authoritative + intent-driven)
====================================================== */

function inferMusicModeFromText(low) {
  if (!low) return "";
  if (/\b(top\s*10|top10)\b/.test(low)) return "top10";
  if (/\b(top\s*40|top40)\b/.test(low)) return "top40";
  if (/\b(year[-\s]*end|yearend)\b/.test(low)) return "year_end";
  if (/\b(hot\s*100|billboard|chart|charts|charting|hit\s*parade)\b/.test(low)) return "charts";
  if (/\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/.test(low)) return "number_one";
  if (/\b(micro\s*moment|micro)\b/.test(low)) return "micro";
  if (/\b(story\s*moment|story|moment|what\s+was\s+happening)\b/.test(low)) return "story";
  return "";
}

function normalizeMode(mode, action, low) {
  const m = normLower(mode);
  const a = normLower(action);

  // If explicit mode exists, keep it
  if (m) return m;

  // If action itself expresses a mode, accept it
  if (a && ["top10", "top40", "year_end", "charts", "number_one", "micro", "story", "story_moment"].includes(a)) {
    return a === "story_moment" ? "story" : a;
  }

  // Infer from text
  return inferMusicModeFromText(low);
}

function parseInbound({ text, payload }) {
  const t = normText(text);
  const p = isPlainObject(payload) ? payload : null;

  // If payload carries text (legacy), allow it
  const pText = p && typeof p.text === "string" ? normText(p.text) : "";
  const finalText = t || pText || "";

  const low = normLower(finalText);

  const lane = p && p.lane ? normLower(p.lane) : "";
  const action = p && p.action ? normLower(p.action) : "";
  const rawMode = p && p.mode ? normLower(p.mode) : "";
  const year = clampYear(p && p.year) || extractYearFromText(finalText) || null;

  // Critical: derive mode even when payload isn't present (fixes "top 10 1981" => story bug)
  const mode = normalizeMode(rawMode, action, low);

  return {
    text: finalText,
    lower: low,
    lane,
    action,
    mode,
    year,
    rawPayload: p || null,
  };
}

function looksLikeStructuredMusic({ lane, action, mode, year, lower }) {
  // Chip says lane/action/mode => structured.
  if (lane === "music" || lane === "years") return true;
  if (action || mode) return true;

  // Text-only: year + strong signal => structured
  if (year && /\b(top\s*10|top10|top\s*40|top40|hot\s*100|billboard|chart|charts|story\s*moment|micro\s*moment|#\s*1|#1|number\s*one|no\.\s*1|no\s*1)\b/.test(lower)) {
    return true;
  }
  return false;
}

/* ======================================================
   Knowledge helpers (find Top10 / Story in packs safely)
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

// Scan knowledge.json keys lightly and try to find a year->list mapping with >=10 items
function findTop10InKnowledge(knowledgeJson, year) {
  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;
  const y = String(year);

  const keys = Object.keys(knowledgeJson).slice(0, 120);
  for (const k of keys) {
    const v = knowledgeJson[k];
    if (!v) continue;

    // direct year map: v[1981] = [...]
    if (isPlainObject(v) && (v[y] || v[year])) {
      const arr = v[y] || v[year];
      if (isArray(arr) && arr.length >= 10) {
        return { sourceKey: k, list: arr };
      }
    }

    // nested: v.data[year] or v.years[year]
    if (isPlainObject(v)) {
      const candidates = [v.data, v.years, v.byYear, v.year];
      for (const c of candidates) {
        if (!isPlainObject(c)) continue;
        const arr = c[y] || c[year];
        if (isArray(arr) && arr.length >= 10) {
          return { sourceKey: k, list: arr };
        }
      }
    }
  }

  return null;
}

function findStoryMomentInKnowledge(knowledgeJson, year) {
  if (!knowledgeJson || !isPlainObject(knowledgeJson)) return null;
  const y = String(year);

  const keys = Object.keys(knowledgeJson).slice(0, 120);
  for (const k of keys) {
    const v = knowledgeJson[k];
    if (!v) continue;

    if (isPlainObject(v) && (v[y] || v[year])) {
      const val = v[y] || v[year];
      if (isString(val) && val.trim().length) return { sourceKey: k, text: val.trim() };
      if (isPlainObject(val) && isString(val.moment || val.story || val.text)) {
        return { sourceKey: k, text: normText(val.moment || val.story || val.text) };
      }
    }

    if (isPlainObject(v)) {
      const candidates = [v.data, v.years, v.byYear, v.year];
      for (const c of candidates) {
        if (!isPlainObject(c)) continue;
        const val = c[y] || c[year];
        if (isString(val) && val.trim().length) return { sourceKey: k, text: val.trim() };
        if (isPlainObject(val) && isString(val.moment || val.story || val.text)) {
          return { sourceKey: k, text: normText(val.moment || val.story || val.text) };
        }
      }
    }
  }

  return null;
}

/* ======================================================
   Music responder (uses knowledge when available)
====================================================== */

function formatTop10Reply(year, list) {
  const lines = [];
  const top = list.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const line = normalizeSongLine(top[i]) || null;
    if (!line) continue;
    // If the line already starts with a rank, keep it. Otherwise prefix.
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
      reply: "Pick a year between 1950 and 2024 and I’ll pull either the Top 10 or a story moment—your call.",
      followUps: [
        { id: "y1977", type: "chip", label: "1977 Top 10", payload: { lane: "music", action: "year", year: 1977, mode: "top10" } },
        { id: "y1981", type: "chip", label: "1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
        { id: "y1988", type: "chip", label: "1988 Story moment", payload: { lane: "music", action: "year", year: 1988, mode: "story" } },
      ],
      sessionPatch: { lane: "music", activeMusicMode: m || "top10" },
      meta: { used: "music_no_year" },
    };
  }

  const knowledgeJson = knowledge && knowledge.json && isPlainObject(knowledge.json) ? knowledge.json : null;

  // HARD RULE: top10 request must NEVER degrade into story by default
  const wantsTop10 = m === "top10" || m === "top 10" || m === "top-ten";
  const wantsStory = m === "story" || m === "story_moment";
  const wantsMicro = m === "micro";
  const wantsNumberOne = m === "number_one" || m === "number one" || m === "#1";
  const wantsCharts = m === "charts" || m === "year_end" || m === "top40";

  let reply = "";

  if (wantsTop10) {
    const hit = findTop10InKnowledge(knowledgeJson, y);
    if (hit && isArray(hit.list)) {
      reply = formatTop10Reply(y, hit.list);
    } else {
      reply = `Top 10 for ${y}: I’m ready to output the list, but I don’t see a loaded Top 10 pack for that year yet.`;
    }
  } else if (wantsNumberOne) {
    // Try to reuse top10 list to pull #1 if available
    const hit = findTop10InKnowledge(knowledgeJson, y);
    if (hit && isArray(hit.list) && hit.list.length) {
      const first = normalizeSongLine(hit.list[0]) || null;
      reply = first ? `#1 song of ${y}: ${first}` : `#1 song of ${y}: (data loaded, but format is unexpected).`;
    } else {
      reply = `#1 song of ${y}: I can pull it once the chart pack for that year is loaded.`;
    }
  } else if (wantsMicro) {
    // If story exists, micro can be a tighter variant; otherwise prompt.
    const story = findStoryMomentInKnowledge(knowledgeJson, y);
    reply = story && story.text
      ? `Micro moment (${y}): ${clampStr(story.text, 260)}`
      : `Micro moment for ${y}: tell me a vibe (soul, rock, pop) or an artist and I’ll make it razor-specific.`;
  } else if (wantsStory) {
    const story = findStoryMomentInKnowledge(knowledgeJson, y);
    reply = story && story.text
      ? `Story moment for ${y}: ${clampStr(story.text, 800)}`
      : `Story moment for ${y}: I can anchor it on the year’s #1 song and give you the cultural pulse in 50–60 words.`;
  } else if (wantsCharts) {
    // Default charts behavior: offer top10 vs #1
    reply = `Got it — ${y}. Do you want the Top 10 list, or just the #1 with a quick story moment?`;
  } else {
    // Default if mode unknown: stay safe, but do NOT override an explicit top10 request (handled above)
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
   Packets gate
====================================================== */

function computeAllowPackets({ structuredMusic, lane }) {
  // Packets are for greet/help/fallback/nav, not for structured music turns.
  if (structuredMusic) return false;
  if (lane === "music" || lane === "years") return false;
  return true;
}

/* ======================================================
   Always-advance safety
====================================================== */

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
    // Prefer classifier.classify(message, context)
    if (typeof intentClassifier.classify === "function") {
      return intentClassifier.classify(text, { payload: payload || null });
    }
    // Fallback to classifyIntent(message)
    if (typeof intentClassifier.classifyIntent === "function") {
      return intentClassifier.classifyIntent(text);
    }
  } catch (_) {
    return null;
  }

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
  return a;
}

/* ======================================================
   Public API
====================================================== */

async function handleChat(input = {}) {
  const tNow = nowMs();

  const session =
    input && input.session && typeof input.session === "object"
      ? input.session
      : Object.create(null);

  const visitorId = String(input.visitorId || input.visitorID || "anon");
  const clientRequestId = String(input.clientRequestId || input.requestId || "");
  const debug = !!input.debug;

  const inbound = parseInbound({ text: input.text, payload: input.payload });

  // Pull intent signals if available (hardens chart vs story)
  const intentSig = getIntentSignals(inbound.text, inbound.rawPayload);
  const intentMusicAction = intentSig && (intentSig.musicAction || intentSig.music_action) ? String(intentSig.musicAction || intentSig.music_action) : "";
  const intentMusicYear = intentSig && (intentSig.musicYear || intentSig.music_year) ? clampYear(intentSig.musicYear || intentSig.music_year) : null;

  // If classifier indicates a chart action, hard-override mode (fixes top10 misroute)
  const forcedMode = mapMusicActionToMode(intentMusicAction);
  if (forcedMode) inbound.mode = forcedMode;

  // If classifier indicates a year and we missed it, set it
  if (!inbound.year && intentMusicYear) inbound.year = intentMusicYear;

  // Inbound hash is based on deterministic properties (text + payload lane/action/year/mode)
  const inboundHash = sha1(
    JSON.stringify({
      t: inbound.lower,
      lane: inbound.lane,
      action: inbound.action,
      mode: inbound.mode,
      year: inbound.year,
    })
  );

  // Loop tracking (consecutive repeats within sustain window)
  const repeats = recordLoopEvent(session, inboundHash);

  // Sustained loop fuse
  if (repeats >= SUSTAIN_REPEAT_LIMIT) {
    const breakerReply =
      "I think we’re stuck in a repeat loop. Want me to reset the conversation state and start fresh, or keep the current lane and try a new angle?";
    const breakerFollowUps = [
      { id: "reset_all", type: "chip", label: "Reset and restart", payload: { lane: "system", action: "reset" } },
      { id: "keep_lane", type: "chip", label: "Keep lane, try Top 10", payload: { lane: "music", action: "year", year: session.lastMusicYear || 1981, mode: "top10" } },
    ];

    const outBreaker = ensureAdvance({ reply: breakerReply, followUps: breakerFollowUps });

    return {
      ok: true,
      reply: outBreaker.reply,
      lane: inbound.lane || session.lane || "general",
      ctx: { loopFuse: true, repeats },
      ui: null,
      directives: [{ type: "loop_fuse", repeats }],
      followUps: sanitizeFollowUps(outBreaker.followUps),
      followUpsStrings: followUpsToLegacyStrings(outBreaker.followUps),
      sessionPatch: { lastIntentSig: inboundHash, allowPackets: false },
      cog: session.cog || null,
      requestId: clientRequestId || null,
      meta: debug
        ? { engine: CE_VERSION, reason: "sustained_loop_fuse", inboundHash, repeats }
        : null,
    };
  }

  // Replay key
  const replayKey = buildReplayKey({ visitorId, clientRequestId, inboundHash });

  // Burst dedupe
  const remembered = getRememberedReply(session, replayKey);
  if (remembered && remembered.t && tNow - remembered.t <= BURST_WINDOW_MS) {
    return Object.assign(Object.create(null), remembered.out, {
      meta: debug
        ? Object.assign(Object.create(null), remembered.out.meta || null, {
            engine: CE_VERSION,
            replay: true,
            replayKey,
            inboundHash,
          })
        : null,
    });
  }

  // Determine structured music (now uses inbound.lower)
  const structuredMusic = looksLikeStructuredMusic({
    lane: inbound.lane,
    action: inbound.action,
    mode: inbound.mode,
    year: inbound.year,
    lower: inbound.lower,
  });

  // Packets gate
  session.allowPackets = computeAllowPackets({
    structuredMusic,
    lane: inbound.lane || session.lane || "",
  });

  // Routing result
  let routed = null;

  // 1) Chip/Intent-authoritative music route
  if (structuredMusic) {
    // HARD RULE: if text implies top10 and year exists, enforce it
    const impliedMode = inbound.mode || inferMusicModeFromText(inbound.lower);
    routed = musicReply({
      year: inbound.year,
      mode: impliedMode || inbound.action || "top10",
      knowledge: input.knowledge || null,
    });
    mergeSession(session, routed.sessionPatch);
  } else {
    // 2) Packets (only if allowed)
    if (packets && typeof packets.handleChat === "function" && session.allowPackets) {
      const p = await packets.handleChat({
        text: inbound.text,
        session,
        visitorId,
        debug,
        laneHint: inbound.lane || session.lane || "",
        routeHint: "",
      });

      if (p && p.reply) {
        routed = {
          reply: p.reply,
          followUps: (p.followUps || []).map((x) => ({
            id: safeId("chip"),
            type: "chip",
            label: x.label,
            payload: { text: x.send }, // preserve compatibility
          })),
          sessionPatch: p.sessionPatch || null,
          meta: p.meta || null,
        };
        mergeSession(session, routed.sessionPatch);
      }
    }

    // 3) If packets didn't match, use text-only year routing, but respect inferred mode (top10 fix)
    if (!routed) {
      const y = inbound.year || extractYearFromText(inbound.text);
      const mode = inferMusicModeFromText(inbound.lower) || "story";

      if (y) {
        routed = musicReply({
          year: y,
          mode,
          knowledge: input.knowledge || null,
        });
      } else {
        routed = {
          reply:
            "Tell me what you want next—music by year, a show, a channel question, or something else. If you give me a year, I can anchor it instantly.",
          followUps: [
            { id: "chip_music", type: "chip", label: "Music by year", payload: { lane: "music", action: "start" } },
            { id: "chip_1981", type: "chip", label: "1981 Top 10", payload: { lane: "music", action: "year", year: 1981, mode: "top10" } },
            { id: "chip_help", type: "chip", label: "What can you do?", payload: { lane: "system", action: "help" } },
          ],
          sessionPatch: { lane: session.lane || "general", allowPackets: true },
          meta: { used: "always_advance_fallback" },
        };
      }
      mergeSession(session, routed.sessionPatch);
    }
  }

  // Final safety
  const safeOut = ensureAdvance({
    reply: routed.reply,
    followUps: routed.followUps,
  });

  const followUps = sanitizeFollowUps(
    (safeOut.followUps || []).map((x) => {
      if (x && x.payload) return x;
      return {
        id: x.id || safeId("chip"),
        type: x.type || "chip",
        label: x.label || "",
        payload: x.payload || (x.send ? { text: x.send } : {}),
      };
    })
  );

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
      classifierAction: forcedMode || null,
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
        lastMusicYear:
          session.lastMusicYear ||
          (session.cog && session.cog.lastMusicYear) ||
          inbound.year ||
          null,
        activeMusicMode: session.activeMusicMode || inbound.mode || null,
        __nyxPackets: session.__nyxPackets || null,
        cog: session.cog || null,
      }) || null,
    cog: session.cog || null,
    requestId: clientRequestId || null,
    meta: debug
      ? {
          engine: CE_VERSION,
          inboundHash,
          replayKey,
          structuredMusic,
          repeats,
          lane: inbound.lane || session.lane || "",
          intentSig: intentSig || null,
          packetMeta: routed && routed.meta ? routed.meta : null,
        }
      : null,
  };

  // Remember reply for burst dedupe (and replays)
  rememberReply(session, replayKey, { out });

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

module.exports = {
  CE_VERSION,
  handleChat,
  module_handleChat,
  respond,
  chat,
  run,
  route,
};
