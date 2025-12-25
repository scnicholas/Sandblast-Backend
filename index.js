/**
 * Sandblast Backend — Nyx Intelligence Layer
 * Hardened Orchestrator + Music Flow V1 (KB-backed)
 *
 * Connectivity hardening:
 * - Explicit HOST bind (default 0.0.0.0)
 * - Listener-truth startup logging via server.address()
 * - Clean ASCII banner (avoids encoding artifacts)
 * - Handles common listen errors (EADDRINUSE, etc.)
 * - Optional /api/debug/listen to confirm bind at runtime
 *
 * Music Flow V1 hardening:
 * - Follow-up routing lock: if last domain was music, keep user in music flow for follow-up answers
 * - Choice coercion: "yes/no" + numeric 1/2/3 maps to last followUp options
 * - Top 10 correctness: display real rank, not list index
 * - #1 only correctness: uses getNumberOneByYear (true #1)
 * - Chart routing: uses resolveChart() when available and tracks requested vs used chart
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); } catch (_) {}
try { musicKnowledge = require('./Utils/musicKnowledge'); } catch (_) {}

const app = express();
app.disable('x-powered-by');

// -----------------------------
// CONFIG
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '0.0.0.0'); // set HOST=127.0.0.1 for strict loopback
const ENV = String(process.env.NODE_ENV || process.env.ENV || 'production').toLowerCase();
const DEFAULT_TIMEOUT_MS = Number(process.env.NYX_TIMEOUT_MS || 20000);
const DEFAULT_CHART = 'Billboard Hot 100';
const TOP40_CHART = 'Top40Weekly Top 100';

// If behind proxy (Render/Vercel/etc.), this avoids some edge-case header oddities.
app.set('trust proxy', 1);

// -----------------------------
// MIDDLEWARE (CORS + JSON safety)
// -----------------------------
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({
  limit: '1mb',
  strict: true,
  type: ['application/json', 'application/*+json']
}));

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(200).json({
      ok: false,
      error: 'BAD_JSON',
      message: 'Request body is empty or invalid JSON.'
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
      last: {
        domain: 'general',
        followUp: null,
        followSig: '',
        meta: null
      },
      music: {
        chart: null,          // requested chart (normalized)
        acceptedChart: null,  // used chart (after resolveChart fallback)
        usedFallback: false,
        year: null,
        step: 'need_anchor', // need_anchor | anchored
        lastMomentSig: null,
        lastTop10Year: null
      }
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
  const y = Number(m[1]);
  if (Number.isFinite(y) && y >= 1970 && y <= 1999) return y;
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

/**
 * Choice coercion:
 * - "yes" -> first option
 * - "no"  -> second option (or first if only one)
 * - "1/2/3" -> corresponding option
 * - direct text match -> canonical option
 */
function coerceChoice(message, followUp) {
  if (!followUp || followUp.kind !== 'choice' || !Array.isArray(followUp.options) || !followUp.options.length) return null;
  const opts = followUp.options;
  const t = asText(message).toLowerCase();

  if (isAffirmation(t)) return opts[0];
  if (isNegation(t)) return opts[1] || opts[0];

  // numeric selection
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n) && n >= 1 && n <= opts.length) return opts[n - 1];
  }

  // direct match (case-insensitive)
  const hit = opts.find(o => asText(o).toLowerCase() === t);
  if (hit) return hit;

  return null;
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
      strategy: String(r.strategy || (Boolean(r.usedFallback) ? 'top40Backup' : 'primary'))
    };
  }

  // Fallback if resolveChart() not present
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
        strategy: meta.strategy || (meta.usedFallback ? 'top40Backup' : 'primary')
      };
    }
  }

  if (typeof musicKnowledge.pickRandomByYear === 'function') {
    const m1 = musicKnowledge.pickRandomByYear(year, usedChart);
    if (m1) return { moment: m1, usedFallback: resolved.usedFallback, usedChart, requestedChart: resolved.requestedChart, poolSize: 0, strategy: resolved.strategy };

    // last-resort: top40 chart
    const m2 = musicKnowledge.pickRandomByYear(year, TOP40_CHART);
    if (m2) return { moment: m2, usedFallback: true, usedChart: TOP40_CHART, requestedChart: resolved.requestedChart, poolSize: 0, strategy: 'top40Backup' };
  }

  return { moment: null, usedFallback: resolved.usedFallback, usedChart, requestedChart: resolved.requestedChart, poolSize: 0, strategy: 'none' };
}

function getTopNByYear(year, chart, n) {
  if (!kbAvailable()) return [];
  const c = normalizeChart(chart || DEFAULT_CHART);
  if (typeof musicKnowledge.getTopByYear === 'function') {
    return musicKnowledge.getTopByYear(year, c, n) || [];
  }
  return [];
}

