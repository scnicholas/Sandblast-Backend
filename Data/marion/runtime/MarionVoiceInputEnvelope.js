'use strict';

/**
 * MarionVoiceInputEnvelope
 * Projects voice input into a bounded transcript-only envelope.
 * Client metadata is allowlisted; credentials, audio and arbitrary objects do
 * not cross this boundary.
 */

const VERSION = 'marion.voiceInputEnvelope/1.1-bounded-metadata';
const SENSITIVE_KEY_RX = /token|secret|password|cookie|authorization|bearer|api[_-]?key|rawaudio|audio|blob|buffer|voiceprint|biometric/i;
const META_KEYS = new Set(['provider', 'client', 'codec', 'contentType', 'language', 'source']);

function ownValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  } catch (_) {
    return undefined;
  }
}

function safeScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function safeText(value, maxLength) {
  const maxNum = Number(maxLength);
  const max = Number.isFinite(maxNum) ? Math.max(1, Math.min(maxNum, 4000)) : 1000;
  if (value == null || !safeScalar(value)) return '';
  let text;
  try { text = String(value); } catch (_) { return ''; }
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeId(value, maxLength) {
  const text = safeText(value, maxLength || 120);
  if (!text || SENSITIVE_KEY_RX.test(text)) return '';
  return text.replace(/[^a-zA-Z0-9._:@/-]+/g, '_').replace(/^_+|_+$/g, '');
}

function pickFirst() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (safeScalar(value) && String(value).trim() !== '') return value;
  }
  return '';
}

function finiteUnit(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function sanitizeMetadata(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = Object.create(null);
  let count = 0;
  for (const key of META_KEYS) {
    if (count >= META_KEYS.size) break;
    const item = ownValue(source, key);
    if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') continue;
    if (SENSITIVE_KEY_RX.test(key)) continue;
    const text = safeText(item, 80);
    if (!text || SENSITIVE_KEY_RX.test(text)) continue;
    out[key] = text;
    count += 1;
  }
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
  const transcript = safeText(pickFirst(
    ownValue(src, 'transcript'), ownValue(src, 'text'), ownValue(src, 'message'),
    ownValue(src, 'query'), ownValue(src, 'userQuery'), ownValue(src, 'input')
  ), 4000);
  const originalTranscript = safeText(pickFirst(
    ownValue(src, 'originalTranscript'), ownValue(src, 'rawTranscript'), transcript
  ), 4000);
  const rawMeta = sanitizeMetadata(ownValue(src, 'rawMeta') || ownValue(src, 'meta'));
  const confidence = finiteUnit(ownValue(src, 'confidence'));
  const speakerConfidence = finiteUnit(ownValue(src, 'speakerConfidence'));

  return {
    version: VERSION,
    voiceInputEnvelope: true,
    inputChannel: 'voice',
    source: safeText(pickFirst(ownValue(src, 'source'), ownValue(opts, 'source'), 'voice'), 80),
    transcript,
    originalTranscript,
    transcriptLength: transcript.length,
    transcriptHashHint: transcript ? `${transcript.length}:${transcript.charCodeAt(0) || 0}:${transcript.charCodeAt(transcript.length - 1) || 0}` : '',
    locale: safeText(pickFirst(ownValue(src, 'locale'), ownValue(opts, 'locale'), 'en-CA'), 20),
    confidence,
    userIntentHint: inferIntent(transcript, pickFirst(ownValue(src, 'userIntentHint'), ownValue(src, 'intent'))),
    requestId: safeId(pickFirst(ownValue(src, 'requestId'), ownValue(opts, 'requestId')), 120),
    turnId: safeId(pickFirst(ownValue(src, 'turnId'), ownValue(opts, 'turnId')), 120),
    sessionId: safeId(pickFirst(ownValue(src, 'sessionId'), ownValue(src, 'sid'), ownValue(opts, 'sessionId')), 160),
    speakerHint: safeText(pickFirst(ownValue(src, 'speakerHint'), ownValue(src, 'claimedSpeaker'), ownValue(src, 'speaker'), ownValue(src, 'user')), 160),
    claimedSpeaker: safeText(pickFirst(ownValue(src, 'claimedSpeaker'), ownValue(src, 'speaker'), ownValue(src, 'user')), 160),
    detectedSpeakerId: safeId(pickFirst(ownValue(src, 'detectedSpeakerId'), ownValue(src, 'speakerId')), 120),
    speakerConfidence,
    voiceMatchStatus: safeText(ownValue(src, 'voiceMatchStatus'), 80),
    sessionRole: safeText(pickFirst(ownValue(src, 'sessionRole'), ownValue(opts, 'sessionRole'), ownValue(opts, 'role')), 80),
    directMarionAdminInterface: ownValue(src, 'directMarionAdminInterface') === true || ownValue(opts, 'directMarionAdminInterface') === true,
    marionAdminConversation: ownValue(src, 'marionAdminConversation') === true || ownValue(opts, 'marionAdminConversation') === true,
    adminInterfaceScope: safeText(pickFirst(ownValue(src, 'adminInterfaceScope'), ownValue(opts, 'adminInterfaceScope')), 100),
    deliveryChannel: safeText(pickFirst(ownValue(src, 'deliveryChannel'), ownValue(opts, 'deliveryChannel')), 100),
    publicAgent: safeText(pickFirst(ownValue(src, 'publicAgent'), ownValue(opts, 'publicAgent'), 'Nyx'), 40),
    authority: 'Marion',
    privateDelivery: ownValue(src, 'privateDelivery') === true || ownValue(opts, 'privateDelivery') === true,
    privateVoiceDelivery: ownValue(src, 'privateVoiceDelivery') === true || ownValue(opts, 'privateVoiceDelivery') === true,
    adminOnlyVoiceDelivery: true,
    adminVoiceVerified: ownValue(src, 'adminVoiceVerified') === true || ownValue(opts, 'adminVoiceVerified') === true,
    adminVoiceDeliveryAllowed: ownValue(src, 'adminVoiceDeliveryAllowed') === true || ownValue(opts, 'adminVoiceDeliveryAllowed') === true,
    remoteTrustedUserVerified: ownValue(src, 'remoteTrustedUserVerified') === true || ownValue(opts, 'remoteTrustedUserVerified') === true,
    remoteTrustedVoiceDeliveryAllowed: ownValue(src, 'remoteTrustedVoiceDeliveryAllowed') === true || ownValue(opts, 'remoteTrustedVoiceDeliveryAllowed') === true,
    rawMeta,
    createdAt: new Date().toISOString(),
    transcriptOnly: true,
    rawAudioStored: false,
    audioStored: false,
    noRawAudioStored: true
  };
}

module.exports = { VERSION, createVoiceInputEnvelope, safeText, inferIntent, sanitizeMetadata };
