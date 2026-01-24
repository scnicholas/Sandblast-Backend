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
 * v0.6zF (INTRO GATE HARD-LOCK + CS-1 WIRING++ + Conversational Pack 3.1-C + PhrasePack v1.1 + Packets v1.1-C)
 *
 * Adds:
 *  ✅ Canonical Intro Gate (hard-lock)
 *     - First-turn intro is deterministic and cannot be replaced by packets/phrasepack/continuity
 *     - Greeting packets suppressed until intro is served
 *  ✅ Conversational Pack 3.1-C continuity/return language (NON-IDENTITY)
 *  ✅ PhrasePack v1.1 (Nyx host-voice buckets)
 *  ✅ Packets v1.1-C (triggered micro-scripts w/ chips + optional sessionPatch)
 *     - Trigger matching (exact/contains) w/ deterministic selection
 *     - oncePerSession constraints (per packet id)
 *     - requiresYear constraint (music ask_year)
 *     - Special triggers: __fallback__, __error__, __mode_prompt__, __nav_next_year__, __nav_another_year__
 *
 * Guardrails:
 *  ✅ No long-term memory claims
 *  ✅ No-tech-leak / short / action-forward
 *  ✅ Statement-first preference
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zF (INTRO GATE HARD-LOCK + CS-1 + ConvPack 3.1-C + PhrasePack v1.1 + Packets v1.1-C)";

// =========================
// Canonical Intro (HARD-LOCK)
// =========================
const CANON_INTRO = "Hey — Nyx here. Say a year. I’ll handle the rest.";

const CANON_INTRO_CHIPS = [
  { label: "Start with a year", send: "1988" },
  { label: "Schedule", send: "schedule" },
  { label: "Sponsors", send: "sponsors" },
  { label: "Something to watch", send: "movies" },
];

