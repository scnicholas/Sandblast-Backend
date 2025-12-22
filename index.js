/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.89-convo+smartfallback
 *
 * v1.89 changes:
 * - Adds fluid greeting/pleasantries before the ask (keeps conversation human)
 * - Smarter music fallback:
 *    • Year-only: prefers Top40Weekly Top 100 (#1 by default) then random pick ladder
 *    • Artist/Title + wrong year: suggests available years (and can auto-correct when KB can)
 * - Improves correction preface compatibility with musicKnowledge v2.10 flags
 * - Chart parsing recognizes Top40Weekly Top 100 (top 100 / year-end / top100)
 * - Worker returns suggestion metadata (years) for better UX messaging
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Worker, isMainThread, parentPort } = require("worker_threads");

// =======================================================
// WORKER MODE (persistent KB engine)
// =======================================================
if (!isMainThread) {
  let musicKB = null;

  function safe(fn, fallback = null) {
    try { return fn(); } catch { return fallback; }
  }

  function computeStats() {
    try {
      if (!musicKB) musicKB = require("./Utils/musicKnowledge");
      const db = safe(() => musicKB.getDb?.(), null);
      const moments = Array.isArray(db?.moments) ? db.moments : [];

      let minYear = null;
      let maxYear = null;
      const chartSet = new Set();

      for (const m of moments) {
        const y = Number(m?.year);
        if (Number.isFinite(y)) {
          if (minYear == null || y < minYear) minYear = y;
          if (maxYear == null || y > maxYear) maxYear = y;
        }
        const c = m?.chart ? String(m.chart) : "";
        if (c) chartSet.add(c);
      }

      return {
        moments: moments.length,
        yearMin: minYear,
        yearMax: maxYear,
        charts: Array.from(chartSet).slice(0, 50)
      };
    } catch (e) {
      return {
        moments: 0,
        yearMin: null,
        yearMax: null,
        charts: null,
        error: String(e?.message || e)
      };
    }
  }

  function yearsForArtistTitle(artist, title, chart) {
    if (!artist || !title) return [];
    const fn = musicKB?.findYearsForArtistTitle;
    if (typeof fn !== "function") return [];
    let years = safe(() => fn(artist, title, chart), []);
    if (!Array.isArray(years) || years.length === 0) {
      years = safe(() => fn(artist, title, null), []);
    }
    return Array.isArray(years) ? years : [];
  }

  function queryKB(text, fields) {
    if (!musicKB) musicKB = require("./Utils/musicKnowledge");

    const chart = fields?.chart || "Billboard Hot 100";
    const artist = fields?.artist || null;
    const title = fields?.title || null;
    const year = fields?.year != null ? Number(fields.year) : null;

    // v2.10 has pickBestMoment & getTopByYear, plus correction flags.
    const best = safe(() => musicKB.pickBestMoment(text, { chart, artist, title, year }), null);

    // If year-only and no best, try Top40Weekly Top 100 ranking (peak)
    // (This is primarily handled in main thread by passing year-only text, but keep safe.)
    let ranked = null;
    if (!best && year != null && Number.isFinite(year)) {
      ranked = safe(() => musicKB.getTopByYear(year, 1), null);
    }

    // If artist/title provided with a year mismatch, return suggested years
    let years = [];
    if (artist && title) {
      years = yearsForArtistTitle(artist, title, chart);
    }

    return {
      best: best || (Array.isArray(ranked) && ranked[0] ? ranked[0] : null),
      years
    };
  }

  async function handleJob(job) {
    const id = job?.id;
    const op = job?.op;
    try {
      if (op === "stats") {
        parentPort.postMessage({ id, ok: true, out: computeStats() });
        return;
      }
      if (op === "query") {
        const out = queryKB(job?.text || "", job?.fields || {});
        parentPort.postMessage({ id, ok: true, out });
        return;
      }
      parentPort.postMessage({ id, ok: false, error: "Unknown op" });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: String(e?.message || e) });
    }
  }

  parentPort.on("message", handleJob);
  parentPort.postMessage({ ok: true, ready: true });
  return;
}

