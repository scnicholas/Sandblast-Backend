"use strict";

/**
 * Utils/rokuLane.js
 *
 * Roku Lane — MAIN STUB (v0.1)
 * Purpose:
 *  - Deterministic, dependency-free
 *  - Never throws
 *  - Provides a stable “Roku hub” experience even before you have the Roku URL
 *
 * Input:
 *  - rokuLane({ text, session })
 *
 * Output (normalized):
 *  - { reply, followUps, sessionPatch, meta? }
 *
 * Notes:
 *  - When you get the Roku URL(s), you’ll patch ONLY the URL constants + "Open ..." replies.
 *  - Supports:
 *      * Live Linear vs VOD selection
 *      * “Open Roku”, “Open TV hub” placeholder actions
 *      * “What’s playing now” / “Schedule” prompts
 */

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeStrings(list, max = 10) {
  const out = [];
  const seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// -----------------------------------------
// Placeholder URLs (patch tomorrow)
// -----------------------------------------
const ROKU_LIVE_URL = null; // e.g., "https://..."
const ROKU_VOD_URL = null;  // e.g., "https://..."
const ROKU_CHANNEL_HOME_URL = null; // e.g., "https://channelstore.roku.com/details/..."

// -----------------------------------------
// Intent detection
// -----------------------------------------
function detectRokuMode(text) {
  const t = norm(text);

  if (/\b(live\s*linear|linear|live\s*tv|live)\b/.test(t)) return "live";
  if (/\b(vod|on\s*demand|on-demand|library|catalog)\b/.test(t)) return "vod";

  return null;
}

function wantsOpen(text) {
  const t = norm(text);
  return /\b(open|watch|play|launch|go to|take me|start)\b/.test(t);
}

function wantsSchedule(text) {
  const t = norm(text);
  return /\b(schedule|what'?s\s*playing|playing\s*now|what\s*is\s*on|what\s*is\s*playing)\b/.test(t);
}

// -----------------------------------------
// Reply builders
// -----------------------------------------
function hubReply({ session, modeHint }) {
  const mode = modeHint || (session && session.pendingMode) || null;

  // If user already chose mode, confirm gently and offer next actions
  if (mode === "live") {
    const urlLine = ROKU_LIVE_URL
      ? `If you want, I can open the Live Linear channel now: ${ROKU_LIVE_URL}`
      : "Live Linear is set. When you drop the Roku URL, I’ll wire “Open Live Linear” instantly.";

    return {
      reply:
`Roku — **Live Linear**.

${urlLine}

Do you want the schedule in your local time, or should we pick what to play next?`,
      followUps: ["What’s playing now", "Schedule", "Switch to VOD", "Open Live Linear"],
      sessionPatch: { pendingLane: "roku", pendingMode: "live", recentTopic: "roku:live" }
    };
  }

  if (mode === "vod") {
    const urlLine = ROKU_VOD_URL
      ? `If you want, I can open the VOD library now: ${ROKU_VOD_URL}`
      : "VOD is set. When you drop the Roku URL, I’ll wire “Open VOD” instantly.";

    return {
      reply:
`Roku — **VOD Library**.

${urlLine}

Do you want something specific… or should I recommend a couple of strong starter series?`,
      followUps: ["Recommend shows", "Browse genres", "Switch to Live linear", "Open VOD"],
      sessionPatch: { pendingLane: "roku", pendingMode: "vod", recentTopic: "roku:vod" }
    };
  }

  // Default hub
  return {
    reply:
`Roku is ready on my side — two experiences:

1) **Live Linear** (a scheduled channel that feels like classic TV)
2) **VOD Library** (pick a show and press play)

Which one do you want to build first?`,
    followUps: ["Live linear", "VOD", "Schedule", "Open Roku"],
    sessionPatch: { pendingLane: "roku", recentTopic: "roku:hub" }
  };
}

function openReply({ mode }) {
  // Deterministic “open” behavior even without URLs
  if (mode === "live") {
    if (ROKU_LIVE_URL) {
      return {
        reply: `Opening Live Linear: ${ROKU_LIVE_URL}`,
        followUps: ["What’s playing now", "Schedule", "Switch to VOD", "Back"],
        sessionPatch: { pendingLane: "roku", pendingMode: "live", recentTopic: "roku:open_live" }
      };
    }
    return {
      reply: "Live Linear isn’t wired to a Roku URL yet. Drop the URL tomorrow and I’ll make “Open Live Linear” one-tap.",
      followUps: ["Schedule", "What’s playing now", "Switch to VOD", "Back"],
      sessionPatch: { pendingLane: "roku", pendingMode: "live", recentTopic: "roku:await_live_url" }
    };
  }

  if (mode === "vod") {
    if (ROKU_VOD_URL) {
      return {
        reply: `Opening VOD Library: ${ROKU_VOD_URL}`,
        followUps: ["Recommend shows", "Browse genres", "Switch to Live linear", "Back"],
        sessionPatch: { pendingLane: "roku", pendingMode: "vod", recentTopic: "roku:open_vod" }
      };
    }
    return {
      reply: "VOD isn’t wired to a Roku URL yet. Drop the URL tomorrow and I’ll make “Open VOD” one-tap.",
      followUps: ["Recommend shows", "Browse genres", "Switch to Live linear", "Back"],
      sessionPatch: { pendingLane: "roku", pendingMode: "vod", recentTopic: "roku:await_vod_url" }
    };
  }

  // If no mode, open the channel home if available
  if (ROKU_CHANNEL_HOME_URL) {
    return {
      reply: `Opening Roku channel home: ${ROKU_CHANNEL_HOME_URL}`,
      followUps: ["Live linear", "VOD", "Schedule", "Back"],
      sessionPatch: { pendingLane: "roku", recentTopic: "roku:open_home" }
    };
  }

  return {
    reply: "I can open it as soon as you drop the Roku URL(s). For now—Live Linear or VOD?",
    followUps: ["Live linear", "VOD", "Schedule", "Back"],
    sessionPatch: { pendingLane: "roku", recentTopic: "roku:await_urls" }
  };
}

// -----------------------------------------
// Public API
// -----------------------------------------
async function rokuLane({ text, session }) {
  try {
    const clean = String(text || "");
    const t = norm(clean);
    const s = (session && typeof session === "object") ? session : {};

    // Mode selection
    const mode = detectRokuMode(t);

    // Schedule / now playing should route user outward but keep lane state
    if (wantsSchedule(t)) {
      // Let schedule lane handle timezone conversion elsewhere;
      // here we just set intent so chatEngine can keep context.
      return {
        reply: "Got it. Tell me your city (or timezone) and I’ll translate the Roku schedule to your local time.",
        followUps: ["Toronto", "London", "New York", "Back to Roku"],
        sessionPatch: { pendingLane: "roku", recentTopic: "roku:schedule" }
      };
    }

    // Open intent (best-effort)
    if (wantsOpen(t)) {
      const pick = mode || (s && s.pendingMode) || null;
      return openReply({ mode: pick });
    }

    // If user explicitly picked a mode, confirm
    if (mode) {
      return hubReply({ session: s, modeHint: mode });
    }

    // Default hub
    return hubReply({ session: s, modeHint: null });
  } catch (e) {
    return {
      reply: "Roku lane hit a snag. Do you want Live Linear or VOD?",
      followUps: ["Live linear", "VOD", "Schedule", "Back"],
      sessionPatch: { pendingLane: "roku", recentTopic: "roku:error" },
      meta: { ok: false, error: String(e && e.message ? e.message : e) }
    };
  }
}

module.exports = rokuLane;
module.exports.rokuLane = rokuLane;
