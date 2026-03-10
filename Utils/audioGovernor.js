/**
 * audioGovernor.js
 * Nyx audio execution governor
 *
 * Purpose:
 * - Harden TTS playback orchestration
 * - Eliminate overlap / replay / fallback loops
 * - Provide a single authoritative speech queue
 * - Respect knowledge-domain routing without re-trigger storms
 * - Support operational intelligence phases 1–20
 */

'use strict';

const DEFAULT_PHASE_FLAGS = Object.freeze({
  phase01_singleAuthorityQueue: true,
  phase02_inFlightLock: true,
  phase03_retryCap: true,
  phase04_timeoutGuard: true,
  phase05_loopResistance: true,
  phase06_dedupeByTrace: true,
  phase07_introGate: true,
  phase08_domainAwareSpeech: true,
  phase09_fallbackDiscipline: true,
  phase10_providerHealth: true,
  phase11_traceability: true,
  phase12_cancelReplaceRules: true,
  phase13_memorySafeDelivery: true,
  phase14_payloadHardening: true,
  phase15_operationalDiagnostics: true,
  phase16_prepareOnlyMode: true,
  phase17_skipNotFail: true,
  phase18_providerLock: true,
  phase19_routeMetadata: true,
  phase20_turnSuppression: true,
});

const DEFAULT_CONFIG = Object.freeze({
  maxQueueSize: 8,
  maxTextLength: 1800,
  maxRetries: 1,
  speakTimeoutMs: 15000,
  introCooldownMs: 20000,
  duplicateWindowMs: 12000,
  loopWindowMs: 18000,
  loopThreshold: 3,
  healthWindowSize: 20,
  allowFallbackByDefault: false,
  providerName: 'resemble',
  providerLockThreshold: 3,
  providerLockMs: 30000,
  replayCooldownMs: 4000,
});

