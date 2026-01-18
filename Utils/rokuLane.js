"use strict";

const fs = require("fs");
const path = require("path");

function safeLoad() {
  try {
    const p = path.join(__dirname, "..", "Data", "rokuLinks.json");
    const raw = fs.readFileSync(p, "utf8");
    const json = JSON.parse(raw);
    return json && json.roku ? json.roku : null;
  } catch (_) {
    return null;
  }
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function detectRokuMode(text) {
  const t = norm(text);
  if (/\b(vod|on demand|library)\b/.test(t)) return "vod";
  if (/\b(live|linear|channel|what's on)\b/.test(t)) return "live";
  return null;
}

async function rokuLane({ text, session }) {
  const cfg = safeLoad();
  const mode = detectRokuMode(text);

  const enabled = !!(cfg && cfg.enabled);
  const launchDate = cfg && cfg.launchDate ? cfg.launchDate : "soon";

  // Intent-first copy: short, decisive, and gives a choice.
  if (!cfg) {
    return {
      reply: "Roku link layer isn’t configured yet. Add Data/rokuLinks.json and I’ll route you cleanly.",
      followUps: ["Live linear", "VOD", "Back to music", "What’s playing now"],
      sessionPatch: { pendingLane: "tv" }
    };
  }

  if (!enabled) {
    const base = cfg.canonical || cfg.fallback || "https://sandblast.channel/tv";
    const reply =
`Sandblast TV on Roku is gearing up for launch (${launchDate}).

Want the **live linear channel** or the **VOD library**?

For now, here’s the TV hub: ${base}`;

    return {
      reply,
      followUps: ["Live linear", "VOD", "Remind me on launch day", "Open TV hub"],
      sessionPatch: {
        pendingLane: "tv",
        pendingMode: mode || "roku",
        recentTopic: "roku:prelaunch"
      }
    };
  }

  // Enabled: route to final URLs
  const liveUrl = cfg.live || cfg.canonical;
  const vodUrl = cfg.vod || cfg.canonical;

  if (mode === "vod") {
    return {
      reply: `Here you go — Sandblast TV **VOD**: ${vodUrl}`,
      followUps: ["Open VOD", "What’s on live now", "Back to music", "Schedule"],
      sessionPatch: { pendingLane: "tv", pendingMode: "vod", recentTopic: "roku:vod" }
    };
  }

  if (mode === "live") {
    return {
      reply: `Here you go — Sandblast TV **Live Linear**: ${liveUrl}`,
      followUps: ["Open live", "What’s playing now", "VOD library", "Schedule"],
      sessionPatch: { pendingLane: "tv", pendingMode: "live", recentTopic: "roku:live" }
    };
  }

  return {
    reply: `Do you want **Live Linear** or **VOD**?\n\nLive: ${liveUrl}\nVOD: ${vodUrl}`,
    followUps: ["Live linear", "VOD", "Schedule", "Back to music"],
    sessionPatch: { pendingLane: "tv", pendingMode: "roku", recentTopic: "roku:choose" }
  };
}

module.exports = rokuLane;
module.exports.rokuLane = rokuLane;