// =========================
// Optional CS-1 module
// =========================
let cs1 = null;
try {
  // Optional module; safe if absent
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
    {
      id: "general.greetings_first",
      type: "greeting",
      lane: "general",
      trigger: ["hi", "hello", "hey", "yo", "good morning", "good afternoon", "good evening"],
      templates: [
        "Hi — I’m Nyx. Most people start with a year.",
        "Hey. Time moves differently here. A year opens the door.",
        "Hello. A year is usually the cleanest way in.",
      ],
      chips: [
        { label: "Start with a year", send: "1988" },
        { label: "Schedule", send: "schedule" },
        { label: "Sponsors", send: "sponsors" },
        { label: "Something to watch", send: "movies" },
      ],
      constraints: { oncePerSession: true },
      sessionPatch: { lane: "general" },
    },
    {
      id: "general.greetings_returning",
      type: "greeting",
      lane: "general",
      trigger: ["welcome back", "back again", "i'm back", "im back", "we're back", "were back", "again"],
      templates: ["Good to see you again. A year will get us moving.", "Back already. We can pick up easily."],
      chips: [
        { label: "Pick up with a year", send: "1988" },
        { label: "Schedule", send: "schedule" },
        { label: "Sponsors", send: "sponsors" },
        { label: "Something to watch", send: "movies" },
      ],
      constraints: { oncePerSession: true },
      sessionPatch: { lane: "general" },
    },
    {
      id: "general.capabilities_quick",
      type: "help",
      lane: "general",
      trigger: ["help", "options", "what can you do", "what do you do", "menu", "capabilities", "how does this work"],
      templates: [
        "Music lives in years. Schedules live in cities. The rest unfolds as needed.",
        "A year opens music. A city grounds the schedule. Everything else follows.",
      ],
      chips: [
        { label: "Music by year", send: "1988" },
        { label: "Schedule", send: "schedule" },
        { label: "Sponsors", send: "sponsors" },
        { label: "Watch something", send: "movies" },
      ],
      sessionPatch: { lane: "general" },
    },
    {
      id: "general.goodbyes_soft",
      type: "goodbye",
      lane: "general",
      trigger: ["bye", "goodbye", "good night", "goodnight", "later", "see you", "i'm done", "im done", "that’s all", "thats all"],
      templates: ["That feels like a good place to pause.", "Easy to return. A year brings it back.", "We can pick this up whenever."],
      chips: [
        { label: "Top 10 from a year", send: "top 10 1994" },
        { label: "Schedule", send: "schedule" },
      ],
      sessionPatch: { lane: "general" },
    },
    {
      id: "general.fallback_nudge",
      type: "fallback",
      lane: "general",
      trigger: ["__fallback__"],
      templates: ["A year usually clears things up.", "We can start small. One year is enough."],
      chips: [
        { label: "Start with a year", send: "1988" },
        { label: "Schedule", send: "schedule" },
        { label: "Sponsors", send: "sponsors" },
        { label: "Watch something", send: "movies" },
      ],
      sessionPatch: { lane: "general" },
    },
    {
      id: "general.errors_generic",
      type: "error",
      lane: "general",
      trigger: ["__error__"],
      templates: ["Something slipped. Let’s try again.", "That didn’t land cleanly. A year will reset it."],
      chips: [
        { label: "Start with a year", send: "1988" },
        { label: "Schedule", send: "schedule" },
        { label: "Sponsors", send: "sponsors" },
        { label: "Watch something", send: "movies" },
      ],
      sessionPatch: { lane: "general" },
    },
    {
      id: "music.ask_year",
      type: "prompt",
      lane: "music",
      trigger: ["music", "top 10", "top10", "story moment", "story", "micro moment", "micro", "#1", "number 1", "chart", "songs"],
      templates: ["Music starts with a year.", "Give me the year and we’ll take it from there."],
      chips: [
        { label: "1988", send: "1988" },
        { label: "Top 10 (1988)", send: "top 10 1988" },
        { label: "Story (1988)", send: "story moment 1988" },
        { label: "Micro (1988)", send: "micro moment 1988" },
      ],
      constraints: { requiresYear: true },
      sessionPatch: { lane: "music" },
    },
    {
      id: "music.mode_prompt_has_year",
      type: "prompt",
      lane: "music",
      trigger: ["__mode_prompt__"],
      templates: ["{year} is set. Different lenses reveal different details.", "The year holds steady. The lens can change."],
      chips: [
        { label: "Top 10", send: "top 10" },
        { label: "Story", send: "story moment" },
        { label: "Micro", send: "micro moment" },
        { label: "#1", send: "#1" },
      ],
      sessionPatch: { lane: "music" },
    },
    {
      id: "music.nav_next_year",
      type: "nav",
      lane: "music",
      trigger: ["__nav_next_year__"],
      templates: ["{year}. Same lens.", "Moving forward to {year}."],
      chips: [{ label: "Replay", send: "replay" }],
      sessionPatch: { lane: "music" },
    },
    {
      id: "music.nav_another_year",
      type: "nav",
      lane: "music",
      trigger: ["another year", "__nav_another_year__"],
      templates: ["Name the year.", "Another year shifts the tone."],
      chips: [
        { label: "1988", send: "1988" },
        { label: "1999", send: "1999" },
        { label: "2007", send: "2007" },
      ],
      sessionPatch: { lane: "music" },
    },
    {
      id: "sponsors.open",
      type: "prompt",
      lane: "sponsors",
      trigger: ["sponsor", "sponsors", "advertise", "advertising", "ad package", "promotion", "promote"],
      templates: ["Let’s talk sponsorship.", "This is where visibility turns intentional."],
      chips: [
        { label: "TV", send: "tv" },
        { label: "Radio", send: "radio" },
        { label: "Website", send: "website" },
        { label: "Social", send: "social" },
        { label: "Bundle", send: "bundle" },
      ],
      sessionPatch: { lane: "sponsors" },
    },
    {
      id: "sponsors.need_goal",
      type: "prompt",
      lane: "sponsors",
      trigger: ["__sponsors_need_goal__"],
      templates: ["The outcome matters more than the format.", "Results set the direction."],
      chips: [
        { label: "Calls", send: "calls" },
        { label: "Foot traffic", send: "foot traffic" },
        { label: "Website clicks", send: "website clicks" },
        { label: "Awareness", send: "brand awareness" },
      ],
      sessionPatch: { lane: "sponsors" },
    },
    {
      id: "sponsors.need_budget",
      type: "prompt",
      lane: "sponsors",
      trigger: ["__sponsors_need_budget__"],
      templates: ["Budget sets the scale.", "The tier defines how loud this gets."],
      chips: [
        { label: "Starter", send: "starter test" },
        { label: "Growth", send: "growth bundle" },
        { label: "Dominance", send: "dominance" },
      ],
      sessionPatch: { lane: "sponsors" },
    },
    {
      id: "schedule.open",
      type: "prompt",
      lane: "schedule",
      trigger: ["schedule", "what's playing", "whats playing", "playing now", "now", "today", "tonight", "what time", "time in", "in london", "in toronto"],
      templates: ["Time depends on where you are.", "The schedule shifts by city."],
      chips: [
        { label: "Playing now", send: "what’s playing now" },
        { label: "Today", send: "schedule today" },
        { label: "London", send: "in London" },
        { label: "Toronto", send: "in Toronto" },
      ],
      sessionPatch: { lane: "schedule" },
    },
    {
      id: "schedule.need_city",
      type: "prompt",
      lane: "schedule",
      trigger: ["__schedule_need_city__"],
      templates: ["The city sets the clock.", "One location is enough."],
      chips: [
        { label: "London", send: "in London" },
        { label: "Toronto", send: "in Toronto" },
        { label: "New York", send: "in New York" },
        { label: "Los Angeles", send: "in Los Angeles" },
      ],
      sessionPatch: { lane: "schedule" },
    },
    {
      id: "schedule.need_show_or_now",
      type: "prompt",
      lane: "schedule",
      trigger: ["__schedule_need_show__"],
      templates: ["The schedule can show what’s on now or lock onto a title."],
      chips: [
        { label: "Playing now", send: "what’s playing now" },
        { label: "Today", send: "schedule today" },
      ],
      sessionPatch: { lane: "schedule" },
    },
    {
      id: "movies.open",
      type: "prompt",
      lane: "movies",
      trigger: ["movie", "movies", "tv", "show", "shows", "recommend", "recommend something", "what to watch", "watch"],
      templates: ["Tell me what kind of mood you’re in."],
      chips: [
        { label: "Surprise me", send: "recommend something" },
        { label: "Classic TV", send: "classic tv" },
        { label: "Westerns", send: "westerns" },
        { label: "Detective", send: "detective" },
      ],
      sessionPatch: { lane: "movies" },
    },
    {
      id: "movies.need_title_or_genre",
      type: "prompt",
      lane: "movies",
      trigger: ["__movies_need_title_or_genre__"],
      templates: ["A title or a genre sets the direction."],
      chips: [
        { label: "Surprise me", send: "recommend something" },
        { label: "Classic TV", send: "classic tv" },
        { label: "Westerns", send: "westerns" },
        { label: "Detective", send: "detective" },
      ],
      sessionPatch: { lane: "movies" },
    },
  ],
};