function getNumberOneByYear(year, chart) {
  if (!kbAvailable()) return null;
  const c = normalizeChart(chart || DEFAULT_CHART);
  if (typeof musicKnowledge.getNumberOneByYear === 'function') {
    return musicKnowledge.getNumberOneByYear(year, c) || null;
  }
  // fallback: take top-by-year rank list if needed
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
      meta: { flow: 'music_v1', step: ms.step, year, requestedChart: ms.chart, usedChart: null, usedFallback: false, strategy: 'none' }
    };
  }

  ms.year = Number(year);
  ms.step = 'anchored';

  const line = formatMomentLine(picked.moment);
  const reply = [
    line,
    '',
    'Want **Top 10**, **another moment**, or **#1 only**?'
  ].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply: sanitizeMusicReplyText(reply),
    followUp: {
      kind: 'choice',
      options: ['Top 10', 'another moment', '#1 only'],
      prompt: 'Pick one: Top 10, another moment, or #1 only.'
    },
    meta: {
      flow: 'music_v1',
      step: 'next_step',
      year: Number(year),
      requestedChart: ms.chart,
      usedChart: ms.acceptedChart,
      usedFallback: Boolean(ms.usedFallback),
      strategy: picked.strategy || (ms.usedFallback ? 'top40Backup' : 'primary'),
      poolSize: Number(picked.poolSize || 0),
      chart: ms.chart
    }
  };
}

function buildTop10Reply(year, chart, list) {
  const c = normalizeChart(chart);
  // display REAL rank where available; fallback to index if missing
  const lines = (list || []).slice(0, 10).map((m, i) => {
    const rank = (m && m.rank != null) ? String(m.rank) : String(i + 1);
    return `${rank}. ${asText(m.artist)} — ${asText(m.title)} (${Number(m.year)}, ${asText(m.chart) || c}).`;
  });

  const reply = [
    `Top 10 (V1) — **${year}** (${c}).`,
    '',
    ...(lines.length ? lines : ['I couldn’t assemble a Top 10 list right now. Try “another moment” or “#1 only”.']),
    '',
    'Want **another moment**, **#1 only**, or **Top 10 (another year)**?'
  ].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply: sanitizeMusicReplyText(reply),
    followUp: {
      kind: 'choice',
      options: ['another moment', '#1 only', 'Top 10 (another year)'],
      prompt: 'Pick one: another moment, #1 only, or Top 10 (another year).'
    },
    meta: { flow: 'music_v1', step: 'top10', year: Number(year), chart: c, top10v1: true }
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
      meta: { flow: 'music_v1', step: 'number_one', year: Number(year), chart: c, numberOneOnly: true, available: false }
    };
  }

  const line = (formatMomentLine(top1) || '').replace(/^Moment:\s*/i, '#1: ');
  const reply = [
    line,
    '',
    'Want **another moment**, **Top 10**, or **change year**?'
  ].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply: sanitizeMusicReplyText(reply),
    followUp: { kind: 'choice', options: ['another moment', 'Top 10', 'change year'], prompt: 'Pick one: another moment, Top 10, or change year.' },
    meta: { flow: 'music_v1', step: 'number_one', year: Number(year), chart: c, numberOneOnly: true, available: true }
  };
}

