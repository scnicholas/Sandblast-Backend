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
    return Array.isArray(years) ? years.slice(0, 50) : [];
  }

  function preferYearTopPick(year) {
    const fn = musicKB?.getTopByYear;
    if (typeof fn !== "function") return null;
    const top = safe(() => fn(year, 10), []);
    if (!Array.isArray(top) || top.length === 0) return null;
    // pick #1 if present (peak=1), else first entry
    let best = top[0];
    for (const m of top) {
      if (Number(m?.peak) === 1) { best = m; break; }
    }
    return best || null;
  }

  function handleJob(msg) {
    const id = msg && msg.id;
    const op = String(msg && msg.op ? msg.op : "query");
    const text = String(msg && msg.text ? msg.text : "").trim();
    const laneDetail =
      (msg && msg.laneDetail && typeof msg.laneDetail === "object") ? msg.laneDetail : {};

    if (!id) return;

    try {
      if (!musicKB) {
        musicKB = require("./Utils/musicKnowledge");
      }

      if (op === "stats") {
        const stats = computeStats();
        return parentPort.postMessage({ id, ok: true, out: { stats } });
      }

      const out = {
        year: safe(() => musicKB.extractYear?.(text), null),
        artist: safe(() => musicKB.detectArtist?.(text), null),
        title: safe(() => musicKB.detectTitle?.(text), null),
        chart: safe(() => musicKB.normalizeChart?.(laneDetail?.chart), laneDetail?.chart || null),
        best: null,
        years: null
      };

      const slots = { ...(laneDetail || {}) };
      if (out.chart) slots.chart = out.chart;
      if (out.year) slots.year = out.year;
      if (out.artist && !slots.artist) slots.artist = out.artist;
      if (out.title && !slots.title) slots.title = out.title;

      const hasYear = !!slots.year;
      const hasArtist = !!slots.artist;
      const hasTitle = !!slots.title;

      // YEAR-FIRST:
      // If user gives only a year, prefer Top40Weekly Top 100 year-end pick first.
      if (hasYear && !hasArtist && !hasTitle) {
        out.best = preferYearTopPick(slots.year);

        if (!out.best) {
          const randFn = musicKB.pickRandomByYear;
          if (typeof randFn === "function") {
            out.best = safe(() => randFn(slots.year, slots.chart), null);
          }
        }
        if (!out.best) {
          out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);
        }
      } else {
        out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

        // If we have artist+title and user supplied a year, provide year options when not found.
        if (!out.best && hasArtist && hasTitle) {
          out.years = yearsForArtistTitle(slots.artist, slots.title, slots.chart);
        }

        // Relaxed retry: artist+title+year mismatch -> drop year
        if (!out.best && hasArtist && hasTitle && hasYear) {
          const relaxed = { ...slots };
          delete relaxed.year;

          const relaxedBest = safe(() => musicKB.pickBestMoment?.(null, relaxed), null);
          if (relaxedBest) {
            const corrected = { ...relaxedBest };
            corrected._correctedYear = true;
            corrected._originalYear = slots.year;
            out.best = corrected;
          }
        }

        // Secondary relaxed retry: drop year + chart
        if (!out.best && hasArtist && hasTitle && hasYear && slots.chart) {
          const relaxed2 = { ...slots };
          delete relaxed2.year;
          delete relaxed2.chart;

          const relaxedBest2 = safe(() => musicKB.pickBestMoment?.(null, relaxed2), null);
          if (relaxedBest2) {
            const corrected2 = { ...relaxedBest2 };
            corrected2._correctedYear = true;
            corrected2._originalYear = slots.year;
            corrected2._correctedChart = true;
            corrected2._originalChart = slots.chart;
            out.best = corrected2;
          }
        }

        // After relaxed retries, if still nothing, re-offer year options (chartless) if possible
        if (!out.best && hasArtist && hasTitle && (!out.years || out.years.length === 0)) {
          out.years = yearsForArtistTitle(slots.artist, slots.title, null);
        }
      }

      parentPort.postMessage({ id, ok: true, out });
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
    const pending = PENDING.get(msg?.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    PENDING.delete(msg.id);
    pending.resolve(msg);
  });

  KB_WORKER.on("exit", () => {
    KB_READY = false;
    KB_WORKER = null;
    for (const [id, p] of PENDING.entries()) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: "KB_WORKER_EXIT" });
    }
    PENDING.clear();
    setTimeout(startKbWorker, 250).unref?.();
  });
}

function ensureKbWorker() {
  if (!KB_WORKER) startKbWorker();
  return !!KB_WORKER;
}

function kbCall(op, text, laneDetail, timeoutMs) {
  return new Promise((resolve) => {
    if (!ensureKbWorker()) return resolve({ ok: false, error: "KB_WORKER_NOT_AVAILABLE" });

    const id = "q_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      PENDING.delete(id);
      resolve({ ok: false, timedOut: true });
    }, timeoutMs);

    PENDING.set(id, { resolve, timer });

    try {
      KB_WORKER.postMessage({ id, op, text, laneDetail });
    } catch {
      clearTimeout(timer);
      PENDING.delete(id);
      resolve({ ok: false, error: "KB_POST_FAILED" });
    }
  });
}

async function kbStats(timeoutMs = 700) {
  const r = await kbCall("stats", "", {}, timeoutMs);
  return r?.ok ? r?.out?.stats : null;
}

