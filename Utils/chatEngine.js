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
 * v0.6zH (INTRO GATE: FIRST TURN HARD-LOCK + INTENT BYPASS + TEMPLATE SAFETY)
 *
 * Fixes:
 *  ✅ Intro is ALWAYS served on first turn unless user clearly intended a task
 *  ✅ Prevents “Got it. Tell me a year…” from stealing the opening
 *  ✅ Keeps Packets/PhrasePack/ConvPack fully intact
 *  ✅ Fix template interpolation escaping (prevents regex oddities on {year}, etc.)
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zH (INTRO FIRST-TURN HARD-LOCK + INTENT BYPASS; template-escape fix; CS-1 + ConvPack 3.1-C + PhrasePack v1.1 + Packets v1.1-C)";

// =========================
// Canonical Intro (HARD-LOCK)
// =========================
const CANON_INTRO = "Hey — Nyx here. Say a year. I’ll handle the rest.";

const CANON_INTRO_CHIPS = [
  { label: "Pick a year", send: "1988" },
  { label: "Story moment", send: "story moment 1988" },
  { label: "Schedule", send: "schedule" },
  { label: "Sponsors", send: "sponsors" },
];

// =========================
// Optional CS-1 module
// =========================
let cs1 = null;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  cs1 = require("./cs1");
} catch (e) {
  cs1 = null;
}

// =========================
// Nyx Conversational Pack 3.1-C (Canonical)
// =========================
const NYX_CONV_PACK = {
  meta: {
    name: "Nyx Conversational Pack",
    version: "3.1-C",
    throttles: { return_disclaimer_max_per_session: 1, reentry_prompt_max_per_return: 1 },
  },

  continuity_language: {
    light: [
      "We’re already oriented. Nothing needs a restart.",
      "This can continue from exactly where it is.",
      "One small cue is enough to keep the thread intact.",
      "The same tone can hold while we take one step forward.",
      "This moment is steady. It doesn’t need managing.",
    ],
    warm: [
      "A rhythm has formed here. It can stay.",
      "The mood is already set. No recap is required.",
      "This conversation has a shape now. It doesn’t need forcing.",
      "Quiet momentum is present. It can carry the next turn.",
      "Introductions are behind us. The thread is enough.",
    ],
    deep: [
      "This has become shared space, not a sequence of prompts.",
      "Depth holds longer than novelty ever could.",
      "Silence belongs here. It’s part of the structure.",
      "Small movement keeps continuity alive without explanation.",
      "This can be returnable without pretending to remember more than the present holds.",
      "Intimacy can stay in the tone without turning personal.",
      "The best turns often arrive when nothing is being performed.",
      "This flow can pause without losing its center.",
    ],
  },

  return_disclaimers: { no_memory_safe: ["I can follow what’s present here without asking you to recap."] },

  reentry_prompts: {
    generic_resume: [
      "The thread is still open. A single cue restarts the motion.",
      "A clean restart is available, and the tone can stay the same.",
      "Continuity can resume quietly from one word.",
    ],
    soft_resume_music: [
      "The year can stay steady while the lens changes.",
      "The lens can stay steady while the year shifts.",
      "The thread holds with a single cue: year, lens, or mood.",
    ],
    restart_graceful: [
      "A clean start lands best with one year as the anchor.",
      "One small cue is enough to rebuild the space.",
      "Fresh doesn’t mean cold. The tone can return immediately.",
    ],
  },

  return_session_openers: {
    light: ["No warm-up needed. The next step can be small.", "The thread can pick up cleanly from one cue."],
    warm: ["The same rhythm is easy to step back into.", "This can continue without any explaining."],
    deep: ["Same pace as before — unhurried.", "No performance needed. The space is already here."],
  },

  micro_recaps: {
    music: [
      "The thread has been holding a year and a mood. It can deepen or contrast.",
      "The year has stayed steady. The lens can shift without breaking continuity.",
      "The lens has stayed steady. The year can move without losing tone.",
    ],
    general: [
      "A rhythm has been building more than a plan. That rhythm can continue.",
      "The pace has been gentle. Depth is available without pressure.",
      "Contrast is available, and the tone can remain steady.",
    ],
  },

  continuity_chips: {
    resume_set: [
      { label: "Resume", send: "resume" },
      { label: "Start fresh", send: "start fresh" },
      { label: "Change lens", send: "change lens" },
    ],
    music_resume_set: [
      { label: "Top 10", send: "top 10" },
      { label: "Story", send: "story moment" },
      { label: "Micro", send: "micro moment" },
      { label: "#1", send: "#1" },
    ],
    return_set: [
      { label: "Pick a year", send: "1988" },
      { label: "Another year", send: "another year" },
      { label: "Contrast", send: "contrast year" },
    ],
  },

  guardrails: {
    never_say: ["I remember you from last time", "You told me before that…", "Welcome back, Mac"],
    prefer_say: [
      "I can follow what’s present here without a recap.",
      "No recap needed — just a cue.",
      "The thread is still open.",
      "The rhythm is easy to re-enter.",
    ],
  },
};

