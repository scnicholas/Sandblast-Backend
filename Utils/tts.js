'use strict';

/**
 * Utils/tts.js
 *
 * Hardened TTS handler for Nyx/Nix (Nexus voice)
 *
 * Provider order (config-driven, resilient):
 *   1) Resemble (PRIMARY)     - if configured
 *   2) ElevenLabs (DISABLED by default) - only if SB_TTS_ENABLE_ELEVENLABS=true
 *   3) OpenAI TTS (OPTIONAL)  - if enabled via SB_TTS_FALLBACK_PROVIDER=openai
 *   4) Deterministic JSON error
 *
 * Contract:
 *   - Exports: handleTts(req, res)
 *   - Never throws upward
 *   - Returns audio/mpeg by default
 *
 * 10-phase alignment:
 *   Phase 1  Social Warmth Hooks      : preset mapping via mood/intent + greeting bias
 *   Phase 2  State Spine Reinforcement: accepts stateHints; sets X-SB-* headers; stable traceId
 *   Phase 3  Resilience Layer         : retry cap, timeout guards, vendor health cooldown
 *   Phase 4  Provider Routing         : Resemble primary, ElevenLabs fallback, OpenAI optional tier
 *   Phase 5  Deterministic Failures   : consistent JSON error envelope; avoid accidental 500s
 *   Phase 6  Latency Instrumentation  : X-SB-TTS-* headers + optional JSON log line
 *   Phase 7  Cache & De-dupe          : small in-memory cache keyed by provider/voice/settings/text
 *   Phase 8  Heartbeat/Health Probe   : {healthCheck:true} returns health JSON
 *   Phase 9  Payload Hygiene          : cleanText, maxChars guard, firstSentenceOnly mode
 *   Phase 10 Ops Safety               : no secret logging; safe debug; vendor down cooldown
 *
 * Env (Resemble primary):
 *   - RESEMBLE_API_TOKEN (or RESEMBLE_API_TOKEN or RESEMBLE_API_KEY)
 *   - RESEMBLE_VOICE_UUID (or RESEMBLE_VOICE_UUID)
 *   - RESEMBLE_OUTPUT_FORMAT ("mp3"|"wav", default "mp3")
 *   - RESEMBLE_TIMEOUT_MS (default 15000)
 *
 * Env (Eleven (optional) fallback):
 *   - SB_TTS_ENABLE_ELEVENLABS ("true"/"false", default false)
 *   - ELEVENLABS_API_KEY
 *   - NYX_VOICE_ID (or ELEVENLABS_VOICE_ID)
 *   - ELEVENLABS_MODEL_ID (default: eleven_multilingual_v2)
 *   - ELEVENLABS_HOST (default: api.elevenlabs.io)
 *   - ELEVENLABS_TTS_TIMEOUT_MS (default 15000)
 *   - ELEVENLABS_TTS_RETRY_ONCE ("true"/"false", default true)
 *   - ELEVENLABS_TTS_MAX_CHARS (default 1200)
 *   - ELEVENLABS_TTS_MAX_SOCKETS (default 16)
 *
 * Optional OpenAI fallback:
 *   - SB_TTS_FALLBACK_PROVIDER ("openai"|"none", default "none")
 *   - OPENAI_API_KEY
 *   - OPENAI_TTS_MODEL (default gpt-4o-mini-tts)
 *   - OPENAI_TTS_VOICE (default alloy)
 *   - OPENAI_TTS_FORMAT (default mp3)
 *   - OPENAI_TTS_URL (default api.openai.com/v1/audio/speech)
 *   - OPENAI_TTS_TIMEOUT_MS (default 20000)
 *
 * Logging:
 *   - SB_TTS_LOG_JSON ("true"/"false", default false)
 */

const https = require('https');
const _resembleProvider = (() => {
  // Support both historical filenames to avoid silent no-audio regressions.
  // Priority: explicit provider file first, then legacy names.
  const candidates = ['./TTSProvidersResemble', './ttsProvidersresemble', './providersResemble', './providersResemble.js', './ttsProvidersresemble.js', './TTSProvidersResemble.js'];
  for (const p of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require(p);
      if (mod && typeof mod.synthesize === 'function') return mod;
    } catch (_) {}
  }
  return null;
})();

const resembleSynthesize = _resembleProvider && typeof _resembleProvider.synthesize === 'function'
  ? _resembleProvider.synthesize
  : null;
const resembleVendorHealth = _resembleProvider && typeof _resembleProvider.getVendorHealth === 'function'
  ? _resembleProvider.getVendorHealth
  : null;

// Keep sockets warm (Phase 10)
const KEEPALIVE = true;
const MAX_SOCKETS = (() => {
  const n = parseInt(String(process.env.ELEVENLABS_TTS_MAX_SOCKETS || ''), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(64, n)) : 16;
})();
const keepAliveAgent = new https.Agent({ keepAlive: KEEPALIVE, maxSockets: MAX_SOCKETS });

