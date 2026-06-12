'use strict';

/**
 * MarionVoiceInputEnvelope
 * Creates a strict voice-input contract before any spoken transcript reaches Marion.
 * No raw audio is stored here. Transcript-only envelope.
 */

const VERSION = 'marion.voiceInputEnvelope/2.0-admin-only-delivery';
const VOICE_SOURCE = 'voice';
const DEFAULT_LOCALE = 'en-CA';
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_CONFIDENCE) return MIN_CONFIDENCE;
  if (n > MAX_CONFIDENCE) return MAX_CONFIDENCE;
  return n;
}

function cleanTranscript(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPublicHint(value) {
  return String(value || '')
    .replace(/[^\w\s.@-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function detectIntentHint(transcript) {
  const text = String(transcript || '').toLowerCase();

  if (!text) return 'empty';
  if (/\b(stop|cancel|nevermind|never mind|abort)\b/.test(text)) return 'cancel';
  if (/\b(open|launch|start|run|execute|deploy|delete|remove|send|publish)\b/.test(text)) return 'command';
  if (/\b(status|where are we|update|report|summary|diagnose|autopsy)\b/.test(text)) return 'status';
  if (/\b(create|build|generate|write|draft|make)\b/.test(text)) return 'creation';
  if (/\bexplain|what is|why|how\b/.test(text)) return 'inquiry';

  return 'conversation';
}

function createVoiceInputEnvelope(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const transcript = cleanTranscript(payload.transcript);
  const confidence = clampConfidence(payload.confidence);
  const adminVoiceVerified = payload.adminVoiceVerified === true || payload.adminVoiceTokenVerified === true || payload.adminVoiceDeliveryAllowed === true;

  return {
    ok: transcript.length > 0,
    version: VERSION,
    source: VOICE_SOURCE,
    inputChannel: VOICE_SOURCE,
    transcript,
    confidence,
    locale: payload.locale || payload.language || DEFAULT_LOCALE,
    receivedAt: payload.receivedAt || new Date().toISOString(),
    userIntentHint: payload.userIntentHint || detectIntentHint(transcript),
    authorizationState: payload.authorizationState || 'unchecked',
    speakerHint: cleanPublicHint(payload.speakerHint || payload.speaker || ''),
    sessionId: payload.sessionId || null,
    requestId: payload.requestId || null,
    adminOnlyVoiceDelivery: payload.adminOnlyVoiceDelivery !== false,
    adminVoiceVerified,
    adminVoiceAuthSource: cleanPublicHint(payload.adminVoiceAuthSource || ''),
    adminVoiceDeliveryAllowed: adminVoiceVerified,
    rawMeta: {
      provider: payload.provider || 'browser-native',
      client: payload.client || null,
      userAgent: payload.userAgent || null,
      interim: Boolean(payload.interim),
      final: payload.final !== false,
      audioStored: false
    },
    warnings: transcript.length > 0 ? [] : ['EMPTY_TRANSCRIPT']
  };
}

function isVoiceInputEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.source === VOICE_SOURCE &&
    value.inputChannel === VOICE_SOURCE &&
    typeof value.transcript === 'string' &&
    typeof value.receivedAt === 'string'
  );
}

module.exports = {
  VERSION,
  VOICE_SOURCE,
  DEFAULT_LOCALE,
  createVoiceInputEnvelope,
  isVoiceInputEnvelope,
  detectIntentHint,
  cleanTranscript,
  clampConfidence
};
