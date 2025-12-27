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

/**
 * Sandblast Backend — Nyx Intelligence Layer
 * Hardened Orchestrator + Music Flow (KB-backed)
 */

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const net = require('net');

// Optional modules (don’t crash boot if missing)
let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); }
catch (e) { _crashLog('REQUIRE_FAIL intentClassifier', { message: e?.message }); }

try { musicKnowledge = require('./Utils/musicKnowledge'); }
catch (e) { _crashLog('REQUIRE_FAIL musicKnowledge', { message: e?.message }); }

// -----------------------------
// APP
// -----------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// -----------------------------
// CONFIG
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '0.0.0.0');
const ENV = String(process.env.NODE_ENV || process.env.ENV || 'production').toLowerCase();

const DEFAULT_TIMEOUT_MS = Number(process.env.NYX_TIMEOUT_MS || 20000);

// Music prompt range (this is what you’re using in prod tests)
const MUSIC_RANGE_START = Number(process.env.MUSIC_RANGE_START || 1970);
const MUSIC_RANGE_END = Number(process.env.MUSIC_RANGE_END || 2010);

const DEFAULT_CHART = 'Billboard Hot 100';
const TOP40_CHART = 'Top40Weekly Top 100';
const YEAR_END_CHART = 'Billboard Year-End Hot 100';

// Build tag (Render sets RENDER_GIT_COMMIT)
const COMMIT_FULL = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '';
const COMMIT_SHORT = COMMIT_FULL ? String(COMMIT_FULL).slice(0, 7) : '';
const BUILD_TAG = COMMIT_SHORT ? `nyx-wizard-${COMMIT_SHORT}` : 'nyx-wizard-local';

// -----------------------------
// MIDDLEWARE
// -----------------------------
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({
  limit: '1mb',
  strict: true,
  type: ['application/json', 'application/*+json'],
}));

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
  try {
    return crypto.randomUUID();
  } catch {
    return crypto.randomBytes(16).toString('hex');
  }
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

function asText(x) {
  return x == null ? '' : String(x).trim();
}

function getSession(sessionId) {
  const sid = asText(sessionId) || 'anon';
  let s = SESSIONS.get(sid);
  if (!s) {
    s = {
      createdAt: Date.now(),
      last: { domain: 'general', followUp: null, followSig: '', meta: null },
      music: {
        year: null,
        chart: null,
        step: 'need_anchor', // need_anchor -> need_chart -> need_action -> anchored
      },
    };
    SESSIONS.set(sid, s);
  }
  return s;
}

// -----------------------------
// MUSIC: chart normalization (critical)
// -----------------------------
function normalizeChart(chart) {
  const raw = asText(chart);
  const t = raw.toLowerCase();
  if (!t) return DEFAULT_CHART;

  // IMPORTANT: Year-End must win BEFORE generic "hot 100"/"billboard"
  if (
    t.includes('year end') ||
    t.includes('year-end') ||
    t.includes('yearend') ||
    (t.includes('billboard') && t.includes('year') && t.includes('end'))
  ) return YEAR_END_CHART;

  if (t.includes('top40weekly') || t.includes('top 40 weekly') || t.includes('top40 weekly')) return TOP40_CHART;
  if (t.includes('uk') && t.includes('singles')) return 'UK Singles Chart';
  if (t.includes('canada') && (t.includes('rpm') || t.includes('chart'))) return 'Canada RPM';
  if (t.includes('hot 100') || t.includes('billboard')) return 'Billboard Hot 100';

  return raw;
}

function extractYear(text) {
  const m = asText(text).match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y)) return null;
  if (y < MUSIC_RANGE_START || y > MUSIC_RANGE_END) return null;
  return y;
}

// -----------------------------
// FOLLOW-UP helpers
// -----------------------------
function isAffirmation(text) {
  return /^(y|yes|yeah|yep|sure|ok|okay|alright|sounds good|go ahead)$/i.test(asText(text));
}
function isNegation(text) {
  return /^(n|no|nope|nah|not really)$/i.test(asText(text));
}

