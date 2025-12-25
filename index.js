'use strict';

/* ============================
   NYX BOOT CRASH LOG (MUST BE FIRST)
   ============================ */
const fs = require('fs');
const path = require('path');

const NYX_LOG_PATH = path.join(__dirname, 'nyx-fatal.log');

function _safeString(x) {
  try {
    if (typeof x === 'string') return x;
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function _crashLog(...args) {
  try {
    const line =
      `[${new Date().toISOString()}] ` +
      args.map(_safeString).join(' ') +
      '\n';
    fs.appendFileSync(NYX_LOG_PATH, line, 'utf8');
  } catch (_) {
    // last resort: do nothing
  }
}

_crashLog('BOOT', {
  pid: process.pid,
  node: process.version,
  cwd: process.cwd(),
  __dirname,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  ENV: process.env.ENV
});

process.on('beforeExit', (code) => _crashLog('BEFORE_EXIT', { code }));
process.on('exit', (code) => _crashLog('PROCESS_EXIT', { code }));

['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((sig) => {
  try {
    process.on(sig, () => {
      _crashLog('SIGNAL', { sig });
      process.exit(0);
    });
  } catch (_) {}
});

process.on('uncaughtException', (err) => {
  _crashLog('UNCAUGHT_EXCEPTION', { message: err?.message, stack: err?.stack });
  try { console.error('[Nyx] uncaughtException:', err); } catch (_) {}
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  _crashLog('UNHANDLED_REJECTION', { message: err?.message, stack: err?.stack });
  try { console.error('[Nyx] unhandledRejection:', err); } catch (_) {}
  process.exit(1);
});

/* ============================
   (Your banner comment can live below)
   ============================ */
/**
<<<<<<< Updated upstream
 * Sandblast Backend — Nyx Intelligence Layer
 * Hardened Orchestrator + Music Flow V1 (KB-backed)
=======
 * index.js — Nyx Broadcast Backend (Wizard-Locked)
 * Build: nyx-wizard-v1.92-meta-fallback-debug
 *
 * v1.92 changes:
 * - Integrates musicKnowledge.pickRandomByYearWithMeta() when available (meta-aware fallback)
 * - getTopByYear(year, n, chart) now passes chart through (worker fix)
 * - Year-first top pick respects chart
 * - Adds GET /api/debug/last (safe session snapshot) for troubleshooting
 * - Keeps year-only guarantee, follow-up intelligence resilient
>>>>>>> Stashed changes
 */

// -----------------------------
// NORMAL REQUIRES
// -----------------------------
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const net = require('net');

let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); } catch (e) { _crashLog('REQUIRE_FAIL intentClassifier', { message: e?.message }); }
try { musicKnowledge = require('./Utils/musicKnowledge'); } catch (e) { _crashLog('REQUIRE_FAIL musicKnowledge', { message: e?.message }); }

<<<<<<< Updated upstream
=======
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
>>>>>>> Stashed changes
const app = express();
app.disable('x-powered-by');

// -----------------------------
// CONFIG
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '0.0.0.0');
const ENV = String(process.env.NODE_ENV || process.env.ENV || 'production').toLowerCase();
const DEFAULT_TIMEOUT_MS = Number(process.env.NYX_TIMEOUT_MS || 20000);
const DEFAULT_CHART = 'Billboard Hot 100';
const TOP40_CHART = 'Top40Weekly Top 100';

<<<<<<< Updated upstream
console.log('[Nyx] startup env:', { HOST, PORT, ENV, pid: process.pid });
_crashLog('STARTUP_ENV', { HOST, PORT, ENV, pid: process.pid });
=======
// Build truth: Render sets RENDER_GIT_COMMIT
const COMMIT_FULL = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "";
const COMMIT_SHORT = COMMIT_FULL ? String(COMMIT_FULL).slice(0, 7) : "";
const BUILD_TAG = COMMIT_SHORT
  ? `nyx-wizard-v1.92-${COMMIT_SHORT}`
  : "nyx-wizard-v1.92-meta-fallback-debug";
>>>>>>> Stashed changes

// If behind proxy
app.set('trust proxy', 1);

// -----------------------------
// MIDDLEWARE
// -----------------------------
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

