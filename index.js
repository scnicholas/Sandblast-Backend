/**
 * Sandblast Backend — Nyx Intelligence Layer
 * Hardened Orchestrator + Music Flow V1
 *
 * Fixes:
 * - Stops "Top 10" text from being rewritten into "another moment"
 * - Adds session-based Conversation Orchestrator (no looping)
 * - Implements Top 10 (V1) using 10 unique moments for the requested year
 * - Makes follow-up choices actionable (Another moment / #1 only / Top 10)
 * - Treats "yes/ok" after a choice as selecting the first option
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

// -----------------------------
// CONFIG
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const ENV = String(process.env.NODE_ENV || process.env.ENV || 'production').toLowerCase();
const DEFAULT_TIMEOUT_MS = Number(process.env.NYX_TIMEOUT_MS || 20000);
const DEFAULT_CHART = 'Billboard Hot 100';

// -----------------------------
// MIDDLEWARE (JSON + safety)
// -----------------------------
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Robust JSON parsing. If body is invalid, we return a clean BAD_JSON.
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
        followUp: null,     // last followUp object
        followSig: '',      // signature for the followUp
        meta: null
      },
      music: {
        chart: null,
        acceptedChart: null,
        year: null,
        artist: null,
        title: null,
        step: 'need_anchor',     // need_anchor | anchored
        lastMomentSig: null
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
  const t = asText(chart).toLowerCase();
  if (!t) return DEFAULT_CHART;
  if (t.includes('top40weekly') || t.includes('top 40 weekly') || t.includes('top40 weekly')) return 'Top40Weekly Top 100';
  if (t.includes('hot 100') || t.includes('billboard')) return 'Billboard Hot 100';
  if (t.includes('uk singles') || t.includes('official charts')) return 'UK Singles';
  if (t.includes('canada rpm') || (t.includes('rpm') && t.includes('canada'))) return 'Canada RPM';
  return chart;
}

function extractYear(text) {
  const m = asText(text).match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (Number.isFinite(y) && y >= 1900 && y <= 2099) return y;
  return null;
}

function isAffirmation(text) {
  return /^(y|yes|yeah|yep|sure|ok|okay|alright|sounds good)$/i.test(asText(text));
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
  // supports: "top 10 1989", "top10 1989", "top 10 for 1989", "top 10 (1989)"
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

/**
 * DO NOT rewrite user meaning. Only fix obvious duplication / punctuation issues.
 * (This function used to rewrite "Top 10" into "another moment" — removed.)
 */
function sanitizeMusicReplyText(reply) {
  if (!reply) return reply;
  let text = String(reply);

  // normalize duplicated commas or repeated “another moment”
  text = text.replace(/\banother\s+moment\s*,\s*another\s+moment\b/gi, 'another moment');
  text = text.replace(/\bthe\s+another\s+moment\b/gi, 'another moment');

  // clean weird trailing tokens like "another moment0"
  text = text.replace(/another moment\s*0\b/gi, 'another moment');

  return text;
}

/**
 * Fixes observed field drift in Moment line:
 * Example: "Moment: Love Whitesnake — Is This (1988, ...)"
 * -> "Moment: Whitesnake — Is This Love (1988, ...)"
 *
 * Presentation layer only; ingest should still be fixed later.
 */
