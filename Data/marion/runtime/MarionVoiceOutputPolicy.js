'use strict';

/**
 * MarionVoiceOutputPolicy
 * Projects only a verified Marion final to speech. Delivery permission is
 * capability-specific and comes from the authorization result.
 */

const VERSION = 'marion.voiceOutputPolicy/1.2-exact-final-reply-parity';

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
  const keys = ['authoritativeReply', 'reply', 'finalReply', 'text', 'displayReply', 'visibleReply', 'directReply'];
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
  if (ownValue(src, 'blocked') === true || ownValue(src, 'awaitingMarion') === true || ownValue(src, 'degraded') === true || ownValue(src, 'requiresRetry') === true || ownValue(src, 'canEmit') === false) return false;
  if (!finalEnvelope || typeof finalEnvelope !== 'object' || Array.isArray(finalEnvelope) ||
      ownValue(finalEnvelope, 'final') !== true || ownValue(finalEnvelope, 'marionFinal') !== true ||
      ownValue(finalEnvelope, 'canEmit') === false || ownValue(finalEnvelope, 'blocked') === true ||
      ownValue(finalEnvelope, 'awaitingMarion') === true) return false;
  // Speech is irreversible: do not select one of several contradictory replies.
  const fields = ['authoritativeReply', 'reply', 'finalReply', 'text', 'displayReply', 'visibleReply', 'directReply'];
  let canonical = null;
  for (const part of [src, finalEnvelope]) {
    for (const key of fields) {
      const value = ownValue(part, key);
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || !value.trim() || value.length > 50000) return false;
      const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
      if (canonical === null) canonical = normalized;
      else if (canonical !== normalized) return false;
    }
  }
  return canonical !== null;
}

function applyVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const src = response && typeof response === 'object' && !Array.isArray(response) ? response : { reply: response };
  const rawReply = firstReplyText(src);
  const certifiedFinal = hasFinalTuple(src);
  const cleanReply = certifiedFinal
    ? stripRuntimeLeakage(rawReply)
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
