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
 * v0.6zC (CS-1 WIRING++ + NYX Conversational Pack 3.1-C INTEGRATION)
 *
 * Adds:
 *  ✅ “Nyx Conversational Pack 3.1-C” continuity/return language (NON-IDENTITY)
 *     - Continuity levels: none|light|warm|deep
 *     - Return detection using session.__lastOutAt + time-gap heuristic
 *     - Throttled safe disclaimer (max 1 per session)
 *     - Re-entry lines (statement-first) + optional micro-recaps
 *     - Return chips + resume chips (music-aware)
 *
 * Guardrails:
 *  ✅ Never implies long-term memory
 *  ✅ Statement-first (no questions)
 *  ✅ No menu exposure in voice lines
 *  ✅ Long-form gravity only
 *
 * Notes:
 *  - This file is designed to “wrap” whatever lane logic you already have
 *    (music/sponsors/movies/general) without forcing lane rewrites.
 *  - If you already have a cs1 module: it remains optional and safe.
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zC (CS-1 wiring++ + Conversational Pack 3.1-C continuity/return)";

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
    never_say: [
      "I remember you from last time",
      "You told me before that…",
      "Welcome back, Mac",
    ],
    prefer_say: [
      "I can follow what’s present here without a recap.",
      "No recap needed — just a cue.",
      "The thread is still open.",
      "The rhythm is easy to re-enter.",
    ],
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

function isLikelyReturnGap(gapMs) {
  // “Return” heuristic: user leaves for a while, then comes back.
  // Keep conservative to avoid spamming continuity language mid-flow.
  // 12 minutes is a good operational default for web widget usage.
  return Number.isFinite(gapMs) && gapMs >= 12 * 60 * 1000;
}

function isReturnIntent(text) {
  const t = normText(text);
  if (!t) return false;
  return (
    t === "resume" ||
    t === "start fresh" ||
    t === "restart" ||
    t === "change lens" ||
    t === "back" ||
    t === "continue"
  );
}

function laneIsMusic(lane) {
  const l = safeStr(lane).toLowerCase();
  return l === "music" || l.includes("music");
}

function laneIsKnown(lane) {
  const l = safeStr(lane).toLowerCase();
  return !!l && l !== "unknown" && l !== "general";
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

  // continuityLevel: none|light|warm|deep
  // Use turnCount + lane presence as the stable signal (non-identity).
  let continuityLevel = "none";
  if (turnCount >= 2) continuityLevel = "light";
  if (turnCount >= 5) continuityLevel = "warm";
  if (turnCount >= 10) continuityLevel = "deep";
  if (!laneIsKnown(lane) && turnCount < 3) continuityLevel = "none";

  // reentryStyle: restart|resume|soft_resume
  let reentryStyle = "resume";
  if (!laneIsKnown(lane)) reentryStyle = "restart";
  if (laneIsMusic(lane) && (lastMusicYear || activeMusicMode)) reentryStyle = "soft_resume";

  const allowReturnLanguage = continuityLevel !== "none";
  const suggestResumeOptions = allowReturnLanguage && (laneIsKnown(lane) || laneIsMusic(lane));

  return {
    continuityLevel,
    reentryStyle,
    allowReturnLanguage,
    suggestResumeOptions,
    gapMs,
  };
}