function fixMomentLineDrift(reply) {
  if (!reply) return reply;
  const text = String(reply);

  const re = /(Moment:\s*)([^—\n]+?)\s*—\s*([^( \n][^(\n]*?)\s*(\(\s*\d{4}\s*,)/i;
  const m = text.match(re);
  if (!m) return text;

  const prefix = m[1];
  let artist = m[2].trim();
  let title = m[3].trim();
  const tail = m[4];

  const spill = new Set(['Love', 'The', 'A', 'An', 'My', 'Your', 'Our', 'This', 'That', 'One', 'No', 'Yes']);

  const artistParts = artist.split(/\s+/).filter(Boolean);
  const titleParts = title.split(/\s+/).filter(Boolean);

  if (artistParts.length >= 2 && titleParts.length <= 3 && spill.has(artistParts[0])) {
    const moved = artistParts.shift();
    artist = artistParts.join(' ');
    title = (title + ' ' + moved).trim();
  }

  const fixedSegment = `${prefix}${artist} — ${title} ${tail}`;
  return text.replace(re, fixedSegment);
}

async function callMusicEngine(query, sessionId, context, timeoutMs) {
  if (!musicKnowledge || typeof musicKnowledge.handleMessage !== 'function') {
    return { ok: true, mode: 'music', reply: 'Music engine is not available yet.' };
  }

  const signal = AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;

  try {
    return await musicKnowledge.handleMessage(query, {
      sessionId,
      context: context || {},
      signal
    });
  } catch (e) {
    return {
      ok: false,
      mode: 'music',
      error: 'MUSIC_ENGINE_ERROR',
      message: asText(e?.message) || 'Music engine error.'
    };
  }
}

async function getTop10V1(year, chart, sessionId, baseContext, timeoutMs) {
  // V1: return 10 unique moments for the year (fast, deterministic-enough, works now)
  const picks = [];
  const seen = new Set();

  for (let i = 0; i < 30 && picks.length < 10; i++) {
    const out = await callMusicEngine(String(year), sessionId, { ...(baseContext || {}), chart }, timeoutMs);
    const safe = toOutputSafe(out || {});
    const rep = asText(safe.reply);
    const sig = rep.slice(0, 220).toLowerCase();
    if (rep && !seen.has(sig)) {
      seen.add(sig);
      picks.push(rep);
    }
  }

  const lines = picks.slice(0, 10).map((r, idx) => {
    // extract "Moment: X — Y (YEAR, CHART)." if present; else use full line
    const m = r.match(/Moment:\s*([^\n]+)/i);
    const core = m ? m[1].trim() : r.trim();
    return `${idx + 1}. ${core}`;
  });

  const reply = [
    `Top 10 (V1) — **${year}** (${chart}).`,
    '',
    ...(lines.length ? lines : ['I couldn’t assemble a Top 10 list right now. Try “another moment” or “#1 only”.']),
    '',
    'Want **another moment**, **#1 only**, or **Top 10 (another year)**?'
  ].join('\n');

  return {
    ok: true,
    mode: 'music',
    reply,
    followUp: {
      kind: 'choice',
      options: ['another moment', '#1 only', 'Top 10 (another year)'],
      prompt: 'Pick one: another moment, #1 only, or Top 10 (another year).'
    },
    meta: { flow: 'music_v1', step: 'top10', year, chart, top10v1: true }
  };
}

// -----------------------------
// MUSIC ORCHESTRATOR
// -----------------------------
async function handleMusic(message, sessionId, context, timeoutMs) {
  const s = getSession(sessionId);
  const ms = s.music;

  // chart preference
  const reqChart = normalizeChart((context && context.chart) ? context.chart : (ms.chart || DEFAULT_CHART));
  ms.chart = reqChart;

  // If user is answering a follow-up choice and says "yes/ok", pick first option
  if (s.last.followUp && s.last.followUp.kind === 'choice' && isAffirmation(message)) {
    const first = Array.isArray(s.last.followUp.options) ? s.last.followUp.options[0] : null;
    if (first) message = first;
  }

  // Top 10 request (direct)
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
        meta: { flow: 'music_v1', step: ms.step, intent: 'top10', chart: reqChart }
      };
    }
    ms.year = y;
    ms.step = 'anchored';
    return await getTop10V1(y, reqChart, sessionId, context, timeoutMs);
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
        meta: { flow: 'music_v1', step: ms.step, intent: 'another_moment', chart: reqChart }
      };
    }

    const out = await callMusicEngine(String(ms.year), sessionId, { ...(context || {}), chart: reqChart }, timeoutMs);
    const safe = toOutputSafe(out || {});
    safe.reply = fixMomentLineDrift(sanitizeMusicReplyText(safe.reply));

    // Keep anchored and present consistent follow-up
    safe.mode = 'music';
    safe.followUp = {
      kind: 'choice',
      options: ['Top 10', 'another moment', '#1 only'],
      prompt: 'Pick one: Top 10, another moment, or #1 only.'
    };
    safe.meta = { ...(safe.meta || {}), flow: 'music_v1', step: 'next_step', year: ms.year, chart: reqChart };
    return safe;
  }

  // "#1 only"
  if (isNumberOneOnly(message)) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'For **#1 only**, I need a year. What year should I use?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1987).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'number_one', chart: reqChart }
      };
    }

    const out = await callMusicEngine(`${ms.year} #1`, sessionId, { ...(context || {}), chart: reqChart, numberOneOnly: true }, timeoutMs);
    const safe = toOutputSafe(out || {});
    safe.reply = fixMomentLineDrift(sanitizeMusicReplyText(safe.reply));

    // prevent loop: always return next action
    safe.mode = 'music';
    safe.followUp = {
      kind: 'choice',
      options: ['another moment', 'Top 10', 'change year'],
      prompt: 'Pick one: another moment, Top 10, or change year.'
    };
    safe.meta = { ...(safe.meta || {}), flow: 'music_v1', step: 'number_one', year: ms.year, chart: reqChart };
    return safe;
  }

  // Slotfill year from user input
  const y = extractYear(message);
  if (y) {
    ms.year = y;
    ms.step = 'anchored';

    const out = await callMusicEngine(String(y), sessionId, { ...(context || {}), chart: reqChart }, timeoutMs);
    const safe = toOutputSafe(out || {});
    safe.reply = fixMomentLineDrift(sanitizeMusicReplyText(safe.reply));

    safe.mode = 'music';
    safe.followUp = {
      kind: 'choice',
      options: ['Top 10', 'another moment', '#1 only'],
      prompt: 'Pick one: Top 10, another moment, or #1 only.'
    };
    safe.meta = { ...(safe.meta || {}), flow: 'music_v1', step: 'next_step', year: y, chart: reqChart };
    return safe;
  }

  // If user typed "Top 10" without year, treat as top10 using last year
  if (/^top\s*10$/i.test(asText(message))) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'For **Top 10**, I need a year. What year?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1989).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'top10', chart: reqChart }
      };
    }
    return await getTop10V1(ms.year, reqChart, sessionId, context, timeoutMs);
  }

  // Fallback: try engine as-is, but keep convo sticky and guided
  const out = await callMusicEngine(message, sessionId, { ...(context || {}), chart: reqChart }, timeoutMs);
  const safe = toOutputSafe(out || {});
  safe.reply = fixMomentLineDrift(sanitizeMusicReplyText(safe.reply));

  safe.mode = 'music';
  safe.followUp = safe.followUp || {
    kind: 'choice',
    options: ['Top 10', 'another moment', '#1 only'],
    prompt: 'Pick one: Top 10, another moment, or #1 only.'
  };
  safe.meta = { ...(safe.meta || {}), flow: 'music_v1', step: 'next_step', year: ms.year || null, chart: reqChart };
  return safe;
}

