/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.89-smartfallback
 *
 * v1.89 changes:
 * - Smarter music fallback:
 *    - If artist+title+year mismatch: propose nearest available year(s) instead of blunt "not found"
 *    - If artist+title provided (no exact match): suggest available years
 * - Adds Top40Weekly Top 100 chart parsing + normalization support
 * - Keeps /api/health KB stats + worker stats op
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

  function nearestYearFromList(years, targetYear) {
    const y = Number(targetYear);
    if (!Array.isArray(years) || years.length === 0 || !Number.isFinite(y)) return null;

    let best = null;
    let bestDist = Infinity;
    for (const yr of years) {
      const n = Number(yr);
      if (!Number.isFinite(n)) continue;
      const d = Math.abs(n - y);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
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

        // NEW: fallback intelligence signals
        candidateYears: null,
        nearestYear: null
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
      if (hasYear && !hasArtist && !hasTitle) {
        const randFn = musicKB.pickRandomByYear;
        if (typeof randFn === "function") {
          out.best = safe(() => randFn(slots.year, slots.chart), null);
        }
        if (!out.best) {
          out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);
        }
      } else {
        out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

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
      }

      // NEW: if still no match, compute candidate years for artist+title
      if (!out.best && hasArtist && hasTitle && typeof musicKB.findYearsForArtistTitle === "function") {
        const years = safe(() => musicKB.findYearsForArtistTitle(slots.artist, slots.title, slots.chart), []);
        out.candidateYears = Array.isArray(years) ? years.slice(0, 20) : null;
        if (hasYear && Array.isArray(out.candidateYears) && out.candidateYears.length) {
          out.nearestYear = nearestYearFromList(out.candidateYears, slots.year);
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
const BUILD_TAG = "nyx-wizard-v1.89-smartfallback";
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

  // Explicit year-end Top100
  if (/\btop40weekly\b.*\b(top\s*100|top100|year[- ]?end)\b/.test(t)) return "Top40Weekly Top 100";
  if (/\b(top\s*100|top100|year[- ]?end)\b.*\btop40weekly\b/.test(t)) return "Top40Weekly Top 100";

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

function correctionPreface(best) {
  if (!best || typeof best !== "object") return "";
  const parts = [];

  const originalYear = best._inputYear || best._originalYear || null;
  if (best._correctedYear && originalYear && best.year && originalYear !== best.year) {
    parts.push(`Quick correction — anchoring to ${best.year} (not ${originalYear}).`);
  }
  if (best._correctedChart && best._originalChart && best.chart && best._originalChart !== best.chart) {
    parts.push(`Chart note — using ${best.chart} (not ${best._originalChart}).`);
  }

  return parts.length ? (parts.join(" ") + "\n\n") : "";
}

function pickOne(arr, fallback = "") {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
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
      lastSeen: Date.now()
    };
    SESS.set(key, sess);
  } else {
    sess.lastSeen = Date.now();
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";

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
// SMART YEAR FLOW (basic: relies on musicKnowledge methods)
// =======================================================
function formatYearSuggestions(candidateYears, nearestYear) {
  const years = Array.isArray(candidateYears) ? candidateYears.filter((y) => Number.isFinite(Number(y))) : [];
  if (!years.length) return null;

  const show = years.slice(0, 6).join(", ");
  if (nearestYear != null) {
    return `Closest match year: ${nearestYear}. Other available years: ${show}.`;
  }
  return `Available years I can anchor for that track: ${show}.`;
}

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
      const followUp = pickOne(musicContinuations(chart), "Want another year?");
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
      `I don’t have a hit indexed for ${y} yet on this chart. Try another year (example: 1987) — or switch chart (UK / Canada / Top40Weekly / Top40Weekly Top 100).`,
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
  if (best) {
    const preface = correctionPreface(best);
    const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
    const followUp = pickOne(musicContinuations(chart), "Want another pick?");
    return send(res, key, sess, "music_answer", `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`, true);
  }

  // NEW: smart fallback if we have candidate years for artist+title
  const candidateYears = kbResult?.out?.candidateYears || null;
  const nearestYear = kbResult?.out?.nearestYear ?? null;

  if (sess.laneDetail?.artist && sess.laneDetail?.title && Array.isArray(candidateYears) && candidateYears.length) {
    const sug = formatYearSuggestions(candidateYears, nearestYear);
    const userYear = sess.laneDetail?.year ? Number(sess.laneDetail.year) : null;

    const prompt = userYear && Number.isFinite(userYear) && nearestYear != null
      ? `I don’t have ${sess.laneDetail.artist} — "${sess.laneDetail.title}" for ${userYear}. ${sug}\n\nReply with the year you want (or say “use ${nearestYear}”).`
      : `I can’t lock the exact match yet, but I can anchor it cleanly. ${sug}\n\nReply with the year you want.`;

    return send(res, key, sess, "music_smart_fallback", prompt, false);
  }

  // Final fallback (still softer, and gives a clear next step)
  return send(
    res,
    key,
    sess,
    "music_not_found",
    `I’m not seeing a clean match yet.\nTry: Artist - Title (example: Styx - Babe) or just a year (example: 1984).`,
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

  return handleMusic(req, res, key, sess, text);
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
