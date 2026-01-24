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
 * v0.6zD (CS-1 WIRING++ + Conversational Pack 3.1-C + PhrasePack v1.1)
 *
 * Adds:
 *  ✅ Conversational Pack 3.1-C continuity/return language (NON-IDENTITY)
 *  ✅ PhrasePack v1.1 (Nyx host-voice buckets: general/music/sponsors/schedule/movies)
 *     - Greetings (first vs returning)
 *     - Lane openers
 *     - Music year prompts + year-mode prompts
 *     - Generic fallback nudges + errors
 *     - Short acknowledgements + soft goodbyes
 *
 * Guardrails:
 *  ✅ No long-term memory claims
 *  ✅ Statement-first preference
 *  ✅ No-tech-leak / no-overexplaining
 *  ✅ Short, action-forward lines
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zD (CS-1 wiring++ + Conversational Pack 3.1-C + PhrasePack v1.1)";

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
    phase: "Phase Three — Continuity & Return (Canonical)",
    purpose:
      "Returnable, companionable continuity using conversation-state cues (non-identity), graceful re-entry, and long-form pacing.",
    throttles: {
      return_disclaimer_max_per_session: 1,
      reentry_prompt_max_per_return: 1,
    },
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

  return_disclaimers: {
    no_memory_safe: ["I can follow what’s present here without asking you to recap."],
  },

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

  no_recap_needed_lines: [
    "No recap needed. One word is enough.",
    "You don’t have to explain. A cue is plenty.",
    "Even a single detail can reopen the whole space.",
    "Mid-thought is a valid entry point.",
  ],

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

  handoff_bridges: {
    resume_to_deepen: ["Depth can increase without changing the topic.", "The same thread can hold one deeper step."],
    resume_to_contrast: ["Contrast can clarify what’s already here.", "A different era can reveal the same pattern."],
    resume_to_rest: ["Lightness is allowed. Nothing needs proving.", "Drift still counts. The space stays intact."],
  },

  endings_that_invite_return: {
    soft_pause: ["That feels like a clean place to pause — not end.", "We can pause with the thread still warm."],
    return_hook: ["Next time, a single cue will reopen everything.", "The cadence can return instantly."],
    deep_goodbye: ["Same space, anytime.", "No closing words needed. Just a pause."],
  },

  continuity_chips: {
    resume_set: [
      { label: "Resume", send: "resume" },
      { label: "Start fresh", send: "start fresh" },
      { label: "Change lens", send: "change lens" },
    ],
    music_resume_set: [
      { label: "Top 10", send: "top 10" },
      { label: "#1", send: "#1" },
      { label: "Story", send: "story moment" },
      { label: "Micro", send: "micro moment" },
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
  voice: {
    persona: "Nyx",
    style: ["clean", "host-like", "forward", "confident", "warm"],
    constraints: ["no-tech-leak", "no-overexplaining", "short-lines", "action-forward"],
  },
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

function extractYear(text) {
  const t = safeStr(text);
  const m = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/); // 1950-2029 range; we clamp later
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y)) return null;
  if (y < 1950) return 1950;
  if (y > 2024) return 2024;
  return y;
}

function isLikelyReturnGap(gapMs) {
  // Conservative “return” threshold to avoid mid-flow overuse.
  return Number.isFinite(gapMs) && gapMs >= 12 * 60 * 1000;
}

function isReturnIntent(text) {
  const t = normText(text);
  if (!t) return false;
  return t === "resume" || t === "start fresh" || t === "restart" || t === "change lens" || t === "back" || t === "continue";
}

function isGoodbye(text) {
  const t = normText(text);
  if (!t) return false;
  return /^(bye|goodbye|see you|later|good night|gn|thanks|thank you|thx|done|exit)$/i.test(t);
}

function laneIsMusic(lane) {
  const l = safeStr(lane).toLowerCase();
  return l === "music" || l.includes("music");
}

function laneIsKnown(lane) {
  const l = safeStr(lane).toLowerCase();
  return !!l && l !== "unknown" && l !== "general";
}

function interpolateTemplate(s, vars) {
  let out = safeStr(s);
  Object.keys(vars || {}).forEach((k) => {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), safeStr(vars[k]));
  });
  return out;
}

// =========================
// PhrasePack selectors (host-voice)
// =========================
function ppPick(bucketPath, seed, vars) {
  // bucketPath example: ["general","greetings_first"]
  let ref = NYX_PHRASEPACK.buckets;
  for (const p of bucketPath) {
    if (!ref || typeof ref !== "object") return "";
    ref = ref[p];
  }
  const line = pickDeterministic(ref, seed);
  return interpolateTemplate(line, vars || {});
}