<<<<<<< Updated upstream
app.use(express.json({
  limit: '1mb',
  strict: true,
  type: ['application/json', 'application/*+json'],
}));
=======
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
>>>>>>> Stashed changes

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    _crashLog('BAD_JSON', { rid: req?._rid, message: err?.message });
    return res.status(200).json({
      ok: false,
      error: 'BAD_JSON',
      message: 'Request body is empty or invalid JSON.',
    });
  }
  next(err);
});

function reqId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

app.use((req, res, next) => {
  const id = reqId();
  res.setHeader('X-Request-Id', id);
  req._rid = id;
  next();
});

// -----------------------------
// SESSION STORE (in-memory)
// -----------------------------
const SESSIONS = new Map();

function getSession(sessionId) {
  const sid = (sessionId && String(sessionId).trim()) ? String(sessionId).trim() : 'anon';
  let s = SESSIONS.get(sid);
  if (!s) {
    s = {
      createdAt: Date.now(),
      last: { domain: 'general', followUp: null, followSig: '', meta: null },
      music: {
        chart: null,
        acceptedChart: null,
        usedFallback: false,
        year: null,
        step: 'need_anchor',
        lastMomentSig: null,
        lastTop10Year: null,
      },
    };
    SESSIONS.set(sid, s);
  }
  return s;
}

// -----------------------------
// HELPERS
// -----------------------------
const asText = (x) => (x == null ? '' : String(x).trim());

function normalizeChart(chart) {
  const raw = asText(chart);
  const t = raw.toLowerCase();
  if (!t) return DEFAULT_CHART;
  if (t.includes('top40weekly') || t.includes('top 40 weekly') || t.includes('top40 weekly')) return TOP40_CHART;
  if (t.includes('hot 100') || t.includes('billboard')) return 'Billboard Hot 100';
  if (t.includes('uk') && t.includes('singles')) return 'UK Singles Chart';
  if (t.includes('canada') && (t.includes('rpm') || t.includes('chart'))) return 'Canada RPM';
  return raw;
}

function extractYear(text) {
  const m = asText(text).match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
<<<<<<< Updated upstream
  const y = Number(m[1]);
  if (Number.isFinite(y) && y >= 1970 && y <= 1999) return y;
=======

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
>>>>>>> Stashed changes
  return null;
}

function isAffirmation(text) {
  return /^(y|yes|yeah|yep|sure|ok|okay|alright|sounds good|go ahead)$/i.test(asText(text));
}
function isNegation(text) {
  return /^(n|no|nope|nah|not really)$/i.test(asText(text));
}
function isNumberOneOnly(text) {
  const t = asText(text).toLowerCase();
  return t === '#1 only' || t === '#1' || t === 'number 1' || t === 'number one' || t === 'no. 1 only' || t === 'no 1 only';
}
function isAnotherMoment(text) {
  const t = asText(text).toLowerCase();
  return t === 'another moment' || t === 'another' || t === 'random' || t === 'random moment' || t === 'new moment';
}
function parseTop10Request(text) {
  const t = asText(text).toLowerCase();
  if (!t.includes('top')) return null;
  if (!/top\s*10|top10/.test(t)) return null;
  const y = extractYear(t);
  if (!y) return { year: null };
  return { year: y };
}

function followUpSignature(fu) {
  if (!fu || typeof fu !== 'object') return '';
  const kind = String(fu.kind || '');
  const prompt = String(fu.prompt || '');
  const req = Array.isArray(fu.required) ? fu.required.join(',') : '';
  const opts = Array.isArray(fu.options) ? fu.options.join('|') : '';
  return `${kind}::${prompt}::${req}::${opts}`.trim();
}

function toOutputSafe(out) {
  const safe = (out && typeof out === 'object') ? out : {};
  const reply = asText(safe.reply) || 'Okay.';
  const ok = (typeof safe.ok === 'boolean') ? safe.ok : true;
  const normalized = { ...safe, ok, reply };
  if (normalized.followUp != null && typeof normalized.followUp !== 'object') delete normalized.followUp;
  return normalized;
}

function sanitizeMusicReplyText(reply) {
  if (!reply) return reply;
  let text = String(reply);
  text = text.replace(/\banother\s+moment\s*,\s*another\s+moment\b/gi, 'another moment');
  text = text.replace(/\bthe\s+another\s+moment\b/gi, 'another moment');
  text = text.replace(/another moment\s*0\b/gi, 'another moment');
  return text;
}

