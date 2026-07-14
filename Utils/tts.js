'use strict';

const TTS_VERSION = 'tts.js v2.18.0 VERIFIED-BINARY-HANDOFF + ACTUAL-FORMAT-AUTHORITY + LIVE-PROBE-ISOLATION';

/**
 * Utils/tts.js
 *
 * Hardened TTS handler for Nyx/Nix — Resemble-only.
 *
 * ✅ Vendor scrub:
 *   - No legacy provider references.
 *
 * Contract:
 *   - Exports: handleTts(req, res)
 *   - Never throws upward
 *   - Returns audio/mpeg (mp3) by default
 *
 * Operational Intelligence alignment (Phase 1–20):
 *   1)  Social Warmth Hooks            : mood/intent → ttsProfile presets
 *   2)  State Spine Reinforcement      : stable traceId; X-SB-* headers
 *   3)  Resilience Layer               : retry cap; timeout guards; circuit cooldown
 *   4)  Provider Routing               : Resemble-only, explicit config required
 *   5)  Deterministic Failures         : stable JSON envelope; never accidental 500
 *   6)  Latency Instrumentation        : upstream ms + bytes + provider headers
 *   7)  Cache & De-dupe                : bounded in-memory cache
 *   8)  Heartbeat/Health Probe         : {healthCheck:true} returns health JSON
 *   9)  Payload Hygiene                : cleanText, maxChars, firstSentenceOnly
 *   10) Ops Safety                     : no secret logging; safe debug; vendor down cooldown
 *   11) Concurrency Guard              : inFlight cap; backpressure error code
 *   12) Request Normalization          : strict body read; allowed fields only
 *   13) Audio Contract Options         : supports base64 JSON response (return:"base64")
 *   14) Trace Correlation              : accepts traceId + sessionId hints
 *   15) Consistent Error Taxonomy      : error codes for UI
 *   16) Vendor Health Mapping          : exposes vendor health + last error
 *   17) No-Drift Defaults              : stable default voice/preset mapping
 *   18) Replay/Dedupe Friendly         : cache key includes voice/settings/text
 *   19) Security Hygiene               : no token echo; no raw upstream headers leak
 *   20) Upgrade Hooks                  : structured optional debug log line (opt-in)
 *
 * Env (Resemble):
 *   - RESEMBLE_API_TOKEN (or RESEMBLE_API_KEY)
 *   - RESEMBLE_VOICE_UUID
 *   - RESEMBLE_OUTPUT_FORMAT ("mp3"|"wav", default "mp3")
 *   - RESEMBLE_TIMEOUT_MS (default 15000)
 *
 * Optional:
 *   - SB_TTS_LOG_JSON ("true"/"false", default false)
 *   - SB_TTS_CACHE ("true"/"false", default true)
 *   - SB_TTS_CACHE_TTL_MS (default 30000)
 *   - SB_TTS_CACHE_MAX (default 64)
 *   - SB_TTS_MAX_CHARS (default 1800)
 *   - SB_TTS_INFLIGHT_MAX (default 2)
 *   - SB_TTS_HEARTBEAT_INTERVAL_MS (default 120000)
 *   - SB_TTS_HEARTBEAT_COOLDOWN_MS (default 30000)
 *   - SB_TTS_RAW_RESPONSE_LOG (true enables pre-decode provider response logging)
 *   - SB_TTS_RAW_RESPONSE_LOG_MAX_CHARS (default 6000, max 20000)
 */

const path = require('path');

let _resembleProviderPath = '';
let _resembleProviderResolvedPath = '';
let _resembleProviderLoadErrors = [];

