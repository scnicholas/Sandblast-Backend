/**
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.92-meta-fallback-debug
 *
 * v1.92 changes:
 * - Integrates musicKnowledge.pickRandomByYearWithMeta() when available (meta-aware fallback)
 * - getTopByYear(year, n, chart) now passes chart through (worker fix)
 * - Year-first top pick respects chart
 * - Adds GET /api/debug/last (safe session snapshot) for troubleshooting
 * - Keeps year-only guarantee, follow-up intelligence resilient
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

  function preferYearTopPick(year, chart) {
    const fn = musicKB?.getTopByYear;
    if (typeof fn !== "function") return null;
    const top = safe(() => fn(year, 10, chart || null), []);
    if (!Array.isArray(top) || top.length === 0) return null;

    // pick #1 if present (peak=1), else first entry
    let best = top[0];
    for (const m of top) {
      if (Number(m?.peak) === 1) { best = m; break; }
      if (Number(m?.rank) === 1) { best = m; break; }
      if (m?.is_number_one === true) { best = m; break; }
    }
    return best || null;
  }

  function randomByYearWithMeta(year, chart) {
    const fnMeta = musicKB?.pickRandomByYearWithMeta;
    if (typeof fnMeta === "function") {
      const r = safe(() => fnMeta(year, chart || null), null);
      if (r && typeof r === "object") {
        // expected { moment, meta }
        const moment = r.moment || null;
        const meta = r.meta || null;
        return { best: moment, meta };
      }
    }

    // Fallback if old musicKnowledge is present
    const randFn = musicKB?.pickRandomByYearFallback || musicKB?.pickRandomByYear;
    const best = (typeof randFn === "function" && Number.isFinite(Number(year)))
      ? safe(() => randFn(Number(year), chart || null), null)
      : null;

    return { best, meta: null };
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

      // ---------- stats ----------
      if (op === "stats") {
        const stats = computeStats();
        return parentPort.postMessage({ id, ok: true, out: { stats } });
      }

      // ---------- follow-up ops ----------
      if (op === "topByYear") {
        const year = Number(laneDetail?.year);
        const n = Number(laneDetail?.n || 10);
        const chart = laneDetail?.chart || null;

        const topFn = musicKB?.getTopByYear;
        const outTop = (typeof topFn === "function" && Number.isFinite(year))
          ? safe(() => topFn(year, n, chart), [])
          : [];

        return parentPort.postMessage({ id, ok: true, out: { top: Array.isArray(outTop) ? outTop : [] } });
      }

      if (op === "randomByYear") {
        const year = Number(laneDetail?.year);
        const chart = laneDetail?.chart || null;

        const r = (Number.isFinite(year)) ? randomByYearWithMeta(year, chart) : { best: null, meta: null };
        return parentPort.postMessage({ id, ok: true, out: { best: r.best, meta: r.meta } });
      }

      // ---------- default query ----------
      const out = {
        year: safe(() => musicKB.extractYear?.(text), null),
        artist: safe(() => musicKB.detectArtist?.(text), null),
        title: safe(() => musicKB.detectTitle?.(text), null),
        chart: safe(() => musicKB.normalizeChart?.(laneDetail?.chart), laneDetail?.chart || null),
        best: null,
        bestMeta: null,
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
      if (hasYear && !hasArtist && !hasTitle) {
        out.best = preferYearTopPick(slots.year, slots.chart);

        if (!out.best) {
          // meta-aware random for year-only
          const r = randomByYearWithMeta(slots.year, slots.chart);
          out.best = r.best || null;
          out.bestMeta = r.meta || null;
        }

        if (!out.best) {
          out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);
        }
      } else {
        out.best = safe(() => musicKB.pickBestMoment?.(null, slots), null);

        if (!out.best && hasArtist && hasTitle) {
          out.years = yearsForArtistTitle(slots.artist, slots.title, slots.chart);
        }

        // Relaxed retry: drop year
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

// Build truth: Render sets RENDER_GIT_COMMIT
const COMMIT_FULL = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "";
const COMMIT_SHORT = COMMIT_FULL ? String(COMMIT_FULL).slice(0, 7) : "";
const BUILD_TAG = COMMIT_SHORT
  ? `nyx-wizard-v1.92-${COMMIT_SHORT}`
  : "nyx-wizard-v1.92-meta-fallback-debug";

const DEFAULT_CHART = "Billboard Hot 100";
const KB_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS || 900);

// ---------------- SESSION ----------------
const SESS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const CLEANUP_EVERY_MS = 1000 * 60 * 10;

let LAST_DEBUG = {
  at: null,
  sessionId: null,
  step: null,
  requestText: null,
  laneDetail: null,
  lastPick: null,
  build: BUILD_TAG
};

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

function clampYearToStats(year, stats) {
  const y = Number(year);
  const min = stats && Number.isFinite(Number(stats.yearMin)) ? Number(stats.yearMin) : null;
  const max = stats && Number.isFinite(Number(stats.yearMax)) ? Number(stats.yearMax) : null;
  if (!Number.isFinite(y) || min == null || max == null) return null;
  if (y < min) return min;
  if (y > max) return max;
  return y;
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

// ====== Follow-up intelligence helpers ======
function isFollowupCommand(text) {
  const t = normalizeUserText(text).toLowerCase();
  if (!t) return false;

  return (
    /\btop\s*10\b/.test(t) ||
    /\btop\s*5\b/.test(t) ||
    /\b#\s*1\b|\b#1\b|\bnumber\s*one\b|\bno\.\s*1\b|\bno\s*1\b|\bno1\b/.test(t) ||
    /\b(surprise|random|pick one|another|next one|next|more)\b/.test(t) ||
    /\b(story|tell me more|why|context|behind it)\b/.test(t) ||
    /\b(same chart|switch chart|change chart|uk|canada|rpm|top40weekly|hot 100|billboard)\b/.test(t)
  );
}

function wantsTopN(text) {
  const t = normalizeUserText(text).toLowerCase();
  const m = t.match(/\btop\s*(\d{1,2})\b/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 100) return n;
  }
  if (/\btop\s*10\b/.test(t)) return 10;
  if (/\btop\s*5\b/.test(t)) return 5;
  return null;
}

function wantsNumberOne(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b#\s*1\b|\b#1\b|\bnumber\s*one\b|\bno\.\s*1\b|\bno\s*1\b|\bno1\b/.test(t);
}

function wantsAnother(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b(another|next one|next|more|give me another|one more)\b/.test(t);
}

function wantsSurprise(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b(surprise|random|pick one)\b/.test(t);
}

function wantsStory(text) {
  const t = normalizeUserText(text).toLowerCase();
  return /\b(story|tell me more|why|context|behind it)\b/.test(t);
}

// ====== Fluid conversation helpers ======
function looksLikeMusicQuery(text, sess) {
  const t = normalizeUserText(text);
  if (!t) return false;

  if (/\b(19\d{2}|20\d{2})\b/.test(t)) return true;
  if (parseArtistTitle(t)) return true;
  if (parseChartFromText(t)) return true;

  const hasMusicContext =
    !!sess?.laneDetail?.year || !!sess?.laneDetail?.artist || !!sess?.laneDetail?.title || !!sess?.lastPick;
  if (hasMusicContext && isFollowupCommand(t)) return true;

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

function send(res, sessionId, sess, step, reply, advance = false, debugText = null) {
  sess.lastReply = reply;
  sess.lastReplyStep = step;

  // Update debug snapshot (safe)
  LAST_DEBUG = {
    at: nowIso(),
    sessionId,
    step,
    requestText: debugText,
    laneDetail: sess.laneDetail || null,
    lastPick: sess.lastPick || null,
    build: BUILD_TAG
  };

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
      commit: COMMIT_SHORT || null,
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
      lastSeen: Date.now(),
      lastPick: null
    };
    SESS.set(key, sess);
  } else {
    sess.lastSeen = Date.now();
  }

  sess.laneDetail = safeObj(sess.laneDetail);
  sess.laneDetail.chart = safeStr(sess.laneDetail.chart) || DEFAULT_CHART;
  sess.currentLane = safeStr(sess.currentLane) || "music_history";
  sess.dialogStage = safeStr(sess.dialogStage) || "new";
  sess.lastPick = sess.lastPick && typeof sess.lastPick === "object" ? sess.lastPick : null;

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

// Cache stats for fast year-range fallback
let KB_STATS_CACHE = null;
let KB_STATS_LAST = 0;
const KB_STATS_REFRESH_MS = 1000 * 60 * 5;

async function ensureKbStatsFresh() {
  const now = Date.now();
  if (KB_STATS_CACHE && (now - KB_STATS_LAST) < KB_STATS_REFRESH_MS) return KB_STATS_CACHE;
  const stats = await kbStats(700).catch(() => null);
  if (stats) {
    KB_STATS_CACHE = stats;
    KB_STATS_LAST = now;
  }
  return KB_STATS_CACHE;
}

// =======================================================
// COPY + CONTINUATIONS
// =======================================================
function pickOne(arr, fallback = "") {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function correctionPreface(best, bestMeta) {
  if (!best || typeof best !== "object") return "";

  const inputYear = best._originalYear || best._inputYear || best._input_year || null;
  const inputChart = best._originalChart || best._inputChart || null;

  const parts = [];

  if (best._correctedYear && inputYear && best.year && Number(inputYear) !== Number(best.year)) {
    parts.push(`Quick correction — anchoring to ${best.year} (not ${inputYear}).`);
  }

  // Explicit chart correction flags (legacy path)
  if (best._correctedChart && inputChart && best.chart && String(inputChart) !== String(best.chart)) {
    parts.push(`Chart note — using ${best.chart} (not ${inputChart}).`);
  }

  // Meta-aware fallback note (new path)
  if (!best._correctedChart && bestMeta && typeof bestMeta === "object") {
    if (bestMeta.usedFallback && bestMeta.requestedChart && bestMeta.usedChart && String(bestMeta.usedChart) !== String(bestMeta.requestedChart)) {
      parts.push(`Chart note — no entries on ${bestMeta.requestedChart} for that year, so I pulled from ${bestMeta.usedChart}.`);
    }
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

  if (around != null) {
    unique.sort((a, b) => Math.abs(a - around) - Math.abs(b - around));
  }
  const head = unique.slice(0, 6);
  const closest = around != null ? head[0] : head[0];

  return { closest, list: head.sort((a, b) => a - b), total: unique.length };
}

// =======================================================
// SMART MUSIC FLOW (with follow-up intelligence + year guarantee)
// =======================================================
async function handleMusic(req, res, key, sess, rawText) {
  const text = normalizeUserText(rawText);

  const chartFromText = parseChartFromText(text);
  if (chartFromText) sess.laneDetail.chart = chartFromText;

  // --- FOLLOW-UP COMMANDS (no year typed, but we have context) ---
  const ctxYearFromSlots = sess?.laneDetail?.year ? Number(sess.laneDetail.year) : null;
  const ctxYearFromLastPick = sess?.lastPick?.year ? Number(sess.lastPick.year) : null;
  const ctxYear = Number.isFinite(ctxYearFromSlots) ? ctxYearFromSlots : (Number.isFinite(ctxYearFromLastPick) ? ctxYearFromLastPick : null);

  const ctxChart = sess?.laneDetail?.chart || DEFAULT_CHART;

  if (!isYearOnlyLoose(text) && !parseArtistTitle(text) && ctxYear && isFollowupCommand(text)) {
    const n = wantsTopN(text);
    const wants1 = wantsNumberOne(text);
    const wantsMore = wantsAnother(text) || wantsSurprise(text);
    const wantsWhy = wantsStory(text);

    // Top N list
    if (n || wants1) {
      const wantedN = wants1 ? 1 : n;
      const kbTop = await kbCall("topByYear", "", { year: ctxYear, n: wantedN, chart: ctxChart }, KB_TIMEOUT_MS);
      if (!kbTop.ok) {
        return send(res, key, sess, "kb_timeout", "I’m loading the charts — try that again in a moment.", false, text);
      }
      const list = Array.isArray(kbTop?.out?.top) ? kbTop.out.top : [];
      if (!list.length) {
        // fallback to Top40Weekly Top 100 for the same year
        const kbTop2 = await kbCall("topByYear", "", { year: ctxYear, n: wantedN, chart: "Top40Weekly Top 100" }, KB_TIMEOUT_MS);
        const list2 = Array.isArray(kbTop2?.out?.top) ? kbTop2.out.top : [];
        if (!list2.length) {
          return send(res, key, sess, "music_top_nohit", `I don’t have a Top list indexed for ${ctxYear} yet. Try another year (example: 1987).`, false, text);
        }

        if (wantedN === 1) {
          const best2 = list2[0];
          sess.lastPick = { artist: best2.artist, title: best2.title, year: best2.year, chart: best2.chart };
          return send(
            res, key, sess, "music_number_one",
            `${best2.artist} — "${best2.title}" (${best2.year})\nChart: ${best2.chart || "Top40Weekly Top 100"}\n\nWant the **Top 10**, another pick, or switch charts?`,
            true,
            text
          );
        }

        const lines2 = list2.map((m, i) => `${i + 1}. ${m.artist} — "${m.title}"`);
        return send(
          res, key, sess, "music_top_list",
          `Top ${wantedN} for ${ctxYear} (Top40Weekly Top 100):\n${lines2.join("\n")}\n\nWant **#1**, a **surprise pick**, or jump to a new year?`,
          true,
          text
        );
      }

      if (wantedN === 1) {
        const best = list[0];
        sess.lastPick = { artist: best.artist, title: best.title, year: best.year, chart: best.chart };
        const chart = best.chart || ctxChart;
        return send(
          res,
          key,
          sess,
          "music_number_one",
          `${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\nWant the **Top 10**, another pick, or switch charts?`,
          true,
          text
        );
      }

      const lines = list.map((m, i) => `${i + 1}. ${m.artist} — "${m.title}"`);
      return send(
        res,
        key,
        sess,
        "music_top_list",
        `Top ${wantedN} for ${ctxYear} (${ctxChart} preference):\n${lines.join("\n")}\n\nWant **#1**, a **surprise pick**, or jump to a new year?`,
        true,
        text
      );
    }

    // Another / Surprise pick in same year
    if (wantsMore) {
      let tries = 0;
      let best = null;

      while (tries < 5 && !best) {
        const kbRand = await kbCall("randomByYear", "", { year: ctxYear, chart: ctxChart }, KB_TIMEOUT_MS);
        if (!kbRand.ok) break;
        const candidate = kbRand?.out?.best || null;
        if (!candidate) break;

        const last = sess.lastPick;
        if (last && candidate.artist === last.artist && candidate.title === last.title && Number(candidate.year) === Number(last.year)) {
          tries++;
          continue;
        }
        best = candidate;
      }

      if (!best) {
        return send(res, key, sess, "music_more_nohit", `I couldn’t pull another pick for ${ctxYear} just yet. Try “top 10” or switch year (example: 1987).`, false, text);
      }

      sess.lastPick = { artist: best.artist, title: best.title, year: best.year, chart: best.chart };
      const chart = best.chart || ctxChart;
      return send(
        res,
        key,
        sess,
        "music_another_pick",
        `${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\nWant **top 10**, **#1**, or another surprise?`,
        true,
        text
      );
    }

    // Story / context (lightweight)
    if (wantsWhy && sess.lastPick) {
      const lp = sess.lastPick;
      return send(
        res,
        key,
        sess,
        "music_story_light",
        `Quick context for **${lp.artist} — "${lp.title}" (${lp.year})**:\nIt’s one of those “time-capsule” tracks — the kind that defines the texture of the year.\n\nWant the **Top 10**, **#1**, or should I throw you another pick from ${lp.year}?`,
        true,
        text
      );
    }

    return send(
      res,
      key,
      sess,
      "music_followup_help",
      `For ${ctxYear}, say **top 10**, **#1**, **another**, or switch charts (UK / Canada / Top40Weekly).`,
      true,
      text
    );
  }

  // YEAR-ONLY input => direct pick (never ask for artist/title)
  if (isYearOnlyLoose(text)) {
    const y = extractYearLoose(text);
    sess.laneDetail = { chart: sess.laneDetail.chart || DEFAULT_CHART, year: y };

    // 1) Query path (worker will do year-first + meta-aware random)
    const kbResult = await kbCall("query", text, sess.laneDetail, KB_TIMEOUT_MS);
    if (!kbResult.ok) {
      return send(res, key, sess, "kb_timeout", "I’m loading the music library — try that year again in a moment.", false, text);
    }

    let best = kbResult?.out?.best || null;
    let bestMeta = kbResult?.out?.bestMeta || null;

    // 2) If no hit: try randomByYear op (meta-aware)
    if (!best) {
      const kbRand = await kbCall("randomByYear", "", { year: y, chart: sess.laneDetail.chart }, KB_TIMEOUT_MS);
      if (kbRand?.ok) {
        best = kbRand?.out?.best || null;
        bestMeta = kbRand?.out?.meta || null;
      }
    }

    // 3) If still no hit: clamp to closest available year, randomByYear meta-aware
    if (!best) {
      const stats = await ensureKbStatsFresh();
      const closest = clampYearToStats(y, stats);
      if (closest != null) {
        const kbClosest = await kbCall("randomByYear", "", { year: closest, chart: sess.laneDetail.chart }, KB_TIMEOUT_MS);
        if (kbClosest?.ok) {
          best = kbClosest?.out?.best || null;
          bestMeta = kbClosest?.out?.meta || null;
          if (best && closest !== y) {
            best._correctedYear = true;
            best._originalYear = y;
          }
        }
      }
    }

    if (best) {
      sess.lastPick = { artist: best.artist, title: best.title, year: best.year, chart: best.chart };
      const preface = correctionPreface(best, bestMeta);
      const chart = best.chart || (bestMeta?.usedChart) || sess.laneDetail.chart || DEFAULT_CHART;
      const followUp = pickOne(yearPickFollowups(chart), "Want another year?");
      return send(
        res,
        key,
        sess,
        "music_year_pick",
        `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`,
        true,
        text
      );
    }

    const stats2 = await ensureKbStatsFresh();
    const min = stats2?.yearMin;
    const max = stats2?.yearMax;
    const rangeNote = (Number.isFinite(min) && Number.isFinite(max))
      ? ` I currently have coverage from about ${min} to ${max}.`
      : "";

    return send(
      res,
      key,
      sess,
      "music_year_nohit",
      `I don’t have a hit indexed for ${y} yet.${rangeNote} Try another year — or say “top 100” to use the Top40Weekly year-end list.`,
      false,
      text
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
    return send(res, key, sess, "kb_timeout", "I’m loading the music library — try again in a moment.", false, text);
  }

  const best = kbResult?.out?.best || null;
  const years = kbResult?.out?.years || null;

  if (best) {
    sess.lastPick = { artist: best.artist, title: best.title, year: best.year, chart: best.chart };
    const preface = correctionPreface(best, null);
    const chart = best.chart || sess.laneDetail.chart || DEFAULT_CHART;
    const followUp = pickOne(musicContinuations(chart), "Want another pick?");
    return send(res, key, sess, "music_answer", `${preface}${best.artist} — "${best.title}" (${best.year})\nChart: ${chart}\n\n${followUp}`, true, text);
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
        `I might have you a year off.\nI do have **${sess.laneDetail.artist} — "${sess.laneDetail.title}"** in: ${listText}${suggestion.total > suggestion.list.length ? " …" : ""}\n\nReply with just **${suggestion.closest}** and I’ll anchor it and keep rolling.`,
        true,
        text
      );
    }
  }

  return send(
    res,
    key,
    sess,
    "music_not_found",
    `I didn’t lock that in yet — but we can still get there.\nTry:\n• **1984** (year-only)\n• **Artist - Title** (example: Styx - Babe)\n• add “top 100” if you want the year-end list`,
    false,
    text
  );
}

// =======================================================
// ROUTES
// =======================================================
app.post("/api/sandblast-gpt", async (req, res) => {
  const text = safeStr(req.body?.message);
  const { key, sess } = resolveSession(req);

  if (!text) {
    return send(res, key, sess, "empty", "Send a year (example: 1984) or Artist - Title (optional year).", false, text);
  }

  const t = normalizeUserText(text);
  const musicish = looksLikeMusicQuery(t, sess);

  // Fluid conversation layer (only when it's not clearly a music query)
  if (!musicish) {
    if (sess.dialogStage === "new" && isGreeting(t)) {
      sess.dialogStage = "asked_how_are_you";
      return send(res, key, sess, "greet_1", pickOne([
        "Hey — good to see you. How are you doing today?",
        "Hi there. How’s your day going so far?",
        "Hey. How are you feeling today?"
      ], "Hey — how are you today?"), true, t);
    }

    if (sess.dialogStage === "asked_how_are_you" && (isPositiveOrStatusReply(t) || t.length <= 50)) {
      sess.dialogStage = "ready";
      return send(res, key, sess, "greet_2", pickOne([
        "Love that. What can I help you with today? If it’s music, give me a year like **1984** or **Artist - Title**.",
        "Good — let’s make progress. What do you want to do today? For music: **1984** or **Artist - Title**.",
        "Alright. What are we working on? If you want music, hit me with **1984** or **Artist - Title**."
      ], "Got it. What can I help you with?"), true, t);
    }

    if (isHowAreYou(t) && sess.dialogStage !== "ready") {
      sess.dialogStage = "ready";
      return send(res, key, sess, "greet_howareyou", "I’m good — focused and ready to work. What do you want to do next? For music: **1984** or **Artist - Title**.", true, t);
    }
  }

  if (sess.dialogStage !== "ready") sess.dialogStage = "ready";
  return handleMusic(req, res, key, sess, t);
});

app.get("/api/health", async (_, res) => {
  const stats = await kbStats(700).catch(() => null);
  res.json({
    ok: true,
    build: BUILD_TAG,
    commit: COMMIT_SHORT || null,
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

// Debug snapshot (safe): last request/session summary
app.get("/api/debug/last", (req, res) => {
  const token = safeStr(req.query?.token || "");
  const expected = safeStr(process.env.DEBUG_TOKEN || "");

  // If you set DEBUG_TOKEN, require it. If not set, allow (internal use).
  if (expected && token !== expected) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  res.json({ ok: true, ...LAST_DEBUG });
});

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} (${BUILD_TAG}) timeout=${KB_TIMEOUT_MS}ms`);
  startKbWorker();

  // warm stats cache (best-effort)
  ensureKbStatsFresh().catch(() => {});
});