// =======================================================
// COPY + CONTINUATIONS
// =======================================================
function pickOne(arr, fallback = "") {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function correctionPreface(best) {
  if (!best || typeof best !== "object") return "";

  // compatible with both index.js relaxed flags and musicKnowledge v2.10 flags
  const inputYear = best._originalYear || best._inputYear || best._input_year || null;
  const inputChart = best._originalChart || best._inputChart || null;

  const parts = [];

  if (best._correctedYear && inputYear && best.year && Number(inputYear) !== Number(best.year)) {
    parts.push(`Quick correction — anchoring to ${best.year} (not ${inputYear}).`);
  }
  if (best._correctedChart && inputChart && best.chart && String(inputChart) !== String(best.chart)) {
    parts.push(`Chart note — using ${best.chart} (not ${inputChart}).`);
  }

  return parts.length ? (parts.join(" ") + "\n\n") : "";
}

function yearPickFollowups(chart) {
  const c = chart || DEFAULT_CHART;
  return [
    `Want the **Top 10** for that year, the **#1**, or a **surprise pick**?`,
    `Stay on ${c}, or switch charts (UK / Canada / Top40Weekly)?`,
    `Same artist, or new artist?`,
    `Want the story behind it, or another pick?`
  ];
}

function musicContinuations(chart) {
  const c = chart || DEFAULT_CHART;
  return [
    `Want another from the same year, or should we jump? (Example: 1987)`,
    `Same chart, or switch? (Current: ${c})`,
    `Same artist, or new artist?`,
    `Want the story behind this song, or another pick?`
  ];
}

function formatYearsForSuggestion(years, inputYear) {
  if (!Array.isArray(years) || years.length === 0) return null;

  const unique = Array.from(new Set(years.filter((y) => Number.isFinite(Number(y))).map((y) => Number(y)))).sort((a, b) => a - b);
  if (unique.length === 0) return null;

  const around = Number.isFinite(Number(inputYear)) ? Number(inputYear) : null;

  // show up to 6 years, biased around inputYear if present
  if (around != null) {
    unique.sort((a, b) => Math.abs(a - around) - Math.abs(b - around));
  }
  const head = unique.slice(0, 6);
  const closest = around != null ? head[0] : head[0];

  return { closest, list: head.sort((a, b) => a - b), total: unique.length };
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

  if (hasArtist && hasTitle) {
    const suggestion = formatYearsForSuggestion(years, inputYear);
    if (suggestion) {
      const listText = suggestion.list.join(", ");
      return send(
        res,
        key,
        sess,
        "music_suggest_years",
        `I might have you a year off.\nI do have **${sess.laneDetail.artist} — "${sess.laneDetail.title}"** in: ${listText}${suggestion.total > suggestion.list.length ? " …" : ""}\n\nIf you want, reply with just **${suggestion.closest}** and I’ll anchor it and keep rolling.`,
        true
      );
    }
  }

  return send(
    res,
    key,
    sess,
    "music_not_found",
    `I didn’t lock that in yet — but we can still get there.\nTry:\n• **1984** (year-only)\n• **Artist - Title** (example: Styx - Babe)\n• add “top 100” if you want the year-end list`,
    false
  );
}

// =======================================================
// ROUTES
// =======================================================
app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const { key, sess } = resolveSession(req);

  if (!text) {
    return send(res, key, sess, "empty", "Send a year (example: 1984) or Artist - Title (optional year).", false);
  }

  // Fluid conversation layer (only when it's not clearly a music query)
  const t = normalizeUserText(text);
  const musicish = looksLikeMusicQuery(t);

  if (!musicish) {
    // stage 1: greeting
    if (sess.dialogStage === "new" && isGreeting(t)) {
      sess.dialogStage = "asked_how_are_you";
      return send(res, key, sess, "greet_1", pickOne([
        "Hey — good to see you. How are you doing today?",
        "Hi there. How’s your day going so far?",
        "Hey. How are you feeling today?"
      ], "Hey — how are you today?"), true);
    }

    // stage 2: user replies about their day
    if (sess.dialogStage === "asked_how_are_you" && (isPositiveOrStatusReply(t) || t.length <= 50)) {
      sess.dialogStage = "ready";
      return send(res, key, sess, "greet_2", pickOne([
        "Love that. What can I help you with today? If it’s music, give me a year like **1984** or **Artist - Title**.",
        "Good — let’s make progress. What do you want to do today? For music: **1984** or **Artist - Title**.",
        "Alright. What are we working on? If you want music, hit me with **1984** or **Artist - Title**."
      ], "Got it. What can I help you with?"), true);
    }

    // generic “how are you”
    if (isHowAreYou(t) && sess.dialogStage !== "ready") {
      sess.dialogStage = "ready";
      return send(res, key, sess, "greet_howareyou", "I’m good — focused and ready to work. What do you want to do next? For music: **1984** or **Artist - Title**.", true);
    }
  }

  // Once conversation stage is ready (or user gave a music query), handle music.
  if (sess.dialogStage !== "ready") sess.dialogStage = "ready";
  return handleMusic(req, res, key, sess, t);
});

app.get("/api/health", async (_, res) => {
  const stats = await kbStats(700).catch(() => null);
  res.json({
    ok: true,
    build: BUILD_TAG,
    serverTime: nowIso(),
    kbTimeoutMs: KB_TIMEOUT_MS,
    kbWorkerReady: KB_READY,
    kbMoments: stats ? stats.moments : null,
    kbYearMin: stats ? stats.yearMin : null,
    kbYearMax: stats ? stats.yearMax : null,
    kbCharts: stats ? stats.charts : null,
    kbError: stats && stats.error ? stats.error : null
  });
});

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();
});
