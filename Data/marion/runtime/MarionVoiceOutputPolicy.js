'use strict';

/**
 * MarionVoiceOutputPolicy
 * Projects only a verified Marion final to speech. Delivery permission is
 * capability-specific and comes from the authorization result.
 */

const VERSION = 'marion.voiceOutputPolicy/1.1-final-and-capability-gate';

function ownValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  } catch (_) {
    return undefined;
  }
}

function safeText(value, maxLength) {
  const maxNum = Number(maxLength);
  const max = Number.isFinite(maxNum) ? Math.max(1, Math.min(maxNum, 5000)) : 1000;
  if (value == null || (typeof value !== 'string' && typeof value !== 'number')) return '';
  let text;
  try { text = String(value); } catch (_) { return ''; }
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function firstReplyText(response) {
  if (!response) return '';
  if (typeof response === 'string') return safeText(response, 1600);
  if (typeof response !== 'object' || Array.isArray(response)) return '';
  const keys = ['displayReply', 'publicReply', 'visibleReply', 'reply', 'text', 'message', 'answer', 'output', 'response', 'spokenText', 'finalReply'];
  for (const key of keys) {
    const candidate = safeText(ownValue(response, key), 1600);
    if (candidate) return candidate;
  }
  return '';
}

function stripRuntimeLeakage(text) {
  return safeText(text, 1600)
    .replace(/\b(routeKind|speechHints|presenceProfile|nyxStateHint|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority)\s*[=:][^.!?]*(?:[.!?]|$)/ig, '')
    .replace(/\b(textSpeak|textToSynth|autoPlay|provider|compatibilityRoute|healthEndpoint)\s*[=:][^.!?]*(?:[.!?]|$)/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFinalTuple(src) {
  const finalEnvelope = ownValue(src, 'finalEnvelope');
  if (!src || ownValue(src, 'ok') !== true || ownValue(src, 'final') !== true || ownValue(src, 'marionFinal') !== true) return false;
  if (ownValue(src, 'blocked') === true || ownValue(src, 'awaitingMarion') === true || ownValue(src, 'degraded') === true || ownValue(src, 'requiresRetry') === true) return false;
  return !!(finalEnvelope && typeof finalEnvelope === 'object' && ownValue(finalEnvelope, 'final') === true && ownValue(finalEnvelope, 'marionFinal') === true && ownValue(finalEnvelope, 'canEmit') !== false);
}

function applyVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const src = response && typeof response === 'object' && !Array.isArray(response) ? response : { reply: response };
  const rawReply = firstReplyText(src);
  const certifiedFinal = hasFinalTuple(src);
  const cleanReply = certifiedFinal
    ? (stripRuntimeLeakage(rawReply) || 'I heard you, but I need a clean Marion final reply before I can speak this turn.')
    : '';

  const adminAllowed = opts.adminVoiceDeliveryAllowed === true && opts.adminVoiceVerified === true;
  const remoteAllowed = opts.remoteTrustedVoiceDeliveryAllowed === true && opts.remoteTrustedUserVerified === true;
  const trustedVoiceDeliveryAllowed = adminAllowed || remoteAllowed;
  const forceSilent = opts.forceSilent === true || opts.silent === true;
  const speakAllowed = certifiedFinal && trustedVoiceDeliveryAllowed && !forceSilent && !!cleanReply;
  const spokenText = speakAllowed ? safeText(cleanReply, opts.brief === true ? 420 : 900) : '';
  const output = Object.assign({}, src, {
    ok: certifiedFinal,
    reply: cleanReply || 'I heard you, but protected voice delivery needs a verified Marion final.',
    publicReply: cleanReply || 'I heard you, but protected voice delivery needs a verified Marion final.',
    visibleReply: cleanReply || 'I heard you, but protected voice delivery needs a verified Marion final.',
    displayReply: cleanReply || 'I heard you, but protected voice delivery needs a verified Marion final.',
    text: cleanReply || 'I heard you, but protected voice delivery needs a verified Marion final.',
    spokenText,
    publicAgent: adminAllowed && opts.directMarionAdminInterface === true ? 'Marion' : 'Nyx',
    authority: 'Marion',
    final: certifiedFinal,
    marionFinal: certifiedFinal,
    canEmit: certifiedFinal && speakAllowed,
    voice: {
      version: VERSION,
      speakAllowed,
      voiceMode: speakAllowed ? (opts.brief === true ? 'brief' : 'full') : 'silent',
      spokenText,
      textToSynth: spokenText,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: opts.adminVoiceVerified === true,
      adminVoiceDeliveryAllowed: adminAllowed,
      remoteTrustedUserVerified: opts.remoteTrustedUserVerified === true,
      remoteTrustedVoiceDeliveryAllowed: remoteAllowed,
      trustedVoiceDeliveryAllowed,
      privateVoiceDelivery: adminAllowed || remoteAllowed,
      transcriptOnly: true,
      noRawAudioStored: true,
      audioStored: false,
      finalEnvelopeOnly: true,
      finalEnvelopeVerified: certifiedFinal,
      rawPatternExposure: 'blocked'
    }
  });
  return output;
}

module.exports = { VERSION, applyVoiceOutputPolicy, firstReplyText, stripRuntimeLeakage, hasFinalTuple };
