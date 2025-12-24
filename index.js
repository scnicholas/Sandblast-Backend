/**
 * Sandblast Backend — Nyx Intelligence Layer
 * Hardened + Orchestrator + Music Flow V1 (with stickiness + chart integrity)
 *
 * CRITICAL PATCHES (2025-12-24):
 * - Fix looping: explicit handlers for "another moment", "#1 only", "top 10 <year>", "yes"
 * - Keep music flow sticky when session lastFlow === 'music'
 * - "Top 10" gracefully degraded (until true Top 10 list exists): respond + offer next action
 * - Moment-line drift fix strengthened + targeted fix for known Whitesnake row drift
 * - Chart disclosure once-per-session after fallback accepted
 * - Robust chart switching / continue-with behavior
 */

'use strict';

// -----------------------------
// CRASH VISIBILITY
// -----------------------------
process.on('uncaughtException', (err) => {
  console.error('[FATAL] UNCAUGHT EXCEPTION:', err);
  process.exitCode = 1;
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] UNHANDLED REJECTION:', reason);
  process.exitCode = 1;
});
process.on('SIGINT', () => { console.log('[Nyx] SIGINT received. Shutting down.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[Nyx] SIGTERM received. Shutting down.'); process.exit(0); });

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); }
catch (e) { console.error('[WARN] Failed to load ./Utils/intentClassifier:', e?.message || e); }

try { musicKnowledge = require('./Utils/musicKnowledge'); }
catch (e) { console.error('[WARN] Failed to load ./Utils/musicKnowledge:', e?.message || e); }

// -----------------------------
// CONFIG
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'production';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);

const ENABLE_DEBUG_LAST =
  String(process.env.ENABLE_DEBUG_LAST || '').toLowerCase() === 'true' ||
  NODE_ENV !== 'production';

const DEBUG_TOKEN = String(process.env.DEBUG_TOKEN || '').trim();

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);

const SESS_TTL_MS = Number(process.env.SESS_TTL_MS || 30 * 60_000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 15000);

const DEFAULT_CHART = 'Billboard Hot 100';

const ALLOWED_ORIGINS = new Set([
  'https://sandblast.channel',
  'https://www.sandblast.channel',
  'https://sandblastchannel.com',
  'https://www.sandblastchannel.com',
  'https://sandblast-channel-e69060.design.webflow.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

// -----------------------------
// APP SETUP
// -----------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'BAD_JSON', message: 'Request body is empty or invalid JSON.' });
  }
  return next(err);
});

// -----------------------------
// CORS
// -----------------------------
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    if (/^https:\/\/.*\.webflow\.com$/.test(origin)) return cb(null, true);
    const e = new Error('CORS blocked'); e.code = 'CORS_BLOCKED';
    return cb(e);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'X-Debug-Token']
};

app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err && err.code === 'CORS_BLOCKED') {
      return res.status(403).json({ ok: false, error: 'CORS_BLOCKED', message: 'Origin is not allowed.' });
    }
    return next(err);
  });
});
app.options('*', cors(corsOptions));

