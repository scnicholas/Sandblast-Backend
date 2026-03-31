"use strict";

/**
 * Utils/musicLane.js
 *
 * Thin adapter over Utils/musicKnowledge.js.
 * Goals:
 *  - Deterministic
 *  - Never throws
 *  - Output normalized to:
 *      {
 *        reply,
 *        followUpsStrings: string[],
 *        followUps: [{ id, type, label, send, payload }],
 *        sessionPatch,
 *        bridge,
 *        meta?
 *      }
 *
 * v1.5.2 (HTTP BRIDGE CONTRACT ALIGN + UI BRIDGE HARDEN + PAYLOAD CHIPS + SESSION SPINE NORMALIZE)
 *  ✅ Keeps 1950–2025 public range aligned with musicKnowledge
 *  ✅ Preserves structural behavior; no mutation of inbound session
 *  ✅ Normalizes legacy Top40 chart tokens out of inbound + outbound state
 *  ✅ Builds payload-bearing chips for UI bridges instead of text-only follow-ups
 *  ✅ Adds deterministic bridge envelope for shell / widget integration
 *  ✅ Maintains string follow-ups for legacy chatEngine compatibility
 *
 * Exports:
 *  - handleChat({ text, session, visitorId, debug })
 *  - function export: await musicLane(text, session, opts?)
 */

let musicKnowledge = null;
try {
  musicKnowledge = require("./musicKnowledge");
  if (
    !musicKnowledge ||
    (typeof musicKnowledge.handleChat !== "function" &&
      typeof musicKnowledge.handleMusicTurn !== "function")
  ) {
    musicKnowledge = null;
  }
} catch (_) {
  musicKnowledge = null;
}

const LANE_NAME = "music";
const CHART_DEFAULT = "Billboard Hot 100";

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clampYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1950 || n > 2025) return null;
  return n;
}

function extractYearFromText(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  return clampYear(m[1]);
}

/* ======================================================
   Chart normalization (legacy kill-switch)
====================================================== */

function isLegacyTop40Chart(x) {
  const t = norm(x);
  return (
    t === "top40" ||
    t === "top 40" ||
    t === "top-forty" ||
    t === "top forty" ||
    t === "top forty chart" ||
    t.includes("top40") ||
    t.includes("top 40") ||
    t.includes("top forty")
  );
}

function normalizeChartForLane(x) {
  const t = String(x || "").trim();
  if (!t) return CHART_DEFAULT;
  if (isLegacyTop40Chart(t)) return CHART_DEFAULT;
  return t;
}

function scrubLegacyChartsInSession(session) {
  const s = session && typeof session === "object" ? session : {};
  const out = { ...s };

  if (isLegacyTop40Chart(out.activeMusicChart)) out.activeMusicChart = CHART_DEFAULT;
  if (isLegacyTop40Chart(out.lastMusicChart)) out.lastMusicChart = CHART_DEFAULT;
  if (isLegacyTop40Chart(out.activeChart)) out.activeChart = CHART_DEFAULT;
  if (isLegacyTop40Chart(out.lastChart)) out.lastChart = CHART_DEFAULT;

  return out;
}

function scrubLegacyChartsInPatch(patch) {
  if (!patch || typeof patch !== "object") return patch;
  const p = { ...patch };

  if (isLegacyTop40Chart(p.activeMusicChart)) p.activeMusicChart = CHART_DEFAULT;
  if (isLegacyTop40Chart(p.lastMusicChart)) p.lastMusicChart = CHART_DEFAULT;
  if (isLegacyTop40Chart(p.activeChart)) p.activeChart = CHART_DEFAULT;
  if (isLegacyTop40Chart(p.lastChart)) p.lastChart = CHART_DEFAULT;

  return p;
}

/* ======================================================
   Mode inference
====================================================== */

function normalizeModeFromText(text) {
  const t = norm(text);

  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return "top10";
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return "top100";
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return "micro";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number1";

  return null;
}

function inferModeFromReply(reply) {
  const r = norm(reply);
  if (!r) return null;

  if (r.startsWith("top 10") || /\btop\s*10\b/.test(r)) return "top10";
  if (
    r.includes("year-end hot 100") ||
    r.includes("year end hot 100") ||
    /\btop\s*100\b/.test(r) ||
    r.includes("hot 100")
  ) {
    return "top100";
  }
  if (r.includes("story moment")) return "story";
  if (r.includes("micro moment")) return "micro";
  if (/\b#\s*1\b/.test(r) || r.includes("number 1") || r.includes("no. 1") || r.includes("no 1")) {
    return "number1";
  }

  return null;
}