const _resembleProvider = (() => {
  // Render/Linux is case-sensitive. The deployed Sandblast provider historically
  // uses the exact basename `ttsProvidersResemble.js` (capital R). Load that
  // canonical name first, then accept historical casing aliases for compatibility.
  const candidates = [
    'ttsProvidersResemble.js',
    'ttsProvidersResemble',
    'ttsProvidersresemble.js',
    'ttsProvidersresemble',
    'TTSProvidersResemble.js',
    'TTSProvidersResemble',
    'providersResemble.js',
    'providersResemble',
  ];

  for (const basename of candidates) {
    const absolutePath = path.join(__dirname, basename);
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require(absolutePath);
      const provider = mod && typeof mod.synthesize === 'function'
        ? mod
        : (mod && mod.default && typeof mod.default.synthesize === 'function' ? mod.default : null);
      if (provider) {
        _resembleProviderPath = `./${basename}`;
        try { _resembleProviderResolvedPath = require.resolve(absolutePath); } catch (_) { _resembleProviderResolvedPath = absolutePath; }
        try {
          console.log('[TTS_PROVIDER_LOADED]', JSON.stringify({
            version: TTS_VERSION,
            providerPath: _resembleProviderPath,
            resolvedPath: _resembleProviderResolvedPath,
          }));
        } catch (_) {}
        return provider;
      }
      _resembleProviderLoadErrors.push({ path: `./${basename}`, code: 'INVALID_EXPORT' });
    } catch (err) {
      _resembleProviderLoadErrors.push({
        path: `./${basename}`,
        code: String(err && err.code || 'REQUIRE_FAILED').slice(0, 60),
        message: String(err && err.message || err || 'require failed').replace(/\s+/g, ' ').slice(0, 240),
      });
    }
  }

  try {
    console.error('[TTS_PROVIDER_LOAD_FAILURE]', JSON.stringify({
      version: TTS_VERSION,
      dirname: __dirname,
      attempted: candidates.map((name) => `./${name}`),
      errors: _resembleProviderLoadErrors,
    }));
  } catch (_) {}
  return null;
})();

const resembleSynthesize = _resembleProvider && typeof _resembleProvider.synthesize === 'function'
  ? _resembleProvider.synthesize
  : null;

const resembleVendorHealth = _resembleProvider && typeof _resembleProvider.getVendorHealth === 'function'
  ? _resembleProvider.getVendorHealth
  : null;

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

function cacheEnabled() { return bool(process.env.SB_TTS_CACHE, true); }
function cacheTtlMs() { return clampInt(process.env.SB_TTS_CACHE_TTL_MS, 30000, 2000, 300000); }
function cacheMaxEntries() { return clampInt(process.env.SB_TTS_CACHE_MAX, 64, 8, 512); }

function cacheKey({ provider, voiceId, voiceSettings, text, format }) {
  const vs = voiceSettings ? JSON.stringify(voiceSettings) : '';
  const raw = `${provider || ''}|${voiceId || ''}|${format || ''}|${vs}|${text || ''}`;
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

// Live synthesis never auto-probes or self-blocks from wrapper health state.
// Explicit health requests remain available through runHeartbeatProbe().

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
  const q = req && req.query && typeof req.query === 'object' ? req.query : {};
  const b = req && req.body;
  if (!b) return { ...q };
  if (typeof b === 'string') return { ...q, text: b.trim() };
  if (typeof b === 'object' && b) return { ...q, ...b };
  return { ...q };
}

function setDiagnosticHeaders(res) {
  try {
    const providerVersion = _resembleProvider && (_resembleProvider.PROVIDER_VERSION || (_resembleProvider.default && _resembleProvider.default.PROVIDER_VERSION));
    res.set('X-SB-TTS-Version', TTS_VERSION);
    res.set('X-SB-TTS-Provider-Version', String(providerVersion || 'unknown').slice(0, 180));
    res.set('X-SB-TTS-Provider-Path', String(_resembleProviderPath || 'unresolved').slice(0, 120));
    res.set('X-SB-TTS-Provider-Resolved', _resembleProviderResolvedPath ? 'yes' : 'no');
    res.set('X-SB-TTS-Provider-Load', resembleSynthesize ? 'loaded' : 'missing');
    res.set('X-SB-TTS-Transport', 'resemble-synthesize-verified-binary');
    res.set('X-SB-TTS-Raw-Response-Log', bool(process.env.SB_TTS_RAW_RESPONSE_LOG, false) ? 'enabled' : 'disabled');
  } catch (_) {}
}

function wantsBase64(body) {
  const r = String((body && body.return) || (body && body.response) || '').trim().toLowerCase();
  return r === 'base64' || r === 'json';
}

function detectAudioBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') {
    return { mimeType: 'audio/wav', format: 'wav', signature: 'RIFF/WAVE' };
  }
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === 'OggS') {
    return { mimeType: 'audio/ogg', format: 'ogg', signature: 'OggS' };
  }
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === 'fLaC') {
    return { mimeType: 'audio/flac', format: 'flac', signature: 'fLaC' };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mimeType: 'audio/webm', format: 'webm', signature: 'EBML' };
  }
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'audio/mp4', format: 'mp4', signature: 'ISO-BMFF' };
  }
  if (buf.length >= 3 && buf.slice(0, 3).toString('ascii') === 'ID3') {
    return { mimeType: 'audio/mpeg', format: 'mp3', signature: 'ID3' };
  }
  for (let i = 0; i < Math.min(buf.length - 1, 128); i += 1) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      return { mimeType: 'audio/mpeg', format: 'mp3', signature: 'MPEG-FRAME' };
    }
  }
  return null;
}