// =========================
// Helpers (small + deterministic)
// =========================
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x);
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
function interpolateTemplate(s, vars) {
  let out = safeStr(s);
  Object.keys(vars || {}).forEach((k) => {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), safeStr(vars[k]));
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
function shouldServeIntro({ session, inboundText }) {
  const s = session && typeof session === "object" ? session : {};
  if (s.__introDone) return false;

  const t = safeStr(inboundText).trim();
  const n = normText(t);

  // Serve intro if:
  //  - first meaningful turn (empty / greeting / "start" / "open") and intro not done
  if (!n) return true;
  if (isGreetingOnly(n)) return true;
  if (n === "start" || n === "open" || n === "begin") return true;

  // If widget sends a minimal “hey/hi” variant, treat as greeting
  if (n.length <= 6 && (n === "hey" || n === "hi" || n === "yo")) return true;

  return false;
}

// =========================
// PhrasePack selectors (host-voice)
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
function ppErrorGeneric({ requestId }) {
  return ppPick(["general", "errors_generic"], `${requestId || "req"}|err`);
}
function ppGoodbyeSoft({ requestId }) {
  return ppPick(["general", "goodbyes_soft"], `${requestId || "req"}|bye`);
}
function ppMusicAskYear({ requestId }) {
  return ppPick(["music", "ask_year"], `${requestId || "req"}|music|askyear`);
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
  if (laneIsMusic(lane)) return ppMusicAskYear({ requestId });
  return (
    ppPick(["general", "capabilities_quick"], seed) ||
    ppFallbackNudge({ requestId }) ||
    "A year usually clears things up."
  );
}

// =========================
// Packets engine
// =========================
function ensurePacketsState(session) {
  if (!session || typeof session !== "object") return session;
  if (!session.__nyxPackets) {
    session.__nyxPackets = { used: {}, lastId: "" };
  }
  return session;
}

function packetTriggeredByText(packet, textNorm) {
  const triggers = Array.isArray(packet?.trigger) ? packet.trigger : [];
  for (const tr of triggers) {
    const t = normText(tr);
    if (!t) continue;
    if (t.startsWith("__") && t.endsWith("__")) continue; // special handled by caller
    if (textNorm === t) return true;
    if (textNorm.includes(t)) return true;
  }
  return false;
}

function packetHasSpecialTrigger(packet, special) {
  const triggers = Array.isArray(packet?.trigger) ? packet.trigger : [];
  return triggers.some((t) => normText(t) === normText(special));
}

function applyPacketConstraints(packet, session, year) {
  const st = ensurePacketsState(session).__nyxPackets;
  const once = !!packet?.constraints?.oncePerSession;
  if (once && st.used && st.used[packet.id]) return { ok: false, reason: "oncePerSession" };

  const reqYear = !!packet?.constraints?.requiresYear;
  if (reqYear && !Number.isFinite(year)) return { ok: false, reason: "requiresYear" };

  return { ok: true };
}

function packetToFollowUps(packet) {
  const chips = Array.isArray(packet?.chips) ? packet.chips : [];
  const out = [];
  for (let i = 0; i < chips.length; i += 1) {
    const c = chips[i];
    const label = safeStr(c?.label).trim();
    const send = safeStr(c?.send).trim();
    if (!label || !send) continue;
    out.push({
      id: `pkt_${sha1(packet.id + "|" + label + "|" + send).slice(0, 10)}`,
      type: "send",
      label,
      payload: { text: send },
    });
  }
  return out;
}

function pickPacketTemplate(packet, seed, vars) {
  const templates = Array.isArray(packet?.templates) ? packet.templates : [];
  const line = pickDeterministic(templates, seed);
  return interpolateTemplate(line, vars || {});
}

function isGreetingPacket(p) {
  const id = safeStr(p?.id);
  const type = safeStr(p?.type).toLowerCase();
  return type === "greeting" || id.startsWith("general.greetings_");
}

function runPackets({ inboundText, session, requestId, laneHint, specialTrigger, year, introDone }) {
  ensurePacketsState(session);
  const textNorm = normText(inboundText);
  const packets = NYX_PACKETS.packets || [];
  const laneLower = safeStr(laneHint || session.lane || "").toLowerCase();

  // 1) Special-trigger pass (explicit)
  if (specialTrigger) {
    for (const p of packets) {
      if (!introDone && isGreetingPacket(p)) continue; // HARD: greetings suppressed until intro done
      if (packetHasSpecialTrigger(p, specialTrigger)) {
        const chk = applyPacketConstraints(p, session, year);
        if (!chk.ok) continue;

        const reply = pickPacketTemplate(p, `${requestId}|pkt|${p.id}`, { year });
        return { hit: true, packet: p, reply };
      }
    }
  }

  // 2) Normal trigger pass, prefer same-lane packets, then general
  const candidates = [];
  for (const p of packets) {
    if (!p || !p.id) continue;
    if (!introDone && isGreetingPacket(p)) continue; // HARD: greetings suppressed until intro done

    const pLane = safeStr(p.lane || "").toLowerCase();
    const laneScore = pLane === laneLower ? 2 : pLane === "general" ? 1 : 0;

    if (packetTriggeredByText(p, textNorm)) {
      const chk = applyPacketConstraints(p, session, year);
      if (!chk.ok) continue;
      candidates.push({ p, laneScore });
    }
  }

  if (!candidates.length) return { hit: false };

  candidates.sort((a, b) => b.laneScore - a.laneScore || a.p.id.localeCompare(b.p.id));
  const chosen = candidates[0].p;

  const reply = pickPacketTemplate(chosen, `${requestId}|pkt|${chosen.id}`, { year });
  return { hit: true, packet: chosen, reply };
}

function commitPacketUse(session, packet) {
  const st = ensurePacketsState(session).__nyxPackets;
  st.used = st.used || {};
  st.used[packet.id] = 1;
  st.lastId = packet.id;

  const sp = packet.sessionPatch && typeof packet.sessionPatch === "object" ? packet.sessionPatch : null;
  if (sp && sp.lane) session.lane = sp.lane;
}

// =========================
// Conversational Pack — continuity selector
// =========================
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
  const suggestResumeOptions = allowReturnLanguage && (laneIsKnown(lane) || laneIsMusic(lane));

  return { continuityLevel, reentryStyle, allowReturnLanguage, suggestResumeOptions, gapMs };
}