// =======================================================
// MAIN THREAD
// =======================================================
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));
app.options("*", cors());

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "nyx-wizard-v1.89-convo+smartfallback";
const DEFAULT_CHART = "Billboard Hot 100";
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 900);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const CLEANUP_EVERY_MS = 1000 * 60 * 10;

function sid() {
  try { return crypto.randomUUID(); }
  catch { return "sid_" + Date.now() + "_" + Math.random().toString(36).slice(2); }
}

function nowIso() { return new Date().toISOString(); }
function safeStr(x) { return String(x == null ? "" : x).trim(); }
function safeObj(x) { return x && typeof x === "object" ? x : {}; }

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of SESS.entries()) {
    if (!s?.lastSeen) continue;
    if (now - s.lastSeen > SESSION_TTL_MS) SESS.delete(k);
  }
}, CLEANUP_EVERY_MS).unref?.();

function normalizeUserText(text) {
  return safeStr(text).replace(/\s+/g, " ").trim();
}

function isYearOnlyLoose(text) {
  const t = normalizeUserText(text);
  return /^\W*(19\d{2}|20\d{2})\W*$/.test(t);
}

function extractYearLoose(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function parseChartFromText(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return null;

  // Year-end Top 100 intent
  if (/\btop\s*100\b|\btop100\b|\byear[-\s]?end\b|\byear\s*end\b/.test(t)) return "Top40Weekly Top 100";

  if (/\btop40weekly\b|\btop 40 weekly\b/.test(t)) return "Top40Weekly";
  if (/\bcanada\b|\brpm\b|\bcanada rpm\b/.test(t)) return "Canada RPM";
  if (/\buk\b|\buk singles\b|\buk singles chart\b/.test(t)) return "UK Singles Chart";
  if (/\bbillboard\b|\bhot 100\b|\bbillboard hot 100\b/.test(t)) return "Billboard Hot 100";

  return null;
}

function parseArtistTitle(text) {
  const t = safeStr(text);
  if (!t) return null;

  const normalized = t.replace(/[–—]/g, "-");
  const m = normalized.match(/^(.{2,}?)\s*-\s*(.{2,}?)$/);
  if (!m) return null;

  const artist = safeStr(m[1]);
  const title = safeStr(m[2]);
  if (!artist || !title) return null;
  if (/^\d{4}$/.test(artist)) return null;
  if (/^\d{4}$/.test(title)) return null;

  return { artist, title };
}

// ====== Fluid conversation helpers ======
function looksLikeMusicQuery(text) {
  const t = normalizeUserText(text);
  if (!t) return false;
  if (/\b(19\d{2}|20\d{2})\b/.test(t)) return true;
  if (parseArtistTitle(t)) return true;
  if (parseChartFromText(t)) return true;
  return false;
}

function isGreeting(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return false;
  return /^(hi|hey|hello|yo|what'?s up|whats up|good (morning|afternoon|evening))\b/.test(t);
}

function isHowAreYou(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\bhow are you\b|\bhow’s it going\b|\bhow's it going\b|\bhow are things\b|\bhow you doing\b/.test(t);
}

function isPositiveOrStatusReply(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return false;
  return /\b(good|great|fine|ok|okay|not bad|doing well|all good|awesome)\b/.test(t);
}

function send(res, sessionId, sess, step, reply, advance = false) {
  sess.lastReply = reply;
  sess.lastReplyStep = step;

  res.status(200).json({
    ok: true,
    reply,
    state: {
      mode: sess.currentLane,
      step,
      advance,
      slots: sess.laneDetail || {}
    },
    meta: {
      sessionId,
      build: BUILD_TAG,
      serverTime: nowIso()
    }
  });
}

function resolveSession(req) {
  const headerSid = safeStr(req.headers["x-session-id"]);
  const bodySid = safeStr(req.body?.sessionId);
  const metaSid = safeStr(req.body?.meta?.sessionId);
  const clientSid = metaSid || bodySid || headerSid;
  const key = clientSid || sid();

  let sess = SESS.get(key);
  if (!sess) {
    sess = {
      id: key,
      currentLane: "music_history",
      laneDetail: { chart: DEFAULT_CHART },
      dialogStage: "new",
      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    sess.lastSeen = Date.now();
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";
  sess.dialogStage = safeStr(sess.dialogStage) || "new";

  return { key, sess };
}

// =======================================================
// KB WORKER
// =======================================================
let KB_WORKER = null;
let KB_READY = false;
const PENDING = new Map();

function startKbWorker() {
  KB_READY = false;
  KB_WORKER = new Worker(__filename);

  KB_WORKER.on("message", (msg) => {
    if (msg?.ready) {
      KB_READY = true;
      return;
    }
    const id = msg?.id;
    if (!id) return;
    const p = PENDING.get(id);
    if (!p) return;
    PENDING.delete(id);
    p.resolve(msg);
  });

  KB_WORKER.on("error", () => { KB_READY = false; });
  KB_WORKER.on("exit", () => { KB_READY = false; });

  return KB_WORKER;
}

startKbWorker();

function kbCall(op, text, fields, timeoutMs) {
  return new Promise((resolve) => {
    const id = "job_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    const timer = setTimeout(() => {
      PENDING.delete(id);
      resolve({ id, ok: false, error: "timeout" });
    }, timeoutMs);

    PENDING.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg || { id, ok: false, error: "empty" });
      }
    });

    try {
      KB_WORKER.postMessage({ id, op, text, fields });
    } catch (e) {
      clearTimeout(timer);
      PENDING.delete(id);
      resolve({ id, ok: false, error: String(e?.message || e) });
    }
  });
}