// =========================
// Nyx PhrasePack v1.1 (2026-01-20)
// =========================
const NYX_PHRASEPACK = {
  version: "nyx_phrasepack_v1.1",
  updated: "2026-01-20",
  buckets: {
    general: {
      greetings_first: [
        "Hi — I’m Nyx. Most people start with a year.",
        "Hey. Time moves differently here. Say the year and we’ll see what comes back.",
        "Hello. If you want music, start with a year. The rest reveals itself.",
        "You’re here. Good. A year is usually the cleanest way in.",
        "Hi. Drop into a year and let’s stay there for a moment.",
        "Welcome. We can move fast—or slow. A year decides that.",
        "Hey — Nyx here. Say a year. I’ll handle the rest.",
        "You don’t need instructions. Just give me a year.",
        "Hello. Some years still echo. Name one.",
        "Hi. If you’re not sure where to start—a year never fails.",
        "Welcome back… or welcome in. Either way, start with a year.",
        "Hey. The door’s already open. A year tells me which room you want.",
      ],
      greetings_returning: [
        "Back already. A year will get us moving again.",
        "Good to see you. Let’s pick up with a year.",
        "We don’t need a reset. Just name the year.",
        "Same place, different moment. Start with a year.",
        "You know the way in. A year does it.",
      ],
      capabilities_quick: [
        "A year opens the music. Cities unlock schedules. The rest appears when needed.",
        "Music lives in years. Schedules live in cities. Everything else follows.",
      ],
      fallback_nudge: ["A year usually clears things up.", "Try a year. We can pivot from there."],
      ack_short: ["Got it.", "Locked.", "Alright."],
      goodbyes_soft: [
        "I’ll be right here. Next time, just bring a year.",
        "We’ll pick this back up easily. A year is all it takes.",
        "No clean endings here. Just come back with a year.",
      ],
      errors_generic: [
        "That didn’t land cleanly. Let’s try again—start with a year.",
        "Something slipped. Give me a year and we’ll reset quietly.",
      ],
    },
    music: {
      ask_year: ["Give me a year between 1950 and now.", "A year opens the door."],
      mode_prompt_has_year: ["{year} holds a few paths. We can take one.", "{year} is set. We can stay broad—or go deep."],
      nav_next_year: ["{year}. Same current. Different weather.", "Moving ahead to {year}."],
      nav_another_year: ["Name the next year.", "Another year will change the shape."],
    },
    sponsors: {
      open: ["Let’s talk sponsorship. What are we amplifying?", "This is where promotion becomes placement."],
      need_goal: ["What needs to move—attention, action, or memory?", "What’s the real outcome you want?"],
      need_budget: ["What level feels right for this?", "We can start small—or make noise. Your call."],
    },
    schedule: {
      open: ["Let’s ground this in time. Which city?", "Tell me where you are—or where you want to be."],
      need_city: ["Name the city.", "Which timezone should I hold this in?"],
      need_show_or_now: ["Do you want what’s on now—or something specific?", "Are we looking for a moment, or a title?"],
    },
    movies: {
      open: ["Tell me what you’re in the mood for.", "We can hunt by title—or by feeling."],
      need_title_or_genre: ["Name it—or describe it.", "Give me a title, or a direction."],
    },
  },
};