function ensureContinuityState(session) {
  if (!session || typeof session !== "object") return session;
  if (!session.__nyxCont) session.__nyxCont = { returnDisclaimerUsed: 0, lastReturnAt: 0, lastReturnPromptedAt: 0 };
  if (!session.__nyxIntro) session.__nyxIntro = { greeted: 0 };
  ensurePacketsState(session);
  return session;
}

function buildReturnLines({ session, requestId, lane }) {
  const sig = computeContinuitySignals(session);
  const cont = ensureContinuityState(session).__nyxCont;

  const lines = [];
  const seedBase = `${requestId || "req"}|${safeStr(lane)}|${safeStr(session?.turnCount)}`;

  const maxDisc = NYX_CONV_PACK.meta.throttles.return_disclaimer_max_per_session;
  if ((cont.returnDisclaimerUsed || 0) < maxDisc) {
    lines.push(pickDeterministic(NYX_CONV_PACK.return_disclaimers.no_memory_safe, seedBase + "|disc"));
    cont.returnDisclaimerUsed = (cont.returnDisclaimerUsed || 0) + 1;
  }

  const openerPool = NYX_CONV_PACK.return_session_openers[sig.continuityLevel] || [];
  if (openerPool.length) lines.push(pickDeterministic(openerPool, seedBase + "|open"));

  const maxPrompt = NYX_CONV_PACK.meta.throttles.reentry_prompt_max_per_return;
  const didPromptRecently =
    Number(cont.lastReturnPromptedAt) && nowMs() - Number(cont.lastReturnPromptedAt) < 60 * 1000;
  if (!didPromptRecently && maxPrompt >= 1) {
    let pool = NYX_CONV_PACK.reentry_prompts.generic_resume;
    if (sig.reentryStyle === "soft_resume") pool = NYX_CONV_PACK.reentry_prompts.soft_resume_music;
    if (sig.reentryStyle === "restart") pool = NYX_CONV_PACK.reentry_prompts.restart_graceful;
    lines.push(pickDeterministic(pool, seedBase + "|prompt"));
    cont.lastReturnPromptedAt = nowMs();
  }

  cont.lastReturnAt = nowMs();
  return lines.map((x) => safeStr(x).trim()).filter(Boolean);
}

