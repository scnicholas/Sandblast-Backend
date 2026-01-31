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
 * v0.7aI (LOOP SLAYER + PACKETS GATE HARDEN + REPLAYKEY++ + ALWAYS-ADVANCE)
 *
 * CRITICAL LOOP FIXES:
 * ✅ ReplayKey includes inbound hash even when clientRequestId exists (prevents sticky replays)
 * ✅ Burst dedupe (same inbound within short window returns same reply deterministically)
 * ✅ Sustained loop fuse (N repeats -> gentle “stuck” breaker + reset chip)
 * ✅ Packets are gated: packets can NEVER hijack structured music / chip-routed turns
 * ✅ "Always advance": if a route produces empty reply, engine emits a safe next-step prompt
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

/* ======================================================
   Version + constants
====================================================== */

const CE_VERSION = "chatEngine v0.7aI (loop slayer + replayKey++ + packets gate harden + always-advance)";

const MAX_REPLY_LEN = 2000;
const MAX_FOLLOWUPS = 10;
const MAX_LABEL_LEN = 52;

const BURST_WINDOW_MS = 2500;          // short burst dedupe window
const SUSTAIN_WINDOW_MS = 45000;       // sustained loop detection window
const SUSTAIN_REPEAT_LIMIT = 4;        // how many repeats before fuse trips
const REPLAY_TTL_MS = 120000;          // keep replay records briefly

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

    const key = sha1(label + "::" + JSON.stringify(payload));
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
  return followUps.map((x) => String(x && x.label ? x.label : "")).filter(Boolean).slice(0, MAX_FOLLOWUPS);
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
    out[k] = String(v).trim();
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
  // The critical fix: ALWAYS include inboundHash even if clientRequestId exists.
  // This prevents "sticky replay" if client reuses requestId across different text/payload.
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

  // count recent repeats
  let repeats = 0;
  for (let i = keep.length - 1; i >= 0; i--) {
    if (keep[i].h === inboundHash) repeats++;
    else break; // only count consecutive repeats
  }

  return repeats;
}

/* ======================================================
   Routing spine (chip-authoritative)
====================================================== */

function parseInbound({ text, payload }) {
  const t = normText(text);

  const p = isPlainObject(payload) ? payload : null;
  const lane = p && p.lane ? normLower(p.lane) : "";
  const action = p && p.action ? normLower(p.action) : "";
  const mode = p && p.mode ? normLower(p.mode) : "";
  const year = clampYear(p && p.year) || extractYearFromText(t) || null;

  // If payload carries text (legacy), allow it
  const pText = p && typeof p.text === "string" ? normText(p.text) : "";
  const finalText = t || pText || "";

  return {
    text: finalText,
    lane,
    action,
    mode,
    year,
    rawPayload: p || null,
  };
}