<<<<<<< Updated upstream
function coerceChoice(message, followUp) {
  if (!followUp || followUp.kind !== 'choice' || !Array.isArray(followUp.options) || !followUp.options.length) return null;
  const opts = followUp.options;
  const t = asText(message).toLowerCase();
  if (isAffirmation(t)) return opts[0];
  if (isNegation(t)) return opts[1] || opts[0];
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n) && n >= 1 && n <= opts.length) return opts[n - 1];
  }
  const hit = opts.find(o => asText(o).toLowerCase() === t);
  return hit || null;
=======
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
>>>>>>> Stashed changes
}

function resolveChartForMusic(requestedChart) {
  const req = normalizeChart(requestedChart || DEFAULT_CHART);
  if (musicKnowledge && typeof musicKnowledge.resolveChart === 'function') {
    const r = musicKnowledge.resolveChart(req, { allowFallback: true }) || {};
    const used = normalizeChart(r.usedChart || req);
    return {
      requestedChart: req,
      usedChart: used,
      usedFallback: Boolean(r.usedFallback),
      strategy: String(r.strategy || (Boolean(r.usedFallback) ? 'top40Backup' : 'primary')),
    };
  }
  return { requestedChart: req, usedChart: req, usedFallback: false, strategy: 'primary' };
}

// -----------------------------
// KB-BASED MUSIC ENGINE
// -----------------------------
function kbAvailable() {
  return musicKnowledge && typeof musicKnowledge.getDb === 'function';
}

function formatMomentLine(m) {
  if (!m) return null;
  const artist = asText(m.artist);
  const title = asText(m.title);
  const year = Number(m.year);
  const chart = asText(m.chart) || DEFAULT_CHART;
  if (!artist || !title || !year) return null;
  return `Moment: ${artist} — ${title} (${year}, ${chart}).`;
}

<<<<<<< Updated upstream
function pickMomentByYearWithFallback(year, requestedChart) {
  if (!kbAvailable()) return { moment: null, usedFallback: false, usedChart: requestedChart, poolSize: 0 };
  const resolved = resolveChartForMusic(requestedChart);
  const usedChart = resolved.usedChart;

  if (typeof musicKnowledge.pickRandomByYearWithMeta === 'function') {
    const meta = musicKnowledge.pickRandomByYearWithMeta(year, usedChart);
    if (meta && meta.moment) {
      return {
        moment: meta.moment,
        usedFallback: Boolean(meta.usedFallback),
        usedChart: meta.usedChart || usedChart,
        requestedChart: meta.requestedChart || resolved.requestedChart,
        poolSize: Number(meta.poolSize || 0),
        strategy: meta.strategy || (meta.usedFallback ? 'top40Backup' : 'primary'),
      };
    }
  }

  if (typeof musicKnowledge.pickRandomByYear === 'function') {
    const m1 = musicKnowledge.pickRandomByYear(year, usedChart);
    if (m1) return { moment: m1, usedFallback: resolved.usedFallback, usedChart, requestedChart: resolved.requestedChart, poolSize: 0, strategy: resolved.strategy };
    const m2 = musicKnowledge.pickRandomByYear(year, TOP40_CHART);
    if (m2) return { moment: m2, usedFallback: true, usedChart: TOP40_CHART, requestedChart: resolved.requestedChart, poolSize: 0, strategy: 'top40Backup' };
  }

  return { moment: null, usedFallback: resolved.usedFallback, usedChart, requestedChart: resolved.requestedChart, poolSize: 0, strategy: 'none' };
}

function getTopNByYear(year, chart, n) {
  if (!kbAvailable()) return [];
  const c = normalizeChart(chart || DEFAULT_CHART);
  if (typeof musicKnowledge.getTopByYear === 'function') return musicKnowledge.getTopByYear(year, c, n) || [];
  return [];
}

function getNumberOneByYear(year, chart) {
  if (!kbAvailable()) return null;
  const c = normalizeChart(chart || DEFAULT_CHART);
  if (typeof musicKnowledge.getNumberOneByYear === 'function') return musicKnowledge.getNumberOneByYear(year, c) || null;
  const top = getTopNByYear(year, c, 1);
  return (top && top[0]) ? top[0] : null;
}