// -----------------------------
// GENERAL ORCHESTRATOR
// -----------------------------
async function routeMessage(message, sessionId, context, timeoutMs) {
  const s = getSession(sessionId);

  // If UI mode says music, stay music
  const uiMode = asText(context && context.mode);
  if (uiMode && uiMode.toLowerCase() === 'music') {
    const out = await handleMusic(message, sessionId, context, timeoutMs);
    s.last.domain = 'music';
    s.last.followUp = out.followUp || null;
    s.last.followSig = followUpSignature(out.followUp);
    s.last.meta = out.meta || null;
    return out;
  }

  // Heuristic routing for music
  const t = asText(message).toLowerCase();
  const looksMusic = /top\s*10|top10|#1\s*only|number\s*one|hot\s*100|billboard|uk\s*singles|canada\s*rpm|top40weekly|\b(19\d{2}|20\d{2})\b/.test(t);

  if (looksMusic) {
    const out = await handleMusic(message, sessionId, context, timeoutMs);
    s.last.domain = 'music';
    s.last.followUp = out.followUp || null;
    s.last.followSig = followUpSignature(out.followUp);
    s.last.meta = out.meta || null;
    return out;
  }

  // Default: general response
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
    time: new Date().toISOString()
  });
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
// START
// -----------------------------
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Nyx] up on ${PORT} — intel-layer orchestrator env=${ENV} timeout=${DEFAULT_TIMEOUT_MS}ms`);
});
