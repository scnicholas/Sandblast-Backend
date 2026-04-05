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
 * v1.8.0 (EXECUTE-CONTRACT ALIGNMENT + STRICT BRIDGE NORMALIZATION + RESOLVER/KNOWLEDGE FORENSIC HARDEN)
 *  ✅ Keeps 1950–2025 public range aligned with musicKnowledge
 *  ✅ Preserves structural behavior; no mutation of inbound session
 *  ✅ Normalizes legacy Top40 chart tokens out of inbound + outbound state
 *  ✅ Canonicalizes lane actions and mode aliases for shell/widget alignment
 *  ✅ Builds payload-bearing chips for UI bridges instead of text-only follow-ups
 *  ✅ Hardens bridge input so payload-based UI actions can pass through safely
 *  ✅ Adds deterministic bridge envelope for shell / widget integration
 *  ✅ Guarantees bridge content payloads for widget rendering (items/detail/title/sub)
 *  ✅ Replaces weak year-only follow-up drift with action-aware chips
 *  ✅ Normalizes failure states so the shell can distinguish ready vs needs_attention
 *  ✅ Maintains string follow-ups for legacy chatEngine compatibility
 *  ✅ Aligns bridge status with index.js strict execute contract
 *  ✅ Adds bridge.valid / executable / provenance fields for /api/music/bridge
 *  ✅ Preserves year speech formatting while preventing digit-by-digit drift
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

let musicMoments = null;
try {
  musicMoments = require("./musicMoments");
  if (!musicMoments || typeof musicMoments.handle !== "function") musicMoments = null;
} catch (_) {
  musicMoments = null;
}

let musicResolver = null;
try {
  musicResolver = require("./musicResolver");
  if (!musicResolver || typeof musicResolver.resolveMusicIntent !== "function") musicResolver = null;
} catch (_) {
  musicResolver = null;
}

const LANE_NAME = "music";
const CHART_DEFAULT = "Billboard Hot 100";

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}


function canonicalMusicAction(x) {
  const t = norm(x);
  if (!t) return null;
  if (t === "year_pick" || t === "year picker" || t === "year_picker" || t === "pick a year" || t === "another year") return "year_pick";
  if (t === "top10" || t === "top 10" || t === "top ten") return "top10";
  if (
    t === "top100" ||
    t === "top 100" ||
    t === "hot 100" ||
    t === "yearend_hot100" ||
    t === "year-end hot 100" ||
    t === "year end hot 100"
  ) return "yearend_hot100";
  if (t === "story" || t === "story moment" || t === "story_moment") return "story_moment";
  if (t === "micro" || t === "micro moment" || t === "micro_moment") return "micro_moment";
  if (t === "number1" || t === "number 1" || t === "number_one" || t === "#1" || t === "no 1" || t === "no. 1") return "number_one";
  return t;
}

function canonicalMusicMode(x) {
  const a = canonicalMusicAction(x);
  if (!a) return null;
  if (a === "yearend_hot100") return "top100";
  if (a === "story_moment") return "story";
  if (a === "micro_moment") return "micro";
  if (a === "number_one") return "number1";
  if (a === "year_pick") return "year_pick";
  return a;
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

function numberToWords(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n || "");

  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const teens = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? `-${ones[num % 10]}` : "");
  return String(num);
}

function formatYearForSpeech(year) {
  const y = clampYear(year);
  if (!y) return "";

  if (y >= 1900 && y <= 1999) {
    const first = Math.floor(y / 100);
    const second = y % 100;
    return `${numberToWords(first)} ${second ? numberToWords(second) : "hundred"}`.trim();
  }

  if (y >= 2000 && y <= 2009) {
    const tail = y % 2000;
    return tail ? `two thousand ${numberToWords(tail)}` : "two thousand";
  }

  if (y >= 2010 && y <= 2099) {
    const first = Math.floor(y / 100);
    const second = y % 100;
    return `${numberToWords(first)} ${second ? numberToWords(second) : "hundred"}`.trim();
  }

  return String(y);
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

  if (/\b(top\s*10|top10|top\s*ten)\b/.test(t)) return canonicalMusicMode("top10");
  if (/\b(top\s*100|top100|hot\s*100|year[-\s]*end\s*hot\s*100)\b/.test(t)) return canonicalMusicMode("yearend_hot100");
  if (/\bstory\s*moment\b|\bstory\b/.test(t)) return canonicalMusicMode("story_moment");
  if (/\bmicro\s*moment\b|\bmicro\b/.test(t)) return canonicalMusicMode("micro_moment");
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return canonicalMusicMode("number_one");

  return null;
}

