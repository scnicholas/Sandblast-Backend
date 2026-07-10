'use strict';

/**
 * MarionVoiceInputEnvelope
 * Compatibility layer added during surgical autopsy package v1.
 * Purpose: make the voice gateway loadable and provide a stable, sanitized
 * transcript envelope before authorization, normalization, Marion routing, and output policy.
 *
 * Privacy rule: transcript only. Raw audio, blobs, buffers, voiceprints, tokens,
 * cookies, and authorization headers are never copied into the envelope.
 */

const VERSION = 'marion.voiceInputEnvelope/1.0-package-v1';

const SENSITIVE_KEY_RX = /token|secret|password|cookie|authorization|bearer|api[_-]?key|rawaudio|audio|blob|buffer|voiceprint|biometric/i;
const RAW_AUDIO_KEYS = new Set(['rawAudio', 'audio', 'audioBlob', 'blob', 'buffer', 'voiceprint', 'voicePrint', 'biometricTemplate', 'biometric', 'sample', 'samples']);

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 4000)) : 1000;
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeId(value, maxLength) {
  return safeText(value, maxLength || 120).replace(/[^a-zA-Z0-9._:@/-]+/g, '_').replace(/^_+|_+$/g, '');
}

function pickFirst() {
  for (let i = 0; i < arguments.length; i += 1) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function stripSensitiveObject(value, depth) {
  if (!value || typeof value !== 'object') return value;
  if (depth > 2) return '[clamped]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => stripSensitiveObject(item, depth + 1));
  const out = {};
  Object.keys(value).forEach((key) => {
    if (RAW_AUDIO_KEYS.has(key) || SENSITIVE_KEY_RX.test(key)) return;
    const v = value[key];
    if (typeof v === 'function') return;
    if (typeof v === 'object' && v !== null) out[key] = stripSensitiveObject(v, depth + 1);
    else out[key] = typeof v === 'string' ? safeText(v, 500) : v;
  });
  return out;
}

function inferIntent(transcript, explicitIntent) {
  const intent = safeText(explicitIntent, 60).toLowerCase();
  if (intent) return intent;
  const text = safeText(transcript, 1000).toLowerCase();
  if (/\b(delete|remove|publish|deploy|send|email|transfer|pay|shutdown|restart|execute|run\s+(script|command|test|deployment))\b/.test(text)) return 'command';
  if (/\b(status|health|are you online|can you hear me|test voice|voice test)\b/.test(text)) return 'status';
  return 'conversation';
}

function createVoiceInputEnvelope(input, options) {
  const src = input && typeof input === 'object' ? input : { transcript: input };
  const opts = options && typeof options === 'object' ? options : {};
  const transcript = safeText(pickFirst(src.transcript, src.text, src.message, src.query, src.userQuery, src.input), 4000);
  const originalTranscript = safeText(pickFirst(src.originalTranscript, src.rawTranscript, transcript), 4000);
  const now = new Date().toISOString();
  const rawMeta = stripSensitiveObject(src.rawMeta || src.meta || {}, 0) || {};

  return {
    version: VERSION,
    voiceInputEnvelope: true,
    inputChannel: 'voice',
    source: safeText(pickFirst(src.source, opts.source, 'voice'), 80),
    transcript,
    originalTranscript,
    transcriptLength: transcript.length,
    transcriptHashHint: transcript ? String(transcript.length) + ':' + String(transcript.charCodeAt(0) || 0) + ':' + String(transcript.charCodeAt(transcript.length - 1) || 0) : '',
    locale: safeText(pickFirst(src.locale, opts.locale, 'en-CA'), 20),
    confidence: Number.isFinite(Number(src.confidence)) ? Math.max(0, Math.min(1, Number(src.confidence))) : null,
    userIntentHint: inferIntent(transcript, src.userIntentHint || src.intent),
    requestId: safeId(pickFirst(src.requestId, opts.requestId), 120),
    turnId: safeId(pickFirst(src.turnId, opts.turnId), 120),
    sessionId: safeId(pickFirst(src.sessionId, src.sid, opts.sessionId), 160),
    speakerHint: safeText(pickFirst(src.speakerHint, src.claimedSpeaker, src.speaker, src.user), 160),
    claimedSpeaker: safeText(pickFirst(src.claimedSpeaker, src.speaker, src.user), 160),
    detectedSpeakerId: safeId(pickFirst(src.detectedSpeakerId, src.speakerId), 120),
    speakerConfidence: Number.isFinite(Number(src.speakerConfidence)) ? Math.max(0, Math.min(1, Number(src.speakerConfidence))) : null,
    voiceMatchStatus: safeText(src.voiceMatchStatus, 80),
    sessionRole: safeText(pickFirst(src.sessionRole, opts.sessionRole, opts.role), 80),
    directMarionAdminInterface: src.directMarionAdminInterface === true || opts.directMarionAdminInterface === true,
    marionAdminConversation: src.marionAdminConversation === true || opts.marionAdminConversation === true,
    adminInterfaceScope: safeText(pickFirst(src.adminInterfaceScope, opts.adminInterfaceScope), 100),
    deliveryChannel: safeText(pickFirst(src.deliveryChannel, opts.deliveryChannel), 100),
    publicAgent: safeText(pickFirst(src.publicAgent, opts.publicAgent, 'Nyx'), 40),
    authority: 'Marion',
    privateDelivery: src.privateDelivery === true || opts.privateDelivery === true,
    privateVoiceDelivery: src.privateVoiceDelivery === true || opts.privateVoiceDelivery === true,
    adminOnlyVoiceDelivery: src.adminOnlyVoiceDelivery !== false,
    adminVoiceVerified: src.adminVoiceVerified === true || opts.adminVoiceVerified === true,
    adminVoiceDeliveryAllowed: src.adminVoiceDeliveryAllowed === true || opts.adminVoiceDeliveryAllowed === true,
    remoteTrustedUserVerified: src.remoteTrustedUserVerified === true || opts.remoteTrustedUserVerified === true,
    remoteTrustedVoiceDeliveryAllowed: src.remoteTrustedVoiceDeliveryAllowed === true || opts.remoteTrustedVoiceDeliveryAllowed === true,
    rawMeta,
    createdAt: now,
    transcriptOnly: true,
    rawAudioStored: false,
    audioStored: false,
    noRawAudioStored: true
  };
}

module.exports = {
  VERSION,
  createVoiceInputEnvelope,
  safeText,
  inferIntent
};
