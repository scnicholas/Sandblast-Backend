/**
 * Sandblast Backend — Nyx Intelligence Layer
 * Hardened + Orchestrator + Music Flow V1 (with stickiness + chart integrity)
 *
 * PATCHES INCLUDED:
 * - Choice option rewrite: "Top 10" -> "Another moment" (until true Top 10 list exists)
 * - Chart disclosure: if usedFallback + usedChart != requestedChart, disclose and offer switch
 * - Reply text sanitizer: removes legacy "Top 10" / "another random moment" phrasing from engine replies
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

/**
 * Session schema (expanded):
 * - lastFollowUpSig / lastFollowUpKind
 * - lastFollowUpOptions: string[] (for interpreting "yes")
 * - lastFlow: 'music'|'general'|null
 * - music state
 */
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
        year: null,
        artist: null,
        title: null,
        step: 'need_anchor', // 'need_anchor'|'need_chart'|'serve_moment'|'next_step'
        lastMomentSig: null
      }
    };
    SESS.set(sid, s);
  } else {
    s.lastUpdatedAt = now;
    if (!s.music) s.music = { chart: null, year: null, artist: null, title: null, step: 'need_anchor', lastMomentSig: null };
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

/**
 * PATCH (copy-only): sanitize legacy phrasing in music replies.
 * This prevents the UI from showing "Top 10" or "another random moment" when we aren't returning a ranked list.
 */
function sanitizeMusicReplyText(reply) {
  if (!reply) return reply;
  let text = String(reply);

  // Replace "Top 10" language (incl. "Top 10 for 1984") with "another moment"
  text = text.replace(/Top\s*10(\s*for\s*\d{4})?/gi, 'another moment');

  // Normalize "another random moment" -> "another moment"
  text = text.replace(/another\s+random\s+moment/gi, 'another moment');

  return text;
}

/**
 * PATCH: rewrite misleading choice labels for V1.
 * We currently return a single "moment", not a ranked Top 10 list.
 */
function rewriteChoiceOptionsForV1(followUp, meta) {
  if (!followUp || followUp.kind !== 'choice' || !Array.isArray(followUp.options)) return followUp;

  const usedFallback = !!meta?.usedFallback;
  const usedChart = asText(meta?.usedChart);
  const requestedChart = asText(meta?.requestedChart);

  const next = { ...followUp };
  next.options = followUp.options.map((opt) => {
    const s = String(opt || '').trim();

    // "Top 10 (1984)" -> "Another moment (1984)"
    if (/^Top\s*10\s*\(\d{4}\)$/i.test(s)) {
      const y = (s.match(/\b(19\d{2}|20\d{2})\b/) || [])[1];
      return y ? `Another moment (${y})` : 'Another moment';
    }

    // "Top 10" -> "Another moment"
    if (/^Top\s*10$/i.test(s)) return 'Another moment';

    return s;
  });

  // If a fallback happened, ensure switching is always possible
  if (usedFallback && usedChart && requestedChart && usedChart !== requestedChart) {
    if (!next.options.some(o => /switch\s+chart/i.test(String(o)))) next.options.push('Switch chart');
  }

  return next;
}

/**
 * PATCH: chart disclosure if engine fell back to a different chart.
 * Adds a short note and ensures "Switch chart" is available.
 */
function applyChartDisclosure(out, sessionMusic) {
  if (!out || typeof out !== 'object') return out;

  const requested = asText(out?.meta?.requestedChart || sessionMusic?.chart);
  const used = asText(out?.meta?.usedChart);
  const usedFallback = !!out?.meta?.usedFallback;

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

  return next;
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

  // Anti-loop: if same follow-up repeats, switch to a fork
  const sigPre = followUpSignature(base.followUp);
  if (sigPre && sigPre === s.lastFollowUpSig) {
    base.followUp = {
      kind: 'choice',
      options: [
        'Give artist + year',
        'Give a song title',
        'Switch chart (Billboard / UK / Canada RPM / Top40Weekly)'
      ],
      prompt: 'Quick choice: how do you want to continue?'
    };
  }

  // PATCH: rewrite misleading choice labels (Top 10 -> Another moment)
  base.followUp = rewriteChoiceOptionsForV1(base.followUp, base.meta);

  // Store last follow-up options for "yes" resolution later
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
    /#1|number\s*one|billboard|hot\s*100|uk\s*singles|canada\s*rpm|top40weekly|top\s*40|song|artist|19\d{2}|20\d{2}/i
      .test(userText || '');

  if (looksMusic && base.followUp?.kind === 'choice') {
    base.followUp.prompt = base.followUp.prompt || 'Pick one to keep the music flow going.';
  }

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
  // Stickiness: if we are mid-music flow, treat short replies as music too
  if (session?.music?.step && session.music.step !== 'need_anchor' && session.lastFlow === 'music') return true;
  if (intent?.domain === 'music_history') return true;
  return /#1|number\s*one|billboard|hot\s*100|uk\s*singles|canada\s*rpm|top40weekly|top\s*40|song|artist|19\d{2}|20\d{2}/i
    .test(message || '');
}

async function runMusicFlowV1({ message, sessionId, context, intent, signal }) {
  const s = getSession(sessionId);
  const ms = s.music;

  // Apply chart selection priority: text > context > session > default
  const textChart = normalizeChart(parseChartFromText(message));
  const ctxChart = normalizeChart(context?.chart);
  const chosenChart = normalizeChart(textChart || ctxChart || ms.chart || DEFAULT_CHART);

  const year = parseYear(message);
  const anchor = parseAnchor(message);

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

  const targeted = (() => {
    const parts = [];
    if (ms.title) parts.push(`"${ms.title}"`);
    if (ms.artist) parts.push(`by ${ms.artist}`);
    if (ms.year) parts.push(String(ms.year));
    return parts.join(' ').trim();
  })() || message;

  let out = null;
  if (musicKnowledge?.handleMessage) {
    out = await musicKnowledge.handleMessage(targeted, {
      sessionId,
      context: { ...(context || {}), chart: ms.chart },
      intent,
      signal
    });
  }

  // If musicKnowledge returns nothing, keep rails
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

  // PATCH (copy-only): sanitize legacy reply text
  safeOut.reply = sanitizeMusicReplyText(safeOut.reply);

  // CHART INTEGRITY GUARD (hard stop if silent chart swap)
  const requestedChart = ms.chart;
  const usedChart = asText(safeOut?.meta?.usedChart) || null;
  const usedFallback = !!safeOut?.meta?.usedFallback;

  if (usedFallback && usedChart && requestedChart && usedChart !== requestedChart) {
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

  // Normal path: store lastMomentSig and ensure next-step fork exists
  const momentSig = [requestedChart || '', ms.year || '', ms.artist || '', ms.title || '', asText(safeOut.reply).slice(0, 80)].join('|');
  ms.lastMomentSig = momentSig;
  ms.step = 'next_step';

  if (!safeOut.followUp) {
    safeOut.followUp = {
      kind: 'choice',
      options: ['Next moment (same year)', 'Switch chart', 'Jump to another year', 'Ask about a specific artist/song'],
      prompt: 'Where do you want to go next?'
    };
  }

  safeOut.mode = safeOut.mode || 'music';
  safeOut.meta = { ...(safeOut.meta || {}), flow: 'music_v1', step: ms.step, chart: requestedChart, year: ms.year || null };

  // PATCH: if fallback metadata exists (even in “normal path”), prepend disclosure and add Switch chart
  return applyChartDisclosure(safeOut, ms);
}

// -----------------------------
// CONVERSATION ORCHESTRATOR
// -----------------------------
async function orchestrateChat({ message, sessionId, context, intent, signal }) {
  const s = getSession(sessionId);

  // If user says "yes/ok/sure" after a choice prompt, interpret as first option.
  if (isAffirmation(message) && s.lastFollowUpKind === 'choice' && Array.isArray(s.lastFollowUpOptions) && s.lastFollowUpOptions.length) {
    message = String(s.lastFollowUpOptions[0]); // map "yes" → first option
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
      meta: {
        intent,
        session: getSession(sessionId)
      }
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