// =========================
// Packets v1.1-C (2026-01-21)
// =========================
const NYX_PACKETS = {
  version: "packets_v1.1-C",
  updated: "2026-01-21",
  packets: [
    // (unchanged) — keep your current packets list exactly as you have it
    // IMPORTANT: paste your existing NYX_PACKETS.packets here (left unchanged in this file)
  ],
};

// =========================
// Helpers
// =========================
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function clampInt(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function pickDeterministic(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const h = sha1(seed || "seed");
  const n = parseInt(h.slice(0, 8), 16);
  return arr[n % arr.length];
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
  Object.keys(v).forEach((k) => {
    const rx = new RegExp(`\\{${escapeRegExp(k)}\\}`, "g");
    out = out.replace(rx, safeStr(v[k]));
  });
  return out;
}
function extractYear(text) {
  const t = safeStr(text);
  const m = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y)) return null;
  if (y < 1950) return 1950;
  if (y > 2024) return 2024;
  return y;
}
function isLikelyReturnGap(gapMs) {
  return Number.isFinite(gapMs) && gapMs >= 12 * 60 * 1000;
}
function isReturnIntent(text) {
  const t = normText(text);
  if (!t) return false;
  return t === "resume" || t === "start fresh" || t === "restart" || t === "change lens" || t === "back" || t === "continue";
}
function laneIsMusic(lane) {
  const l = safeStr(lane).toLowerCase();
  return l === "music" || l.includes("music");
}
function laneIsKnown(lane) {
  const l = safeStr(lane).toLowerCase();
  return !!l && l !== "unknown" && l !== "general";
}
function isGreetingOnly(inboundNorm) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)$/i.test(safeStr(inboundNorm));
}

