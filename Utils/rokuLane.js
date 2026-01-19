"use strict";

/**
 * Utils/rokuLane.js
 *
 * Roku Lane — MAIN STUB (v0.2)
 * Purpose:
 *  - Deterministic, dependency-free
 *  - Never throws
 *  - Stable “Roku hub” experience even before you have the Roku URL
 *
 * Input:
 *  - rokuLane({ text, session })
 *
 * Output (normalized):
 *  - { reply, followUps: string[], sessionPatch, meta? }
 *
 * v0.2 FIXES:
 *  ✅ sessionPatch ALWAYS includes lane:"roku" (server allowlist can retain this)
 *  ✅ followUps always deduped + non-empty
 *  ✅ mode continuity still written as pendingMode (requires index.js allowlist to retain)
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

function ensureFollowUps(list) {
  const fu = dedupeStrings(list, 10);
  if (fu.length) return fu.slice(0, 4);
  return ["Live linear", "VOD", "Schedule", "Back"];
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
function basePatch(extra) {
  // IMPORTANT: lane is usually allowlisted server-side
  return Object.assign({ lane: "roku", pendingLane: "roku" }, extra || {});
}

function hubReply({ session, modeHint }) {
  const mode = modeHint || (session && session.pendingMode) || null;

  if (mode === "live") {
    const urlLine = ROKU_LIVE_URL
      ? `If you want, I can open the Live Linear channel now: ${ROKU_LIVE_URL}`
      : "Live Linear is set. When you drop the Roku URL, I’ll wire “Open Live Linear” instantly.";

    return {
      reply:
`Roku — **Live Linear**.

${urlLine}

Do you want the schedule in your local time, or should we pick what to play next?`,
      followUps: ensureFollowUps(["What’s playing now", "Schedule", "Switch to VOD", "Open Live Linear"]),
      sessionPatch: basePatch({ pendingMode: "live", recentTopic: "roku:live" })
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
      followUps: ensureFollowUps(["Recommend shows", "Browse genres", "Switch to Live linear", "Open VOD"]),
      sessionPatch: basePatch({ pendingMode: "vod", recentTopic: "roku:vod" })
    };
  }

  return {
    reply:
`Roku is ready on my side — two experiences:

1) **Live Linear** (a scheduled channel that feels like classic TV)
2) **VOD Library** (pick a show and press play)

Which one do you want to build first?`,
    followUps: ensureFollowUps(["Live linear", "VOD", "Schedule", "Open Roku"]),
    sessionPatch: basePatch({ recentTopic: "roku:hub" })
  };
}

function openReply({ mode }) {
  if (mode === "live") {
    if (ROKU_LIVE_URL) {
      return {
        reply: `Opening Live Linear: ${ROKU_LIVE_URL}`,
        followUps: ensureFollowUps(["What’s playing now", "Schedule", "Switch to VOD", "Back"]),
        sessionPatch: basePatch({ pendingMode: "live", recentTopic: "roku:open_live" })
      };
    }
    return {
      reply: "Live Linear isn’t wired to a Roku URL yet. Drop the URL tomorrow and I’ll make “Open Live Linear” one-tap.",
      followUps: ensureFollowUps(["Schedule", "What’s playing now", "Switch to VOD", "Back"]),
      sessionPatch: basePatch({ pendingMode: "live", recentTopic: "roku:await_live_url" })
    };
  }

  if (mode === "vod") {
    if (ROKU_VOD_URL) {
      return {
        reply: `Opening VOD Library: ${ROKU_VOD_URL}`,
        followUps: ensureFollowUps(["Recommend shows", "Browse genres", "Switch to Live linear", "Back"]),
        sessionPatch: basePatch({ pendingMode: "vod", recentTopic: "roku:open_vod" })
      };
    }
    return {
      reply: "VOD isn’t wired to a Roku URL yet. Drop the URL tomorrow and I’ll make “Open VOD” one-tap.",
      followUps: ensureFollowUps(["Recommend shows", "Browse genres", "Switch to Live linear", "Back"]),
      sessionPatch: basePatch({ pendingMode: "vod", recentTopic: "roku:await_vod_url" })
    };
  }

  if (ROKU_CHANNEL_HOME_URL) {
    return {
      reply: `Opening Roku channel home: ${ROKU_CHANNEL_HOME_URL}`,
      followUps: ensureFollowUps(["Live linear", "VOD", "Schedule", "Back"]),
      sessionPatch: basePatch({ recentTopic: "roku:open_home" })
    };
  }

  return {
    reply: "I can open it as soon as you drop the Roku URL(s). For now—Live Linear or VOD?",
    followUps: ensureFollowUps(["Live linear", "VOD", "Schedule", "Back"]),
    sessionPatch: basePatch({ recentTopic: "roku:await_urls" })
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

    const mode = detectRokuMode(t);

    if (wantsSchedule(t)) {
      return {
        reply: "Got it. Tell me your city (or timezone) and I’ll translate the Roku schedule to your local time.",
        followUps: ensureFollowUps(["Toronto", "London", "New York", "Back to Roku"]),
        sessionPatch: basePatch({ recentTopic: "roku:schedule" })
      };
    }

    if (wantsOpen(t)) {
      const pick = mode || (s && s.pendingMode) || null;
      return openReply({ mode: pick });
    }

    if (mode) {
      return hubReply({ session: s, modeHint: mode });
    }

    return hubReply({ session: s, modeHint: null });
  } catch (e) {
    return {
      reply: "Roku lane hit a snag. Do you want Live Linear or VOD?",
      followUps: ensureFollowUps(["Live linear", "VOD", "Schedule", "Back"]),
      sessionPatch: basePatch({ recentTopic: "roku:error" }),
      meta: { ok: false, error: String(e && e.message ? e.message : e) }
    };
  }
}

module.exports = rokuLane;
module.exports.rokuLane = rokuLane;
