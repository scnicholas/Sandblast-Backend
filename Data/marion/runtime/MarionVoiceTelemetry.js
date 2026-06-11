'use strict';

/**
 * MarionVoiceTelemetry
 * Lightweight telemetry for the Marion voice lane.
 * Does not store raw audio.
 */

function safeLength(value) {
  return String(value || '').length;
}

function createVoiceTelemetryEvent(type, envelope, detail) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const meta = env.rawMeta && typeof env.rawMeta === 'object' ? env.rawMeta : {};

  return {
    type: type || 'voice.event',
    at: new Date().toISOString(),
    inputChannel: 'voice',
    source: 'voice',
    authority: 'Marion',
    publicAgent: 'Nyx',
    sessionId: env.sessionId || null,
    requestId: env.requestId || null,
    locale: env.locale || null,
    confidence: typeof env.confidence === 'number' ? env.confidence : null,
    authorizationState: env.authorizationState || 'unknown',
    userIntentHint: env.userIntentHint || null,
    transcriptLength: safeLength(env.transcript),
    originalTranscriptLength: safeLength(env.originalTranscript || env.transcript),
    provider: meta.provider || 'browser-native',
    audioStored: false,
    detail: sanitizeTelemetryDetail(detail)
  };
}

function sanitizeTelemetryDetail(detail) {
  if (!detail || typeof detail !== 'object') return detail || null;

  const blockedKeys = new Set([
    'rawAudio',
    'audio',
    'blob',
    'buffer',
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key'
  ]);

  const out = {};

  Object.keys(detail).forEach((key) => {
    if (blockedKeys.has(key)) return;

    const value = detail[key];

    if (typeof value === 'string' && value.length > 300) {
      out[key] = `${value.slice(0, 300)}...`;
      return;
    }

    if (value && typeof value === 'object') {
      out[key] = '[object]';
      return;
    }

    out[key] = value;
  });

  return out;
}

function createVoiceTelemetrySummary(events) {
  const list = Array.isArray(events) ? events : [];

  return {
    count: list.length,
    inputChannel: 'voice',
    authority: 'Marion',
    publicAgent: 'Nyx',
    audioStored: false,
    lastEvent: list.length ? list[list.length - 1].type : null,
    blocked: list.some((event) => event.type === 'voice.blocked'),
    failed: list.some((event) => String(event.type || '').includes('failed'))
  };
}

module.exports = {
  createVoiceTelemetryEvent,
  createVoiceTelemetrySummary,
  sanitizeTelemetryDetail
};