function ppGreeting({ session, requestId, isReturn }) {
  const seed = `${requestId || "req"}|greet|${safeStr(session?.turnCount)}`;
  if (isReturn) return ppPick(["general", "greetings_returning"], seed);
  return ppPick(["general", "greetings_first"], seed);
}

function ppFallbackNudge({ requestId }) {
  const seed = `${requestId || "req"}|fallback`;
  return ppPick(["general", "fallback_nudge"], seed);
}

function ppErrorGeneric({ requestId }) {
  const seed = `${requestId || "req"}|err`;
  return ppPick(["general", "errors_generic"], seed);
}

function ppGoodbyeSoft({ requestId }) {
  const seed = `${requestId || "req"}|bye`;
  return ppPick(["general", "goodbyes_soft"], seed);
}

function ppMusicAskYear({ requestId }) {
  const seed = `${requestId || "req"}|music|askyear`;
  return ppPick(["music", "ask_year"], seed);
}

function ppMusicModePrompt({ requestId, year }) {
  const seed = `${requestId || "req"}|music|mode|${year}`;
  return ppPick(["music", "mode_prompt_has_year"], seed, { year });
}

function ppLaneOpen({ requestId, lane }) {
  const l = safeStr(lane).toLowerCase();
  const seed = `${requestId || "req"}|open|${l}`;
  if (l.includes("sponsor")) return ppPick(["sponsors", "open"], seed);
  if (l.includes("schedule")) return ppPick(["schedule", "open"], seed);
  if (l.includes("movie")) return ppPick(["movies", "open"], seed);
  if (laneIsMusic(lane)) return ppMusicAskYear({ requestId });
  // General fallback
  return ppPick(["general", "capabilities_quick"], seed) || ppFallbackNudge({ requestId });
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
  if (!session.__nyxCont) {
    session.__nyxCont = { returnDisclaimerUsed: 0, lastReturnAt: 0, lastReturnPromptedAt: 0 };
  }
  if (!session.__nyxIntro) {
    session.__nyxIntro = { greeted: 0 };
  }
  return session;
}

function buildReturnLines({ session, requestId, lane }) {
  const sig = computeContinuitySignals(session);
  const cont = ensureContinuityState(session).__nyxCont;

  const lines = [];
  const seedBase = `${requestId || "req"}|${safeStr(lane)}|${safeStr(session?.turnCount)}`;

  // 1) Optional safe disclaimer (throttled)
  const maxDisc = NYX_CONV_PACK.meta.throttles.return_disclaimer_max_per_session;
  if ((cont.returnDisclaimerUsed || 0) < maxDisc) {
    lines.push(pickDeterministic(NYX_CONV_PACK.return_disclaimers.no_memory_safe, seedBase + "|disc"));
    cont.returnDisclaimerUsed = (cont.returnDisclaimerUsed || 0) + 1;
  }

  // 2) PhrasePack returning greeting (host-like)
  lines.push(ppGreeting({ session, requestId, isReturn: true }));

  // 3) Reentry prompt (style-based, throttled per return)
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
  if (isMusic) {
    for (const c of NYX_CONV_PACK.continuity_chips.music_resume_set) chips.push(c);
  } else {
    for (const c of NYX_CONV_PACK.continuity_chips.return_set) chips.push(c);
  }

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
  const head = (lines || [])
    .map((s) => safeStr(s).trim())
    .filter(Boolean)
    .join(" ");
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

function shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn }) {
  const s = ensureContinuityState(session);
  const sig = computeContinuitySignals(s);

  let out = safeStr(reply).trim();

  // If we have nothing meaningful, use PhrasePack lane opener (short, host-like)
  if (!out) {
    out = ppLaneOpen({ requestId, lane });
  }

  // In-session greeting injection (first turn only, non-intrusive)
  // Only if reply is currently generic or empty-ish and we haven’t greeted.
  if ((s.__nyxIntro?.greeted || 0) === 0) {
    const shouldGreet = s.turnCount <= 2 && (!inboundText || normText(inboundText) === "hi" || normText(inboundText) === "hello");
    if (shouldGreet) {
      out = prefixLines(out, [ppGreeting({ session: s, requestId, isReturn: false })]);
      s.__nyxIntro.greeted = 1;
    }
  }

  // Return wrapper (throttled)
  if (isReturn) {
    const lines = buildReturnLines({ session: s, requestId, lane });

    const recapOk = laneIsKnown(lane) || laneIsMusic(lane);
    if (recapOk) {
      const recap = buildMicroRecap({ session: s, requestId, lane });
      if (recap) lines.push(recap);
    }

    out = prefixLines(out, lines);
  } else if (sig.allowReturnLanguage) {
    // Base continuity tone occasionally (avoid overuse)
    const addTone = (Number(s.turnCount) || 0) % 3 === 0;
    if (addTone) {
      const tone = buildContinuityToneLine({ session: s, requestId });
      if (tone) out = prefixLines(out, [tone]);
    }
  }

  out = enforceNeverSay(out);

  // Stamp return signature for loop dampening / continuity signals
  s.__lastOutSig = sha1(`${safeStr(out)}|${safeStr(lane)}|${safeStr(s.turnCount)}`).slice(0, 16);

  // Never allow empty reply
  if (!out) out = ppFallbackNudge({ requestId }) || "A year usually clears things up.";

  return out;
}