// -----------------------------
// Cache (Phase 7)
// -----------------------------
const _cache = { map: new Map() };

function nowMs() { return Date.now(); }

function bool(x, fallback) {
  const s = String(x == null ? '' : x).trim().toLowerCase();
  if (!s) return fallback;
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return fallback;
}

function clampInt(x, fallback, lo, hi) {
  const n = parseInt(String(x || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function num01(x, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function cacheEnabled() { return bool(process.env.SB_TTS_CACHE, true); }
function cacheTtlMs() { return clampInt(process.env.SB_TTS_CACHE_TTL_MS, 30000, 2000, 300000); }
function cacheMaxEntries() { return clampInt(process.env.SB_TTS_CACHE_MAX, 64, 8, 512); }

function elevenEnabled() { return bool(process.env.SB_TTS_ENABLE_ELEVENLABS, false); }

function cacheKey({ provider, voiceId, modelId, voiceSettings, text }) {
  const vs = voiceSettings ? JSON.stringify(voiceSettings) : '';
  const raw = `${provider || ''}|${voiceId || ''}|${modelId || ''}|${vs}|${text || ''}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `k_${(h >>> 0).toString(16)}`;
}

function cacheGet(key) {
  try {
    if (!cacheEnabled()) return null;
    const it = _cache.map.get(key);
    if (!it) return null;
    if ((nowMs() - it.at) > cacheTtlMs()) {
      _cache.map.delete(key);
      return null;
    }
    return it;
  } catch (_) { return null; }
}

function cacheSet(key, buf, meta) {
  try {
    if (!cacheEnabled()) return;
    const max = cacheMaxEntries();
    while (_cache.map.size >= max) {
      const firstKey = _cache.map.keys().next().value;
      if (!firstKey) break;
      _cache.map.delete(firstKey);
    }
    _cache.map.set(key, { at: nowMs(), buf, meta: meta || null });
  } catch (_) {}
}

// -----------------------------
// Health (Phase 8)
// -----------------------------
const hb = {
  status: 'unknown', // ok|degraded|down|unknown
  lastCheckAt: 0,
  lastOkAt: 0,
  failStreak: 0,
  lastError: null,
  lastUpstreamStatus: null,
  lastUpstreamMs: null,
  lastFailAt: 0,
};

function hbIntervalMs() { return clampInt(process.env.SB_TTS_HEARTBEAT_INTERVAL_MS, 120000, 15000, 3600000); }
function hbCooldownMs() { return clampInt(process.env.SB_TTS_HEARTBEAT_COOLDOWN_MS, 30000, 5000, 600000); }

function updateHealth(ok, meta) {
  hb.lastCheckAt = nowMs();
  if (ok) {
    hb.status = 'ok';
    hb.lastOkAt = hb.lastCheckAt;
    hb.failStreak = 0;
    hb.lastError = null;
  } else {
    hb.failStreak = (hb.failStreak || 0) + 1;
    hb.status = hb.failStreak >= 2 ? 'down' : 'degraded';
    hb.lastError = meta && meta.error ? String(meta.error).slice(0, 220) : 'unknown';
    hb.lastFailAt = hb.lastCheckAt;
  }
  if (meta && meta.upstreamStatus != null) hb.lastUpstreamStatus = meta.upstreamStatus;
  if (meta && meta.upstreamMs != null) hb.lastUpstreamMs = meta.upstreamMs;
}

function shouldAutoProbe() { return (nowMs() - hb.lastCheckAt) >= hbIntervalMs(); }

function shouldBypassPrimaryLiveAttempt() {
  const t = nowMs();
  if (hb.status === 'down') {
    const base = hbCooldownMs();
    const mult = (hb.failStreak && hb.failStreak >= 3) ? 2 : 1;
    return (t - hb.lastCheckAt) < (base * mult);
  }
  if (hb.status === 'degraded' && hb.failStreak >= 2) {
    return (t - hb.lastCheckAt) < Math.max(5000, Math.floor(hbCooldownMs() * 0.5));
  }
  return false;
}

// -----------------------------
// Helpers
// -----------------------------
function safeJson(res, status, obj) {
  try { res.status(status).json(obj); }
  catch (_) {
    try { res.status(status).type('text/plain').send(String(obj && obj.message ? obj.message : 'error')); }
    catch (_) {}
  }
}

function readBody(req) {
  const b = req && req.body;
  if (!b) return {};
  if (typeof b === 'string') return { text: b.trim() };
  if (typeof b === 'object' && b) return b;
  return {};
}

function wantsBase64(body) {
  const r = String((body && body.return) || (body && body.response) || '').trim().toLowerCase();
  return r === 'base64' || r === 'json';
}

function sendAudio(res, req, { body, buf, headers, mimeType }) {
  if (wantsBase64(body)) {
    try {
      const b64 = buf ? buf.toString('base64') : '';
      const out = { ok: true, audio_b64: b64, bytes: buf ? buf.length : 0 };
      if (headers && typeof headers === 'object') out.headers = headers;
      return safeJson(res, 200, out);
    } catch (_) {}
  }
  res.status(200);
  res.set('Content-Type', mimeType || 'audio/mpeg');
  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', 'inline; filename="nyx_tts.mp3"');
  if (req.aborted || res.writableEnded) return;
  return res.send(buf);
}

function cleanText(input) {
  const s = String(input || '');
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function firstSentence(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  if (m && m[1]) return m[1].trim();
  return t.slice(0, 180).trim();
}

function makeTraceId(provided) {
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  if (provided) {
    const p = String(provided).trim();
    if (p && p.length <= 64) return p.replace(/[^\w\-:.]/g, '_');
  }
  return `tts_${t}_${rnd.slice(0, 8)}`;
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function jitterSleep(msBase) {
  const ms = Math.max(0, Math.floor(msBase + Math.random() * 120));
  return new Promise((r) => setTimeout(r, ms));
}

// -----------------------------
// Voice settings (Phase 1)
// -----------------------------
function presetVoiceSettings(presetKey, envDefaults) {
  const base = {
    stability: envDefaults.stability,
    similarity_boost: envDefaults.similarity_boost,
    style: envDefaults.style,
    use_speaker_boost: envDefaults.use_speaker_boost,
  };

  switch (String(presetKey || '').toUpperCase()) {
    case 'NYX_CALM':
      return { ...base, stability: clamp01(base.stability + 0.18), style: clamp01(base.style - 0.08) };
    case 'NYX_COACH':
      return { ...base, stability: clamp01(base.stability + 0.10), style: clamp01(base.style + 0.10) };
    case 'NYX_WARM':
      return { ...base, stability: clamp01(base.stability + 0.04), style: clamp01(base.style + 0.22) };
    default:
      return base;
  }
}

function mergeVoiceSettings({ envDefaults, presetKey, body }) {
  const fromPreset = presetVoiceSettings(presetKey, envDefaults);

  const tp = (body && typeof body.ttsProfile === 'object' && body.ttsProfile) ? body.ttsProfile : null;
  const affectOverride = tp ? {
    stability: tp.stability === undefined ? undefined : clamp01(tp.stability),
    similarity_boost: tp.similarity === undefined ? undefined : clamp01(tp.similarity),
    style: tp.style === undefined ? undefined : clamp01(tp.style),
    use_speaker_boost: tp.speakerBoost === undefined ? undefined : !!tp.speakerBoost,
  } : null;

  const vs = (body && typeof body.voice_settings === 'object' && body.voice_settings) ? body.voice_settings : null;
  const nativeOverride = vs ? {
    stability: vs.stability === undefined ? undefined : clamp01(vs.stability),
    similarity_boost: vs.similarity_boost === undefined ? undefined : clamp01(vs.similarity_boost),
    style: vs.style === undefined ? undefined : clamp01(vs.style),
    use_speaker_boost: vs.use_speaker_boost === undefined ? undefined : !!vs.use_speaker_boost,
  } : null;

  const merged = { ...fromPreset };

  if (affectOverride) {
    for (const k of Object.keys(affectOverride)) {
      if (affectOverride[k] !== undefined && affectOverride[k] !== null) merged[k] = affectOverride[k];
    }
  }
  if (nativeOverride) {
    for (const k of Object.keys(nativeOverride)) {
      if (nativeOverride[k] !== undefined && nativeOverride[k] !== null) merged[k] = nativeOverride[k];
    }
  }

  merged.stability = clamp01(merged.stability);
  merged.similarity_boost = clamp01(merged.similarity_boost);
  merged.style = clamp01(merged.style);
  merged.use_speaker_boost = !!merged.use_speaker_boost;

  return merged;
}

function presetFromMood(m) {
  switch (String(m || '').toLowerCase()) {
    case 'warm':
    case 'positive':
    case 'happy':
    case 'good':
    case 'up':
      return 'NYX_WARM';
    case 'coach':
    case 'motivated':
    case 'energetic':
      return 'NYX_COACH';
    case 'calm':
    case 'neutral':
    case 'steady':
    case 'down':
    case 'low':
    case 'sad':
    case 'negative':
      return 'NYX_CALM';
    default:
      return 'NYX_CALM';
  }
}

// -----------------------------
// Provider requests (Phase 4)
// -----------------------------
function getElevenCfg(which /* "primary" | "secondary" */) {
  const pKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  const pVoiceId = String(process.env.NYX_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || '').trim();
  const pHost = String(process.env.ELEVENLABS_HOST || 'api.elevenlabs.io').trim() || 'api.elevenlabs.io';
  const pModel = String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim() || 'eleven_multilingual_v2';

  if (which === 'secondary') {
    const key = String(process.env.ELEVENLABS_API_KEY_SECONDARY || '').trim() || pKey;
    const voiceId = String(process.env.NYX_VOICE_ID_SECONDARY || process.env.ELEVENLABS_VOICE_ID_SECONDARY || '').trim();
    const host = String(process.env.ELEVENLABS_HOST_SECONDARY || '').trim() || pHost;
    const modelId = String(process.env.ELEVENLABS_MODEL_ID_SECONDARY || '').trim() || pModel;
    const ok = !!(key && voiceId);
    return { ok, key, voiceId, host, modelId, which: 'secondary' };
  }

  const ok = !!(pKey && pVoiceId);
  return { ok, key: pKey, voiceId: pVoiceId, host: pHost, modelId: pModel, which: 'primary' };
}

function elevenlabsRequest({ cfg, text, traceId, timeoutMs, voiceSettings, modelIdOverride }) {
  const modelId = String(modelIdOverride || cfg.modelId || 'eleven_multilingual_v2').trim();
  const host = String(cfg.host || 'api.elevenlabs.io').trim() || 'api.elevenlabs.io';

  const payload = JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings });

  const options = {
    hostname: host,
    agent: keepAliveAgent,
    path: `/v1/text-to-speech/${encodeURIComponent(cfg.voiceId)}`,
    method: 'POST',
    headers: {
      'xi-api-key': cfg.key,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'User-Agent': 'Sandblast-Nyx-TTS/1.3',
      'Content-Length': Buffer.byteLength(payload),
      'x-sb-trace-id': traceId,
    },
  };

  return new Promise((resolve, reject) => {
    const r = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: Buffer.concat(chunks), provider: 'elevenlabs', host }));
    });

    r.on('error', (e) => reject(e));
    r.setTimeout(timeoutMs, () => {
      try { r.destroy(new Error('TTS_TIMEOUT')); } catch (_) {}
    });

    r.write(payload);
    r.end();
  });
}

function openaiTtsRequest({ text, traceId, timeoutMs }) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return Promise.resolve({ status: 0, headers: {}, body: Buffer.from('OPENAI_API_KEY missing'), provider: 'openai' });

  const rawUrl = String(process.env.OPENAI_TTS_URL || 'api.openai.com/v1/audio/speech').trim();
  const host = rawUrl.includes('/') ? rawUrl.split('/')[0] : rawUrl;
  const path = rawUrl.includes('/') ? '/' + rawUrl.split('/').slice(1).join('/') : '/v1/audio/speech';

  const model = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
  const voice = String(process.env.OPENAI_TTS_VOICE || 'alloy').trim();
  const format = String(process.env.OPENAI_TTS_FORMAT || 'mp3').trim();

  const payload = JSON.stringify({ model, voice, input: text, format });

  const options = {
    hostname: host,
    agent: keepAliveAgent,
    path,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'User-Agent': 'Sandblast-Nyx-TTS/1.3',
      'Content-Length': Buffer.byteLength(payload),
      'x-sb-trace-id': traceId,
    },
  };

  return new Promise((resolve, reject) => {
    const r = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: Buffer.concat(chunks), provider: 'openai', host }));
    });

    r.on('error', (e) => reject(e));
    r.setTimeout(timeoutMs, () => {
      try { r.destroy(new Error('TTS_TIMEOUT')); } catch (_) {}
    });

    r.write(payload);
    r.end();
  });
}

// -----------------------------
// Probe (Phase 8)
// -----------------------------
async function runHeartbeatProbe({ traceId }) {
  const elevenTimeoutMs = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15000, 3000, 45000);
  const probeTimeout = Math.max(3000, Math.min(8000, Math.floor(elevenTimeoutMs * 0.6)));

  const resembleToken = String(process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_KEY || '').trim();
  const resembleVoice = String(process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_UUID || '').trim();

  const t0 = nowMs();

  if (resembleToken && resembleVoice) {
    try {
      const r = await resembleSynthesize({
        text: 'Quick audio check.',
        voiceUuid: resembleVoice,
        outputFormat: String(process.env.RESEMBLE_OUTPUT_FORMAT || 'mp3').trim(),
        timeoutMs: probeTimeout,
        traceId,
      });
      const dt = nowMs() - t0;
      const ok = r && r.ok && r.buffer && r.buffer.length > 1000;
      updateHealth(ok, { error: ok ? null : (r && (r.reason || r.message) ? (r.reason || r.message) : 'RESEMBLE_FAIL'), upstreamStatus: ok ? 200 : (r && r.status ? r.status : 0), upstreamMs: dt });
      return { ok, provider: 'resemble', upstreamStatus: ok ? 200 : (r && r.status ? r.status : 0), upstreamMs: dt, bytes: ok ? r.buffer.length : 0 };
    } catch (e) {
      const dt = nowMs() - t0;
      updateHealth(false, { error: e && e.message ? e.message : String(e), upstreamStatus: 0, upstreamMs: dt });
      return { ok: false, provider: 'resemble', error: e && e.message ? e.message : String(e) };
    }
  }

  if (!elevenEnabled()) {
    updateHealth(false, { error: 'NO_PROVIDER_CONFIGURED', upstreamStatus: null, upstreamMs: null });
    return { ok: false, error: 'NO_PROVIDER_CONFIGURED' };
  }

  const cfg = getElevenCfg('primary');
  if (!cfg.ok) {
    updateHealth(false, { error: 'NO_PROVIDER_CONFIGURED', upstreamStatus: null, upstreamMs: null });
    return { ok: false, error: 'NO_PROVIDER_CONFIGURED' };
  }

  const envDefaults = {
    stability: num01(process.env.NYX_VOICE_STABILITY, 0.45),
    similarity_boost: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
    style: num01(process.env.NYX_VOICE_STYLE, 0.15),
    use_speaker_boost: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),
  };

  const voiceSettings = presetVoiceSettings('NYX_CALM', envDefaults);

  try {
    const r = await elevenlabsRequest({ cfg, text: 'Quick audio check.', traceId, timeoutMs: probeTimeout, voiceSettings });
    const dt = nowMs() - t0;
    const ok = r.status >= 200 && r.status < 300 && r.body && r.body.length > 1000;
    updateHealth(ok, { error: ok ? null : `UPSTREAM_${r.status}`, upstreamStatus: r.status, upstreamMs: dt });
    return { ok, provider: 'elevenlabs', upstreamStatus: r.status, upstreamMs: dt, bytes: r.body ? r.body.length : 0 };
  } catch (e) {
    const dt = nowMs() - t0;
    updateHealth(false, { error: e && e.message ? e.message : String(e), upstreamStatus: 0, upstreamMs: dt });
    return { ok: false, provider: 'elevenlabs', error: e && e.message ? e.message : String(e) };
  }
}

// -----------------------------
// Main handler (Phase 1..10)
// -----------------------------
async function handleTts(req, res) {
  const body = readBody(req);

  const requestId = String(req.get('X-Request-Id') || '').trim() || null;
  const inboundTrace = String(req.get('X-SB-Trace-Id') || req.get('x-sb-trace-id') || '').trim() || null;
  const traceId = makeTraceId(inboundTrace);

  const tStart = nowMs();

  const elevenTimeoutMs = clampInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS, 15000, 3000, 45000);
  const elevenRetryOnce = bool(process.env.ELEVENLABS_TTS_RETRY_ONCE, true);
  const maxChars = clampInt(process.env.ELEVENLABS_TTS_MAX_CHARS, 1200, 200, 6000);
  const logJson = bool(process.env.SB_TTS_LOG_JSON, false);

  const fallbackProvider = String(process.env.SB_TTS_FALLBACK_PROVIDER || 'none').trim().toLowerCase();
  const openaiTimeoutMs = clampInt(process.env.OPENAI_TTS_TIMEOUT_MS, 20000, 3000, 45000);

  try {
    if (body && body.healthCheck === true) {
      const probe = await runHeartbeatProbe({ traceId });
      res.set('X-SB-Trace-Id', traceId);
      return safeJson(res, probe.ok ? 200 : 503, { ok: probe.ok, probe, health: { ...hb }, requestId, traceId });
    }

    const lane = String(body.lane || body.mode || body.contextLane || '').trim() || null;
    const turnId = String(body.turnId || body.turn || body.tid || '').trim() || null;

    const mood = String((body.mood || (body.cog && body.cog.mood) || (body.stateHints && body.stateHints.mood) || '')).trim().toLowerCase() || '';
    const intent = String((body.intent || (body.cog && body.cog.lastIntent) || (body.stateHints && body.stateHints.lastIntent) || body.socialIntent || '')).trim().toLowerCase() || '';
    const turnDepthHint = (body && body.stateHints && body.stateHints.turnDepth != null) ? clampInt(body.stateHints.turnDepth, 0, 0, 9999) : null;
    const lastIntentHint = (body && body.stateHints && body.stateHints.lastIntent) ? String(body.stateHints.lastIntent).slice(0, 64) : null;

    const chatMs = body.chatMs != null ? clampInt(body.chatMs, 0, 0, 3600000) : null;
    const e2eStartTs = body.e2eStartTs != null ? clampInt(body.e2eStartTs, 0, 0, 9999999999999) : null;
    const e2eMs = (e2eStartTs && e2eStartTs > 0) ? Math.max(0, nowMs() - e2eStartTs) : null;

    let text = cleanText(body.text || body.spokenText || body.replyText || body.message || '');

    if (!text) {
      res.set('X-SB-Trace-Id', traceId);
      if (lane) res.set('X-SB-Lane', lane);
      if (turnId) res.set('X-SB-Turn-Id', turnId);
      return safeJson(res, 400, { ok: false, error: 'BAD_REQUEST', detail: 'MISSING_TEXT', message: 'Provide {text} in JSON body.', requestId, traceId });
    }

    if (body.firstSentenceOnly) text = firstSentence(text);
    text = cleanText(text);

    if (text.length > maxChars) {
      res.set('X-SB-Trace-Id', traceId);
      if (lane) res.set('X-SB-Lane', lane);
      if (turnId) res.set('X-SB-Turn-Id', turnId);
      return safeJson(res, 413, { ok: false, error: 'TTS_TEXT_TOO_LONG', message: `Text too long for TTS. Max ${maxChars} characters.`, chars: text.length, maxChars, requestId, traceId });
    }

    if (shouldAutoProbe()) runHeartbeatProbe({ traceId }).catch(() => {});

    const envDefaults = {
      stability: num01(process.env.NYX_VOICE_STABILITY, 0.45),
      similarity_boost: num01(process.env.NYX_VOICE_SIMILARITY, 0.85),
      style: num01(process.env.NYX_VOICE_STYLE, 0.15),
      use_speaker_boost: bool(process.env.NYX_VOICE_SPEAKER_BOOST, true),
    };

    let presetKey = String(body.presetKey || body.voicePreset || body.ttsPresetKey || '').trim() || null;
    if (!presetKey) {
      const isGreetingish = intent && (intent.includes('greet') || intent.includes('hello') || intent.includes('checkin') || intent.includes('social'));
      presetKey = isGreetingish ? 'NYX_WARM' : presetFromMood(mood);
    }

    const voiceSettings = mergeVoiceSettings({ envDefaults, presetKey, body });
    const modelIdOverride = body.model_id ? String(body.model_id).trim() : null;

    // Standard tracing headers (Phase 6)
    res.set('X-SB-Trace-Id', traceId);
    if (lane) res.set('X-SB-Lane', lane);
    if (turnId) res.set('X-SB-Turn-Id', turnId);
    if (chatMs != null) res.set('X-SB-Chat-Ms', String(chatMs));
    if (e2eMs != null) res.set('X-SB-E2E-Ms', String(e2eMs));
    if (mood) res.set('X-SB-Mood', String(mood).slice(0, 24));
    if (intent) res.set('X-SB-Intent', String(intent).slice(0, 64));
    if (turnDepthHint != null) res.set('X-SB-Turn-Depth', String(turnDepthHint));
    if (lastIntentHint) res.set('X-SB-Last-Intent', String(lastIntentHint));
    if (presetKey) res.set('X-SB-TTS-Preset', String(presetKey).slice(0, 32));

    // Provider config
    const resembleToken = String(process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_KEY || '').trim();
    const resembleVoiceUuid = String(process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_UUID || '').trim();

    const elevenPrimaryCfg = elevenEnabled() ? getElevenCfg('primary') : { ok: false };
    const elevenSecondaryCfg = elevenEnabled() ? getElevenCfg('secondary') : { ok: false };
    const elevenModelForKey = String(modelIdOverride || (elevenPrimaryCfg && elevenPrimaryCfg.modelId) || 'eleven_multilingual_v2').trim();

    const resembleKey = cacheKey({ provider: 'resemble', voiceId: resembleVoiceUuid, modelId: String(process.env.RESEMBLE_MODEL || 'resemble').trim(), voiceSettings, text });
    const elevenKey = cacheKey({ provider: 'elevenlabs', voiceId: (elevenPrimaryCfg && elevenPrimaryCfg.voiceId) ? elevenPrimaryCfg.voiceId : '', modelId: elevenModelForKey, voiceSettings, text });

    // Cache (prefer Resemble cache key first)
    const c1 = cacheGet(resembleKey);
    if (c1 && c1.buf && c1.buf.length > 1000) {
      const tMs = nowMs() - tStart;
      res.set('X-SB-TTS-Provider', 'cache');
      res.set('X-SB-TTS-Bytes', String(c1.buf.length));
      res.set('X-SB-TTS-Upstream-Status', '200');
      res.set('X-SB-TTS-Upstream-Ms', '0');
      res.set('X-SB-TTS-Ms', String(tMs));
      return sendAudio(res, req, { body, buf: c1.buf, headers: { traceId }, mimeType: (c1.meta && c1.meta.mimeType) || 'audio/mpeg' });
    }

    // ---- Resemble PRIMARY (Phase 4)
    if (resembleToken && resembleVoiceUuid) {
      const rStart = nowMs();
      try {
        const r = await resembleSynthesize({
          text,
          voiceUuid: resembleVoiceUuid,
          outputFormat: String(process.env.RESEMBLE_OUTPUT_FORMAT || 'mp3').trim(),
          timeoutMs: clampInt(process.env.RESEMBLE_TIMEOUT_MS, 15000, 3000, 45000),
          traceId,
        });
        const rUpMs = nowMs() - rStart;

        if (r && r.ok && r.buffer && r.buffer.length > 1000) {
          cacheSet(resembleKey, r.buffer, { provider: 'resemble', mimeType: r.mimeType || 'audio/mpeg' });

          const tMs = nowMs() - tStart;
          res.set('X-SB-TTS-Provider', 'resemble');
          res.set('X-SB-TTS-Upstream-Ms', String(rUpMs));
          res.set('X-SB-TTS-Upstream-Status', '200');
          res.set('X-SB-TTS-Ms', String(tMs));
          res.set('X-SB-TTS-Bytes', String(r.buffer.length));

          updateHealth(true, { upstreamStatus: 200, upstreamMs: rUpMs });

          if (logJson) {
            try {
              console.log(JSON.stringify({ t: nowMs(), ok: true, provider: 'resemble', traceId, requestId, lane, turnId, ms_total: tMs, ms_upstream: rUpMs, bytes: r.buffer.length, chars: text.length }));
            } catch (_) {}
          }

          return sendAudio(res, req, { body, buf: r.buffer, headers: { traceId }, mimeType: r.mimeType || 'audio/mpeg' });
        }

        updateHealth(false, { error: r && (r.reason || r.message) ? (r.reason || r.message) : 'RESEMBLE_FAIL', upstreamStatus: r && r.status ? r.status : 0, upstreamMs: rUpMs });
      } catch (e) {
        const rUpMs = nowMs() - rStart;
        updateHealth(false, { error: e && e.message ? e.message : String(e), upstreamStatus: 0, upstreamMs: rUpMs });
      }
    }

    // ---- ELEVEN optional fallback (Phase 4)
    if (!elevenEnabled()) {
      // Explicitly disabled: avoid accidental vendor drift back to Eleven.
    } else {
    const c2 = cacheGet(elevenKey);
    if (c2 && c2.buf && c2.buf.length > 1000) {
      const tMs = nowMs() - tStart;
      res.set('X-SB-TTS-Provider', 'cache');
      res.set('X-SB-TTS-Bytes', String(c2.buf.length));
      res.set('X-SB-TTS-Upstream-Status', '200');
      res.set('X-SB-TTS-Upstream-Ms', '0');
      res.set('X-SB-TTS-Ms', String(tMs));
      return sendAudio(res, req, { body, buf: c2.buf, headers: { traceId }, mimeType: (c2.meta && c2.meta.mimeType) || 'audio/mpeg' });
    }

    const bypassPrimary = shouldBypassPrimaryLiveAttempt();

    async function attemptEleven(cfg, label) {
      const tUpStart = nowMs();
      try {
        const r = await elevenlabsRequest({ cfg, text, traceId, timeoutMs: elevenTimeoutMs, voiceSettings, modelIdOverride });
        return { r, ms: nowMs() - tUpStart, label };
      } catch (e) {
        const ms = nowMs() - tUpStart;
        const r = { status: 0, headers: {}, body: Buffer.from(String(e && e.message ? e.message : e || 'TTS_ERROR')) };
        r.__err = String(e && e.message ? e.message : e);
        return { r, ms, label };
      }
    }

    let retried = false;
    let failoverUsed = false;
    let used = null;
    let result = null;

    if (!bypassPrimary && elevenPrimaryCfg.ok) {
      result = await attemptEleven(elevenPrimaryCfg, 'primary');
      used = 'elevenlabs_primary';
    }

    if (result && (result.r.status === 0 || isRetryableStatus(result.r.status)) && elevenRetryOnce && elevenPrimaryCfg.ok && !bypassPrimary) {
      retried = true;
      const ra = result && result.r && result.r.headers ? result.r.headers['retry-after'] : null;
      let delay = 180;
      if (ra) {
        const s = parseFloat(String(ra));
        if (Number.isFinite(s) && s > 0) delay = Math.min(1200, Math.max(180, Math.floor(s * 1000)));
      }
      await jitterSleep(delay);
      const r2 = await attemptEleven(elevenPrimaryCfg, 'primary_retry');
      if (r2.r.status >= 200 && r2.r.status < 300) {
        result = r2;
        used = 'elevenlabs_primary';
      }
    }

    const okEleven = result && (result.r.status >= 200 && result.r.status < 300);

    if (!okEleven && elevenSecondaryCfg.ok) {
      failoverUsed = true;
      await jitterSleep(retried ? 90 : 40);
      const r3 = await attemptEleven(elevenSecondaryCfg, 'secondary');
      if (r3.r.status >= 200 && r3.r.status < 300) {
        result = r3;
        used = 'elevenlabs_secondary';
      } else if (!result) {
        result = r3;
        used = 'elevenlabs_secondary';
      }
    }

    const okEleven2 = result && (result.r.status >= 200 && result.r.status < 300);

    if (okEleven2) {
      updateHealth(true, { upstreamStatus: result.r.status, upstreamMs: result.ms });

      const bytes = result.r.body ? result.r.body.length : 0;
      const tMs = nowMs() - tStart;

      res.set('X-SB-TTS-Provider', used || 'elevenlabs');
      res.set('X-SB-TTS-Upstream-Ms', String(result.ms));
      res.set('X-SB-TTS-Upstream-Status', String(result.r.status || 0));
      res.set('X-SB-TTS-Retry', retried ? '1' : '0');
      res.set('X-SB-TTS-Failover', failoverUsed ? '1' : '0');
      res.set('X-SB-TTS-Fallback', '0');
      res.set('X-SB-TTS-Ms', String(tMs));
      res.set('X-SB-TTS-Bytes', String(bytes));

      cacheSet(elevenKey, result.r.body, { provider: used || 'elevenlabs', mimeType: 'audio/mpeg' });

      if (logJson) {
        try {
          console.log(JSON.stringify({ t: nowMs(), ok: true, provider: used || 'elevenlabs', traceId, requestId, lane, turnId, retried, failoverUsed, ms_total: tMs, ms_upstream: result.ms, bytes, chars: text.length }));
        } catch (_) {}
      }

      return sendAudio(res, req, { body, buf: result.r.body, headers: { traceId }, mimeType: 'audio/mpeg' });
    }

    }

    // ---- OpenAI optional fallback
    if (fallbackProvider === 'openai') {
      const tUpStart = nowMs();
      let fr;
      try { fr = await openaiTtsRequest({ text, traceId, timeoutMs: openaiTimeoutMs }); }
      catch (e) { fr = { status: 0, headers: {}, body: Buffer.from(String(e && e.message ? e.message : e)), provider: 'openai' }; }

      const upMs2 = nowMs() - tUpStart;

      if (fr.status >= 200 && fr.status < 300) {
        const bytes = fr.body ? fr.body.length : 0;
        const tMs = nowMs() - tStart;

        res.set('X-SB-TTS-Provider', 'openai');
        res.set('X-SB-TTS-Upstream-Ms', String(upMs2));
        res.set('X-SB-TTS-Upstream-Status', String(fr.status || 0));
        res.set('X-SB-TTS-Retry', retried ? '1' : '0');
        res.set('X-SB-TTS-Failover', failoverUsed ? '1' : '0');
        res.set('X-SB-TTS-Fallback', '1');
        res.set('X-SB-TTS-Ms', String(tMs));
        res.set('X-SB-TTS-Bytes', String(bytes));

        updateHealth(true, { upstreamStatus: fr.status, upstreamMs: upMs2 });
        cacheSet(elevenKey, fr.body, { provider: 'openai', mimeType: 'audio/mpeg' });

        return sendAudio(res, req, { body, buf: fr.body, headers: { traceId }, mimeType: 'audio/mpeg' });
      }
    }

    // Deterministic failure (Phase 5)
    const upStatus = result ? (result.r.status || 0) : 0;
    const upMs = result ? result.ms : null;
    updateHealth(false, { error: `TTS_FAIL_${upStatus}`, upstreamStatus: upStatus, upstreamMs: upMs });

    const tMs = nowMs() - tStart;
    res.set('X-SB-TTS-Provider', used || 'none');
    res.set('X-SB-TTS-Upstream-Status', String(upStatus));
    res.set('X-SB-TTS-Upstream-Ms', String(upMs == null ? 0 : upMs));
    res.set('X-SB-TTS-Retry', retried ? '1' : '0');
    res.set('X-SB-TTS-Failover', failoverUsed ? '1' : '0');
    res.set('X-SB-TTS-Fallback', fallbackProvider === 'openai' ? '1' : '0');
    res.set('X-SB-TTS-Ms', String(tMs));

    return safeJson(res, 502, { ok: false, error: 'TTS_UNAVAILABLE', message: 'TTS providers failed. Returning text-only fallback (no audio).', provider: used || null, retried, failoverUsed, fallbackProvider, requestId, traceId });

  } catch (e) {
    const tMs = nowMs() - tStart;
    try { res.set('X-SB-Trace-Id', traceId); res.set('X-SB-TTS-Ms', String(tMs)); } catch (_) {}
    return safeJson(res, 500, { ok: false, error: 'TTS_INTERNAL_ERROR', message: String(e && e.message ? e.message : e), requestId, traceId });
  }
}

module.exports = { handleTts };