function buildContinuityToneLine({ session, requestId }) {
  const sig = computeContinuitySignals(session);
  if (!sig.allowReturnLanguage) return "";
  const pool = NYX_CONV_PACK.continuity_language[sig.continuityLevel] || [];
  return pickDeterministic(pool, `${requestId || "req"}|tone|${sig.continuityLevel}|${safeStr(session?.turnCount)}`);
}

function buildMicroRecap({ session, requestId, lane }) {
  const isMusic = laneIsMusic(lane) || laneIsMusic(session?.lane);
  const pool = isMusic ? NYX_CONV_PACK.micro_recaps.music : NYX_CONV_PACK.micro_recaps.general;
  return pickDeterministic(pool, `${requestId || "req"}|recap|${isMusic ? "m" : "g"}|${safeStr(session?.turnCount)}`);
}

function buildContinuityChips({ session, lane }) {
  const chips = [];
  const isMusic = laneIsMusic(lane) || laneIsMusic(session?.lane);

  for (const c of NYX_CONV_PACK.continuity_chips.resume_set) chips.push(c);
  if (isMusic) for (const c of NYX_CONV_PACK.continuity_chips.music_resume_set) chips.push(c);
  else for (const c of NYX_CONV_PACK.continuity_chips.return_set) chips.push(c);

  const seen = new Set();
  return chips.filter((c) => {
    const k = safeStr(c?.label);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// =========================
// Reply shaping
// =========================
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
    const rx = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (rx.test(out)) {
      out = pickDeterministic(prefer, `prefer|${phrase}|${sha1(out)}`) + " " + out;
      break;
    }
  }
  return out;
}

function shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn, isIntro }) {
  const s = ensureContinuityState(session);
  const sig = computeContinuitySignals(s);
  let out = safeStr(reply).trim();

  // Intro is a hard-locked surface: no return wrapper, no tone injection.
  if (isIntro) {
    out = enforceNeverSay(out);
    s.__lastOutSig = sha1(`${safeStr(out)}|${safeStr(lane)}|${safeStr(s.turnCount)}`).slice(0, 16);
    if (!out) out = CANON_INTRO;
    return out;
  }

  // If still empty, PhrasePack lane opener
  if (!out) out = ppLaneOpen({ requestId, lane });

  // Light continuity tone occasionally (non-return)
  if (!isReturn && sig.allowReturnLanguage) {
    const addTone = (Number(s.turnCount) || 0) % 3 === 0;
    if (addTone) {
      const tone = buildContinuityToneLine({ session: s, requestId });
      if (tone) out = prefixLines(out, [tone]);
    }
  }

  // Return wrapper
  if (isReturn) {
    const lines = buildReturnLines({ session: s, requestId, lane });
    const recapOk = laneIsKnown(lane) || laneIsMusic(lane);
    if (recapOk) {
      const recap = buildMicroRecap({ session: s, requestId, lane });
      if (recap) lines.push(recap);
    }
    out = prefixLines(out, lines);
  }

  out = enforceNeverSay(out);

  s.__lastOutSig = sha1(`${safeStr(out)}|${safeStr(lane)}|${safeStr(s.turnCount)}`).slice(0, 16);
  if (!out) out = ppFallbackNudge({ requestId }) || "A year usually clears things up.";
  return out;
}