function safeStrings(list, max = 10) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s =
      typeof x === "string"
        ? x
        : String((x && (x.send || x.label || x.text)) || "");
    const cleaned = s.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const k = cleaned.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cleaned.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function ensureContinuity({ patch, userMode, replyMode, userYear, replyYear, session }) {
  const s = session && typeof session === "object" ? session : null;
  let p = patch && typeof patch === "object" ? patch : null;

  const mode = userMode || replyMode || null;

  const y = clampYear(
    (p && (p.year || p.lastMusicYear)) || userYear || replyYear || (s && s.lastMusicYear) || null
  );

  p = p || {};
  p.pendingLane = p.pendingLane || LANE_NAME;
  p.activeLane = p.activeLane || LANE_NAME;
  p.lane = p.lane || LANE_NAME;

  if (mode) {
    p.mode = p.mode || mode;
    p.activeMusicMode = p.activeMusicMode || mode;
    p.pendingMode = p.pendingMode || mode;
  }

  if (y) {
    p.year = p.year || y;
    p.lastMusicYear = p.lastMusicYear || y;
    p.pendingYear = p.pendingYear || y;
  }

  p.activeMusicChart = normalizeChartForLane(
    p.activeMusicChart != null ? p.activeMusicChart : s && (s.activeMusicChart || s.lastMusicChart)
  );
  p.lastMusicChart = normalizeChartForLane(
    p.lastMusicChart != null ? p.lastMusicChart : p.activeMusicChart
  );

  return p;
}

/* ======================================================
   Deeper support (deterministic, non-breaking)
====================================================== */

function isDeeperToken(text) {
  const t = norm(text);
  return (
    t === "deeper" ||
    t === "go deeper" ||
    t === "tell me more" ||
    t === "more" ||
    t === "expand" ||
    t === "unpack that"
  );
}

function hasDeeperSuffix(text) {
  const t = norm(text);
  return /\b(deeper|tell me more|expand|unpack that)\s*$/.test(t);
}

function stripDeeperSuffix(text) {
  const t = String(text || "");
  return t.replace(/\s*(deeper|tell me more|expand|unpack that)\s*$/i, "").trim();
}

function modeToPrompt(mode, year) {
  const y = clampYear(year);
  if (!y) return null;
  const m = String(mode || "").toLowerCase();
  if (m === "top10") return `top 10 ${y}`;
  if (m === "top100") return `top 100 ${y}`;
  if (m === "story" || m === "story_moment") return `story moment ${y}`;
  if (m === "micro" || m === "micro_moment") return `micro moment ${y}`;
  if (m === "number1" || m === "number_1") return `#1 ${y}`;
  return `top 10 ${y}`;
}

function reconstructPromptFromSession(session) {
  const s = session && typeof session === "object" ? session : {};
  const y = clampYear(s.lastMusicYear || s.year || s.lastYear || s.pendingYear);
  const m = String(s.activeMusicMode || s.mode || s.lastMode || s.pendingMode || "top10");
  if (!y) return null;
  return modeToPrompt(m, y);
}

function safeNextYear(y) {
  const n = clampYear(y);
  if (!n) return null;
  return clampYear(n + 1) || 2025;
}

function safePrevYear(y) {
  const n = clampYear(y);
  if (!n) return null;
  return clampYear(n - 1) || 1950;
}

function deeperExpansion({ mode, year }) {
  const y = clampYear(year);
  const m = String(mode || "").toLowerCase();

  if (!y) {
    return "\n\nIf you tell me a year (1950–2025), I can go deeper with real context.";
  }

  const ny = safeNextYear(y);
  const py = safePrevYear(y);

  if (m === "story" || m === "story_moment") {
    return (
      "\n\nDeeper:\n" +
      "• Anchor it to the moment: where you were, what you were doing.\n" +
      "• The “why it stuck”: production choices + cultural mood.\n" +
      `• Want next year (${ny}) or stay in ${y}?`
    );
  }

  if (m === "micro" || m === "micro_moment") {
    return (
      "\n\nDeeper:\n" +
      "• Sensory cue: a sound/scene that makes the year feel real.\n" +
      "• One cultural anchor (movie/TV vibe or headline-level theme).\n" +
      `• Next (${ny}) or previous (${py})?`
    );
  }

  if (m === "number1" || m === "number_1") {
    return (
      "\n\nDeeper:\n" +
      "• Why #1 happened: timing + audience appetite.\n" +
      "• What it replaced (the vibe shift).\n" +
      `• Want the #1 for ${ny} next?`
    );
  }

  if (m === "top100") {
    return (
      "\n\nDeeper:\n" +
      "• Big picture: what dominated the year and what was emerging.\n" +
      "• If you want, I can zoom into the Top 10 inside the Top 100.\n" +
      `• Next year (${ny})?`
    );
  }

  return (
    "\n\nDeeper:\n" +
    `• Pattern check: what styles kept repeating in ${y}.\n` +
    "• One standout “contrast” track (different energy).\n" +
    `• Next (${ny}) or previous (${py})?`
  );
}