// -----------------------------
// MUSIC ORCHESTRATOR
// -----------------------------
async function handleMusic(message, sessionId, context, timeoutMs) {
  const s = getSession(sessionId);
  const ms = s.music;

  // Chart routing (requested vs used)
  const requestedChartRaw = (context && context.chart) ? context.chart : (ms.chart || DEFAULT_CHART);
  const resolvedChart = resolveChartForMusic(requestedChartRaw);
  const reqChart = resolvedChart.requestedChart;
  const usedChart = resolvedChart.usedChart;

  ms.chart = reqChart;
  ms.acceptedChart = usedChart;
  ms.usedFallback = Boolean(resolvedChart.usedFallback);

  // If user is answering a follow-up choice, coerce "yes/no/1/2/3" into an option
  if (s.last.followUp && s.last.followUp.kind === 'choice') {
    const coerced = coerceChoice(message, s.last.followUp);
    if (coerced) message = coerced;
  }

  // Top 10 request (direct "Top 10 1989")
  const topReq = parseTop10Request(message);
  if (topReq) {
    const y = topReq.year || ms.year || extractYear(message);
    if (!y) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'For **Top 10**, I need a year. What year?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1989).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'top10', chart: reqChart, usedChart }
      };
    }
    ms.year = y;
    ms.step = 'anchored';
    ms.lastTop10Year = y;

    const top10 = getTopNByYear(y, usedChart, 10);
    return buildTop10Reply(y, usedChart, top10);
  }

  // If user typed "Top 10" without year, use last anchored year
  if (/^top\s*10$/i.test(asText(message))) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'For **Top 10**, I need a year. What year?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1989).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'top10', chart: reqChart, usedChart }
      };
    }
    const top10 = getTopNByYear(ms.year, usedChart, 10);
    return buildTop10Reply(ms.year, usedChart, top10);
  }

  // Another moment
  if (isAnotherMoment(message)) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'To pull **another moment**, I need a year (or artist + year). What year?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1984).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'another_moment', chart: reqChart, usedChart }
      };
    }
    const picked = pickMomentByYearWithFallback(ms.year, usedChart);
    return buildMomentReply(ms.year, usedChart, s, picked);
  }

  // "#1 only" (true #1)
  if (isNumberOneOnly(message)) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'For **#1 only**, I need a year. What year should I use?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1987).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'number_one', chart: reqChart, usedChart }
      };
    }
    const top1 = getNumberOneByYear(ms.year, usedChart);
    return buildNumberOneReply(ms.year, usedChart, top1);
  }

  // Slotfill year from user input
  const y = extractYear(message);
  if (y) {
    ms.year = y;
    ms.step = 'anchored';
    const picked = pickMomentByYearWithFallback(y, usedChart);
    return buildMomentReply(y, usedChart, s, picked);
  }

  // Change year intent
  if (/^change year$/i.test(asText(message))) {
    ms.step = 'need_anchor';
    return {
      ok: true,
      mode: 'music',
      reply: 'Sure - what year do you want?',
      followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1994).' },
      meta: { flow: 'music_v1', step: ms.step, intent: 'change_year', chart: reqChart, usedChart }
    };
  }

  return {
    ok: true,
    mode: 'music',
    reply: 'Give me a **year** (1970–1999), or type **Top 10 1989**, **another moment**, or **#1 only**.',
    followUp: { kind: 'choice', options: ['Top 10', 'another moment', '#1 only'], prompt: 'Pick one: Top 10, another moment, or #1 only.' },
    meta: { flow: 'music_v1', step: ms.step, chart: reqChart, usedChart }
  };
}

// -----------------------------
// GENERAL ORCHESTRATOR
// -----------------------------
async function routeMessage(message, sessionId, context, timeoutMs) {
  const s = getSession(sessionId);

  // 1) Hard lock: if last domain was music and we are mid-followup, keep routing through music
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

  // UI explicitly says music
  const uiMode = asText(context && context.mode);
  if (uiMode && uiMode.toLowerCase() === 'music') {
    const out = await handleMusic(message, sessionId, context, timeoutMs);
    s.last.domain = 'music';
    s.last.followUp = out.followUp || null;
    s.last.followSig = followUpSignature(out.followUp);
    s.last.meta = out.meta || null;
    return out;
  }

  // Heuristic: looks like music content
  const t = asText(message).toLowerCase();
  const looksMusic =
    /top\s*10|top10|#1\s*only|number\s*one|hot\s*100|billboard|uk\s*singles|canada\s*rpm|top40weekly|\b(19\d{2})\b/.test(t);

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
    meta: { flow: 'general_v1' }
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
  res.status(200).json({
    ok: true,
    service: 'sandblast-backend',
    env: ENV,
    host: HOST,
    port: PORT,
    pid: process.pid,
    time: new Date().toISOString()
  });
});

// Listener truth endpoint (tiny + safe)
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
    return res.status(200).json({
      ok: false,
      error: 'NO_MESSAGE',
      message: 'Missing "message" in request.'
    });
  }

  const timeoutMs = Number(context.timeoutMs || DEFAULT_TIMEOUT_MS);

  const out = await routeMessage(message, sessionId, context, timeoutMs);
  const safe = toOutputSafe(out || {});
  return res.status(200).json(safe);
});

// -----------------------------
// START (listener truth)
// -----------------------------
const server = app.listen(PORT, HOST);
_serverRef = server;

server.on('listening', () => {
  const addr = server.address();
  console.log('[Nyx] listening confirmed:', addr);
  console.log(`[Nyx] up on ${HOST}:${PORT} - intel-layer orchestrator env=${ENV} timeout=${DEFAULT_TIMEOUT_MS}ms pid=${process.pid}`);
});

server.on('error', (err) => {
  const code = err && err.code ? String(err.code) : 'UNKNOWN';
  console.error(`[Nyx] listen error (${code}):`, err && err.message ? err.message : err);
  process.exit(1);
});

// Hard crash visibility
process.on('uncaughtException', (err) => {
  console.error('[Nyx] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[Nyx] unhandledRejection:', err);
  process.exit(1);
});

// Keep-alive to prevent odd shell/host termination edge cases.
setInterval(() => {}, 60_000);