// =======================================================
// COPY SAFE HELPERS
// =======================================================
function pickOne(arr, fallback) {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function correctionPreface(best) {
  if (!best) return "";
  if (best._correctedYear && best._inputYear != null) {
    return `Close — you said ${best._inputYear}, but this entry lands in ${best.year}. Here’s the closest match:\n\n`;
  }
  return "";
}

function yearPickFollowups(chart) {
  return [
    `Want another year? (Example: 1984, 1999, 2007)`,
    `Give me a different year — I’ll pull another #1 for ${chart}.`,
    `Pick a year and I’ll tune the dial.`
  ];
}

function musicContinuations(chart) {
  return [
    `Want the next hit in that year — or a different year?`,
    `Give me another artist + year, or just a year. (Chart: ${chart})`,
    `Say “top 100 1990” if you want year-end rankings.`
  ];
}

// =======================================================
// SMART MUSIC FLOW
// =======================================================
async function handleMusic(req, res, key, sess, rawText) {
  const text = normalizeUserText(rawText);

  const chartFromText = parseChartFromText(text);
  if (chartFromText) sess.laneDetail.chart = chartFromText;

  // YEAR-ONLY input => direct pick (never ask for artist/title)
  if (isYearOnlyLoose(text)) {
    const y = extractYearLoose(text);
    sess.laneDetail = { chart: sess.laneDetail.chart || DEFAULT_CHART, year: y };

    const kbResult = await kbCall("query", text, sess.laneDetail, KB_TIMEOUT_MS);
    if (!kbResult.ok) {
      return send(res, key, sess, "kb_timeout", "I’m loading the music library — try that year again in a moment.", false);
    }

    const best = kbResult?.out?.best || null;
    if (best) {
      const preface = correctionPreface(best);
      const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
      const followUp = pickOne(yearPickFollowups(chart), "Want another year?");
      return send(
        res,
        key,
        sess,
        "music_year_pick",
        `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`,
        true
      );
    }

    return send(
      res,
      key,
      sess,
      "music_year_nohit",
      `I don’t have a hit indexed for ${y} yet. Try another year (example: 1987) — or say “top 100” to use the Top40Weekly year-end list.`,
      false
    );
  }

  // Artist - Title path
  const at = parseArtistTitle(text);
  if (at) {
    sess.laneDetail.artist = at.artist;
    sess.laneDetail.title = at.title;
    const y = extractYearLoose(text);
    if (y) sess.laneDetail.year = y;
  } else {
    const y = extractYearLoose(text);
    if (y) sess.laneDetail.year = y;
  }

  const kbResult = await kbCall("query", text, sess.laneDetail, KB_TIMEOUT_MS);
  if (!kbResult.ok) {
    return send(res, key, sess, "kb_timeout", "I’m loading the music library — try again in a moment.", false);
  }

  const best = kbResult?.out?.best || null;
  const years = kbResult?.out?.years || null;

  if (best) {
    const preface = correctionPreface(best);
    const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
    const followUp = pickOne(musicContinuations(chart), "Want another pick?");
    return send(res, key, sess, "music_answer", `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`, true);
  }

  // Smarter fallback: suggest nearest available year for artist+title
  const inputYear = sess?.laneDetail?.year ? Number(sess.laneDetail.year) : null;
  const hasArtist = !!sess?.laneDetail?.artist;
  const hasTitle = !!sess?.laneDetail?.title;

  if (hasArtist && hasTitle && Array.isArray(years) && years.length) {
    const head = years.slice(0, 6).join(", ");
    const more = years.length > 6 ? ` (+${years.length - 6} more)` : "";
    return send(
      res,
      key,
      sess,
      "music_suggest_years",
      `I couldn’t match that entry for ${inputYear || "that year"}. I *do* see this song under: ${head}${more}.\n\nReply with one of those years — or say “Billboard Hot 100”, “UK Singles”, “Canada RPM”, or “Top40Weekly”.`,
      false
    );
  }

  return send(
    res,
    key,
    sess,
    "music_nohit",
    `Give me an artist + year (or a song title). If you want a different chart, say: Billboard Hot 100, UK Singles, Canada RPM, or Top40Weekly. (Current: ${sess.laneDetail.chart || DEFAULT_CHART}).`,
    false
  );
}

// =======================================================
// ROUTES
// =======================================================
app.get("/api/health", async (req, res) => {
  let stats = null;
  try {
    const out = await kbCall("stats", "", {}, 500);
    if (out && out.ok) stats = out.out || null;
  } catch (_) {}

  res.status(200).json({
    ok: true,
    service: "nyx-backend",
    build: BUILD_TAG,
    kbReady: !!KB_READY,
    kbStats: stats,
    serverTime: nowIso()
  });
});

app.post("/api/nyx", async (req, res) => {
  const { key, sess } = resolveSession(req);

  const rawText =
    safeStr(req.body?.message) ||
    safeStr(req.body?.text) ||
    safeStr(req.body?.input) ||
    "";

  // Fluid opening: greetings + "how are you" handled without stalling the flow
  if (sess.dialogStage === "new" && isGreeting(rawText) && !looksLikeMusicQuery(rawText)) {
    sess.dialogStage = "greeted";
    return send(res, key, sess, "greeting", "Good to see you. How are you doing today?", true);
  }

  if (sess.dialogStage === "greeted" && (isHowAreYou(rawText) || isPositiveOrStatusReply(rawText)) && !looksLikeMusicQuery(rawText)) {
    sess.dialogStage = "ready";
    return send(res, key, sess, "pleasantry", "Nice. Now—give me an artist + year (or a song title) and I’ll pull the chart moment.", true);
  }

  // Default lane: Music history flow (Wizard path)
  return handleMusic(req, res, key, sess, rawText);
});

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
});