function noopAsync() { return Promise.resolve(null); }
function nowMs() { return Date.now(); }
function safeNowISO() { try { return new Date().toISOString(); } catch { return ''; } }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim(); }
function hashLite(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function safeCall(fn, fallback) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (error) { return typeof fallback === 'function' ? fallback(error, ...args) : fallback; }
  };
}
class RingBuffer {
  constructor(size = 20) { this.size = clamp(size, 1, 500); this.items = []; }
  push(item) { this.items.push(item); if (this.items.length > this.size) this.items.shift(); }
  toArray() { return this.items.slice(); }
}
class LoopGuard {
  constructor({ threshold = 3, windowMs = 18000 } = {}) {
    this.threshold = clamp(threshold, 1, 10);
    this.windowMs = clamp(windowMs, 1000, 120000);
    this.events = new Map();
  }
  hit(key) {
    const t = nowMs();
    const arr = this.events.get(key) || [];
    const next = arr.filter(x => t - x < this.windowMs);
    next.push(t);
    this.events.set(key, next);
    return { count: next.length, blocked: next.length >= this.threshold };
  }
  reset(key) { this.events.delete(key); }
}
function buildTraceId(seed) { return `ag_${hashLite(seed || safeNowISO())}`; }
function withTimeout(promise, ms, code = 'audio_timeout') {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(code);
      err.code = code;
      reject(err);
    }, ms);
    Promise.resolve(promise).then(value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }).catch(error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function hasUsableAudioBuffer(value) {
  if (!value) return false;
  if (Buffer.isBuffer(value)) return value.length > 0;
  if (value instanceof Uint8Array) return value.byteLength > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return hasUsableAudioBuffer(value.buffer || value.audio || value.audioBuffer || value.audioBase64 || value.data);
  return false;
}
function normalizeAudioPayload(payload, mimeType) {
  if (!payload) return null;
  const resolvedMimeType = String((payload && payload.mimeType) || (payload && payload.contentType) || mimeType || 'audio/mpeg');
  const base = (payload && typeof payload === 'object' && !Buffer.isBuffer(payload) && !(payload instanceof Uint8Array)) ? { ...payload } : { audio: payload };
  const candidate = base.buffer || base.audio || base.audioBuffer || base.audioBase64 || base.data || null;
  if (!hasUsableAudioBuffer(candidate)) return null;
  if (!base.buffer && candidate) base.buffer = candidate;
  if (!base.audio && candidate) base.audio = candidate;
  base.mimeType = resolvedMimeType;
  return base;
}
function buildJobFromDirective(directive = {}, context = {}) {
  const payload = directive && typeof directive === 'object' ? directive : {};
  const ctx = context && typeof context === 'object' ? context : {};
  const text = normalizeText(payload.text || payload.say || payload.speak || payload.message || ctx.reply || '');
  return normalizeJob({
    id: payload.id || payload.jobId || ctx.id,
    traceId: payload.traceId || ctx.traceId,
    sessionId: payload.sessionId || ctx.sessionId,
    userId: payload.userId || ctx.userId,
    turnId: payload.turnId || ctx.turnId,
    text,
    domain: payload.domain || ctx.domain || payload.routeName || 'general',
    intent: payload.intent || ctx.intent || 'general',
    priority: payload.priority === 'high' || payload.cancelReplace ? 'high' : 'normal',
    isIntro: !!(payload.isIntro || payload.intro),
    allowFallback: payload.allowFallback === true || ctx.allowFallback === true,
    voice: payload.voice || ctx.voice || '',
    meta: {
      ...((ctx.meta && typeof ctx.meta === 'object') ? ctx.meta : {}),
      ...((payload.meta && typeof payload.meta === 'object') ? payload.meta : {}),
      routeName: String(payload.routeName || (payload.meta && payload.meta.routeName) || (ctx.meta && ctx.meta.routeName) || ''),
      source: String(payload.source || 'chatEngine'),
    },
  }, DEFAULT_CONFIG);
}
function normalizeJob(raw = {}, config = DEFAULT_CONFIG) {
  const text = normalizeText(raw.text).slice(0, config.maxTextLength);
  return {
    id: String(raw.id || `job_${hashLite([raw.traceId, raw.turnId, text].join('|'))}`),
    traceId: String(raw.traceId || buildTraceId(text)),
    sessionId: String(raw.sessionId || 'session_unknown'),
    userId: String(raw.userId || 'user_unknown'),
    turnId: String(raw.turnId || `turn_${nowMs()}`),
    text,
    domain: String(raw.domain || 'general'),
    intent: String(raw.intent || 'general'),
    priority: raw.priority === 'high' ? 'high' : 'normal',
    isIntro: !!raw.isIntro,
    allowFallback: raw.allowFallback === true,
    voice: String(raw.voice || ''),
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
    createdAt: nowMs(),
    retries: Number(raw.retries || 0) || 0,
  };
}
function makeSignature(job) {
  return hashLite([job.sessionId, job.domain, job.intent, job.text.toLowerCase()].join('|'));
}
function makeReplayKey(job) {
  return hashLite([
    job.sessionId || '',
    job.turnId || '',
    job.domain || '',
    job.intent || '',
    (job.text || '').toLowerCase()
  ].join('|'));
}
function domainSpeechMode(domain) {
  if (domain === 'psychology') return 'gentle';
  if (domain === 'law') return 'careful';
  if (domain === 'finance') return 'precise';
  if (domain === 'language') return 'clean';
  if (domain === 'ai_cyber') return 'technical';
  if (domain === 'marketing_media') return 'energetic';
  return 'balanced';
}
function createAudioGovernor(config = {}) {
  const phaseFlags = { ...DEFAULT_PHASE_FLAGS, ...(config.phaseFlags || {}) };
  const settings = { ...DEFAULT_CONFIG, ...(config.settings || {}) };
  const logger = config.logger || console;
  const telemetry = { track: safeCall((config.telemetry && config.telemetry.track) || noopAsync, () => null) };
  const ttsProvider = {
    synthesize: safeCall((config.ttsProvider && config.ttsProvider.synthesize) || noopAsync, async () => {
      const err = new Error('tts_provider_unavailable'); err.code = 'tts_provider_unavailable'; throw err;
    }),
    synthesizeFallback: safeCall((config.ttsProvider && config.ttsProvider.synthesizeFallback) || noopAsync, null),
  };
  const audioOutput = {
    play: safeCall((config.audioOutput && config.audioOutput.play) || noopAsync, async () => {
      const err = new Error('audio_output_unavailable'); err.code = 'audio_output_unavailable'; throw err;
    }),
    stop: safeCall((config.audioOutput && config.audioOutput.stop) || noopAsync, () => true),
  };

  const queue = [];
  const health = new RingBuffer(settings.healthWindowSize);
  const providerFailures = new RingBuffer(settings.providerLockThreshold);
  let providerLockedUntil = 0;
  const loopGuard = new LoopGuard({ threshold: settings.loopThreshold, windowMs: settings.loopWindowMs });
  let inFlight = null;
  let processing = false;
  let lastIntroAt = 0;
  const recentBySignature = new Map();
  const turnSuppression = new Map();
  const replayCooldown = new Map();

  function trimQueue() { while (queue.length > settings.maxQueueSize) queue.pop(); }
  function clearExpiredMaps() {
    const t = nowMs();
    for (const [key, value] of recentBySignature.entries()) {
      if (!value || !value.at || (t - value.at) > settings.duplicateWindowMs) recentBySignature.delete(key);
    }
    for (const [key, value] of turnSuppression.entries()) {
      if (!value || !value.at || (t - value.at) > settings.duplicateWindowMs) turnSuppression.delete(key);
    }
    for (const [key, value] of replayCooldown.entries()) {
      if (!value || !value.at || (t - value.at) > settings.replayCooldownMs) replayCooldown.delete(key);
    }
  }
  function isDuplicate(job) {
    clearExpiredMaps();
    const sig = makeSignature(job);
    const hit = recentBySignature.get(sig);
    return !!hit && (nowMs() - hit.at) < settings.duplicateWindowMs;
  }
  function markDuplicate(job) {
    recentBySignature.set(makeSignature(job), { at: nowMs(), traceId: job.traceId });
  }
  function isSuppressed(job) {
    clearExpiredMaps();
    const key = `${job.sessionId}|${job.turnId}`;
    const hit = turnSuppression.get(key);
    return !!hit && hit.sig === makeSignature(job);
  }
  function markSuppressed(job) {
    turnSuppression.set(`${job.sessionId}|${job.turnId}`, { at: nowMs(), sig: makeSignature(job) });
  }
  function isReplayCooling(job) {
    clearExpiredMaps();
    const key = makeReplayKey(job);
    const hit = replayCooldown.get(key);
    return !!hit && (nowMs() - hit.at) < settings.replayCooldownMs;
  }
  function markReplayCooling(job) {
    replayCooldown.set(makeReplayKey(job), { at: nowMs(), traceId: job.traceId });
  }
  function hasQueuedMatch(job) {
    const key = makeReplayKey(job);
    return queue.some(item => item && makeReplayKey(item) === key);
  }
  function isSameAsInFlight(job) {
    return !!(inFlight && makeReplayKey(inFlight) === makeReplayKey(job));
  }
  function canPlayIntro(job) { return !job.isIntro || (nowMs() - lastIntroAt) >= settings.introCooldownMs; }
  function isProviderLocked() { return nowMs() < providerLockedUntil; }
  function noteProviderFailure(code) {
    providerFailures.push({ at: nowMs(), code: String(code || 'tts_error') });
    const recent = providerFailures.toArray().filter(x => x && (nowMs() - x.at) < settings.providerLockMs);
    if (recent.length >= settings.providerLockThreshold) providerLockedUntil = nowMs() + settings.providerLockMs;
  }
  function noteProviderSuccess() { providerLockedUntil = 0; }
  async function track(event, payload = {}) { await telemetry.track({ event, now: safeNowISO(), ...payload }); }

  async function synthesize(job, useFallback = false) {
    const request = {
      text: job.text,
      traceId: job.traceId,
      sessionId: job.sessionId,
      userId: job.userId,
      turnId: job.turnId,
      voice: job.voice,
      mode: domainSpeechMode(job.domain),
      domain: job.domain,
      intent: job.intent,
      provider: settings.providerName,
      meta: { ...job.meta, fallback: useFallback, provider: settings.providerName },
    };
    return useFallback ? ttsProvider.synthesizeFallback(request) : ttsProvider.synthesize(request);
  }

  async function prepare(rawJob = {}) {
    const job = normalizeJob(rawJob, settings);
    if (!job.text) return { ok: false, skipped: true, reason: 'empty_text', job };
    if (phaseFlags.phase07_introGate && !canPlayIntro(job)) return { ok: true, skipped: true, reason: 'intro_cooldown_active', job };
    if (phaseFlags.phase06_dedupeByTrace && isDuplicate(job)) return { ok: true, skipped: true, reason: 'duplicate_speech_blocked', job };
    if (phaseFlags.phase20_turnSuppression && isSuppressed(job)) return { ok: true, skipped: true, reason: 'turn_suppressed', job };
    if (phaseFlags.phase05_loopResistance && isReplayCooling(job)) return { ok: true, skipped: true, reason: 'replay_cooldown_active', job };

    const loopKey = hashLite([job.sessionId, job.domain, job.text.toLowerCase()].join('|'));
    const loop = phaseFlags.phase05_loopResistance ? loopGuard.hit(loopKey) : { count: 1, blocked: false };
    if (loop.blocked) return { ok: true, skipped: true, reason: 'loop_guard_blocked', loopCount: loop.count, job };

    if (phaseFlags.phase18_providerLock && isProviderLocked()) {
      const err = new Error('provider_locked'); err.code = 'provider_locked'; throw err;
    }

    let usedFallback = false;
    let payload = null;
    try {
      payload = await withTimeout(synthesize(job, false), settings.speakTimeoutMs, 'tts_synthesize_timeout');
    } catch (error) {
      if (phaseFlags.phase09_fallbackDiscipline && !(job.allowFallback || settings.allowFallbackByDefault)) throw error;
      usedFallback = true;
      payload = await withTimeout(synthesize(job, true), settings.speakTimeoutMs, 'tts_fallback_timeout');
    }

    if (phaseFlags.phase14_payloadHardening && !payload) {
      const err = new Error('empty_audio_payload'); err.code = 'empty_audio_payload'; throw err;
    }

    const mimeType = String((payload && payload.mimeType) || (payload && payload.contentType) || 'audio/mpeg');
    const normalizedPayload = normalizeAudioPayload(payload, mimeType);
    if (phaseFlags.phase14_payloadHardening && !normalizedPayload) {
      const err = new Error('invalid_audio_payload'); err.code = 'invalid_audio_payload'; throw err;
    }

    const buffer = normalizedPayload && (normalizedPayload.buffer || normalizedPayload.audio || normalizedPayload.audioBuffer || null);
    return {
      ok: true,
      skipped: false,
      usedFallback,
      loopCount: loop.count,
      traceId: job.traceId,
      provider: settings.providerName,
      mimeType,
      buffer,
      audioPayload: normalizedPayload,
      job,
      meta: {
        domain: job.domain,
        intent: job.intent,
        provider: settings.providerName,
        routeName: String(job.meta && job.meta.routeName || ''),
      },
    };
  }

  async function playPrepared(prepared) {
    if (!prepared || prepared.skipped) return prepared;
    const { job, audioPayload } = prepared;
    await withTimeout(audioOutput.play({
      audio: audioPayload,
      traceId: job.traceId,
      sessionId: job.sessionId,
      turnId: job.turnId,
      domain: job.domain,
      intent: job.intent,
      isIntro: job.isIntro,
    }), settings.speakTimeoutMs, 'audio_play_timeout');

    if (job.isIntro) lastIntroAt = nowMs();
    markDuplicate(job);
    markSuppressed(job);
    markReplayCooling(job);

    return prepared;
  }

  async function runJob(job) {
    const prepared = await prepare(job);
    if (prepared.skipped) return prepared;
    return playPrepared(prepared);
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length) {
      const job = queue.shift();
      inFlight = job;
      try {
        const result = await runJob(job);
        noteProviderSuccess();
        health.push({
          ok: !!result.ok,
          traceId: job.traceId,
          reason: result.reason || '',
          usedFallback: !!result.usedFallback,
          at: nowMs()
        });
        await track('audio_governor_job_result', {
          traceId: job.traceId,
          sessionId: job.sessionId,
          userId: job.userId,
          turnId: job.turnId,
          domain: job.domain,
          intent: job.intent,
          ok: !!result.ok,
          skipped: !!result.skipped,
          reason: result.reason || '',
          usedFallback: !!result.usedFallback,
          loopCount: Number(result.loopCount || 0) || 0,
        });
      } catch (error) {
        noteProviderFailure((error && error.code) || (error && error.message) || 'audio_error');
        const canRetry =
          phaseFlags.phase03_retryCap &&
          job.retries < settings.maxRetries &&
          (!phaseFlags.phase18_providerLock || !isProviderLocked());

        health.push({
          ok: false,
          traceId: job.traceId,
          reason: String((error && error.code) || (error && error.message) || 'audio_error'),
          usedFallback: false,
          at: nowMs()
        });

        await track('audio_governor_job_error', {
          traceId: job.traceId,
          sessionId: job.sessionId,
          userId: job.userId,
          turnId: job.turnId,
          domain: job.domain,
          intent: job.intent,
          error: String((error && error.code) || (error && error.message) || 'audio_error'),
          retries: job.retries,
          canRetry,
        });

        try {
          if (logger && typeof logger.warn === 'function') {
            logger.warn('[audioGovernor.jobError]', {
              traceId: job.traceId,
              error: String((error && error.code) || (error && error.message) || 'audio_error'),
              retries: job.retries,
              canRetry
            });
          }
        } catch {}

        if (canRetry) {
          job.retries += 1;
          queue.unshift(job);
        }
      } finally {
        inFlight = null;
      }
    }
    processing = false;
  }

  async function enqueue(rawJob = {}) {
    const job = normalizeJob(rawJob, settings);
    if (!job.text) return { ok: false, queued: false, reason: 'empty_text' };

    clearExpiredMaps();

    if (phaseFlags.phase06_dedupeByTrace && isDuplicate(job)) {
      await track('audio_governor_enqueue_blocked', {
        traceId: job.traceId,
        sessionId: job.sessionId,
        userId: job.userId,
        turnId: job.turnId,
        domain: job.domain,
        intent: job.intent,
        reason: 'duplicate_speech_blocked'
      });
      return { ok: true, queued: false, reason: 'duplicate_speech_blocked', traceId: job.traceId, queueDepth: queue.length };
    }

    if (phaseFlags.phase20_turnSuppression && isSuppressed(job)) {
      await track('audio_governor_enqueue_blocked', {
        traceId: job.traceId,
        sessionId: job.sessionId,
        userId: job.userId,
        turnId: job.turnId,
        domain: job.domain,
        intent: job.intent,
        reason: 'turn_suppressed'
      });
      return { ok: true, queued: false, reason: 'turn_suppressed', traceId: job.traceId, queueDepth: queue.length };
    }

    if (phaseFlags.phase05_loopResistance && isReplayCooling(job)) {
      await track('audio_governor_enqueue_blocked', {
        traceId: job.traceId,
        sessionId: job.sessionId,
        userId: job.userId,
        turnId: job.turnId,
        domain: job.domain,
        intent: job.intent,
        reason: 'replay_cooldown_active'
      });
      return { ok: true, queued: false, reason: 'replay_cooldown_active', traceId: job.traceId, queueDepth: queue.length };
    }

    if (phaseFlags.phase05_loopResistance && isSameAsInFlight(job)) {
      await track('audio_governor_enqueue_blocked', {
        traceId: job.traceId,
        sessionId: job.sessionId,
        userId: job.userId,
        turnId: job.turnId,
        domain: job.domain,
        intent: job.intent,
        reason: 'duplicate_inflight_blocked'
      });
      return { ok: true, queued: false, reason: 'duplicate_inflight_blocked', traceId: job.traceId, queueDepth: queue.length };
    }

    if (phaseFlags.phase05_loopResistance && hasQueuedMatch(job)) {
      await track('audio_governor_enqueue_blocked', {
        traceId: job.traceId,
        sessionId: job.sessionId,
        userId: job.userId,
        turnId: job.turnId,
        domain: job.domain,
        intent: job.intent,
        reason: 'duplicate_queue_blocked'
      });
      return { ok: true, queued: false, reason: 'duplicate_queue_blocked', traceId: job.traceId, queueDepth: queue.length };
    }

    if (phaseFlags.phase12_cancelReplaceRules && job.priority === 'high') {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i] && queue[i].sessionId === job.sessionId) queue.splice(i, 1);
      }
    }

    if (phaseFlags.phase02_inFlightLock && inFlight && inFlight.sessionId === job.sessionId && job.priority === 'high') {
      await audioOutput.stop({
        traceId: inFlight.traceId,
        sessionId: inFlight.sessionId,
        turnId: inFlight.turnId
      });
    }

    if (job.priority === 'high') queue.unshift(job);
    else queue.push(job);

    trimQueue();

    await track('audio_governor_enqueue', {
      traceId: job.traceId,
      sessionId: job.sessionId,
      userId: job.userId,
      turnId: job.turnId,
      domain: job.domain,
      intent: job.intent,
      priority: job.priority,
      isIntro: job.isIntro,
      queueDepth: queue.length,
    });

    processQueue().catch(() => null);
    return { ok: true, queued: true, traceId: job.traceId, queueDepth: queue.length };
  }

  async function stopAll(reason = 'manual_stop') {
    queue.length = 0;
    if (inFlight) {
      await audioOutput.stop({
        traceId: inFlight.traceId,
        sessionId: inFlight.sessionId,
        turnId: inFlight.turnId,
        reason
      });
    }
    await track('audio_governor_stop_all', { reason });
    return { ok: true };
  }

  function getHealth() {
    const events = health.toArray();
    const total = events.length || 1;
    const okCount = events.filter(x => x.ok).length;
    const fallbackCount = events.filter(x => x.usedFallback).length;
    return {
      ok: true,
      governor: 'audioGovernor.js',
      version: '1.1.1-opintel-loopguard',
      phases: phaseFlags,
      inFlight: inFlight ? {
        traceId: inFlight.traceId,
        sessionId: inFlight.sessionId,
        turnId: inFlight.turnId,
        domain: inFlight.domain,
        intent: inFlight.intent
      } : null,
      queueDepth: queue.length,
      providerHealth: {
        sampleSize: events.length,
        successRate: Number((okCount / total).toFixed(3)),
        fallbackRate: Number((fallbackCount / total).toFixed(3)),
        failRate: Number((1 - (okCount / total)).toFixed(3)),
        locked: isProviderLocked(),
        lockedUntil: providerLockedUntil || 0,
      },
      now: safeNowISO(),
    };
  }

  async function healthcheck() { return getHealth(); }

  return {
    enqueue,
    prepare,
    playPrepared,
    stopAll,
    getHealth,
    healthcheck,
    buildJobFromDirective
  };
}

module.exports = {
  createAudioGovernor,
  DEFAULT_PHASE_FLAGS,
  DEFAULT_CONFIG,
  buildJobFromDirective
};