function buildMomentReply(year, requestedChart, session, picked) {
  const ms = session.music;
  const resolved = resolveChartForMusic(requestedChart);

  ms.chart = resolved.requestedChart;
  ms.acceptedChart = normalizeChart(picked && picked.usedChart ? picked.usedChart : resolved.usedChart);
  ms.usedFallback = Boolean(picked && typeof picked.usedFallback === 'boolean' ? picked.usedFallback : resolved.usedFallback);

  if (!picked || !picked.moment) {
    ms.step = 'need_anchor';
    return {
      ok: true,
      mode: 'music',
      reply: `I couldn’t find a moment for **${year}** on **${ms.chart}** yet. Try a different year (1970–1999) or switch chart to **Top40Weekly**.`,
      followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1984).' },
      meta: { flow: 'music_v1', step: ms.step, year, requestedChart: ms.chart, usedChart: null, usedFallback: false, strategy: 'none' },
    };
  }

  ms.year = Number(year);
  ms.step = 'anchored';

  const line = formatMomentLine(picked.moment);
  const reply = [line, '', 'Want **Top 10**, **another moment**, or **#1 only**?'].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply: sanitizeMusicReplyText(reply),
    followUp: { kind: 'choice', options: ['Top 10', 'another moment', '#1 only'], prompt: 'Pick one: Top 10, another moment, or #1 only.' },
    meta: {
      flow: 'music_v1',
      step: 'next_step',
      year: Number(year),
      requestedChart: ms.chart,
      usedChart: ms.acceptedChart,
      usedFallback: Boolean(ms.usedFallback),
      strategy: picked.strategy || (ms.usedFallback ? 'top40Backup' : 'primary'),
      poolSize: Number(picked.poolSize || 0),
      chart: ms.chart,
    },
  };
}

function buildTop10Reply(year, chart, list) {
  const c = normalizeChart(chart);
  const lines = (list || []).slice(0, 10).map((m, i) => {
    const rank = (m && m.rank != null) ? String(m.rank) : String(i + 1);
    return `${rank}. ${asText(m.artist)} — ${asText(m.title)} (${Number(m.year)}, ${asText(m.chart) || c}).`;
  });

  const reply = [
    `Top 10 (V1) — **${year}** (${c}).`,
    '',
    ...(lines.length ? lines : ['I couldn’t assemble a Top 10 list right now. Try “another moment” or “#1 only”.']),
    '',
    'Want **another moment**, **#1 only**, or **Top 10 (another year)**?',
  ].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply: sanitizeMusicReplyText(reply),
    followUp: { kind: 'choice', options: ['another moment', '#1 only', 'Top 10 (another year)'], prompt: 'Pick one: another moment, #1 only, or Top 10 (another year).' },
    meta: { flow: 'music_v1', step: 'top10', year: Number(year), chart: c, top10v1: true },
  };
}

function buildNumberOneReply(year, chart, top1) {
  const c = normalizeChart(chart);
  if (!top1) {
    return {
      ok: true,
      mode: 'music',
      reply: `I don’t have a reliable **#1** result for **${year}** on **${c}** yet. Want **another moment** or **Top 10** instead?`,
      followUp: { kind: 'choice', options: ['another moment', 'Top 10', 'change year'], prompt: 'Pick one: another moment, Top 10, or change year.' },
      meta: { flow: 'music_v1', step: 'number_one', year: Number(year), chart: c, numberOneOnly: true, available: false },
    };
  }

  const line = (formatMomentLine(top1) || '').replace(/^Moment:\s*/i, '#1: ');
  const reply = [line, '', 'Want **another moment**, **Top 10**, or **change year**?'].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply: sanitizeMusicReplyText(reply),
    followUp: { kind: 'choice', options: ['another moment', 'Top 10', 'change year'], prompt: 'Pick one: another moment, Top 10, or change year.' },
    meta: { flow: 'music_v1', step: 'number_one', year: Number(year), chart: c, numberOneOnly: true, available: true },
  };
}