// =========================
// Follow-up shaping
// =========================
function makeFollowUpsFromChips(chips) {
  const out = [];
  for (let i = 0; i < chips.length; i += 1) {
    const c = chips[i];
    const label = safeStr(c?.label).trim();
    const send = safeStr(c?.send).trim();
    if (!label || !send) continue;
    out.push({
      id: `cpack_${i}_${sha1(label + "|" + send).slice(0, 8)}`,
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
/**
 * @param {object} input
 *   {
 *     text, message,              // inbound text (either)
 *     session,                    // mutable session state object
 *     routeHint,                  // optional: preferred lane hint
 *     requestId,                  // optional: request id
 *     debug,                      // optional: debug flag
 *     engine                      // optional: injected lane-router function
 *   }
 */
async function chatEngine(input = {}) {
  const startedAt = nowMs();

  const requestId = safeStr(input.requestId || "").trim() || sha1(String(startedAt)).slice(0, 10);
  const session = ensureContinuityState(input.session || {});
  const inboundText = safeStr(input.text || input.message || "").trim();

  // Turn count
  session.turnCount = clampInt(session.turnCount, 0, 999999, 0) + 1;

  // Optional CS-1 continuity selector/enforcer
  if (cs1 && typeof cs1.ensure === "function") {
    try {
      cs1.ensure(session);
    } catch (e) {
      // ignore
    }
  }

  // Track last inbound timestamp
  session.__lastInAt = nowMs();

  // Lane / ctx outputs (defaults)
  let lane = safeStr(session.lane || input.routeHint || "general");
  let ctx = session.ctx && typeof session.ctx === "object" ? session.ctx : {};
  let ui = session.ui && typeof session.ui === "object" ? session.ui : {};

  // Return detection (pre-core)
  const lastOutAt = Number(session.__lastOutAt);
  const gapMs = Number.isFinite(lastOutAt) ? nowMs() - lastOutAt : NaN;
  const isReturn = isReturnIntent(inboundText) || isLikelyReturnGap(gapMs);

  // Fast-path: goodbyes (short, warm, action-forward)
  if (isGoodbye(inboundText)) {
    const bye = ppGoodbyeSoft({ requestId });
    const reply = shapeContinuity({
      reply: bye,
      session,
      requestId,
      lane,
      inboundText,
      isReturn: false,
    });

    session.__lastOutAt = nowMs();

    return {
      ok: true,
      reply,
      lane: lane || "general",
      ctx,
      ui,
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: {
        turnCount: session.turnCount,
        lane: session.lane,
        ctx,
        ui,
        __lastInAt: session.__lastInAt,
        __lastOutAt: session.__lastOutAt,
        __lastOutSig: session.__lastOutSig,
        __nyxCont: session.__nyxCont,
        __nyxIntro: session.__nyxIntro,
        lastMusicYear: session.lastMusicYear,
        activeMusicMode: session.activeMusicMode,
        __cs1: session.__cs1,
      },
      cog: { phase: "closing" },
      requestId,
      meta: {
        engine: CE_VERSION,
        phrasepack: `${NYX_PHRASEPACK.version} (${NYX_PHRASEPACK.updated})`,
        pack: `${NYX_CONV_PACK.meta.name} ${NYX_CONV_PACK.meta.version}`,
        ms: nowMs() - startedAt,
      },
    };
  }

  // -------------------------
  // Core lane handling
  // -------------------------
  // If you already have lane routing elsewhere, inject it via input.engine.
  // engine signature: async ({text, session, requestId}) => {reply,lane,ctx,ui,followUps, directives, cog}
  let core = null;
  if (typeof input.engine === "function") {
    core = await input.engine({ text: inboundText, session, requestId });
  } else {
    // Minimal safe fallback using PhrasePack (host-voice)
    // - If user gave a year, assume music lens and offer mode prompt.
    const y = extractYear(inboundText);
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

    // Remember year if inferred
    if (y) {
      session.lastMusicYear = y;
      session.activeMusicMode = session.activeMusicMode || "top10";
    }
  }

  // Normalize core output
  lane = safeStr(core?.lane || lane || "general");
  session.lane = lane;

  ctx = core?.ctx && typeof core.ctx === "object" ? core.ctx : ctx;
  ui = core?.ui && typeof core.ui === "object" ? core.ui : ui;

  // -------------------------
  // PhrasePack: tactical nudges for common music situations
  // -------------------------
  // If lane is music and we still don’t have a year, nudge for a year (short).
  if (laneIsMusic(lane)) {
    const yIn = extractYear(inboundText);
    const ySess = Number(session.lastMusicYear);
    const haveYear = Number.isFinite(ySess) || Number.isFinite(yIn);
    if (yIn && !Number.isFinite(ySess)) session.lastMusicYear = yIn;
    if (!haveYear) {
      core.reply = core.reply || ppMusicAskYear({ requestId });
    } else if (!core.reply && (yIn || ySess)) {
      const y = Number.isFinite(yIn) ? yIn : ySess;
      core.reply = ppMusicModePrompt({ requestId, year: y });
    }
  }

  // -------------------------
  // Continuity + PhrasePack shaping
  // -------------------------
  let reply = safeStr(core?.reply || "").trim();

  // If the core response looks like a null/empty event, replace with PhrasePack error/fallback
  if (!reply) {
    reply = ppErrorGeneric({ requestId }) || ppFallbackNudge({ requestId });
  }

  reply = shapeContinuity({ reply, session, requestId, lane, inboundText, isReturn });

  // Return chips if return detected OR user explicitly typed return intent
  let followUps = Array.isArray(core?.followUps) ? core.followUps.slice(0) : [];
  let followUpsStrings = Array.isArray(core?.followUpsStrings) ? core.followUpsStrings.slice(0) : [];

  if (isReturn) {
    const chips = buildContinuityChips({ session, lane });
    const chipFollowUps = makeFollowUpsFromChips(chips);

    followUps = chipFollowUps.concat(followUps).slice(0, 10);
    followUpsStrings = chipFollowUps.map((f) => f.label).slice(0, 10);
  }

  // -------------------------
  // CS-1 mark speak events on early return wrappers
  // -------------------------
  if (cs1 && typeof cs1.markSpeak === "function") {
    try {
      if (isReturn) cs1.markSpeak(session, "reentry");
    } catch (e) {
      // ignore
    }
  }

  // -------------------------
  // Update last out stamps
  // -------------------------
  session.__lastOutAt = nowMs();

  // Allowlisted sessionPatch (keep tight; include continuity keys explicitly)
  const sessionPatch = {
    turnCount: session.turnCount,
    lane: session.lane,
    ctx,
    ui,

    // continuity / return
    __lastInAt: session.__lastInAt,
    __lastOutAt: session.__lastOutAt,
    __lastOutSig: session.__lastOutSig,
    __nyxCont: session.__nyxCont,
    __nyxIntro: session.__nyxIntro,

    // music continuity cues
    lastMusicYear: session.lastMusicYear,
    activeMusicMode: session.activeMusicMode,

    // cs1 continuity state (optional)
    __cs1: session.__cs1,
  };

  const out = {
    ok: true,
    reply,
    lane,
    ctx,
    ui,
    directives: Array.isArray(core?.directives) ? core.directives : [],
    followUps,
    followUpsStrings,
    sessionPatch,
    cog: core?.cog || { phase: "listening" },
    requestId,
    meta: {
      engine: CE_VERSION,
      pack: `${NYX_CONV_PACK.meta.name} ${NYX_CONV_PACK.meta.version}`,
      phrasepack: `${NYX_PHRASEPACK.version} (${NYX_PHRASEPACK.updated})`,
      ms: nowMs() - startedAt,
      continuityLevel: computeContinuitySignals(session).continuityLevel,
      reentryStyle: computeContinuitySignals(session).reentryStyle,
    },
  };

  // Never allow empty contract fields that your index.js enforcer might reject
  if (!out.reply) out.reply = ppFallbackNudge({ requestId }) || "A year usually clears things up.";
  if (!out.lane) out.lane = "general";
  if (!out.ctx) out.ctx = {};
  if (!out.ui) out.ui = {};

  return out;
}

module.exports = { chatEngine, CE_VERSION };