// -----------------------------
// REQUEST ID + LOGGING
// -----------------------------
app.use((req, res, next) => {
  const rid = req.headers['x-request-id'] || crypto.randomUUID();
  req.rid = String(rid);
  res.setHeader('X-Request-Id', req.rid);

  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms rid=${req.rid}`);
  });

  next();
});

// -----------------------------
// RATE LIMIT (in-memory)
// -----------------------------
const RL = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  const current = RL.get(ip);
  if (!current || now > current.resetAt) {
    RL.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ ok: false, error: 'RATE_LIMITED', message: 'Too many requests. Please retry shortly.', retryAfterSec });
  }

  return next();
});

// -----------------------------
// DEBUG LAST
// -----------------------------
const LAST = { at: null, rid: null, request: null, response: null, meta: null, error: null };
const setLast = (o) => Object.assign(LAST, { at: new Date().toISOString(), ...(o || {}) });

// -----------------------------
// SESSION STATE
// -----------------------------
const SESS = new Map();

function getSession(sessionId) {
  const sid = String(sessionId || 'anon');
  const now = Date.now();
  let s = SESS.get(sid);

  if (!s || (now - s.lastUpdatedAt) > SESS_TTL_MS) {
    s = {
      lastFollowUpSig: null,
      lastFollowUpKind: null,
      lastFollowUpOptions: null,
      lastFlow: null,
      lastUpdatedAt: now,
      music: {
        chart: null,
        acceptedChart: null,
        year: null,
        artist: null,
        title: null,
        step: 'need_anchor',
        lastMomentSig: null,
        disclosedFallbackForChart: null // suppress repeated disclosure after acceptance
      }
    };
    SESS.set(sid, s);
  } else {
    s.lastUpdatedAt = now;
    if (!s.music) s.music = { chart: null, acceptedChart: null, year: null, artist: null, title: null, step: 'need_anchor', lastMomentSig: null, disclosedFallbackForChart: null };
    if (!('acceptedChart' in s.music)) s.music.acceptedChart = null;
    if (!('disclosedFallbackForChart' in s.music)) s.music.disclosedFallbackForChart = null;
  }
  return s;
}

// -----------------------------
// HELPERS
// -----------------------------
const asText = (x) => (x == null ? '' : String(x).trim());

function followUpSignature(fu) {
  if (!fu || typeof fu !== 'object') return '';
  const kind = String(fu.kind || '');
  const prompt = String(fu.prompt || '');
  const req = Array.isArray(fu.required) ? fu.required.join('|') : '';
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

function isAffirmation(text) {
  return /^(y|yes|yeah|yep|sure|ok|okay|alright|sounds good)$/i.test(asText(text));
}

function isNumberOneOnly(text) {
  const t = asText(text).toLowerCase();
  return t === '#1 only' || t === '#1' || t === 'number 1' || t === 'number one' || t === 'no. 1 only' || t === 'no 1 only';
}

function isAnotherMoment(text) {
  const t = asText(text).toLowerCase();
  return t === 'another' || t === 'another moment' || /^another moment\s*\(\s*\d{4}\s*\)$/i.test(asText(text));
}

function parseTopTenRequest(text) {
  const t = asText(text).toLowerCase();
  const m = t.match(/\btop\s*10\b(?:\s*(?:for)?\s*(19\d{2}|20\d{2}))?/i);
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : null;
  return { year: Number.isFinite(year) ? year : null };
}

/**
 * SAFE sanitizer (must NOT corrupt "Top 100")
 */
function sanitizeMusicReplyText(reply) {
  if (!reply) return reply;
  let text = String(reply);

  // Normalize “another moment” language (do not touch Top 100)
  text = text.replace(/\banother\s+random\s+moment\b/gi, 'another moment');
  text = text.replace(/\bthe\s+another\s+moment\b/gi, 'another moment');
  text = text.replace(/\banother\s+moment\s*,\s*another\s+moment\b/gi, 'another moment');

  return text;
}

/**
 * Fixes observed drift in Moment line (presentation layer).
 * Adds a targeted hard-fix for known Whitesnake drift:
 *   "Love Whitesnake — Is This (1988, ...)" -> "Whitesnake — Is This Love (1988, ...)"
 */
function fixMomentLineDrift(reply) {
  if (!reply) return reply;
  let text = String(reply);

  // Targeted hard-fix (known bad record)
  text = text.replace(
    /(Moment:\s*)Love\s+Whitesnake\s*—\s*Is\s+This(\s*\(\s*1988\s*,)/i,
    '$1Whitesnake — Is This Love$2'
  );

  // Generic heuristic for common “spill word” drift
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

  // If artist starts with a spill-word, shift it into the title
  if (artistParts.length >= 2 && spill.has(artistParts[0])) {
    const moved = artistParts.shift();
    artist = artistParts.join(' ');
    title = (title + ' ' + moved).trim();
  }

  const fixedSegment = `${prefix}${artist} — ${title} ${tail}`;
  text = text.replace(re, fixedSegment);

  return text;
}

/**
 * Rewrite choice options for V1:
 * - Replace any "Top 10" option with "Another moment"
 * - Preserve "#1 only"
 */
function rewriteChoiceOptionsForV1(followUp, meta) {
  if (!followUp || followUp.kind !== 'choice' || !Array.isArray(followUp.options)) return followUp;

  const usedFallback = !!meta?.usedFallback;
  const usedChart = asText(meta?.usedChart);
  const requestedChart = asText(meta?.requestedChart);

  const next = { ...followUp };
  next.options = followUp.options.map((opt) => {
    const s = String(opt || '').trim();

    if (/^Top\s*10\s*\(\d{4}\)$/i.test(s)) return 'Another moment';
    if (/^Top\s*10\b/i.test(s)) return 'Another moment';

    return s;
  });

  if (usedFallback && usedChart && requestedChart && usedChart !== requestedChart) {
    if (!next.options.some(o => /switch\s+chart/i.test(String(o)))) next.options.push('Switch chart');
  }

  return next;
}

function applyChartDisclosure(out, sessionMusic) {
  if (!out || typeof out !== 'object') return out;

  const requested = asText(out?.meta?.requestedChart || sessionMusic?.chart);
  const used = asText(out?.meta?.usedChart);
  const usedFallback = !!out?.meta?.usedFallback;

  // suppress repeat disclosures after user has accepted the fallback chart in this session
  const disclosed = asText(sessionMusic?.disclosedFallbackForChart);
  if (disclosed && used && disclosed === used) return out;

  const accepted = asText(sessionMusic?.acceptedChart);
  if (accepted && used && accepted === used) return out;

  if (!usedFallback || !requested || !used || used === requested) return out;

  const note = `Note: I couldn’t access **${requested}** for that lookup, so I’m using **${used}** instead.\n\n`;

  const next = { ...out };
  next.reply = note + asText(out.reply);

  if (next.followUp && typeof next.followUp === 'object' && next.followUp.kind === 'choice' && Array.isArray(next.followUp.options)) {
    const opts = next.followUp.options.map(String);
    if (!opts.some(o => /switch/i.test(o))) opts.push('Switch chart');
    next.followUp = { ...next.followUp, options: opts };
  } else if (!next.followUp) {
    next.followUp = {
      kind: 'choice',
      options: [`Continue with ${used}`, 'Switch chart'],
      prompt: 'Do you want to continue with the fallback chart, or switch?'
    };
  }

  next.reply = fixMomentLineDrift(next.reply);
  return next;
}

function parseChartControl(message) {
  const t = asText(message);

  const mContinue = t.match(/^continue\s+with\s+(.+)$/i);
  if (mContinue && mContinue[1]) return { action: 'continue_with', chart: mContinue[1].trim() };

  const mSwitchTo = t.match(/^switch\s+to\s+(.+)$/i);
  if (mSwitchTo && mSwitchTo[1]) return { action: 'switch_to', chart: mSwitchTo[1].trim() };

  if (/^switch\s+chart$/i.test(t) || /switch\s+chart/i.test(t)) return { action: 'switch_picker' };

  return null;
}

function enforceAdvance(out, { userText, sessionId, intent }) {
  const base = toOutputSafe(out);
  const s = getSession(sessionId);

  if (base.followUp === null) return base;

  if (!(base.followUp && typeof base.followUp === 'object')) {
    base.followUp = {
      kind: 'slotfill',
      required: ['artist+year OR song title'],
      prompt: 'To anchor the moment, give me an artist + year (or a song title).'
    };
  }

  const sigPre = followUpSignature(base.followUp);
  if (sigPre && sigPre === s.lastFollowUpSig) {
    base.followUp = {
      kind: 'choice',
      options: [
        'Another moment',
        '#1 only',
        'Switch chart'
      ],
      prompt: 'Quick choice: want another moment, #1 only, or switch chart?'
    };
  }

  base.followUp = rewriteChoiceOptionsForV1(base.followUp, base.meta);

  if (base.followUp.kind === 'choice' && Array.isArray(base.followUp.options)) {
    s.lastFollowUpOptions = base.followUp.options.map(String);
  } else {
    s.lastFollowUpOptions = null;
  }

  s.lastFollowUpSig = followUpSignature(base.followUp);
  s.lastFollowUpKind = String(base.followUp?.kind || '');
  s.lastUpdatedAt = Date.now();

  const looksMusic =
    intent?.domain === 'music_history' ||
    /#1|number\s*one|billboard|hot\s*100|uk\s*singles|canada\s*rpm|top40weekly|top\s*40|song|artist|moment|19\d{2}|20\d{2}/i
      .test(userText || '');

  if (looksMusic && base.followUp?.kind === 'choice') {
    base.followUp.prompt = base.followUp.prompt || 'Pick one to keep the music flow going.';
  }

  base.reply = fixMomentLineDrift(base.reply);
  return base;
}

// -----------------------------
// MUSIC FLOW V1
// -----------------------------
function normalizeChart(raw) {
  const t = asText(raw);
  if (!t) return null;
  if (/top40weekly/i.test(t)) return 'Top40Weekly Top 100';
  if (/billboard|hot\s*100/i.test(t)) return 'Billboard Hot 100';
  if (/uk\s*singles|official\s*charts/i.test(t)) return 'UK Singles';
  if (/canada\s*rpm|rpm/i.test(t)) return 'Canada RPM';
  return t;
}

function parseYear(message) {
  const m = asText(message).match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (Number.isFinite(y) && y >= 1900 && y <= 2099) return y;
  return null;
}

function parseChartFromText(message) {
  const t = asText(message).toLowerCase();
  if (!t) return null;
  if (t.includes('top40weekly') || t.includes('top 40 weekly') || t.includes('top40 weekly')) return 'Top40Weekly Top 100';
  if (t.includes('hot 100') || t.includes('billboard')) return 'Billboard Hot 100';
  if (t.includes('uk singles') || t.includes('official charts')) return 'UK Singles';
  if (t.includes('canada rpm') || (t.includes('rpm') && t.includes('canada'))) return 'Canada RPM';
  return null;
}

function parseAnchor(message) {
  const text = asText(message);
  const q = text.match(/"([^"]{2,120})"/);
  if (q && q[1]) return { title: q[1].trim() };
  const by = text.match(/\bby\s+([A-Za-z0-9&'.\- ]{2,80})\b/i);
  if (by && by[1]) return { artist: by[1].trim() };
  return {};
}

function detectMusicIntent(intent, message, session) {
  // Strong stickiness: if lastFlow is music, treat it as music unless clearly non-music.
  if (session?.lastFlow === 'music') return true;

  if (session?.music?.step && session.music.step !== 'need_anchor' && session.lastFlow === 'music') return true;
  if (intent?.domain === 'music_history') return true;

  return /#1|number\s*one|billboard|hot\s*100|uk\s*singles|canada\s*rpm|top40weekly|top\s*40|song|artist|moment|19\d{2}|20\d{2}/i
    .test(message || '');
}

async function runMusicFlowV1({ message, sessionId, context, intent, signal }) {
  const s = getSession(sessionId);
  const ms = s.music;

  // Normalize quick button texts that should advance the flow
  const tRaw = asText(message);

  // If user clicked "Another moment (1984)" or typed "another"
  if (isAnotherMoment(tRaw)) {
    const y = parseYear(tRaw);
    if (y) ms.year = y;

    // Clear title/artist filters so we truly get a new moment (unless you want it sticky later)
    ms.title = null;
    ms.artist = null;

    // Keep chart sticky
    ms.step = 'serve_moment';

    // Re-route into the normal serve_moment path by setting a targeted query
    message = ms.year ? String(ms.year) : 'another moment';
  }

  // Handle "Top 10 <year>" requests without looping
  const topTenReq = parseTopTenRequest(tRaw);
  if (topTenReq) {
    if (topTenReq.year) ms.year = topTenReq.year;

    const y = ms.year || topTenReq.year;
    ms.step = 'next_step';

    return {
      ok: true,
      mode: 'music',
      reply:
        `I don’t have a true **Top 10 list** endpoint wired yet.\n\n` +
        `But I *can* do either of these right now:\n` +
        `• pull a strong **music moment** for ${y ? `**${y}**` : 'a year you choose'}\n` +
        `• or do **#1 only** (needs a year + chart)\n\n` +
        `Which do you want?`,
      followUp: {
        kind: 'choice',
        options: [
          y ? `Another moment (${y})` : 'Another moment',
          '#1 only',
          'Switch chart'
        ],
        prompt: 'Pick one.'
      },
      meta: { flow: 'music_v1', step: ms.step, intent: 'top10_not_ready', year: y || null, chart: ms.chart || null }
    };
  }

  // -----------------------------
  // "#1 only" path — prevents loop
  // -----------------------------
  if (isNumberOneOnly(tRaw)) {
    if (!ms.year) {
      ms.step = 'need_anchor';
      return {
        ok: true,
        mode: 'music',
        reply: 'For **#1 only**, I need a year. What year should I use?',
        followUp: { kind: 'slotfill', required: ['year'], prompt: 'Type a year (e.g., 1987).' },
        meta: { flow: 'music_v1', step: ms.step, intent: 'number_one', chart: ms.chart || null }
      };
    }

    const chartForN1 = normalizeChart(ms.chart || DEFAULT_CHART);

    let outN1 = null;
    if (musicKnowledge?.handleMessage) {
      const query = `${ms.year} #1`;
      outN1 = await musicKnowledge.handleMessage(query, {
        sessionId,
        context: { ...(context || {}), chart: chartForN1, numberOneOnly: true },
        intent: { ...(intent || {}), domain: 'music_history', force: 'number_one' },
        signal
      });
    }

    const safeN1 = toOutputSafe(outN1 || {});
    safeN1.reply = sanitizeMusicReplyText(safeN1.reply);
    safeN1.reply = fixMomentLineDrift(safeN1.reply);

    // If engine still returned a generic "Moment:" result, stop the loop and ask for chart support.
    if (/^moment:/i.test(asText(safeN1.reply))) {
      ms.step = 'need_chart';
      return {
        ok: true,
        mode: 'music',
        reply:
          `I’m not getting a clean **#1-only** result from the source yet.\n\n` +
          `Pick a chart and I’ll try again for **${ms.year}**:\n` +
          `• Billboard Hot 100\n• UK Singles\n• Canada RPM\n• Top40Weekly Top 100`,
        followUp: {
          kind: 'choice',
          options: ['Switch to Billboard Hot 100', 'Switch to UK Singles', 'Switch to Canada RPM', 'Switch to Top40Weekly Top 100'],
          prompt: 'Pick a chart.'
        },
        meta: { flow: 'music_v1', step: ms.step, intent: 'number_one_needs_chart', year: ms.year, chart: chartForN1 }
      };
    }

    ms.step = 'next_step';
    return applyChartDisclosure({
      ok: true,
      mode: 'music',
      reply: safeN1.reply,
      followUp: {
        kind: 'choice',
        options: ['Another moment', '#1 only', 'Switch chart'],
        prompt: 'Want another moment, #1 only, or switch chart?'
      },
      meta: { ...(safeN1.meta || {}), flow: 'music_v1', step: ms.step, intent: 'number_one', year: ms.year, chart: chartForN1 }
    }, ms);
  }

  // -----------------------------
  // Chart control commands
  // -----------------------------
  const ctl = parseChartControl(tRaw);
  if (ctl) {
    if (ctl.action === 'switch_picker') {
      ms.step = 'need_chart';
      return {
        ok: true,
        mode: 'music',
        reply: 'Sure — which chart do you want to use?',
        followUp: { kind: 'choice', options: ['Billboard Hot 100', 'UK Singles', 'Canada RPM', 'Top40Weekly Top 100'], prompt: 'Pick a chart.' },
        meta: { flow: 'music_v1', step: ms.step, chart: ms.chart || null }
      };
    }

    if (ctl.action === 'continue_with') {
      const chosen = normalizeChart(ctl.chart);
      if (chosen) {
        ms.chart = chosen;
        ms.acceptedChart = chosen;
        ms.disclosedFallbackForChart = chosen; // lock suppression of repeating disclosure
      }
      message = ''; // fall through to normal path
    }

    if (ctl.action === 'switch_to') {
      const chosen = normalizeChart(ctl.chart);
      if (chosen) {
        ms.chart = chosen;
        ms.acceptedChart = null;
        ms.disclosedFallbackForChart = null; // allow disclosure again if needed
      }
      message = ''; // fall through
    }
  }

  // Chart selection priority: text > context > session > default
  const textChart = normalizeChart(parseChartFromText(tRaw));
  const ctxChart = normalizeChart(context?.chart);
  const chosenChart = normalizeChart(textChart || ctxChart || ms.chart || DEFAULT_CHART);

  const year = parseYear(tRaw);
  const anchor = parseAnchor(tRaw);

  if (year) ms.year = year;
  if (anchor.artist) ms.artist = anchor.artist;
  if (anchor.title) ms.title = anchor.title;

  ms.chart = chosenChart;

  const hasAnyAnchor = !!(ms.year || ms.artist || ms.title);

  if (!hasAnyAnchor) ms.step = 'need_anchor';
  else if (!ms.chart) ms.step = 'need_chart';
  else ms.step = 'serve_moment';

  if (ms.step === 'need_anchor') {
    return {
      ok: true,
      mode: 'music',
      reply: 'Let’s lock in one anchor so I can pull the right music moment.',
      followUp: { kind: 'slotfill', required: ['artist+year OR song title'], prompt: 'Give me an artist + year (or a song title).' },
      meta: { flow: 'music_v1', step: ms.step, chart: ms.chart || null }
    };
  }

  if (ms.step === 'need_chart') {
    return {
      ok: true,
      mode: 'music',
      reply: 'Which chart do you want?',
      followUp: { kind: 'choice', options: ['Billboard Hot 100', 'UK Singles', 'Canada RPM', 'Top40Weekly Top 100'], prompt: 'Pick a chart.' },
      meta: { flow: 'music_v1', step: ms.step }
    };
  }

  // Build targeted query
  const targeted = (() => {
    const parts = [];
    if (ms.title) parts.push(`"${ms.title}"`);
    if (ms.artist) parts.push(`by ${ms.artist}`);
    if (ms.year) parts.push(String(ms.year));
    return parts.join(' ').trim();
  })() || tRaw;

  let out = null;
  if (musicKnowledge?.handleMessage) {
    out = await musicKnowledge.handleMessage(targeted, {
      sessionId,
      context: { ...(context || {}), chart: ms.chart },
      intent,
      signal
    });
  }

  if (!out || typeof out !== 'object') {
    ms.step = 'next_step';
    return {
      ok: true,
      mode: 'music',
      reply: `I’m ready—tell me what you want to use for **${ms.chart}**.`,
      followUp: {
        kind: 'choice',
        options: [
          ms.year ? `Use year ${ms.year}` : 'Give a year',
          ms.artist ? `Use artist ${ms.artist}` : 'Give an artist',
          ms.title ? `Use title "${ms.title}"` : 'Give a song title',
          'Switch chart'
        ],
        prompt: 'Pick one.'
      },
      meta: { flow: 'music_v1', step: ms.step, chart: ms.chart }
    };
  }

  const safeOut = toOutputSafe(out);
  safeOut.reply = sanitizeMusicReplyText(safeOut.reply);
  safeOut.reply = fixMomentLineDrift(safeOut.reply);

  const requestedChart = ms.chart;
  const usedChart = asText(safeOut?.meta?.usedChart) || null;
  const usedFallback = !!safeOut?.meta?.usedFallback;

  // If user has accepted fallback chart, suppress further disclosure
  if (usedFallback && usedChart && ms.acceptedChart && ms.acceptedChart === usedChart) {
    ms.chart = usedChart;
    ms.disclosedFallbackForChart = usedChart;
  } else if (usedFallback && usedChart && requestedChart && usedChart !== requestedChart) {
    ms.step = 'need_chart';
    return {
      ok: true,
      mode: 'music',
      reply:
        `I can answer this, but your data source fell back from **${requestedChart}** to **${usedChart}**.\n\n` +
        `Do you want me to continue with **${usedChart}**, or switch charts?`,
      followUp: {
        kind: 'choice',
        options: [
          `Continue with ${usedChart}`,
          'Switch to Billboard Hot 100',
          'Switch to UK Singles',
          'Switch to Canada RPM',
          'Switch to Top40Weekly Top 100'
        ],
        prompt: 'Pick one.'
      },
      meta: { flow: 'music_v1', step: ms.step, requestedChart, usedChart, usedFallback: true }
    };
  }

  ms.lastMomentSig = [requestedChart || '', ms.year || '', ms.artist || '', ms.title || '', asText(safeOut.reply).slice(0, 80)].join('|');
  ms.step = 'next_step';

  // Guarantee a follow-up that advances (prevents user feeling “stuck”)
  if (!safeOut.followUp) {
    safeOut.followUp = {
      kind: 'choice',
      options: ['Another moment', '#1 only', 'Switch chart'],
      prompt: 'Want another moment, #1 only, or switch chart?'
    };
  }

  safeOut.followUp = rewriteChoiceOptionsForV1(safeOut.followUp, safeOut.meta);

  safeOut.mode = safeOut.mode || 'music';
  safeOut.meta = { ...(safeOut.meta || {}), flow: 'music_v1', step: ms.step, chart: requestedChart, year: ms.year || null };

  return applyChartDisclosure(safeOut, ms);
}

