/**
 * Sandblast Backend — Nyx Intelligence Layer (Hardened)
 * index.js (BULLETPROOF – JSON-safe, anti-loop follow-up, guarded debug)
 */

'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

let intentClassifier = null;
let musicKnowledge = null;

try { intentClassifier = require('./Utils/intentClassifier'); } catch (_) {}
try { musicKnowledge = require('./Utils/musicKnowledge'); } catch (_) {}

// -----------------------------
// CONFIG
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'production';

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);

// Debug endpoint gate (default OFF in production)
const ENABLE_DEBUG_LAST =
  String(process.env.ENABLE_DEBUG_LAST || '').toLowerCase() === 'true' ||
  NODE_ENV !== 'production';

// Optional shared secret header to view debug in prod even if enabled.
// If set, requests must include: X-Debug-Token: <token>
const DEBUG_TOKEN = String(process.env.DEBUG_TOKEN || '').trim();

// Basic in-memory rate limiting (no deps)
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120); // per IP per window

const ALLOWED_ORIGINS = new Set([
  'https://sandblast.channel',
  'https://www.sandblast.channel',
  'https://sandblastchannel.com',
  'https://www.sandblastchannel.com',
  'https://sandblast-channel-e69060.design.webflow.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

// -----------------------------
// APP SETUP
// -----------------------------
const app = express();
app.disable('x-powered-by');

// Trust proxy (Render/Cloudflare/etc.) so req.ip is meaningful.
// Safe default for typical reverse proxy setups.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));

// ✅ JSON parse error handler (fixes invalid/empty JSON body)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: 'BAD_JSON',
      message: 'Request body is empty or invalid JSON.'
    });
  }
  return next(err);
});

// -----------------------------
// CORS (deterministic block)
// -----------------------------
const corsOptions = {
  origin(origin, cb) {
    // allow non-browser requests
    if (!origin) return cb(null, true);

    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    if (/^https:\/\/.*\.webflow\.com$/.test(origin)) return cb(null, true);

    // Block deterministically (we will translate this into 403 JSON)
    const e = new Error('CORS blocked');
    e.code = 'CORS_BLOCKED';
    return cb(e);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'X-Debug-Token']
};

app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err && err.code === 'CORS_BLOCKED') {
      return res.status(403).json({
        ok: false,
        error: 'CORS_BLOCKED',
        message: 'Origin is not allowed.'
      });
    }
    return next(err);
  });
});