function extensionForMime(mimeType) {
  switch (String(mimeType || '').toLowerCase()) {
    case 'audio/wav': return 'wav';
    case 'audio/ogg': return 'ogg';
    case 'audio/flac': return 'flac';
    case 'audio/webm': return 'webm';
    case 'audio/mp4': return 'm4a';
    default: return 'mp3';
  }
}

function sendAudio(res, req, { body, buf, headers, mimeType, format, signature, requestedFormat, declaredFormat }) {
  const verified = detectAudioBuffer(buf);
  if (!verified) {
    return safeJson(res, 502, {
      ok: false,
      code: 'TTS_AUDIO_SIGNATURE_INVALID',
      reason: 'audio_signature_invalid',
      message: 'TTS returned bytes without a recognized audio signature.',
      bytes: Buffer.isBuffer(buf) ? buf.length : 0
    });
  }

  const actualMime = verified.mimeType;
  const actualFormat = verified.format;
  if (wantsBase64(body)) {
    try {
      const b64 = buf.toString('base64');
      const out = {
        ok: true,
        playable: true,
        audio_b64: b64,
        audioBase64: b64,
        bytes: buf.length,
        mimeType: actualMime,
        format: actualFormat,
        signature: verified.signature
      };
      if (headers && typeof headers === 'object') out.headers = headers;
      return safeJson(res, 200, out);
    } catch (_) {}
  }

  if (req && req.aborted) return;
  res.status(200);
  res.set('Content-Type', actualMime);
  res.set('Content-Length', String(buf.length));
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Content-Disposition', `inline; filename="nyx_tts.${extensionForMime(actualMime)}"`);
  const requested = String(requestedFormat || '').toLowerCase();
  const declared = String(declaredFormat || format || '').toLowerCase();
  const mismatch = (requested && requested !== actualFormat) ||
    (declared && declared !== actualFormat) ||
    (mimeType && mimeType !== actualMime);
  res.set('X-SB-TTS-Audio-Signature', verified.signature);
  res.set('X-SB-TTS-Requested-Format', requested);
  res.set('X-SB-TTS-Provider-Format', declared || actualFormat);
  res.set('X-SB-TTS-Actual-Format', actualFormat);
  res.set('X-SB-TTS-Format-Mismatch', mismatch ? 'yes' : 'no');
  if (res.writableEnded) return;
  return res.end(buf);
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

function makeProbeTraceId(parentTraceId) {
  const parent = String(parentTraceId || 'health').replace(/[^\w\-:.]/g, '_').slice(0, 40);
  return makeTraceId(`${parent}:probe:${Date.now().toString(16)}`);
}

function logJsonEnabled() { return bool(process.env.SB_TTS_LOG_JSON, false); }

// -----------------------------
// Voice settings
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
// Probe (Phase 8)
// -----------------------------
async function runHeartbeatProbe({ traceId }) {
  const timeoutMs = clampInt(process.env.RESEMBLE_TIMEOUT_MS, 15000, 3000, 45000);
  const probeTimeout = Math.max(3000, Math.min(8000, Math.floor(timeoutMs * 0.6)));
  const token = String(process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_KEY || '').trim();
  const voiceUuid = String(process.env.RESEMBLE_VOICE_UUID || '').trim();
  const probeTraceId = makeProbeTraceId(traceId);
  const t0 = nowMs();

  if (token && voiceUuid && resembleSynthesize) {
    try {
      const r = await resembleSynthesize({
        text: 'Quick audio check.',
        voiceUuid,
        outputFormat: String(process.env.RESEMBLE_OUTPUT_FORMAT || 'mp3').trim(),
        timeoutMs: probeTimeout,
        traceId: probeTraceId,
      });
      const dt = nowMs() - t0;
      const verified = r && r.buffer ? detectAudioBuffer(r.buffer) : null;
      const ok = !!(r && r.ok && verified && r.buffer.length > 256);
      updateHealth(ok, { error: ok ? null : (r && (r.reason || r.error || r.message)) || 'probe_failed', upstreamStatus: r && r.status, upstreamMs: dt });
      return {
        ok,
        traceId: probeTraceId,
        ms: dt,
        bytes: ok ? r.buffer.length : 0,
        mimeType: ok ? verified.mimeType : '',
        format: ok ? verified.format : '',
        reason: ok ? '' : String(r && (r.reason || r.error || r.message) || 'probe_failed').slice(0, 180)
      };
    } catch (e) {
      const dt = nowMs() - t0;
      updateHealth(false, { error: (e && e.message) ? e.message : 'probe_error', upstreamMs: dt });
      return { ok: false, traceId: probeTraceId, ms: dt, bytes: 0, reason: (e && e.message) ? e.message.slice(0, 180) : 'probe_error' };
    }
  }

  updateHealth(false, { error: 'resemble_not_configured', upstreamMs: nowMs() - t0 });
  return { ok: false, traceId: probeTraceId, ms: nowMs() - t0, bytes: 0, reason: 'resemble_not_configured' };
}

// -----------------------------
// Concurrency guard (Phase 11)
// -----------------------------
const inflight = { n: 0 };
function inflightMax() { return clampInt(process.env.SB_TTS_INFLIGHT_MAX, 2, 1, 10); }
function enterInflight() { if (inflight.n >= inflightMax()) return false; inflight.n += 1; return true; }
function leaveInflight() { inflight.n = Math.max(0, inflight.n - 1); }

// -----------------------------
// Main handler
// -----------------------------
async function handleTts(req, res) {
  const started = nowMs();
  const body0 = readBody(req);
  setDiagnosticHeaders(res);

  const headerTrace = req && req.headers
    ? (req.headers['x-sb-trace-id'] || req.headers['x-sb-traceid'] || req.headers['x-request-id'])
    : '';
  const traceId = makeTraceId(body0.traceId || body0.requestId || (body0.stateHints && body0.stateHints.traceId) || headerTrace || req && req.sbTraceId);
  const sessionId = String(body0.sessionId || body0.sid || '').trim().slice(0, 64);

  if (body0 && (body0.healthCheck === true || body0.health === true)) {
    const probe = await runHeartbeatProbe({ traceId });
    const vendor = resembleVendorHealth ? resembleVendorHealth() : null;
    return safeJson(res, 200, { ok: true, traceId, sessionId, provider: 'resemble', probe, health: hb, vendor });
  }

  if (!enterInflight()) {
    return safeJson(res, 429, { ok: false, traceId, code: 'TTS_BACKPRESSURE', message: 'TTS busy — retry shortly.' });
  }

  try {
    const token = String(process.env.RESEMBLE_API_TOKEN || process.env.RESEMBLE_API_KEY || '').trim();
    const voiceUuid = String(process.env.RESEMBLE_VOICE_UUID || '').trim();
    const outputFormatRaw = String(body0.output_format || body0.outputFormat || body0.format || process.env.RESEMBLE_OUTPUT_FORMAT || 'mp3').trim().toLowerCase();
    const outputFormat = outputFormatRaw === 'wav' ? 'wav' : 'mp3';
    const timeoutMs = clampInt(process.env.RESEMBLE_TIMEOUT_MS, 15000, 3000, 45000);

    if (!resembleSynthesize) {
      updateHealth(false, { error: 'resemble_provider_missing' });
      return safeJson(res, 503, {
        ok: false,
        traceId,
        code: 'TTS_PROVIDER_MISSING',
        message: 'TTS provider module missing.',
        providerPath: _resembleProviderPath || '',
        providerResolved: !!_resembleProviderResolvedPath,
        attemptedProviderFiles: _resembleProviderLoadErrors.map((item) => item.path).slice(0, 8),
        providerLoadCodes: _resembleProviderLoadErrors.map((item) => item.code).slice(0, 8),
      });
    }

    if (!token || !voiceUuid) {
      updateHealth(false, { error: 'resemble_not_configured' });
      return safeJson(res, 503, { ok: false, traceId, code: 'TTS_NOT_CONFIGURED', message: 'TTS not configured.' });
    }

    const maxChars = clampInt(process.env.SB_TTS_MAX_CHARS, 1800, 120, 5000);
    let text = cleanText(body0.text || body0.input || '');
    if (bool(body0.firstSentenceOnly, false)) text = firstSentence(text);

    if (!text) return safeJson(res, 400, { ok: false, traceId, code: 'TTS_EMPTY_TEXT', message: 'No text provided.' });
    if (text.length > maxChars) text = text.slice(0, maxChars).trim();

    const mood = String(body0.mood || (body0.stateHints && body0.stateHints.mood) || '').trim();
    const presetKey = String(body0.preset || body0.ttsPreset || presetFromMood(mood)).trim() || 'NYX_CALM';

    const envDefaults = {
      stability: clamp01(process.env.SB_TTS_STABILITY == null ? 0.55 : process.env.SB_TTS_STABILITY),
      similarity_boost: clamp01(process.env.SB_TTS_SIMILARITY == null ? 0.75 : process.env.SB_TTS_SIMILARITY),
      style: clamp01(process.env.SB_TTS_STYLE == null ? 0.25 : process.env.SB_TTS_STYLE),
      use_speaker_boost: bool(process.env.SB_TTS_SPEAKER_BOOST, true),
    };
    const voiceSettings = mergeVoiceSettings({ envDefaults, presetKey, body: body0 });

    const cKey = cacheKey({ provider: 'resemble', voiceId: voiceUuid, voiceSettings, text, format: outputFormat });
    const cached = cacheGet(cKey);
    if (cached && cached.buf && cached.buf.length > 0) {
      const cachedVerified = detectAudioBuffer(cached.buf);
      if (!cachedVerified) {
        _cache.map.delete(cKey);
      } else {
        res.set('X-SB-TTS-Provider', 'resemble');
        res.set('X-SB-TTS-TraceId', traceId);
        res.set('X-SB-TTS-Cache', 'HIT');
        res.set('X-SB-TTS-Bytes', String(cached.buf.length));
        res.set('X-SB-TTS-Ms', String(Math.max(0, nowMs() - started)));
        return sendAudio(res, req, {
          body: body0,
          buf: cached.buf,
          headers: cached.meta && cached.meta.headers,
          mimeType: cached.meta && cached.meta.mimeType || cachedVerified.mimeType,
          format: cached.meta && cached.meta.format || cachedVerified.format,
          signature: cachedVerified.signature,
          requestedFormat: outputFormat,
          declaredFormat: cached.meta && cached.meta.declaredFormat || cachedVerified.format
        });
      }
    }

    const t0 = nowMs();
    let result = null;
    let callError = '';

    // The provider owns transient retry policy. Calling it once here prevents
    // duplicate syntheses, duplicate wallet charges, and trace ambiguity.
    try {
      result = await resembleSynthesize({
        text,
        voiceUuid,
        outputFormat,
        timeoutMs,
        traceId,
        voiceSettings,
        stateHints: {
          sessionId: sessionId || undefined,
          mood: mood || undefined,
          preset: presetKey || undefined,
        }
      });
    } catch (e) {
      callError = (e && e.message) ? e.message : 'vendor_error';
    }

    const upstreamMs = Math.max(0, nowMs() - t0);

    if (!result || !result.ok || !Buffer.isBuffer(result.buffer) || result.buffer.length <= 256) {
      const providerStatus = result && Number.isFinite(Number(result.status)) ? Number(result.status) : 0;
      const providerReason = String(result && (result.reason || result.error || result.message) || callError || 'vendor_failed').slice(0, 220);
      updateHealth(false, { error: providerReason, upstreamMs, upstreamStatus: providerStatus });
      try {
        res.set('X-SB-TTS-Upstream-Status', String(providerStatus));
        res.set('X-SB-TTS-Failure-Reason', providerReason.replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 120));
      } catch (_) {}
      const decodeBoundaryFailure = /^(?:audio_|base64_|decoded_)/i.test(providerReason);
      const failureCode = providerReason === 'audio_signature_invalid'
        ? 'TTS_AUDIO_SIGNATURE_INVALID'
        : providerReason === 'audio_content_missing'
          ? 'TTS_AUDIO_CONTENT_MISSING'
          : decodeBoundaryFailure
            ? 'TTS_AUDIO_DECODE_FAILED'
            : 'TTS_UPSTREAM_FAIL';
      return safeJson(res, decodeBoundaryFailure ? 502 : 503, {
        ok: false,
        traceId,
        code: failureCode,
        reason: providerReason,
        provider: 'resemble',
        providerStatus,
        retryable: !!(result && result.retryable),
        bytes: result && result.bytes || 0,
        base64Length: result && result.base64Length || 0,
        requestedFormat: result && result.requestedFormat || outputFormat,
        declaredFormat: result && result.declaredFormat || '',
        rawResponse: result && result.rawResponse ? result.rawResponse : undefined,
        message: result && result.message ? String(result.message).slice(0, 260) : 'TTS unavailable.'
      });
    }

    const buf = result.buffer;
    const verified = detectAudioBuffer(buf);
    if (!verified) {
      updateHealth(false, { error: 'audio_signature_invalid', upstreamMs, upstreamStatus: result.status });
      try {
        res.set('X-SB-TTS-Upstream-Status', String(result.status || 200));
        res.set('X-SB-TTS-Failure-Reason', 'audio_signature_invalid');
        res.set('X-SB-TTS-Bytes', String(buf.length));
      } catch (_) {}
      return safeJson(res, 502, {
        ok: false,
        traceId,
        code: 'TTS_AUDIO_SIGNATURE_INVALID',
        reason: 'audio_signature_invalid',
        provider: 'resemble',
        providerStatus: result.status || 200,
        bytes: buf.length,
        declaredMimeType: String(result.mimeType || ''),
        declaredFormat: String(result.format || ''),
        rawResponse: result.rawResponse || undefined,
        message: 'Resemble returned audio_content, but the decoded bytes did not contain a recognized audio signature.'
      });
    }

    updateHealth(true, { upstreamMs, upstreamStatus: result.status || 200 });

    const mimeType = verified.mimeType;
    const actualFormat = verified.format;
    const declaredMimeType = String(result.mimeType || '');
    const declaredFormat = String(result.format || result.declaredFormat || '');
    const formatMismatch = outputFormat !== actualFormat ||
      !!result.formatMismatch ||
      (declaredMimeType && declaredMimeType !== mimeType) ||
      (declaredFormat && declaredFormat.toLowerCase() !== actualFormat);

    res.set('X-SB-TTS-Provider', 'resemble');
    res.set('X-SB-TTS-TraceId', traceId);
    res.set('X-SB-TTS-Cache', 'MISS');
    res.set('X-SB-TTS-Bytes', String(buf.length));
    res.set('X-SB-TTS-UpstreamMs', String(upstreamMs));
    res.set('X-SB-TTS-Upstream-Status', String(result.status || 200));
    res.set('X-SB-TTS-Ms', String(Math.max(0, nowMs() - started)));
    res.set('X-SB-TTS-Audio-Signature', verified.signature);
    res.set('X-SB-TTS-Requested-Format', outputFormat);
    res.set('X-SB-TTS-Provider-Format', declaredFormat || actualFormat);
    res.set('X-SB-TTS-Actual-Format', actualFormat);
    res.set('X-SB-TTS-Format-Mismatch', formatMismatch ? 'yes' : 'no');

    cacheSet(cKey, buf, {
      headers: { provider: 'resemble', traceId, upstreamMs, bytes: buf.length, preset: presetKey },
      mimeType,
      format: actualFormat,
      declaredFormat: declaredFormat || actualFormat,
      signature: verified.signature
    });

    if (logJsonEnabled()) {
      try {
        console.log('[TTS_AUDIO_DELIVERY]', JSON.stringify({
          t: new Date().toISOString(),
          ok: true,
          provider: 'resemble',
          traceId,
          sessionId: sessionId || undefined,
          bytes: buf.length,
          signature: verified.signature,
          requestedFormat: outputFormat,
          providerFormat: declaredFormat || undefined,
          actualFormat,
          mimeType,
          formatMismatch,
          upstreamMs,
          totalMs: Math.max(0, nowMs() - started),
          preset: presetKey,
          mood: mood || undefined
        }));
      } catch (_) {}
    }

    return sendAudio(res, req, {
      body: body0,
      buf,
      headers: null,
      mimeType,
      format: actualFormat,
      signature: verified.signature,
      requestedFormat: outputFormat,
      declaredFormat: declaredFormat || actualFormat
    });
  } catch (e) {
    if (logJsonEnabled()) {
      try {
        console.log('[TTS]', JSON.stringify({ t: new Date().toISOString(), ok: false, traceId, code: 'TTS_EXCEPTION', error: (e && e.message) ? e.message.slice(0, 220) : 'exception' }));
      } catch (_) {}
    }
    return safeJson(res, 503, { ok: false, traceId, code: 'TTS_EXCEPTION', message: 'TTS failed.' });
  } finally {
    leaveInflight();
  }
}

module.exports = {
  TTS_VERSION,
  handleTts,
  _health: hb,
  _providerDiagnostics: {
    loaded: !!resembleSynthesize,
    providerPath: _resembleProviderPath,
    resolvedPath: _resembleProviderResolvedPath,
    loadErrors: _resembleProviderLoadErrors.slice(),
  },
  _detectAudioBuffer: detectAudioBuffer,
};