// -----------------------------
// CONVERSATION ORCHESTRATOR
// -----------------------------
async function orchestrateChat({ message, sessionId, context, intent, signal }) {
  const s = getSession(sessionId);

  // Make "yes" actually advance the music flow (not the first option blindly)
  if (isAffirmation(message) && s.lastFollowUpKind === 'choice' && Array.isArray(s.lastFollowUpOptions) && s.lastFollowUpOptions.length) {
    // Prefer "Another moment" if present (prevents “yes” mapping to deprecated Top 10 option)
    const preferred =
      s.lastFollowUpOptions.find(o => /^another\b/i.test(String(o))) ||
      s.lastFollowUpOptions[0];

    message = String(preferred);
  }

  const looksMusic = detectMusicIntent(intent, message, s);

  if (looksMusic) {
    s.lastFlow = 'music';
    return await runMusicFlowV1({ message, sessionId, context, intent, signal });
  }

  s.lastFlow = 'general';
  return {
    ok: true,
    reply: 'What would you like to explore next?',
    followUp: { kind: 'choice', options: ['Music moment', 'Sandblast info', 'Sponsors', 'Site help'], prompt: 'Pick one.' },
    meta: { flow: 'general_v1' }
  };
}

// -----------------------------
// ROUTES
// -----------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'sandblast-backend', env: NODE_ENV, time: new Date().toISOString() });
});