/* ======================================================
   UI bridge helpers
====================================================== */

function normalizeActionName(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "top10") return "top10";
  if (m === "top100") return "yearend_hot100";
  if (m === "story" || m === "story_moment") return "story_moment";
  if (m === "micro" || m === "micro_moment") return "micro_moment";
  if (m === "number1" || m === "number_1") return "number_one";
  return "top10";
}

function inferActionFromLabel(label) {
  const t = norm(label);
  if (!t) return "top10";
  if (/\btop\s*10\b|\btop10\b|\btop\s*ten\b/.test(t)) return "top10";
  if (/\btop\s*100\b|\btop100\b|\bhot\s*100\b|\byear[-\s]*end\s*hot\s*100\b/.test(t)) return "yearend_hot100";
  if (/\bstory\b/.test(t)) return "story_moment";
  if (/\bmicro\b/.test(t)) return "micro_moment";
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return "number_one";
  if (/^\d{4}$/.test(t)) return "top10";
  if (t === "another year") return "year_pick";
  return "top10";
}

function buildChipPayload({ label, send, action, year, sessionPatch }) {
  const y = clampYear(year || extractYearFromText(send || label) || (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)));
  const a = action || inferActionFromLabel(send || label);
  const payload = {
    lane: LANE_NAME,
    route: LANE_NAME,
    action: a,
  };
  if (y) payload.year = y;
  if (sessionPatch && sessionPatch.activeMusicMode) payload.mode = sessionPatch.activeMusicMode;
  if (sessionPatch && sessionPatch.activeMusicChart) payload.chart = sessionPatch.activeMusicChart;
  return payload;
}

function chipIdFromLabel(label) {
  return `music_${String(label || "chip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "chip"}`;
}

function normalizeFollowUps(rawList, sessionPatch) {
  const raw = Array.isArray(rawList) ? rawList : [];
  const objects = [];
  const seen = new Set();

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const label =
      typeof item === "string"
        ? item
        : String((item && (item.label || item.send || item.text)) || "");
    const cleanedLabel = label.replace(/\s+/g, " ").trim();
    if (!cleanedLabel) continue;

    const dedupeKey = cleanedLabel.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const send =
      typeof item === "object" && item && item.send
        ? String(item.send).trim()
        : cleanedLabel;

    const payload =
      typeof item === "object" && item && item.payload && typeof item.payload === "object"
        ? {
            ...item.payload,
            lane: item.payload.lane || LANE_NAME,
            route: item.payload.route || LANE_NAME,
          }
        : buildChipPayload({
            label: cleanedLabel,
            send,
            action: typeof item === "object" && item ? item.action : null,
            year: typeof item === "object" && item ? item.year : null,
            sessionPatch,
          });

    const chip = {
      id:
        typeof item === "object" && item && item.id
          ? String(item.id)
          : chipIdFromLabel(cleanedLabel),
      type:
        typeof item === "object" && item && item.type
          ? String(item.type)
          : "chip",
      label: cleanedLabel.length > 48 ? cleanedLabel.slice(0, 48) : cleanedLabel,
      send,
      payload,
    };

    objects.push(chip);
    if (objects.length >= 10) break;
  }

  return {
    followUpsStrings: objects.map((x) => x.send).slice(0, 10),
    followUps: objects.slice(0, 10),
  };
}

function buildBridgeEnvelope({ reply, followUps, sessionPatch }) {
  const patch = sessionPatch && typeof sessionPatch === "object" ? sessionPatch : {};
  const mode = patch.activeMusicMode || patch.mode || null;
  const year = clampYear(patch.lastMusicYear || patch.year || patch.pendingYear);
  const chart = normalizeChartForLane(patch.activeMusicChart || patch.lastMusicChart);

  return {
    lane: LANE_NAME,
    route: LANE_NAME,
    ready: !!reply,
    year,
    mode,
    chart,
    chips: Array.isArray(followUps) ? followUps : [],
    session: {
      lane: LANE_NAME,
      year,
      mode,
      chart,
      depthLevel: Number(patch.depthLevel || 0),
    },
  };
}