function followUpSignature(fu) {
  if (!fu || typeof fu !== 'object') return '';
  const kind = String(fu.kind || '');
  const prompt = String(fu.prompt || '');
  const req = Array.isArray(fu.required) ? fu.required.join(',') : '';
  const opts = Array.isArray(fu.options) ? fu.options.join('|') : '';
  return `${kind}::${prompt}::${req}::${opts}`.trim();
}

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
}

function toOutputSafe(out) {
  const safe = (out && typeof out === 'object') ? out : {};
  const reply = asText(safe.reply) || 'Okay.';
  const ok = (typeof safe.ok === 'boolean') ? safe.ok : true;
  const normalized = { ...safe, ok, reply };
  if (normalized.followUp != null && typeof normalized.followUp !== 'object' && !Array.isArray(normalized.followUp)) {
    delete normalized.followUp;
  }
  return normalized;
}

// -----------------------------
// MUSIC: coverage cache + rebuild
// -----------------------------
let MUSIC_COVERAGE = {
  builtAt: null,
  range: { start: MUSIC_RANGE_START, end: MUSIC_RANGE_END },
  charts: [TOP40_CHART, DEFAULT_CHART, YEAR_END_CHART, 'Canada RPM', 'UK Singles Chart'],
};

function kbAvailable() {
  return musicKnowledge && typeof musicKnowledge.getDb === 'function';
}

function rebuildMusicCoverage() {
  const builtAt = new Date().toISOString();

  // Default to your known list (safe even if KB is unavailable)
  const charts = new Set([TOP40_CHART, DEFAULT_CHART, YEAR_END_CHART, 'Canada RPM', 'UK Singles Chart']);

  if (kbAvailable()) {
    try {
      const db = musicKnowledge.getDb();
      const moments = Array.isArray(db?.moments) ? db.moments : [];
      for (const m of moments) {
        const c = asText(m?.chart);
        if (c) charts.add(c);
      }
    } catch (e) {
      _crashLog('COVERAGE_REBUILD_FAIL', { message: e?.message });
    }
  }

  MUSIC_COVERAGE = {
    builtAt,
    range: { start: MUSIC_RANGE_START, end: MUSIC_RANGE_END },
    charts: Array.from(charts),
  };

  return MUSIC_COVERAGE;
}

// Build once at boot (best-effort)
rebuildMusicCoverage();

// -----------------------------
// MUSIC: core calls
// -----------------------------
function getYearChartCount(year, chart) {
  if (!kbAvailable()) return 0;
  if (typeof musicKnowledge.getYearChartCount !== 'function') return 0;
  try {
    return Number(musicKnowledge.getYearChartCount(Number(year), normalizeChart(chart))) || 0;
  } catch {
    return 0;
  }
}