app.get('/api/debug/last', (req, res) => {
  if (!ENABLE_DEBUG_LAST) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  if (DEBUG_TOKEN) {
    const token = asText(req.headers['x-debug-token']);
    if (!token || token !== DEBUG_TOKEN) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  return res.json({ ok: true, last: LAST });
});

app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ ok: false, error: 'EMPTY_BODY', message: 'JSON body is required.' });
    }

    let message = asText(req.body.message);
    const sessionId = asText(req.body.sessionId) || 'anon';
    const context = (req.body.context && typeof req.body.context === 'object') ? req.body.context : {};

    if (!message) {
      const out0 = enforceAdvance({ ok: true, reply: 'I didn’t receive a message.' }, { userText: message, sessionId, intent: { domain: 'general' } });
      setLast({ rid: req.rid, request: req.body, response: out0 });
      return res.status(200).json(out0);
    }

    let intent = { primary: 'general', domain: 'general' };
    if (intentClassifier?.classify) {
      try {
        intent = intentClassifier.classify(message, context) || intent;
      } catch (e) {
        console.error('[WARN] intentClassifier.classify failed:', e?.message || e);
        intent = { primary: 'general', domain: 'general', classifierError: true };
      }
    }

    let out = await orchestrateChat({ message, sessionId, context, intent, signal: controller.signal });

    if (controller.signal.aborted) {
      const outAbort = enforceAdvance(
        { ok: false, error: 'TIMEOUT', reply: 'That request took too long. Please resend, or simplify your query (artist + year works best).' },
        { userText: message, sessionId, intent }
      );
      setLast({ rid: req.rid, request: req.body, response: outAbort, meta: { intent }, error: 'aborted' });
      return res.status(504).json(outAbort);
    }

    out = enforceAdvance(out, { userText: message, sessionId, intent });

    setLast({
      rid: req.rid,
      request: req.body,
      response: out,
      meta: { intent, session: getSession(sessionId) }
    });

    return res.status(200).json(out);
  } catch (err) {
    const out = enforceAdvance(
      { ok: false, error: 'SERVER_ERROR', reply: 'Something went wrong. Please resend your last message.' },
      { userText: asText(req?.body?.message), sessionId: asText(req?.body?.sessionId) || 'anon', intent: { domain: 'general' } }
    );

    setLast({ rid: req.rid, request: req.body, response: out, error: String(err?.message || err) });
    return res.status(500).json(out);
  } finally {
    clearTimeout(timer);
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));

app.use((err, req, res, next) => {
  console.error(`[ERROR] rid=${req?.rid || 'n/a'}`, err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ ok: false, error: 'UNHANDLED_ERROR', message: 'Unexpected server error.' });
});

// -----------------------------
// LISTEN (explicit bind logging + heartbeat)
// -----------------------------
let server = null;

try {
  server = app.listen(PORT, () => {
    const addr = server.address();
    const host = addr && typeof addr === 'object' ? addr.address : '0.0.0.0';
    const port = addr && typeof addr === 'object' ? addr.port : PORT;

    console.log(`[Nyx] listening on ${host}:${port} — env=${NODE_ENV} timeout=${REQUEST_TIMEOUT_MS}ms`);

    if (HEARTBEAT_MS > 0) {
      setInterval(() => {
        console.log(`[Nyx] heartbeat ok — ${new Date().toISOString()} (port=${port})`);
      }, HEARTBEAT_MS).unref?.();
    }
  });

  server.on('error', (e) => {
    console.error('[FATAL] server.listen error:', e?.code || '', e?.message || e);
    process.exit(1);
  });
} catch (e) {
  console.error('[FATAL] listen() threw:', e?.message || e);
  process.exit(1);
}