// -----------------------------
// MUSIC ORCHESTRATOR
// -----------------------------
async function handleMusic(message, sessionId, context, timeoutMs) {
  const s = getSession(sessionId);
  const ms = s.music;

  const requestedChartRaw = (context && context.chart) ? context.chart : (ms.chart || DEFAULT_CHART);
  const resolvedChart = resolveChartForMusic(requestedChartRaw);
  const reqChart = resolvedChart.requestedChart;
  const usedChart = resolvedChart.usedChart;

  ms.chart = reqChart;
  ms.acceptedChart = usedChart;
  ms.usedFallback = Boolean(resolvedChart.usedFallback);

  if (s.last.followUp && s.last.followUp.kind === 'choice') {
    const coerced = coerceChoice(message, s.last.followUp);
    if (coerced) message = coerced;
  }

  const topReq = parseTop10Request(message);
  if (topReq) {
    const y = topReq.year || ms.year || extractYear(message);
    if (!y) {
      ms.step = 'need_anchor';
      return { ok: true, mode: 'music', reply: 'For **Top 10**, I need a year. What year?', followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1989).' }, meta: { flow: 'music_v1', step: ms.step, intent: 'top10', chart: reqChart, usedChart } };
    }
    ms.year = y; ms.step = 'anchored'; ms.lastTop10Year = y;
    return buildTop10Reply(y, usedChart, getTopNByYear(y, usedChart, 10));
  }

  if (/^top\s*10$/i.test(asText(message))) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return { ok: true, mode: 'music', reply: 'For **Top 10**, I need a year. What year?', followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1989).' }, meta: { flow: 'music_v1', step: ms.step, intent: 'top10', chart: reqChart, usedChart } };
    }
    return buildTop10Reply(ms.year, usedChart, getTopNByYear(ms.year, usedChart, 10));
  }

  if (isAnotherMoment(message)) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return { ok: true, mode: 'music', reply: 'To pull **another moment**, I need a year (or artist + year). What year?', followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1984).' }, meta: { flow: 'music_v1', step: ms.step, intent: 'another_moment', chart: reqChart, usedChart } };
    }
    return buildMomentReply(ms.year, usedChart, s, pickMomentByYearWithFallback(ms.year, usedChart));
  }

  if (isNumberOneOnly(message)) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return { ok: true, mode: 'music', reply: 'For **#1 only**, I need a year. What year should I use?', followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1987).' }, meta: { flow: 'music_v1', step: ms.step, intent: 'number_one', chart: reqChart, usedChart } };
    }
    return buildNumberOneReply(ms.year, usedChart, getNumberOneByYear(ms.year, usedChart));
  }

  const y = extractYear(message);
  if (y) {
    ms.year = y; ms.step = 'anchored';
    return buildMomentReply(y, usedChart, s, pickMomentByYearWithFallback(y, usedChart));
  }

  if (/^change year$/i.test(asText(message))) {
    ms.step = 'need_anchor';
    return { ok: true, mode: 'music', reply: 'Sure - what year do you want?', followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1994).' }, meta: { flow: 'music_v1', step: ms.step, intent: 'change_year', chart: reqChart, usedChart } };
  }

  return { ok: true, mode: 'music', reply: 'Give me a **year** (1970–1999), or type **Top 10 1989**, **another moment**, or **#1 only**.', followUp: { kind: 'choice', options: ['Top 10', 'another moment', '#1 only'], prompt: 'Pick one: Top 10, another moment, or #1 only.' }, meta: { flow: 'music_v1', step: ms.step, chart: reqChart, usedChart } };
}

// -----------------------------
// GENERAL ORCHESTRATOR
// -----------------------------
async function routeMessage(message, sessionId, context, timeoutMs) {
  const s = getSession(sessionId);

  if (s.last && s.last.domain === 'music' && s.last.followUp && s.last.followUp.kind === 'choice') {
    const coerced = coerceChoice(message, s.last.followUp);
    const msgNorm = asText(message).toLowerCase();
    const options = Array.isArray(s.last.followUp.options) ? s.last.followUp.options : [];
    const directHit = options.some(o => asText(o).toLowerCase() === msgNorm);
    if (coerced || directHit || isAffirmation(message) || isNegation(message) || /^\d+$/.test(msgNorm)) {
      const out = await handleMusic(message, sessionId, context, timeoutMs);
      s.last.domain = 'music';
      s.last.followUp = out.followUp || null;
      s.last.followSig = followUpSignature(out.followUp);
      s.last.meta = out.meta || null;
      return out;
    }
  }

  const uiMode = asText(context && context.mode);
  if (uiMode && uiMode.toLowerCase() === 'music') {
    const out = await handleMusic(message, sessionId, context, timeoutMs);
    s.last.domain = 'music';
    s.last.followUp = out.followUp || null;
    s.last.followSig = followUpSignature(out.followUp);
    s.last.meta = out.meta || null;
    return out;
  }

  const t = asText(message).toLowerCase();
  const looksMusic = /top\s*10|top10|#1\s*only|number\s*one|hot\s*100|billboard|uk\s*singles|canada\s*rpm|top40weekly|\b(19\d{2})\b/.test(t);

  if (looksMusic) {
    const out = await handleMusic(message, sessionId, context, timeoutMs);
    s.last.domain = 'music';
    s.last.followUp = out.followUp || null;
    s.last.followSig = followUpSignature(out.followUp);
    s.last.meta = out.meta || null;
    return out;
  }

  const out = {
    ok: true,
    mode: 'general',
    reply: 'What would you like to explore next?',
    followUp: { kind: 'choice', options: ['Music moment', 'Sandblast info', 'Sponsors', 'Site help'], prompt: 'Pick one.' },
    meta: { flow: 'general_v1' },
  };

  s.last.domain = 'general';
  s.last.followUp = out.followUp;
  s.last.followSig = followUpSignature(out.followUp);
  s.last.meta = out.meta;
  return out;
}