/* ======================================================
   Core
====================================================== */

async function handleChat({ text, session, visitorId, debug }) {
  try {
    const s0 = session && typeof session === "object" ? session : {};
    const s = scrubLegacyChartsInSession(s0);

    const rawText = String(text || "");
    let deep = false;
    let baseText = rawText;

    if (isDeeperToken(rawText)) {
      const recon = reconstructPromptFromSession(s);
      if (!recon) {
        const fallback = "Tell me a year (1950–2025) — then I can go deeper.";
        const normalized = normalizeFollowUps(["1956", "1988", "top 10 1988"], null);
        const sessionPatch = ensureContinuity({
          session: s,
          patch: scrubLegacyChartsInPatch(null),
          userMode: null,
          replyMode: null,
          userYear: null,
          replyYear: null,
        });
        return {
          reply: fallback,
          followUpsStrings: normalized.followUpsStrings,
          followUps: normalized.followUps,
          sessionPatch,
          bridge: buildBridgeEnvelope({
            reply: fallback,
            followUps: normalized.followUps,
            sessionPatch,
          }),
          meta: debug ? { ok: false, reason: "deeper_no_context" } : null,
        };
      }
      deep = true;
      baseText = recon;
    } else if (hasDeeperSuffix(rawText)) {
      deep = true;
      baseText = stripDeeperSuffix(rawText);
      if (!baseText) {
        const recon = reconstructPromptFromSession(s);
        if (recon) baseText = recon;
      }
    }

    const cleanText = String(baseText || "");

    if (!musicKnowledge) {
      const fallback = "Music is warming up. Give me a year (1950–2025).";
      const sessionPatch = ensureContinuity({
        session: s,
        patch: scrubLegacyChartsInPatch(null),
        userMode: normalizeModeFromText(cleanText),
        replyMode: null,
        userYear: extractYearFromText(cleanText),
        replyYear: null,
      });
      const normalized = normalizeFollowUps(["1956", "1988", "top 10 1988"], sessionPatch);
      return {
        reply: fallback,
        followUpsStrings: normalized.followUpsStrings,
        followUps: normalized.followUps,
        sessionPatch,
        bridge: buildBridgeEnvelope({
          reply: fallback,
          followUps: normalized.followUps,
          sessionPatch,
        }),
        meta: debug ? { ok: false, reason: "musicKnowledge_missing" } : null,
      };
    }

    const inferredMode = normalizeModeFromText(cleanText);
    const inferredYear = extractYearFromText(cleanText);

    const raw = await Promise.resolve(
      typeof musicKnowledge.handleChat === "function"
        ? musicKnowledge.handleChat({
            text: cleanText,
            session: s,
            visitorId,
            debug: !!debug,
          })
        : musicKnowledge.handleMusicTurn({
            norm: {},
            session: s,
            year: inferredYear,
            action: inferredMode === "top100" ? "yearend_hot100" : (inferredMode || ""),
            opts: { meta: !!debug },
          })
    );

    let reply = String(raw && raw.reply ? raw.reply : raw && raw.replyRaw ? raw.replyRaw : "").trim();
    if (!reply) reply = "Tell me a year (1950–2025), or say “top 10 1988”.";

    const userMode = inferredMode;
    const replyMode = inferModeFromReply(reply);
    const userYear = inferredYear;
    const replyYear = null;

    let sessionPatch = safeSessionPatch(raw && raw.sessionPatch);
    sessionPatch = scrubLegacyChartsInPatch(sessionPatch);
    sessionPatch = ensureContinuity({
      session: s,
      patch: sessionPatch,
      userMode,
      replyMode,
      userYear,
      replyYear,
    });
    sessionPatch = scrubLegacyChartsInPatch(sessionPatch);

    if (deep) {
      const appliedMode =
        (sessionPatch && (sessionPatch.activeMusicMode || sessionPatch.mode)) ||
        userMode ||
        replyMode ||
        "top10";

      const appliedYear =
        (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)) ||
        userYear ||
        null;

      reply = `${reply}${deeperExpansion({ mode: appliedMode, year: appliedYear })}`;

      if (sessionPatch && typeof sessionPatch === "object") {
        const prev = Number(sessionPatch.depthLevel || 0);
        sessionPatch.depthLevel = prev + 1;
        sessionPatch.recentIntent = sessionPatch.recentIntent || "deeper";
        sessionPatch.recentTopic = sessionPatch.recentTopic || "deeper";
      }
    }

    const rawFollowUps =
      Array.isArray(raw && raw.followUps) && raw.followUps.length
        ? raw.followUps
        : Array.isArray(raw && raw.followUpsStrings) && raw.followUpsStrings.length
          ? raw.followUpsStrings
          : ["1956", "top 10 1988", "story moment 1955"];

    const normalized = normalizeFollowUps(rawFollowUps, sessionPatch);
    const bridge = buildBridgeEnvelope({
      reply,
      followUps: normalized.followUps,
      sessionPatch,
    });

    return {
      reply,
      followUpsStrings: normalized.followUpsStrings,
      followUps: normalized.followUps,
      sessionPatch,
      bridge,
      meta: debug
        ? {
            ok: !!reply,
            source: "musicKnowledge",
            mkVersion:
              musicKnowledge.MK_VERSION && typeof musicKnowledge.MK_VERSION === "function"
                ? musicKnowledge.MK_VERSION()
                : null,
            followUps: normalized.followUpsStrings.length,
            hasPatch: !!sessionPatch,
            deep,
            chart: {
              inboundActiveMusicChart: s0 && typeof s0 === "object" ? s0.activeMusicChart || null : null,
              inboundLastMusicChart: s0 && typeof s0 === "object" ? s0.lastMusicChart || null : null,
              scrubbedActiveMusicChart: s.activeMusicChart || null,
              scrubbedLastMusicChart: s.lastMusicChart || null,
              outboundActiveMusicChart: sessionPatch ? sessionPatch.activeMusicChart || null : null,
              outboundLastMusicChart: sessionPatch ? sessionPatch.lastMusicChart || null : null,
            },
            inferred: {
              userMode: userMode || null,
              replyMode: replyMode || null,
              appliedMode:
                sessionPatch && (sessionPatch.mode || sessionPatch.activeMusicMode)
                  ? sessionPatch.mode || sessionPatch.activeMusicMode
                  : null,
              appliedYear:
                sessionPatch && (sessionPatch.year || sessionPatch.lastMusicYear)
                  ? sessionPatch.year || sessionPatch.lastMusicYear
                  : null,
            },
            bridge: {
              ready: bridge.ready,
              year: bridge.year,
              mode: bridge.mode,
              chart: bridge.chart,
              chips: bridge.chips.length,
            },
          }
        : null,
    };
  } catch (e) {
    const fallback = "Music lane hit a snag. Give me a year (1950–2025) and try again.";
    const normalized = normalizeFollowUps(["1956", "1988", "top 10 1988"], null);
    return {
      reply: fallback,
      followUpsStrings: normalized.followUpsStrings,
      followUps: normalized.followUps,
      sessionPatch: null,
      bridge: buildBridgeEnvelope({
        reply: fallback,
        followUps: normalized.followUps,
        sessionPatch: null,
      }),
      meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null,
    };
  }
}