// Explicit preflight support (prevents intermittent Webflow/CORS oddities)
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
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms rid=${req.rid}`
    );
  });

  next();
});

// -----------------------------
// BASIC RATE LIMIT (in-memory)
// -----------------------------
const RL = new Map(); // ip -> { count, resetAt }
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
    return res.status(429).json({
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Too many requests. Please retry shortly.',
      retryAfterSec
    });
  }

  return next();
});

// -----------------------------
// DEBUG STATE
// -----------------------------
const LAST = { at: null, rid: null, request: null, response: null, meta: null, error: null };

// FIX: proper spread (your current file has a syntax crash here) :contentReference[oaicite:2]{index=2}
const setLast = (o) => Object.assign(LAST, { at: new Date().toISOString(), ...(o || {}) });

// -----------------------------
// SESSION FOLLOW-UP MEMORY (anti-loop)
// -----------------------------
const SESS = new Map(); // sessionId -> { lastFollowUpSig, lastFollowUpKind, lastUpdatedAt }
const SESS_TTL_MS = Number(process.env.SESS_TTL_MS || 30 * 60_000); // 30 min

function getSession(sessionId) {
  const sid = String(sessionId || 'anon');
  const now = Date.now();
  let s = SESS.get(sid);
  if (!s || (now - s.lastUpdatedAt) > SESS_TTL_MS) {
    s = { lastFollowUpSig: null, lastFollowUpKind: null, lastUpdatedAt: now };
    SESS.set(sid, s);
  } else {
    s.lastUpdatedAt = now;
  }
  return s;
}

function followUpSignature(fu) {
  if (!fu || typeof fu !== 'object') return '';
  const kind = String(fu.kind || '');
  const prompt = String(fu.prompt || '');
  const req = Array.isArray(fu.required) ? fu.required.join('|') : '';
  const opts = Array.isArray(fu.options) ? fu.options.join('|') : '';
  return `${kind}::${prompt}::${req}::${opts}`.trim();
}

// -----------------------------
// HELPERS
// -----------------------------
const asText = (x) => (x == null ? '' : String(x).trim());

function toOutputSafe(out) {
  // Ensure we always return a JSON-safe shape with reply string.
  const safe = (out && typeof out === 'object') ? out : {};
  const reply = asText(safe.reply) || 'Okay.';
  const ok = (typeof safe.ok === 'boolean') ? safe.ok : true;

  const normalized = { ...safe, ok, reply };
  if (normalized.followUp != null && typeof normalized.followUp !== 'object') {
    delete normalized.followUp;
  }
  return normalized;
}

/**
 * enforceAdvance
 * - ensures reply always exists
 * - ensures followUp exists (unless explicitly disabled)
 * - preserves ok/error fields (does NOT overwrite ok=true on failures)
 * - anti-loop: if the same followUp repeats, switch to a choice fork
 */
function enforceAdvance(out, { userText, sessionId, intent }) {
  const base = toOutputSafe(out);

  // If caller intentionally disables follow-up, respect it
  if (base.followUp === null) return base;

  const hasReply = !!asText(base.reply);
  const hasFollowUp = !!(base.followUp && typeof base.followUp === 'object');

  // Provide defaults if missing
  if (!hasReply) base.reply = 'Okay.';

  if (!hasFollowUp) {
    // Slotfill default is fine, but we must avoid loop on repeat.
    base.followUp = {
      kind: 'slotfill',
      required: ['artist+year OR song title'],
      prompt: 'To anchor the moment, give me an artist + year (or a song title).'
    };
  }

  // Anti-loop behavior: don’t repeat the same exact follow-up endlessly
  const s = getSession(sessionId);
  const sig = followUpSignature(base.followUp);

  if (sig && sig === s.lastFollowUpSig) {
    // If we’re repeating, switch to a fork that helps the user progress.
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

  // Store follow-up memory for next turn
  s.lastFollowUpSig = followUpSignature(base.followUp);
  s.lastFollowUpKind = String(base.followUp?.kind || '');
  s.lastUpdatedAt = Date.now();

  // Optional: light hinting for music intent if the fallback is too generic
  const looksMusic =
    intent?.domain === 'music_history' ||
    /#1|number\s*one|billboard|hot\s*100|top\s*40|song|artist|19\d{2}|20\d{2}/i.test(userText || '');

  if (looksMusic && base.followUp?.kind === 'choice') {
    // Keep it music-relevant
    base.followUp.prompt = base.followUp.prompt || 'Pick one to keep the music flow going.';
  }

  return base;
}

// -----------------------------
// ROUTES
// -----------------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sandblast-backend',
    env: NODE_ENV,
    time: new Date().toISOString()
  });
});

app.get('/api/debug/last', (req, res) => {
  if (!ENABLE_DEBUG_LAST) {
    return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  }
  if (DEBUG_TOKEN) {
    const token = asText(req.headers['x-debug-token']);
    if (!token || token !== DEBUG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
  }
  return res.json({ ok: true, last: LAST });
});

app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'EMPTY_BODY',
        message: 'JSON body is required.'
      });
    }

    const message = asText(req.body.message);
    const sessionId = asText(req.body.sessionId) || 'anon';
    const context = (req.body.context && typeof req.body.context === 'object') ? req.body.context : {};

    if (!message) {
      const out = enforceAdvance(
        { ok: true, reply: 'I didn’t receive a message.' },
        { userText: message, sessionId, intent: { domain: 'general' } }
      );
      setLast({ rid: req.rid, request: req.body, response: out });
      return res.status(200).json(out);
    }

    // Intent classification
    let intent = { primary: 'general', domain: 'general' };
    if (intentClassifier?.classify) {
      try {
        intent = intentClassifier.classify(message, context) || intent;
      } catch (e) {
        // Don’t fail request if classifier fails
        intent = { primary: 'general', domain: 'general', classifierError: true };
      }
    }

    const looksMusic =
      intent.domain === 'music_history' ||
      /#1|number\s*one|billboard|hot\s*100|top\s*40|song|artist|19\d{2}|20\d{2}/i.test(message);

    let out = null;

    // Primary music route
    if (looksMusic && musicKnowledge?.handleMessage) {
      try {
        out = await musicKnowledge.handleMessage(message, {
          sessionId,
          context,
          intent,
          signal: controller.signal
        });
      } catch (e) {
        // If we were aborted due to timeout, handle below.
        out = {
          ok: false,
          error: 'MUSIC_KNOWLEDGE_ERROR',
          reply: 'I hit a snag pulling that music moment. Try again, or give me a song title and year to narrow it.'
        };
      }
    }

    // Timeout/abort handling (return 504)
    if (controller.signal.aborted) {
      const outAbort = enforceAdvance(
        {
          ok: false,
          error: 'TIMEOUT',
          reply: 'That request took too long. Please resend, or simplify your query (artist + year works best).'
        },
        { userText: message, sessionId, intent }
      );
      setLast({ rid: req.rid, request: req.body, response: outAbort, meta: { intent }, error: 'aborted' });
      return res.status(504).json(outAbort);
    }

    // Fallback route
    if (!out) {
      out = {
        ok: true,
        reply: looksMusic
          ? 'I can do that—let’s anchor it first.'
          : 'What would you like to explore next?',
        followUp: looksMusic
          ? {
              kind: 'slotfill',
              required: ['artist+year OR song title'],
              prompt: 'Give me an artist + year (or a song title).'
            }
          : {
              kind: 'choice',
              options: ['Music moment', 'Sandblast info', 'Sponsors', 'Site help'],
              prompt: 'Pick one.'
            }
      };
    }

    // Final normalization + anti-loop follow-up enforcement
    out = enforceAdvance(out, { userText: message, sessionId, intent });

    setLast({
      rid: req.rid,
      request: req.body,
      response: out,
      meta: { intent, looksMusic }
    });

    return res.status(200).json(out);
  } catch (err) {
    // Preserve ok=false (do NOT overwrite to ok=true like your current enforceAdvance did) :contentReference[oaicite:3]{index=3}
    const out = enforceAdvance(
      {
        ok: false,
        error: 'SERVER_ERROR',
        reply: 'Something went wrong. Please resend your last message.'
      },
      { userText: asText(req?.body?.message), sessionId: asText(req?.body?.sessionId) || 'anon', intent: { domain: 'general' } }
    );

    setLast({
      rid: req.rid,
      request: req.body,
      response: out,
      error: String(err?.message || err)
    });

    return res.status(500).json(out);
  } finally {
    clearTimeout(timer);
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'NOT_FOUND' });
});

// Last-resort error middleware (keeps errors JSON)
app.use((err, req, res, next) => {
  console.error(`[ERROR] rid=${req?.rid || 'n/a'}`, err);
  if (res.headersSent) return next(err);
  return res.status(500).json({
    ok: false,
    error: 'UNHANDLED_ERROR',
    message: 'Unexpected server error.'
  });
});

app.listen(PORT, () => {
  console.log(`[Nyx] up on ${PORT} — intel-layer hardened env=${NODE_ENV} timeout=${REQUEST_TIMEOUT_MS}ms`);
});