// -----------------------------
// ROUTES
// -----------------------------
app.get('/api/health', (req, res) => {
=======
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

>>>>>>> Stashed changes
  res.status(200).json({
    ok: true,
    service: 'sandblast-backend',
    env: ENV,
    host: HOST,
    port: PORT,
    pid: process.pid,
    time: new Date().toISOString(),
  });
});

let _serverRef = null;
app.get('/api/debug/listen', (req, res) => {
  const addr = _serverRef && typeof _serverRef.address === 'function' ? _serverRef.address() : null;
  res.status(200).json({ ok: true, addr, host: HOST, port: PORT, pid: process.pid });
});

app.post('/api/chat', async (req, res) => {
  const body = (req && req.body && typeof req.body === 'object') ? req.body : null;

  const message = asText(body && body.message);
  const sessionId = asText(body && body.sessionId) || 'anon';
  const context = (body && body.context && typeof body.context === 'object') ? body.context : {};

  if (!message) {
    return res.status(200).json({ ok: false, error: 'NO_MESSAGE', message: 'Missing "message" in request.' });
  }

  const timeoutMs = Number(context.timeoutMs || DEFAULT_TIMEOUT_MS);

  const out = await routeMessage(message, sessionId, context, timeoutMs);
  return res.status(200).json(toOutputSafe(out || {}));
});

// -----------------------------
// START (listener truth + self-probe)
// -----------------------------
function selfProbe(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    sock.setTimeout(900);

    sock.once('connect', () => { done = true; sock.destroy(); resolve(true); });
    sock.once('timeout', () => { if (!done) { done = true; try { sock.destroy(); } catch (_) {} resolve(false); } });
    sock.once('error', () => { if (!done) { done = true; resolve(false); } });

    sock.connect(port, host);
  });
}

const server = app.listen(PORT, HOST);
_serverRef = server;

server.on('listening', async () => {
  const addr = server.address();
  console.log('[Nyx] listening confirmed:', addr);
  console.log(`[Nyx] up on ${HOST}:${PORT} - intel-layer orchestrator env=${ENV} timeout=${DEFAULT_TIMEOUT_MS}ms pid=${process.pid}`);
  _crashLog('LISTENING', { addr, HOST, PORT, pid: process.pid });

<<<<<<< Updated upstream
  const probeHost = (HOST === '0.0.0.0') ? '127.0.0.1' : HOST;
  const ok = await selfProbe(probeHost, PORT);
  console.log('[Nyx] self-probe tcp:', ok ? 'OK' : 'FAILED');
  _crashLog('SELF_PROBE', { probeHost, PORT, ok });
=======
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
>>>>>>> Stashed changes
});

server.on('close', () => _crashLog('SERVER_CLOSE'));

server.on('error', (err) => {
  const code = err && err.code ? String(err.code) : 'UNKNOWN';
  console.error(`[Nyx] listen error (${code}):`, err && err.message ? err.message : err);
  _crashLog('LISTEN_ERROR', { code, message: err?.message, stack: err?.stack });
  process.exit(1);
});

<<<<<<< Updated upstream
// Keep alive in detached shells
try { process.stdin.resume(); } catch (_) {}
setInterval(() => {}, 60_000);
=======
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
>>>>>>> Stashed changes