// =========================
// Follow-up shaping
// =========================
function followUpsFromChips(chips, prefix) {
  const out = [];
  const arr = Array.isArray(chips) ? chips : [];
  for (let i = 0; i < arr.length; i += 1) {
    const c = arr[i];
    const label = safeStr(c?.label).trim();
    const send = safeStr(c?.send).trim();
    if (!label || !send) continue;
    out.push({
      id: `${prefix || "chip"}_${sha1(label + "|" + send).slice(0, 10)}`,
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
      // ignore
    }
  }

  session.__lastInAt = nowMs();

  let lane = safeStr(session.lane || input.routeHint || "general");
  let ctx = session.ctx && typeof session.ctx === "object" ? session.ctx : {};
  let ui = session.ui && typeof session.ui === "object" ? session.ui : {};

  const lastOutAt = Number(session.__lastOutAt);
  const gapMs = Number.isFinite(lastOutAt) ? nowMs() - lastOutAt : NaN;

  // Year capture (for downstream)
  const yearIn = extractYear(inboundText);
  if (Number.isFinite(yearIn)) session.lastMusicYear = yearIn;

  // =========================
  // HARD INTRO GATE (must run before packets/engine/continuity)
  // =========================
  const doIntro = shouldServeIntro({ session, inboundText });

  if (doIntro) {
    session.__introDone = 1;
    session.__nyxIntro.greeted = 1;
    session.lane = "general";
    lane = "general";

    const introFollowUps = followUpsFromChips(CANON_INTRO_CHIPS, "intro").slice(0, 10);
    const reply = shapeContinuity({
      reply: CANON_INTRO,
      session,
      requestId,
      lane,
      inboundText,
      isReturn: false,
      isIntro: true,
    });

    session.__lastOutAt = nowMs();

    return {
      ok: true,
      reply,
      lane,
      ctx,
      ui,
      directives: [],
      followUps: introFollowUps,
      followUpsStrings: introFollowUps.map((f) => f.label),
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
        intro: "canonical",
      },
    };
  }

  const introDone = !!session.__introDone;
  const isReturn = isReturnIntent(inboundText) || isLikelyReturnGap(gapMs);

  // =========================
  // Packets: FIRST PASS (normal triggers) — greetings suppressed until introDone
  // =========================
  let packetHit = runPackets({
    inboundText,
    session,
    requestId,
    laneHint: lane,
    specialTrigger: null,
    year: Number.isFinite(session.lastMusicYear) ? session.lastMusicYear : yearIn,
    introDone,
  });

  // If no packet matched and inbound is a greeting, allow greeting packets ONLY after introDone
  if (
    introDone &&
    !packetHit.hit &&
    isGreetingOnly(inboundNorm)
  ) {
    packetHit = runPackets({
      inboundText,
      session,
      requestId,
      laneHint: "general",
      specialTrigger: null,
      year: Number.isFinite(session.lastMusicYear) ? session.lastMusicYear : yearIn,
      introDone,
    });
  }

  // If packet matched, build reply + chips, apply patch + return early (no engine call)
  if (packetHit.hit && packetHit.packet) {
    commitPacketUse(session, packetHit.packet);

    lane = safeStr(session.lane || packetHit.packet.lane || lane || "general");

    let reply = safeStr(packetHit.reply).trim();
    reply = shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn, isIntro: false });

    const pktFollowUps = packetToFollowUps(packetHit.packet);
    const followUps = pktFollowUps.slice(0, 10);
    const followUpsStrings = followUps.map((f) => f.label);

    let finalFollowUps = followUps;
    let finalFollowUpsStrings = followUpsStrings;

    if (isReturn) {
      const contChips = buildContinuityChips({ session, lane });
      const contFollow = followUpsFromChips(contChips, "cont");
      finalFollowUps = followUps.concat(contFollow).slice(0, 10);
      finalFollowUpsStrings = finalFollowUps.map((f) => f.label).slice(0, 10);
    }

    session.__lastOutAt = nowMs();

    return {
      ok: true,
      reply,
      lane,
      ctx,
      ui,
      directives: [],
      followUps: finalFollowUps,
      followUpsStrings: finalFollowUpsStrings,
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
        packetId: packetHit.packet.id,
      },
    };
  }

  // =========================
  // Core lane handling (engine)
  // =========================
  let core = null;
  if (typeof input.engine === "function") {
    core = await input.engine({ text: inboundText, session, requestId });
  } else {
    // Safe fallback using PhrasePack
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

  // =========================
  // Packets: SECOND PASS (special triggers derived from context)
  // =========================
  const yFinal = Number.isFinite(session.lastMusicYear) ? session.lastMusicYear : extractYear(inboundText);

  let special = null;
  if (laneIsMusic(lane) && Number.isFinite(yFinal)) {
    const coreNorm = normText(core?.reply || "");
    const justYear = !!inboundText && !!yFinal && normText(inboundText) === String(yFinal);
    if (!coreNorm || justYear) special = "__mode_prompt__";
  }

  let packet2 = { hit: false };
  if (special) {
    packet2 = runPackets({
      inboundText,
      session,
      requestId,
      laneHint: lane,
      specialTrigger: special,
      year: yFinal,
      introDone: true,
    });
  }

  let reply = safeStr(core?.reply || "").trim();
  let followUps = Array.isArray(core?.followUps) ? core.followUps.slice(0) : [];
  let followUpsStrings = Array.isArray(core?.followUpsStrings) ? core.followUpsStrings.slice(0) : [];

  if (packet2.hit && packet2.packet) {
    commitPacketUse(session, packet2.packet);
    lane = safeStr(session.lane || lane);

    reply = safeStr(packet2.reply).trim() || reply;
    const pktFollow = packetToFollowUps(packet2.packet);
    followUps = pktFollow.concat(followUps).slice(0, 10);
    followUpsStrings = followUps.map((f) => f.label).slice(0, 10);
  }

  // If still empty, use fallback packet (__fallback__)
  if (!reply) {
    const fb = runPackets({
      inboundText,
      session,
      requestId,
      laneHint: "general",
      specialTrigger: "__fallback__",
      year: yFinal,
      introDone: true,
    });
    if (fb.hit && fb.packet) {
      commitPacketUse(session, fb.packet);
      reply = safeStr(fb.reply).trim();
      const fbFollow = packetToFollowUps(fb.packet);
      followUps = fbFollow.concat(followUps).slice(0, 10);
      followUpsStrings = followUps.map((f) => f.label).slice(0, 10);
    } else {
      reply = ppFallbackNudge({ requestId }) || "A year usually clears things up.";
    }
  }

  // Continuity shaping
  reply = shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn, isIntro: false });

  // Return chips on return
  if (isReturn) {
    const contChips = buildContinuityChips({ session, lane });
    const contFollow = followUpsFromChips(contChips, "cont");
    followUps = contFollow.concat(followUps).slice(0, 10);
    followUpsStrings = followUps.map((f) => f.label).slice(0, 10);
  }

  // CS-1 mark speak
  if (cs1 && typeof cs1.markSpeak === "function") {
    try {
      if (isReturn) cs1.markSpeak(session, "reentry");
    } catch (e) {
      // ignore
    }
  }

  session.__lastOutAt = nowMs();

  const out = {
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

  if (!out.reply) out.reply = "A year usually clears things up.";
  if (!out.lane) out.lane = "general";
  if (!out.ctx) out.ctx = {};
  if (!out.ui) out.ui = {};

  return out;
}

module.exports = { chatEngine, CE_VERSION };