function normalizeBridgeInput(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    text: String(b.text || b.message || ""),
    session: b.session && typeof b.session === "object" ? b.session : {},
    visitorId: b.visitorId || b.visitor_id || undefined,
    debug: !!b.debug,
  };
}

async function handleBridgeRequest(body) {
  const input = normalizeBridgeInput(body);
  const res = await handleChat(input);
  const bridge = res && res.bridge ? res.bridge : null;
  return {
    ok: !!(res && res.reply),
    status: res && res.reply ? "ready" : "degraded",
    source: LANE_NAME,
    reply: res.reply,
    text: res.reply,
    content: { text: res.reply || "", year: bridge && bridge.year || null, mode: bridge && bridge.mode || null, chart: bridge && bridge.chart || null },
    followUps: res.followUps,
    followUpsStrings: res.followUpsStrings,
    followUpObjects: res.followUps,
    sessionPatch: res.sessionPatch,
    bridge,
    meta: res.meta || null,
  };
}

async function musicLaneFn(text, session, opts) {
  const res = await handleChat({
    text,
    session,
    visitorId: opts && opts.visitorId ? opts.visitorId : undefined,
    debug: !!(opts && opts.debug),
  });

  return {
    reply: res.reply,
    followUps: res.followUpsStrings,
    followUpObjects: res.followUps,
    sessionPatch: res.sessionPatch,
    bridge: res.bridge,
    meta: res.meta,
  };
}

module.exports = musicLaneFn;
module.exports.musicLane = musicLaneFn;
module.exports.handleChat = handleChat;
module.exports.normalizeChartForLane = normalizeChartForLane;
module.exports.normalizeModeFromText = normalizeModeFromText;
module.exports.LANE_NAME = LANE_NAME;

module.exports.handleBridgeRequest = handleBridgeRequest;
module.exports.normalizeBridgeInput = normalizeBridgeInput;