function ensureContinuityState(session) {
  if (!session || typeof session !== "object") return session;
  if (!session.__nyxCont) {
    session.__nyxCont = {
      returnDisclaimerUsed: 0,
      lastReturnAt: 0,
      lastReturnPromptedAt: 0,
    };
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

  // 2) Return session opener (level-based)
  const openerPool = NYX_CONV_PACK.return_session_openers[sig.continuityLevel] || [];
  if (openerPool.length) lines.push(pickDeterministic(openerPool, seedBase + "|open"));

  // 3) Reentry prompt (style-based, throttled per return)
  const maxPrompt = NYX_CONV_PACK.meta.throttles.reentry_prompt_max_per_return;
  const didPromptRecently = Number(cont.lastReturnPromptedAt) && nowMs() - Number(cont.lastReturnPromptedAt) < 60 * 1000;
  if (!didPromptRecently && maxPrompt >= 1) {
    let pool = NYX_CONV_PACK.reentry_prompts.generic_resume;
    if (sig.reentryStyle === "soft_resume") pool = NYX_CONV_PACK.reentry_prompts.soft_resume_music;
    if (sig.reentryStyle === "restart") pool = NYX_CONV_PACK.reentry_prompts.restart_graceful;
    lines.push(pickDeterministic(pool, seedBase + "|prompt"));
    cont.lastReturnPromptedAt = nowMs();
  }

  cont.lastReturnAt = nowMs();

  return lines.filter(Boolean);
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

  // “Resume set” always safe (no questions)
  for (const c of NYX_CONV_PACK.continuity_chips.resume_set) chips.push(c);

  // Music-aware chips (if lane suggests music)
  if (isMusic) {
    for (const c of NYX_CONV_PACK.continuity_chips.music_resume_set) chips.push(c);
  } else {
    for (const c of NYX_CONV_PACK.continuity_chips.return_set) chips.push(c);
  }

  // De-dupe by label
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
  // Soft safety: if a forbidden phrase appears, replace with safe alternative.
  // This is intentionally light-touch to avoid mangling content.
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

function shapeContinuity({ reply, session, requestId, lane, inboundText }) {
  const s = ensureContinuityState(session);
  const sig = computeContinuitySignals(s);

  const lastOutAt = Number(s.__lastOutAt);
  const gapMs = sig.gapMs;

  const wantsReturn = isReturnIntent(inboundText);
  const isReturn = wantsReturn || isLikelyReturnGap(gapMs);

  let out = safeStr(reply).trim();

  // Base continuity tone (for non-return moments) — very light.
  // Keep it minimal and never question-form.
  if (!isReturn && sig.allowReturnLanguage) {
    // Only add tone occasionally to avoid “poetry spam”
    const addTone = (Number(s.turnCount) || 0) % 3 === 0;
    if (addTone) {
      const tone = buildContinuityToneLine({ session: s, requestId });
      if (tone) out = prefixLines(out, [tone]);
    }
  }

  // Return wrapper (throttled)
  if (isReturn) {
    const lines = buildReturnLines({ session: s, requestId, lane });
    // Optional micro-recap (one line max) if lane known or music
    const recapOk = laneIsKnown(lane) || laneIsMusic(lane);
    if (recapOk) {
      const recap = buildMicroRecap({ session: s, requestId, lane });
      if (recap) lines.push(recap);
    }
    out = prefixLines(out, lines);
  }

  out = enforceNeverSay(out);

  // Stamp return signature for loop dampening / continuity signals
  s.__lastOutSig = sha1(`${safeStr(out)}|${safeStr(lane)}|${safeStr(s.turnCount)}`).slice(0, 16);

  // Never allow empty reply
  if (!out) out = "The thread is still open. A single cue restarts the motion.";

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
  // (kept non-invasive; only tracks/marks)
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

  // -------------------------
  // Core lane handling
  // -------------------------
  // If you already have lane routing elsewhere, inject it via input.engine.
  // engine signature: async ({text, session, requestId}) => {reply,lane,ctx,ui,followUps, directives, cog}
  let core = null;
  if (typeof input.engine === "function") {
    core = await input.engine({ text: inboundText, session, requestId });
  } else {
    // Minimal safe fallback (statement-first, no menus)
    core = {
      reply: inboundText
        ? "The thread is still open. A single cue is enough to continue."
        : "Same pace as before — unhurried.",
      lane,
      ctx,
      ui,
      followUps: [],
      directives: [],
      cog: { phase: "listening" },
    };
  }

  // Normalize core output
  lane = safeStr(core.lane || lane || "general");
  session.lane = lane;

  ctx = core.ctx && typeof core.ctx === "object" ? core.ctx : ctx;
  ui = core.ui && typeof core.ui === "object" ? core.ui : ui;

  // -------------------------
  // Continuity Pack shaping
  // -------------------------
  let reply = safeStr(core.reply || "").trim();
  reply = shapeContinuity({ reply, session, requestId, lane, inboundText });

  // Return chips if return detected OR user explicitly typed return intent
  const sig = computeContinuitySignals(session);
  const lastOutAt = Number(session.__lastOutAt);
  const gapMs = Number.isFinite(lastOutAt) ? nowMs() - lastOutAt : NaN;
  const isReturn = isReturnIntent(inboundText) || isLikelyReturnGap(gapMs);

  let followUps = Array.isArray(core.followUps) ? core.followUps.slice(0) : [];
  let followUpsStrings = Array.isArray(core.followUpsStrings) ? core.followUpsStrings.slice(0) : [];

  if (isReturn) {
    const chips = buildContinuityChips({ session, lane });
    const chipFollowUps = makeFollowUpsFromChips(chips);

    // Prefer structured followUps; also provide legacy strings
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
  // NOTE: index.js must allow these keys to persist across turns.
  const sessionPatch = {
    turnCount: session.turnCount,
    lane: session.lane,
    ctx: ctx,
    ui: ui,

    // continuity / return
    __lastInAt: session.__lastInAt,
    __lastOutAt: session.__lastOutAt,
    __lastOutSig: session.__lastOutSig,
    __nyxCont: session.__nyxCont,

    // music continuity cues (if your music lane uses them)
    lastMusicYear: session.lastMusicYear,
    activeMusicMode: session.activeMusicMode,

    // cs1 continuity state (optional module)
    __cs1: session.__cs1,
  };

  const out = {
    ok: true,
    reply,
    lane,
    ctx,
    ui,
    directives: Array.isArray(core.directives) ? core.directives : [],
    followUps,
    followUpsStrings,
    sessionPatch,
    cog: core.cog || { phase: "listening" },
    requestId,
    meta: {
      engine: CE_VERSION,
      pack: `${NYX_CONV_PACK.meta.name} ${NYX_CONV_PACK.meta.version}`,
      ms: nowMs() - startedAt,
      continuityLevel: sig.continuityLevel,
      reentryStyle: sig.reentryStyle,
    },
  };

  // Never allow empty contract fields that your index.js enforcer might reject
  if (!out.reply) out.reply = "The thread is still open. A single cue restarts the motion.";
  if (!out.lane) out.lane = "general";
  if (!out.ctx) out.ctx = {};
  if (!out.ui) out.ui = {};

  return out;
}

module.exports = { chatEngine, CE_VERSION };