function getTopByYear(year, chart, n) {
  if (!kbAvailable()) return [];
  if (typeof musicKnowledge.getTopByYear !== 'function') return [];
  try {
    const out = musicKnowledge.getTopByYear(Number(year), normalizeChart(chart), Number(n));
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

function getNumberOneByYear(year, chart) {
  if (!kbAvailable()) return null;
  if (typeof musicKnowledge.getNumberOneByYear === 'function') {
    try { return musicKnowledge.getNumberOneByYear(Number(year), normalizeChart(chart)) || null; }
    catch { return null; }
  }
  const top = getTopByYear(year, chart, 1);
  return top && top[0] ? top[0] : null;
}

function pickStoryMoment(year, chart) {
  if (!kbAvailable()) return null;
  if (typeof musicKnowledge.pickRandomByYearWithMeta === 'function') {
    try {
      const r = musicKnowledge.pickRandomByYearWithMeta(Number(year), normalizeChart(chart));
      if (r && r.moment) return r.moment;
    } catch {}
  }
  if (typeof musicKnowledge.pickRandomByYear === 'function') {
    try { return musicKnowledge.pickRandomByYear(Number(year), normalizeChart(chart)) || null; }
    catch { return null; }
  }
  return null;
}

function fmtLine(m, fallbackChart) {
  if (!m) return '';
  const artist = asText(m.artist);
  const title = asText(m.title);
  const y = Number(m.year);
  const c = asText(m.chart) || asText(fallbackChart) || DEFAULT_CHART;
  if (!artist || !title || !Number.isFinite(y)) return '';
  return `${artist} — ${title} (${y})`;
}

function listChartsForYear(year) {
  const y = Number(year);
  const out = [];
  for (const c of (MUSIC_COVERAGE.charts || [])) {
    const cnt = getYearChartCount(y, c);
    if (cnt > 0) out.push(c);
  }

  const preferred = [TOP40_CHART, DEFAULT_CHART, YEAR_END_CHART, 'Canada RPM', 'UK Singles Chart'];
  out.sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return out;
}

// -----------------------------
// MUSIC ORCHESTRATOR (matches your curl flow)
// -----------------------------
async function handleMusic(message, sessionId) {
  const s = getSession(sessionId);
  const ms = s.music;

  if (/^music$/i.test(asText(message))) {
    ms.step = 'need_anchor';
    ms.year = null;
    ms.chart = null;
    return {
      ok: true,
      reply: `Music it is.\nGive me a year between ${MUSIC_RANGE_START} and ${MUSIC_RANGE_END}.`,
      followUp: null,
    };
  }

  if (s.last.followUp && s.last.followUp.kind === 'choice') {
    const coerced = coerceChoice(message, s.last.followUp);
    if (coerced) message = coerced;
  }

  if (!ms.year) {
    const y = extractYear(message);
    if (!y) {
      return { ok: true, reply: `Give me a year between ${MUSIC_RANGE_START} and ${MUSIC_RANGE_END}.`, followUp: null };
    }
    ms.year = y;

    const charts = listChartsForYear(y);
    if (!charts.length) {
      ms.year = null;
      return {
        ok: true,
        reply: `I don’t have chart entries for ${y} in my coverage right now.\nTry another year between ${MUSIC_RANGE_START} and ${MUSIC_RANGE_END}.`,
        followUp: null,
      };
    }

    ms.step = 'need_chart';
    return {
      ok: true,
      reply: `Great. For ${y}, I can pull from:\n` + charts.map(c => `• ${c}`).join('\n') + `\n\nPick one.`,
      followUp: charts,
    };
  }

  if (!ms.chart) {
    const chosen = normalizeChart(message);

    const charts = listChartsForYear(ms.year);
    const hit = charts.find(c => normalizeChart(c) === chosen) || charts.find(c => c === message) || null;

    if (!hit) {
      return { ok: true, reply: `Pick another chart:`, followUp: charts };
    }

    ms.chart = normalizeChart(hit);
    ms.step = 'need_action';
    return {
      ok: true,
      reply: `Locked in: ${ms.chart}, ${ms.year}.\nNow tell me one of these:\n• Top 10\n• #1\n• Story moment`,
      followUp: ['Top 10', '#1', 'Story moment'],
    };
  }

  const t = asText(message).toLowerCase();

  if (t === 'top 10' || t === 'top10') {
    const list = getTopByYear(ms.year, ms.chart, 10);
    if (!list.length) {
      return {
        ok: true,
        reply: `I couldn’t assemble Top 10 for ${ms.chart} (${ms.year}).\nWant #1 or a Story moment instead?`,
        followUp: ['#1', 'Story moment', 'Another year'],
      };
    }
    const lines = list.slice(0, 10).map((m, i) => `${i + 1}. ${asText(m.artist)} — ${asText(m.title)}`);
    return {
      ok: true,
      reply: `Top 10 for ${ms.chart} (${ms.year}):\n${lines.join('\n')}\n\nWant #1, a Story moment, or another year?`,
      followUp: ['#1', 'Story moment', 'Another year'],
    };
  }

  if (t === '#1' || t === 'number 1' || t === 'number one' || t === 'no. 1' || t === 'no 1') {
    const top1 = getNumberOneByYear(ms.year, ms.chart);
    if (!top1) {
      return {
        ok: true,
        reply: `I don’t have a #1 for ${ms.chart} (${ms.year}).\nWant Top 10 or a Story moment?`,
        followUp: ['Top 10', 'Story moment', 'Another year'],
      };
    }
    return {
      ok: true,
      reply: `#1 for ${ms.chart} (${ms.year}):\n1. ${asText(top1.artist)} — ${asText(top1.title)}\n\nWant a story moment from ${ms.year}, Top 10 (if available), or another year?`,
      followUp: ['Story moment', 'Top 10', 'Another year'],
    };
  }

  if (t === 'story moment' || t === 'story' || t === 'moment') {
    const m = pickStoryMoment(ms.year, ms.chart);
    if (!m) {
      return {
        ok: true,
        reply: `I couldn’t pull a story moment for ${ms.chart} (${ms.year}).\nWant #1 or Top 10 instead?`,
        followUp: ['#1', 'Top 10', 'Another year'],
      };
    }
    const line = fmtLine(m, ms.chart);
    return {
      ok: true,
      reply: `Story moment (${ms.year}, ${ms.chart}):\n${line}\n\nWant #1, Top 10, or another year?`,
      followUp: ['#1', 'Top 10', 'Another year'],
    };
  }

  if (t === 'another year' || t === 'change year' || t === 'year') {
    ms.year = null;
    ms.chart = null;
    ms.step = 'need_anchor';
    return { ok: true, reply: `Sure. Give me a year between ${MUSIC_RANGE_START} and ${MUSIC_RANGE_END}.`, followUp: null };
  }

  return { ok: true, reply: `Now tell me one of these:\n• Top 10\n• #1\n• Story moment`, followUp: ['Top 10', '#1', 'Story moment'] };
}

// -----------------------------
// GENERAL ROUTER
// -----------------------------
async function routeMessage(message, sessionId, context) {
  const s = getSession(sessionId);
  const msg = asText(message);
  const msgLower = msg.toLowerCase();

  const explicitMusic =
    msgLower === 'music' ||
    /\b(top\s*10|#1|year-end|year end|yearend|hot 100|top40weekly|rpm|uk singles)\b/i.test(msgLower) ||
    !!extractYear(msg);

  if (explicitMusic) {
    const out = await handleMusic(msg, sessionId);
    s.last.domain = 'music';
    s.last.followUp = out.followUp ? { kind: 'choice', options: out.followUp, prompt: 'Pick one.' } : null;
    s.last.followSig = followUpSignature(s.last.followUp);
    return out;
  }

  if (intentClassifier && typeof intentClassifier.classify === 'function') {
    try {
      const intent = intentClassifier.classify(msg);
      if (intent === 'music') {
        const out = await handleMusic('music', sessionId);
        s.last.domain = 'music';
        s.last.followUp = out.followUp ? { kind: 'choice', options: out.followUp, prompt: 'Pick one.' } : null;
        s.last.followSig = followUpSignature(s.last.followUp);
        return out;
      }
    } catch (_) {}
  }

  const out = {
    ok: true,
    mode: 'general',
    reply: 'What would you like to explore next?',
    followUp: { kind: 'choice', options: ['Music', 'Sandblast info', 'Sponsors', 'Site help'], prompt: 'Pick one.' },
    meta: { flow: 'general_v1' },
  };

  s.last.domain = 'general';
  s.last.followUp = out.followUp;
  s.last.followSig = followUpSignature(out.followUp);
  s.last.meta = out.meta;
  return out;
}

// -----------------------------
// DEBUG SNAPSHOT (safe)
// -----------------------------
let LAST_DEBUG = {
  at: null,
  sessionId: null,
  route: null,
  message: null,
  build: BUILD_TAG
};

function setLastDebug(sessionId, route, message) {
  LAST_DEBUG = {
    at: new Date().toISOString(),
    sessionId: asText(sessionId) || 'anon',
    route,
    message: asText(message),
    build: BUILD_TAG
  };
}

// -----------------------------
// ROUTES
// -----------------------------
app.get('/api/health', (req, res) => {
  const tts = {
    provider: asText(process.env.TTS_PROVIDER || 'elevenlabs') || 'elevenlabs',
    configured: true,
    hasApiKey: Boolean(process.env.ELEVENLABS_API_KEY || process.env.OPENAI_API_KEY),
    hasVoiceId: Boolean(process.env.ELEVENLABS_VOICE_ID || process.env.OPENAI_TTS_VOICE),
    hasModelId: Boolean(process.env.ELEVENLABS_MODEL_ID || process.env.OPENAI_TTS_MODEL),
  };

  res.status(200).json({
    ok: true,
    service: 'sandblast-backend',
    env: ENV,
    host: HOST,
    port: PORT,
    time: new Date().toISOString(),
    tts,
    music: {
      coverageBuiltAt: MUSIC_COVERAGE.builtAt,
      coverageRange: MUSIC_COVERAGE.range,
      charts: Array.isArray(MUSIC_COVERAGE.charts) ? MUSIC_COVERAGE.charts : [],
    },
  });
});

app.post('/api/debug/reload-music-coverage', (req, res) => {
  const rebuilt = rebuildMusicCoverage();
  res.status(200).json({
    ok: true,
    rebuiltAt: rebuilt.builtAt,
    charts: rebuilt.charts,
  });
});

app.get('/api/debug/last', (req, res) => {
  const token = asText(req.query?.token);
  const expected = asText(process.env.DEBUG_TOKEN);

  if (expected && token !== expected) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  res.status(200).json({ ok: true, ...LAST_DEBUG });
});

app.post('/api/chat', async (req, res) => {
  const body = (req && req.body && typeof req.body === 'object') ? req.body : null;

  const message = asText(body && body.message);
  const sessionId = asText(body && body.sessionId) || 'anon';
  const context = (body && body.context && typeof body.context === 'object') ? body.context : {};

  setLastDebug(sessionId, '/api/chat', message);

  if (!message) {
    return res.status(200).json({ ok: false, error: 'NO_MESSAGE', message: 'Missing "message" in request.' });
  }

  try {
    const out = await routeMessage(message, sessionId, context);
    return res.status(200).json(toOutputSafe(out || {}));
  } catch (e) {
    _crashLog('CHAT_HANDLER_FAIL', { rid: req?._rid, message: e?.message, stack: e?.stack });
    return res.status(200).json({ ok: false, error: 'SERVER_ERROR', message: 'Nyx hit an internal error.' });
  }
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

server.on('listening', async () => {
  const addr = server.address();
  console.log('[Nyx] listening confirmed:', addr);
  console.log(`[Nyx] up on ${HOST}:${PORT} env=${ENV} timeout=${DEFAULT_TIMEOUT_MS}ms build=${BUILD_TAG}`);
  _crashLog('LISTENING', { addr, HOST, PORT, pid: process.pid, build: BUILD_TAG });

  const probeHost = (HOST === '0.0.0.0') ? '127.0.0.1' : HOST;
  const ok = await selfProbe(probeHost, PORT);
  console.log('[Nyx] self-probe tcp:', ok ? 'OK' : 'FAILED');
  _crashLog('SELF_PROBE', { probeHost, PORT, ok });
});

server.on('close', () => _crashLog('SERVER_CLOSE'));

server.on('error', (err) => {
  const code = err && err.code ? String(err.code) : 'UNKNOWN';
  console.error(`[Nyx] listen error (${code}):`, err && err.message ? err.message : err);
  _crashLog('LISTEN_ERROR', { code, message: err?.message, stack: err?.stack });
  process.exit(1);
});

// -----------------------------
// HARD KEEP-ALIVE (Windows / PowerShell / piped output safe)
// -----------------------------
(function hardKeepAlive() {
  // Hold stdin open when available; harmless when not.
  try {
    if (process.stdin) {
      process.stdin.resume();
    }
  } catch (_) {}

  // Ensure server keeps the event loop alive (belt & suspenders)
  try {
    if (server && typeof server.ref === 'function') server.ref();
  } catch (_) {}

  // Keep an explicit timer handle that cannot be optimized away
  let ticks = 0;
  const ka = setInterval(() => {
    ticks++;
    // Intentionally no logging (avoid spam). Existence of ticks prevents "empty callback" edge cases.
    global.__NYX_TICKS__ = ticks;
  }, 60_000);

  // Retain handle explicitly
  global.__NYX_KEEPALIVE__ = ka;
})();