function inferModeFromReply(reply) {
  const r = norm(reply);
  if (!r) return null;

  if (r.startsWith("top 10") || /\btop\s*10\b/.test(r)) return canonicalMusicMode("top10");
  if (
    r.includes("year-end hot 100") ||
    r.includes("year end hot 100") ||
    /\btop\s*100\b/.test(r) ||
    r.includes("hot 100")
  ) {
    return canonicalMusicMode("yearend_hot100");
  }
  if (r.includes("story moment")) return canonicalMusicMode("story_moment");
  if (r.includes("micro moment")) return canonicalMusicMode("micro_moment");
  if (/\b#\s*1\b/.test(r) || r.includes("number 1") || r.includes("no. 1") || r.includes("no 1")) {
    return canonicalMusicMode("number_one");
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

function safeArray(list) {
  return Array.isArray(list) ? list : [];
}

function cleanTextValue(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function bridgeReasonFromReply(text) {
  const t = norm(text);
  if (!t) return "empty_reply";
  if (t.includes("give me the year") || t.includes("valid year")) return "missing_year";
  if (t.includes("warming up")) return "warming_up";
  if (t.includes("i don’t have") || t.includes("i don't have") || t.includes("not loaded")) return "year_not_found";
  if (t.includes("hit a snag")) return "exception";
  return "";
}

function bridgeStatusFromReply(text, hasItems, explicitStatus) {
  const forced = cleanTextValue(explicitStatus).toLowerCase();
  if (forced === "execute" || forced === "clarify" || forced === "blocked") return forced;
  const t = norm(text);
  if (!t && !hasItems) return "blocked";
  if (t.includes("give me the year") || t.includes("valid year")) return "clarify";
  if (t.includes("pick another year") || t.includes("i don’t have") || t.includes("i don't have") || t.includes("not loaded") || t.includes("warming up") || t.includes("hit a snag")) return "blocked";
  if (hasItems || t) return "execute";
  return "blocked";
}

function resolveBridgeProvenance(action, raw, source) {
  const a = canonicalMusicAction(action) || null;
  const meta = raw && typeof raw === "object" && raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const provenance = meta.provenance && typeof meta.provenance === "object" ? meta.provenance : {};
  let sourceTruth = cleanTextValue((provenance && provenance.sourceTruth) || meta.sourceTruth || "");
  let routeSource = cleanTextValue((provenance && provenance.routeSource) || meta.routeSource || "");
  let capabilityMode = cleanTextValue(meta.mode || (provenance && provenance.mode) || "");

  if (!routeSource) {
    if (a === "top10") routeSource = "top10";
    else if (a === "number_one") routeSource = "number1";
    else if (a === "story_moment") routeSource = "story_moment";
    else if (a === "micro_moment") routeSource = "micro_moment";
    else if (a === "yearend_hot100") routeSource = "yearend_hot100";
    else if (a === "year_pick") routeSource = "year_pick";
  }

  if (!sourceTruth) {
    if (a === "top10") sourceTruth = "top10_by_year_v1.json";
    else if (a === "number_one") sourceTruth = "derived_from_top10";
    else if (a === "story_moment") sourceTruth = source === "musicMoments" ? "musicMoments.getMoment" : "top10_chart_template_fallback";
    else if (a === "micro_moment") sourceTruth = source === "musicMoments" ? "musicMoments.getMoment" : "top10_chart_template_fallback";
    else if (a === "yearend_hot100") sourceTruth = "top10_excerpt_from_top10_by_year_v1.json";
    else sourceTruth = source || "music_lane";
  }

  if (!capabilityMode) {
    if (a === "year_pick") capabilityMode = "clarify";
    else if (a === "yearend_hot100") capabilityMode = "excerpt";
    else capabilityMode = "full";
  }

  return { sourceTruth, routeSource, capabilityMode };
}

function looksUnavailableReply(text) {
  const t = norm(text);
  if (!t) return false;
  return (
    t.includes("i don’t have") ||
    t.includes("i don't have") ||
    t.includes("not loaded") ||
    t.includes("pick another year") ||
    t.includes("give me a valid year") ||
    t.includes("give me the year") ||
    t.includes("hit a snag") ||
    t.includes("warming up")
  );
}

function normalizeBridgeItem(raw, fallbackRank) {
  const r = raw && typeof raw === "object" ? raw : {};
  const rank = Number(r.pos || r.rank || r.position || r.number || fallbackRank || 0) || null;
  const title = cleanTextValue(r.title || r.name || r.song || r.track || r.label || r.item);
  const artist = cleanTextValue(r.artist || r.by || r.performer || r.band || r.singer || r.act);
  const detail = cleanTextValue(r.detail || r.note || r.summary || r.story || r.moment || r.description || r.caption);
  const year = clampYear(r.year || r.chartYear || null);
  return {
    rank,
    title,
    artist,
    year,
    detail,
  };
}

function actionDisplayLabel(action) {
  const a = canonicalMusicAction(action) || "music";
  if (a === "top10") return "Top 10";
  if (a === "yearend_hot100") return "Year-End Hot 100";
  if (a === "number_one") return "#1";
  if (a === "story_moment") return "Music Moments";
  if (a === "micro_moment") return "Micro moment";
  if (a === "year_pick") return "Music year";
  return cleanTextValue(a).replace(/_/g, " ") || "Music";
}

function extractBridgeItems(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pools = [
    r.items,
    r.results,
    r.tracks,
    r.songs,
    r.top10,
    r.rows,
    r.bridge && r.bridge.items,
    r.content && r.content.items,
    r.payload && r.payload.items,
    r.data && r.data.items,
    r.data && r.data.results,
  ];
  for (const pool of pools) {
    if (Array.isArray(pool) && pool.length) return pool;
  }
  return [];
}

function extractBridgeLinks(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pools = [r.links, r.bridge && r.bridge.links, r.content && r.content.links, r.payload && r.payload.links];
  for (const pool of pools) {
    if (Array.isArray(pool) && pool.length) return pool;
  }
  return [];
}

function extractBridgeDetail(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return cleanTextValue(
    r.detailText ||
    r.detail ||
    r.summary ||
    (r.content && (r.content.detailText || r.content.text)) ||
    (r.bridge && r.bridge.detailText) ||
    (r.payload && r.payload.detailText) ||
    ""
  );
}

function safeSessionPatch(patch) {
  return patch && typeof patch === "object" ? { ...patch } : null;
}

function ensureContinuity({ patch, userMode, replyMode, userYear, replyYear, session }) {
  const s = session && typeof session === "object" ? session : null;
  let p = patch && typeof patch === "object" ? patch : null;

  const mode = canonicalMusicMode(userMode || replyMode || null) || null;

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
  const m = canonicalMusicAction(mode) || String(mode || "").toLowerCase();
  if (m === "top10") return `top 10 ${y}`;
  if (m === "top100" || m === "yearend_hot100") return `top 100 ${y}`;
  if (m === "story" || m === "story_moment") return `story moment ${y}`;
  if (m === "micro" || m === "micro_moment") return `micro moment ${y}`;
  if (m === "number1" || m === "number_1" || m === "number_one") return `#1 ${y}`;
  return `top 10 ${y}`;
}

function reconstructPromptFromSession(session) {
  const s = session && typeof session === "object" ? session : {};
  const y = clampYear(s.lastMusicYear || s.year || s.lastYear || s.pendingYear);
  const m = canonicalMusicAction(s.activeMusicMode || s.mode || s.lastMode || s.pendingMode || "top10") || "top10";
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
  const m = canonicalMusicAction(mode) || String(mode || "").toLowerCase();

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
  const m = canonicalMusicAction(mode) || String(mode || "").toLowerCase();
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
  if (/\btop\s*10\b|\btop10\b|\btop\s*ten\b/.test(t)) return canonicalMusicAction("top10");
  if (/\btop\s*100\b|\btop100\b|\bhot\s*100\b|\byear[-\s]*end\s*hot\s*100\b/.test(t)) return canonicalMusicAction("yearend_hot100");
  if (/\bstory\b/.test(t)) return canonicalMusicAction("story_moment");
  if (/\bmicro\b/.test(t)) return canonicalMusicAction("micro_moment");
  if (/\b#\s*1\b|\bnumber\s*1\b|\bno\.?\s*1\b|\bno\s*1\b/.test(t)) return canonicalMusicAction("number_one");
  if (/^\d{4}$/.test(t)) return canonicalMusicAction("top10");
  if (t === "another year") return canonicalMusicAction("year_pick");
  return canonicalMusicAction(t) || "top10";
}

function buildChipPayload({ label, send, action, year, sessionPatch }) {
  const y = clampYear(year || extractYearFromText(send || label) || (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)));
  const a = canonicalMusicAction(action || inferActionFromLabel(send || label)) || "top10";
  const payload = {
    lane: LANE_NAME,
    route: LANE_NAME,
    action: a,
  };
  if (y) payload.year = y;
  if (sessionPatch && sessionPatch.activeMusicMode) payload.mode = canonicalMusicAction(sessionPatch.activeMusicMode) || sessionPatch.activeMusicMode;
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

function buildBridgeEnvelope({ reply, followUps, sessionPatch, items, detailText, title, sub, links, status, action, raw, source }) {
  const patch = sessionPatch && typeof sessionPatch === "object" ? sessionPatch : {};
  const mode = canonicalMusicAction(action || patch.activeMusicMode || patch.mode || null) || null;
  const year = clampYear(patch.lastMusicYear || patch.year || patch.pendingYear);
  const chart = normalizeChartForLane(patch.activeMusicChart || patch.lastMusicChart);
  const normalizedItems = safeArray(items).map((item, idx) => normalizeBridgeItem(item, idx + 1)).filter((item) => item.title || item.detail);
  const normalizedLinks = safeArray(links).filter((x) => x && x.url && x.label).slice(0, 8);
  const detail = cleanTextValue(detailText || "");
  const derivedStatus = bridgeStatusFromReply(reply, normalizedItems.length > 0 || !!detail, status);
  const reason = bridgeReasonFromReply(reply);
  const provenance = resolveBridgeProvenance(mode, raw, source);
  const isExecute = derivedStatus === "execute";

  return {
    ready: isExecute,
    valid: derivedStatus === "execute" || derivedStatus === "clarify",
    lane: LANE_NAME,
    route: LANE_NAME,
    status: derivedStatus,
    executable: isExecute,
    year,
    yearSpoken: year ? formatYearForSpeech(year) : null,
    mode,
    chart,
    title: cleanTextValue(title || "") || null,
    sub: cleanTextValue(sub || "") || null,
    detailText: detail || null,
    items: normalizedItems,
    links: normalizedLinks,
    chips: Array.isArray(followUps) ? followUps : [],
    capabilityMode: provenance.capabilityMode,
    sourceTruth: provenance.sourceTruth,
    routeSource: provenance.routeSource,
    reason,
    session: {
      lane: LANE_NAME,
      year,
      mode,
      action: mode,
      chart,
      depthLevel: Number(patch.depthLevel || 0),
    },
  };
}

/* ======================================================
   Canonical dispatch helpers
====================================================== */

function normalizeResolverAction(action) {
  return canonicalMusicAction(action) || String(action || "").toLowerCase();
}

function buildMomentFollowUps(result, year) {
  if (result && result.followUp && result.followUp.kind === "ask_year") {
    return ["1956", "1988", "top 10 1988"];
  }
  const y = clampYear(year || (result && result.sessionPatch && (result.sessionPatch.lastMusicYear || result.sessionPatch.year)));
  if (!y) return ["1956", "1988", "top 10 1988"];
  return [`top 10 ${y}`, `#1 ${y}`, `story moment ${y}`, `micro moment ${y}`];
}

function makeFollowUpChip({ label, send, action, year, type }) {
  const cleanedLabel = cleanTextValue(label || send || "");
  const cleanedSend = cleanTextValue(send || label || "");
  if (!cleanedLabel || !cleanedSend) return null;
  return {
    id: chipIdFromLabel(cleanedLabel),
    type: type || "chip",
    label: cleanedLabel.length > 48 ? cleanedLabel.slice(0, 48) : cleanedLabel,
    send: cleanedSend,
    payload: buildChipPayload({ label: cleanedLabel, send: cleanedSend, action, year, sessionPatch: year ? { year, lastMusicYear: year } : null }),
  };
}

function actionAwareFollowUps(action, year) {
  const y = clampYear(year) || 1988;
  const next = safeNextYear(y) || y;
  const prev = safePrevYear(y) || y;
  const a = canonicalMusicAction(action) || "top10";

  if (a === "year_pick") {
    return [
      makeFollowUpChip({ label: "Top 10", send: `top 10 ${y}`, action: "top10", year: y }),
      makeFollowUpChip({ label: "Music Moments", send: `story moment ${y}`, action: "story_moment", year: y }),
      makeFollowUpChip({ label: "Micro moment", send: `micro moment ${y}`, action: "micro_moment", year: y }),
      makeFollowUpChip({ label: "#1", send: `#1 ${y}`, action: "number_one", year: y }),
      makeFollowUpChip({ label: String(next), send: `top 10 ${next}`, action: "top10", year: next }),
    ].filter(Boolean);
  }

  if (a === "top10") {
    return [
      makeFollowUpChip({ label: "Music Moments", send: `story moment ${y}`, action: "story_moment", year: y }),
      makeFollowUpChip({ label: "Micro moment", send: `micro moment ${y}`, action: "micro_moment", year: y }),
      makeFollowUpChip({ label: "#1", send: `#1 ${y}`, action: "number_one", year: y }),
      makeFollowUpChip({ label: String(prev), send: `top 10 ${prev}`, action: "top10", year: prev }),
      makeFollowUpChip({ label: String(next), send: `top 10 ${next}`, action: "top10", year: next }),
      makeFollowUpChip({ label: "Another year", send: "pick a year", action: "year_pick", year: y }),
    ].filter(Boolean);
  }

  if (a === "story_moment" || a === "micro_moment") {
    return [
      makeFollowUpChip({ label: "Top 10", send: `top 10 ${y}`, action: "top10", year: y }),
      makeFollowUpChip({ label: a === "story_moment" ? "Micro moment" : "Music Moments", send: `${a === "story_moment" ? "micro moment" : "story moment"} ${y}`, action: a === "story_moment" ? "micro_moment" : "story_moment", year: y }),
      makeFollowUpChip({ label: "#1", send: `#1 ${y}`, action: "number_one", year: y }),
      makeFollowUpChip({ label: String(next), send: `${a === "story_moment" ? "story moment" : "micro moment"} ${next}`, action: a, year: next }),
      makeFollowUpChip({ label: "Another year", send: "pick a year", action: "year_pick", year: y }),
    ].filter(Boolean);
  }

  if (a === "number_one") {
    return [
      makeFollowUpChip({ label: "Top 10", send: `top 10 ${y}`, action: "top10", year: y }),
      makeFollowUpChip({ label: "Music Moments", send: `story moment ${y}`, action: "story_moment", year: y }),
      makeFollowUpChip({ label: String(next), send: `#1 ${next}`, action: "number_one", year: next }),
      makeFollowUpChip({ label: "Another year", send: "pick a year", action: "year_pick", year: y }),
    ].filter(Boolean);
  }

  return [
    makeFollowUpChip({ label: "Top 10", send: `top 10 ${y}`, action: "top10", year: y }),
    makeFollowUpChip({ label: "Music Moments", send: `story moment ${y}`, action: "story_moment", year: y }),
    makeFollowUpChip({ label: "Another year", send: "pick a year", action: "year_pick", year: y }),
  ].filter(Boolean);
}

function mergeFollowUpLists(primary, secondary, sessionPatch) {
  const raw = [];
  for (const src of [safeArray(primary), safeArray(secondary)]) {
    for (const item of src) raw.push(item);
  }
  return normalizeFollowUps(raw, sessionPatch);
}

function lookupBridgeContent(action, year, reply, raw, source) {
  const a = canonicalMusicAction(action) || null;
  const y = clampYear(year);
  const rawItems = safeArray(extractBridgeItems(raw));
  const rawLinks = safeArray(extractBridgeLinks(raw));
  const rawDetail = extractBridgeDetail(raw);
  const content = {
    items: [],
    detailText: rawDetail || cleanTextValue(reply || ""),
    title: "",
    sub: "",
    links: rawLinks,
    status: (raw && raw.ok === false) || looksUnavailableReply(reply) ? "needs_attention" : (reply ? "ready" : "needs_attention"),
  };

  if (a === "top10" && musicKnowledge && typeof musicKnowledge.getTop10ByYear === "function" && y) {
    const top10 = musicKnowledge.getTop10ByYear(y, { meta: false });
    if (top10 && Array.isArray(top10.items) && top10.items.length) {
      content.items = top10.items;
      content.title = `Top 10 · ${y}`;
      content.sub = cleanTextValue(top10.chart || "Music detail") || "Music detail";
      content.detailText = rawDetail || cleanTextValue(reply || "");
      content.status = (raw && raw.ok === false) || looksUnavailableReply(reply) ? "needs_attention" : "ready";
      return content;
    }
  }

  if (a === "number_one" && musicKnowledge && typeof musicKnowledge.getNumberOneByYear === "function" && y) {
    const top = musicKnowledge.getNumberOneByYear(y, { meta: false });
    if (top && (top.title || top.artist)) {
      content.items = [{ rank: 1, title: top.title || "—", artist: top.artist || "", year: y }];
      content.title = `#1 · ${y}`;
      content.sub = cleanTextValue(top.chart || "Music detail") || "Music detail";
      content.detailText = rawDetail || cleanTextValue(reply || "");
      content.status = (raw && raw.ok === false) || looksUnavailableReply(reply) ? "needs_attention" : "ready";
      return content;
    }
  }

  if ((a === "story_moment" || a === "micro_moment") && y) {
    const detail = rawDetail || cleanTextValue(reply || "");
    content.items = detail ? [{ rank: 1, title: a === "story_moment" ? `Music moment ${y}` : `Micro moment ${y}`, detail, year: y }] : [];
    content.title = `${a === "story_moment" ? "Music Moments" : "Micro moment"} · ${y}`;
    content.sub = a === "story_moment" ? "Music Moments detail" : "Micro moment detail";
    content.detailText = detail;
    content.status = detail ? "ready" : "needs_attention";
    return content;
  }

  if (a === "year_pick") {
    content.title = "Music year";
    content.sub = "Choose a route";
    content.detailText = rawDetail || cleanTextValue(reply || "Choose Top 10 or Music Moments.");
    content.status = "ready";
    return content;
  }

  if (rawItems.length) {
    content.items = rawItems;
    content.title = y ? `Music detail · ${y}` : "Music detail";
    content.sub = source === "musicMoments" ? "Music Moments detail" : "Music detail";
    content.status = "ready";
    return content;
  }

  content.title = y ? `${actionDisplayLabel(a)} · ${y}` : "Music detail";
  content.sub = source === "musicMoments" ? "Music Moments detail" : "Music detail";
  content.detailText = rawDetail || cleanTextValue(reply || "");
  if (!content.detailText) content.status = "needs_attention";
  return content;
}

function normalizeMomentResult(result, session, userYear) {
  const reply = String(result && result.reply || "").trim();
  const patch = ensureContinuity({
    session,
    patch: scrubLegacyChartsInPatch(safeSessionPatch(result && result.sessionPatch) || {}),
    userMode: normalizeModeFromText(reply),
    replyMode: normalizeModeFromText(reply),
    userYear,
    replyYear: clampYear(result && result.sessionPatch && (result.sessionPatch.lastMusicYear || result.sessionPatch.year)),
  });
  const normalized = mergeFollowUpLists(buildMomentFollowUps(result, userYear), actionAwareFollowUps(normalizeModeFromText(reply) || "story_moment", (patch && (patch.lastMusicYear || patch.year)) || userYear), patch);
  return { reply, sessionPatch: patch, normalized };
}

async function runCanonicalMusicAction({ action, text, session, visitorId, debug, year }) {
  const a = normalizeResolverAction(action || inferActionFromLabel(text));
  if ((a === "story_moment" || a === "micro_moment") && musicMoments && typeof musicMoments.handle === "function") {
    const out = await Promise.resolve(musicMoments.handle(text, session || {}));
    return { source: "musicMoments", raw: out };
  }
  if (!musicKnowledge) return { source: "fallback", raw: null };
  const out = await Promise.resolve(
    typeof musicKnowledge.handleChat === "function"
      ? musicKnowledge.handleChat({ text, session: session || {}, visitorId, debug: !!debug })
      : musicKnowledge.handleMusicTurn({
          norm: {},
          session: session || {},
          year,
          action: a === "number_one" ? "number_one" : a,
          opts: { meta: !!debug },
        })
  );
  return { source: "musicKnowledge", raw: out };
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
        const normalized = mergeFollowUpLists(["1956", "1988", "top 10 1988"], actionAwareFollowUps("year_pick", 1988), null);
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
          bridge: buildBridgeEnvelope({ reply: fallback, followUps: normalized.followUps, sessionPatch, detailText: fallback, title: "Music detail", sub: "Warmup", status: "blocked", action: "year_pick", raw: null, source: "musicLane" }),
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

    const cleanPrompt = String(baseText || "").trim();
    const isYearPickerPrompt = /^\s*(pick|choose|select)\s+a?\s*year\s*$/i.test(cleanPrompt) || /^\s*another\s+year\s*$/i.test(cleanPrompt);
    const inferredMode = normalizeModeFromText(cleanPrompt);
    const inferredYear = extractYearFromText(cleanPrompt);

    const resolver = musicResolver && typeof musicResolver.resolveMusicIntent === "function"
      ? await Promise.resolve(musicResolver.resolveMusicIntent({
          text: cleanPrompt,
          session: s,
          activeLane: s.activeLane || s.lane || LANE_NAME,
          action: isYearPickerPrompt ? "year_pick" : inferredMode,
          year: inferredYear,
        }))
      : null;

    const resolvedAction = resolver && resolver.action
      ? normalizeResolverAction(resolver.action)
      : (isYearPickerPrompt ? "year_pick" : (inferredMode === "number1" ? "number_one" : (inferredMode === "story" ? "story_moment" : (inferredMode === "micro" ? "micro_moment" : (inferredMode || inferActionFromLabel(cleanPrompt))))));

    const resolvedYear = clampYear(
      inferredYear || (resolver && resolver.year) || s.lastMusicYear || s.year || s.pendingYear
    );

    if (!musicKnowledge && !musicMoments) {
      const fallback = "Music is warming up. Give me a year (1950–2025).";
      const sessionPatch = ensureContinuity({
        session: s,
        patch: scrubLegacyChartsInPatch(resolver && resolver.sessionPatch ? resolver.sessionPatch : null),
        userMode: inferredMode,
        replyMode: null,
        userYear: resolvedYear,
        replyYear: null,
      });
      const normalized = mergeFollowUpLists(["1956", "1988", "top 10 1988"], actionAwareFollowUps("year_pick", resolvedYear || 1988), sessionPatch);
      return {
        reply: fallback,
        followUpsStrings: normalized.followUpsStrings,
        followUps: normalized.followUps,
        sessionPatch,
        bridge: buildBridgeEnvelope({ reply: fallback, followUps: normalized.followUps, sessionPatch, detailText: fallback, title: "Music year", sub: "Choose a route", status: "blocked", action: "year_pick", raw: null, source: "musicLane" }),
        meta: debug ? { ok: false, reason: "music_modules_missing" } : null,
      };
    }

    if (resolver && resolver.needsYear) {
      const fallback = String(resolver.reply || "Give me the year and I will run it.");
      const sessionPatch = ensureContinuity({
        session: s,
        patch: scrubLegacyChartsInPatch(resolver.sessionPatch || {}),
        userMode: inferredMode,
        replyMode: null,
        userYear: null,
        replyYear: null,
      });
      const normalized = mergeFollowUpLists(resolver.followUps || ["1956", "1988", "top 10 1988"], actionAwareFollowUps(resolvedAction || inferredMode || "year_pick", resolvedYear || 1988), sessionPatch);
      return {
        reply: fallback,
        followUpsStrings: normalized.followUpsStrings,
        followUps: normalized.followUps,
        sessionPatch,
        bridge: buildBridgeEnvelope({ reply: fallback, followUps: normalized.followUps, sessionPatch, action: resolvedAction || inferredMode || "year_pick", raw: resolver || null, source: "musicResolver" }),
        meta: debug ? { ok: true, source: "musicResolver", reason: "needs_year" } : null,
      };
    }

    const canonicalText = resolvedAction === "year_pick"
      ? cleanPrompt
      : (() => {
          const y = resolvedYear ? ` ${resolvedYear}` : "";
          if (resolvedAction === "top10") return `top 10${y}`.trim();
          if (resolvedAction === "yearend_hot100") return `year-end hot 100${y}`.trim();
          if (resolvedAction === "number_one") return `#1${y}`.trim();
          if (resolvedAction === "story_moment") return `story moment${y}`.trim();
          if (resolvedAction === "micro_moment") return `micro moment${y}`.trim();
          return cleanPrompt;
        })();

    const executed = await runCanonicalMusicAction({
      action: resolvedAction,
      text: canonicalText,
      session: s,
      visitorId,
      debug,
      year: resolvedYear,
    });

    let reply = "";
    let sessionPatch = null;
    let normalized = null;

    if (executed.source === "musicMoments") {
      const moment = normalizeMomentResult(executed.raw, s, resolvedYear);
      reply = moment.reply || "Give me a year (1950–2025) and I’ll run the music lane.";
      sessionPatch = moment.sessionPatch;
      normalized = moment.normalized;
    } else {
      const raw = executed.raw;
      reply = String(raw && raw.reply ? raw.reply : raw && raw.replyRaw ? raw.replyRaw : "").trim();
      if (!reply) reply = "Tell me a year (1950–2025), or say “top 10 1988”.";

      const replyMode = inferModeFromReply(reply);
      sessionPatch = safeSessionPatch(raw && raw.sessionPatch);
      sessionPatch = scrubLegacyChartsInPatch(sessionPatch);
      if (resolver && resolver.sessionPatch) {
        sessionPatch = { ...(resolver.sessionPatch || {}), ...(sessionPatch || {}) };
      }
      sessionPatch = ensureContinuity({
        session: s,
        patch: sessionPatch,
        userMode: inferredMode,
        replyMode,
        userYear: resolvedYear,
        replyYear: null,
      });
      sessionPatch = scrubLegacyChartsInPatch(sessionPatch);

      const rawFollowUps = Array.isArray(raw && raw.followUps) && raw.followUps.length
        ? raw.followUps
        : Array.isArray(raw && raw.followUpsStrings) && raw.followUpsStrings.length
          ? raw.followUpsStrings
          : (resolver && Array.isArray(resolver.followUps) && resolver.followUps.length ? resolver.followUps : ["1956", "top 10 1988", "story moment 1955"]);
      normalized = mergeFollowUpLists(
        rawFollowUps,
        actionAwareFollowUps(resolvedAction || replyMode || inferredMode || "top10", (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)) || resolvedYear || 1988),
        sessionPatch
      );
    }

    if (deep) {
      const appliedMode = (sessionPatch && (sessionPatch.activeMusicMode || sessionPatch.mode)) || inferredMode || "top10";
      const appliedYear = (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)) || resolvedYear || null;
      reply = `${reply}${deeperExpansion({ mode: appliedMode, year: appliedYear })}`;
      if (sessionPatch && typeof sessionPatch === "object") {
        const prev = Number(sessionPatch.depthLevel || 0);
        sessionPatch.depthLevel = prev + 1;
        sessionPatch.recentIntent = sessionPatch.recentIntent || "deeper";
        sessionPatch.recentTopic = sessionPatch.recentTopic || "deeper";
      }
    }

    const bridgeContent = lookupBridgeContent(resolvedAction, (sessionPatch && (sessionPatch.lastMusicYear || sessionPatch.year)) || resolvedYear, reply, executed.raw, executed.source);
    const bridge = buildBridgeEnvelope({
      reply,
      followUps: normalized.followUps,
      sessionPatch,
      items: bridgeContent.items,
      detailText: bridgeContent.detailText,
      title: bridgeContent.title,
      sub: bridgeContent.sub,
      links: bridgeContent.links,
      status: bridgeContent.status,
      action: resolvedAction,
      raw: executed.raw,
      source: executed.source,
    });

    return {
      reply,
      followUpsStrings: normalized.followUpsStrings,
      followUps: normalized.followUps,
      sessionPatch,
      bridge,
      meta: debug ? {
        ok: !!reply,
        source: executed.source,
        resolver: resolver ? { action: resolver.action || null, year: resolver.year || null } : null,
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
          userMode: inferredMode || null,
          appliedAction: resolvedAction || null,
          appliedYear: resolvedYear || null,
        },
        bridge: {
          ready: bridge.ready,
          year: bridge.year,
          mode: bridge.mode,
          chart: bridge.chart,
          chips: bridge.chips.length,
        },
      } : null,
    };
  } catch (e) {
    const fallback = "Music lane hit a snag. Give me a year (1950–2025) and try again.";
    const normalized = normalizeFollowUps(["1956", "1988", "top 10 1988"], null);
    return {
      reply: fallback,
      followUpsStrings: normalized.followUpsStrings,
      followUps: normalized.followUps,
      sessionPatch: null,
      bridge: buildBridgeEnvelope({ reply: fallback, followUps: normalized.followUps, sessionPatch: null, detailText: fallback, title: "Music detail", sub: "Recovery", status: "blocked", action: "year_pick", raw: null, source: "musicLane" }),
      meta: debug ? { ok: false, reason: "exception", error: String(e && e.message ? e.message : e) } : null,
    };
  }
}


function normalizeBridgeInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const payload = b.payload && typeof b.payload === "object" ? b.payload : {};
  const action = canonicalMusicAction(b.action || b.route || payload.action || payload.route || payload.mode);
  const year = clampYear(b.year || payload.year || (b.session && b.session.lastMusicYear) || (b.session && b.session.year));
  const fallbackText = action
    ? (() => {
        const y = year ? ` ${year}` : "";
        if (action === "year_pick") return "pick a year";
        if (action === "top10") return `top 10${y}`.trim();
        if (action === "yearend_hot100") return `year-end hot 100${y}`.trim();
        if (action === "number_one") return `#1${y}`.trim();
        if (action === "story_moment") return `story moment${y}`.trim();
        if (action === "micro_moment") return `micro moment${y}`.trim();
        return "";
      })()
    : "";

  return {
    text: String(b.text || b.message || fallbackText || ""),
    session: b.session && typeof b.session === "object" ? b.session : {},
    visitorId: b.visitorId || b.visitor_id || undefined,
    debug: !!b.debug,
  };
}

async function handleBridgeRequest(body) {
  const input = normalizeBridgeInput(body);
  const res = await handleChat(input);
  const bridge = res && res.bridge ? res.bridge : null;
  const bridgeStatus = bridge && bridge.status ? bridge.status : (res && res.reply ? "execute" : "blocked");
  return {
    ok: !!(bridge && bridge.ready),
    status: bridgeStatus,
    source: LANE_NAME,
    reply: res.reply,
    text: res.reply,
    executable: !!(bridge && bridge.executable),
    needsYear: bridgeStatus === "clarify",
    content: {
      text: res.reply || "",
      year: bridge && bridge.year || null,
      yearSpoken: bridge && bridge.yearSpoken || null,
      mode: bridge && bridge.mode || null,
      chart: bridge && bridge.chart || null,
      title: bridge && bridge.title || null,
      sub: bridge && bridge.sub || null,
      detailText: bridge && bridge.detailText || null,
      items: bridge && bridge.items || [],
      links: bridge && bridge.links || [],
    },
    items: bridge && bridge.items || [],
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
module.exports.canonicalMusicAction = canonicalMusicAction;
module.exports.canonicalMusicMode = canonicalMusicMode;
module.exports.LANE_NAME = LANE_NAME;

module.exports.handleBridgeRequest = handleBridgeRequest;
module.exports.normalizeBridgeInput = normalizeBridgeInput;