function looksLikeStructuredMusic({ lane, action, mode, year, text }) {
  // If the chip says lane/action, treat as structured.
  if (lane === "music" || lane === "years") return true;
  if (action || mode) return true;
  // If text includes strong music-mode keywords + year, also structured
  const low = normLower(text);
  if (year && /\b(top\s*10|top10|top\s*100|hot\s*100|story\s*moment|micro\s*moment|#\s*1|number\s*1)\b/.test(low)) {
    return true;
  }
  return false;
}

/* ======================================================
   Minimal music responder (safe fallback)
   (You can swap this later to your full knowledge bridge.)
====================================================== */

function musicReply({ year, mode }) {
  const y = clampYear(year);
  const m = normLower(mode);

  if (!y) {
    return {
      reply: "Pick a year between 1950 and 2024 and I’ll pull a music moment or chart snapshot for you.",
      followUps: [
        { id: "y1955", type: "chip", label: "1955", payload: { lane: "music", action: "year", year: 1955, mode: "story" } },
        { id: "y1977", type: "chip", label: "1977", payload: { lane: "music", action: "year", year: 1977, mode: "top10" } },
        { id: "y1988", type: "chip", label: "1988", payload: { lane: "music", action: "year", year: 1988, mode: "top10" } },
      ],
      sessionPatch: { lane: "music", activeMusicMode: m || "story" },
      meta: { used: "music_fallback_no_year" },
    };
  }

  // Minimal placeholder response (your knowledge layer can replace this)
  let line = "";
  if (m.includes("top10")) line = `Alright — ${y}. I can pull the Top 10 for that year. Want the full list or just the #1 plus a quick story moment?`;
  else if (m.includes("top100") || m.includes("hot")) line = `Got it — ${y}. Hot 100 context. Do you want the year’s #1 or the Top 10 snapshot?`;
  else if (m.includes("micro")) line = `Micro moment for ${y}: give me one artist or vibe (soul, rock, pop) and I’ll make it razor-specific.`;
  else line = `Story moment for ${y}: I can anchor it on the year’s #1 song and give you the cultural pulse in 50–60 words.`;

  const followUps = [
    { id: "m_top10", type: "chip", label: "Top 10", payload: { lane: "music", action: "year", year: y, mode: "top10" } },
    { id: "m_story", type: "chip", label: "Story moment", payload: { lane: "music", action: "year", year: y, mode: "story" } },
    { id: "m_micro", type: "chip", label: "Micro moment", payload: { lane: "music", action: "year", year: y, mode: "micro" } },
  ];

  return {
    reply: line,
    followUps,
    sessionPatch: { lane: "music", lastMusicYear: y, activeMusicMode: m || "story" },
    meta: { used: "music_fallback" },
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

function ensureAdvance({ reply, followUps, lane }) {
  const r = normText(reply);
  if (r) return { reply: r, followUps };

  // If somehow empty, never return dead air:
  const chips = Array.isArray(followUps) && followUps.length ? followUps : [
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
   Public API
====================================================== */

async function handleChat(input = {}) {
  const tNow = nowMs();

  const session = (input && input.session && typeof input.session === "object") ? input.session : Object.create(null);
  const visitorId = String(input.visitorId || input.visitorID || "anon");
  const clientRequestId = String(input.clientRequestId || input.requestId || "");
  const debug = !!input.debug;

  const inbound = parseInbound({ text: input.text, payload: input.payload });
  const lower = normLower(inbound.text);

  // Inbound hash is based on deterministic properties (text + payload lane/action/year/mode)
  const inboundHash = sha1(JSON.stringify({
    t: lower,
    lane: inbound.lane,
    action: inbound.action,
    mode: inbound.mode,
    year: inbound.year,
  }));

  // Loop tracking (consecutive repeats within sustain window)
  const repeats = recordLoopEvent(session, inboundHash);

  // Sustained loop fuse: after N repeats, break the pattern hard.
  if (repeats >= SUSTAIN_REPEAT_LIMIT) {
    const breakerReply = "I think we’re stuck in a repeat loop. Want me to reset the conversation state and start fresh, or keep the current lane and try a new angle?";
    const breakerFollowUps = [
      { id: "reset_all", type: "chip", label: "Reset and restart", payload: { lane: "system", action: "reset" } },
      { id: "keep_music", type: "chip", label: "Keep lane, new prompt", payload: { lane: "system", action: "nudge" } },
    ];

    const outBreaker = ensureAdvance({ reply: breakerReply, followUps: breakerFollowUps, lane: inbound.lane || "" });

    return {
      ok: true,
      reply: outBreaker.reply,
      lane: inbound.lane || (session.lane || ""),
      ctx: { loopFuse: true, repeats },
      ui: null,
      directives: [{ type: "loop_fuse", repeats }],
      followUps: sanitizeFollowUps(outBreaker.followUps),
      followUpsStrings: followUpsToLegacyStrings(outBreaker.followUps),
      sessionPatch: { lastIntentSig: inboundHash, allowPackets: false },
      cog: session.cog || null,
      requestId: clientRequestId || null,
      meta: debug ? { engine: CE_VERSION, reason: "sustained_loop_fuse", inboundHash, repeats } : null,
    };
  }

  // Replay key (sticky replay fix)
  const replayKey = buildReplayKey({ visitorId, clientRequestId, inboundHash });

  // Burst dedupe: if same replayKey hit within burst window, return remembered response
  const remembered = getRememberedReply(session, replayKey);
  if (remembered && remembered.t && (tNow - remembered.t) <= BURST_WINDOW_MS) {
    return Object.assign(Object.create(null), remembered.out, {
      meta: debug ? Object.assign(Object.create(null), remembered.out.meta || null, {
        engine: CE_VERSION,
        replay: true,
        replayKey,
        inboundHash
      }) : null,
    });
  }

  // Determine structured music
  const structuredMusic = looksLikeStructuredMusic({
    lane: inbound.lane,
    action: inbound.action,
    mode: inbound.mode,
    year: inbound.year,
    text: inbound.text
  });

  // Set packets gate on session (packets.js will also enforce)
  session.allowPackets = computeAllowPackets({ structuredMusic, lane: inbound.lane || session.lane || "" });

  // Routing result
  let routed = null;

  // 1) Chip-authoritative music route
  if (structuredMusic) {
    routed = musicReply({ year: inbound.year, mode: inbound.mode || inbound.action });
    mergeSession(session, routed.sessionPatch);
    // Packets should not fire on this turn
  } else {
    // 2) Packets (greet/help/fallback/nav) — only if allowed
    if (packets && typeof packets.handleChat === "function") {
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

    // 3) If packets didn't match, return a smart “advance” prompt (never empty)
    if (!routed) {
      const y = extractYearFromText(inbound.text);
      if (y) {
        routed = musicReply({ year: y, mode: "story" });
      } else {
        routed = {
          reply: "Tell me what you want next—music by year, a show, a channel question, or something else. If you give me a year, I can anchor it instantly.",
          followUps: [
            { id: "chip_music", type: "chip", label: "Music by year", payload: { lane: "music", action: "start" } },
            { id: "chip_1988", type: "chip", label: "1988 Top 10", payload: { lane: "music", action: "year", year: 1988, mode: "top10" } },
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
    lane: inbound.lane || session.lane || "",
  });

  const followUps = sanitizeFollowUps(
    (safeOut.followUps || []).map((x) => {
      // normalize to contract format
      if (x && x.payload) return x;
      return {
        id: x.id || safeId("chip"),
        type: x.type || "chip",
        label: x.label || "",
        payload: x.payload || (x.send ? { text: x.send } : (x.payload || {})),
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
    },
    ui: null,
    directives: [],
    followUps,
    followUpsStrings: followUpsToLegacyStrings(followUps),
    sessionPatch: safeSessionPatch({
      lane: inbound.lane || session.lane || "general",
      lastIntentSig: inboundHash,
      allowPackets: session.allowPackets === true,
      lastMusicYear: session.lastMusicYear || (session.cog && session.cog.lastMusicYear) || null,
      activeMusicMode: session.activeMusicMode || null,
      __nyxPackets: session.__nyxPackets || null,
      cog: session.cog || null,
    }) || null,
    cog: session.cog || null,
    requestId: clientRequestId || null,
    meta: debug ? {
      engine: CE_VERSION,
      inboundHash,
      replayKey,
      structuredMusic,
      repeats,
      lane: inbound.lane || session.lane || "",
      packetMeta: routed && routed.meta ? routed.meta : null,
    } : null,
  };

  // Remember reply for burst dedupe (and replays)
  rememberReply(session, replayKey, { out });

  return out;
}

/**
 * Export aliases for maximum compatibility with index.js resolvers.
 */
function module_handleChat(args) { return handleChat(args); }
function respond(args) { return handleChat(args); }
function chat(args) { return handleChat(args); }
function run(args) { return handleChat(args); }
function route(args) { return handleChat(args); }

module.exports = {
  CE_VERSION,
  handleChat,
  module_handleChat,
  respond,
  chat,
  run,
  route,
};
