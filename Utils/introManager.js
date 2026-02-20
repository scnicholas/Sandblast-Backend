"use strict";

/**
 * Utils/introManager.js
 *
 * v1.0.0 (INTRO VOICE CANON++++ + ONE-TIME SESSION++++ + VOICE TOGGLE MEMORY++++ + AUTOPLAY SAFE++++)
 *
 * Responsibilities:
 * - Time-aware + context-aware greeting selection
 * - One-time per session intro firing (sessionStorage)
 * - Voice toggle persistence (localStorage)
 * - Autoplay-safe: attempt play; if blocked, expose "Tap to enable voice" hook
 *
 * Usage:
 *   const Intro = require("./Utils/introManager");
 *   const intro = Intro.create({ ttsSpeak, onNeedsUserGesture });
 *   intro.maybeRun({ context: "sandblast", userKnown: false });
 */

const INTRO_SESSION_KEY = "nyx_intro_played_v1";
const VOICE_PREF_KEY = "nyx_voice_enabled_v1";
const VOICE_PREF_SET_KEY = "nyx_voice_pref_set_v1"; // tracks if user explicitly set pref

function nowHourLocal() {
  try { return new Date().getHours(); } catch (_) { return 12; }
}

function normalizeContext(ctx) {
  const s = String(ctx || "").toLowerCase().trim();
  if (!s) return "sandblast";
  if (s.includes("roku")) return "roku";
  if (s.includes("radio")) return "radio";
  if (s.includes("news")) return "news";
  if (s.includes("cog") || s.includes("marion")) return "cognitive";
  return "sandblast";
}

function dayPart(hour) {
  // 0-4 late, 5-11 morning, 12-16 afternoon, 17-21 evening, 22-23 late
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 21) return "evening";
  return "late";
}

function pickGreeting({ ctx, part, returning }) {
  // Keep it short, premium, and “flagship.”
  // You can expand variants later; keep deterministic now.
  const base = {
    sandblast: {
      morning: returning
        ? "Good morning. You're back. Where are we taking Sandblast today?"
        : "Good morning. I’m Nyx. Welcome to Sandblast. Where shall we begin?",
      afternoon: returning
        ? "Welcome back. Pick a lane—radio, video, or strategy."
        : "Welcome. I’m Nyx. Tell me what you want to build today.",
      evening: returning
        ? "Evening. Good. Let’s move with intention."
        : "Evening. I’m Nyx. Let’s keep this sharp—what’s the target?",
      late: returning
        ? "Late hours. I respect that. Tell me what matters most right now."
        : "Late hours. I’m Nyx. If we’re here now, it’s for a reason—what’s the goal?"
    },
    radio: {
      morning: returning ? "Morning. Want a smooth set or something with bite?" : "Morning. I’m Nyx—ready for radio mode?",
      afternoon: returning ? "Back for music. Mood today?" : "I’m Nyx. Tell me the vibe—then I’ll shape the set.",
      evening: returning ? "Evening session. Let’s make it memorable." : "Evening. I’m Nyx. Want a cinematic vibe or clean energy?",
      late: returning ? "Late-night radio hits different. What are we feeling?" : "Late-night mode. I’m Nyx. Give me the mood."
    },
    roku: {
      morning: returning ? "Good morning. Ready to curate a sharper lineup?" : "Good morning. I’m Nyx. Want classics, serials, or a spotlight?",
      afternoon: returning ? "Welcome back. Let’s tune the Roku experience." : "I’m Nyx. Tell me what row we’re building first.",
      evening: returning ? "Evening. Let’s make the channel feel premium." : "Evening. I’m Nyx. What do you want the audience to feel?",
      late: returning ? "Late session. Perfect for precision work." : "Late hours. I’m Nyx. Let’s tighten the platform."
    },
    news: {
      morning: returning ? "Morning. Want the headlines or the strategy behind them?" : "Good morning. I’m Nyx. Want news, analysis, or both?",
      afternoon: returning ? "Back again. What story are we tracking?" : "I’m Nyx. What topic should I prioritize today?",
      evening: returning ? "Evening. Let’s summarize and sharpen." : "Evening. I’m Nyx. Want a fast brief or deep dive?",
      late: returning ? "Late hours. Quiet minds do the best analysis." : "Late hours. I’m Nyx. What are we investigating?"
    },
    cognitive: {
      morning: returning ? "Morning. Marion is ready. Choose a lane." : "Morning. I’m Nyx. We can go deep—pick a lane.",
      afternoon: returning ? "Welcome back. We can optimize, or we can transform." : "I’m Nyx. Tell me what you’re solving—then we’ll structure it.",
      evening: returning ? "Evening. Let’s reduce noise and increase leverage." : "Evening. I’m Nyx. Give me the objective—clean and direct.",
      late: returning ? "Late hours. That’s when real systems get built." : "Late hours. I’m Nyx. Speak the goal. I’ll handle the structure."
    }
  };

  const table = base[ctx] || base.sandblast;
  return table[part] || table.afternoon;
}

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch (_) { return null; }
}
function safeSet(storage, key, val) {
  try { storage.setItem(key, val); } catch (_) {}
}

function readVoiceEnabled() {
  const prefSet = safeGet(localStorage, VOICE_PREF_SET_KEY);
  if (!prefSet) {
    // Default ON for flagship presence — but still autoplay-safe.
    return true;
  }
  return safeGet(localStorage, VOICE_PREF_KEY) !== "0";
}

function writeVoiceEnabled(enabled) {
  safeSet(localStorage, VOICE_PREF_SET_KEY, "1");
  safeSet(localStorage, VOICE_PREF_KEY, enabled ? "1" : "0");
}

function hasPlayedThisSession() {
  return safeGet(sessionStorage, INTRO_SESSION_KEY) === "1";
}
function markPlayedThisSession() {
  safeSet(sessionStorage, INTRO_SESSION_KEY, "1");
}

function create({ ttsSpeak, onNeedsUserGesture }) {
  if (typeof ttsSpeak !== "function") throw new Error("introManager requires ttsSpeak(fn)");

  return {
    readVoiceEnabled,
    writeVoiceEnabled,
    hasPlayedThisSession,
    markPlayedThisSession,

    maybeRun: async function maybeRun(opts) {
      const voiceEnabled = readVoiceEnabled();
      if (!voiceEnabled) return { ran: false, reason: "voice_disabled" };
      if (hasPlayedThisSession()) return { ran: false, reason: "already_played" };

      const ctx = normalizeContext(opts && opts.context);
      const hour = nowHourLocal();
      const part = dayPart(hour);
      const returning = !!(opts && opts.returning);

      const text = pickGreeting({ ctx, part, returning });

      // Mark early to avoid double-fire during race conditions.
      markPlayedThisSession();

      // Autoplay-safe attempt:
      try {
        // ttsSpeak should reject if blocked.
        await ttsSpeak(text, { tag: "intro", context: ctx, dayPart: part });
        return { ran: true, text };
      } catch (e) {
        // If autoplay blocked, allow UI to prompt a user gesture (tap to enable).
        if (typeof onNeedsUserGesture === "function") {
          try { onNeedsUserGesture({ text }); } catch (_) {}
        }
        return { ran: false, reason: "autoplay_blocked", text };
      }
    }
  };
}

module.exports = { create };