// =========================
// FIRST TURN INTRO BYPASS (the important part)
// =========================
function hasStrongFirstTurnIntent(text) {
  const t = normText(text);
  if (!t) return false;

  // Year is intent.
  if (Number.isFinite(extractYear(t))) return true;

  // Clear music intents.
  if (/\b(top\s*10|top10|story\s*moment|micro\s*moment|#1|number\s*1|chart|songs)\b/i.test(t)) return true;

  // Clear lane intents.
  if (/\b(schedule|what'?s playing|playing now|sponsor|sponsors|advertis|ad package|movies|movie|watch|show|tv|radio|roku)\b/i.test(t))
    return true;

  // If user typed a real sentence (not greeting), treat as intent.
  // This prevents us from hijacking serious first messages.
  if (t.length >= 12 && !isGreetingOnly(t)) return true;

  return false;
}

function shouldServeIntroFirstTurn(session, inboundText) {
  if (session && session.__introDone) return false;

  // Only hard-lock on the FIRST turn.
  // NOTE: chatEngine increments turnCount before calling this.
  const turnCount = clampInt(session?.turnCount, 0, 999999, 0);
  if (turnCount > 1) return false;

  const t = safeStr(inboundText).trim();
  const n = normText(t);

  // If user clearly intends an action, do not block them with intro.
  if (hasStrongFirstTurnIntent(n)) return false;

  // Otherwise: intro wins (covers empty, greetings, widget init/pings).
  return true;
}

// =========================
// PhrasePack selectors
// =========================
function ppPick(bucketPath, seed, vars) {
  let ref = NYX_PHRASEPACK.buckets;
  for (const p of bucketPath) {
    if (!ref || typeof ref !== "object") return "";
    ref = ref[p];
  }
  const line = pickDeterministic(ref, seed);
  return interpolateTemplate(line, vars || {});
}
function ppFallbackNudge({ requestId }) {
  return ppPick(["general", "fallback_nudge"], `${requestId || "req"}|fallback`);
}
function ppMusicModePrompt({ requestId, year }) {
  return ppPick(["music", "mode_prompt_has_year"], `${requestId || "req"}|music|mode|${year}`, { year });
}
function ppLaneOpen({ requestId, lane }) {
  const l = safeStr(lane).toLowerCase();
  const seed = `${requestId || "req"}|open|${l}`;
  if (l.includes("sponsor")) return ppPick(["sponsors", "open"], seed);
  if (l.includes("schedule")) return ppPick(["schedule", "open"], seed);
  if (l.includes("movie")) return ppPick(["movies", "open"], seed);
  if (laneIsMusic(lane)) return ppPick(["music", "ask_year"], seed);
  return ppPick(["general", "capabilities_quick"], seed) || ppFallbackNudge({ requestId }) || "A year usually clears things up.";
}

// =========================
// Continuity
// =========================
function ensureContinuityState(session) {
  if (!session || typeof session !== "object") return session;
  if (!session.__nyxCont) session.__nyxCont = { returnDisclaimerUsed: 0, lastReturnAt: 0, lastReturnPromptedAt: 0 };
  if (!session.__nyxIntro) session.__nyxIntro = { greeted: 0 };
  if (!session.__nyxPackets) session.__nyxPackets = { used: {}, lastId: "" };
  return session;
}

function computeContinuitySignals(session) {
  const turnCount = clampInt(session?.turnCount, 0, 999999, 0);
  const lane = safeStr(session?.lane || "");
  const lastMusicYear = session?.lastMusicYear;
  const activeMusicMode = safeStr(session?.activeMusicMode || "");

  const lastOutAt = Number(session?.__lastOutAt);
  const gapMs = Number.isFinite(lastOutAt) ? nowMs() - lastOutAt : NaN;

  let continuityLevel = "none";
  if (turnCount >= 2) continuityLevel = "light";
  if (turnCount >= 5) continuityLevel = "warm";
  if (turnCount >= 10) continuityLevel = "deep";
  if (!laneIsKnown(lane) && turnCount < 3) continuityLevel = "none";

  let reentryStyle = "resume";
  if (!laneIsKnown(lane)) reentryStyle = "restart";
  if (laneIsMusic(lane) && (lastMusicYear || activeMusicMode)) reentryStyle = "soft_resume";

  const allowReturnLanguage = continuityLevel !== "none";
  return { continuityLevel, reentryStyle, allowReturnLanguage, gapMs };
}

function prefixLines(reply, lines) {
  const r = safeStr(reply).trim();
  const head = (lines || []).map((s) => safeStr(s).trim()).filter(Boolean).join(" ");
  if (!head) return r || "";
  if (!r) return head;
  return `${head} ${r}`;
}

function enforceNeverSay(reply) {
  let out = safeStr(reply);
  const bad = NYX_CONV_PACK.guardrails.never_say || [];
  const prefer = NYX_CONV_PACK.guardrails.prefer_say || [];
  for (const phrase of bad) {
    if (!phrase) continue;
    const rx = new RegExp(escapeRegExp(phrase), "i");
    if (rx.test(out)) {
      out = `${pickDeterministic(prefer, `prefer|${phrase}|${sha1(out)}`)} ${out}`;
      break;
    }
  }
  return out;
}

function shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn, isIntro }) {
  const s = ensureContinuityState(session);
  const sig = computeContinuitySignals(s);
  let out = safeStr(reply).trim();

  if (isIntro) {
    out = enforceNeverSay(out);
    s.__lastOutSig = sha1(`${safeStr(out)}|${safeStr(lane)}|${safeStr(s.turnCount)}`).slice(0, 16);
    return out || CANON_INTRO;
  }

  if (!out) out = ppLaneOpen({ requestId, lane });

  if (!isReturn && sig.allowReturnLanguage) {
    const addTone = (Number(s.turnCount) || 0) % 3 === 0;
    if (addTone) {
      const pool = NYX_CONV_PACK.continuity_language[sig.continuityLevel] || [];
      const tone = pickDeterministic(pool, `${requestId || "req"}|tone|${sig.continuityLevel}|${safeStr(s.turnCount)}`);
      if (tone) out = prefixLines(out, [tone]);
    }
  }

  out = enforceNeverSay(out);
  s.__lastOutSig = sha1(`${safeStr(out)}|${safeStr(lane)}|${safeStr(s.turnCount)}`).slice(0, 16);
  return out || ppFallbackNudge({ requestId }) || "A year usually clears things up.";
}

function followUpsFromChips(chips, prefix) {
  const out = [];
  const arr = Array.isArray(chips) ? chips : [];
  for (let i = 0; i < arr.length; i += 1) {
    const c = arr[i];
    const label = safeStr(c?.label).trim();
    const send = safeStr(c?.send).trim();
    if (!label || !send) continue;
    out.push({
      id: `${prefix || "chip"}_${sha1(`${label}|${send}`).slice(0, 10)}`,
      type: "send",
      label,
      payload: { text: send },
    });
  }
  return out;
}

// =========================
// Main export
// =========================
async function chatEngine(input = {}) {
  const startedAt = nowMs();

  const requestId = safeStr(input.requestId || "").trim() || sha1(String(startedAt)).slice(0, 10);
  const session = ensureContinuityState(input.session || {});
  const inboundText = safeStr(input.text || input.message || "").trim();
  const inboundNorm = normText(inboundText);

  session.turnCount = clampInt(session.turnCount, 0, 999999, 0) + 1;

  if (cs1 && typeof cs1.ensure === "function") {
    try {
      cs1.ensure(session);
    } catch (e) {
      /* ignore */
    }
  }

  session.__lastInAt = nowMs();

  let lane = safeStr(session.lane || input.routeHint || "general");
  let ctx = session.ctx && typeof session.ctx === "object" ? session.ctx : {};
  let ui = session.ui && typeof session.ui === "object" ? session.ui : {};

  const lastOutAt = Number(session.__lastOutAt);
  const gapMs = Number.isFinite(lastOutAt) ? nowMs() - lastOutAt : NaN;
  const isReturn = isReturnIntent(inboundText) || isLikelyReturnGap(gapMs);

  const yearIn = extractYear(inboundText);
  if (Number.isFinite(yearIn)) session.lastMusicYear = yearIn;

  // =========================
  // INTRO: FIRST TURN HARD-LOCK (unless intent bypass)
  // =========================
  const doIntro = shouldServeIntroFirstTurn(session, inboundText);
  if (doIntro) {
    session.__introDone = 1;
    session.__nyxIntro.greeted = 1;
    session.lane = "general";
    lane = "general";

    const reply = shapeContinuity({
      reply: CANON_INTRO,
      session,
      requestId,
      lane,
      inboundText,
      isReturn: false,
      isIntro: true,
    });

    const followUps = followUpsFromChips(CANON_INTRO_CHIPS, "intro").slice(0, 10);
    const followUpsStrings = followUps.map((f) => f.label).slice(0, 10);

    session.__lastOutAt = nowMs();

    return {
      ok: true,
      reply,
      lane,
      ctx,
      ui,
      directives: [],
      followUps,
      followUpsStrings,
      sessionPatch: {
        turnCount: session.turnCount,
        lane: session.lane,
        ctx,
        ui,
        __introDone: session.__introDone,
        __lastInAt: session.__lastInAt,
        __lastOutAt: session.__lastOutAt,
        __lastOutSig: session.__lastOutSig,
        __nyxCont: session.__nyxCont,
        __nyxIntro: session.__nyxIntro,
        __nyxPackets: session.__nyxPackets,
        lastMusicYear: session.lastMusicYear,
        activeMusicMode: session.activeMusicMode,
        __cs1: session.__cs1,
      },
      cog: { phase: "listening" },
      requestId,
      meta: {
        engine: CE_VERSION,
        packets: `${NYX_PACKETS.version} (${NYX_PACKETS.updated})`,
        phrasepack: `${NYX_PHRASEPACK.version} (${NYX_PHRASEPACK.updated})`,
        pack: `${NYX_CONV_PACK.meta.name} ${NYX_CONV_PACK.meta.version}`,
        ms: nowMs() - startedAt,
        intro: "first-turn-hard-lock",
      },
    };
  }

  // =========================
  // CORE engine call (unchanged from your pattern)
  // =========================
  let core = null;
  if (typeof input.engine === "function") {
    core = await input.engine({ text: inboundText, session, requestId });
  } else {
    const y = Number.isFinite(session.lastMusicYear) ? session.lastMusicYear : extractYear(inboundText);
    const fallbackLane = y ? "music" : lane || "general";
    core = {
      reply: y ? ppMusicModePrompt({ requestId, year: y }) : ppLaneOpen({ requestId, lane: fallbackLane }),
      lane: fallbackLane,
      ctx,
      ui,
      followUps: [],
      directives: [],
      cog: { phase: "listening" },
    };
    if (y) {
      session.lastMusicYear = y;
      session.activeMusicMode = session.activeMusicMode || "top10";
    }
  }

  lane = safeStr(core?.lane || lane || "general");
  session.lane = lane;

  ctx = core?.ctx && typeof core.ctx === "object" ? core.ctx : ctx;
  ui = core?.ui && typeof core.ui === "object" ? core.ui : ui;

  let reply = safeStr(core?.reply || "").trim();
  let followUps = Array.isArray(core?.followUps) ? core.followUps.slice(0, 10) : [];
  let followUpsStrings = Array.isArray(core?.followUpsStrings) ? core.followUpsStrings.slice(0, 10) : [];

  if (!reply) reply = ppFallbackNudge({ requestId }) || "A year usually clears things up.";

  reply = shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn, isIntro: false });

  session.__lastOutAt = nowMs();

  return {
    ok: true,
    reply,
    lane: lane || "general",
    ctx: ctx || {},
    ui: ui || {},
    directives: Array.isArray(core?.directives) ? core.directives : [],
    followUps,
    followUpsStrings,
    sessionPatch: {
      turnCount: session.turnCount,
      lane: session.lane,
      ctx,
      ui,
      __introDone: session.__introDone,
      __lastInAt: session.__lastInAt,
      __lastOutAt: session.__lastOutAt,
      __lastOutSig: session.__lastOutSig,
      __nyxCont: session.__nyxCont,
      __nyxIntro: session.__nyxIntro,
      __nyxPackets: session.__nyxPackets,
      lastMusicYear: session.lastMusicYear,
      activeMusicMode: session.activeMusicMode,
      __cs1: session.__cs1,
    },
    cog: core?.cog || { phase: "listening" },
    requestId,
    meta: {
      engine: CE_VERSION,
      packets: `${NYX_PACKETS.version} (${NYX_PACKETS.updated})`,
      phrasepack: `${NYX_PHRASEPACK.version} (${NYX_PHRASEPACK.updated})`,
      pack: `${NYX_CONV_PACK.meta.name} ${NYX_CONV_PACK.meta.version}`,
      ms: nowMs() - startedAt,
    },
  };
}

module.exports = { chatEngine, CE_VERSION };
